import React from 'react'
import { FieldRow, Panel, Switch } from '../components/ui.jsx'
import { IconMoon, IconMonitor, IconShield, IconSliders, IconSun } from '../components/icons.jsx'
import { useSettings } from '../hooks/useSettings.jsx'

const REFRESH_STEPS = [500, 1000, 1500, 2000, 3000, 5000, 10000]

function refreshLabel(ms) {
  return ms < 1000 ? `${ms} ms` : `${ms / 1000}s`
}

export function SettingsView({ appInfo }) {
  const { settings, update, reset } = useSettings()
  const stepIndex = Math.max(0, REFRESH_STEPS.indexOf(settings.refreshMs))

  return (
    <div className="view">
      <div className="settings-grid">
        <Panel title="Appearance">
          <FieldRow title="Theme" description="Dark, light or follow the macOS appearance.">
            <div className="chip-row">
              <button
                type="button"
                className={`chip${settings.theme === 'dark' ? ' is-active' : ''}`}
                onClick={() => update({ theme: 'dark' })}
              >
                <IconMoon size={12} /> Dark
              </button>
              <button
                type="button"
                className={`chip${settings.theme === 'light' ? ' is-active' : ''}`}
                onClick={() => update({ theme: 'light' })}
              >
                <IconSun size={12} /> Light
              </button>
              <button
                type="button"
                className={`chip${settings.theme === 'system' ? ' is-active' : ''}`}
                onClick={() => update({ theme: 'system' })}
              >
                <IconMonitor size={12} /> System
              </button>
            </div>
          </FieldRow>

          <FieldRow title="Table density" description="Compact mode fits roughly twice as many rows.">
            <div className="chip-row">
              <button
                type="button"
                className={`chip${settings.density === 'comfortable' ? ' is-active' : ''}`}
                onClick={() => update({ density: 'comfortable' })}
              >
                Comfortable
              </button>
              <button
                type="button"
                className={`chip${settings.density === 'compact' ? ' is-active' : ''}`}
                onClick={() => update({ density: 'compact' })}
              >
                Compact
              </button>
            </div>
          </FieldRow>

          <FieldRow title="Sparklines" description="Show rolling CPU and memory graphs on the overview.">
            <Switch
              label="Toggle sparklines"
              checked={settings.showSparklines}
              onChange={(value) => update({ showSparklines: value })}
            />
          </FieldRow>

          <FieldRow
            title="Auto health check"
            description="Probe services and Docker containers on the Services page every 20 seconds."
          >
            <Switch
              label="Auto health check"
              checked={settings.autoCheckHealth}
              onChange={(value) => update({ autoCheckHealth: value })}
            />
          </FieldRow>
        </Panel>

        <Panel title="Monitoring">
          <FieldRow title="Refresh interval" description="How often processes and system stats are sampled.">
            <span className="mono" style={{ minWidth: 52, textAlign: 'right' }}>
              {refreshLabel(settings.refreshMs)}
            </span>
          </FieldRow>
          <div style={{ padding: '4px 0 14px' }}>
            <input
              className="range"
              type="range"
              min="0"
              max={REFRESH_STEPS.length - 1}
              step="1"
              value={stepIndex}
              onChange={(event) => update({ refreshMs: REFRESH_STEPS[Number(event.target.value)] })}
              aria-label="Refresh interval"
            />
          </div>

          <FieldRow
            title="Show system processes"
            description="Include Apple daemons in the process table and statistics."
          >
            <Switch
              label="Show system processes"
              checked={settings.showSystemProcesses}
              onChange={(value) => update({ showSystemProcesses: value })}
            />
          </FieldRow>

          <FieldRow title="Default sort" description="Applied when the process table is first opened.">
            <select
              className="select select--compact"
              value={`${settings.defaultSort}:${settings.defaultDirection}`}
              onChange={(event) => {
                const [sort, direction] = event.target.value.split(':')
                update({ defaultSort: sort, defaultDirection: direction })
              }}
            >
              <option value="cpu:desc">CPU — highest</option>
              <option value="memory:desc">Memory — highest</option>
              <option value="name:asc">Name — A to Z</option>
              <option value="pid:asc">PID — ascending</option>
              <option value="elapsed:desc">Uptime — longest</option>
            </select>
          </FieldRow>
        </Panel>

        <Panel title="Safety">
          <FieldRow
            title="Confirm before sending signals"
            description="Ask before SIGTERM or SIGKILL is sent to a process."
          >
            <Switch
              label="Confirm kills"
              checked={settings.confirmKill}
              onChange={(value) => update({ confirmKill: value })}
            />
          </FieldRow>

          <FieldRow
            title="Confirm power actions"
            description="Ask before sleeping, restarting, shutting down or logging out."
          >
            <Switch
              label="Confirm power actions"
              checked={settings.confirmPower}
              onChange={(value) => update({ confirmPower: value })}
            />
          </FieldRow>

          <FieldRow
            title="Escalate stuck processes"
            description="If a process ignores SIGTERM for 3 seconds, follow up with SIGKILL."
          >
            <Switch
              label="Auto escalate"
              checked={settings.autoEscalateKill}
              onChange={(value) => update({ autoEscalateKill: value })}
            />
          </FieldRow>

          <div style={{ paddingTop: 14 }}>
            <button type="button" className="btn btn--block" onClick={reset}>
              Reset all settings to defaults
            </button>
          </div>
        </Panel>

        <Panel title="About this app">
          <div className="about-grid">
            <span className="about-pill">
              <IconShield size={13} />
              <strong>Mac Process Manager</strong>
              <span>v{appInfo?.version ?? '1.0.0'}</span>
            </span>
            <span className="about-pill">
              <span>Electron</span>
              <strong>{appInfo?.electron ?? '—'}</strong>
            </span>
            <span className="about-pill">
              <span>Chromium</span>
              <strong>{appInfo?.chrome ?? '—'}</strong>
            </span>
            <span className="about-pill">
              <span>Node</span>
              <strong>{appInfo?.node ?? '—'}</strong>
            </span>
            <span className="about-pill">
              <span>React</span>
              <strong>19</strong>
            </span>
            <span className="about-pill">
              <span>Platform</span>
              <strong>
                {appInfo?.platform ?? '—'} / {appInfo?.arch ?? '—'}
              </strong>
            </span>
          </div>

          <div style={{ marginTop: 16 }}>
            <h3 className="section-title">
              <IconSliders size={12} /> Signals available
            </h3>
            <div className="chip-row">
              {(appInfo?.signals ?? []).map((signal) => (
                <span className="badge" key={signal.id}>
                  {signal.label} · {signal.number}
                </span>
              ))}
            </div>
          </div>

          <div className="field__hint" style={{ marginTop: 16, lineHeight: 1.7 }}>
            Process and system data come from macOS command line tools this app runs directly:{' '}
            <code className="kbd">ps</code>, <code className="kbd">top</code>,{' '}
            <code className="kbd">vm_stat</code>, <code className="kbd">sysctl</code>,{' '}
            <code className="kbd">df</code>, <code className="kbd">lsof</code> and{' '}
            <code className="kbd">pmset</code>. Nothing leaves this Mac and the app makes no
            network requests.
          </div>
        </Panel>
      </div>
    </div>
  )
}
