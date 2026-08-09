import path from 'node:path'

export const APP_ID = 'peng.screentime-dashboard'
export const CANONICAL_DASHBOARD_PATH = '/Users/peng/Documents/GitHub-Peng/ScreenTimeDashboard'
export const LEGACY_DASHBOARD_PATH = '/Users/peng/Documents/GitHub/PengCode/iPhoneScreenTimeDashboard'
export const CONFIG_SYNC_HEARTBEAT_MS = 15_000

export function resolveDashboardConfigSync({
  autoSync = true,
  currentMtimeMs = null,
  previousMtimeMs = null,
  lastAttemptAtMs = 0,
  nowMs = Date.now(),
  heartbeatMs = CONFIG_SYNC_HEARTBEAT_MS
} = {}) {
  const currentMtime = Number(currentMtimeMs)
  const previousMtime = Number(previousMtimeMs)
  const hasCurrentMtime = currentMtimeMs !== null && Number.isFinite(currentMtime)
  const hasPreviousMtime = previousMtimeMs !== null && Number.isFinite(previousMtime)
  const nextMtimeMs = hasCurrentMtime ? currentMtime : (hasPreviousMtime ? previousMtime : null)
  const configChanged = hasCurrentMtime && (!hasPreviousMtime || currentMtime !== previousMtime)
  const elapsedMs = Math.max(0, Number(nowMs) - Math.max(0, Number(lastAttemptAtMs) || 0))
  const heartbeatDue = elapsedMs >= Math.max(1, Number(heartbeatMs) || CONFIG_SYNC_HEARTBEAT_MS)
  return {
    shouldPush: Boolean(autoSync) && (configChanged || heartbeatDue),
    nextMtimeMs
  }
}

export function migrateDashboardPath(currentPath, { legacyExists, canonicalValid }) {
  const current = String(currentPath || '').trim()
  if (current === LEGACY_DASHBOARD_PATH && !legacyExists && canonicalValid) {
    return CANONICAL_DASHBOARD_PATH
  }
  return current || CANONICAL_DASHBOARD_PATH
}

export function validateRuntimeIdentity(runtime, expected) {
  if (!runtime || runtime.app_id !== APP_ID) {
    return { ok: false, message: '当前端口不是 ScreenTime Dashboard，已拒绝打开浏览器。' }
  }
  const expectedRoot = path.resolve(String(expected?.path || ''))
  const actualRoot = path.resolve(String(runtime.project_root || ''))
  if (!expectedRoot || actualRoot !== expectedRoot) {
    return {
      ok: false,
      message: `实际运行目录与插件配置不一致：${actualRoot || '未知'}（预期 ${expectedRoot || '未知'}）`
    }
  }
  const expectedMode = String(expected?.mode || '')
  const actualMode = String(runtime.mode || '')
  if (actualMode !== expectedMode) {
    return {
      ok: false,
      message: `Dashboard 启动模式不一致：${actualMode || '未知'}（预期 ${expectedMode || '未知'}）`
    }
  }
  return { ok: true, message: '' }
}
