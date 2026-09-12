import React from 'react'

export function Empty({ icon, title, text }) {
  return (
    <div className="empty">
      {icon ? <span className="empty__icon">{icon}</span> : null}
      <div className="empty__title">{title}</div>
      {text ? <div className="empty__text">{text}</div> : null}
    </div>
  )
}

export function Panel({ title, hint, actions, flush = false, children, className = '' }) {
  return (
    <section className={`panel ${className}`.trim()}>
      {title ? (
        <header className="panel__header">
          <h2 className="panel__title">{title}</h2>
          {hint ? <span className="panel__hint">{hint}</span> : null}
          {actions ? <div style={{ marginLeft: 'auto' }} className="row">{actions}</div> : null}
        </header>
      ) : null}
      <div className={`panel__body${flush ? ' panel__body--flush' : ''}`}>{children}</div>
    </section>
  )
}

export function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      className={`switch${checked ? ' is-on' : ''}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    />
  )
}

export function FieldRow({ title, description, children }) {
  return (
    <div className="field-row">
      <div className="field-row__text">
        <div className="field-row__title">{title}</div>
        {description ? <div className="field-row__desc">{description}</div> : null}
      </div>
      {children}
    </div>
  )
}

export function KeyValue({ rows }) {
  return (
    <div className="kv">
      {rows.filter(Boolean).map((row, index) => (
        <div className="kv__row" key={`${row.key}-${index}`}>
          <span className="kv__key">{row.key}</span>
          <span className={`kv__value${row.mono ? ' kv__value--mono' : ''}`}>{row.value}</span>
        </div>
      ))}
    </div>
  )
}
