import { existsSync, accessSync, constants } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { run } from './exec.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** macOS system commands the app relies on. All ship with macOS by default. */
export const REQUIRED_COMMANDS = [
  { bin: '/bin/ps', purpose: 'process list' },
  { bin: '/usr/bin/top', purpose: 'system CPU / load' },
  { bin: '/usr/bin/vm_stat', purpose: 'memory breakdown' },
  { bin: '/usr/sbin/sysctl', purpose: 'CPU / hardware info' },
  { bin: '/bin/df', purpose: 'storage usage' },
  { bin: '/usr/sbin/lsof', purpose: 'open files & sockets' },
  { bin: '/usr/bin/pmset', purpose: 'thermal & power' },
  { bin: '/usr/bin/osascript', purpose: 'privileged & power actions' },
  { bin: '/usr/bin/caffeinate', purpose: 'keep-awake timer' },
  { bin: '/usr/bin/renice', purpose: 'priority changes' }
]

/**
 * Verify the packaged app is complete and every required system tool is
 * present. Returns { ok, missingAppFiles, missingCommands }.
 */
export async function checkDependencies() {
  const missingAppFiles = ['../../dist/index.html', '../preload.cjs']
    .map((rel) => path.resolve(__dirname, rel))
    .filter((p) => !existsSync(p))

  const missingCommands = []
  for (const { bin, purpose } of REQUIRED_COMMANDS) {
    let usable = existsSync(bin)
    if (usable) {
      try {
        accessSync(bin, constants.X_OK)
      } catch {
        usable = false
      }
    }
    if (!usable) missingCommands.push({ bin, purpose })
  }

  return { ok: missingAppFiles.length === 0 && missingCommands.length === 0, missingAppFiles, missingCommands }
}

/** Try to make a missing, non-executable tool executable again (best effort). */
export async function repairDependencies(missing) {
  const results = []
  for (const { bin } of missing.filter((m) => m.bin)) {
    if (existsSync(bin)) {
      const fix = await run('/bin/chmod', ['+x', bin])
      results.push({ bin, ok: fix.ok, error: fix.stderr || fix.error?.message || null })
    } else {
      results.push({ bin, ok: false, error: 'not found on this system' })
    }
  }
  return results
}
