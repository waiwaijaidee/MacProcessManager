import React, { useId } from 'react'
import { formatPercent } from '../utils/format.js'

/* ------------------------------------------------------------------ *
 * Gauge - a radial progress ring used for CPU / memory hero metrics
 * ------------------------------------------------------------------ */

export function Gauge({ value = 0, max = 100, label, caption, tone = 'accent', size = 170 }) {
  const gradientId = useId()
  const pct = Math.max(0, Math.min(100, (Number(value) / max) * 100))

  const radius = 42
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - pct / 100)

  const stroke =
    tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : tone === 'danger' ? 'var(--danger)' : 'url(#g-' + gradientId + ')'

  return (
    <div className="gauge" style={{ maxWidth: size }}>
      <svg className="gauge__svg" viewBox="0 0 100 100">
        <defs>
          <linearGradient id={`g-${gradientId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--info)" />
          </linearGradient>
        </defs>
        <circle className="gauge__track" cx="50" cy="50" r={radius} />
        <circle
          className="gauge__value-arc"
          cx="50"
          cy="50"
          r={radius}
          stroke={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="gauge__inner">
        <div className="gauge__number">{label ?? formatPercent(value, 0)}</div>
        {caption ? <div className="gauge__caption">{caption}</div> : null}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Sparkline - tiny area chart for the rolling history buffer
 * ------------------------------------------------------------------ */

export function Sparkline({ data = [], height = 42, tone = 'accent', max }) {
  const gradientId = useId()
  if (!data.length) return <svg className="sparkline" style={{ height }} />

  const peak = max ?? Math.max(...data, 1)
  const step = 100 / Math.max(1, data.length - 1)
  const points = data.map((value, index) => {
    const x = index * step
    const y = 100 - (Math.max(0, value) / peak) * 100
    return [x, Math.max(0, Math.min(100, y))]
  })

  const line = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  const area = `0,100 ${line} 100,100`

  const stroke = tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : tone === 'danger' ? 'var(--danger)' : 'var(--accent)'

  return (
    <svg className="sparkline" style={{ height }} viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.45" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#sg-${gradientId})`} />
      <polyline className="sparkline__line" points={line} style={{ stroke }} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/* ------------------------------------------------------------------ *
 * Bars and metric chips
 * ------------------------------------------------------------------ */

export function Bar({ value = 0, max = 100, tone = 'accent', tall = false }) {
  const pct = Math.max(0, Math.min(100, (Number(value) / (max || 1)) * 100))
  return (
    <div className={`bar${tall ? ' bar--tall' : ''}`}>
      <div className={`bar__fill bar__fill--${tone}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

/** Right aligned value + mini bar used inside the process table. */
export function MetricBar({ value = 0, max = 100, tone = 'accent', format = formatPercent }) {
  return (
    <span className="metric">
      <span className="metric__bar">
        <Bar value={value} max={max} tone={tone} />
      </span>
      <span className="metric__value">{format(value)}</span>
    </span>
  )
}

export function StatCard({ icon, label, value, unit, meta, tone = 'accent', footer }) {
  return (
    <div className="stat-card">
      <div className="stat-card__head">
        {icon ? <span className={`stat-card__icon stat-card__icon--${tone}`}>{icon}</span> : null}
        <span className="stat-card__label">{label}</span>
      </div>
      <div className="stat-card__value">
        {value}
        {unit ? <small>{unit}</small> : null}
      </div>
      {meta ? <div className="stat-card__meta">{meta}</div> : null}
      {footer ? <div className="stat-card__footer">{footer}</div> : null}
    </div>
  )
}
