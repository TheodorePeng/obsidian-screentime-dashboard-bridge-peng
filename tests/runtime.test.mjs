import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

import {
  APP_ID,
  CANONICAL_DASHBOARD_PATH,
  CONFIG_SYNC_HEARTBEAT_MS,
  LEGACY_DASHBOARD_PATH,
  migrateDashboardPath,
  resolveDashboardConfigSync,
  validateRuntimeIdentity
} from '../src/runtime.mjs'

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

test('plugin release files and source declare version 0.1.3', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const lockJson = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))
  const versions = JSON.parse(readFileSync(new URL('../versions.json', import.meta.url), 'utf8'))
  const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')

  assert.equal(packageJson.version, '0.1.3')
  assert.equal(lockJson.version, '0.1.3')
  assert.equal(lockJson.packages[''].version, '0.1.3')
  assert.equal(manifest.version, '0.1.3')
  assert.equal(versions['0.1.3'], '1.5.0')
  assert.match(source, /\/api\/system\/runtime/)
  assert.match(source, /validateRuntimeIdentity/)
  assert.match(source, /start\.py 与 stop\.py/)
})

test('release attaches BRAT-required assets (main.js, manifest.json, styles.css)', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))
  const version = manifest.version
  const repo = 'TheodorePeng/obsidian-screentime-dashboard-bridge-peng'
  const out = execFileSync(
    'gh',
    ['release', 'view', version, '--repo', repo, '--json', 'assets'],
    { encoding: 'utf8' }
  )
  const names = JSON.parse(out).assets.map(a => a.name).sort()
  assert.deepEqual(names, ['main.js', 'manifest.json', 'styles.css'])
})
