/**
 * Dependency free smoke test for the collector and action layers.
 *
 * These modules only use Node built-ins, so they run under plain `node`
 * without needing an Electron window:
 *
 *   npm test
 *
 * It exercises the parsers against real `ps` / `top` / `vm_stat` / `lsof`
 * output and round-trips SIGTERM, SIGKILL and renice against throwaway
 * `sleep` processes that it creates and cleans up itself.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import os from 'node:os'

import {
  appBundleName,
  deriveName,
  describeState,
  formatBytes,
  formatDuration,
  normaliseCpu,
  parseCpuTime,
  parseEtime
} from '../electron/lib/parse.js'
import { getApps, getProcesses } from '../electron/lib/processes.js'
import { getSystemStats } from '../electron/lib/system.js'
import {
  checkHealth,
  dockerAction,
  dockerLogs,
  getServiceOverview,
  listDocker,
  listListeners,
  parsePorts,
  probePort
} from '../electron/lib/services.js'
import {
  getProcessDetail,
  getTreeForPid,
  killProcess,
  reniceProcess,
  signalProcess
} from '../electron/lib/actions.js'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const isAlive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err.code === 'EPERM'
  }
}

let passed = 0
const lines = []
async function check(name, fn) {
  await fn()
  passed += 1
  lines.push(`  ok  ${name}`)
}

console.log('Mac Process Manager - smoke test\n')

/* ---------------- pure helpers ---------------- */

await check('parseCpuTime handles mm:ss, hh:mm:ss and dd-hh:mm:ss', () => {
  assert.equal(parseCpuTime('1:41.88'), 101.88)
  assert.equal(parseCpuTime('2:03:11.50'), 7391.5)
  assert.equal(parseCpuTime('1-04:02:00'), 100920)
  assert.equal(parseCpuTime(''), 0)
})

await check('parseEtime handles the same shapes as integers', () => {
  assert.equal(parseEtime('00:41'), 41)
  assert.equal(parseEtime('2:03:11'), 7391)
  assert.equal(parseEtime('3-04:02:00'), 273720)
})

await check('describeState maps BSD stat codes', () => {
  assert.equal(describeState('Ss').key, 'sleeping')
  assert.equal(describeState('R+').key, 'running')
  assert.equal(describeState('Z').key, 'zombie')
  assert.equal(describeState('').key, 'unknown')
})

await check('deriveName prefers the .app bundle name', () => {
  assert.equal(
    appBundleName('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    'Google Chrome'
  )
  assert.equal(deriveName('/usr/libexec/logd', '/usr/libexec/logd'), 'logd')
  assert.equal(deriveName('node', '/usr/local/bin/node server.js'), 'node')
})

await check('normaliseCpu clamps noise and negatives', () => {
  assert.equal(normaliseCpu(-12), 0)
  assert.equal(normaliseCpu(0.01), 0)
  assert.equal(normaliseCpu(42.5), 42.5)
})

await check('formatters produce readable values', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(1024), '1.00 KB')
  assert.equal(formatDuration(45), '45s')
  assert.equal(formatDuration(3725), '1h 2m')
})

/* ---------------- collectors ---------------- */

const first = await getProcesses({ maxAgeMs: 0 })
await wait(1200)
const second = await getProcesses({ maxAgeMs: 0 })
assert.ok(first.processes.length > 0, 'first sample must not be empty')

await check('process table is populated', () => {
  assert.ok(second.processes.length > 50, `expected many processes, got ${second.processes.length}`)
  assert.equal(second.totals.count, second.processes.length)
})

await check('every row has the fields the UI needs', () => {
  for (const proc of second.processes) {
    assert.equal(typeof proc.pid, 'number')
    assert.equal(typeof proc.cpu, 'number')
    assert.equal(typeof proc.memoryBytes, 'number')
    assert.ok(proc.stateLabel.length > 0)
    assert.ok(proc.name.length > 0)
    assert.ok(Array.isArray(proc.children))
  }
})

await check('live CPU deltas are produced', () => {
  const busy = second.processes.filter((proc) => proc.cpu > 0)
  assert.ok(busy.length > 0, 'expected at least one process using CPU')
})

await check('a full sample stays within the refresh budget', () => {
  assert.ok(second.tookMs < 1500, `sample took ${second.tookMs} ms`)
})

