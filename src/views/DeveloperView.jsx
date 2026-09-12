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

  const load = useCallback(async () => {
    const contentResponse = await api.developer.content()
    setContent(contentResponse.content ?? null)
    setContentSource(contentResponse.source ?? null)
    const infoResponse = await api.updates.info()
    setUpdateInfo(infoResponse)
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
    </div>
  )
}

