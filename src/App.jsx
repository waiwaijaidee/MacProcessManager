import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { api, bridgeAvailable } from './api.js'
import { Sidebar } from './components/Sidebar.jsx'
import { ConfirmDialog } from './components/ConfirmDialog.jsx'
import { ProcessDetailDrawer } from './components/ProcessDetailDrawer.jsx'
import { useToast } from './components/Toast.jsx'
import { useHistory, usePoll } from './hooks/usePoll.js'
import { useSettings } from './hooks/useSettings.jsx'
import { OverviewView } from './views/OverviewView.jsx'
import { ProcessesView } from './views/ProcessesView.jsx'
import { AppsView } from './views/AppsView.jsx'
import { SystemView } from './views/SystemView.jsx'
import { SettingsView } from './views/SettingsView.jsx'
import { ServicesView } from './views/ServicesView.jsx'
import { AiView } from './views/AiView.jsx'
import { DeveloperView } from './views/DeveloperView.jsx'
import { IconAlert, IconRefresh } from './components/icons.jsx'

const VIEW_META = {
  overview: { title: 'Overview', subtitle: 'Live health of this Mac' },
  processes: { title: 'Processes', subtitle: 'Inspect, prioritise and terminate processes' },
  services: { title: 'Services', subtitle: 'Docker containers, ports and pinned favourites' },
  ai: { title: 'AI Assistant', subtitle: 'Chat และสั่งงานเครื่องผ่าน cline CLI' },
  apps: { title: 'Applications', subtitle: 'Processes grouped by app bundle' },
  system: { title: 'System', subtitle: 'Storage, memory, power and session control' },
  settings: { title: 'Settings', subtitle: 'Preferences and about this app' },
  developer: { title: 'Developer', subtitle: 'Waiwai Jaidee — fb.com/kroowaiwai' }
}

