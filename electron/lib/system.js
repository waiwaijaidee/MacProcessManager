import os from 'node:os'
import { run, runShell } from './exec.js'

let cache = { at: 0, data: null }

function num(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** `1.5G` / `512M` / `1024K` / `42B` -> bytes */
function parseHumanBytes(token) {
  if (!token) return 0
  const match = String(token).match(/([\d.]+)\s*([KMGT]?)B?/i)
  if (!match) return 0
  const value = Number(match[1]) || 0
  const unit = match[2].toUpperCase()
  const scale = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 }[unit] ?? 1
  return value * scale
}

function parseTopHeader(stdout) {
  const info = {
    processes: { total: 0, running: 0, sleeping: 0, threads: 0 },
    loadAverage: [...os.loadavg()],
    cpu: { user: 0, sys: 0, idle: 100, usage: 0 },
    memory: { used: 0, unused: 0, wired: 0, compressor: 0 }
  }

  for (const line of stdout.split('\n')) {
    let match = line.match(
      /^Processes:\s+(\d+)\s+total,\s+(\d+)\s+running,\s+(\d+)\s+sleeping,\s+(\d+)\s+threads/
    )
    if (match) {
      info.processes = {
        total: num(match[1]),
        running: num(match[2]),
        sleeping: num(match[3]),
        threads: num(match[4])
      }
      continue
    }

    match = line.match(/^Load Avg:\s+([\d.]+),\s*([\d.]+),\s*([\d.]+)/)
    if (match) {
      info.loadAverage = [num(match[1]), num(match[2]), num(match[3])]
      continue
    }

    match = line.match(/^CPU usage:\s+([\d.]+)%\s+user,\s+([\d.]+)%\s+sys,\s+([\d.]+)%\s+idle/)
    if (match) {
      const user = num(match[1])
      const sys = num(match[2])
      const idle = num(match[3])
      info.cpu = { user, sys, idle, usage: Number((user + sys).toFixed(2)) }
      continue
    }

    match = line.match(
      /^PhysMem:\s+([\d.]+[KMGT]?)\s+used\s+\(([\d.]+[KMGT]?)\s+wired,\s*([\d.]+[KMGT]?)\s+compressor\),\s*([\d.]+[KMGT]?)\s+unused/
    )
    if (match) {
      info.memory = {
        used: parseHumanBytes(match[1]),
        wired: parseHumanBytes(match[2]),
        compressor: parseHumanBytes(match[3]),
        unused: parseHumanBytes(match[4])
      }
    }
  }

  return info
}

function parseVmStat(stdout) {
  const pageSize = num(stdout.match(/page size of (\d+) bytes/)?.[1], 4096)
  const grab = (label) => {
    const match = stdout.match(new RegExp(`${label}:\\s+(\\d+)\\.`))
    return num(match?.[1]) * pageSize
  }
  return {
    pageSize,
    free: grab('Pages free'),
    active: grab('Pages active'),
    inactive: grab('Pages inactive'),
    speculative: grab('Pages speculative'),
    wired: grab('Pages wired down'),
    purgeable: grab('Pages purgeable'),
    compressor: grab('Pages occupied by compressor'),
    fileBacked: grab('File-backed pages'),
    anonymous: grab('Anonymous pages')
  }
}

async function parseHardware() {
  const keys = [
    'hw.model',
    'hw.ncpu',
    'hw.physicalcpu',
    'hw.logicalcpu',
    'hw.memsize',
    'machdep.cpu.brand_string',
    'kern.osproductversion',
    'kern.osversion',
    'kern.hostname'
  ]
  const { stdout } = await run('/usr/sbin/sysctl', ['-n', ...keys])
  const values = stdout.trim().split('\n')
  const pick = (i) => (values[i] ?? '').trim()

  return {
    model: pick(0),
    ncpu: num(pick(1), os.cpus().length),
    physicalCpu: num(pick(2), os.cpus().length),
    logicalCpu: num(pick(3), os.cpus().length),
    totalMemory: num(pick(4), os.totalmem()),
    cpuBrand: pick(5) || os.cpus()[0]?.model || 'Apple Silicon',
    osVersion: pick(6),
    osBuild: pick(7),
    hostname: pick(8) || os.hostname()
  }
}

async function parseBootTime() {
  const { stdout } = await run('/usr/sbin/sysctl', ['-n', 'kern.boottime'])
  const sec = num(stdout.match(/sec\s*=\s*(\d+)/)?.[1])
  const usec = num(stdout.match(/usec\s*=\s*(\d+)/)?.[1])
  return sec ? sec * 1000 + Math.floor(usec / 1000) : 0
}

async function parseSwap() {
  const { stdout } = await run('/usr/sbin/sysctl', ['-n', 'vm.swapusage'])
  const read = (key) => num(stdout.match(new RegExp(`${key} = ([\\d.]+)M`))?.[1]) * 1024 ** 2
  return { total: read('total'), used: read('used'), free: read('free') }
}

async function parseDisks() {
  const { stdout } = await run('/bin/df', ['-k', '/', '/System/Volumes/Data'])
  const disks = []
  const lines = stdout.trim().split('\n').slice(1)
  for (const line of lines) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 9) continue
    const [filesystem, blocks, used, available, capacity, iused, ifree, iusedPct, mount] = parts
    disks.push({
      filesystem,
      mount,
      total: num(blocks) * 1024,
      used: num(used) * 1024,
      available: num(available) * 1024,
      capacity: num(String(capacity).replace('%', '')),
      inodesUsed: num(iused),
      inodesFree: num(ifree),
      inodesCapacity: num(String(iusedPct).replace('%', ''))
    })
  }
  return disks
}