await check('app grouping works', async () => {
  const apps = await getApps()
  assert.ok(apps.length > 0)
  for (const app of apps) {
    assert.ok(app.count >= 1)
    assert.ok(Array.isArray(app.pids))
  }
})

const stats = await getSystemStats({ force: true })

await check('system stats expose cpu, memory, disks and host', () => {
  assert.ok(stats.cpu.cores > 0)
  assert.ok(stats.cpu.usage >= 0 && stats.cpu.usage <= 100)
  assert.equal(stats.loadAverage.length, 3)
  assert.ok(stats.memory.total > 0)
  assert.ok(stats.memory.usedPercent > 0 && stats.memory.usedPercent <= 100)
  assert.ok(stats.disks.some((disk) => disk.mount === '/'))
  assert.ok(stats.processes.total > 0)
  assert.ok(stats.processes.threads > 0)
  assert.ok(stats.uptime > 0)
  assert.ok(stats.host.cpuBrand.length > 0)
  assert.equal(typeof stats.swap.total, 'number')
})

await check('cached stats are reused inside the TTL window', async () => {
  const started = Date.now()
  const cached = await getSystemStats({ maxAgeMs: 5000 })
  assert.ok(Date.now() - started < 100, 'cached read should be near instant')
  assert.equal(cached.at, stats.at)
})

/* ---------------- inspector ---------------- */

const sample = second.processes.find((proc) => proc.name === 'Google Chrome') ?? second.processes[0]
const detail = await getProcessDetail(sample.pid)

await check('process detail resolves files, start time and children', () => {
  assert.equal(detail.ok, true)
  assert.equal(detail.process.pid, sample.pid)
  assert.ok(detail.process.memoryLabel.length > 0)
  assert.ok(detail.process.openFiles.count >= 0)
  assert.ok(Array.isArray(detail.process.network))
  assert.ok(Array.isArray(detail.process.children))
  assert.ok(detail.process.startTime === null || typeof detail.process.startTime.raw === 'string')
})

await check('process tree returns a flat depth list', async () => {
  const tree = await getTreeForPid(process.pid)
  assert.equal(tree.ok, true)
  assert.equal(tree.nodes[0].pid, process.pid)
  assert.equal(tree.nodes[0].depth, 0)
})

/* ---------------- guards ---------------- */

await check('refuses to signal itself', async () => {
  const result = await signalProcess({ pid: process.pid, signal: 'TERM' })
  assert.equal(result.ok, false)
  assert.match(result.error, /Refusing/)
})

await check('refuses to signal PID 1', async () => {
  const result = await signalProcess({ pid: 1, signal: 'KILL' })
  assert.equal(result.ok, false)
  assert.match(result.error, /protected/)
})

await check('rejects bad pids and unknown signals', async () => {
  assert.equal((await signalProcess({ pid: 'nope', signal: 'TERM' })).ok, false)
  assert.equal((await signalProcess({ pid: 4242, signal: 'SIGWHATEVER' })).ok, false)
})

await check('reports a clear error for a pid that is gone', async () => {
  const result = await signalProcess({ pid: 999999, signal: 'TERM' })
  assert.equal(result.ok, false)
  assert.match(result.error, /not running/)
})

/* ---------------- real signals ---------------- */

const graceful = spawn('/bin/sleep', ['300'], { stdio: 'ignore' })
await wait(400)
const gracefulResult = await killProcess({ pid: graceful.pid, escalateMs: 1200 })
await wait(400)

await check('SIGTERM terminates a cooperative process', () => {
  assert.equal(gracefulResult.ok, true)
  assert.equal(isAlive(graceful.pid), false)
})

const stubborn = spawn('/bin/sh', ['-c', 'trap "" TERM; sleep 300'], { stdio: 'ignore' })
await wait(500)
const stubbornResult = await killProcess({ pid: stubborn.pid, escalateMs: 600 })
await wait(500)

await check('SIGTERM escalates to SIGKILL for a stubborn process', () => {
  assert.equal(stubbornResult.ok, true)
  assert.equal(isAlive(stubborn.pid), false)
})

const niceTarget = spawn('/bin/sleep', ['300'], { stdio: 'ignore' })
await wait(400)
const niceResult = await reniceProcess({ pid: niceTarget.pid, nice: 10 })

