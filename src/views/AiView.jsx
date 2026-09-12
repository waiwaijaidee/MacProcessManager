import React, { useCallback, useEffect, useRef, useState } from 'react'
import { api, bridgeAvailable } from '../api.js'
import { Empty, Panel } from '../components/ui.jsx'
import {
  IconAlert,
  IconCheck,
  IconClose,
  IconPause,
  IconRefresh,
  IconShield,
  IconTerminal,
  IconZap
} from '../components/icons.jsx'
import { CredentialManager } from '../components/CredentialManager.jsx'
import { useSettings } from '../hooks/useSettings.jsx'

function MessageBubble({ message }) {
  const isUser = message.role === 'user'
  return (
    <div className={`chat-msg ${isUser ? 'chat-msg--user' : 'chat-msg--ai'}`}>
      <div className="chat-msg__role">{isUser ? 'คุณ' : 'Cline AI'}</div>
      <div className="chat-msg__bubble">
        {message.text}
        {message.needsPermission ? (
          <div className="chat-perm">
            <IconShield size={13} />
            <span>
              ขออนุญาตเข้าถึงเครื่อง — cline ถูกตั้งให้ต้องอนุมัติการทำงานทุกครั้ง
              (ปิด auto-approve อยู่) เปิดได้ในแถบตั้งค่าด้านบน
            </span>
          </div>
        ) : null}
      </div>
      {message.meta ? <div className="chat-msg__meta">{message.meta}</div> : null}
    </div>
  )
}

export function AiView() {
  const { settings, update } = useSettings()
  const [info, setInfo] = useState(null)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [busy, setBusy] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const [credentialId, setCredentialId] = useState(settings.aiCredentialId ?? null)
  const [contextText, setContextText] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    api.ai.info().then(setInfo)
  }, [])

  const scrollDown = () => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))
  }


  const send = useCallback(async () => {
    const prompt = input.trim()
    if (!prompt || busy) return

    setMessages((current) => [...current, { role: 'user', text: prompt }])
    setInput('')
    setBusy(true)
    scrollDown()

    // Each turn is a fresh cline conversation — `cline --json --id <session>`
    // does not support resume (rejects prompt + piped stdin), so sessionId is
    // never sent back. result.session is cline's own conv id for display.
    let result = null
    try {
      result = await api.ai.chat({
        prompt,
        credentialId: credentialId ?? undefined,
        autoApprove: settings.aiAutoApprove ?? false,
        contextText: contextText || undefined
      })
    } catch (err) {
      result = { ok: false, error: err?.message ?? 'IPC error' }
    }

    if (result?.session) setSessionId(result.session)

    setMessages((current) => [
      ...current,
      {
        role: 'ai',
        text:
          result?.text ||
          `เกิดข้อผิดพลาด: ${result?.error ?? 'ไม่ทราบสาเหตุ'}`,
        needsPermission: Boolean(result?.needsPermission),
        meta: result?.model
          ? `${result.model} · ${result.toolCalls ?? 0} tool calls · iters ${result.iterations ?? 0}${
              result.usage?.cost ? ` · $${Number(result.usage.cost).toFixed(4)}` : ''
            }`
          : null
      }
    ])
    setBusy(false)
    scrollDown()
  }, [input, busy, settings, credentialId, contextText])

  const clearChat = () => {
    setMessages([])
    setSessionId(null)
  }

  const abort = async () => {
    if (sessionId) await api.ai.abort(sessionId)
    setBusy(false)
  }

  if (!bridgeAvailable) {
    return (
      <div className="view">
        <Panel>
          <Empty icon={<IconAlert size={20} />} title="ต้องรันใน Electron" />
        </Panel>
      </div>
    )
  }

  return (
    <div className="view">
      <Panel
        title="Credentials — เลือกและจัดการ API / Token"
        flush
      >
        <CredentialManager />
      </Panel>

      <Panel
        title="Chat"
        hint={sessionId ? `session: ${sessionId.slice(0, 18)}…` : 'แชททั่วไป หรือสั่งงานเครื่องก็ได้'}
        flush
      >
        <div className="chat-scroll">
          {messages.length === 0 ? (
            <Empty
              icon={<IconTerminal size={20} />}
              title="เริ่มบทสนทนา"
              text="ถามอะไรก็ได้ หรือสั่งงานเครื่อง เช่น “ตรวจว่า port 8888 คือ app อะไร” — ถ้า auto-approve ปิดอยู่ AI จะขออนุญาตก่อนรันคำสั่งเสมอ"
            />
          ) : (
            messages.map((message, index) => <MessageBubble key={index} message={message} />)
          )}
          {busy ? (
            <div className="chat-msg chat-msg--ai">
              <div className="chat-msg__role">Cline AI</div>
              <div className="chat-msg__bubble chat-msg__bubble--typing">
                <span className="spinner" /> กำลังคิด/ทำงาน…
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <div className="chat-input">
          <textarea
            className="input chat-input__text"
            rows={2}
            placeholder="พิมพ์ข้อความ… (Enter = ส่ง, Shift+Enter = ขึ้นบรรทัดใหม่)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            disabled={busy}
          />
          <div className="chat-input__actions">
            <button type="button" className="btn btn--ghost btn--sm" onClick={clearChat}>
              <IconClose size={13} /> ล้างแชท
            </button>
            {busy ? (
              <button type="button" className="btn btn--sm" onClick={abort}>
                <IconPause size={13} /> หยุด
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={send}
              disabled={busy || !input.trim()}
            >
              ส่งข้อความ
            </button>
          </div>
        </div>
      </Panel>
    </div>
  )
}
