import {
  App,
  FileSystemAdapter,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  normalizePath,
  requestUrl,
} from "obsidian";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

type StartMode = "dev" | "prod";

interface BridgeSettings {
  dashboardPath: string;
  startMode: StartMode;
  openBrowserOnStart: boolean;
  autoSyncConfig: boolean;
  screenTimeHeading: string;
}

const DEFAULT_SETTINGS: BridgeSettings = {
  dashboardPath: "/Users/peng/Documents/GitHub/PengCode/iPhoneScreenTimeDashboard",
  startMode: "dev",
  openBrowserOnStart: true,
  autoSyncConfig: true,
  screenTimeHeading: "ScreenTime",
};

const FRONTEND_URL_DEV = "http://127.0.0.1:5173";
const BACKEND_URL = "http://127.0.0.1:8000";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatByMomentLike(date: Date, format: string): string {
  const replacements: [string, string][] = [
    ["YYYY", String(date.getFullYear()).padStart(4, "0")],
    ["YY", String(date.getFullYear() % 100).padStart(2, "0")],
    ["MM", String(date.getMonth() + 1).padStart(2, "0")],
    ["DD", String(date.getDate()).padStart(2, "0")],
    ["M", String(date.getMonth() + 1)],
    ["D", String(date.getDate())],
  ];
  let out = format || "YYYY-MM-DD";
  for (const [token, value] of replacements) {
    out = out.replaceAll(token, value);
  }
  return out;
}

function parseDateKey(dateKey: string): Date | null {
  const m = String(dateKey || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mon = Number(m[2]) - 1;
  const d = Number(m[3]);
  const date = new Date(y, mon, d);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== y || date.getMonth() !== mon || date.getDate() !== d) return null;
  return date;
}

interface DailyConfig {
  folder: string;
  format: string;
  template: string;
}

export default class ScreenTimeDashboardBridgePlugin extends Plugin {
  settings: BridgeSettings = DEFAULT_SETTINGS;
  private dailyConfigMtimeMs: number | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addSettingTab(new BridgeSettingTab(this.app, this));

    this.addCommand({
      id: "start-dashboard",
      name: "Start ScreenTime Dashboard",
      callback: async () => {
        await this.startDashboard();
      },
    });

    this.addCommand({
      id: "stop-dashboard",
      name: "Stop ScreenTime Dashboard",
      callback: async () => {
        await this.stopDashboard();
      },
    });

    this.addCommand({
      id: "open-today-daily-note-screentime",
      name: "Open Today Daily Note (ScreenTime)",
      callback: async () => {
        await this.openDailyNoteByDateKey(toDateKey(new Date()));
      },
    });

    this.registerObsidianProtocolHandler("screen-time-open-daily", async (params) => {
      await this.handleOpenDailyProtocol(params as Record<string, string | string[]>);
    });

    // Backward compatibility for existing links.
    this.registerObsidianProtocolHandler("open-daily", async (params) => {
      await this.handleOpenDailyProtocol(params as Record<string, string | string[]>);
    });

    this.app.workspace.onLayoutReady(async () => {
      if (this.settings.autoSyncConfig) {
        await this.pushConfigToDashboard(true);
      }
    });

