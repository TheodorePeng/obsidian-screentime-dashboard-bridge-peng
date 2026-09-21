export const APP_ID: string
export const CANONICAL_DASHBOARD_PATH: string
export const LEGACY_DASHBOARD_PATH: string
export const CONFIG_SYNC_HEARTBEAT_MS: number

export function resolveDashboardConfigSync(options?: {
  autoSync?: boolean
  currentMtimeMs?: number | null
  previousMtimeMs?: number | null
  lastAttemptAtMs?: number
  nowMs?: number
  heartbeatMs?: number
}): { shouldPush: boolean; nextMtimeMs: number | null }

export function migrateDashboardPath(
  currentPath: string,
  options: { legacyExists: boolean; canonicalValid: boolean }
): string

export function validateRuntimeIdentity(
  runtime: Record<string, unknown> | null | undefined,
  expected: { path: string; mode: string }
): { ok: boolean; message: string }
