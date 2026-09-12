import React from 'react'
import { SleepPanel } from '../components/SleepPanel.jsx'
import { Empty, Panel } from '../components/ui.jsx'
import { Bar } from '../components/charts.jsx'
import {
  IconDisk,
  IconLock,
  IconLogOut,
  IconMonitor,
  IconMoon,
  IconPower,
  IconRestart,
  IconShield,
  IconTerminal
} from '../components/icons.jsx'
import { formatBytes, formatDuration, formatPercent, severity } from '../utils/format.js'

const ACTION_ICONS = {
  sleep: IconMoon,
  displaySleep: IconMonitor,
  lock: IconLock,
  restart: IconRestart,
  shutdown: IconPower,
  logout: IconLogOut
}

export function SystemView({ system, powerActions, sessions, busyAction, onPower }) {
  if (!system) {
    return (
      <div className="view">
        <Panel>
          <Empty icon={<span className="spinner" />} title="Reading system state…" />
        </Panel>
      </div>
    )
  }

  return (
    <div className="view">
      <SleepPanel />

      <Panel title="Power and session" hint="Every action asks for confirmation first">
        <div className="grid-3">
          {powerActions.map((action) => {
            const Icon = ACTION_ICONS[action.id] ?? IconPower
            return (
              <button
                key={action.id}
                type="button"
                className={`action-card${action.danger ? ' action-card--danger' : ''}`}
                disabled={Boolean(busyAction)}
                onClick={() => onPower(action)}
              >
                <span className="action-card__icon">
                  {busyAction === action.id ? <span className="spinner" /> : <Icon size={18} />}
                </span>
                <span className="action-card__label">{action.label}</span>
                <span className="action-card__desc">{action.description}</span>
                {action.danger ? (
                  <span className="badge badge--danger">Needs confirmation</span>
                ) : (
                  <span className="badge badge--ok">Immediate</span>
                )}
              </button>
            )
          })}
        </div>
      </Panel>

      <section className="grid-2">
        <Panel title="Storage" hint={`${system.disks.length} volumes`}>
          {system.disks.length === 0 ? (
            <Empty icon={<IconDisk size={20} />} title="No volume data" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {system.disks.map((disk) => (
                <div key={disk.mount}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="field__label">
                      <IconDisk size={12} /> {disk.mount}
                    </span>
                    <span className="mono muted">
                      {formatBytes(disk.used)} / {formatBytes(disk.total)}
                    </span>
                  </div>
                  <div style={{ marginTop: 7 }}>
                    <Bar value={disk.capacity} max={100} tone={severity(disk.capacity, 80, 92)} tall />
                  </div>
                  <div className="field__hint" style={{ marginTop: 6 }}>
                    {disk.capacity}% used · {formatBytes(disk.available)} available · {disk.filesystem}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Memory detail">
          <div className="kv">
            <KV k="Physical memory" v={formatBytes(system.memory.total)} />
            <KV
              k="Used"
              v={`${formatBytes(system.memory.used)} (${formatPercent(system.memory.usedPercent, 1)})`}
            />
            <KV k="App memory" v={formatBytes(system.memory.app)} />
            <KV k="Wired" v={formatBytes(system.memory.wired)} />
            <KV k="Compressed" v={formatBytes(system.memory.compressed)} />
            <KV k="Cached files" v={formatBytes(system.memory.cachedFiles)} />
            <KV k="Purgeable" v={formatBytes(system.memory.purgeable)} />
            <KV k="Free" v={formatBytes(system.memory.free)} />
            <KV
              k="Active / Inactive"
              v={`${formatBytes(system.memory.active)} / ${formatBytes(system.memory.inactive)}`}
            />
            <KV k="Swap" v={`${formatBytes(system.swap.used)} of ${formatBytes(system.swap.total)}`} />
            <KV k="Pressure" v={formatPercent(system.memory.pressure, 1)} />
          </div>
        </Panel>
      </section>

      <section className="grid-2">
        <Panel title="CPU and load">
          <div className="kv">
            <KV k="Processor" v={system.host.cpuBrand} />
            <KV k="Physical cores" v={system.cpu.physicalCores} />
            <KV k="Logical cores" v={system.cpu.cores} />
            <KV
              k="User / System"
              v={`${formatPercent(system.cpu.user, 1)} / ${formatPercent(system.cpu.sys, 1)}`}
            />
            <KV k="Idle" v={formatPercent(system.cpu.idle, 1)} />
            <KV k="Load (1/5/15m)" v={system.loadAverage.map((v) => v.toFixed(2)).join(' · ')} />
            <KV
              k="Thermal"
              v={
                system.thermal.throttled ? (
                  <span className="badge badge--warn">Throttled ({system.thermal.speedLimit}%)</span>
                ) : (
                  <span className="badge badge--ok">
                    <IconShield size={10} /> No throttling
                  </span>
                )
              }
            />
          </div>
        </Panel>

        <Panel title="Sessions and uptime" hint={`${sessions.length} logged in`}>
          {sessions.length === 0 ? (
            <Empty icon={<IconTerminal size={20} />} title="No active terminal sessions" />
          ) : (
            <div className="file-list" style={{ marginBottom: 14 }}>
              {sessions.map((session, index) => (
                <div className="file-list__row" key={`${session.tty}-${index}`}>
                  <span className="file-list__fd">{session.tty}</span>
                  <span className="file-list__name">{session.user}</span>
                  <span className="mono muted">{session.detail}</span>
                </div>
              ))}
            </div>
          )}
          <div className="kv">
            <KV k="Hostname" v={system.host.hostname} />
            <KV k="Uptime" v={formatDuration(system.uptime, true)} />
            <KV k="Booted" v={new Date(system.bootTime).toLocaleString()} />
            <KV k="Time zone" v={system.timezone} />
          </div>
        </Panel>
      </section>
    </div>
  )
}

function KV({ k, v }) {
  return (
    <div className="kv__row">
      <span className="kv__key">{k}</span>
      <span className="kv__value">{v}</span>
    </div>
  )
}
