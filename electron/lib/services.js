import net from 'node:net'
import os from 'node:os'
import { run, runShell } from './exec.js'
import { getProcesses } from './processes.js'
import { appBundleName } from './parse.js'

/* ------------------------------------------------------------------ *
 * Known service signatures
 *
 * Anything listening on a port is matched against this catalogue so the UI
 * can say "this is n8n" instead of "this is PID 8625". Matching is by well
 * known port first and by process name second.
 * ------------------------------------------------------------------ */

export const SERVICE_CATALOG = [
  // --- macOS built-ins (should be left alone) ---------------------
  { id: 'airplay', label: 'AirPlay Receiver', category: 'system', ports: [7000, 5000], process: ['ControlCe'], protocol: 'tcp', tone: 'muted', system: true },
  { id: 'continuity', label: 'Continuity / Handoff', category: 'system', ports: [50081], process: ['rapportd'], protocol: 'tcp', tone: 'muted', system: true },

  // --- workflow / automation -------------------------------------
  { id: 'n8n', label: 'n8n', category: 'automation', ports: [5678], protocol: 'http', path: '/homez', tone: 'accent' },
  { id: 'node-red', label: 'Node-RED', category: 'automation', ports: [1880], protocol: 'http', tone: 'warn' },
  { id: 'airflow', label: 'Apache Airflow', category: 'automation', ports: [8080], protocol: 'http', tone: 'info' },

  // --- databases --------------------------------------------------
  { id: 'mysql', label: 'MySQL', category: 'database', ports: [3306], process: ['mysqld', 'mariadbd'], protocol: 'tcp', tone: 'danger' },
  { id: 'mariadb', label: 'MariaDB', category: 'database', ports: [3307], process: ['mariadbd'], protocol: 'tcp', tone: 'warn' },
  { id: 'postgres', label: 'PostgreSQL', category: 'database', ports: [5432, 5433], process: ['postgres'], protocol: 'tcp', tone: 'info' },
  { id: 'redis', label: 'Redis', category: 'database', ports: [6379], process: ['redis-server'], protocol: 'tcp', tone: 'danger' },
  { id: 'mongodb', label: 'MongoDB', category: 'database', ports: [27017], process: ['mongod'], protocol: 'tcp', tone: 'ok' },
  { id: 'elasticsearch', label: 'Elasticsearch', category: 'database', ports: [9200], protocol: 'http', tone: 'warn' },
  { id: 'clickhouse', label: 'ClickHouse', category: 'database', ports: [8123, 9000], protocol: 'http', tone: 'warn' },

  // --- vector stores / AI ----------------------------------------
  { id: 'qdrant', label: 'Qdrant', category: 'ai', ports: [6333], altPorts: [6334], protocol: 'http', path: '/healthz', tone: 'accent' },
  { id: 'ollama', label: 'Ollama', category: 'ai', ports: [11434], protocol: 'http', path: '/api/tags', tone: 'muted' },
  { id: 'chroma', label: 'Chroma', category: 'ai', ports: [8000], protocol: 'http', path: '/api/v2/heartbeat', tone: 'ok' },
  { id: 'weaviate', label: 'Weaviate', category: 'ai', ports: [8080], protocol: 'http', path: '/v1/.well-known/ready', tone: 'info' },
  { id: 'open-webui', label: 'Open WebUI', category: 'ai', ports: [3000, 8080], protocol: 'http', tone: 'accent' },

  // --- web servers & frameworks ----------------------------------
  { id: 'vite', label: 'Vite dev server', category: 'web', ports: [5173, 4173], protocol: 'http', tone: 'ok' },
  { id: 'webpack', label: 'webpack dev server', category: 'web', ports: [8080], protocol: 'http', tone: 'info' },
  { id: 'nextjs', label: 'Next.js', category: 'web', ports: [3000], protocol: 'http', tone: 'muted' },
  { id: 'django', label: 'Django', category: 'web', ports: [8000], protocol: 'http', tone: 'ok' },
  { id: 'flask', label: 'Flask', category: 'web', ports: [5000], protocol: 'http', tone: 'info' },
  { id: 'jekyll', label: 'Jekyll', category: 'web', ports: [4000], protocol: 'http', tone: 'warn' },
  { id: 'php-fpm', label: 'PHP-FPM', category: 'web', ports: [9000], process: ['php-fpm'], protocol: 'tcp', tone: 'info' },

  // --- infrastructure ---------------------------------------------
  { id: 'apache', label: 'Apache httpd', category: 'infra', ports: [80, 443, 8080, 8888], process: ['httpd'], protocol: 'http', tone: 'ok' },
  { id: 'mamp', label: 'MAMP', category: 'infra', process: ['MAMP'], protocol: 'http', tone: 'warn' },
  { id: 'caddy', label: 'Caddy', category: 'infra', ports: [2019], protocol: 'http', tone: 'warn' },
  { id: 'rabbitmq', label: 'RabbitMQ', category: 'infra', ports: [15672], altPorts: [5672], protocol: 'http', tone: 'danger' },
  { id: 'kafka', label: 'Apache Kafka', category: 'infra', ports: [9092], protocol: 'tcp', tone: 'muted' },
  { id: 'prometheus', label: 'Prometheus', category: 'infra', ports: [9090], protocol: 'http', path: '/-/healthy', tone: 'danger' },
  { id: 'grafana', label: 'Grafana', category: 'infra', ports: [3000], protocol: 'http', path: '/api/health', tone: 'warn' },
  { id: 'kibana', label: 'Kibana', category: 'infra', ports: [5601], protocol: 'http', tone: 'info' },
  { id: 'minio', label: 'MinIO', category: 'infra', ports: [9000, 9001], protocol: 'http', tone: 'danger' },
  { id: 'pgadmin', label: 'pgAdmin', category: 'infra', ports: [5050], protocol: 'http', tone: 'info' },
  { id: 'adminer', label: 'Adminer', category: 'infra', ports: [8080], protocol: 'http', tone: 'accent' },
  { id: 'mailpit', label: 'Mailpit', category: 'infra', ports: [8025], altPorts: [1025], protocol: 'http', tone: 'warn' }
]

