import { app } from 'electron'
import { createHash } from 'node:crypto'
import { readdirSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, statSync, copyFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getUpdateInfo } from './updates.js'

/**
 * Hot update — patch only the files that changed.
 *
 * The app is packaged WITHOUT asar (build.asar = false), so the app
 * directory is plain files that can be replaced one by one:
 *
 *   1. The developer runs `npm run payload` → release/update-payload/
 *      containing manifest.json (sha256 per file) + the changed files,
 *      then uploads that folder to their web server (e.g. waiwai-it.com/app).
 *   2. The app fetches <serverUrl>/manifest.json, hashes its own files,
 *      downloads only the files whose hash differs, backs up the old ones
 *      and writes the new versions in place.
 *   3. The app relaunches to load the new code.
 *
 * This can update JS bundles, electron main-process code and config —
 * anything inside the app directory. The Electron runtime itself
 * (Frameworks/) cannot be patched this way; a dependency bump that needs
 * a new Electron binary still requires the full DMG.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** Packaged: <resources>/app/... — dev: project root. */
function appDir() {
  const candidate = path.resolve(__dirname, '..', '..')
  return candidate
}

function stateFile() {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return path.join(dir, 'hot-update-state.json')
}

function loadState() {
  try {
    return JSON.parse(readFileSync(stateFile(), 'utf8'))
  } catch {
    return {}
  }
}

function saveState(state) {
  try {
    writeFileSync(stateFile(), JSON.stringify(state, null, 2))
  } catch {
    /* best effort */
  }
}

/** Server URL: userData/hot-update-server.json wins over bundled default. */
export function getServerUrl() {
  const override = path.join(app.getPath('userData'), 'hot-update-server.json')
  try {
    const parsed = JSON.parse(readFileSync(override, 'utf8'))
    if (parsed.serverUrl) return String(parsed.serverUrl).replace(/\/+$/, '')
  } catch {
    /* fall through */
  }
  try {
    const bundled = JSON.parse(readFileSync(path.join(appDir(), 'config', 'hotupdate.json'), 'utf8'))
    if (bundled.serverUrl) return String(bundled.serverUrl).replace(/\/+$/, '')
  } catch {
    /* no config yet */
  }
  return null
}

export async function setServerUrl(url) {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const trimmed = String(url ?? '').trim()
  if (!trimmed) return { ok: false, error: 'URL ว่าง' }
  writeFileSync(path.join(dir, 'hot-update-server.json'), JSON.stringify({ serverUrl: trimmed.replace(/\/+$/, '') }, null, 2))
  return { ok: true, serverUrl: trimmed.replace(/\/+$/, '') }
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

/** Files the hot updater manages (everything that ships inside app/). */
const PATCHABLE = ['dist', 'electron', 'config']

function listAppFiles(baseDir) {
  const files = []
  for (const top of PATCHABLE) walk(path.join(baseDir, top))
  for (const extra of ['package.json']) {
    const full = path.join(baseDir, extra)
    if (existsSync(full)) files.push({ rel: extra, full })
  }
  return files

  function walk(dir) {
    let entries = []
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry)
      let stat
      try {
        stat = statSync(full)
      } catch {
        continue
      }
      if (stat.isDirectory()) walk(full)
      else files.push({ rel: path.relative(baseDir, full), full })
    }
  }
}

