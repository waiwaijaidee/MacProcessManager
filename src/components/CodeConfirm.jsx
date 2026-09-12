import React, { useEffect, useState } from 'react'
import { IconAlert, IconClose } from './icons.jsx'

/**
 * Confirmation that cannot be dismissed by a stray click or a keyboard
 * accident: the user must retype a freshly generated 6 digit code.
 */
export function CodeConfirm({
  open,
  title,
  message,
  code,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  busy = false,
  onConfirm,
  onCancel,
  onRegenerate
}) {
  const [value, setValue] = useState('')
  const [attempts, setAttempts] = useState(0)

  // Fresh state every time the dialog opens.
  useEffect(() => {
    if (open) {
      setValue('')
      setAttempts(0)
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) onCancel?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null

  const matches = value.trim() === String(code)
  const valid = matches && String(code).length === 6

  return (
    <div className="modal-backdrop" onMouseDown={() => !busy && onCancel?.()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3 className="modal__title">
          <span className="modal__icon modal__icon--danger">
            <IconAlert size={17} />
          </span>
          {title}
        </h3>

        <div className="modal__text">{message}</div>

        <div className="code-challenge">
          <div className="code-challenge__label">
            พิมพ์รหัสนี้เพื่อยืนยัน
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              title="Generate a new code"
              onClick={() => onRegenerate?.()}
            >
              <IconClose size={12} /> สุ่มใหม่
            </button>
          </div>
          <div className="code-challenge__code">{code}</div>
          <input
            className="input code-challenge__input"
            value={value}
            onChange={(event) => {
              const digits = event.target.value.replace(/\D/g, '').slice(0, 6)
              setValue(digits)
              if (digits.length === 6 && digits !== String(code)) {
                setAttempts((current) => current + 1)
              }
            }}
            inputMode="numeric"
            autoComplete="off"
            placeholder="______"
            autoFocus
            disabled={busy}
            aria-label="Confirmation code"
          />
          {!matches && value.length === 6 ? (
            <div className="code-challenge__error">
              รหัสไม่ถูกต้อง{attempts > 1 ? ` (พยายาม ${attempts} ครั้ง)` : ''} — ลองพิมพ์ใหม่อีกครั้ง
            </div>
          ) : null}
        </div>

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={onConfirm}
            disabled={busy || !valid}
            title={valid ? confirmLabel : 'พิมพ์รหัส 6 หลักให้ตรงก่อน'}
          >
            {busy ? <span className="spinner" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
