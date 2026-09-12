import os from 'node:os'
import { isAlive, run, runShell } from './exec.js'
import { formatBytes, formatDuration } from './parse.js'
import { getProcesses } from './processes.js'

/** Signals exposed in the UI. Values are the BSD constants macOS expects. */
export const SIGNALS = {
  TERM: { name: 'SIGTERM', number: 15, label: 'Quit (SIGTERM)', grace: true },
  KILL: { name: 'SIGKILL', number: 9, label: 'Force Kill (SIGKILL)', grace: false },
  INT: { name: 'SIGINT', number: 2, label: 'Interrupt (SIGINT)', grace: true },
  HUP: { name: 'SIGHUP', number: 1, label: 'Hang Up (SIGHUP)', grace: true },
  STOP: { name: 'SIGSTOP', number: 19, label: 'Suspend (SIGSTOP)', grace: false },
  CONT: { name: 'SIGCONT', number: 18, label: 'Resume (SIGCONT)', grace: false }
}

/** PIDs that must never be signalled from the UI. */
const PROTECTED = new Set([0, 1])

function validateTarget(pid) {
  const value = Number(pid)
  if (!Number.isInteger(value) || value <= 0) return { ok: false, error: 'Invalid PID.' }
  if (PROTECTED.has(value)) {
    return { ok: false, error: `PID ${value} is protected and cannot be managed.` }
  }
  if (value === process.pid) return { ok: false, error: 'Refusing to signal this application.' }
  return { ok: true, pid: value }
}

/** Escape a value for safe interpolation inside an AppleScript string literal. */
function appleScriptQuote(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * Send a signal with `process.kill` when the target belongs to the current
 * user, otherwise escalate through `osascript ... with administrator privileges`.
 */
export async function signalProcess({ pid, signal = 'TERM', elevated = false }) {
  const target = validateTarget(pid)
  if (!target.ok) return target

  const spec = SIGNALS[String(signal).replace(/^SIG/i, '').toUpperCase()]
  if (!spec) return { ok: false, error: `Unsupported signal: ${signal}` }

  if (!isAlive(target.pid)) {
    return { ok: false, error: `Process ${target.pid} is not running.` }
  }

  if (!elevated) {
    try {
      process.kill(target.pid, spec.number)
      return {
        ok: true,
        pid: target.pid,
        signal: spec.name,
        elevated: false,
        message: `Sent ${spec.name} to PID ${target.pid}.`
      }
    } catch (err) {
      if (err?.code !== 'EPERM') {
        return { ok: false, pid: target.pid, error: err?.message || `${spec.name} failed.` }
      }
      // Fall through to the privileged path so the user only sees one error.
    }
  }

  const script = `/bin/kill -s ${spec.number} ${target.pid}`
  const result = await run('/usr/bin/osascript', [
    '-e',
    `do shell script ${appleScriptQuote(script)} with administrator privileges`
  ])

  if (result.ok) {
    return {
      ok: true,
      pid: target.pid,
      signal: spec.name,
      elevated: true,
      message: `Sent ${spec.name} to PID ${target.pid} as administrator.`
    }
  }

  const stderr = result.stderr.trim()
  const cancelled = /User canceled|-128/.test(stderr)
  return {
    ok: false,
    pid: target.pid,
    error: cancelled
      ? 'Administrator authorisation was cancelled.'
      : stderr || `${spec.name} failed for PID ${target.pid}.`
  }
}

/** Graceful SIGTERM followed (optionally) by a SIGKILL escalation. */
export async function killProcess({ pid, force = false, elevated = false, escalateMs = 3000 }) {
  const first = await signalProcess({ pid, signal: force ? 'KILL' : 'TERM', elevated })
  if (!first.ok || force || escalateMs <= 0) return first

  // Poll for the exit instead of sleeping the whole escalation window, so the
  // UI can report success the moment the process is actually gone.
  const deadline = Date.now() + escalateMs
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 120))
    if (!isAlive(pid)) {
      return {
        ...first,
        exited: true,
        escalated: false,
        message: `PID ${pid} exited after SIGTERM.`
      }
    }
  }

  const second = await signalProcess({ pid, signal: 'KILL', elevated })
  return {
    ...second,
    escalated: true,
    message: second.ok
      ? `PID ${pid} ignored SIGTERM - escalated to SIGKILL.`
      : second.error
  }
}

