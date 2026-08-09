"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ScreenTimeDashboardBridgePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var import_node_child_process = require("node:child_process");
var import_node_fs = require("node:fs");
var import_node_path2 = __toESM(require("node:path"), 1);

// src/runtime.mjs
var import_node_path = __toESM(require("node:path"), 1);
var APP_ID = "peng.screentime-dashboard";
var CANONICAL_DASHBOARD_PATH = "/Users/peng/Documents/GitHub-Peng/ScreenTimeDashboard";
var LEGACY_DASHBOARD_PATH = "/Users/peng/Documents/GitHub/PengCode/iPhoneScreenTimeDashboard";
var CONFIG_SYNC_HEARTBEAT_MS = 15e3;
function resolveDashboardConfigSync({
  autoSync = true,
  currentMtimeMs = null,
  previousMtimeMs = null,
  lastAttemptAtMs = 0,
  nowMs = Date.now(),
  heartbeatMs = CONFIG_SYNC_HEARTBEAT_MS
} = {}) {
  const currentMtime = Number(currentMtimeMs);
  const previousMtime = Number(previousMtimeMs);
  const hasCurrentMtime = currentMtimeMs !== null && Number.isFinite(currentMtime);
  const hasPreviousMtime = previousMtimeMs !== null && Number.isFinite(previousMtime);
  const nextMtimeMs = hasCurrentMtime ? currentMtime : hasPreviousMtime ? previousMtime : null;
  const configChanged = hasCurrentMtime && (!hasPreviousMtime || currentMtime !== previousMtime);
  const elapsedMs = Math.max(0, Number(nowMs) - Math.max(0, Number(lastAttemptAtMs) || 0));
  const heartbeatDue = elapsedMs >= Math.max(1, Number(heartbeatMs) || CONFIG_SYNC_HEARTBEAT_MS);
  return {
    shouldPush: Boolean(autoSync) && (configChanged || heartbeatDue),
    nextMtimeMs
  };
}
function migrateDashboardPath(currentPath, { legacyExists, canonicalValid }) {
  const current = String(currentPath || "").trim();
  if (current === LEGACY_DASHBOARD_PATH && !legacyExists && canonicalValid) {
    return CANONICAL_DASHBOARD_PATH;
  }
  return current || CANONICAL_DASHBOARD_PATH;
}
function validateRuntimeIdentity(runtime, expected) {
  if (!runtime || runtime.app_id !== APP_ID) {
    return { ok: false, message: "\u5F53\u524D\u7AEF\u53E3\u4E0D\u662F ScreenTime Dashboard\uFF0C\u5DF2\u62D2\u7EDD\u6253\u5F00\u6D4F\u89C8\u5668\u3002" };
  }
  const expectedRoot = import_node_path.default.resolve(String(expected?.path || ""));
  const actualRoot = import_node_path.default.resolve(String(runtime.project_root || ""));
  if (!expectedRoot || actualRoot !== expectedRoot) {
    return {
      ok: false,
      message: `\u5B9E\u9645\u8FD0\u884C\u76EE\u5F55\u4E0E\u63D2\u4EF6\u914D\u7F6E\u4E0D\u4E00\u81F4\uFF1A${actualRoot || "\u672A\u77E5"}\uFF08\u9884\u671F ${expectedRoot || "\u672A\u77E5"}\uFF09`
    };
  }
  const expectedMode = String(expected?.mode || "");
  const actualMode = String(runtime.mode || "");
  if (actualMode !== expectedMode) {
    return {
      ok: false,
      message: `Dashboard \u542F\u52A8\u6A21\u5F0F\u4E0D\u4E00\u81F4\uFF1A${actualMode || "\u672A\u77E5"}\uFF08\u9884\u671F ${expectedMode || "\u672A\u77E5"}\uFF09`
    };
  }
  return { ok: true, message: "" };
}

