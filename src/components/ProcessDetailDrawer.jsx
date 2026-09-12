import React, { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { ConfirmDialog } from './ConfirmDialog.jsx'
import { Empty, KeyValue } from './ui.jsx'
import {
  IconClose,
  IconFolder,
  IconLayers,
  IconNetwork,
  IconPause,
  IconPlay,
  IconRefresh,
  IconTerminal,
  IconTrash,
  IconZap
} from './icons.jsx'
import {
  STATE_TONE,
  formatDateTime,
  formatPercent,
  truncateMiddle
} from '../utils/format.js'

const FILE_TONE = {
  network: 'accent',
  directory: 'warn',
  file: 'ok',
  device: 'danger',
  pipe: 'muted',
  system: 'muted',
  other: 'muted'
}

export function ProcessDetailDrawer({ pid, onClose, onSignal, onRenice }) {
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [nice, setNice] = useState(0)

  const load = useCallback(async () => {
    if (!pid) return
    try {
      const result = await api.processes.detail(pid)
      if (!result?.ok) {
        setError(result?.error ?? 'Unable to read process.')
        return
      }
      setDetail(result.process)
      setNice(result.process.nice)
      setError(null)
    } catch (err) {
      setError(err?.message ?? 'Unable to read process.')
    }
  }, [pid])

  useEffect(() => {
    if (!pid) {
      setDetail(null)
      setError(null)
      return undefined
    }
    load()
    const timer = setInterval(load, 4000)
    return () => clearInterval(timer)
  }, [pid, load])

  useEffect(() => {
    if (!pid) return undefined
    const onKey = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pid, onClose])

  if (!pid) return null

  const proc = detail

  const runSignal = async (signal) => {
    setBusy(true)
    const result = await onSignal(proc, { signal })
    setBusy(false)
    setConfirm(null)
    if (result?.ok && (signal === 'KILL' || signal === 'TERM')) onClose()
  }

  const applyNice = async (value) => {
    setBusy(true)
    // Priorities below 0 always need root, so ask for authorisation up front
    // instead of failing and making the user try again.
    await onRenice(proc, value, { elevated: value < 0 })
    setBusy(false)
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Process details">
        <header className="drawer__header">
          <button
            type="button"
            className="btn btn--icon btn--ghost drawer__close"
            onClick={onClose}
            aria-label="Close details"
          >
            <IconClose size={15} />
          </button>

          <h2 className="drawer__title">
            {proc ? (
              <>
                <span className={`dot dot--${STATE_TONE[proc.state] ?? 'muted'}`} />
                {proc.name}
                <span className={`badge badge--${STATE_TONE[proc.state] ?? 'muted'}`}>
                  {proc.stateLabel}
                </span>
              </>
            ) : (
              <>
                <span className="spinner" /> Loading PID {pid}
              </>
            )}
          </h2>
          <p className="drawer__subtitle">
            {proc ? truncateMiddle(proc.args, 140) : `pid ${pid}`}
          </p>

          {proc ? (
            <div className="drawer__actions">
              <button
                type="button"
                className="btn btn--sm"
                disabled={busy}
                onClick={() => runSignal(proc.isStopped ? 'CONT' : 'STOP')}
              >
                {proc.isStopped ? <IconPlay size={13} /> : <IconPause size={13} />}
                {proc.isStopped ? 'Resume' : 'Suspend'}
              </button>
              <button
                type="button"
                className="btn btn--sm"
                disabled={busy || proc.isSelf}
                onClick={() => setConfirm({ signal: 'TERM' })}
              >
                <IconTrash size={13} />
                Quit
              </button>
              <button
                type="button"
                className="btn btn--sm btn--danger"
                disabled={busy || proc.isSelf}
                onClick={() => setConfirm({ signal: 'KILL' })}
              >
                <IconZap size={13} />
                Force Kill
              </button>
              <button type="button" className="btn btn--sm btn--ghost" disabled={busy} onClick={load}>
                <IconRefresh size={13} />
                Refresh
              </button>
            </div>
          ) : null}
        </header>

        <div className="drawer__body">
          {error ? (
            <Empty icon={<IconZap size={20} />} title="Process unavailable" text={error} />
          ) : !proc ? (
            <Empty icon={<span className="spinner" />} title="Reading process…" />
          ) : (
            <>
              <section>
                <h3 className="section-title">Overview</h3>
                <KeyValue
                  rows={[
                    { key: 'PID', value: proc.pid, mono: true },
                    {
                      key: 'Parent',
                      value: proc.parent ? `${proc.parent.name} (${proc.parent.pid})` : `PID ${proc.ppid}`
                    },
                    { key: 'User', value: `${proc.user} (uid ${proc.uid})` },
                    { key: 'CPU', value: formatPercent(proc.cpu, 1) },
                    { key: 'Memory (RSS)', value: proc.memoryLabel },
                    { key: 'Virtual', value: proc.virtualLabel },
                    { key: 'CPU time', value: proc.cpuTimeLabel },
                    { key: 'Nice', value: `${proc.nice}` },
                    { key: 'Started', value: proc.startTime?.raw ?? formatDateTime(proc.startTime?.timestamp) },
                    { key: 'Uptime', value: proc.elapsedLabel },
                    { key: 'Executable', value: proc.path, mono: true },
                    { key: 'App bundle', value: proc.app ?? '—' }
                  ]}
                />
              </section>

              <section>
                <h3 className="section-title">Priority (nice)</h3>
                <div className="row" style={{ gap: 12 }}>
                  <input
                    className="range"
                    type="range"
                    min="-20"
                    max="20"
                    step="1"
                    value={nice}
                    onChange={(event) => setNice(Number(event.target.value))}
                  />
                  <span className="mono" style={{ width: 32, textAlign: 'right' }}>
                    {nice}
                  </span>
                  <button
                    type="button"
                    className="btn btn--sm"
                    disabled={busy || nice === proc.nice}
                    onClick={() => applyNice(nice)}
                  >
                    Apply
                  </button>
                </div>
                <div className="field__hint" style={{ marginTop: 6 }}>
                  Lower values mean higher scheduling priority. Negative values need administrator rights.
                </div>
              </section>

              {proc.children.length ? (
                <section>
                  <h3 className="section-title">Child processes ({proc.children.length})</h3>
                  <div className="list">
                    {proc.children.slice(0, 30).map((child) => (
                      <div className="file-list__row" key={child.pid}>
                        <span className="file-list__fd">#{child.pid}</span>
                        <span className="file-list__name">{child.name}</span>
                        <span className="mono muted">{formatPercent(child.cpu, 1)}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <section>
                <h3 className="section-title">
                  <IconTerminal size={12} /> Command line
                </h3>
                <pre className="code-block">{proc.args}</pre>
              </section>

              <section>
                <h3 className="section-title">
                  <IconFolder size={12} /> Working directory
                </h3>
                <pre className="code-block">{proc.cwd ?? 'Not readable for this process.'}</pre>
              </section>

              <section>
                <h3 className="section-title">
                  <IconLayers size={12} /> Open files ({proc.openFiles.count})
                </h3>
                {proc.openFiles.available ? (
                  <>
                    <div className="chip-row" style={{ marginBottom: 10 }}>
                      {Object.entries(proc.openFiles.summary).map(([key, count]) => (
                        <span className={`badge badge--${FILE_TONE[key] ?? 'muted'}`} key={key}>
                          {key} · {count}
                        </span>
                      ))}
                    </div>
                    <div className="file-list">
                      {proc.openFiles.items.slice(0, 120).map((file, index) => (
                        <div className="file-list__row" key={`${file.fd}-${index}`}>
                          <span className="file-list__fd">{file.fd}</span>
                          <span className="file-list__name" title={file.name}>
                            {file.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="field__hint">
                    {proc.openFiles.error ?? 'Not available.'}
                    {proc.ownedByCurrentUser ? '' : ' macOS requires administrator access for other users.'}
                  </div>
                )}
              </section>

              <section>
                <h3 className="section-title">
                  <IconNetwork size={12} /> Network connections ({proc.network.length})
                </h3>
                {proc.network.length ? (
                  <div className="file-list">
                    {proc.network.map((entry, index) => (
                      <div className="file-list__row" key={`${entry.name}-${index}`}>
                        <span className="file-list__fd">{entry.protocol}</span>
                        <span className="file-list__name">{entry.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="field__hint">No open sockets reported for this process.</div>
                )}
              </section>

              <section>
                <h3 className="section-title">
                  Environment ({proc.environment.variables.length})
                </h3>
                {proc.environment.available ? (
                  <div className="file-list">
                    {proc.environment.variables.map((variable) => (
                      <div className="file-list__row" key={variable.key}>
                        <span className="file-list__fd">{variable.key}</span>
                        <span className="file-list__name" title={variable.value}>
                          {variable.value}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="field__hint">{proc.environment.reason ?? 'Not available.'}</div>
                )}
              </section>
            </>
          )}
        </div>
      </aside>

      <ConfirmDialog
        open={Boolean(confirm)}
        tone="danger"
        busy={busy}
        title={confirm?.signal === 'KILL' ? 'Force kill process?' : 'Quit process?'}
        message={
          <>
            {confirm?.signal === 'KILL'
              ? 'This sends SIGKILL and cannot be undone. Unsaved work in the process will be lost.'
              : 'This sends SIGTERM, letting the process shut down cleanly.'}{' '}
            Target <code>{proc?.name}</code> with PID <code>{proc?.pid}</code>.
          </>
        }
        confirmLabel={confirm?.signal === 'KILL' ? 'Force Kill' : 'Quit'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => runSignal(confirm?.signal)}
      />
    </>
  )
}