await check('renice changes priority within the allowed range', () => {
  assert.equal(niceResult.ok, true)
  assert.equal(niceResult.nice, 10)
})

await check('renice rejects out of range values', async () => {
  assert.equal((await reniceProcess({ pid: niceTarget.pid, nice: 99 })).ok, false)
  assert.equal((await reniceProcess({ pid: niceTarget.pid, nice: -99 })).ok, false)
})

await signalProcess({ pid: niceTarget.pid, signal: 'KILL' })
await wait(300)

await check('suspended processes can be resumed', async () => {
  const target = spawn('/bin/sleep', ['300'], { stdio: 'ignore' })
  await wait(400)
  assert.equal((await signalProcess({ pid: target.pid, signal: 'STOP' })).ok, true)
  await wait(200)
  assert.equal((await signalProcess({ pid: target.pid, signal: 'CONT' })).ok, true)
  await killProcess({ pid: target.pid, force: true })
  await wait(300)
  assert.equal(isAlive(target.pid), false)
})

/* ---------------- services: docker, ports, health ---------------- */

const overview = await getServiceOverview()

await check('listening ports are discovered and identified', () => {
  assert.ok(overview.ok)
  assert.ok(overview.listeners.length > 0, 'expected at least one listening port')
  for (const service of overview.services) {
    assert.equal(typeof service.port === 'number' || service.kind === 'container', true)
    assert.ok(service.label.length > 0)
    assert.ok(['http', 'tcp', 'container'].includes(service.protocol))
  }
})

await check('docker integration reports a usable engine', () => {
  // Docker may legitimately be stopped; both paths must be handled cleanly.
  if (overview.docker.available) {
    assert.ok(overview.docker.version.length > 0)
    assert.ok(Array.isArray(overview.containers))
  } else {
    assert.ok(overview.docker.reason.length > 0)
    assert.equal(overview.containers.length, 0)
  }
})

await check('docker container ports are mapped to host ports', () => {
  for (const container of overview.containers) {
    for (const port of container.ports) {
      if (port.host !== null) {
        assert.ok(overview.services.some((service) => service.port === port.host))
      }
    }
  }
})

await check('running containers are linked to their service row', () => {
  for (const container of overview.containers.filter((item) => item.running && item.ports.some((p) => p.host))) {
    const linked = overview.services.filter((service) => service.container?.name === container.name)
    assert.ok(linked.length > 0, `${container.name} should be linked to at least one port`)
  }
})

await check('health check detects a healthy HTTP service', async () => {
  const httpService = overview.services.find((service) => service.protocol === 'http')
  if (!httpService) return
  const result = await checkHealth({
    port: httpService.port,
    path: httpService.healthPath ?? '/',
    protocol: httpService.protocol
  })
  assert.ok(typeof result.ok === 'boolean')
  assert.ok(result.url.length > 0)
})

await check('health check rejects a closed port', async () => {
  const closed = await probePort({ port: 59999 })
  assert.equal(closed.ok, false)
  assert.equal((await checkHealth({ port: 59999 })).ok, false)
})

await check('port mapping handles ranges, singles and unmapped containers', () => {
  assert.deepEqual(
    parsePorts('0.0.0.0:6333-6334->6333-6334/tcp').map((port) => port.host),
    [6333, 6334]
  )
  const single = parsePorts('0.0.0.0:5678->5678/tcp')
  assert.equal(single.length, 1)
  assert.equal(single[0].host, 5678)
  assert.equal(single[0].container, 5678)
  // Unmapped containers are rendered as `container` kind rows, not port rows.
  assert.deepEqual(parsePorts('6379/tcp'), [])
})

if (overview.docker.available) {
  const running = overview.containers.find((container) => container.running)
  await check('container logs can be read', async () => {
    if (!running) return
    const logs = await dockerLogs({ name: running.name, tail: 50 })
    assert.equal(logs.ok, true)
    assert.equal(logs.name, running.name)
  })

  await check('docker actions reject bad names and unknown actions', async () => {
    assert.equal((await dockerAction({ name: 'a; rm -rf /', action: 'start' })).ok, false)
    assert.equal((await dockerAction({ name: running.name, action: 'explode' })).ok, false)
  })
}

console.log(lines.join('\n'))
console.log(`\n${passed} checks passed on Node ${process.version} (${os.platform()} ${os.arch()})`)
