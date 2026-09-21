import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

export const PYTHON_PROBE_TIMEOUT_MS = 5_000
export const OUTPUT_TAIL_BYTES = 8 * 1024

export function appendBoundedTail(current, chunk, maxBytes = OUTPUT_TAIL_BYTES) {
  const previous = Buffer.isBuffer(current) ? current : Buffer.from(current || '')
  const addition = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk || '')
  const combined = Buffer.concat([previous, addition])
  return combined.length <= maxBytes ? combined : combined.subarray(combined.length - maxBytes)
}

function expandLeadingHome(value, homeDir) {
  if (value === '~') return homeDir
  if (value.startsWith('~/')) return path.join(homeDir, value.slice(2))
  return value
}

export function buildPythonCandidates({
  dashboardPath,
  homeDir = os.homedir(),
  envPath = process.env.PATH || ''
}) {
  const fixedCandidates = [
    path.join(dashboardPath, 'backend', '.venv', 'bin', 'python'),
    '/opt/homebrew/bin/python3.11',
    '/opt/homebrew/opt/python@3.11/bin/python3.11',
    '/usr/local/bin/python3.11',
    '/usr/local/opt/python@3.11/bin/python3.11',
    '/Library/Frameworks/Python.framework/Versions/3.11/bin/python3.11',
    path.join(homeDir, '.local', 'bin', 'python3.11'),
    path.join(homeDir, '.pyenv', 'shims', 'python3.11')
  ]
  const pathDirs = String(envPath).split(path.delimiter).filter(Boolean)
  const pathCandidates = [
    ...pathDirs.map((dir) => path.join(dir, 'python3.11')),
    ...pathDirs.map((dir) => path.join(dir, 'python3'))
  ]
  return [...new Set([...fixedCandidates, ...pathCandidates])]
}

export function isSupportedPythonVersion(version) {
  const match = String(version || '').trim().match(/^(\d+)\.(\d+)(?:\.(\d+))?$/)
  if (!match) return false
  const major = Number(match[1])
  const minor = Number(match[2])
  return major === 3 && minor >= 11
}

function summarizeOutput(buffer) {
  const text = Buffer.from(buffer || '').toString('utf8').trim().replace(/\s+/g, ' ')
  if (!text) return ''
  return text.length <= 512 ? text : text.slice(-512)
}

export async function probePythonExecutable(
  executable,
  { spawnImpl = spawn, timeoutMs = PYTHON_PROBE_TIMEOUT_MS } = {}
) {
  return new Promise((resolve) => {
    let stdout = Buffer.alloc(0)
    let stderr = Buffer.alloc(0)
    let settled = false
    let timedOut = false

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    let child
    try {
      child = spawnImpl(
        executable,
        ['-c', 'import sys; print("%d.%d.%d" % sys.version_info[:3])'],
        { shell: false, stdio: ['ignore', 'pipe', 'pipe'] }
      )
    } catch (error) {
      resolve({ ok: false, reason: String(error) })
      return
    }

    const timer = setTimeout(() => {
      timedOut = true
      try {
        child.kill()
      } catch {
        // The close/error handler will finish the probe.
      }
      finish({ ok: false, reason: `探测超时（${timeoutMs}ms）` })
    }, timeoutMs)

    child.stdout?.on('data', (chunk) => {
      stdout = appendBoundedTail(stdout, chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr = appendBoundedTail(stderr, chunk)
    })
    child.on('error', (error) => {
      finish({ ok: false, reason: String(error) })
    })
    child.on('close', (code, signal) => {
      if (timedOut) return
      const output = summarizeOutput(stdout) || summarizeOutput(stderr)
      if (code !== 0) {
        const status = code === null ? `signal ${signal || 'unknown'}` : `exit ${code}`
        finish({ ok: false, reason: output ? `${status}: ${output}` : status })
        return
      }
      if (!isSupportedPythonVersion(output)) {
        finish({ ok: false, reason: output ? `不支持的 Python 版本 ${output}` : '无法读取 Python 版本' })
        return
      }
      finish({ ok: true, version: output })
    })
  })
}

export async function resolvePythonExecutable({
  dashboardPath,
  configuredPath = '',
  homeDir = os.homedir(),
  envPath = process.env.PATH || '',
  probe = probePythonExecutable
}) {
  const configured = String(configuredPath || '').trim()
  if (configured) {
    const executable = expandLeadingHome(configured, homeDir)
    if (!path.isAbsolute(executable)) {
      throw new Error('配置的 Python 解释器必须是绝对路径（仅支持开头的 ~/ 展开）')
    }
    const result = await probe(executable)
    if (result.ok && isSupportedPythonVersion(result.version)) {
      return { executable, version: result.version, source: 'configured' }
    }
    const reason = result.reason || `不支持的 Python 版本 ${result.version || 'unknown'}`
    throw new Error(`配置的 Python 解释器不可用：${executable}（${reason}）`)
  }

  const attempts = []
  for (const executable of buildPythonCandidates({ dashboardPath, homeDir, envPath })) {
    const result = await probe(executable)
    if (result.ok && isSupportedPythonVersion(result.version)) {
      return { executable, version: result.version, source: 'automatic' }
    }
    attempts.push({
      executable,
      reason: result.reason || `不支持的 Python 版本 ${result.version || 'unknown'}`
    })
  }

  const detail = attempts.map(({ executable, reason }) => `${executable}: ${reason}`).join('; ')
  throw new Error(`未找到可用的 Python 3.11+。已尝试：${detail}`)
}
