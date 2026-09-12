import React, { useMemo, useState } from 'react'
import { ProcessTable, ProcessTableFooter } from '../components/ProcessTable.jsx'
import { Empty } from '../components/ui.jsx'
import { IconList, IconRefresh, IconSearch } from '../components/icons.jsx'
import { useSettings } from '../hooks/useSettings.jsx'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'user', label: 'My processes' },
  { id: 'system', label: 'System' },
  { id: 'apps', label: 'App bundles' },
  { id: 'zombie', label: 'Zombies' }
]

function matchesFilter(proc, filter) {
  switch (filter) {
    case 'user':
      return !proc.isSystem
    case 'system':
      return proc.isSystem
    case 'apps':
      return Boolean(proc.app)
    case 'zombie':
      return proc.isZombie
    default:
      return true
  }
}

const COMPARATORS = {
  name: (a, b) => a.name.localeCompare(b.name),
  pid: (a, b) => a.pid - b.pid,
  user: (a, b) => a.user.localeCompare(b.user),
  cpu: (a, b) => a.cpu - b.cpu,
  memory: (a, b) => a.memoryBytes - b.memoryBytes,
  state: (a, b) => a.state.localeCompare(b.state),
  elapsed: (a, b) => a.elapsed - b.elapsed
}

export function ProcessesView({
  processes,
  totals,
  updatedAt,
  tookMs,
  loading,
  onOpenProcess,
  onKill,
  onToggleSuspend,
  onRefresh
}) {
  const { settings } = useSettings()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState(settings.defaultSort)
  const [direction, setDirection] = useState(settings.defaultDirection)

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = processes.filter((proc) => {
      if (filter === 'user' && proc.isSystem) return false
      if (filter === 'system' && !proc.isSystem) return false
      if (filter === 'apps' && !proc.app) return false
      if (filter === 'zombie' && !proc.isZombie) return false
      if (settings.showSystemProcesses === false && proc.isSystem) return false
      if (!needle) return true
      return (
        proc.name.toLowerCase().includes(needle) ||
        proc.user.toLowerCase().includes(needle) ||
        String(proc.pid).includes(needle) ||
        (proc.app ?? '').toLowerCase().includes(needle) ||
        proc.args.toLowerCase().includes(needle)
      )
    })

    const comparator = COMPARATORS[sort] ?? COMPARATORS.cpu
    return [...filtered].sort((a, b) => (direction === 'asc' ? comparator(a, b) : comparator(b, a)))
  }, [processes, query, filter, sort, direction, settings.showSystemProcesses])

  const handleSort = (column, isActive) => {
    if (isActive) {
      setDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSort(column)
    setDirection(column === 'name' || column === 'user' || column === 'state' ? 'asc' : 'desc')
  }

  const cpuSum = rows.reduce((sum, proc) => sum + proc.cpu, 0)
  const memorySum = rows.reduce((sum, proc) => sum + proc.memoryBytes, 0)

  return (
    <div className={`view density-${settings.density}`}>
      <section className="panel">
        <div className="toolbar">
          <span className="search-field">
            <IconSearch size={14} />
            <input
              className="input"
              type="search"
              placeholder="Search by name, PID, user or command…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </span>

          <div className="chip-row">
            {FILTERS.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`chip${filter === item.id ? ' is-active' : ''}`}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <select
            className="select select--compact"
            value={`${sort}:${direction}`}
            onChange={(event) => {
              const [nextSort, nextDirection] = event.target.value.split(':')
              setSort(nextSort)
              setDirection(nextDirection)
            }}
            aria-label="Sort processes"
          >
            <option value="cpu:desc">CPU — highest first</option>
            <option value="cpu:asc">CPU — lowest first</option>
            <option value="memory:desc">Memory — highest first</option>
            <option value="memory:asc">Memory — lowest first</option>
            <option value="name:asc">Name — A to Z</option>
            <option value="name:desc">Name — Z to A</option>
            <option value="pid:asc">PID — oldest first</option>
            <option value="pid:desc">PID — newest first</option>
            <option value="elapsed:desc">Uptime — longest first</option>
            <option value="user:asc">User — A to Z</option>
          </select>

          <button type="button" className="btn btn--sm" onClick={onRefresh} disabled={loading}>
            {loading ? <span className="spinner" /> : <IconRefresh size={13} />}
            Refresh
          </button>
        </div>

        {rows.length === 0 ? (
          <Empty
            icon={<IconList size={20} />}
            title="No matching processes"
            text="Adjust the search text or switch to a different filter."
          />
        ) : (
          <>
            <ProcessTable
              processes={rows}
              sort={sort}
              direction={direction}
              onSort={handleSort}
              onSelect={(proc) => onOpenProcess(proc.pid)}
              onKill={onKill}
              onToggleSuspend={onToggleSuspend}
            />
            <ProcessTableFooter
              shown={rows.length}
              total={totals?.count ?? processes.length}
              cpuSum={cpuSum}
              memorySum={memorySum}
              tookMs={tookMs}
              updatedAt={updatedAt}
            />
          </>
        )}
      </section>
    </div>
  )
}
