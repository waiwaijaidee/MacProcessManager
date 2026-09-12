import React, { useCallback, useEffect, useState } from 'react'
import { api, bridgeAvailable } from '../api.js'
import { ConfirmDialog } from './ConfirmDialog.jsx'
import { Empty, Panel } from './ui.jsx'
import { IconCheck, IconMoon, IconPlay, IconTrash } from './icons.jsx'

export function SleepPanel() {
  const [modes, setModes] = useState({})
  const [mode, setMode] = useState('screen')
  const [state, setState] = useState(null)
  const [plan, setPlan] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [result, setResult] = useState(null)
  const [keepRunning, setKeepRunning] = useState([])
  const [minutes, setMinutes] = useState(60)
  const [keepForever, setKeepForever] = useState(false)
  const [containers, setContainers] = useState([])
  const [keepServices, setKeepServices] = useState([])
  const [newKind, setNewKind] = useState('container')
  const [newName, setNewName] = useState('')
  const [newCommand, setNewCommand] = useState('')
  const [keepBusy, setKeepBusy] = useState(false)

  useEffect(() => {
    if (!bridgeAvailable) return
    api.sleep.modes().then(setModes)
    api.sleep.state().then(setState)
    api.services.overview().then((overview) => setContainers(overview.containers ?? []))
    api.keepServices.status().then((s) => setKeepServices(s.services ?? []))
  }, [])

  const runningNames = containers.filter((c) => c.running).map((c) => c.name)

  const buildPlan = useCallback(
    async (nextMode = mode) => {
      const response = await api.sleep.plan({
        mode: nextMode,
        keepContainers: keepRunning,
        keepForever,
        minutes,
        dryRun: true
      })
      setPlan(response)
      return response
    },
    [mode, keepRunning, minutes, keepForever]
  )

  useEffect(() => {
    if (!bridgeAvailable) return
    buildPlan()
  }, [mode, keepRunning, minutes, buildPlan])

  const apply = async (target) => {
    setBusy(true)
    const response = await api.sleep.apply({
      mode: target.mode,
      keepContainers: keepRunning,
      keepForever,
      minutes,
      dryRun: false
    })
    setResult(response)
    setBusy(false)
    api.sleep.state().then(setState)
  }

  const restore = async () => {
    setBusy(true)
    const response = await api.sleep.restore()
    setResult(response)
    setBusy(false)
    api.sleep.state().then(setState)
  }

  const toggleKeep = (name) => {
    setKeepRunning((current) =>
      current.includes(name) ? current.filter((n) => n !== name) : [...current, name]
    )
  }

  /* ---- always-keep-running services ---------------------------------- */

  const addKeepService = async () => {
    if (keepBusy) return
    setKeepBusy(true)
    const response = await api.keepServices.save({
      name: newName.trim(),
      kind: newKind,
      command: newCommand.trim()
    })
    if (response?.ok) {
      setNewName('')
      setNewCommand('')
      const status = await api.keepServices.status()
      setKeepServices(status.services ?? [])
    }
    setKeepBusy(false)
  }

  const toggleKeepServiceActive = async (service) => {
    setKeepBusy(true)
    await api.keepServices.save({ id: service.id, name: service.name, kind: service.kind, command: service.command, active: !(service.active !== false) })
    const status = await api.keepServices.status()
    setKeepServices(status.services ?? [])
    setKeepBusy(false)
  }

  const removeKeepService = async (id) => {
    setKeepBusy(true)
    await api.keepServices.remove(id)
    const status = await api.keepServices.status()
    setKeepServices(status.services ?? [])
    setKeepBusy(false)
  }

  const ensureKeepServices = async () => {
    setKeepBusy(true)
    await api.keepServices.ensure()
    const status = await api.keepServices.status()
    setKeepServices(status.services ?? [])
    setKeepBusy(false)
  }

  if (!bridgeAvailable) return null

  const needsContainerChoice = mode === 'keep-running' || mode === 'full-sleep'

  return (
    <>
      <Panel
        title="Sleep modes — แนวทางการหลับของเครื่อง"
        hint={state?.caffeinateRunning ? `caffeinate กำลังทำงาน (${state.caffeinateMinutes} นาที)` : null}
      >
        <div className="sleep-modes">
          {Object.values(modes).map((spec) => (
            <button
              key={spec.id}
              type="button"
              className={`sleep-mode${mode === spec.id ? ' is-active' : ''}`}
              onClick={() => setMode(spec.id)}
            >
              <span className="sleep-mode__label">{spec.label}</span>
              <span className="sleep-mode__summary">{spec.summary}</span>
            </button>
          ))}
        </div>

        {needsContainerChoice ? (
          <div className="sleep-keep">
            <div className="field__label">
              {mode === 'keep-running'
                ? 'เลือก container ที่จะหยุด (ที่ไม่เลือก = ยังรันต่อ):'
                : 'เลือก container ที่จะให้ยังรันต่อ (ที่ไม่เลือก = จะถูกหยุด):'}
            </div>
            {runningNames.length === 0 ? (
              <Empty icon={<IconMoon size={18} />} title="ไม่มี container ที่กำลังรัน" />
            ) : (
              runningNames.map((name) => (
                <label className="sleep-keep__row" key={name}>
                  <input
                    type="checkbox"
                    checked={mode === 'keep-running' ? !keepRunning.includes(name) : keepRunning.includes(name)}
                    onChange={() => toggleKeep(name)}
                  />
                  <b>{name}</b>
                </label>
              ))
            )}
            {mode === 'keep-running' ? (
              <label className="sleep-keep__row">
                <span className="field__label">ปิดจอนานเท่าไร (นาที — caffeinate กันหลับลึก):</span>
                <input
                  className="input"
                  style={{ width: 110 }}
                  type="number"
                  min="1"
                  max="720"
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                />
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 10 }}>
                  <input type="checkbox" checked={keepForever} onChange={(e) => setKeepForever(e.target.checked)} />
                  <span className="field__label">รันตลอดจนกว่าจะปลุก (ไม่จำกัดเวลา)</span>
                </label>
              </label>
            ) : null}

            {mode === 'keep-running' ? (
              <div className="keep-services" style={{ marginTop: 14 }}>
                <div className="field__label" style={{ marginBottom: 6 }}>
                  🟢 Services ที่ต้องรันเสมอแม้เครื่องหลับ (เพิ่มได้ไม่จำกัด):
                </div>

                {keepServices.length === 0 ? (
                  <div className="field__hint" style={{ marginBottom: 8 }}>
                    ยังไม่มี service ในรายการ — เพิ่ม Docker container หรือคำสั่งเว็บเซิร์ฟเวอร์ด้านล่าง
                  </div>
                ) : (
                  <div className="keep-services__list">
                    {keepServices.map((service) => (
                      <div key={service.id} className="keep-services__item">
                        <button
                          type="button"
                          className={`keep-toggle${service.active !== false ? ' keep-toggle--on' : ''}`}
                          title={service.active !== false ? 'กำลัง ACTIVE — คลิกเพื่อปิด' : 'คลิกเพื่อเปิด ACTIVE'}
                          onClick={() => toggleKeepServiceActive(service)}
                          disabled={keepBusy}
                        >
                          {service.active !== false ? '● ACTIVE' : '○ OFF'}
                        </button>
                        <span className="keep-services__name">
                          <b>{service.name}</b>
                          <span className={`badge ${service.running ? 'badge--ok' : 'badge--warn'}`} style={{ marginLeft: 8 }}>
                            {service.running ? 'running' : 'not running'}
                          </span>
                          <code className="kbd" style={{ marginLeft: 8, fontSize: 11 }}>
                            {service.kind === 'container' ? `docker: ${service.name}` : service.command}
                          </code>
                        </span>
                        <button
                          type="button"
                          className="btn btn--sm btn--danger"
                          onClick={() => removeKeepService(service.id)}
                          disabled={keepBusy}
                          title="ลบรายการนี้"
                        >
                          <IconTrash size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="row" style={{ marginTop: 8, gap: 6, flexWrap: 'wrap' }}>
                  <select className="input" style={{ width: 130 }} value={newKind} onChange={(e) => setNewKind(e.target.value)}>
                    <option value="container">Docker container</option>
                    <option value="command">คำสั่งเอง (command)</option>
                  </select>
                  {newKind === 'container' ? (
                    <select className="input" style={{ width: 220 }} value={newName} onChange={(e) => setNewName(e.target.value)}>
                      <option value="">— เลือก container —</option>
                      {(containers ?? []).map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name} {c.running ? '(running)' : ''}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {newKind === 'container' && !newName && containers.length > 0 ? null : null}
                  {newKind === 'command' ? (
                    <>
                      <input
                        className="input"
                        style={{ width: 150 }}
                        placeholder="ชื่อ service"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                      />
                      <input
                        className="input"
                        style={{ width: 320 }}
                        placeholder="เช่น: node /path/to/web/server.js"
                        value={newCommand}
                        onChange={(e) => setNewCommand(e.target.value)}
                      />
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn--sm btn--primary"
                    onClick={addKeepService}
                    disabled={keepBusy || !newName.trim() || (newKind === 'command' && !newCommand.trim())}
                  >
                    + เพิ่ม
                  </button>
                  <button type="button" className="btn btn--sm" onClick={ensureKeepServices} disabled={keepBusy || keepServices.length === 0}>
                    <IconPlay size={12} /> Start ทั้งหมดตอนนี้
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {plan?.steps?.length ? (
          <div className="sleep-plan" style={{ marginTop: 10 }}>
            <b>ขั้นตอนที่จะเกิด:</b>
            {plan.steps.map((stepText, index) => (
              <span key={index}>
                {index + 1}. <code>{stepText}</code>
              </span>
            ))}
            {plan.willStop?.length ? (
              <span>
                จะหยุด: <b>{plan.willStop.map((c) => c.name).join(', ')}</b>
              </span>
            ) : null}
            {plan.willKeep?.length ? (
              <span>
                จะยังรัน: <b>{plan.willKeep.map((c) => c.name).join(', ')}</b>
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="row" style={{ marginTop: 12, gap: 8 }}>
          <button
            type="button"
            className={`btn btn--sm ${plan?.danger ? 'btn--danger' : 'btn--primary'}`}
            onClick={() => setConfirm(plan)}
            disabled={busy || !plan?.ok}
          >
            <IconMoon size={13} /> ดำเนินการ
          </button>
          {state?.caffeinateRunning ? (
            <button type="button" className="btn btn--sm" onClick={restore} disabled={busy}>
              <IconPlay size={13} /> ยกเลิก caffeinate + start container กลับ
            </button>
          ) : null}
          {result?.applied ? (
            <span className="badge badge--ok">
              <IconCheck size={11} /> ดำเนินการแล้ว: {result.label}
            </span>
          ) : null}
        </div>

        {state?.lastMode ? (
          <div className="field__hint" style={{ marginTop: 8 }}>
            ครั้งล่าสุด: <b>{state.lastMode}</b> · container ที่เคยหยุดไว้:{' '}
            {state.stoppedContainers.length ? state.stoppedContainers.join(', ') : 'ไม่มี'}
          </div>
        ) : null}
      </Panel>

      <ConfirmDialog
        open={Boolean(confirm)}
        tone={confirm?.danger ? 'danger' : 'accent'}
        busy={busy}
        title={confirm?.label ? `ยืนยัน: ${confirm.label}` : 'ยืนยัน'}
        message={
          <>
            {confirm?.summary}
            {confirm?.willStop?.length ? (
              <>
                {' '}
                จะหยุด container: <b>{confirm.willStop.map((c) => c.name).join(', ')}</b>
              </>
            ) : null}
            {confirm?.willKeep?.length ? (
              <>
                {' '}
                ยังรันต่อ: <b>{confirm.willKeep.map((c) => c.name).join(', ')}</b>
              </>
            ) : null}
          </>
        }
        confirmLabel="ดำเนินการ"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const target = confirm
          setConfirm(null)
          apply(target)
        }}
      />
    </>
  )
}