// src/main.ts
var DEFAULT_SETTINGS = {
  dashboardPath: CANONICAL_DASHBOARD_PATH,
  startMode: "dev",
  openBrowserOnStart: true,
  autoSyncConfig: true,
  screenTimeHeading: "ScreenTime"
};
var FRONTEND_URL_DEV = "http://127.0.0.1:5173";
var BACKEND_URL = "http://127.0.0.1:8000";
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function formatByMomentLike(date, format) {
  const replacements = [
    ["YYYY", String(date.getFullYear()).padStart(4, "0")],
    ["YY", String(date.getFullYear() % 100).padStart(2, "0")],
    ["MM", String(date.getMonth() + 1).padStart(2, "0")],
    ["DD", String(date.getDate()).padStart(2, "0")],
    ["M", String(date.getMonth() + 1)],
    ["D", String(date.getDate())]
  ];
  let out = format || "YYYY-MM-DD";
  for (const [token, value] of replacements) {
    out = out.replaceAll(token, value);
  }
  return out;
}
function parseDateKey(dateKey) {
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
var ScreenTimeDashboardBridgePlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.dailyConfigMtimeMs = null;
    this.lastConfigPushAttemptAtMs = 0;
    this.configPushInFlight = false;
  }
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new BridgeSettingTab(this.app, this));
    this.addCommand({
      id: "start-dashboard",
      name: "Start ScreenTime Dashboard",
      callback: async () => {
        await this.startDashboard();
      }
    });
    this.addCommand({
      id: "stop-dashboard",
      name: "Stop ScreenTime Dashboard",
      callback: async () => {
        await this.stopDashboard();
      }
    });
    this.addCommand({
      id: "open-today-daily-note-screentime",
      name: "Open Today Daily Note (ScreenTime)",
      callback: async () => {
        await this.openDailyNoteByDateKey(toDateKey(/* @__PURE__ */ new Date()));
      }
    });
    this.registerObsidianProtocolHandler("screen-time-open-daily", async (params) => {
      await this.handleOpenDailyProtocol(params);
    });
    this.registerObsidianProtocolHandler("open-daily", async (params) => {
      await this.handleOpenDailyProtocol(params);
    });
    this.app.workspace.onLayoutReady(async () => {
      if (this.settings.autoSyncConfig) {
        await this.pushConfigToDashboard(true);
      }
    });
    this.registerInterval(
      window.setInterval(async () => {
        await this.syncDailyConfigWhenChanged();
      }, 3e3)
    );
  }
  async handleOpenDailyProtocol(params) {
    try {
      const rawDate = Array.isArray(params.date) ? params.date[0] : params.date;
      const dateText = String(rawDate || "").trim();
      const dateKey = dateText && parseDateKey(dateText) ? dateText : toDateKey(/* @__PURE__ */ new Date());
      await this.openDailyNoteByDateKey(dateKey);
    } catch (err) {
      new import_obsidian.Notice(`Open Daily Note failed: ${String(err)}`);
    }
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    const [legacyExists, canonicalValid] = await Promise.all([
      this.pathExists(LEGACY_DASHBOARD_PATH),
      this.dashboardProjectValid(CANONICAL_DASHBOARD_PATH)
    ]);
    const migrated = migrateDashboardPath(this.settings.dashboardPath, { legacyExists, canonicalValid });
    if (migrated !== this.settings.dashboardPath) {
      this.settings.dashboardPath = migrated;
      await this.saveData(this.settings);
    }
  }
  async saveSettings() {
    await this.saveData(this.settings);
    if (this.settings.autoSyncConfig) {
      await this.pushConfigToDashboard(true);
    }
  }
  getVaultBasePath() {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof import_obsidian.FileSystemAdapter)) {
      throw new Error("This plugin only supports FileSystemAdapter");
    }
    return adapter.getBasePath();
  }
  async pathExists(targetPath) {
    try {
      await import_node_fs.promises.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }
  async dashboardProjectValid(targetPath) {
    const root = String(targetPath || "").trim();
    if (!root) return false;
    return (await Promise.all([
      this.pathExists(root),
      this.pathExists(import_node_path2.default.join(root, "start.py")),
      this.pathExists(import_node_path2.default.join(root, "stop.py"))
    ])).every(Boolean);
  }
  async requireDashboardProject() {
    const configured = String(this.settings.dashboardPath || "").trim();
    if (!await this.dashboardProjectValid(configured)) {
      throw new Error(`Dashboard \u9879\u76EE\u8DEF\u5F84\u65E0\u6548\uFF1A${configured || "\u672A\u914D\u7F6E"}\uFF08\u9700\u8981 start.py \u4E0E stop.py\uFF09`);
    }
    return import_node_fs.promises.realpath(configured);
  }
  async readDailyConfig() {
    const basePath = this.getVaultBasePath();
    const configPath = import_node_path2.default.join(basePath, this.app.vault.configDir, "daily-notes.json");
    try {
      const raw = await import_node_fs.promises.readFile(configPath, "utf-8");
      const json = JSON.parse(raw);
      return {
        folder: String(json.folder || ""),
        format: String(json.format || "YYYY-MM-DD"),
        template: String(json.template || "")
      };
    } catch {
      return { folder: "", format: "YYYY-MM-DD", template: "" };
    }
  }
  getDailyConfigPath() {
    const basePath = this.getVaultBasePath();
    return import_node_path2.default.join(basePath, this.app.vault.configDir, "daily-notes.json");
  }
  async syncDailyConfigWhenChanged() {
    if (!this.settings.autoSyncConfig) return;
    let currentMtimeMs = null;
    try {
      const stats = await import_node_fs.promises.stat(this.getDailyConfigPath());
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
      heartbeatMs: CONFIG_SYNC_HEARTBEAT_MS
    });
    this.dailyConfigMtimeMs = decision.nextMtimeMs;
    if (decision.shouldPush) {
      await this.pushConfigToDashboard(true);
    }
  }
  async ensureFolderExists(folderPath) {
    const normalized = (0, import_obsidian.normalizePath)(folderPath);
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
  async createFileFromTemplateIfAny(targetPath, templatePath) {
    const existing = this.app.vault.getAbstractFileByPath(targetPath);
    if (existing instanceof import_obsidian.TFile) return existing;
    let initial = "";
    if (templatePath) {
      const template = this.app.vault.getAbstractFileByPath((0, import_obsidian.normalizePath)(templatePath));
      if (template instanceof import_obsidian.TFile) {
        initial = await this.app.vault.read(template);
      }
    }
    return this.app.vault.create((0, import_obsidian.normalizePath)(targetPath), initial);
  }
  async openDailyNoteByDateKey(dateKey) {
    const date = parseDateKey(dateKey);
    if (!date) {
      new import_obsidian.Notice(`Invalid date: ${dateKey}`);
      return;
    }
    const dailyConfig = await this.readDailyConfig();
    const fileName = `${formatByMomentLike(date, dailyConfig.format)}.md`;
    const folder = (0, import_obsidian.normalizePath)(dailyConfig.folder || "");
    const filePath = folder ? `${folder}/${fileName}` : fileName;
    await this.ensureFolderExists(folder);
    const file = await this.createFileFromTemplateIfAny(filePath, dailyConfig.template);
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.openFile(file);
  }
  async runPython(args) {
    const cwd = this.settings.dashboardPath;
    await new Promise((resolve, reject) => {
      const proc = (0, import_node_child_process.spawn)("python3", args, {
        cwd,
        stdio: "ignore"
      });
      proc.on("error", reject);
      proc.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`python3 exited with code ${code}`));
      });
    });
  }
  async waitHttpReady(url, timeoutMs = 3e4) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await (0, import_obsidian.requestUrl)({ url, method: "GET", throw: false });
        if (res.status >= 200 && res.status < 500) {
          return;
        }
      } catch {
      }
      await sleep(500);
    }
    throw new Error(`Timeout waiting for ${url}`);
  }
  async buildDashboardConfigPayload() {
    const daily = await this.readDailyConfig();
    return {
      vault_path: this.getVaultBasePath(),
      daily_folder: daily.folder || "",
      daily_format: daily.format || "YYYY-MM-DD",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
      screen_time_heading: this.settings.screenTimeHeading || "ScreenTime"
    };
  }
  async pushConfigToDashboard(silent = false) {
    if (this.configPushInFlight) return false;
    this.configPushInFlight = true;
    this.lastConfigPushAttemptAtMs = Date.now();
    try {
      const payload = await this.buildDashboardConfigPayload();
      const response = await (0, import_obsidian.requestUrl)({
        url: `${BACKEND_URL}/api/obsidian/config`,
        method: "PUT",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        throw: false
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`HTTP ${response.status}`);
      }
      if (!silent) new import_obsidian.Notice("ScreenTime Dashboard \u914D\u7F6E\u5DF2\u540C\u6B65\u5230\u540E\u7AEF");
      return true;
    } catch (err) {
      if (!silent) new import_obsidian.Notice(`\u540C\u6B65\u914D\u7F6E\u5931\u8D25: ${String(err)}`);
      return false;
    } finally {
      this.configPushInFlight = false;
    }
  }
  async startDashboard() {
    try {
      const expectedRoot = await this.requireDashboardProject();
      const startScript = import_node_path2.default.join(expectedRoot, "start.py");
      await this.runPython([startScript, "--mode", this.settings.startMode, "--no-browser"]);
      const openUrl = this.settings.startMode === "dev" ? FRONTEND_URL_DEV : BACKEND_URL;
      await this.waitHttpReady(`${BACKEND_URL}/api/settings`, 3e4);
      if (this.settings.startMode === "dev") {
        await this.waitHttpReady(FRONTEND_URL_DEV, 3e4);
      }
      const runtimeResponse = await (0, import_obsidian.requestUrl)({
        url: `${BACKEND_URL}/api/system/runtime`,
        method: "GET",
        throw: false
      });
      if (runtimeResponse.status < 200 || runtimeResponse.status >= 300) {
        throw new Error(`\u65E0\u6CD5\u9A8C\u8BC1 Dashboard \u8FD0\u884C\u8EAB\u4EFD\uFF08HTTP ${runtimeResponse.status}\uFF09`);
      }
      const runtimeValidation = validateRuntimeIdentity(runtimeResponse.json, {
        path: expectedRoot,
        mode: this.settings.startMode
      });
      if (!runtimeValidation.ok) {
        throw new Error(runtimeValidation.message);
      }
      await this.pushConfigToDashboard(true);
      if (this.settings.openBrowserOnStart) {
        window.open(openUrl, "_blank");
      }
      new import_obsidian.Notice(`ScreenTime Dashboard \u5DF2\u542F\u52A8: ${openUrl}`);
    } catch (err) {
      new import_obsidian.Notice(`\u542F\u52A8\u5931\u8D25: ${String(err)}`);
    }
  }
  async stopDashboard() {
    try {
      const stopScript = import_node_path2.default.join(this.settings.dashboardPath, "stop.py");
      await this.runPython([stopScript]);
      new import_obsidian.Notice("ScreenTime Dashboard \u5DF2\u505C\u6B62");
    } catch (err) {
      new import_obsidian.Notice(`\u505C\u6B62\u5931\u8D25: ${String(err)}`);
    }
  }
};
var BridgeSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Dashboard \u9879\u76EE\u8DEF\u5F84").setDesc("start.py \u4E0E stop.py \u6240\u5728\u76EE\u5F55").addText(
      (text) => text.setPlaceholder(CANONICAL_DASHBOARD_PATH).setValue(this.plugin.settings.dashboardPath).onChange(async (value) => {
        this.plugin.settings.dashboardPath = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u542F\u52A8\u6A21\u5F0F").setDesc("dev: \u524D\u540E\u7AEF\u5206\u79BB\uFF085173\uFF09\uFF1Bprod: \u540E\u7AEF\u6258\u7BA1\u524D\u7AEF\uFF088000\uFF09").addDropdown(
      (dropdown) => dropdown.addOption("dev", "dev").addOption("prod", "prod").setValue(this.plugin.settings.startMode).onChange(async (value) => {
        this.plugin.settings.startMode = value === "prod" ? "prod" : "dev";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u542F\u52A8\u540E\u81EA\u52A8\u6253\u5F00\u6D4F\u89C8\u5668").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.openBrowserOnStart).onChange(async (value) => {
        this.plugin.settings.openBrowserOnStart = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("ScreenTime \u6807\u9898").setDesc("\u540E\u7AEF\u5199\u5165 Daily Note \u65F6\u4F7F\u7528\u7684\u6807\u9898\u540D\u79F0\uFF08\u9ED8\u8BA4 ScreenTime\uFF09").addText(
      (text) => text.setValue(this.plugin.settings.screenTimeHeading).onChange(async (value) => {
        this.plugin.settings.screenTimeHeading = value.trim() || "ScreenTime";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u81EA\u52A8\u540C\u6B65 Daily Note \u914D\u7F6E").setDesc("\u63D2\u4EF6\u52A0\u8F7D\u540E\u628A Vault/Daily Note \u914D\u7F6E\u63A8\u9001\u7ED9 Dashboard \u540E\u7AEF").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.autoSyncConfig).onChange(async (value) => {
        this.plugin.settings.autoSyncConfig = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u624B\u52A8\u540C\u6B65\u914D\u7F6E\u5230 Dashboard").addButton(
      (btn) => btn.setButtonText("\u7ACB\u5373\u540C\u6B65").onClick(async () => {
        await this.plugin.pushConfigToDashboard(false);
      })
    );
    containerEl.createDiv({
      cls: "stdb-settings-note",
      text: "\u63D0\u793A\uFF1A\u6D4F\u89C8\u5668\u65F6\u95F4\u7EBF\u4E2D\u7684\u201C\u65E5\u8BB0\u201D\u6309\u94AE\u4F1A\u8C03\u7528 obsidian://screen-time-open-daily?date=YYYY-MM-DD\uFF08\u517C\u5BB9: obsidian://open-daily?date=...\uFF09\u3002"
    });
  }
};
