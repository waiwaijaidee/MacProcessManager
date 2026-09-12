import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { IconAlert, IconCheck, IconClose, IconInfo } from './icons.jsx'

const ToastContext = createContext(null)

const TONE_ICON = {
  ok: IconCheck,
  error: IconAlert,
  info: IconInfo
}

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    setItems((current) => current.filter((item) => item.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback(
    ({ title, text = '', tone = 'info', duration = 4200 }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      setItems((current) => [...current.slice(-4), { id, title, text, tone }])
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration)
        )
      }
      return id
    },
    [dismiss]
  )

  const value = useMemo(
    () => ({
      push,
      dismiss,
      success: (title, text) => push({ title, text, tone: 'ok' }),
      error: (title, text) => push({ title, text, tone: 'error', duration: 7000 })
    }),
    [push, dismiss]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((item) => {
          const Icon = TONE_ICON[item.tone] ?? IconInfo
          return (
            <div key={item.id} className={`toast toast--${item.tone}`}>
              <span className="toast__icon">
                <Icon size={17} />
              </span>
              <div>
                <div className="toast__title">{item.title}</div>
                {item.text ? <div className="toast__text">{item.text}</div> : null}
              </div>
              <button
                type="button"
                className="toast__close"
                onClick={() => dismiss(item.id)}
                aria-label="Dismiss notification"
              >
                <IconClose size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside <ToastProvider>')
  return context
}
