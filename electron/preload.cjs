const { contextBridge, ipcRenderer } = require('electron')

/**
 * Preload runs sandboxed with context isolation, so the renderer only ever
 * sees this frozen, explicitly enumerated API. There is no `require`,
 * no `fs`, and no way to reach `ipcRenderer` directly from the page.
 *
 * Every channel mirrors a handler registered in `electron/main.js`.
 */
const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload)

const bridge = {
  processes: {
    list: (options) => invoke('processes:list', options),
    apps: () => invoke('processes:apps'),
    detail: (pid) => invoke('processes:detail', pid),
    tree: (pid) => invoke('processes:tree', pid),
    signal: (payload) => invoke('processes:signal', payload),
    kill: (payload) => invoke('processes:kill', payload),
    renice: (payload) => invoke('processes:renice', payload)
  },
  system: {
    stats: (options) => invoke('system:stats', options),
    refresh: () => invoke('system:refresh'),
    sessions: () => invoke('system:sessions'),
    powerActions: () => invoke('system:powerActions'),
    power: (name) => invoke('system:power', name)
  },
  services: {
    overview: () => invoke('services:overview'),
    listeners: () => invoke('services:listeners'),
    docker: () => invoke('services:docker'),
    probe: (payload) => invoke('services:probe', payload),
    health: (payload) => invoke('services:health', payload),
    dockerAction: (payload) => invoke('services:dockerAction', payload),
    dockerLogs: (payload) => invoke('services:dockerLogs', payload)
  },
  sleep: {
    modes: () => invoke('sleep:modes'),
    plan: (options) => invoke('sleep:plan', options),
    apply: (options) => invoke('sleep:apply', options),
    state: () => invoke('sleep:state'),
    restore: () => invoke('sleep:restore')
  },
  keepServices: {
    list: () => invoke('keepServices:list'),
    status: () => invoke('keepServices:status'),
    save: (input) => invoke('keepServices:save', input),
    remove: (id) => invoke('keepServices:remove', id),
    ensure: () => invoke('keepServices:ensure')
  },
  updates: {
    info: () => invoke('updates:info'),
    check: () => invoke('updates:check'),
    apply: () => invoke('updates:apply')
  },
  developer: {
    content: () => invoke('developer:content')
  },
  hotUpdate: {
    serverUrl: () => invoke('hotUpdate:serverUrl'),
    setServerUrl: (url) => invoke('hotUpdate:setServerUrl', url),
    check: () => invoke('hotUpdate:check'),
    apply: () => invoke('hotUpdate:apply'),
    rollback: () => invoke('hotUpdate:rollback'),
    relaunch: () => invoke('hotUpdate:relaunch')
  },
  ai: {
    info: () => invoke('ai:info'),
    test: (options) => invoke('ai:test', options),
    chat: (options) => invoke('ai:chat', options),
    abort: (id) => invoke('ai:abort', id),
    onProgress: (handler) => {
      const listener = (_event, payload) => handler(payload)
      ipcRenderer.on('ai:chat:progress', listener)
      return () => ipcRenderer.removeListener('ai:chat:progress', listener)
    }
  },
  credentials: {
    list: () => invoke('credentials:list'),
    save: (input) => invoke('credentials:save', input),
    delete: (id) => invoke('credentials:delete', id),
    activate: (id) => invoke('credentials:activate', id),
    test: (id) => invoke('credentials:test', id)
  },
  app: {
    info: () => invoke('app:info'),
    openExternal: (url) => invoke('app:openExternal', url)
  }
}

contextBridge.exposeInMainWorld('mpm', Object.freeze(bridge))
contextBridge.exposeInMainWorld('mpmPlatform', process.platform)