/** Compare local files against the server manifest. */
export async function checkHotUpdate() {
  const serverUrl = getServerUrl()
  const info = await getUpdateInfo()
  if (!serverUrl) {
    return { ok: false, error: 'ยังไม่ได้ตั้งค่า Update server URL', ...info }
  }

  let manifest
  try {
    const response = await fetch(`${serverUrl}/manifest.json`, { signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    manifest = await response.json()
  } catch (error) {
    return { ok: false, serverUrl, error: `ดึง manifest.json ไม่สำเร็จ: ${error?.message ?? error}`, ...info }
  }

  const baseDir = appDir()
  const remoteFiles = new Map(Object.entries(manifest.files ?? {}))
  const changed = []
  const upToDate = []
  const localFiles = listAppFiles(baseDir)
  const localRel = new Set(localFiles.map((f) => f.rel))

  for (const [rel, hash] of remoteFiles) {
    const full = path.join(baseDir, rel)
    const localHash = existsSync(full) ? sha256(readFileSync(full)) : null
    if (localHash !== hash) changed.push({ rel, remoteHash: hash, localHash })
    else upToDate.push(rel)
  }
  const removedLocally = [...localRel].filter((rel) => !remoteFiles.has(rel) && rel !== 'package.json')

  return {
    ok: true,
    serverUrl,
    serverVersion: manifest.version ?? null,
    currentVersion: info.version,
    versionMatches: manifest.version ? manifest.version === info.version : null,
    changed,
    changedCount: changed.length,
    upToDateCount: upToDate.length,
    extraLocalFiles: removedLocally,
    updateAvailable: changed.length > 0,
    manifestAt: manifest.builtAt ?? null
  }
}

/** Download only the changed files, back up the old ones, then relaunch. */
export async function applyHotUpdate() {
  const check = await checkHotUpdate()
  if (!check.ok) return check
  if (!check.updateAvailable) {
    return { ok: true, updated: false, message: 'ไฟล์ทั้งหมดเป็นเวอร์ชันล่าสุดแล้ว' }
  }

  const baseDir = appDir()
  const backupDir = path.join(app.getPath('userData'), 'hot-update-backup', Date.now().toString(36))
  const applied = []
  const failed = []

  for (const file of check.changed) {
    try {
      const response = await fetch(`${check.serverUrl}/${file.rel.split('/').map(encodeURIComponent).join('/')}`, {
        signal: AbortSignal.timeout(60000)
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const buffer = Buffer.from(await response.arrayBuffer())
      const hash = sha256(buffer)
      if (hash !== file.remoteHash) throw new Error('hash ไม่ตรงกับ manifest — ยกเลิกการแทนที่')

      const target = path.join(baseDir, file.rel)
      if (existsSync(target)) {
        mkdirSync(path.dirname(path.join(backupDir, file.rel)), { recursive: true })
        copyFileSync(target, path.join(backupDir, file.rel))
      }
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, buffer)
      applied.push(file.rel)
    } catch (error) {
      failed.push({ rel: file.rel, error: error?.message ?? String(error) })
    }
  }

  const state = { at: Date.now(), applied, failed, backupDir: applied.length ? backupDir : null, serverVersion: check.serverVersion }
  saveState({ ...(loadState() ?? {}), last: state })

  if (applied.length && !failed.length) {
    return { ok: true, updated: true, applied, backupDir, serverVersion: check.serverVersion, message: `อัปเดต ${applied.length} ไฟล์สำเร็จ — กด Restart เพื่อใช้โค้ดใหม่` }
  }
  return { ok: failed.length === 0, updated: applied.length > 0, applied, failed, backupDir, message: failed.length ? `บางไฟล์ล้มเหลว (${failed.length})` : 'สำเร็จ' }
}

/** Roll back to the pre-update backup. */
export async function rollbackHotUpdate() {
  const state = loadState()
  const backupDir = state?.last?.backupDir
  if (!backupDir || !existsSync(backupDir)) return { ok: false, error: 'ไม่มี backup ให้คืน' }

  let restored = 0
  for (const rel of state.last.applied ?? []) {
    const backup = path.join(backupDir, rel)
    if (existsSync(backup)) {
      copyFileSync(backup, path.join(appDir(), rel))
      restored++
    }
  }
  return { ok: true, restored, message: `คืนไฟล์กลับ ${restored} รายการ — กด Restart` }
}

/** Relaunch the app (used after a successful patch). */
export function relaunchApp() {
  app.relaunch()
  app.exit(0)
  return { ok: true }
}
