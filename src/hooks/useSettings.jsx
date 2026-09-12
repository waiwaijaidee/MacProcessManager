import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'mpm.settings.v1'

export const DEFAULT_SETTINGS = {
  theme: 'dark', // 'dark' | 'light' | 'system'
  refreshMs: 2000,
  confirmKill: true,
  confirmPower: true,
  showSystemProcesses: true,
  density: 'comfortable', // 'comfortable' | 'compact'
  defaultSort: 'cpu',
  defaultDirection: 'desc',
  showSparklines: true,
  autoEscalateKill: true,
  terminateSignal: 'TERM',
  // Pinned services / containers. Entries look like
  // `{ id, kind: 'port'|'container', port?, container?, label, url? }`.
  favorites: [],
  autoCheckHealth: true,
  // Services page: `groupServices` toggles "group by application" and
  // `serviceGroups` holds user renames keyed by group id, e.g.
  // `{ 'app:MAMP': 'Local Web Stack (MAMP)' }`.
  groupServices: true,
  serviceGroups: {}
}

function readStored() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function resolveTheme(theme) {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

const SettingsContext = createContext(null)

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(readStored)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      /* storage can be unavailable; settings simply will not persist */
    }
  }, [settings])

  // Apply the resolved theme to <html data-theme> for the CSS tokens.
  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(settings.theme)
    }
    apply()

    if (settings.theme !== 'system') return undefined
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [settings.theme])

  const update = useCallback((patch) => {
    setSettings((current) => ({ ...current, ...patch }))
  }, [])

  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), [])

  const value = useMemo(() => ({ settings, update, reset }), [settings, update, reset])

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (!context) throw new Error('useSettings must be used inside <SettingsProvider>')
  return context
}
