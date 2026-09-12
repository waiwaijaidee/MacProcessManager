/**
 * Thin, typed-ish wrapper around the preload bridge (`window.mpm`).
 *
 * When the UI is opened in a plain browser (e.g. `vite dev` without Electron)
 * the bridge is missing, so we fall back to an inert mock that keeps the shell
 * renderable and flags `bridgeAvailable: false` for the UI to warn about.
 */

const bridge = typeof window !== 'undefined' ? window.mpm : undefined

export const bridgeAvailable = Boolean(bridge)

const emptySystem = {
  host: { hostname: 'unavailable', model: 'unavailable', cpuBrand: 'unavailable', osVersion: '', osBuild: '' },
  cpu: { user: 0, sys: 0, idle: 100, usage: 0, cores: 0, physicalCores: 0 },
  loadAverage: [0, 0, 0],
  loadPercent: 0,
  processes: { total: 0, running: 0, sleeping: 0, threads: 0 },
  memory: {
    total: 0,
    used: 0,
    usedPercent: 0,
    app: 0,
    cachedFiles: 0,
    wired: 0,
    compressed: 0,
    active: 0,
    inactive: 0,
    purgeable: 0,
    free: 0,
    pageSize: 4096,
    pressure: 0
  },
  swap: { total: 0, used: 0, free: 0 },
  disks: [],
  thermal: { schedulerLimit: 100, speedLimit: 100, throttled: false },
  uptime: 0,
  bootTime: 0,
  timezone: '',
  user: { username: '', homedir: '' }
}

function mock() {
  const unavailable = async () => ({ ok: false, error: 'Electron bridge unavailable.' })
  return {
    processes: {
      list: async () => ({ at: Date.now(), processes: [], totals: { count: 0, cpuSum: 0, memoryBytes: 0 } }),
      apps: async () => [],
      detail: unavailable,
      tree: async () => ({ ok: false, error: 'Electron bridge unavailable.' }),
      signal: unavailable,
      kill: unavailable,
      renice: unavailable
    },
    system: {
      stats: async () => emptySystem,
      refresh: async () => emptySystem,
      sessions: async () => [],
      powerActions: async () => [],
      power: unavailable
    },
    services: {
      overview: async () => ({
        ok: false,
        at: 0,
        docker: { available: false, reason: 'Electron bridge unavailable.', version: null, bin: null },
        containers: [],
        listeners: [],
        listenerError: null,
        services: []
      }),
      listeners: async () => ({ ok: false, error: 'Electron bridge unavailable.', listeners: [] }),
      docker: async () => ({ ok: false, reason: 'Electron bridge unavailable.', containers: [] }),
      probe: async () => ({ ok: false, reason: 'unavailable', latencyMs: 0 }),
      health: async () => ({ ok: false, status: 'unavailable', code: null }),
      dockerAction: unavailable,
      dockerLogs: async () => ({ ok: false, error: 'Electron bridge unavailable.' })
    },
    sleep: {
      modes: async () => ({}),
      plan: async () => ({ ok: false, error: 'Electron bridge unavailable.' }),
      apply: async () => ({ ok: false, error: 'Electron bridge unavailable.' }),
      state: async () => ({ caffeinateRunning: false }),
      restore: async () => ({ ok: false, error: 'Electron bridge unavailable.' })
    },
    keepServices: {
      list: async () => ({ ok: true, services: [] }),
      status: async () => ({ ok: true, services: [] }),
      save: unavailable,
      remove: unavailable,
      ensure: async () => ({ ok: false, error: 'Electron bridge unavailable.' })
    },
    ai: {
      info: async () => ({ available: false, reason: 'Electron bridge unavailable.' }),
      test: async () => ({ ok: false, error: 'Electron bridge unavailable.' }),
      chat: async () => ({ ok: false, error: 'Electron bridge unavailable.' }),
      abort: async () => ({ ok: false }),
      onProgress: () => () => {}
    },
    credentials: {
      list: async () => ({ ok: true, activeId: null, providers: [], credentials: [] }),
      save: async () => ({ ok: false, error: 'Electron bridge unavailable.' }),
      delete: async () => ({ ok: false }),
      activate: async () => ({ ok: false }),
      test: async () => ({ ok: false, error: 'Electron bridge unavailable.' })
    },
    app: {
      info: async () => ({ name: 'Mac Process Manager', version: '0.0.0', platform: 'browser' }),
      openExternal: async () => ({ ok: false })
    }
  }
}

export const api = bridge ?? mock()
