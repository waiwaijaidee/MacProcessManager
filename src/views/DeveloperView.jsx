import React, { useCallback, useEffect, useState } from 'react'
import { api, bridgeAvailable } from '../api.js'
import { Panel } from '../components/ui.jsx'
import { IconCheck, IconExternal, IconRefresh } from '../components/icons.jsx'

export function DeveloperView() {
  const [content, setContent] = useState(null)
  const [contentSource, setContentSource] = useState(null)
  const [updateInfo, setUpdateInfo] = useState(null)
  const [checkResult, setCheckResult] = useState(null)
  const [applyResult, setApplyResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [hotServerUrl, setHotServerUrl] = useState(null)
  const [serverInput, setServerInput] = useState('')
  const [hotCheckResult, setHotCheckResult] = useState(null)
  const [hotApplyResult, setHotApplyResult] = useState(null)

  const load = useCallback(async () => {
    const contentResponse = await api.developer.content()
    setContent(contentResponse.content ?? null)
    setContentSource(contentResponse.source ?? null)
    const infoResponse = await api.updates.info()
    setUpdateInfo(infoResponse)
    const serverResponse = await api.hotUpdate.serverUrl()
    setHotServerUrl(serverResponse.serverUrl ?? null)
    setServerInput(serverResponse.serverUrl ?? '')
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const open = (url) => {
    if (bridgeAvailable) api.app.openExternal(url)
    else window.open(url, '_blank')
  }

  const check = async () => {
    setBusy(true)
    setApplyResult(null)
    setCheckResult(await api.updates.check())
    setBusy(false)
  }

  const apply = async () => {
    setBusy(true)
    const result = await api.updates.apply()
    setApplyResult(result)
    setBusy(false)
    load()
  }

  const saveServer = async () => {
    setBusy(true)
    await api.hotUpdate.setServerUrl(serverInput.trim())
    const serverResponse = await api.hotUpdate.serverUrl()
    setHotServerUrl(serverResponse.serverUrl ?? null)
    setBusy(false)
  }

  const hotCheck = async () => {
    setBusy(true)
    setHotApplyResult(null)
    setHotCheckResult(await api.hotUpdate.check())
    setBusy(false)
  }

  const hotApply = async () => {
    setBusy(true)
    setHotApplyResult(await api.hotUpdate.apply())
    setBusy(false)
  }

  const hotRollback = async () => {
    setBusy(true)
    await api.hotUpdate.rollback()
    setBusy(false)
  }

  const restart = () => api.hotUpdate.relaunch()

  return (
    <div className="developer-view">
      <Panel
        title="Developer"
        hint={contentSource === 'remote' ? 'เนื้อหาโหลดจาก GitHub (แก้ไฟล์ config/developer.json บน GitHub ได้เลย)' : null}
      >
        <div className="developer-card">
          <img
            className="developer-card__logo"
            src={content?.logo}
            alt="Developer logo"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
          <div className="developer-card__info">
            <h2 style={{ margin: '0 0 4px' }}>{content?.name ?? 'Waiwai Jaidee'}</h2>
            {content?.role ? <div className="field__hint">{content.role}</div> : null}
            <div className="field__hint" style={{ marginBottom: 14 }}>{content?.tagline}</div>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn--primary" onClick={() => open(content?.facebook)}>
                <IconExternal size={14} /> Facebook: {content?.name ?? 'Waiwai Jaidee'}
              </button>
              <code className="kbd">{content?.facebookLabel ?? 'fb.com/kroowaiwai'}</code>
              <button type="button" className="btn" onClick={() => open(content?.website)}>
                <IconExternal size={14} /> {content?.website?.replace(/^https?:\/\//, '') ?? 'waiwai-it.com'}
              </button>
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        title="Version & Updates — ตรวจและอัปเดตจาก Git"
        hint={updateInfo?.remote ?? null}
      >
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="badge badge--ok">
            <IconCheck size={11} /> เวอร์ชันแอป: <b>{updateInfo?.version ?? '—'}</b>
          </span>
          {updateInfo?.branch ? <code className="kbd">branch: {updateInfo.branch}</code> : null}
          {updateInfo?.head?.hash ? (
            <code className="kbd" style={{ fontSize: 11 }}>
              {updateInfo.head.hash} · {updateInfo.head.message}
            </code>
          ) : null}
        </div>

        <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn--sm btn--primary" onClick={check} disabled={busy}>
            <IconRefresh size={13} /> ตรวจการอัปเดต (git fetch)
          </button>
          {checkResult?.updateAvailable ? (
            <button type="button" className="btn btn--sm btn--primary" onClick={apply} disabled={busy}>
              ⬇ อัปเดตเลย ({checkResult.behind} commits{checkResult.dependenciesChanged ? ' + npm install' : ''})
            </button>
          ) : null}
          {checkResult && !checkResult.ok ? <span className="badge badge--warn">{checkResult.error}</span> : null}
          {checkResult?.ok && !checkResult.updateAvailable ? (
            <span className="badge badge--ok"><IconCheck size={11} /> เป็นเวอร์ชันล่าสุดแล้ว</span>
          ) : null}
        </div>

        {checkResult?.newCommits?.length ? (
          <div className="sleep-plan" style={{ marginTop: 10 }}>
            <b>commits ใหม่บน GitHub:</b>
            {checkResult.newCommits.map((line) => (
              <span key={line}>
                <code>{line}</code>
              </span>
            ))}
          </div>
        ) : null}

        {applyResult ? (
          <div className="sleep-plan" style={{ marginTop: 10 }}>
            <b>{applyResult.message ?? applyResult.error}</b>
            {applyResult.steps?.map((step, index) => (
              <span key={index} className={step.ok ? 'badge--ok' : 'badge--warn'}>
                {step.ok ? '✓' : '✗'} {step.step}
              </span>
            ))}
            {applyResult.updated ? (
              <span className="field__hint">ปิดและเปิดแอปใหม่อีกครั้งเพื่อให้โค้ดใหม่ทำงานเต็มรูปแบบ</span>
            ) : null}
          </div>
        ) : null}
      </Panel>

      <Panel
        title="Hot Update — อัปเดตเฉพาะไฟล์ที่เปลี่ยน (ไม่ต้องโหลด DMG ใหม่)"
        hint={hotServerUrl ?? 'ยังไม่ได้ตั้ง update server'}
      >
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <input
            className="input"
            style={{ width: 320 }}
            placeholder="https://waiwai-it.com/app"
            value={serverInput}
            onChange={(e) => setServerInput(e.target.value)}
          />
          <button type="button" className="btn btn--sm" onClick={saveServer} disabled={busy}>
            บันทึก URL
          </button>
          <button type="button" className="btn btn--sm btn--primary" onClick={hotCheck} disabled={busy}>
            <IconRefresh size={13} /> เช็คไฟล์ที่เปลี่ยน
          </button>
          {hotCheckResult?.updateAvailable ? (
            <button type="button" className="btn btn--sm btn--primary" onClick={hotApply} disabled={busy}>
              ⬇ อัปเดต {hotCheckResult.changedCount} ไฟล์
            </button>
          ) : null}
          {hotApplyResult?.updated ? (
            <button type="button" className="btn btn--sm btn--primary" onClick={restart}>
              ⟳ Restart แอป
            </button>
          ) : null}
          {hotApplyResult?.backupDir ? (
            <button type="button" className="btn btn--sm btn--danger" onClick={hotRollback} disabled={busy}>
              ย้อนกลับ (rollback)
            </button>
          ) : null}
        </div>

        {hotCheckResult ? (
          <div className="sleep-plan" style={{ marginTop: 6 }}>
            <span className="badge badge--ok">server: v{hotCheckResult.serverVersion ?? '?'}</span>
            <span className="badge badge--ok">app: v{hotCheckResult.currentVersion ?? '?'}</span>
            {hotCheckResult.updateAvailable ? (
              <span className="badge badge--warn">มี {hotCheckResult.changedCount} ไฟล์ที่ต่างจาก server</span>
            ) : (
              <span className="badge badge--ok"><IconCheck size={11} /> ไฟล์ตรงกับ server ทั้งหมด ({hotCheckResult.upToDateCount} ไฟล์)</span>
            )}
            {hotCheckResult.changed?.slice(0, 30).map((f) => (
              <span key={f.rel}>
                <code style={{ fontSize: 11 }}>⟳ {f.rel}</code>
              </span>
            ))}
          </div>
        ) : null}

        {hotApplyResult ? (
          <div className="sleep-plan" style={{ marginTop: 6 }}>
            <b>{hotApplyResult.message}</b>
            {hotApplyResult.applied?.length ? <span className="badge badge--ok">แทนที่แล้ว {hotApplyResult.applied.length} ไฟล์</span> : null}
            {hotApplyResult.failed?.map((f) => (
              <span key={f.rel} className="badge--warn">
                ✗ {f.rel}: {f.error}
              </span>
            ))}
          </div>
        ) : null}
      </Panel>
    </div>
  )
}