    this.registerInterval(
      window.setInterval(async () => {
        await this.syncDailyConfigWhenChanged();
      }, 3000),
    );
  }

  private async handleOpenDailyProtocol(params: Record<string, string | string[]>): Promise<void> {
    try {
      const rawDate = Array.isArray(params.date) ? params.date[0] : params.date;
      const dateText = String(rawDate || '').trim();
      const dateKey = dateText && parseDateKey(dateText) ? dateText : toDateKey(new Date());
      await this.openDailyNoteByDateKey(dateKey);
    } catch (err) {
      new Notice(`Open Daily Note failed: ${String(err)}`);
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    if (this.settings.autoSyncConfig) {
      await this.pushConfigToDashboard(true);
    }
  }

  private getVaultBasePath(): string {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      throw new Error("This plugin only supports FileSystemAdapter");
    }
    return adapter.getBasePath();
  }

  private async readDailyConfig(): Promise<DailyConfig> {
    const basePath = this.getVaultBasePath();
    const configPath = path.join(basePath, this.app.vault.configDir, "daily-notes.json");
    try {
      const raw = await fs.readFile(configPath, "utf-8");
      const json = JSON.parse(raw) as Record<string, unknown>;
      return {
        folder: String(json.folder || ""),
        format: String(json.format || "YYYY-MM-DD"),
        template: String(json.template || ""),
      };
    } catch {
      return { folder: "", format: "YYYY-MM-DD", template: "" };
    }
  }

  private getDailyConfigPath(): string {
    const basePath = this.getVaultBasePath();
    return path.join(basePath, this.app.vault.configDir, "daily-notes.json");
  }

  private async syncDailyConfigWhenChanged(): Promise<void> {
    if (!this.settings.autoSyncConfig) return;
    try {
      const stats = await fs.stat(this.getDailyConfigPath());
      const mtime = Number(stats.mtimeMs || 0);
      if (this.dailyConfigMtimeMs === null) {
        this.dailyConfigMtimeMs = mtime;
        return;
      }
      if (mtime !== this.dailyConfigMtimeMs) {
        this.dailyConfigMtimeMs = mtime;
        await this.pushConfigToDashboard(true);
      }
    } catch {
      // Ignore missing config file and transient errors.
    }
  }

  private async ensureFolderExists(folderPath: string): Promise<void> {
    const normalized = normalizePath(folderPath);
    if (!normalized || normalized === ".") return;
    const parts = normalized.split("/").filter(Boolean);
    let cur = "";
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(cur)) {
        await this.app.vault.createFolder(cur);
      }
    }
  }

  private async createFileFromTemplateIfAny(targetPath: string, templatePath: string): Promise<TFile> {
    const existing = this.app.vault.getAbstractFileByPath(targetPath);
    if (existing instanceof TFile) return existing;

    let initial = "";
    if (templatePath) {
      const template = this.app.vault.getAbstractFileByPath(normalizePath(templatePath));
      if (template instanceof TFile) {
        initial = await this.app.vault.read(template);
      }
    }
    return this.app.vault.create(normalizePath(targetPath), initial);
  }

  private async openDailyNoteByDateKey(dateKey: string): Promise<void> {
    const date = parseDateKey(dateKey);
    if (!date) {
      new Notice(`Invalid date: ${dateKey}`);
      return;
    }
    const dailyConfig = await this.readDailyConfig();
    const fileName = `${formatByMomentLike(date, dailyConfig.format)}.md`;
    const folder = normalizePath(dailyConfig.folder || "");
    const filePath = folder ? `${folder}/${fileName}` : fileName;
    await this.ensureFolderExists(folder);
    const file = await this.createFileFromTemplateIfAny(filePath, dailyConfig.template);
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.openFile(file);
  }

  private async runPython(args: string[]): Promise<void> {
    const cwd = this.settings.dashboardPath;
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("python3", args, {
        cwd,
        stdio: "ignore",
      });
      proc.on("error", reject);
      proc.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`python3 exited with code ${code}`));
      });
    });
  }

  private async waitHttpReady(url: string, timeoutMs = 30000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await requestUrl({ url, method: "GET", throw: false });
        if (res.status >= 200 && res.status < 500) {
          return;
        }
      } catch {
        // keep waiting
      }
      await sleep(500);
    }
    throw new Error(`Timeout waiting for ${url}`);
  }

  private async buildDashboardConfigPayload(): Promise<Record<string, string>> {
    const daily = await this.readDailyConfig();
    return {
      vault_path: this.getVaultBasePath(),
      daily_folder: daily.folder || "",
      daily_format: daily.format || "YYYY-MM-DD",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
      screen_time_heading: this.settings.screenTimeHeading || "ScreenTime",
    };
  }

  async pushConfigToDashboard(silent = false): Promise<void> {
    try {
      const payload = await this.buildDashboardConfigPayload();
      await requestUrl({
        url: `${BACKEND_URL}/api/obsidian/config`,
        method: "PUT",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      });
      if (!silent) new Notice("ScreenTime Dashboard 配置已同步到后端");
    } catch (err) {
      if (!silent) new Notice(`同步配置失败: ${String(err)}`);
    }
  }

  async startDashboard(): Promise<void> {
    try {
      const startScript = path.join(this.settings.dashboardPath, "start.py");
      await this.runPython([startScript, "--mode", this.settings.startMode, "--no-browser"]);
      const openUrl = this.settings.startMode === "dev" ? FRONTEND_URL_DEV : BACKEND_URL;
      await this.waitHttpReady(`${BACKEND_URL}/api/settings`, 30000);
      if (this.settings.startMode === "dev") {
        await this.waitHttpReady(FRONTEND_URL_DEV, 30000);
      }
      await this.pushConfigToDashboard(true);
      if (this.settings.openBrowserOnStart) {
        window.open(openUrl, "_blank");
      }
      new Notice(`ScreenTime Dashboard 已启动: ${openUrl}`);
    } catch (err) {
      new Notice(`启动失败: ${String(err)}`);
    }
  }

  async stopDashboard(): Promise<void> {
    try {
      const stopScript = path.join(this.settings.dashboardPath, "stop.py");
      await this.runPython([stopScript]);
      new Notice("ScreenTime Dashboard 已停止");
    } catch (err) {
      new Notice(`停止失败: ${String(err)}`);
    }
  }
}

