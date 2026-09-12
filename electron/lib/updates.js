import { app } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Version + update system.
 *
 * The app knows its own version (package.json), and can talk to the git
 * remote to:
 *   - report the current branch / commit / remote
 *   - check whether the remote has newer commits (code or dependencies)
 *   - apply the update: git pull → npm install (only if dependencies
 *     changed) → vite build
 *
 * Developer-page content is editable by changing `config/developer.json`
 * directly on GitHub — the app fetches the raw file from the remote and
 * prefers it over the bundled copy.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')

function git(args, timeoutMs = 30000) {
  return new Promise((resolve) => {
    execFile(
      '/usr/bin/env',
      ['git', ...args],
      { cwd: PROJECT_ROOT, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => resolve({ ok: !error, stdout: stdout ?? '', stderr: stderr ?? '', error })
    )
  })
}

function npm(args, timeoutMs = 600000) {
  return new Promise((resolve) => {
    execFile(
      '/usr/bin/env',
      ['npm', ...args],
      { cwd: PROJECT_ROOT, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, PATH: `/usr/local/bin:${process.env.PATH ?? ''}` } },
      (error, stdout, stderr) => resolve({ ok: !error, stdout: stdout ?? '', stderr: stderr ?? '', error })
    )
  })
}

export async function getUpdateInfo() {
  const version = app.getVersion()
  const branchRes = await git(['rev-parse', '--abbrev-ref', 'HEAD'])
  const headRes = await git(['log', '-1', '--format=%h %cI %s'])
  const remoteRes = await git(['remote', 'get-url', 'origin'])
  const [headHash, headDate, ...rest] = (headRes.stdout ?? '').trim().split(' ')

  return {
    ok: true,
    version,
    branch: branchRes.stdout?.trim() ?? null,
    head: {
      hash: headHash ?? null,
      date: headDate ?? null,
      message: rest.join(' ') ?? null
    },
    remote: remoteRes.stdout?.trim() ?? null,
    projectRoot: PROJECT_ROOT
  }
}

/** Fetch the remote and list commits we are behind. */
export async function checkForUpdates() {
  const info = await getUpdateInfo()
  const branch = info.branch ?? 'main'

  const fetch = await git(['fetch', 'origin', '--quiet'], 60000)
  if (!fetch.ok) {
    return { ...info, ok: false, error: `git fetch failed: ${fetch.stderr || fetch.error?.message}` }
  }

  const behindRes = await git(['rev-list', '--count', `HEAD..origin/${branch}`])
  const logRes = await git(['log', `HEAD..origin/${branch}`, '--format=%h %s'])
  const depsRes = await git(['diff', '--name-only', `HEAD..origin/${branch}`, 'package.json', 'package-lock.json'])

  const behind = Number(behindRes.stdout?.trim() || 0)
  return {
    ...info,
    ok: true,
    behind,
    updateAvailable: behind > 0,
    newCommits: (logRes.stdout ?? '').trim().split('\n').filter(Boolean),
    dependenciesChanged: Boolean((depsRes.stdout ?? '').trim())
  }
}

/**
 * Pull the remote, install dependencies when they changed, and rebuild the
 * renderer bundle so the running app picks the new code after a reload.
 */
export async function applyUpdate() {
  const check = await checkForUpdates()
  if (!check.ok) return check
  if (!check.updateAvailable) {
    return { ok: true, updated: false, message: 'เป็นเวอร์ชันล่าสุดแล้ว — ไม่มีอะไรต้องอัปเดต' }
  }

  const steps = []
  const pull = await git(['pull', '--ff-only', 'origin', check.branch], 120000)
  steps.push({ step: 'git pull', ok: pull.ok, output: (pull.stdout + pull.stderr).trim() })
  if (!pull.ok) return { ok: false, steps, error: 'git pull failed' }

  if (check.dependenciesChanged) {
    const install = await npm(['install'], 900000)
    steps.push({ step: 'npm install (dependencies changed)', ok: install.ok, output: (install.stdout + install.stderr).trim().slice(-4000) })
    if (!install.ok) return { ok: false, steps, error: 'npm install failed' }
  }

  const build = await npm(['run', 'build'], 300000)
  steps.push({ step: 'npm run build', ok: build.ok, output: (build.stdout + build.stderr).trim().slice(-4000) })
  if (!build.ok) return { ok: false, steps, error: 'build failed' }

  const version = app.getVersion()
  return { ok: true, updated: true, version, steps, message: 'อัปเดตสำเร็จ — รีสตาร์ทแอปเพื่อใช้โค้ดใหม่ทั้งหมด' }
}

/** Local bundled developer content (config/developer.json). */
function localDeveloperContent() {
  const file = path.join(PROJECT_ROOT, 'config', 'developer.json')
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** Raw GitHub base URL derived from the git remote. */
async function rawBaseUrl() {
  const remoteRes = await git(['remote', 'get-url', 'origin'])
  const remote = (remoteRes.stdout ?? '').trim()
  const match = remote.match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/i)
  if (!match) return null
  const branchRes = await git(['rev-parse', '--abbrev-ref', 'HEAD'])
  return `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${branchRes.stdout?.trim() || 'main'}`
}

/**
 * Developer-page content: bundled config/developer.json merged with the
 * copy on GitHub (remote wins), so editing the file on GitHub updates the
 * page without rebuilding the app.
 */
export async function getDeveloperContent() {
  const local = localDeveloperContent() ?? {}
  const base = await rawBaseUrl()
  if (!base) return { ok: true, source: 'local', content: local }

  try {
    const response = await fetch(`${base}/config/developer.json`, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const remote = await response.json()
    return { ok: true, source: 'remote', url: `${base}/config/developer.json`, content: { ...local, ...remote } }
  } catch (error) {
    return { ok: true, source: 'local', error: error?.message ?? String(error), content: local }
  }
}
