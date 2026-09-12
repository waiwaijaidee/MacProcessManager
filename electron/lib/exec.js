import { execFile } from 'node:child_process'

/**
 * Promise wrapper around `execFile` that never rejects.
 * Every caller gets a predictable `{ ok, stdout, stderr, code, error }` shape
 * which keeps the IPC handlers free of try/catch noise.
 *
 * @param {string} command absolute or PATH-resolvable binary name
 * @param {string[]} args
 * @param {{ timeout?: number, maxBuffer?: number }} [options]
 */
export function run(command, args = [], options = {}) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        maxBuffer: options.maxBuffer ?? 32 * 1024 * 1024,
        timeout: options.timeout ?? 20000,
        encoding: 'utf8',
        windowsHide: true
      },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          code: error?.code ?? 0,
          signal: error?.signal ?? null,
          error: error ?? null
        })
      }
    )
  })
}

/** Run a shell snippet (used only for a couple of read-only pipelines). */
export function runShell(script, options = {}) {
  return run('/bin/sh', ['-c', script], options)
}

/** `true` when the given pid is alive and signalable by this user. */
export function isAlive(pid) {
  try {
    process.kill(Number(pid), 0)
    return true
  } catch (err) {
    // EPERM means it exists but belongs to someone else.
    return err?.code === 'EPERM'
  }
}
