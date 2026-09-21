import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'

import {
  APP_ID,
  CANONICAL_DASHBOARD_PATH,
  CONFIG_SYNC_HEARTBEAT_MS,
  LEGACY_DASHBOARD_PATH,
  migrateDashboardPath,
  resolveDashboardConfigSync,
  validateRuntimeIdentity
} from '../src/runtime.mjs'
import {
  OUTPUT_TAIL_BYTES,
  appendBoundedTail,
  buildPythonCandidates,
  isSupportedPythonVersion,
  resolvePythonExecutable
} from '../src/python-runtime.mjs'

function makeProbe(results, attempts = []) {
  return async (executable) => {
    attempts.push(executable)
    return results.get(executable) || { ok: false, reason: 'not found' }
  }
}

test('minimal GUI PATH bypasses exit-69 system Python and selects Homebrew Python 3.11', async () => {
  const attempts = []
  const results = new Map([
    ['/usr/bin/python3', { ok: false, reason: 'exit 69: Xcode license not accepted' }],
    ['/opt/homebrew/bin/python3.11', { ok: true, version: '3.11.16' }]
  ])

  const resolved = await resolvePythonExecutable({
    dashboardPath: '/dashboard',
    configuredPath: '',
    homeDir: '/Users/test',
    envPath: '/usr/bin:/bin',
    probe: makeProbe(results, attempts)
  })

  assert.equal(resolved.executable, '/opt/homebrew/bin/python3.11')
  assert.equal(resolved.version, '3.11.16')
  assert.equal(attempts.includes('/usr/bin/python3'), false)
})

test('healthy project virtualenv wins and a broken one falls back', async () => {
  const venv = '/dashboard/backend/.venv/bin/python'
  const homebrew = '/opt/homebrew/bin/python3.11'

  const healthy = await resolvePythonExecutable({
    dashboardPath: '/dashboard',
    configuredPath: '',
    homeDir: '/Users/test',
    envPath: '/usr/bin:/bin',
    probe: makeProbe(new Map([[venv, { ok: true, version: '3.11.16' }]]))
  })
  assert.equal(healthy.executable, venv)

  const attempts = []
  const fallback = await resolvePythonExecutable({
    dashboardPath: '/dashboard',
    configuredPath: '',
    homeDir: '/Users/test',
    envPath: '/usr/bin:/bin',
    probe: makeProbe(new Map([
      [venv, { ok: false, reason: 'broken symlink' }],
      [homebrew, { ok: true, version: '3.11.16' }]
    ]), attempts)
  })
  assert.equal(fallback.executable, homebrew)
  assert.deepEqual(attempts.slice(0, 2), [venv, homebrew])
})

test('candidate construction is ordered and deduplicated', () => {
  const candidates = buildPythonCandidates({
    dashboardPath: '/dashboard',
    homeDir: '/Users/test',
    envPath: '/opt/homebrew/bin:/usr/bin:/opt/homebrew/bin'
  })

  assert.equal(candidates[0], '/dashboard/backend/.venv/bin/python')
  assert.equal(candidates[1], '/opt/homebrew/bin/python3.11')
  assert.equal(candidates.filter((candidate) => candidate === '/opt/homebrew/bin/python3.11').length, 1)
  assert.ok(candidates.indexOf('/usr/bin/python3.11') < candidates.indexOf('/usr/bin/python3'))
})

test('Python 3.11 and newer are supported while 3.10 is rejected', () => {
  assert.equal(isSupportedPythonVersion('3.10.14'), false)
  assert.equal(isSupportedPythonVersion('3.11.0'), true)
  assert.equal(isSupportedPythonVersion('3.12.9'), true)
  assert.equal(isSupportedPythonVersion('3.14.7'), true)
  assert.equal(isSupportedPythonVersion('not a version'), false)
})

test('explicit override wins and invalid override fails closed', async () => {
  const configured = '/custom/python3.11'
  const attempts = []
  const resolved = await resolvePythonExecutable({
    dashboardPath: '/dashboard',
    configuredPath: configured,
    homeDir: '/Users/test',
    envPath: '/opt/homebrew/bin:/usr/bin',
    probe: makeProbe(new Map([[configured, { ok: true, version: '3.11.9' }]]), attempts)
  })
  assert.equal(resolved.executable, configured)
  assert.deepEqual(attempts, [configured])

  await assert.rejects(
    resolvePythonExecutable({
      dashboardPath: '/dashboard',
      configuredPath: configured,
      homeDir: '/Users/test',
      envPath: '/opt/homebrew/bin:/usr/bin',
      probe: makeProbe(new Map([[configured, { ok: false, reason: 'permission denied' }]]), attempts)
    }),
    /配置的 Python 解释器不可用.*permission denied/
  )
  assert.equal(attempts.at(-1), configured)
})

test('explicit override must be absolute and supports leading home expansion only', async () => {
  await assert.rejects(
    resolvePythonExecutable({
      dashboardPath: '/dashboard',
      configuredPath: '$HOME/bin/python3.11',
      homeDir: '/Users/test',
      envPath: '',
      probe: makeProbe(new Map())
    }),
    /必须是绝对路径/
  )

  const resolved = await resolvePythonExecutable({
    dashboardPath: '/dashboard',
    configuredPath: '~/.pyenv/shims/python3.11',
    homeDir: '/Users/test',
    envPath: '',
    probe: makeProbe(new Map([
      ['/Users/test/.pyenv/shims/python3.11', { ok: true, version: '3.11.8' }]
    ]))
  })
  assert.equal(resolved.executable, '/Users/test/.pyenv/shims/python3.11')
})

