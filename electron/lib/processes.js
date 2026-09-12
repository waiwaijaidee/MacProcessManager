import os from 'node:os'
import { run } from './exec.js'
import {
  appBundleName,
  deriveName,
  describeState,
  isSystemProcess,
  normaliseCpu,
  parseCpuTime,
  parseEtime
} from './parse.js'

const LIST_ARGS = [
  '-ww',
  '-axo',
  'pid=,ppid=,user=,uid=,rss=,vsz=,stat=,etime=,time=,pcpu=,nice=,comm='
]

const ARGS_ARGS = ['-ww', '-axo', 'pid=,args=']

/**
 * `ps` prints a fixed set of numeric columns followed by an open-ended
 * `comm` value that may legally contain spaces, so the tail is captured
 * by a greedy group instead of a `split(' ')`.
 */
const LIST_LINE =
  /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+([\d.]+)\s+(-?\d+)\s+(.*)$/

/** pid -> cumulative CPU seconds, sampled on every tick to derive live CPU%. */
const previousCpu = new Map()
let previousAt = 0

let snapshot = {
  at: 0,
  processes: [],
  byPid: new Map(),
  totals: { count: 0, threads: 0, cpuSum: 0, memoryBytes: 0 }
}

async function readPidArgs() {
  const { stdout } = await run('/bin/ps', ARGS_ARGS)
  const map = new Map()
  for (const line of stdout.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(.*)$/)
    if (!match) continue
    map.set(Number(match[1]), match[2])
  }
  return map
}

function mergeChildren(processes) {
  const children = new Map()
  for (const proc of processes) {
    if (!children.has(proc.ppid)) children.set(proc.ppid, [])
    children.get(proc.ppid).push(proc.pid)
  }
  for (const proc of processes) {
    proc.children = children.get(proc.pid) ?? []
  }
}

/** Collect one full process table. Fast (<100ms) and safe to call often. */
export async function sampleProcesses() {
  const startedAt = Date.now()
  const [listResult, argsMap] = await Promise.all([run('/bin/ps', LIST_ARGS), readPidArgs()])

  if (!listResult.ok && !listResult.stdout) {
    return { ...snapshot, error: listResult.stderr || 'ps failed' }
  }

  const wallDelta = previousAt ? (startedAt - previousAt) / 1000 : 0
  const totalMemory = os.totalmem()
  const processes = []
  const seen = new Set()
  const nowCpu = new Map()

  for (const line of listResult.stdout.split('\n')) {
    const match = line.match(LIST_LINE)
    if (!match) continue

    const pid = Number(match[1])
    const ppid = Number(match[2])
    const user = match[3]
    const uid = Number(match[4])
    const rssBytes = Number(match[5]) * 1024
    const vszBytes = Number(match[6])
    const stat = match[7]
    const etime = match[8]
    const cpuTimeRaw = match[9]
    const lifetimeCpu = Number(match[10]) || 0
    const nice = Number(match[11]) || 0
    const comm = match[12].trim()
    const args = argsMap.get(pid) || comm

    const cpuTime = parseCpuTime(cpuTimeRaw)
    nowCpu.set(pid, cpuTime)
    seen.add(pid)

    let cpu = lifetimeCpu
    const before = previousCpu.get(pid)
    if (wallDelta > 0.2 && before !== undefined && cpuTime >= before) {
      cpu = normaliseCpu(((cpuTime - before) / wallDelta) * 100)
    }

    const state = describeState(stat)
    const bundle = appBundleName(args)

    processes.push({
      pid,
      ppid,
      user,
      uid,
      cpu: Number(cpu.toFixed(1)),
      cpuTime,
      cpuTimeLabel: cpuTimeRaw,
      memoryBytes: rssBytes,
      virtualBytes: vszBytes,
      memoryPercent: totalMemory ? Number(((rssBytes / totalMemory) * 100).toFixed(2)) : 0,
      stat,
      state: state.key,
      stateLabel: state.label,
      elapsed: parseEtime(etime),
      elapsedRaw: etime,
      nice,
      name: deriveName(comm, args),
      comm,
      path: comm,
      args,
      app: bundle,
      isSystem: isSystemProcess(user, comm, args),
      isZombie: state.key === 'zombie',
      isStopped: state.key === 'stopped',
      isSelf: pid === process.pid,
      isCurrentUser: user === os.userInfo().username
    })
  }

  // Drop pids that exited so the delta map cannot grow unbounded.
  for (const pid of previousCpu.keys()) {
    if (!seen.has(pid)) previousCpu.delete(pid)
  }
  for (const [pid, value] of nowCpu) previousCpu.set(pid, value)
  previousAt = startedAt

  mergeChildren(processes)
  processes.sort((a, b) => b.cpu - a.cpu || b.memoryBytes - a.memoryBytes)

  const byPid = new Map(processes.map((proc) => [proc.pid, proc]))
  const totals = processes.reduce(
    (acc, proc) => {
      acc.count += 1
      acc.cpuSum += proc.cpu
      acc.memoryBytes += proc.memoryBytes
      return acc
    },
    { count: 0, threads: 0, cpuSum: 0, memoryBytes: 0 }
  )
  totals.cpuSum = Number(totals.cpuSum.toFixed(1))

  snapshot = { at: Date.now(), processes, byPid, totals, tookMs: Date.now() - startedAt }
  return snapshot
}

/** Return the most recent snapshot, refreshing only when it is stale. */
export async function getProcesses({ maxAgeMs = 750 } = {}) {
  if (!snapshot.processes.length || Date.now() - snapshot.at > maxAgeMs) {
    return sampleProcesses()
  }
  return snapshot
}

/** Aggregate processes into application level rows (groups `.app` bundles). */
export async function getApps() {
  const { processes } = await getProcesses()
  const groups = new Map()

  for (const proc of processes) {
    const key = proc.app || proc.name
    let group = groups.get(key)
    if (!group) {
      group = {
        name: key,
        isAppBundle: Boolean(proc.app),
        pids: [],
        count: 0,
        cpu: 0,
        memoryBytes: 0,
        user: proc.user,
        isSystem: proc.isSystem
      }
      groups.set(key, group)
    }
    group.pids.push(proc.pid)
    group.count += 1
    group.cpu = Number((group.cpu + proc.cpu).toFixed(1))
    group.memoryBytes += proc.memoryBytes
    if (!proc.isSystem) group.isSystem = false
  }

  return [...groups.values()].sort((a, b) => b.cpu - a.cpu || b.memoryBytes - a.memoryBytes)
}