async function parseThermal() {
  const { stdout } = await run('/usr/bin/pmset', ['-g', 'therm'])
  const limit = stdout.match(/CPU_Scheduler_Limit\s*=\s*(\d+)/)?.[1]
  const speed = stdout.match(/CPU_Speed_Limit\s*=\s*(\d+)/)?.[1]
  return {
    schedulerLimit: num(limit, 100),
    speedLimit: num(speed, 100),
    throttled: num(speed, 100) < 100 || num(limit, 100) < 100
  }
}
/** READ ONLY system snapshot. Cached briefly because `top` costs ~400ms. */
export async function getSystemStats({ maxAgeMs = 1500, force = false } = {}) {
  if (!force && cache.data && Date.now() - cache.at < maxAgeMs) return cache.data

  const [topResult, vmResult, hardware, disks, bootTime, swap, thermal] = await Promise.all([
    run('/usr/bin/top', ['-l', '1', '-n', '0']),
    run('/usr/bin/vm_stat'),
    parseHardware(),
    parseDisks(),
    parseBootTime(),
    parseSwap(),
    parseThermal()
  ])

  const header = parseTopHeader(topResult.stdout)
  const vm = parseVmStat(vmResult.stdout)
  const totalMemory = hardware.totalMemory || os.totalmem()

  // macOS `top -l 1` occasionally reports an empty process table on its very
  // first sample under heavy load. Keep the previous reading instead of
  // briefly displaying zeroes.
  const previous = cache.data
  const processCounts =
    header.processes.total === 0 && previous?.processes?.total
      ? previous.processes
      : header.processes

  // macOS counts compressed + cached file pages inside `top`'s "used" number,
  // so derive an Activity-Monitor style figure from vm_stat instead.
  const cachedFiles = vm.fileBacked
  const appMemory = Math.max(0, vm.anonymous - vm.compressor)
  const usedMemory = Math.max(0, totalMemory - vm.free - vm.speculative - cachedFiles)

  cache = {
    at: Date.now(),
    data: {
      at: Date.now(),
      host: {
        hostname: hardware.hostname,
        model: hardware.model,
        cpuBrand: hardware.cpuBrand,
        osVersion: hardware.osVersion,
        osBuild: hardware.osBuild,
        platform: os.platform(),
        arch: os.arch()
      },
      cpu: {
        ...header.cpu,
        cores: hardware.logicalCpu,
        physicalCores: hardware.physicalCpu
      },
      loadAverage: header.loadAverage,
      loadPercent: hardware.logicalCpu
        ? Number(((header.loadAverage[0] / hardware.logicalCpu) * 100).toFixed(1))
        : 0,
      processes: processCounts,
      memory: {
        total: totalMemory,
        used: usedMemory || header.memory.used,
        usedPercent: totalMemory ? Number(((usedMemory / totalMemory) * 100).toFixed(2)) : 0,
        app: appMemory,
        cachedFiles,
        wired: vm.wired,
        compressed: vm.compressor,
        active: vm.active,
        inactive: vm.inactive,
        purgeable: vm.purgeable,
        free: vm.free + vm.speculative,
        pageSize: vm.pageSize,
        pressure: totalMemory
          ? Number((((vm.wired + vm.compressor) / totalMemory) * 100).toFixed(2))
          : 0
      },
      swap,
      disks,
      thermal,
      uptime: os.uptime(),
      bootTime,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      user: {
        username: os.userInfo().username,
        homedir: os.homedir()
      }
    }
  }

  return cache.data
}

/** Force a fresh read (used by the manual refresh button in the UI). */
export function invalidateSystemStats() {
  cache = { at: 0, data: null }
}

/* ------------------------------------------------------------------ *
 * Power / session actions
 * ------------------------------------------------------------------ */

const OSA = '/usr/bin/osascript'
const CGSESSION =
  '/System/Library/CoreServices/Menu Extras/User.menu/Contents/Resources/CGSession'

export const POWER_ACTIONS = {
  sleep: {
    label: 'Sleep',
    description: 'Put the Mac to sleep immediately.',
    danger: false,
    run: () => run(OSA, ['-e', 'tell application "System Events" to sleep'])
  },
  displaySleep: {
    label: 'Turn Off Display',
    description: 'Turn off the screen only, the Mac keeps running.',
    danger: false,
    run: () => run('/usr/bin/pmset', ['displaysleepnow'])
  },
  lock: {
    label: 'Lock Screen',
    description: 'Lock the screen and require a password to continue.',
    danger: false,
    run: () => run(CGSESSION, ['-suspend'])
  },
  restart: {
    label: 'Restart',
    description: 'Restart the Mac. Open apps will be asked to save their work.',
    danger: true,
    run: () => run(OSA, ['-e', 'tell application "System Events" to restart'])
  },
  shutdown: {
    label: 'Shut Down',
    description: 'Shut the Mac down. Open apps will be asked to save their work.',
    danger: true,
    run: () => run(OSA, ['-e', 'tell application "System Events" to shut down'])
  },
  logout: {
    label: 'Log Out',
    description: 'Log out of the current user session.',
    danger: true,
    run: () => run(OSA, ['-e', 'tell application "System Events" to log out'])
  }
}

export async function runPowerAction(name) {
  const action = POWER_ACTIONS[name]
  if (!action) return { ok: false, error: `Unknown power action: ${name}` }

  const result = await action.run()
  if (result.ok) return { ok: true, action: name, message: `${action.label} requested.` }

  const message = result.stderr.trim() || result.error?.message || 'Command failed'
  return { ok: false, action: name, error: message }
}

/** Sessions currently logged in (`who`) - handy for the system panel. */
export async function getSessions() {
  const { stdout } = await runShell('/usr/bin/who')
  return stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [user, tty, ...rest] = line.trim().split(/\s+/)
      return { user, tty, detail: rest.join(' ') }
    })
}


