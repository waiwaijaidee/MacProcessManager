import React, { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { Empty } from './ui.jsx'
import { IconAlert, IconCheck, IconRefresh, IconTrash, IconZap } from './icons.jsx'
import { useSettings } from '../hooks/useSettings.jsx'

const BLANK = { id: null, name: '', provider: 'cline', model: '', baseUrl: '', apiKey: '' }

export function CredentialManager() {
  const { settings, update } = useSettings()
  const [data, setData] = useState(null)
  const [form, setForm] = useState(BLANK)
  const [busy, setBusy] = useState(null)
  const [notice, setNotice] = useState(null)
  const [testing, setTesting] = useState(null)

  const reload = useCallback(async () => {
    const result = await api.credentials.list()
    setData(result)
    return result
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const selectedProvider = data?.providers.find((p) => p.id === form.provider)

  const refreshForm = useCallback(async () => {
    const result = await reload()
    if (!result?.ok) return
    const active = result.credentials.find((c) => c.id === result.activeId)
    if (!active) {
      setForm(BLANK)
      return
    }
    setForm({
      id: active.id,
      name: active.name,
      provider: active.provider,
      model: active.model ?? '',
      baseUrl: active.baseUrl ?? '',
      apiKey: ''
    })
  }, [reload])

  useEffect(() => {
    refreshForm()
  }, [refreshForm])

  const save = useCallback(async () => {
    setBusy('save')
    setNotice(null)
    const result = await api.credentials.save({
      id: form.id,
      name: form.name,
      provider: form.provider,
      model: form.model,
      baseUrl: form.baseUrl,
      apiKey: form.apiKey,
      setActive: true
    })
    setBusy(null)
    setNotice(result.ok ? { ok: true, text: 'บันทึกแล้ว' } : { ok: false, text: result.error })
    if (result.ok) await refreshForm()
  }, [form, refreshForm])

  const pick = useCallback(
    async (id) => {
      const result = await api.credentials.activate(id)
      if (result.ok) {
        update({ aiCredentialId: id })
        await refreshForm()
        setNotice({ ok: true, text: 'เลือก credential นี้แล้ว' })
      }
    },
    [refreshForm, update]
  )

  const remove = useCallback(
    async (id) => {
      setBusy(id)
      await api.credentials.delete(id)
      setBusy(null)
      await refreshForm()
      setNotice({ ok: true, text: 'ลบ credential แล้ว' })
    },
    [refreshForm]
  )

  const test = useCallback(
    async (id) => {
      setTesting(id)
      const result = await api.credentials.test(id)
      setTesting(null)
      await reload()
      setNotice(
        result.ok
          ? { ok: true, text: `ทดสอบผ่าน — ตอบ “${result.reply ?? '…'}”` }
          : { ok: false, text: result.error ?? 'ทดสอบไม่ผ่าน' }
      )
    },
    [reload]
  )

  const activeId = data?.activeId ?? settings.aiCredentialId ?? null

  return (
    <div>
      <div className="cred-list">
        {(data?.credentials ?? []).length === 0 ? (
          <Empty
            icon={<IconAlert size={18} />}
            title="ยังไม่มี credential"
            text="เพิ่มด้านล่าง — ใส่ API key/token ของ provider ที่ต้องการ แล้วกด ⚡ เพื่อทดสอบ"
          />
        ) : (
          (data?.credentials ?? []).map((credential) => (
            <div className={`cred-row${credential.id === activeId ? ' is-active' : ''}`} key={credential.id}>
              <button type="button" className="cred-row__pick" onClick={() => pick(credential.id)}>
                <span className={`dot dot--${credential.id === activeId ? 'ok' : 'muted'}`} />
                <span className="cred-row__name">{credential.name}</span>
                <span className="cred-row__meta">
                  {credential.provider}
                  {credential.model ? ` · ${credential.model}` : ''}
                </span>
                <span className="cred-row__key">{credential.hasKey ? credential.keyPreview : 'no key'}</span>
                {credential.lastTestOk != null ? (
                  <span className={`badge badge--${credential.lastTestOk ? 'ok' : 'danger'}`}>
                    {credential.lastTestOk ? 'ผ่าน' : 'ไม่ผ่าน'}
                  </span>
                ) : null}
              </button>
              <div className="cred-row__actions">
                <button
                  type="button"
                  className="btn btn--icon btn--sm"
                  title="ทดสอบ credential นี้"
                  onClick={() => test(credential.id)}
                  disabled={testing === credential.id}
                >
                  {testing === credential.id ? <span className="spinner" /> : <IconZap size={13} />}
                </button>
                <button
                  type="button"
                  className="btn btn--icon btn--sm"
                  title="โหลดค่ามาแก้ไข"
                  onClick={() => setForm({ ...BLANK, ...credential, apiKey: '' })}
                >
                  <IconRefresh size={13} />
                </button>
                <button
                  type="button"
                  className="btn btn--icon btn--sm icon-btn--danger"
                  title="ลบ credential"
                  onClick={() => remove(credential.id)}
                  disabled={busy === credential.id}
                >
                  <IconTrash size={13} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="cred-form">
        <div className="ai-grid">
          <label className="field">
            <span className="field__label">ชื่อ credential</span>
            <input
              className="input"
              value={form.name}
              placeholder="เช่น OpenRouter main, MAMP Claude"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field__label">Provider</span>
            <select
              className="select"
              value={form.provider}
              onChange={(e) => {
                const spec = data?.providers.find((p) => p.id === e.target.value)
                setForm({
                  ...form,
                  provider: e.target.value,
                  model: spec?.defaultModel ?? '',
                  baseUrl: spec?.baseUrl ?? ''
                })
              }}
            >
              {(data?.providers ?? []).map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
            {selectedProvider?.hint ? <span className="field__hint">{selectedProvider.hint}</span> : null}
          </label>
          <label className="field">
            <span className="field__label">Model</span>
            <input
              className="input"
              value={form.model}
              placeholder={selectedProvider?.defaultModel || 'เช่น gpt-4o-mini'}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
            />
          </label>
          {selectedProvider?.needsBaseUrl ? (
            <label className="field">
              <span className="field__label">Base URL</span>
              <input
                className="input"
                value={form.baseUrl}
                placeholder={selectedProvider.baseUrl || 'http://localhost:11434'}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              />
            </label>
          ) : null}
          <label className="field">
            <span className="field__label">
              API key / token{' '}
              {form.id ? '(เว้นว่าง = ใช้ค่าเดิม)' : selectedProvider?.needsKey ? '' : '(ไม่จำเป็น)'}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="input"
                type="password"
                value={form.apiKey}
                placeholder={form.id ? '•••• คงค่าเดิมไว้' : 'sk-…'}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                disabled={form.id ? false : selectedProvider ? !selectedProvider.needsKey : false}
              />
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                title="วางจากคลิปบอร์ด"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText()
                    if (text) setForm((f) => ({ ...f, apiKey: text.trim() }))
                  } catch {
                    /* clipboard read may be denied by the OS - use Cmd+V instead */
                  }
                }}
              >
                วาง
              </button>
            </div>
          </label>
        </div>

        <div className="row" style={{ marginTop: 10, gap: 8 }}>
          <button type="button" className="btn btn--primary btn--sm" onClick={save} disabled={busy === 'save'}>
            {busy === 'save' ? <span className="spinner" /> : null}
            {form.id ? 'บันทึกการแก้ไข' : 'เพิ่ม credential'}
          </button>
          {form.id ? (
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setForm(BLANK)}>
              ยกเลิกการแก้ไข
            </button>
          ) : null}
          {notice ? (
            <span className={`badge badge--${notice.ok ? 'ok' : 'danger'}`}>
              {notice.ok ? <IconCheck size={11} /> : <IconAlert size={11} />} {notice.text}
            </span>
          ) : null}
        </div>

        <div className="field__hint" style={{ marginTop: 10 }}>
          เก็บไว้ในเครื่องเท่านั้น:
          <code className="kbd">~/Library/Application Support/Mac Process Manager/credentials.json</code>
          (สิทธิ์ไฟล์ 0600) — ไม่ส่งออกไปที่อื่น
        </div>
      </div>
    </div>
  )
}
