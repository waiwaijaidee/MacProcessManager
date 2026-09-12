import { spawn } from 'node:child_process'
import os from 'node:os'
import { run } from './exec.js'
import { dockerAction, listDocker } from './services.js'
import { ensureKeepServicesAlive } from './keepServices.js'

const OSA = '/usr/bin/osascript'
const PMSET = '/usr/bin/pmset'
const CGSESSION =
  '/System/Library/CoreServices/Menu Extras/User.menu/Contents/Resources/CGSession'

/**
 * Sleep modes
 *
 * - `screen`        ปิดจออย่างเดียว - ทุก process/service ยังรัน
 * - `keep-running`  ปิดจอ + caffeinate กันเครื่องหลับลึก - service ที่เลือกยังรัน
 * - `full-sleep`    หยุด container ที่เลือก (หรือทั้งหมด) แล้วสั่ง system sleep จริง
 * - `lock`          lock หน้าจอ - ทุกอย่างยังรัน
 */
export const SLEEP_MODES = {
  screen: {
    id: 'screen',
    label: 'ปิดหน้าจอเท่านั้น',
    summary: 'System และทุก service ยังทำงานต่อ',
    danger: false
  },
  'keep-running': {
    id: 'keep-running',
    label: 'หลับแบบรัน service ที่เลือก',
    summary: 'ปิดจอ + กันเครื่องหลับลึกด้วย caffeinate — service ที่เลือกยังรันต่อ',
    danger: false
  },
  'full-sleep': {
    id: 'full-sleep',
    label: 'หลับแบบปิด service ทั้งหมด',
    summary: 'หยุด container/service ที่เลือก แล้วสั่งเครื่องหลับจริง',
    danger: true
  },
  lock: {
    id: 'lock',
    label: 'Lock หน้าจอ',
    summary: 'ล็อกหน้าจอ — process และ service ทุกตัวยังรัน',
    danger: false
  }
}

/** caffeinate keeps the machine awake while the screen is off. */
let caffeinate = null
let lastState = null

function stopAssertion() {
  if (caffeinate) {
    try {
      caffeinate.kill('SIGTERM')
    } catch {
      /* already gone */
    }
    caffeinate = null
  }
}

/** Everything that will happen, before anything actually runs. */
export async function buildSleepPlan({
  mode,
  keepContainers = [],
  stopContainers = [],
  minutes = 60,
  message = ''
}) {
  const spec = SLEEP_MODES[mode]
  if (!spec) return { ok: false, error: `Unknown sleep mode: ${mode}` }

  const docker = await listDocker()
  const running = (docker.containers ?? []).filter((container) => container.running)
  const stop = new Set(stopContainers)
  const keep = new Set(keepContainers)

  const steps = []
  let willStop = []
  let willKeep = []

  if (mode === 'keep-running') {
    willStop = running.filter((c) => stop.has(c.name))
    willKeep = running.filter((c) => !stop.has(c.name))
    for (const c of willStop) steps.push(`docker stop ${c.name}`)
    steps.push(`caffeinate -i -m -t ${Math.max(1, minutes) * 60}  (กันเครื่องหลับลึก ${minutes} นาที)`)
    steps.push('pmset displaysleepnow  (ปิดหน้าจอ)')
  } else if (mode === 'full-sleep') {
    willStop = running.filter((c) => stop.has(c.name) || (keep.size > 0 && !keep.has(c.name)))
    willKeep = running.filter((c) => !willStop.some((s) => s.name === c.name))
    for (const c of willStop) steps.push(`docker stop ${c.name}`)
    steps.push('osascript sleep  (สั่งเครื่องหลับ)')
  } else if (mode === 'screen') {
    willKeep = running
    steps.push('pmset displaysleepnow  (ปิดหน้าจอ)')
  } else if (mode === 'lock') {
    willKeep = running
    steps.push('CGSession -suspend  (lock หน้าจอ)')
  }

  return {
    ok: true,
    mode,
    label: spec.label,
    summary: spec.summary,
    danger: spec.danger,
    steps,
    willStop: willStop.map((c) => ({ name: c.name, image: c.image, state: c.state })),
    willKeep: willKeep.map((c) => ({
      name: c.name,
      ports: c.ports.filter((p) => p.host).map((p) => p.host)
    })),
    runningCount: running.length,
    message: message || null,
    caffeinateMinutes: mode === 'keep-running' ? minutes : null
  }
}

/**
 * Execute a sleep mode. `dryRun: true` returns the plan without any side
 * effect so the UI and the tests can verify it safely.
 */
