import React, { useMemo, useState } from 'react'
import { Empty, Panel } from '../components/ui.jsx'
import { Bar } from '../components/charts.jsx'
import { IconChevronDown, IconChevronRight, IconTrash } from '../components/icons.jsx'
import { formatBytes, formatPercent, severity } from '../utils/format.js'

export function AppsView({ processes, onOpenProcess, onKillApp }) {
  const [expanded, setExpanded] = useState(null)

  const groups = useMemo(() => {
    const map = new Map()
    for (const proc of processes) {
      const key = proc.app || proc.name
      let group = map.get(key)
      if (!group) {
        group = {
          key,
          name: key,
          isAppBundle: Boolean(proc.app),
          count: 0,
          cpu: 0,
          memoryBytes: 0,
          isSystem: proc.isSystem,
          user: proc.user,
          members: []
        }
        map.set(key, group)
      }
      group.count += 1
      group.cpu += proc.cpu
      group.memoryBytes += proc.memoryBytes
      group.members.push(proc)
      if (!proc.isSystem) group.isSystem = false
    }

    return [...map.values()]
      .map((group) => ({
        ...group,
        cpu: Number(group.cpu.toFixed(1)),
        members: group.members.sort((a, b) => b.cpu - a.cpu)
      }))
      .sort((a, b) => b.cpu - a.cpu || b.memoryBytes - a.memoryBytes)
  }, [processes])

  const peakMemory = Math.max(1, ...groups.map((group) => group.memoryBytes))

  if (!groups.length) {
    return (
      <div className="view">
        <Panel>
          <Empty icon={<span className="spinner" />} title="Grouping processes…" />
        </Panel>
      </div>
    )
  }

  return (
    <div className="view">
      <Panel
        title="Applications and process groups"
        hint={`${groups.length} groups · ${processes.length} processes`}
        flush
      >
        <div className="list">
          {groups.map((group) => {
            const open = expanded === group.key
            return (
              <div key={group.key}>
                <div
                  className="app-row"
                  onClick={() => setExpanded(open ? null : group.key)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setExpanded(open ? null : group.key)
                    }
                  }}
                >
                  <span className="app-row__icon">
                    {open ? <IconChevronDown size={15} /> : <IconChevronRight size={15} />}
                  </span>
                  <span className="app-row__main">
                    <span className="app-row__title">
                      {group.name}
                      {group.isAppBundle ? <span className="badge badge--accent">.app</span> : null}
                      {group.isSystem ? <span className="badge">system</span> : null}
                    </span>
                    <span className="app-row__meta">
                      {group.count} process{group.count > 1 ? 'es' : ''} · {group.user}
                    </span>
                  </span>

                  <span className="app-row__metrics" style={{ alignItems: 'center' }}>
                    <span className="app-row__metric">
                      <strong>{formatPercent(group.cpu, 1)}</strong>
                      <span>cpu</span>
                    </span>
                    <span className="app-row__metric">
                      <strong>{formatBytes(group.memoryBytes, 1)}</strong>
                      <span>memory</span>
                    </span>
                  </span>

                  <button
                    type="button"
                    className="icon-btn icon-btn--danger"
                    title={`Quit all ${group.name} processes`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onKillApp(group)
                    }}
                  >
                    <IconTrash size={13} />
                  </button>
                </div>

                {open ? (
                  <div className="app-children">
                    <div style={{ padding: '8px 16px 4px' }}>
                      <Bar
                        value={group.memoryBytes}
                        max={peakMemory}
                        tone={severity((group.memoryBytes / peakMemory) * 100, 55, 80)}
                      />
                    </div>
                    {group.members.map((proc) => (
                      <div
                        className="app-child"
                        key={proc.pid}
                        onClick={() => onOpenProcess(proc.pid)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') onOpenProcess(proc.pid)
                        }}
                      >
                        <span className={`dot dot--${proc.cpu > 20 ? 'warn' : 'ok'}`} />
                        <span className="app-child__name">{proc.name}</span>
                        <span className="mono muted">#{proc.pid}</span>
                        <span className="mono muted" style={{ width: 62, textAlign: 'right' }}>
                          {formatPercent(proc.cpu, 1)}
                        </span>
                        <span className="mono muted" style={{ width: 78, textAlign: 'right' }}>
                          {formatBytes(proc.memoryBytes, 1)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </Panel>
    </div>
  )
}
