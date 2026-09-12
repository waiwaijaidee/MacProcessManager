import React from 'react'
import {
  IconActivity,
  IconFolder,
  IconGrid,
  IconList,
  IconPower,
  IconSettings,
  IconShield,
  IconSparkles,
  IconTerminal
} from './icons.jsx'
import { formatBytes } from '../utils/format.js'

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', Icon: IconActivity },
  { id: 'processes', label: 'Processes', Icon: IconList, badge: 'processes' },
  { id: 'services', label: 'Services', Icon: IconFolder, badge: 'services' },
  { id: 'ai', label: 'AI Assistant', Icon: IconTerminal },
  { id: 'apps', label: 'Applications', Icon: IconGrid, badge: 'apps' },
  { id: 'system', label: 'System', Icon: IconPower },
  { id: 'settings', label: 'Settings', Icon: IconSettings },
  { id: 'developer', label: 'Developer', Icon: IconSparkles }
]

export function Sidebar({ view, onView, counts = {}, system }) {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__logo">
          <IconShield size={18} />
        </span>
        <div>
          <div className="sidebar__title">Process Manager</div>
          <div className="sidebar__subtitle">{system?.host?.hostname ?? 'macOS'}</div>
        </div>
      </div>

      <nav className="sidebar__nav">
        {NAV_ITEMS.map(({ id, label, Icon, badge }) => (
          <button
            key={id}
            type="button"
            className={`nav-item${view === id ? ' is-active' : ''}`}
            onClick={() => onView(id)}
            aria-current={view === id ? 'page' : undefined}
          >
            <Icon size={16} />
            <span>{label}</span>
            {badge && counts[badge] ? <span className="nav-item__count">{counts[badge]}</span> : null}
          </button>
        ))}
      </nav>

      <div className="sidebar__footer">
        <strong>Memory in use</strong>
        {system
          ? `${formatBytes(system.memory.used)} / ${formatBytes(system.memory.total)}`
          : '—'}
        <strong style={{ marginTop: 8 }}>Uptime</strong>
        {system ? formatUptime(system.uptime) : '—'}
      </div>
    </aside>
  )
}

function formatUptime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d) return `${d}d ${h}h ${m}m`
  if (h) return `${h}h ${m}m`
  return `${m}m`
}