/** Candidate docker CLI locations; Electron apps do not inherit the shell PATH. */
const DOCKER_CANDIDATES = [
  '/usr/local/bin/docker',
  '/opt/homebrew/bin/docker',
  `${os.homedir()}/.docker/bin/docker`,
  '/Applications/Docker.app/Contents/Resources/bin/docker'
]

let dockerBin = null

/** Resolve the docker CLI once, then cache it. */
export async function resolveDocker(force = false) {
  if (dockerBin && !force) return dockerBin

  for (const candidate of [process.env.DOCKER_PATH, ...DOCKER_CANDIDATES].filter(Boolean)) {
    const probe = await run('/bin/test', ['-x', candidate], { timeout: 3000 })
    if (probe.ok) {
      dockerBin = candidate
      return dockerBin
    }
  }

  const viaPath = await runShell('command -v docker')
  dockerBin = viaPath.ok && viaPath.stdout.trim() ? viaPath.stdout.trim() : null
  return dockerBin
}

/** Cheap "is the daemon reachable" check that never throws. */
export async function dockerAvailable() {
  const bin = await resolveDocker()
  if (!bin) return { available: false, reason: 'Docker CLI not found on this Mac.' }
  const result = await run(bin, ['version', '--format', '{{.Server.Version}}'], { timeout: 8000 })
  if (!result.ok || !result.stdout.trim()) {
    return {
      available: false,
      reason: 'Docker daemon is not running. Start Docker Desktop and try again.'
    }
  }
  return { available: true, version: result.stdout.trim(), bin }
}


/* ------------------------------------------------------------------ *
 * Listening sockets
 * ------------------------------------------------------------------ */

/**
 * `lsof -nP -iTCP -sTCP:LISTEN` reports one line per socket, so a process
 * bound to both IPv4 and IPv6 appears twice, and a worker pool (Apache's
 * `httpd -k start`, for example) reports one line per worker on the same
 * port. Rows are de-duplicated per port: all worker PIDs are aggregated on
 * one listener row so every port appears exactly once.
 */
export async function listListeners() {
  const result = await run('/usr/sbin/lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'], { timeout: 8000 })
  if (!result.ok && !result.stdout) {
    return { ok: false, error: result.stderr.trim() || 'lsof failed', listeners: [] }
  }

  const map = new Map()
  for (const line of result.stdout.split('\n').slice(1)) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 9) continue
    const [name, pid, user, , type, , , , local] = parts

    const portMatch = local.match(/:(\d+)$/)
    if (!portMatch) continue
    const port = Number(portMatch[1])

    let entry = map.get(port)
    if (!entry) {
      entry = {
        port,
        pid: Number(pid),
        pids: [Number(pid)],
        name,
        user,
        family: type.startsWith('IPv6') ? 'IPv6' : 'IPv4',
        external: !local.startsWith('127.0.0.1') && !local.startsWith('[::1]'),
        address: local
      }
      map.set(port, entry)
      continue
    }

    if (!entry.pids.includes(Number(pid))) entry.pids.push(Number(pid))
    if (type.startsWith('IPv6')) entry.family = 'IPv6'
  }

  return { ok: true, listeners: [...map.values()].sort((a, b) => a.port - b.port) }
}