export async function applySleepMode(options = {}) {
  const plan = await buildSleepPlan(options)
  if (!plan.ok) return plan

  const { mode, minutes = 60 } = options
  if (options.dryRun) return { ok: true, dryRun: true, ...plan }

  const applied = []

  if (mode === 'full-sleep' || (mode === 'keep-running' && (options.stopContainers ?? []).length)) {
    for (const container of plan.willStop) {
      const result = await dockerAction({ name: container.name, action: 'stop' })
      applied.push({ container: container.name, ok: result.ok, error: result.ok ? null : result.error })
      if (result.ok && Array.isArray(lastState?.stoppedContainers)) {
        lastState.stoppedContainers.push(container.name)
      }
    }
  }

  if (mode === 'keep-running') {
    // Keep the user's "always running" services alive before the screen
    // goes off — containers get started, custom commands get spawned.
    const keep = await ensureKeepServicesAlive()
    if (keep.results?.length) {
      applied.push({ keepServices: keep.results })
    }

    stopAssertion()
    if (options.keepForever) {
      // No -t flag: the assertion holds until restore/wake.
      caffeinate = spawn('/usr/bin/caffeinate', ['-i', '-m'], {
        detached: true,
        stdio: 'ignore'
      })
      caffeinate.unref()
      applied.push({ caffeinate: true, forever: true })
    } else {
      const seconds = Math.max(1, minutes) * 60
      caffeinate = spawn('/usr/bin/caffeinate', ['-i', '-m', '-t', String(seconds)], {
        detached: true,
        stdio: 'ignore'
      })
      caffeinate.unref()
      applied.push({ caffeinate: true, seconds })
    }
    await run(PMSET, ['displaysleepnow'])
    applied.push({ displaySleep: true })
  } else if (mode === 'screen') {
    await run(PMSET, ['displaysleepnow'])
    applied.push({ displaySleep: true })
  } else if (mode === 'full-sleep') {
    await run(OSA, ['-e', 'tell application "System Events" to sleep'])
    applied.push({ systemSleep: true })
  } else if (mode === 'lock') {
    await run(CGSESSION, ['-suspend'])
    applied.push({ lock: true })
  }

  lastState = {
    ...(lastState ?? {}),
    mode,
    at: Date.now(),
    applied,
    keptContainers: plan.willKeep.map((c) => c.name),
    stoppedContainers: plan.willStop.map((c) => c.name),
    caffeinateActive: mode === 'keep-running',
    caffeinateMinutes: mode === 'keep-running' && !options.keepForever ? minutes : null,
    caffeinateForever: mode === 'keep-running' && Boolean(options.keepForever)
  }

  return {
    ok: true,
    mode,
    label: plan.label,
    applied,
    willKeep: plan.willKeep,
    stopped: plan.willStop.map((c) => c.name),
    message: plan.message ?? null
  }
}

/** Current sleep/assertion state, shown next to the mode buttons. */
export async function getSleepState() {
  const caffeinateRunning = Boolean(caffeinate && caffeinate.pid && !caffeinate.killed)
  const power = await run(PMSET, ['-g'], { timeout: 6000 })
  const settings = {}
  for (const line of (power.stdout ?? '').split('\n')) {
    const match = line.match(/^\s*([a-z]+)\s+(\S+)/)
    if (match) settings[match[1]] = match[2]
  }

  return {
    host: os.hostname(),
    caffeinateRunning,
    caffeinateMinutes: lastState?.caffeinateMinutes ?? null,
    caffeinateForever: lastState?.caffeinateForever ?? false,
    lastMode: lastState?.mode ?? null,
    lastAt: lastState?.at ?? null,
    keptContainers: lastState?.keptContainers ?? [],
    stoppedContainers: lastState?.stoppedContainers ?? [],
    powerSettings: settings
  }
}

/** Cancel the caffeinate assertion and restart everything this app stopped. */
export async function restoreAfterWake() {
  stopAssertion()
  const names = lastState?.stoppedContainers ?? []
  const restored = []
  for (const name of names) {
    const result = await dockerAction({ name, action: 'start' })
    restored.push({ name, ok: result.ok, error: result.ok ? null : result.error })
  }
  if (lastState) lastState.stoppedContainers = []

  return {
    ok: true,
    restored,
    assertionCancelled: true,
    message: names.length
      ? `สั่ง start container กลับ ${restored.filter((r) => r.ok).length}/${names.length} รายการ`
      : 'ยกเลิก caffeinate แล้ว — ไม่มี container ที่ต้องเรียกคืน'
  }
}
