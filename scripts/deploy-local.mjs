import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const ASSETS = ['main.js', 'manifest.json', 'styles.css']
const PLUGIN_ID = 'screen-time-dashboard-bridge'
const VAULT_NAME = process.env.SCREENTIME_OBSIDIAN_VAULT || 'My Obsidian'
const VAULT_ROOT = process.env.SCREENTIME_OBSIDIAN_VAULT_PATH
  || '/Users/peng/Library/Mobile Documents/iCloud~md~obsidian/Documents/My Obsidian'
const sourceRoot = path.resolve(import.meta.dirname, '..')
const targetRoot = path.join(VAULT_ROOT, '.obsidian', 'plugins', PLUGIN_ID)

async function sha256(filePath) {
  const data = await readFile(filePath)
  return createHash('sha256').update(data).digest('hex')
}

async function existing(filePath) {
  try {
    return (await stat(filePath)).isFile()
  } catch {
    return false
  }
}

async function copyAssets(fromRoot, toRoot) {
  await mkdir(toRoot, { recursive: true })
  for (const asset of ASSETS) await copyFile(path.join(fromRoot, asset), path.join(toRoot, asset))
}

const backupRoot = await mkdtemp(path.join(os.tmpdir(), 'screentime-bridge-deploy.'))
await chmod(backupRoot, 0o700)
await mkdir(targetRoot, { recursive: true })
const hadAsset = Object.fromEntries(await Promise.all(ASSETS.map(async (asset) => [asset, await existing(path.join(targetRoot, asset))])))
for (const asset of ASSETS) {
  if (hadAsset[asset]) await copyFile(path.join(targetRoot, asset), path.join(backupRoot, asset))
}

let deployedHashes = null
try {
  await copyAssets(sourceRoot, targetRoot)
  const sourceHashes = Object.fromEntries(await Promise.all(ASSETS.map(async (asset) => [asset, await sha256(path.join(sourceRoot, asset))])))
  deployedHashes = Object.fromEntries(await Promise.all(ASSETS.map(async (asset) => [asset, await sha256(path.join(targetRoot, asset))])))
  if (JSON.stringify(sourceHashes) !== JSON.stringify(deployedHashes)) throw new Error('deployed asset hash mismatch')
  const sourceManifest = JSON.parse(await readFile(path.join(sourceRoot, 'manifest.json'), 'utf8'))
  const manifest = JSON.parse(await readFile(path.join(targetRoot, 'manifest.json'), 'utf8'))
  if (manifest.id !== PLUGIN_ID) throw new Error(`unexpected manifest id: ${manifest.id}`)
  if (manifest.version !== sourceManifest.version) throw new Error(`unexpected manifest version: ${manifest.version}`)
  execFileSync('obsidian', [`vault=${VAULT_NAME}`, 'plugin:reload', `id=${PLUGIN_ID}`], { stdio: 'inherit' })
  process.stdout.write(`${JSON.stringify({ ok: true, backupRoot, sourceHashes, deployedHashes })}\n`)
} catch (error) {
  if (deployedHashes) {
    const currentHashes = Object.fromEntries(await Promise.all(ASSETS.map(async (asset) => [asset, await sha256(path.join(targetRoot, asset))])))
    if (JSON.stringify(currentHashes) === JSON.stringify(deployedHashes)) {
      for (const asset of ASSETS) {
        if (hadAsset[asset]) await copyFile(path.join(backupRoot, asset), path.join(targetRoot, asset))
        else await rm(path.join(targetRoot, asset), { force: true })
      }
    }
  }
  process.stderr.write(`Local deployment failed; backup: ${backupRoot}; ${String(error)}\n`)
  process.exitCode = 1
}