test('all unavailable candidates produce stable actionable diagnostics', async () => {
  await assert.rejects(
    resolvePythonExecutable({
      dashboardPath: '/dashboard',
      configuredPath: '',
      homeDir: '/Users/test',
      envPath: '/usr/bin',
      probe: async (candidate) => ({ ok: false, reason: candidate === '/usr/bin/python3' ? 'exit 69' : 'not found' })
    }),
    (error) => {
      assert.match(error.message, /未找到可用的 Python 3\.11\+/)
      assert.match(error.message, /\/dashboard\/backend\/\.venv\/bin\/python: not found/)
      assert.match(error.message, /\/usr\/bin\/python3: exit 69/)
      return true
    }
  )
})

test('bounded output retains only the latest bytes', () => {
  const first = Buffer.alloc(OUTPUT_TAIL_BYTES, 'a')
  const next = Buffer.from('TAIL')
  const result = appendBoundedTail(first, next)

  assert.equal(result.length, OUTPUT_TAIL_BYTES)
  assert.equal(result.subarray(-4).toString(), 'TAIL')
})

test('legacy missing path migrates to the valid canonical checkout', () => {
  assert.equal(
    migrateDashboardPath(LEGACY_DASHBOARD_PATH, { legacyExists: false, canonicalValid: true }),
    CANONICAL_DASHBOARD_PATH
  )
})

test('valid custom paths and existing legacy paths are preserved', () => {
  assert.equal(
    migrateDashboardPath('/tmp/custom-dashboard', { legacyExists: false, canonicalValid: true }),
    '/tmp/custom-dashboard'
  )
  assert.equal(
    migrateDashboardPath(LEGACY_DASHBOARD_PATH, { legacyExists: true, canonicalValid: true }),
    LEGACY_DASHBOARD_PATH
  )
})

test('runtime validation requires app id, canonical root, and launch mode', () => {
  const expected = { path: CANONICAL_DASHBOARD_PATH, mode: 'dev' }
  assert.deepEqual(validateRuntimeIdentity({
    app_id: APP_ID,
    project_root: CANONICAL_DASHBOARD_PATH,
    mode: 'dev'
  }, expected), { ok: true, message: '' })

  const mismatch = validateRuntimeIdentity({
    app_id: APP_ID,
    project_root: '/tmp/old-worktree',
    mode: 'dev'
  }, expected)
  assert.equal(mismatch.ok, false)
  assert.match(mismatch.message, /实际运行目录/)
})

test('config sync pushes on change and retries on heartbeat', () => {
  assert.deepEqual(resolveDashboardConfigSync({
    currentMtimeMs: 20,
    previousMtimeMs: 10,
    lastAttemptAtMs: 9_000,
    nowMs: 10_000
  }), { shouldPush: true, nextMtimeMs: 20 })

  assert.deepEqual(resolveDashboardConfigSync({
    currentMtimeMs: 20,
    previousMtimeMs: 20,
    lastAttemptAtMs: 10_000,
    nowMs: 10_000 + CONFIG_SYNC_HEARTBEAT_MS - 1
  }), { shouldPush: false, nextMtimeMs: 20 })

  assert.deepEqual(resolveDashboardConfigSync({
    currentMtimeMs: null,
    previousMtimeMs: 20,
    lastAttemptAtMs: 10_000,
    nowMs: 10_000 + CONFIG_SYNC_HEARTBEAT_MS
  }), { shouldPush: true, nextMtimeMs: 20 })
})

test('plugin release files and source declare version 0.1.5', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const lockJson = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))
  const versions = JSON.parse(readFileSync(new URL('../versions.json', import.meta.url), 'utf8'))
  const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')

  assert.equal(packageJson.version, '0.1.5')
  assert.equal(lockJson.version, '0.1.5')
  assert.equal(lockJson.packages[''].version, '0.1.5')
  assert.equal(manifest.version, '0.1.5')
  assert.equal(versions['0.1.5'], '1.5.0')
  assert.match(source, /\/api\/system\/runtime/)
  assert.match(source, /validateRuntimeIdentity/)
  assert.match(source, /start\.py 与 stop\.py/)
})

test('plugin source resolves an explicit Python executable for start and stop', () => {
  const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
  assert.match(source, /pythonExecutable: string/)
  assert.match(source, /resolvePythonExecutable/)
  assert.match(source, /stage: "启动 Dashboard"/)
  assert.match(source, /stage: "停止 Dashboard"/)
  assert.doesNotMatch(source, /spawn\("python3"/)
  assert.doesNotMatch(source, /stdio: "ignore"/)
})

test('local BRAT-required assets exist and are nonempty without network access', () => {
  for (const asset of ['main.js', 'manifest.json', 'styles.css']) {
    assert.ok(statSync(new URL(`../${asset}`, import.meta.url)).size > 0, `${asset} should be nonempty`)
  }
})
