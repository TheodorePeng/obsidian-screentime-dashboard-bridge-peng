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
var import_node_child_process2 = require("node:child_process");
var import_node_fs = require("node:fs");
var import_node_path3 = __toESM(require("node:path"), 1);

// src/python-runtime.mjs
var import_node_child_process = require("node:child_process");
var import_node_os = __toESM(require("node:os"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var PYTHON_PROBE_TIMEOUT_MS = 5e3;
var OUTPUT_TAIL_BYTES = 8 * 1024;
function appendBoundedTail(current, chunk, maxBytes = OUTPUT_TAIL_BYTES) {
  const previous = Buffer.isBuffer(current) ? current : Buffer.from(current || "");
  const addition = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk || "");
  const combined = Buffer.concat([previous, addition]);
  return combined.length <= maxBytes ? combined : combined.subarray(combined.length - maxBytes);
}
function expandLeadingHome(value, homeDir) {
  if (value === "~") return homeDir;
  if (value.startsWith("~/")) return import_node_path.default.join(homeDir, value.slice(2));
  return value;
}
function buildPythonCandidates({
  dashboardPath,
  homeDir = import_node_os.default.homedir(),
  envPath = process.env.PATH || ""
}) {
  const fixedCandidates = [
    import_node_path.default.join(dashboardPath, "backend", ".venv", "bin", "python"),
    "/opt/homebrew/bin/python3.11",
    "/opt/homebrew/opt/python@3.11/bin/python3.11",
    "/usr/local/bin/python3.11",
    "/usr/local/opt/python@3.11/bin/python3.11",
    "/Library/Frameworks/Python.framework/Versions/3.11/bin/python3.11",
    import_node_path.default.join(homeDir, ".local", "bin", "python3.11"),
    import_node_path.default.join(homeDir, ".pyenv", "shims", "python3.11")
  ];
  const pathDirs = String(envPath).split(import_node_path.default.delimiter).filter(Boolean);
  const pathCandidates = [
    ...pathDirs.map((dir) => import_node_path.default.join(dir, "python3.11")),
    ...pathDirs.map((dir) => import_node_path.default.join(dir, "python3"))
  ];
  return [.../* @__PURE__ */ new Set([...fixedCandidates, ...pathCandidates])];
}
function isSupportedPythonVersion(version) {
  const match = String(version || "").trim().match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major === 3 && minor >= 11;
}
function summarizeOutput(buffer) {
  const text = Buffer.from(buffer || "").toString("utf8").trim().replace(/\s+/g, " ");
  if (!text) return "";
  return text.length <= 512 ? text : text.slice(-512);
}
async function probePythonExecutable(executable, { spawnImpl = import_node_child_process.spawn, timeoutMs = PYTHON_PROBE_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let settled = false;
    let timedOut = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    let child;
    try {
      child = spawnImpl(
        executable,
        ["-c", 'import sys; print("%d.%d.%d" % sys.version_info[:3])'],
        { shell: false, stdio: ["ignore", "pipe", "pipe"] }
      );
    } catch (error) {
      resolve({ ok: false, reason: String(error) });
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch {
      }
      finish({ ok: false, reason: `\u63A2\u6D4B\u8D85\u65F6\uFF08${timeoutMs}ms\uFF09` });
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => {
      stdout = appendBoundedTail(stdout, chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr = appendBoundedTail(stderr, chunk);
    });
    child.on("error", (error) => {
      finish({ ok: false, reason: String(error) });
    });
    child.on("close", (code, signal) => {
      if (timedOut) return;
      const output = summarizeOutput(stdout) || summarizeOutput(stderr);
      if (code !== 0) {
        const status = code === null ? `signal ${signal || "unknown"}` : `exit ${code}`;
        finish({ ok: false, reason: output ? `${status}: ${output}` : status });
        return;
      }
      if (!isSupportedPythonVersion(output)) {
        finish({ ok: false, reason: output ? `\u4E0D\u652F\u6301\u7684 Python \u7248\u672C ${output}` : "\u65E0\u6CD5\u8BFB\u53D6 Python \u7248\u672C" });
        return;
      }
      finish({ ok: true, version: output });
    });
  });
}
async function resolvePythonExecutable({
  dashboardPath,
  configuredPath = "",
  homeDir = import_node_os.default.homedir(),
  envPath = process.env.PATH || "",
  probe = probePythonExecutable
}) {
  const configured = String(configuredPath || "").trim();
  if (configured) {
    const executable = expandLeadingHome(configured, homeDir);
    if (!import_node_path.default.isAbsolute(executable)) {
      throw new Error("\u914D\u7F6E\u7684 Python \u89E3\u91CA\u5668\u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84\uFF08\u4EC5\u652F\u6301\u5F00\u5934\u7684 ~/ \u5C55\u5F00\uFF09");
    }
    const result = await probe(executable);
    if (result.ok && isSupportedPythonVersion(result.version)) {
      return { executable, version: result.version, source: "configured" };
    }
    const reason = result.reason || `\u4E0D\u652F\u6301\u7684 Python \u7248\u672C ${result.version || "unknown"}`;
    throw new Error(`\u914D\u7F6E\u7684 Python \u89E3\u91CA\u5668\u4E0D\u53EF\u7528\uFF1A${executable}\uFF08${reason}\uFF09`);
  }
  const attempts = [];
  for (const executable of buildPythonCandidates({ dashboardPath, homeDir, envPath })) {
    const result = await probe(executable);
    if (result.ok && isSupportedPythonVersion(result.version)) {
      return { executable, version: result.version, source: "automatic" };
    }
    attempts.push({
      executable,
      reason: result.reason || `\u4E0D\u652F\u6301\u7684 Python \u7248\u672C ${result.version || "unknown"}`
    });
  }
  const detail = attempts.map(({ executable, reason }) => `${executable}: ${reason}`).join("; ");
  throw new Error(`\u672A\u627E\u5230\u53EF\u7528\u7684 Python 3.11+\u3002\u5DF2\u5C1D\u8BD5\uFF1A${detail}`);
}

// src/runtime.mjs
var import_node_path2 = __toESM(require("node:path"), 1);
var APP_ID = "peng.screentime-dashboard";
var CANONICAL_DASHBOARD_PATH = "/Users/peng/Documents/GitHub-Peng/ScreenTimeDashboard";
var LEGACY_DASHBOARD_PATH = "/Users/peng/Documents/GitHub/PengCode/iPhoneScreenTimeDashboard";
var CONFIG_SYNC_RETRY_DELAYS_MS = Object.freeze([15e3, 3e4, 6e4, 3e5]);
function buildStableSignature(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => buildStableSignature(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${buildStableSignature(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function resolveDashboardConfigSync({
  autoSync = true,
  currentMtimeMs = null,
  previousMtimeMs = null,
  currentSignature = "",
  lastSuccessfulSignature = "",
  failedAttempts = 0,
  lastAttemptAtMs = 0,
  nowMs = Date.now(),
  force = false
} = {}) {
  const currentMtime = Number(currentMtimeMs);
  const previousMtime = Number(previousMtimeMs);
  const hasCurrentMtime = currentMtimeMs !== null && Number.isFinite(currentMtime);
  const hasPreviousMtime = previousMtimeMs !== null && Number.isFinite(previousMtime);
  const nextMtimeMs = hasCurrentMtime ? currentMtime : hasPreviousMtime ? previousMtime : null;
  const configChanged = hasCurrentMtime && (!hasPreviousMtime || currentMtime !== previousMtime);
  const elapsedMs = Math.max(0, Number(nowMs) - Math.max(0, Number(lastAttemptAtMs) || 0));
  const failures = Math.max(0, Number(failedAttempts) || 0);
  const retryIndex = Math.min(Math.max(0, failures - 1), CONFIG_SYNC_RETRY_DELAYS_MS.length - 1);
  const retryDue = failures === 0 || elapsedMs >= CONFIG_SYNC_RETRY_DELAYS_MS[retryIndex];
  const signatureChanged = String(currentSignature) !== String(lastSuccessfulSignature);
  return {
    shouldPush: Boolean(autoSync) && Boolean(force || configChanged || signatureChanged) && retryDue,
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
  const expectedRoot = import_node_path2.default.resolve(String(expected?.path || ""));
  const actualRoot = import_node_path2.default.resolve(String(runtime.project_root || ""));
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
  pythonExecutable: "",
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
    this.lastSuccessfulConfigSignature = "";
    this.configSyncFailureCount = 0;
    this.configPushInFlight = false;
  }
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new BridgeSettingTab(this.app, this));
    this.addCommand({
      id: "start-dashboard",
      name: "Start ScreenTime Dashboard",
      callback: async () => {
        await this.startDashboard("prod");
      }
    });
    this.addCommand({
      id: "start-dashboard-dev",
      name: "Start ScreenTime Dashboard (Development)",
      callback: async () => {
        await this.startDashboard("dev");
      }
    });
    this.addCommand({
      id: "diagnose-dashboard",
      name: "Diagnose ScreenTime Dashboard",
      callback: async () => {
        await this.diagnoseDashboard();
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
        await this.pushConfigToDashboard(true, true);
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
      await this.pushConfigToDashboard(true, true);
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
      this.pathExists(import_node_path3.default.join(root, "start.py")),
      this.pathExists(import_node_path3.default.join(root, "stop.py"))
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
    const configPath = import_node_path3.default.join(basePath, this.app.vault.configDir, "daily-notes.json");
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
    return import_node_path3.default.join(basePath, this.app.vault.configDir, "daily-notes.json");
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
    const payload = await this.buildDashboardConfigPayload();
    const currentSignature = buildStableSignature(payload);
    const decision = resolveDashboardConfigSync({
      autoSync: this.settings.autoSyncConfig,
      currentMtimeMs,
      previousMtimeMs: this.dailyConfigMtimeMs,
      currentSignature,
      lastSuccessfulSignature: this.lastSuccessfulConfigSignature,
      failedAttempts: this.configSyncFailureCount,
      lastAttemptAtMs: this.lastConfigPushAttemptAtMs,
      nowMs: Date.now()
    });
    this.dailyConfigMtimeMs = decision.nextMtimeMs;
    if (decision.shouldPush) {
      await this.pushConfigToDashboard(true, false, payload);
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
  async runPython({
    executable,
    script,
    args,
    cwd,
    stage,
    allowNonZero = false
  }) {
    return new Promise((resolve, reject) => {
      let stdout = Buffer.alloc(0);
      let stderr = Buffer.alloc(0);
      let settled = false;
      const finish = (result, error) => {
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else if (result) resolve(result);
      };
      const proc = (0, import_node_child_process2.spawn)(executable, [script, ...args], {
        cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"]
      });
      proc.stdout?.on("data", (chunk) => {
        stdout = appendBoundedTail(stdout, chunk);
      });
      proc.stderr?.on("data", (chunk) => {
        stderr = appendBoundedTail(stderr, chunk);
      });
      proc.on("error", (error) => {
        finish(void 0, new Error(`${stage}\u5931\u8D25\uFF1A\u65E0\u6CD5\u542F\u52A8 ${executable}\uFF08${String(error)}\uFF09`));
      });
      proc.on("close", (code, signal) => {
        const result = {
          code,
          signal,
          stdout: stdout.toString("utf8").trim(),
          stderr: stderr.toString("utf8").trim()
        };
        if (code === 0 || allowNonZero) {
          finish(result);
          return;
        }
        const status = code === null ? `signal ${signal || "unknown"}` : `exit ${code}`;
        const detail = (stderr.length ? stderr : stdout).toString("utf8").trim().replace(/\s+/g, " ");
        finish(void 0, new Error(`${stage}\u5931\u8D25\uFF1A${executable} ${status}${detail ? `\uFF1A${detail}` : ""}`));
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
  async pushConfigToDashboard(silent = false, force = false, preparedPayload) {
    if (this.configPushInFlight) return false;
    this.configPushInFlight = true;
    this.lastConfigPushAttemptAtMs = Date.now();
    try {
      const payload = preparedPayload || await this.buildDashboardConfigPayload();
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
      this.lastSuccessfulConfigSignature = buildStableSignature(payload);
      this.configSyncFailureCount = 0;
      if (!silent) new import_obsidian.Notice("ScreenTime Dashboard \u914D\u7F6E\u5DF2\u540C\u6B65\u5230\u540E\u7AEF");
      return true;
    } catch (err) {
      this.configSyncFailureCount += 1;
      if (!silent) new import_obsidian.Notice(`\u540C\u6B65\u914D\u7F6E\u5931\u8D25: ${String(err)}`);
      return false;
    } finally {
      this.configPushInFlight = false;
    }
  }
  async startDashboard(mode) {
    try {
      const expectedRoot = await this.requireDashboardProject();
      const startScript = import_node_path3.default.join(expectedRoot, "start.py");
      const python = await resolvePythonExecutable({
        dashboardPath: expectedRoot,
        configuredPath: this.settings.pythonExecutable
      });
      await this.runPython({
        executable: python.executable,
        script: startScript,
        args: ["--mode", mode, "--no-browser"],
        cwd: expectedRoot,
        stage: "\u542F\u52A8 Dashboard"
      });
      const openUrl = mode === "dev" ? FRONTEND_URL_DEV : BACKEND_URL;
      await this.waitHttpReady(`${BACKEND_URL}/api/settings`, 3e4);
      if (mode === "dev") {
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
        mode
      });
      if (!runtimeValidation.ok) {
        throw new Error(runtimeValidation.message);
      }
      await this.pushConfigToDashboard(true, true);
      if (this.settings.openBrowserOnStart) {
        window.open(openUrl, "_blank");
      }
      new import_obsidian.Notice(`ScreenTime Dashboard \u5DF2\u542F\u52A8\uFF08${mode}\uFF09: ${openUrl}`);
    } catch (err) {
      new import_obsidian.Notice(`\u542F\u52A8\u5931\u8D25: ${String(err)}`);
    }
  }
  async stopDashboard() {
    try {
      const expectedRoot = await this.requireDashboardProject();
      const stopScript = import_node_path3.default.join(expectedRoot, "stop.py");
      const python = await resolvePythonExecutable({
        dashboardPath: expectedRoot,
        configuredPath: this.settings.pythonExecutable
      });
      await this.runPython({
        executable: python.executable,
        script: stopScript,
        args: [],
        cwd: expectedRoot,
        stage: "\u505C\u6B62 Dashboard"
      });
      new import_obsidian.Notice("ScreenTime Dashboard \u5DF2\u505C\u6B62");
    } catch (err) {
      new import_obsidian.Notice(`\u505C\u6B62\u5931\u8D25: ${String(err)}`);
    }
  }
  async diagnoseDashboard() {
    try {
      const expectedRoot = await this.requireDashboardProject();
      const doctorScript = import_node_path3.default.join(expectedRoot, "scripts", "doctor.py");
      const python = await resolvePythonExecutable({
        dashboardPath: expectedRoot,
        configuredPath: this.settings.pythonExecutable
      });
      const result = await this.runPython({
        executable: python.executable,
        script: doctorScript,
        args: ["--json"],
        cwd: expectedRoot,
        stage: "\u8BCA\u65AD Dashboard",
        allowNonZero: true
      });
      const report = JSON.parse(result.stdout);
      new DashboardDiagnosticModal(this.app, report, python.executable).open();
    } catch (err) {
      new import_obsidian.Notice(`\u8BCA\u65AD\u5931\u8D25: ${String(err)}`);
    }
  }
};
var DashboardDiagnosticModal = class extends import_obsidian.Modal {
  constructor(app, report, pythonExecutable) {
    super(app);
    this.report = report;
    this.pythonExecutable = pythonExecutable;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: `ScreenTime Dashboard \u8BCA\u65AD\uFF1A${this.report.ok ? "\u901A\u8FC7" : "\u9700\u8981\u5904\u7406"}` });
    contentEl.createEl("p", { text: `Python: ${this.pythonExecutable}` });
    for (const [title, checks] of [
      ["\u5FC5\u68C0\u9879\u76EE", this.report.required_checks || []],
      ["\u53EF\u9009\u9879\u76EE", this.report.optional_checks || []]
    ]) {
      contentEl.createEl("h3", { text: title });
      const list = contentEl.createEl("ul");
      for (const check of checks) {
        list.createEl("li", { text: `${check.status === "pass" ? "\u2713" : "\u26A0"} ${check.id}: ${check.summary}` });
      }
    }
    if (this.report.hints?.length) {
      contentEl.createEl("h3", { text: "\u5EFA\u8BAE" });
      const hints = contentEl.createEl("ul");
      for (const hint of this.report.hints) hints.createEl("li", { text: hint });
    }
  }
  onClose() {
    this.contentEl.empty();
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
    new import_obsidian.Setting(containerEl).setName("Python \u89E3\u91CA\u5668\u8DEF\u5F84").setDesc("\u7559\u7A7A\u65F6\u81EA\u52A8\u63A2\u6D4B Python 3.11+\uFF1B\u624B\u52A8\u8986\u76D6\u65F6\u4EC5\u63A5\u53D7\u7EDD\u5BF9\u8DEF\u5F84\uFF08\u652F\u6301\u5F00\u5934\u7684 ~/\uFF09\u3002").addText(
      (text) => text.setPlaceholder("\u7559\u7A7A\u81EA\u52A8\u63A2\u6D4B").setValue(this.plugin.settings.pythonExecutable).onChange(async (value) => {
        this.plugin.settings.pythonExecutable = value.trim();
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