/** Change scheduling priority within the user's allowed range (-20..20). */
export async function reniceProcess({ pid, nice, elevated = false }) {
  const target = validateTarget(pid)
  if (!target.ok) return target

  const value = Number(nice)
  if (!Number.isInteger(value) || value < -20 || value > 20) {
    return { ok: false, error: 'Nice value must be an integer between -20 and 20.' }
  }

  const args = ['-n', String(value)]
  if (elevated) args.push('-p', String(target.pid))
  else args.push(String(target.pid))

  const command = elevated
    ? ['/usr/bin/osascript', ['-e', `do shell script ${appleScriptQuote(['/usr/bin/renice', ...args].join(' '))} with administrator privileges`]]
    : ['/usr/bin/renice', args]

  const result = await run(command[0], command[1])
  if (!result.ok) {
    const stderr = result.stderr.trim()
    return {
      ok: false,
      pid: target.pid,
      error: /not permitted|operation not permitted|permission denied/i.test(stderr)
        ? 'Permission denied. Priority values below 0 require the administrator option.'
        : stderr || 'renice failed.'
    }
  }

  return { ok: true, pid: target.pid, nice: value, message: `PID ${target.pid} nice set to ${value}.` }
}

/**
 * `lsof -F` emits a documented field format. We only keep `f` (fd),
 * `t` (type), `a` (access) and `n` (name), enough for a readable list.
 */
function parseLsof(stdout) {
  const entries = []
  let current = null

  for (const line of stdout.split('\n')) {
    if (!line) continue
    const tag = line.charAt(0)
    const value = line.slice(1)

    if (tag === 'f') {
      if (current) entries.push(current)
      current = { fd: value, type: 'UNKNOWN', access: '', name: '' }
    } else if (current) {
      if (tag === 't') current.type = value.trim()
      else if (tag === 'a') current.access = value.trim()
      else if (tag === 'n') current.name = value
    }
  }
  if (current) entries.push(current)

  return entries
}

function classifyFile(entry) {
  if (/^IPv|^TCP|^UDP/.test(entry.type) || /->/.test(entry.name)) return 'network'
  if (entry.type === 'DIR') return 'directory'
  if (entry.type === 'CHR') return 'device'
  if (entry.type === 'PIPE' || entry.type === 'FIFO') return 'pipe'
  if (entry.type === 'REG') return 'file'
  if (entry.type === 'KQUEUE' || entry.type === 'systm' || entry.type === 'psxshm') return 'system'
  return 'other'
}

async function readCwd(pid) {
  const { stdout } = await run('/usr/sbin/lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'])
  const line = stdout.split('\n').find((l) => l.startsWith('n'))
  if (!line) return null
  const value = line.slice(1)
  return value === '' ? null : value
}

async function readOpenFiles(pid) {
  const result = await run('/usr/sbin/lsof', ['-p', String(pid), '-Fftan'], { timeout: 8000 })
  if (!result.ok && !result.stdout) {
    return { available: false, error: result.stderr.trim() || 'lsof failed', count: 0, items: [] }
  }

  const items = parseLsof(result.stdout)
    .filter((entry) => entry.name && entry.name !== '(none)')
    .map((entry) => ({ ...entry, category: classifyFile(entry) }))

  const summary = items.reduce((acc, entry) => {
    acc[entry.category] = (acc[entry.category] ?? 0) + 1
    return acc
  }, {})

  return { available: true, count: items.length, summary, items: items.slice(0, 400) }
}

