import React, { useEffect } from 'react'
import { IconAlert, IconShield, IconSparkles } from './icons.jsx'

const TONE_ICON = { danger: IconAlert, warn: IconAlert, accent: IconSparkles, safe: IconShield }

/**
 * Blocking confirmation modal. Used for every destructive action
 * (signals, power actions) so nothing fires on a single stray click.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'accent',
  busy = false,
  onConfirm,
  onCancel
}) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) onCancel?.()
      if (event.key === 'Enter' && !busy) onConfirm?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel, onConfirm])

  if (!open) return null

  const Icon = TONE_ICON[tone] ?? IconAlert
  const buttonClass = tone === 'danger' ? 'btn btn--danger' : 'btn btn--primary'

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
          <span className={`modal__icon modal__icon--${tone === 'safe' ? 'accent' : tone}`}>
            <Icon size={17} />
          </span>
          {title}
        </h3>
        <div className="modal__text">{message}</div>
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className={buttonClass} onClick={onConfirm} disabled={busy}>
            {busy ? <span className="spinner" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
