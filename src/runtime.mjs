import path from 'node:path'

export const APP_ID = 'peng.screentime-dashboard'
export const CANONICAL_DASHBOARD_PATH = '/Users/peng/Documents/GitHub-Peng/ScreenTimeDashboard'
export const LEGACY_DASHBOARD_PATH = '/Users/peng/Documents/GitHub/PengCode/iPhoneScreenTimeDashboard'

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