async function readNetwork(pid) {
  const result = await run('/usr/sbin/lsof', ['-a', '-p', String(pid), '-i', '-P', '-n'], {
    timeout: 8000
  })
  if (!result.ok && !result.stdout) return []
  return result.stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 9)
    .map((parts) => ({
      command: parts[0],
      pid: Number(parts[1]),
      user: parts[2],
      protocol: parts[7],
      name: parts.slice(8).join(' ')
    }))
}

async function readEnvironment(pid) {
  // macOS SIP hides the environment of most processes from `ps -E`,
  // so this is best effort and degrades to an explanatory message.
  const result = await run('/bin/ps', ['-Eww', '-p', String(pid), '-o', 'args='], { timeout: 4000 })
  const raw = result.stdout.trim()
  if (!raw) {
    return { available: false, variables: [], reason: 'Environment not exposed by macOS.' }
  }

  const tokens = raw.split(' ').filter((t) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(t))
  if (!tokens.length) {
    return {
      available: false,
      variables: [],
      reason: 'macOS restricts environment access for this process.'
    }
  }

  const variables = tokens
    .map((token) => {
      const index = token.indexOf('=')
      return { key: token.slice(0, index), value: token.slice(index + 1) }
    })
    .sort((a, b) => a.key.localeCompare(b.key))

  return { available: true, variables, reason: null }
}

async function readStartTime(pid) {
  const { stdout } = await run('/bin/ps', ['-p', String(pid), '-o', 'lstart='])
  const raw = stdout.trim()
  if (!raw) return null
  const parsed = Date.parse(raw.replace(/\s+/g, ' '))
  return {
    raw,
    timestamp: Number.isNaN(parsed) ? null : parsed,
    iso: Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
  }
}

/** Everything the detail drawer needs for a single PID. */
export async function getProcessDetail(pid) {
  const value = Number(pid)
  if (!Number.isInteger(value) || value <= 0) return { ok: false, error: 'Invalid PID.' }

  const { byPid } = await getProcesses()
  const target = byPid.get(value)
  if (!target) return { ok: false, error: `PID ${value} is no longer running.` }

  const [cwd, openFiles, network, environment, startTime] = await Promise.all([
    readCwd(value),
    readOpenFiles(value),
    readNetwork(value),
    readEnvironment(value),
    readStartTime(value)
  ])

  const parent = byPid.get(target.ppid) ?? null
  const children = (target.children ?? [])
    .map((childPid) => byPid.get(childPid))
    .filter(Boolean)
    .map((child) => ({
      pid: child.pid,
      name: child.name,
      cpu: child.cpu,
      memoryBytes: child.memoryBytes
    }))

  return {
    ok: true,
    process: {
      ...target,
      memoryLabel: formatBytes(target.memoryBytes),
      virtualLabel: formatBytes(target.virtualBytes),
      elapsedLabel: formatDuration(target.elapsed, true),
      cpuTimeLabel: formatDuration(target.cpuTime, true),
      parent: parent ? { pid: parent.pid, name: parent.name, user: parent.user } : null,
      children,
      cwd,
      startTime,
      openFiles,
      network,
      environment,
      ownedByCurrentUser: target.uid === os.userInfo().uid
    }
  }
}

/** Flattened ancestor/descendant list for the mini tree in the drawer. */
export async function getTreeForPid(pid) {
  const { byPid } = await getProcesses()
  const root = byPid.get(Number(pid))
  if (!root) return { ok: false, error: `PID ${pid} is not running.` }

  const nodes = []
  const walk = (node, depth) => {
    nodes.push({ pid: node.pid, ppid: node.ppid, name: node.name, depth, cpu: node.cpu })
    for (const childPid of node.children ?? []) {
      const child = byPid.get(childPid)
      if (child && depth < 12) walk(child, depth + 1)
    }
  }
  walk(root, 0)

  return { ok: true, root: root.pid, nodes }
}
