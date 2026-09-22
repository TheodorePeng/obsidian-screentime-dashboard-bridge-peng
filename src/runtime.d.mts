export const APP_ID: string
export const CANONICAL_DASHBOARD_PATH: string
export const LEGACY_DASHBOARD_PATH: string
export const CONFIG_SYNC_RETRY_DELAYS_MS: readonly number[]
export function buildStableSignature(value: unknown): string

export function resolveDashboardConfigSync(options?: {
  autoSync?: boolean
  currentMtimeMs?: number | null
  previousMtimeMs?: number | null
  currentSignature?: string
  lastSuccessfulSignature?: string
  failedAttempts?: number
  lastAttemptAtMs?: number
  nowMs?: number
  force?: boolean
}): { shouldPush: boolean; nextMtimeMs: number | null }

export function migrateDashboardPath(
  currentPath: string,
  options: { legacyExists: boolean; canonicalValid: boolean }
): string

export function validateRuntimeIdentity(
  runtime: Record<string, unknown> | null | undefined,
  expected: { path: string; mode: string }
): { ok: boolean; message: string }
