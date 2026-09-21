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
import {
  appendBoundedTail,
  resolvePythonExecutable,
} from "./python-runtime.mjs";
import {
  CANONICAL_DASHBOARD_PATH,
  CONFIG_SYNC_HEARTBEAT_MS,
  LEGACY_DASHBOARD_PATH,
  migrateDashboardPath,
  resolveDashboardConfigSync,
  validateRuntimeIdentity,
} from "./runtime.mjs";

type StartMode = "dev" | "prod";

interface BridgeSettings {
  dashboardPath: string;
  pythonExecutable: string;
  startMode: StartMode;
  openBrowserOnStart: boolean;
  autoSyncConfig: boolean;
  screenTimeHeading: string;
}

const DEFAULT_SETTINGS: BridgeSettings = {
  dashboardPath: CANONICAL_DASHBOARD_PATH,
  pythonExecutable: "",
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
  private lastConfigPushAttemptAtMs = 0;
  private configPushInFlight = false;

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
    const [legacyExists, canonicalValid] = await Promise.all([
      this.pathExists(LEGACY_DASHBOARD_PATH),
      this.dashboardProjectValid(CANONICAL_DASHBOARD_PATH),
    ]);
    const migrated = migrateDashboardPath(this.settings.dashboardPath, { legacyExists, canonicalValid });
    if (migrated !== this.settings.dashboardPath) {
      this.settings.dashboardPath = migrated;
      await this.saveData(this.settings);
    }
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

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  private async dashboardProjectValid(targetPath: string): Promise<boolean> {
    const root = String(targetPath || "").trim();
    if (!root) return false;
    return (await Promise.all([
      this.pathExists(root),
      this.pathExists(path.join(root, "start.py")),
      this.pathExists(path.join(root, "stop.py")),
    ])).every(Boolean);
  }

  private async requireDashboardProject(): Promise<string> {
    const configured = String(this.settings.dashboardPath || "").trim();
    if (!(await this.dashboardProjectValid(configured))) {
      throw new Error(`Dashboard 项目路径无效：${configured || "未配置"}（需要 start.py 与 stop.py）`);
    }
    return fs.realpath(configured);
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
    let currentMtimeMs: number | null = null;
    try {
      const stats = await fs.stat(this.getDailyConfigPath());
      currentMtimeMs = Number(stats.mtimeMs || 0);
    } catch {
      currentMtimeMs = null;
    }
    const decision = resolveDashboardConfigSync({
      autoSync: this.settings.autoSyncConfig,
      currentMtimeMs,
      previousMtimeMs: this.dailyConfigMtimeMs,
      lastAttemptAtMs: this.lastConfigPushAttemptAtMs,
      nowMs: Date.now(),
      heartbeatMs: CONFIG_SYNC_HEARTBEAT_MS,
    });
    this.dailyConfigMtimeMs = decision.nextMtimeMs;
    if (decision.shouldPush) {
      await this.pushConfigToDashboard(true);
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

  private async runPython({
    executable,
    script,
    args,
    cwd,
    stage,
  }: {
    executable: string;
    script: string;
    args: string[];
    cwd: string;
    stage: string;
  }): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let stdout: Buffer = Buffer.alloc(0);
      let stderr: Buffer = Buffer.alloc(0);
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else resolve();
      };
      const proc = spawn(executable, [script, ...args], {
        cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      proc.stdout?.on("data", (chunk) => {
        stdout = appendBoundedTail(stdout, chunk);
      });
      proc.stderr?.on("data", (chunk) => {
        stderr = appendBoundedTail(stderr, chunk);
      });
      proc.on("error", (error) => {
        finish(new Error(`${stage}失败：无法启动 ${executable}（${String(error)}）`));
      });
      proc.on("close", (code, signal) => {
        if (code === 0) {
          finish();
          return;
        }
        const status = code === null ? `signal ${signal || "unknown"}` : `exit ${code}`;
        const detail = (stderr.length ? stderr : stdout).toString("utf8").trim().replace(/\s+/g, " ");
        finish(new Error(`${stage}失败：${executable} ${status}${detail ? `：${detail}` : ""}`));
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

  async pushConfigToDashboard(silent = false): Promise<boolean> {
    if (this.configPushInFlight) return false;
    this.configPushInFlight = true;
    this.lastConfigPushAttemptAtMs = Date.now();
    try {
      const payload = await this.buildDashboardConfigPayload();
      const response = await requestUrl({
        url: `${BACKEND_URL}/api/obsidian/config`,
        method: "PUT",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        throw: false,
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`HTTP ${response.status}`);
      }
      if (!silent) new Notice("ScreenTime Dashboard 配置已同步到后端");
      return true;
    } catch (err) {
      if (!silent) new Notice(`同步配置失败: ${String(err)}`);
      return false;
    } finally {
      this.configPushInFlight = false;
    }
  }

  async startDashboard(): Promise<void> {
    try {
      const expectedRoot = await this.requireDashboardProject();
      const startScript = path.join(expectedRoot, "start.py");
      const python = await resolvePythonExecutable({
        dashboardPath: expectedRoot,
        configuredPath: this.settings.pythonExecutable,
      });
      await this.runPython({
        executable: python.executable,
        script: startScript,
        args: ["--mode", this.settings.startMode, "--no-browser"],
        cwd: expectedRoot,
        stage: "启动 Dashboard",
      });
      const openUrl = this.settings.startMode === "dev" ? FRONTEND_URL_DEV : BACKEND_URL;
      await this.waitHttpReady(`${BACKEND_URL}/api/settings`, 30000);
      if (this.settings.startMode === "dev") {
        await this.waitHttpReady(FRONTEND_URL_DEV, 30000);
      }
      const runtimeResponse = await requestUrl({
        url: `${BACKEND_URL}/api/system/runtime`,
        method: "GET",
        throw: false,
      });
      if (runtimeResponse.status < 200 || runtimeResponse.status >= 300) {
        throw new Error(`无法验证 Dashboard 运行身份（HTTP ${runtimeResponse.status}）`);
      }
      const runtimeValidation = validateRuntimeIdentity(runtimeResponse.json, {
        path: expectedRoot,
        mode: this.settings.startMode,
      });
      if (!runtimeValidation.ok) {
        throw new Error(runtimeValidation.message);
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
      const expectedRoot = await this.requireDashboardProject();
      const stopScript = path.join(expectedRoot, "stop.py");
      const python = await resolvePythonExecutable({
        dashboardPath: expectedRoot,
        configuredPath: this.settings.pythonExecutable,
      });
      await this.runPython({
        executable: python.executable,
        script: stopScript,
        args: [],
        cwd: expectedRoot,
        stage: "停止 Dashboard",
      });
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
          .setPlaceholder(CANONICAL_DASHBOARD_PATH)
          .setValue(this.plugin.settings.dashboardPath)
          .onChange(async (value) => {
            this.plugin.settings.dashboardPath = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Python 解释器路径")
      .setDesc("留空时自动探测 Python 3.11+；手动覆盖时仅接受绝对路径（支持开头的 ~/）。")
      .addText((text) =>
        text
          .setPlaceholder("留空自动探测")
          .setValue(this.plugin.settings.pythonExecutable)
          .onChange(async (value) => {
            this.plugin.settings.pythonExecutable = value.trim();
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
