export const PYTHON_PROBE_TIMEOUT_MS: number
export const OUTPUT_TAIL_BYTES: number

export interface PythonProbeSuccess {
  ok: true
  version: string
}

export interface PythonProbeFailure {
  ok: false
  reason: string
}

export type PythonProbeResult = PythonProbeSuccess | PythonProbeFailure
export type PythonProbe = (executable: string) => Promise<PythonProbeResult>

export function appendBoundedTail(
  current: Buffer | Uint8Array | string,
  chunk: Buffer | Uint8Array | string,
  maxBytes?: number
): Buffer

export function buildPythonCandidates(options: {
  dashboardPath: string
  homeDir?: string
  envPath?: string
}): string[]

export function isSupportedPythonVersion(version: string): boolean

export function probePythonExecutable(
  executable: string,
  options?: { timeoutMs?: number }
): Promise<PythonProbeResult>

export function resolvePythonExecutable(options: {
  dashboardPath: string
  configuredPath?: string
  homeDir?: string
  envPath?: string
  probe?: PythonProbe
}): Promise<{ executable: string; version: string; source: "configured" | "automatic" }>