/* ------------------------------------------------------------------ *
 * Probes
 * ------------------------------------------------------------------ */

/** Raw TCP connect - the only way to check MySQL / Redis / Kafka reachability. */
export function probePort({ port, host = '127.0.0.1', timeoutMs = 2500 }) {
  return new Promise((resolve) => {
    const started = Date.now()
    const socket = new net.Socket()
    let settled = false

    const finish = (ok, reason = null) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve({ ok, reason, latencyMs: Date.now() - started })
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false, 'timeout'))
    socket.once('error', (err) => finish(false, err.code ?? 'error'))
    socket.connect(Number(port), host)
  })
}

/** Friendly labels for processes the catalogue does not cover by name. */
const PROCESS_LABELS = {
  'com.docker.backend': 'Docker Desktop',
  'com.docker': 'Docker Desktop',
  node: 'Node.js',
  deno: 'Deno',
  bun: 'Bun',
  python3: 'Python',
  python: 'Python',
  java: 'Java',
  ruby: 'Ruby',
  cline: 'Cline'
}

/** `/Applications/MAMP/Library/bin/httpd -k start` -> `MAMP` */
function appDirName(pathLike) {
  const match = String(pathLike ?? '').match(/^\/Applications\/([^/]+)(?:\.app)?\//)
  return match ? match[1].replace(/\.app$/, '') : null
}

/**
 * The application that ultimately owns a port. Docker ports are attributed to
 * the container, `.app` bundles are read straight off argv, and everything
 * else (MAMP's httpd/mysqld, for example) is resolved by walking up the
 * process tree and then by the `/Applications/<name>/` prefix.
 */
function owningApp(process, processByPid) {
  let current = process
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (current.app) return current.app
    const fromArgs = appBundleName(current.args) ?? appDirName(current.args)
    if (fromArgs) return fromArgs
    const fromPath = appBundleName(current.path) ?? appDirName(current.path)
    if (fromPath) return fromPath
    current = processByPid.get(current.ppid)
  }
  return null
}

function titleCase(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const mapped = PROCESS_LABELS[text.toLowerCase()]
  if (mapped) return mapped

  return text
    .replace(/\.(app|exe|bin)$/i, '')
    .replace(/[._-]/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const mappedWord = PROCESS_LABELS[word.toLowerCase()]
      if (mappedWord) return mappedWord
      if (/^(api|http|https|tcp|udp|sql|db|js|ui)$/i.test(word)) return word.toUpperCase()
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
}

/**
 * Match a listening port against the catalogue. Returns `{ entry, via }` so the
 * caller knows whether the hit came from a primary port, a secondary port or a
 * process name - secondary ports are usually non-HTTP (e.g. Qdrant gRPC).
 */
function matchCatalog({ port, processName }) {
  const byPort = SERVICE_CATALOG.find(
    (entry) => Array.isArray(entry.ports) && entry.ports.includes(port)
  )
  if (byPort) return { entry: byPort, via: 'port' }

  const byAlt = SERVICE_CATALOG.find((entry) => entry.altPorts?.includes(port))
  if (byAlt) return { entry: byAlt, via: 'altPort' }

  const lower = (processName ?? '').toLowerCase()
  if (lower) {
    const byProcess = SERVICE_CATALOG.find(
      (entry) => entry.process && entry.process.some((name) => lower.includes(name))
    )
    if (byProcess) return { entry: byProcess, via: 'process' }
  }

  return null
}

/** Best guess whether an unknown port speaks HTTP - used only for cosmetics. */
function isProbablyHttp(port) {
  return [80, 443, 3000, 4000, 5000, 5173, 8000, 8080, 8081, 8888, 9000, 9090].includes(port)
}

/** HTTP GET against a local port; returns the status code and latency. */
export async function checkHealth({ port, path = '/', protocol = 'http', timeoutMs = 2500 }) {
  const safePort = Number(port)
  if (!Number.isInteger(safePort) || safePort <= 0 || safePort > 65535) {
    return { ok: false, status: 'invalid', reason: 'Invalid port.' }
  }

  const target = `${protocol === 'https' ? 'https' : 'http'}://127.0.0.1:${safePort}${
    path?.startsWith('/') ? path : `/${path ?? ''}`
  }`
  const started = Date.now()

  try {
    const response = await fetch(target, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'manual',
      headers: { 'user-agent': 'MacProcessManager/1.0 healthcheck', accept: '*/*' }
    })
    const body = (await response.text()).slice(0, 400)
    return {
      ok: response.status < 500,
      code: response.status,
      status: response.status < 400 ? 'healthy' : 'unhealthy',
      url: target,
      latencyMs: Date.now() - started,
      body
    }
  } catch (err) {
    return {
      ok: false,
      code: null,
      status: /aborted|timeout/i.test(err?.message ?? '') ? 'timeout' : 'unreachable',
      url: target,
      latencyMs: Date.now() - started,
      reason: err?.message ?? String(err)
    }
  }
}


