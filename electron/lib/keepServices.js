import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { run } from './exec.js'
import { dockerAction } from './services.js'

/**
 * "Always keep running" services.
 *
 * A user-maintained list of services that must stay alive even while the
 * machine is asleep (Sleep panel → "หลับแบบรัน service ที่เลือก").
 * Two kinds are supported:
 *   - container: a Docker container name — started with `docker start`
 *   - command:   an arbitrary shell command (e.g. a web server) spawned
 *                detached, so it survives after this app quits.
 *
 * The list is persisted as JSON in the Electron userData directory so it
 * survives restarts.
 */

const STORE_FILE = 'keep-services.json'

function storePath() {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return path.join(dir, STORE_FILE)
}

function loadStore() {
  try {
    const raw = JSON.parse(readFileSync(storePath(), 'utf8'))
    return Array.isArray(raw.services) ? raw.services : []
  } catch {
    return []
  }
}

function saveStore(services) {
  try {
    writeFileSync(storePath(), JSON.stringify({ version: 1, services }, null, 2))
    return true
  } catch (error) {
    return { ok: false, error: error?.message ?? String(error) }
  }
}

export function listKeepServices() {
  return { ok: true, services: loadStore() }
}

/** Create or update one entry. Fields: id?, name, kind ('container'|'command'), command?, active? */
export function saveKeepService(input = {}) {
  const name = String(input.name ?? '').trim()
  if (!name) return { ok: false, error: 'ต้องระบุชื่อ service' }

  const kind = input.kind === 'command' ? 'command' : 'container'
  const command = kind === 'command' ? String(input.command ?? '').trim() : null
  if (kind === 'command' && !command) {
    return { ok: false, error: 'ต้องระบุคำสั่งที่จะรัน (command)' }
  }

  const services = loadStore()
  const existing = input.id ? services.find((s) => s.id === input.id) : services.find((s) => s.name === name)

  const entry = {
    id: existing?.id ?? `keep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    kind,
    command,
    active: input.active === undefined ? existing?.active ?? true : Boolean(input.active),
    createdAt: existing?.createdAt ?? Date.now()
  }

  if (existing) Object.assign(existing, entry, { id: existing.id, createdAt: existing.createdAt })
  else services.push(entry)

  const saved = saveStore(services)
  if (saved !== true) return saved
  return { ok: true, service: entry, services }
}

export function removeKeepService(id) {
  const services = loadStore()
  const next = services.filter((s) => s.id !== id)
  if (next.length === services.length) return { ok: false, error: `ไม่พบ service id ${id}` }
  saveStore(next)
  return { ok: true, services: next }
}

/** Spawned child processes started by ensureKeepServicesAlive(). */
const spawned = new Map()

/** Make sure every active keep-service is actually running right now. */
export async function ensureKeepServicesAlive() {
  const services = loadStore().filter((s) => s.active !== false)
  const results = []

  for (const service of services) {
    if (service.kind === 'container') {
      const result = await dockerAction({ name: service.name, action: 'start' })
      // "already running" style failures are success for our purposes.
      const ok = result.ok || /already|running/i.test(result.error ?? '')
      results.push({ id: service.id, name: service.name, kind: 'container', ok, error: result.ok ? null : result.error })
    } else if (service.kind === 'command') {
      const command = String(service.command ?? '').trim()
      const args = command.split(/\s+/).filter(Boolean)
      const bin = args.shift()
      if (!bin) {
        results.push({ id: service.id, name: service.name, kind: 'command', ok: false, error: 'no command' })
        continue
      }
      if (spawned.has(service.id)) {
        results.push({ id: service.id, name: service.name, kind: 'command', ok: true, alreadyRunning: true })
        continue
      }
      try {
        const child = spawn(bin, args, { detached: true, stdio: 'ignore' })
        child.unref()
        child.on('exit', () => spawned.delete(service.id))
        spawned.set(service.id, child)
        results.push({ id: service.id, name: service.name, kind: 'command', ok: true, pid: child.pid })
      } catch (error) {
        results.push({ id: service.id, name: service.name, kind: 'command', ok: false, error: error?.message })
      }
    }
  }

  return { ok: results.every((r) => r.ok), results }
}

/** Stop only the commands this app spawned (containers keep running by design). */
export function stopSpawnedCommands() {
  for (const [id, child] of spawned) {
    try {
      child.kill('SIGTERM')
    } catch {
      /* already gone */
    }
    spawned.delete(id)
  }
}

/** Liveness for the UI: container via docker ps, command via tracked pid. */
export async function getKeepServicesStatus() {
  const services = loadStore()
  const status = []
  for (const service of services) {
    if (service.kind === 'container') {
      const result = await run('/usr/bin/env', ['docker', 'ps', '--filter', `name=^/${service.name}$`, '--format', '{{.Names}}'], { timeout: 4000 })
      const running = Boolean(result.ok && (result.stdout ?? '').includes(service.name))
      status.push({ ...service, running, active: service.active !== false })
    } else {
      const child = spawned.get(service.id)
      status.push({ ...service, running: Boolean(child && child.pid && !child.killed), active: service.active !== false })
    }
  }
  return { ok: true, services: status }
}