class BridgeSettingTab extends PluginSettingTab {
  plugin: ScreenTimeDashboardBridgePlugin;

  constructor(app: App, plugin: ScreenTimeDashboardBridgePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Dashboard 项目路径")
      .setDesc("start.py 与 stop.py 所在目录")
      .addText((text) =>
        text
          .setPlaceholder("/Users/peng/Documents/GitHub/PengCode/iPhoneScreenTimeDashboard")
          .setValue(this.plugin.settings.dashboardPath)
          .onChange(async (value) => {
            this.plugin.settings.dashboardPath = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("启动模式")
      .setDesc("dev: 前后端分离（5173）；prod: 后端托管前端（8000）")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("dev", "dev")
          .addOption("prod", "prod")
          .setValue(this.plugin.settings.startMode)
          .onChange(async (value) => {
            this.plugin.settings.startMode = value === "prod" ? "prod" : "dev";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("启动后自动打开浏览器")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.openBrowserOnStart).onChange(async (value) => {
          this.plugin.settings.openBrowserOnStart = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("ScreenTime 标题")
      .setDesc("后端写入 Daily Note 时使用的标题名称（默认 ScreenTime）")
      .addText((text) =>
        text.setValue(this.plugin.settings.screenTimeHeading).onChange(async (value) => {
          this.plugin.settings.screenTimeHeading = value.trim() || "ScreenTime";
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("自动同步 Daily Note 配置")
      .setDesc("插件加载后把 Vault/Daily Note 配置推送给 Dashboard 后端")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoSyncConfig).onChange(async (value) => {
          this.plugin.settings.autoSyncConfig = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("手动同步配置到 Dashboard")
      .addButton((btn) =>
        btn.setButtonText("立即同步").onClick(async () => {
          await this.plugin.pushConfigToDashboard(false);
        }),
      );

    containerEl.createDiv({
      cls: "stdb-settings-note",
      text: "提示：浏览器时间线中的“日记”按钮会调用 obsidian://screen-time-open-daily?date=YYYY-MM-DD（兼容: obsidian://open-daily?date=...）。",
    });
  }
}
