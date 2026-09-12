/**
 * Renderer side formatting helpers.
 * Deliberately independent from `electron/lib/parse.js` so the UI bundle
 * never reaches outside `src/`.
 */

export function formatBytes(bytes, digits = 2) {
  const n = Number(bytes) || 0
  if (n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  const value = n / 1024 ** i
  return `${value.toFixed(i === 0 ? 0 : digits)} ${units[i]}`
}

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
  if (!parts.length) parts.push(`${m}m`)
  return long ? parts.join(' ') : parts.slice(0, 2).join(' ')
}

export function formatPercent(value, digits = 1) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0%'
  return `${n.toFixed(digits)}%`
}

export function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value) || 0)
}

export function formatTime(timestamp) {
  if (!timestamp) return '--:--:--'
  return new Date(timestamp).toLocaleTimeString()
}

export function formatDateTime(timestamp) {
  if (!timestamp) return 'Unknown'
  return new Date(timestamp).toLocaleString()
}

/** Colour bucket used by gauges, bars and dots across the UI. */
export function severity(value, warn = 60, danger = 85) {
  const n = Number(value) || 0
  if (n >= danger) return 'danger'
  if (n >= warn) return 'warn'
  return 'ok'
}

/** Short, readable label for a process state. */
export const STATE_TONE = {
  running: 'ok',
  sleeping: 'muted',
  idle: 'muted',
  stopped: 'warn',
  uninterruptible: 'warn',
  zombie: 'danger',
  swapped: 'warn',
  unknown: 'muted'
}

export function truncateMiddle(value, max = 60) {
  const text = String(value ?? '')
  if (text.length <= max) return text
  const half = Math.floor((max - 1) / 2)
  return `${text.slice(0, half)}…${text.slice(-half)}`
}
