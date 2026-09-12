/**
 * Small pure helpers shared by the process/system collectors.
 * Kept dependency-free so they can be unit tested in isolation.
 */

/** `"1:41.88"` / `"2:03:11.50"` / `"1-04:02:00"` -> seconds (float). */
export function parseCpuTime(raw) {
  if (!raw) return 0
  let value = String(raw).trim()
  if (!value) return 0

  let days = 0
  if (value.includes('-')) {
    const [d, rest] = value.split('-')
    days = Number(d) || 0
    value = rest
  }

  const parts = value.split(':').map((n) => Number(n))
  if (parts.some((n) => Number.isNaN(n))) return 0

  let seconds = 0
  if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2]
  else if (parts.length === 2) seconds = parts[0] * 60 + parts[1]
  else seconds = parts[0]

  return days * 86400 + seconds
}

/** `"01:41"` / `"2:03:11"` / `"3-04:02:00"` -> seconds (int). */
export function parseEtime(raw) {
  if (!raw) return 0
  let value = String(raw).trim()
  if (!value) return 0

  let days = 0
  if (value.includes('-')) {
    const [d, rest] = value.split('-')
    days = Number(d) || 0
    value = rest
  }

  const parts = value.split(':').map((n) => Number(n))
  if (parts.some((n) => Number.isNaN(n))) return 0

  let seconds = 0
  if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2]
  else if (parts.length === 2) seconds = parts[0] * 60 + parts[1]
  else seconds = parts[0]

  return days * 86400 + seconds
}

/**
 * Convert a BSD stat code (`"Ss"`, `"R+"`, `"Z"`, `"I"`) into a friendly label.
 * https://man.freebsd.org/cgi/man.cgi?query=ps&sektion=1#end
 */
export function describeState(stat) {
  const code = (stat || '').charAt(0).toUpperCase()
  const map = {
    R: { key: 'running', label: 'Running' },
    S: { key: 'sleeping', label: 'Sleeping' },
    I: { key: 'idle', label: 'Idle' },
    T: { key: 'stopped', label: 'Stopped' },
    Z: { key: 'zombie', label: 'Zombie' },
    U: { key: 'uninterruptible', label: 'Uninterruptible' },
    D: { key: 'uninterruptible', label: 'Uninterruptible' },
    W: { key: 'swapped', label: 'Swapped' }
  }
  return map[code] ?? { key: 'unknown', label: code || 'Unknown' }
}

/** `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` -> `Google Chrome` */
export function appBundleName(args) {
  if (!args) return null
  const match = args.match(/\/([^/\\]+)\.app\//)
  return match ? match[1] : null
}

/** Pick a short, human friendly display name out of an argv string. */
export function deriveName(comm, args) {
  const bundle = appBundleName(args)
  if (bundle) return bundle

  if (comm) {
    const base = comm.split('/').pop()
    if (base) return base
  }

  if (args) {
    const first = args.trim().split(/\s+/)[0]
    if (first) return first.split('/').pop() || first
  }

  return 'unknown'
}

/** True for Apple / Unix daemons the user should normally leave alone. */
export function isSystemProcess(user, comm, args) {
  if (user === 'root' || user === '_windowserver') return true
  const path = comm || args || ''
  return (
    path.startsWith('/System/') ||
    path.startsWith('/usr/libexec/') ||
    path.startsWith('/usr/sbin/') ||
    path.startsWith('/sbin/') ||
    path.startsWith('/Library/Apple/')
  )
}

/** 1536 -> "1.5 KB", 1048576 -> "1.00 MB" (binary units, ps reports KB). */
export function formatBytes(bytes, digits = 2) {
  const n = Number(bytes) || 0
  if (n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  const value = n / 1024 ** i
  return `${value.toFixed(i === 0 ? 0 : digits)} ${units[i]}`
}

/** 3725 seconds -> "1h 2m" (compact) or long form when `long` is true. */
export function formatDuration(seconds, long = false) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0))
  if (s < 60) return `${s}s`
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const parts = []
  if (d) parts.push(`${d}d`)
  if (h) parts.push(`${h}h`)
  if (m && !d) parts.push(`${m}m`)
  if (parts.length === 0) parts.push(`${m}m`)
  return long ? parts.join(' ') : parts.slice(0, 2).join(' ')
}

/** Live CPU deltas can dip slightly below zero; normalise the noise away. */
export function normaliseCpu(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return n < 0.05 ? 0 : Math.min(n, 100 * 64)
}
