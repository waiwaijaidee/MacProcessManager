import { app, ipcMain, shell } from 'electron'
import {
  killProcess,
  reniceProcess,
  signalProcess,
  getProcessDetail,
  getTreeForPid,
  SIGNALS
} from './actions.js'
import { getApps, getProcesses } from './processes.js'
import {
  checkHealth,
  dockerAction,
  dockerLogs,
  getServiceOverview,
  listDocker,
  listListeners,
  probePort
} from './services.js'
import {
  SLEEP_MODES,
  applySleepMode,
  buildSleepPlan,
  getSleepState,
  restoreAfterWake
} from './sleep.js'
import { abortChat, chatWithApi, chatWithCline, clineInfo, testConnection, testCredential } from './ai.js'
import {
  ensureKeepServicesAlive,
  getKeepServicesStatus,
  listKeepServices,
  removeKeepService,
  saveKeepService
} from './keepServices.js'
import {
  deleteCredential,
  listCredentials,
  resolveCredential,
  saveCredential,
  setActiveCredential
} from './credentials.js'
import {
  POWER_ACTIONS,
  getSessions,
  getSystemStats,
  invalidateSystemStats,
  runPowerAction
} from './system.js'

/**
 * The complete renderer <-> shell surface.
 *
 * Kept in its own module (rather than inside `main.js`) so it can be
 * registered by tests without booting a window, and so the list of channels
 * lives in exactly one place.
 */
export function registerIpc() {
  const handle = (channel, listener) => {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, listener)
  }

  // ---- read only -------------------------------------------------
  handle('processes:list', (_event, options = {}) =>
    getProcesses({ maxAgeMs: Number(options?.maxAgeMs) || 300 })
  )

  handle('processes:apps', () => getApps())

  handle('processes:detail', (_event, pid) => getProcessDetail(pid))

  handle('processes:tree', (_event, pid) => getTreeForPid(pid))

  handle('system:stats', (_event, options = {}) =>
    getSystemStats({
      maxAgeMs: Number(options?.maxAgeMs) || 1200,
      force: Boolean(options?.force)
    })
  )

  handle('system:refresh', async () => {
    invalidateSystemStats()
    return getSystemStats({ force: true })
  })

  handle('system:sessions', () => getSessions())

  handle('system:powerActions', () =>
    Object.entries(POWER_ACTIONS).map(([id, action]) => ({
      id,
      label: action.label,
      description: action.description,
      danger: Boolean(action.danger)
    }))
  )

  handle('app:info', () => ({
    name: app.name,
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
    signals: Object.entries(SIGNALS).map(([id, spec]) => ({ id, ...spec }))
  }))

  handle('services:overview', () => getServiceOverview())

  handle('services:listeners', () => listListeners())

  handle('services:docker', () => listDocker())

  handle('services:probe', (_event, payload = {}) =>
    probePort({ port: Number(payload?.port), timeoutMs: Number(payload?.timeoutMs) || 2500 })
  )

  handle('services:health', (_event, payload = {}) =>
    checkHealth({
      port: Number(payload?.port),
      path: payload?.path ?? '/',
      protocol: payload?.protocol ?? 'http',
      timeoutMs: Number(payload?.timeoutMs) || 2500
    })
  )

  handle('services:dockerAction', (_event, payload = {}) => dockerAction(payload ?? {}))

  handle('services:dockerLogs', (_event, payload = {}) => dockerLogs(payload ?? {}))

  handle('sleep:modes', () => SLEEP_MODES)
  handle('sleep:plan', (_e, options = {}) => buildSleepPlan(options))
  handle('sleep:apply', (_e, options = {}) => applySleepMode(options))
  handle('sleep:state', () => getSleepState())
  handle('sleep:restore', () => restoreAfterWake())

  handle('keepServices:list', () => listKeepServices())
  handle('keepServices:status', () => getKeepServicesStatus())
  handle('keepServices:save', (_e, input = {}) => saveKeepService(input ?? {}))
  handle('keepServices:remove', (_e, id) => removeKeepService(id))
  handle('keepServices:ensure', () => ensureKeepServicesAlive())

  handle('ai:info', () => clineInfo())
  handle('ai:test', async (_e, options = {}) => testConnection(options))
  handle('ai:chat', async (event, options = {}) => {
    // Credentials decide the engine: the cline CLI or a direct HTTP provider.
    const resolved = resolveCredential(options.credentialId)
    if (!resolved.ok) return { ok: false, error: resolved.error }

    const { credential, spec } = resolved

    if (spec.kind === 'cline') {
      return chatWithCline(
        {
          prompt: options.prompt,
          sessionId: options.sessionId,
          provider: options.provider || credential.provider,
          model: options.model || credential.model || undefined,
          apiKey: options.apiKey || credential.apiKey || undefined,
          cwd: options.cwd,
          autoApprove: Boolean(options.autoApprove),
          timeout: options.timeout,
          thinking: options.thinking
        },
        (progress) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('ai:chat:progress', { id: options.id, ...progress })
          }
        }
      )
    }

    return chatWithApi({
      credential,
      kind: spec.kind,
      baseUrl: credential.baseUrl || spec.baseUrl,
      apiKey: credential.apiKey,
      model: credential.model || spec.defaultModel,
      prompt: options.prompt,
      contextText: options.contextText,
      timeoutMs: Math.min(Math.max(Number(options.timeout) || 90, 20), 300) * 1000
    })
  })
  handle('ai:abort', (_e, id) => abortChat(id))

  handle('credentials:list', () => listCredentials())
  handle('credentials:save', (_e, input = {}) => saveCredential(input))
  handle('credentials:delete', (_e, id) => deleteCredential(id))
  handle('credentials:activate', (_e, id) => setActiveCredential(id))
  handle('credentials:test', async (_e, id) => {
    const resolved = resolveCredential(id)
    if (!resolved.ok) return resolved
    return testCredential(resolved.credential, resolved.spec)
  })

  // ---- state changing --------------------------------------------
  handle('processes:signal', (_event, payload = {}) => signalProcess(payload ?? {}))

  handle('processes:kill', (_event, payload = {}) => killProcess(payload ?? {}))

  handle('processes:renice', (_event, payload = {}) => reniceProcess(payload ?? {}))

  handle('system:power', (_event, name) => runPowerAction(name))

  handle('app:openExternal', (_event, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url)
    return { ok: true }
  })

  return ipcMain
}