/* ------------------------------------------------------------------ *
 * Overview - merges lsof, docker and the catalogue into one list
 * ------------------------------------------------------------------ */

export function parsePorts(raw) {
  if (!raw) return []
  const ports = new Map()
  const add = (host, container, protocol) => {
    if (host !== null && !ports.has(host)) ports.set(host, { host, container, protocol })
  }

  for (const chunk of String(raw).split(',')) {
    const item = chunk.trim()
    const mapped = item.match(/^(?:\[?([^\]]*?)\]?:(\d+))(?:-(\d+))?->(\d+)(?:-(\d+))?\/(tcp|udp)$/)
    if (mapped) {
      const from = Number(mapped[2])
      const to = Number(mapped[3] ?? mapped[2])
      const target = Number(mapped[4])
      for (let host = from; host <= to; host += 1) {
        add(host, target + (host - from), mapped[6])
      }
      continue
    }

    const exposed = item.match(/^(\d+)(?:-(\d+))?\/(tcp|udp)$/)
    if (exposed) {
      const from = Number(exposed[1])
      const to = Number(exposed[2] ?? exposed[1])
      for (let container = from; container <= to; container += 1) {
        add(null, container, exposed[3])
      }
    }
  }
  return [...ports.values()]
}

export async function listDocker() {
  const available = await dockerAvailable()
  if (!available.available) {
    return { ok: false, ...available, containers: [] }
  }

  const result = await run(available.bin, ['ps', '-a', '--format', '{{json .}}'], { timeout: 20000 })
  if (!result.ok && !result.stdout) {
    return { ok: false, error: result.stderr.trim() || 'docker ps failed', containers: [] }
  }

  const containers = []
  for (const line of result.stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    let row
    try {
      row = JSON.parse(trimmed)
    } catch {
      continue
    }

    const labels = row.Labels ?? {}
    containers.push({
      id: row.ID,
      name: row.Names,
      image: row.Image,
      state: row.State,
      status: row.Status,
      running: row.State === 'running',
      createdAt: row.CreatedAt,
      command: row.Command,
      composeProject: labels['com.docker.compose.project'] ?? null,
      composeService: labels['com.docker.compose.service'] ?? null,
      composeFile: labels['com.docker.compose.project.config_files'] ?? null,
      workdir: labels['com.docker.compose.project.working_dir'] ?? null,
      ports: parsePorts(row.Ports)
    })
  }

  containers.sort(
    (a, b) => Number(b.running) - Number(a.running) || a.name.localeCompare(b.name)
  )
  return { ok: true, bin: available.bin, version: available.version, containers }
}


/** Container names are the only user-supplied token that reaches a shell. */
function validateContainerName(name) {
  return /^[A-Za-z0-9_.-]{1,120}$/.test(String(name ?? '')) ? String(name) : null
}

export const DOCKER_ACTIONS = {
  start: ['start'],
  stop: ['stop'],
  restart: ['restart'],
  kill: ['kill'],
  pause: ['pause'],
  unpause: ['unpause'],
  remove: ['rm', '-f']
}

export async function dockerAction({ name, action }) {
  const target = validateContainerName(name)
  if (!target) return { ok: false, error: 'Invalid container name.' }

  const argv = DOCKER_ACTIONS[action]
  if (!argv) return { ok: false, error: `Unsupported docker action: ${action}` }

  const available = await dockerAvailable()
  if (!available.available) return { ok: false, error: available.reason }

  const result = await run(available.bin, [...argv, target], { timeout: 90000 })
  if (!result.ok) {
    return { ok: false, action, error: result.stderr.trim() || `docker ${action} failed.` }
  }
  return { ok: true, action, name: target, message: `${target}: docker ${action} done.` }
}

