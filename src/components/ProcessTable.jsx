import React from 'react'
import {
  IconChevronDown,
  IconChevronUp,
  IconInfo,
  IconPause,
  IconPlay,
  IconSort,
  IconTrash,
  IconZap
} from './icons.jsx'
import { MetricBar } from './charts.jsx'
import { STATE_TONE, formatBytes, formatDuration, severity } from '../utils/format.js'

const COLUMNS = [
  { id: 'name', label: 'Process', sortable: true, className: '' },
  { id: 'pid', label: 'PID', sortable: true, className: 'col-right col-num' },
  { id: 'user', label: 'User', sortable: true, className: '' },
  { id: 'cpu', label: 'CPU', sortable: true, className: 'col-right col-num' },
  { id: 'memory', label: 'Memory', sortable: true, className: 'col-right col-num' },
  { id: 'state', label: 'State', sortable: true, className: '' },
  { id: 'elapsed', label: 'Uptime', sortable: true, className: 'col-right col-num' },
  { id: 'actions', label: '', sortable: false, className: 'col-right col-num' }
]

function SortIcon({ active, direction }) {
  if (!active) return <IconSort size={12} style={{ opacity: 0.45 }} />
  return direction === 'asc' ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />
}

export function ProcessTable({
  processes,
  sort,
  direction,
  onSort,
  onSelect,
  onKill,
  onToggleSuspend,
  selectedPid
}) {
  return (
    <div className="table-wrap">
      <table className="proc-table">
        <thead>
          <tr>
            {COLUMNS.map((column) => {
              const active = sort === column.id
              return (
                <th
                  key={column.id}
                  className={`${column.className}${column.sortable ? ' is-sortable' : ''}${
                    active ? ' is-sorted' : ''
                  }`}
                  onClick={column.sortable ? () => onSort(column.id, active) : undefined}
                  aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  <span className="th-inner">
                    {column.label}
                    {column.sortable ? <SortIcon active={active} direction={direction} /> : null}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {processes.map((proc) => (
            <ProcessRow
              key={proc.pid}
              proc={proc}
              onSelect={onSelect}
              onKill={onKill}
              onToggleSuspend={onToggleSuspend}
              selected={proc.pid === selectedPid}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
function ProcessRow({ proc, onSelect, onKill, onToggleSuspend, selected }) {
  const suspended = proc.isStopped

  return (
    <tr
      className={[
        proc.isSystem ? 'is-system' : '',
        proc.isZombie ? 'is-zombie' : '',
        selected ? 'is-selected' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onSelect(proc)}
    >
      <td>
        <div className="proc-name">
          <span className={`dot dot--${STATE_TONE[proc.state] ?? 'muted'}`} />
          <span className="proc-name__text" title={proc.args}>
            {proc.name}
          </span>
          {proc.app ? <span className="proc-name__badge">app</span> : null}
          {proc.isSelf ? <span className="proc-name__badge">self</span> : null}
          {proc.isSystem ? <span className="proc-name__badge">sys</span> : null}
        </div>
      </td>
      <td className="col-right mono dim">{proc.pid}</td>
      <td className="dim">{proc.user}</td>
      <td className="col-right">
        <MetricBar value={proc.cpu} max={100} tone={severity(proc.cpu, 25, 70)} />
      </td>
      <td className="col-right">
        <MetricBar
          value={proc.memoryPercent}
          max={Math.max(5, proc.memoryPercent)}
          tone={severity(proc.memoryPercent, 15, 35)}
          format={() => formatBytes(proc.memoryBytes, 1)}
        />
      </td>
      <td>
        <span className={`badge badge--${STATE_TONE[proc.state] ?? 'muted'}`}>{proc.stateLabel}</span>
        {proc.nice !== 0 ? (
          <span className="mono muted" style={{ marginLeft: 6 }}>
            n{proc.nice}
          </span>
        ) : null}
      </td>
      <td className="col-right dim">{formatDuration(proc.elapsed)}</td>
      <td className="col-right">
        <span className="row-actions" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="icon-btn"
            title={suspended ? `Resume ${proc.name}` : `Suspend ${proc.name}`}
            onClick={() => onToggleSuspend(proc, !suspended)}
          >
            {suspended ? <IconPlay size={13} /> : <IconPause size={13} />}
          </button>
          <button
            type="button"
            className="icon-btn"
            title={`Details for ${proc.name}`}
            onClick={() => onSelect(proc)}
          >
            <IconInfo size={13} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--warn"
            title={`Quit ${proc.name} gracefully (SIGTERM)`}
            onClick={() => onKill(proc, { force: false })}
          >
            <IconTrash size={13} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--danger"
            title={`Force kill ${proc.name} (SIGKILL)`}
            onClick={() => onKill(proc, { force: true })}
          >
            <IconZap size={13} />
          </button>
        </span>
      </td>
    </tr>
  )
}

export function ProcessTableFooter({ shown, total, cpuSum, memorySum, tookMs, updatedAt }) {
  return (
    <div className="table-footer">
      <span>
        Showing <b>{shown}</b> of {total} processes
      </span>
      <span>CPU total {Number(cpuSum || 0).toFixed(1)}%</span>
      <span>Memory {formatBytes(memorySum)}</span>
      {typeof tookMs === 'number' ? <span>sampled in {tookMs} ms</span> : null}
      <span style={{ flex: 1 }} />
      {updatedAt ? <span>updated {new Date(updatedAt).toLocaleTimeString()}</span> : null}
    </div>
  )
}

