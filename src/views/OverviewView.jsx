import React from 'react'
import { Bar, Gauge, Sparkline, StatCard } from '../components/charts.jsx'
import { Empty, Panel } from '../components/ui.jsx'
import {
  IconClock,
  IconCpu,
  IconDisk,
  IconGauge,
  IconLayers,
  IconMemory,
  IconShield
} from '../components/icons.jsx'
import {
  formatBytes,
  formatDuration,
  formatNumber,
  formatPercent,
  severity
} from '../utils/format.js'

const MEM_SEGMENTS = [
  { key: 'app', label: 'App', className: 'seg-app' },
  { key: 'wired', label: 'Wired', className: 'seg-wired' },
  { key: 'compressed', label: 'Compressed', className: 'seg-compressed' },
  { key: 'cachedFiles', label: 'Cached files', className: 'seg-cached' },
  { key: 'free', label: 'Free', className: 'seg-free' }
]

function TopList({ title, items, metric, onOpen }) {
  return (
    <Panel title={title} hint={`${items.length} shown`} flush>
      {items.length === 0 ? (
        <Empty title="No data yet" text="Waiting for the first sample." />
      ) : (
        <div className="list">
          {items.map((proc, index) => (
            <button
              type="button"
              className="list-row"
              key={proc.pid}
              onClick={() => onOpen(proc.pid)}
            >
              <span className="list-row__rank">{index + 1}</span>
              <span className="list-row__main">
                <span className="list-row__name">{proc.name}</span>
                <span className="list-row__sub">
                  PID {proc.pid} · {proc.user}
                  {proc.app ? ` · ${proc.app}` : ''}
                </span>
              </span>
              <span className="list-row__metric">
                <strong>{metric.value(proc)}</strong>
                <span>{metric.sub(proc)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Panel>
  )
}

export function OverviewView({ system, processes, cpuHistory, memoryHistory, onOpenProcess }) {
  if (!system) {
    return (
      <div className="view">
        <Panel>
          <Empty icon={<span className="spinner" />} title="Reading system state…" />
        </Panel>
      </div>
    )
  }

  const { cpu, memory, disks, processes: procCounts } = system
  const rootDisk = disks.find((disk) => disk.mount === '/') ?? disks[0]

  const topCpu = [...processes].sort((a, b) => b.cpu - a.cpu).slice(0, 8)
  const topMemory = [...processes].sort((a, b) => b.memoryBytes - a.memoryBytes).slice(0, 8)

  const memoryTotal = memory.total || 1
  const segments = MEM_SEGMENTS.map((segment) => ({
    ...segment,
    bytes: Math.max(0, memory[segment.key] ?? 0),
    percent: Math.max(0, ((memory[segment.key] ?? 0) / memoryTotal) * 100)
  }))

  const cpuTone = severity(cpu.usage, 45, 80)
  const memTone = severity(memory.usedPercent, 70, 88)

  return (
    <div className="view">
      <section className="panel">
        <div className="hero-panel">
          <Gauge value={cpu.usage} caption="CPU load" tone={cpuTone === 'ok' ? 'accent' : cpuTone} size={168} />
          <Gauge
            value={memory.usedPercent}
            caption="Memory"
            tone={memTone === 'ok' ? 'accent' : memTone}
            size={168}
          />

          <div className="hero-metrics">
            <div className="legend-inline">
              <span>
                <b>User</b> {formatPercent(cpu.user, 1)}
              </span>
              <span>
                <b>System</b> {formatPercent(cpu.sys, 1)}
              </span>
              <span>
                <b>Idle</b> {formatPercent(cpu.idle, 1)}
              </span>
              <span>
                <b>Cores</b> {cpu.cores}
              </span>
            </div>

            <div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="field__label">CPU history</span>
                <span className="mono muted">{formatPercent(cpu.usage, 1)}</span>
              </div>
              <Sparkline data={cpuHistory} tone={cpuTone} max={Math.max(100, ...cpuHistory)} />
            </div>

            <div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="field__label">Memory history</span>
                <span className="mono muted">
                  {formatBytes(memory.used)} / {formatBytes(memory.total)}
                </span>
              </div>
              <Sparkline
                data={memoryHistory}
                tone={memTone}
                max={Math.max(100, ...memoryHistory)}
              />
            </div>

            <div className="legend-inline">
              <span>
                <b>Load</b> {system.loadAverage.map((v) => v.toFixed(2)).join(' / ')}
              </span>
              <span>
                <b>Uptime</b> {formatDuration(system.uptime, true)}
              </span>
              <span>
                <b>Swap</b> {formatBytes(system.swap.used)}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid-4">
        <StatCard
          icon={<IconLayers size={15} />}
          label="Processes"
          value={formatNumber(procCounts.total)}
          meta={`${procCounts.running} running · ${procCounts.sleeping} sleeping`}
        />
        <StatCard
          icon={<IconCpu size={15} />}
          label="Threads"
          value={formatNumber(procCounts.threads)}
          meta={`${cpu.physicalCores} physical / ${cpu.cores} logical cores`}
          tone="ok"
        />
        <StatCard
          icon={<IconGauge size={15} />}
          label="Load average"
          value={system.loadAverage[0].toFixed(2)}
          meta={`${formatPercent(system.loadPercent, 0)} of total capacity`}
          tone={severity(system.loadPercent, 60, 90)}
          footer={<Bar value={system.loadPercent} max={100} tone={severity(system.loadPercent, 60, 90)} />}
        />
        <StatCard
          icon={<IconDisk size={15} />}
          label="Startup disk"
          value={rootDisk ? `${rootDisk.capacity}%` : '—'}
          meta={rootDisk ? `${formatBytes(rootDisk.used)} of ${formatBytes(rootDisk.total)} used` : 'Unavailable'}
          tone={rootDisk ? severity(rootDisk.capacity, 80, 92) : 'ok'}
          footer={
            <Bar value={rootDisk?.capacity ?? 0} max={100} tone={severity(rootDisk?.capacity ?? 0, 80, 92)} />
          }
        />
      </section>

      <section className="grid-2">
        <TopList
          title="Top CPU consumers"
          items={topCpu}
          onOpen={onOpenProcess}
          metric={{
            value: (proc) => formatPercent(proc.cpu, 1),
            sub: (proc) => formatBytes(proc.memoryBytes, 1)
          }}
        />
        <TopList
          title="Top memory consumers"
          items={topMemory}
          onOpen={onOpenProcess}
          metric={{
            value: (proc) => formatBytes(proc.memoryBytes, 1),
            sub: (proc) => `${formatPercent(proc.memoryPercent, 1)} of RAM`
          }}
        />
      </section>

      <section className="grid-2">
        <Panel title="Memory breakdown" hint={formatBytes(memory.total)}>
          <div className="mem-stack">
            {segments.map((segment) => (
              <div
                key={segment.key}
                className={`mem-stack__seg ${segment.className}`}
                style={{ width: `${segment.percent}%` }}
                title={`${segment.label}: ${formatBytes(segment.bytes)}`}
              />
            ))}
          </div>
          <div className="bar-legend">
            {segments.map((segment) => (
              <span className="bar-legend__item" key={segment.key}>
                <span className={`bar-legend__swatch ${segment.className}`} />
                {segment.label} · {formatBytes(segment.bytes)}
              </span>
            ))}
          </div>
          <div className="field__hint" style={{ marginTop: 12 }}>
            Memory pressure <b>{formatPercent(memory.pressure, 1)}</b> · page size {memory.pageSize} bytes
          </div>
        </Panel>

        <Panel title="This Mac">
          <div className="kv">
            <Row k="Hostname" v={system.host.hostname} />
            <Row k="Model" v={system.host.model} />
            <Row k="Processor" v={system.host.cpuBrand} />
            <Row k="macOS" v={`${system.host.osVersion} (${system.host.osBuild})`} />
            <Row k="Memory" v={formatBytes(system.memory.total)} />
            <Row k="Started" v={new Date(system.bootTime).toLocaleString()} />
            <div className="kv__row">
              <span className="kv__key">Thermal</span>
              <span className="kv__value">
                {system.thermal.throttled ? (
                  <span className="badge badge--warn">Throttled</span>
                ) : (
                  <span className="badge badge--ok">
                    <IconShield size={10} /> Normal
                  </span>
                )}
              </span>
            </div>
          </div>
        </Panel>
      </section>

      <section className="grid-3">
        <StatCard
          icon={<IconMemory size={15} />}
          label="Free memory"
          value={formatBytes(memory.free, 1)}
          meta={`${formatPercent((memory.free / memoryTotal) * 100, 1)} available without swapping`}
          tone={memory.free / memoryTotal > 0.15 ? 'ok' : 'warn'}
        />
        <StatCard
          icon={<IconLayers size={15} />}
          label="Compressed"
          value={formatBytes(memory.compressed, 1)}
          meta={`${formatPercent(memory.pressure, 1)} pressure indicator`}
          tone={severity(memory.pressure, 30, 55)}
        />
        <StatCard
          icon={<IconClock size={15} />}
          label="Swap in use"
          value={formatBytes(system.swap.used, 1)}
          meta={`of ${formatBytes(system.swap.total, 1)} allocated`}
          tone={system.swap.total && system.swap.used / system.swap.total > 0.6 ? 'warn' : 'ok'}
        />
      </section>
    </div>
  )
}

function Row({ k, v }) {
  return (
    <div className="kv__row">
      <span className="kv__key">{k}</span>
      <span className="kv__value">{v}</span>
    </div>
  )
}