export async function dockerLogs({ name, tail = 200 }) {
  const target = validateContainerName(name)
  if (!target) return { ok: false, error: 'Invalid container name.' }

  const available = await dockerAvailable()
  if (!available.available) return { ok: false, error: available.reason }

  const lines = Math.min(Math.max(Number(tail) || 200, 10), 5000)
  const result = await run(available.bin, ['logs', '--tail', String(lines), '--timestamps', target], {
    timeout: 20000,
    maxBuffer: 16 * 1024 * 1024
  })

  return {
    ok: true,
    name: target,
    tail: lines,
    // `docker logs` writes stdout and stderr, so both streams are the log.
    text: `${result.stdout}${result.stderr}`.trim()
  }
}

/** Everything the Services view renders, in one call. */
export async function getServiceOverview() {
  const [listenerResult, dockerResult, processSnapshot] = await Promise.all([
    listListeners(),
    listDocker(),
    getProcesses({ maxAgeMs: 1500 })
  ])

  const processByPid = processSnapshot.byPid ?? new Map()
  const containersByPort = new Map()
  for (const container of dockerResult.containers ?? []) {
    for (const port of container.ports) {
      if (port.host) containersByPort.set(port.host, container)
    }
  }

  const services = []
  for (const listener of listenerResult.listeners ?? []) {
    const container = containersByPort.get(listener.port) ?? null
    const { entry: catalog, via } = matchCatalog({ port: listener.port, processName: listener.name }) ?? {}
    const protocol =
      via === 'altPort' ? 'tcp' : (catalog?.protocol ?? (isProbablyHttp(listener.port) ? 'http' : 'tcp'))
    const healthPath = via === 'altPort' ? null : (catalog?.path ?? '/')
    const label =
      catalog?.label ??
      (container ? container.name : titleCase(listener.name) || `Port ${listener.port}`)

    // Everything needed to group ports by the application that owns them.
    const process = processByPid.get(listener.pid) ?? null
    const args = process?.args ?? ''
    const parent = process && processByPid.get(process.ppid)
    const appName = owningApp(process, processByPid) ?? (container ? container.name : null)

    services.push({
      key: `port:${listener.port}`,
      kind: 'port',
      port: listener.port,
      label,
      category: catalog?.category ?? (container ? 'container' : 'app'),
      tone: catalog?.tone ?? 'muted',
      protocol,
      healthPath,
      system: Boolean(catalog?.system),
      docs: catalog?.id ?? null,
      pid: listener.pid,
      instances: listener.pids?.length ?? 1,
      pids: listener.pids ?? [listener.pid],
      processName: listener.name,
      user: listener.user,
      address: listener.address,
      family: listener.family,
      external: listener.external,
      args,
      ppid: process?.ppid ?? null,
      parentName: parent ? parent.name : null,
      appName,
      appPath: process?.path ?? null,
      container,
      running: container ? container.running : true,
      url: protocol === 'http' ? `http://localhost:${listener.port}/` : null
    })
  }

  // Containers with no published host port still deserve a row so they can be
  // started, stopped and inspected from the same list.
  for (const container of dockerResult.containers ?? []) {
    if (container.ports.some((port) => port.host)) continue
    services.push({
      key: `container:${container.name}`,
      kind: 'container',
      port: null,
      label: container.name,
      category: 'container',
      tone: 'accent',
      protocol: 'container',
      healthPath: null,
      system: false,
      docs: null,
      pid: null,
      processName: container.image,
      user: null,
      address: null,
      family: null,
      external: false,
      container,
      running: container.running,
      url: null
    })
  }

  services.sort(
    (a, b) => Number(b.container) - Number(a.container) || (a.port ?? 0) - (b.port ?? 0)
  )

  return {
    ok: true,
    at: Date.now(),
    docker: {
      available: dockerResult.ok,
      version: dockerResult.version ?? null,
      reason: dockerResult.reason ?? dockerResult.error ?? null,
      bin: dockerResult.bin ?? null
    },
    containers: dockerResult.containers ?? [],
    listeners: listenerResult.listeners ?? [],
    listenerError: listenerResult.ok ? null : listenerResult.error,
    services
  }
}