export default function App() {
  const { settings } = useSettings()
  const toast = useToast()

  const [view, setView] = useState('overview')
  const [selectedPid, setSelectedPid] = useState(null)
  const [powerActions, setPowerActions] = useState([])
  const [sessions, setSessions] = useState([])
  const [appInfo, setAppInfo] = useState(null)
  const [busyAction, setBusyAction] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [confirmBusy, setConfirmBusy] = useState(false)

  const interval = settings.refreshMs

  const processes = usePoll(() => api.processes.list({ maxAgeMs: 300 }), interval)
  const system = usePoll(
    () => api.system.stats({ maxAgeMs: Math.max(900, interval - 200) }),
    interval
  )

  const cpuHistory = useHistory(system.data?.cpu?.usage)
  const memoryHistory = useHistory(system.data?.memory?.usedPercent)

  useEffect(() => {
    api.system.powerActions().then(setPowerActions)
    api.system.sessions().then(setSessions)
    api.app.info().then(setAppInfo)
  }, [])

  const [services, setServices] = useState(null)

  useEffect(() => {
    api.services.overview().then(setServices)
  }, [])

  const list = processes.data?.processes ?? []
  const totals = processes.data?.totals
  const stats = system.data

  /* --------------------------------------------------------------- *
   * Signals
   * --------------------------------------------------------------- */

  const signalProcess = useCallback(
    async (proc, { signal, elevated = false }) => {
      const result = await api.processes.signal({ pid: proc.pid, signal, elevated })
      if (result?.ok) {
        toast.success(`${signal} sent`, result.message ?? `PID ${proc.pid} signalled.`)
      } else {
        toast.error('Signal failed', result?.error ?? 'Unknown error.')
      }
      processes.refresh()
      return result
    },
    [toast, processes]
  )

  const killProcess = useCallback(
    async (proc, { force, elevated = false }) => {
      const result = force
        ? await api.processes.signal({ pid: proc.pid, signal: 'KILL', elevated })
        : await api.processes.kill({
            pid: proc.pid,
            elevated,
            escalateMs: settings.autoEscalateKill ? 3000 : 0
          })

      if (result?.ok) {
        toast.success(
          force ? 'Force killed' : 'Terminated',
          result.message ?? `PID ${proc.pid} (${proc.name}) removed.`
        )
      } else {
        toast.error('Could not terminate', result?.error ?? 'Unknown error.')
      }
      processes.refresh()
      return result
    },
    [toast, processes, settings.autoEscalateKill]
  )

  const reniceProcess = useCallback(
    async (proc, nice, options = {}) => {
      const result = await api.processes.renice({ pid: proc.pid, nice, elevated: Boolean(options.elevated) })
      if (result?.ok) toast.success('Priority updated', result.message)
      else toast.error('Could not change priority', result?.error ?? 'Unknown error.')
      processes.refresh()
      return result
    },
    [toast, processes]
  )

  /* --------------------------------------------------------------- *
   * Power and bulk actions
   * --------------------------------------------------------------- */

  const runPower = useCallback(
    async (action) => {
      setBusyAction(action.id)
      const result = await api.system.power(action.id)
      setBusyAction(null)
      setConfirm(null)
      if (result?.ok) toast.success(action.label, result.message ?? 'Requested.')
      else toast.error(`${action.label} failed`, result?.error ?? 'Unknown error.')
    },
    [toast]
  )

  const requestPower = useCallback(
    (action) => {
      if (settings.confirmPower) setConfirm({ kind: 'power', action })
      else runPower(action)
    },
    [settings.confirmPower, runPower]
  )

  const requestKill = useCallback(
    (proc, options) => {
      if (proc.isSelf) {
        toast.error('Not allowed', 'This app cannot signal its own Electron process.')
        return
      }
      if (settings.confirmKill) setConfirm({ kind: 'kill', proc, options })
      else killProcess(proc, options)
    },
    [settings.confirmKill, killProcess, toast]
  )

  const runKillApp = useCallback(
    async (targets, group) => {
      setConfirmBusy(true)
      const results = await Promise.all(
        targets.map((proc) => api.processes.kill({ pid: proc.pid, escalateMs: 1500 }))
      )
      setConfirmBusy(false)
      setConfirm(null)
      const ok = results.filter((result) => result?.ok).length
      if (ok === results.length) toast.success(`${group.name} closed`, `${ok} processes terminated.`)
      else toast.error('Partial termination', `${ok} of ${results.length} processes terminated.`)
      processes.refresh()
    },
    [toast, processes]
  )

  const requestKillApp = useCallback(
    (group) => {
      const targets = group.members.filter((member) => !member.isSelf)
      if (!targets.length) {
        toast.error('Not allowed', 'Every process in this group belongs to this app.')
        return
      }
      setConfirm({ kind: 'killApp', group, targets })
    },
    [toast]
  )

  /* --------------------------------------------------------------- *
   * Confirmation copy
   * --------------------------------------------------------------- */

  const confirmTarget = confirm?.proc ?? confirm?.targets?.[0] ?? null

  const confirmTitle =
    confirm?.kind === 'power'
      ? `${confirm.action.label} this Mac?`
      : confirm?.kind === 'killApp'
        ? `Quit all ${confirm.group.name} processes?`
        : confirm?.options?.force
          ? 'Force kill process?'
          : 'Terminate process?'

  const confirmMessage = useMemo(() => {
    if (!confirm) return null
    if (confirm.kind === 'power') {
      return (
        <>
          <b>{confirm.action.label}</b> — {confirm.action.description}
          {confirm.action.danger
            ? ' Make sure everything is saved; open apps will be asked to close.'
            : ''}
        </>
      )
    }
    if (confirm.kind === 'killApp') {
      return (
        <>
          SIGTERM will be sent to <b>{confirm.targets.length}</b> process
          {confirm.targets.length > 1 ? 'es' : ''} in <code>{confirm.group.name}</code>. Unsaved work
          may be lost.
        </>
      )
    }
    return (
      <>
        {confirm.options?.force
          ? 'SIGKILL cannot be blocked by the process and will discard unsaved work.'
          : 'SIGTERM lets the process shut down cleanly.'}{' '}
        Target <code>{confirmTarget?.name}</code> with PID <code>{confirmTarget?.pid}</code>.
      </>
    )
  }, [confirm, confirmTarget])

  /* --------------------------------------------------------------- *
   * Render
   * --------------------------------------------------------------- */

  const meta = VIEW_META[view]
  const busy = processes.loading && !processes.data

  const counts = {
    processes: totals?.count ?? 0,
    services: (services?.services ?? []).length,
    apps: new Set(list.filter((proc) => proc.app).map((proc) => proc.app)).size
  }

  const openProcess = (pid) => {
    setSelectedPid(pid)
    setView('processes')
  }

  return (
    <div className="app-shell">
      <Sidebar view={view} onView={setView} counts={counts} system={stats} />

      <div className="main">
        <header className="topbar">
          <div className="topbar__titles">
            <h1 className="topbar__title">{meta.title}</h1>
            <p className="topbar__subtitle">{meta.subtitle}</p>
          </div>

          <div className="topbar__actions">
            <span className="badge">
              <span className={`dot ${busy ? '' : 'dot--ok'} pulse`} />
              {stats ? `${stats.processes.running} running` : 'sampling…'}
            </span>
            <span className="badge badge--accent mono">
              {stats
                ? `${stats.cpu.usage.toFixed(0)}% cpu · ${stats.memory.usedPercent.toFixed(0)}% mem`
                : '—'}
            </span>
            <button
              type="button"
              className="btn btn--icon"
              title="Refresh now"
              onClick={() => {
                api.system.refresh().then(system.refresh)
                processes.refresh()
              }}
            >
              {busy ? <span className="spinner" /> : <IconRefresh size={14} />}
            </button>
          </div>
        </header>

        {!bridgeAvailable ? (
          <div style={{ padding: '10px 24px 0' }}>
            <span className="badge badge--warn">
              <IconAlert size={12} /> Running outside Electron — the process bridge is unavailable.
            </span>
          </div>
        ) : null}

        <main className="content">
          {view === 'overview' ? (
            <OverviewView
              system={stats}
              processes={list}
              cpuHistory={settings.showSparklines ? cpuHistory : []}
              memoryHistory={settings.showSparklines ? memoryHistory : []}
              onOpenProcess={openProcess}
            />
          ) : null}

          {view === 'processes' ? (
            <ProcessesView
              processes={list}
              totals={totals}
              updatedAt={processes.updatedAt}
              tookMs={processes.data?.tookMs}
              loading={processes.loading}
              onOpenProcess={setSelectedPid}
              onKill={requestKill}
              onToggleSuspend={(proc, suspend) =>
                signalProcess(proc, { signal: suspend ? 'STOP' : 'CONT' })
              }
              onRefresh={() => processes.refresh()}
            />
          ) : null}

          {view === 'apps' ? (
            <AppsView processes={list} onOpenProcess={openProcess} onKillApp={requestKillApp} />
          ) : null}

          {view === 'services' ? (
            <ServicesView onOpenProcess={openProcess} />
          ) : null}

          {view === 'ai' ? <AiView /> : null}

          {view === 'system' ? (
            <SystemView
              system={stats}
              powerActions={powerActions}
              sessions={sessions}
              busyAction={busyAction}
              onPower={requestPower}
            />
          ) : null}

          {view === 'settings' ? <SettingsView appInfo={appInfo} /> : null}

          {view === 'developer' ? <DeveloperView /> : null}
        </main>
      </div>

      {selectedPid ? (
        <ProcessDetailDrawer
          pid={selectedPid}
          onClose={() => setSelectedPid(null)}
          onSignal={signalProcess}
          onRenice={reniceProcess}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(confirm)}
        tone={confirm?.kind === 'power' && !confirm.action.danger ? 'accent' : 'danger'}
        busy={confirmBusy}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel={confirm?.kind === 'power' ? confirm.action.label : 'Confirm'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.kind === 'power') runPower(confirm.action)
          else if (confirm?.kind === 'killApp') runKillApp(confirm.targets, confirm.group)
          else {
            setConfirm(null)
            killProcess(confirm.proc, confirm.options)
          }
        }}
      />
    </div>
  )
}

