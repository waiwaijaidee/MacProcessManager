import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import { Empty, Panel } from '../components/ui.jsx'
import { CodeConfirm } from '../components/CodeConfirm.jsx'
import {
  IconAlert,
  IconClose,
  IconExternal,
  IconChevronRight,
  IconFolder,
  IconGrid,
  IconInfo,
  IconLayers,
  IconList,
  IconNetwork,
  IconSearch,
  IconPause,
  IconPlay,
  IconRefresh,
  IconRestart,
  IconShield,
  IconStop,
  IconTerminal,
  IconTrash
} from '../components/icons.jsx'
import { useSettings } from '../hooks/useSettings.jsx'

const CATEGORY_ICON = {
  database: IconLayers,
  container: IconGrid,
  web: IconNetwork,
  infra: IconTerminal,
  automation: IconInfo,
  ai: IconLayers,
  app: IconLayers,
  system: IconShield
}

const CATEGORY_LABEL = {
  database: 'Database',
  container: 'Container',
  infra: 'Infrastructure',
  automation: 'Workflow',
  ai: 'AI / Vector store',
  app: 'Application',
  system: 'macOS'
}

function titleCaseLabel(value) {
  if (!value) return null
  const cleaned = String(value).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
  if (!cleaned) return null
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

const HEALTH_TONE = {
  healthy: 'ok',
  unhealthy: 'warn',
  timeout: 'warn',
  unreachable: 'danger',
  unknown: 'muted',
  checking: 'accent',
  invalid: 'danger',
  unavailable: 'muted'
}

const HEALTH_LABEL = {
  healthy: 'Healthy',
  unhealthy: 'Responding (error)',
  timeout: 'Timeout',
  unreachable: 'Not responding',
  unknown: 'Unknown',
  checking: 'Checking…',
  invalid: 'Invalid port',
  unavailable: '—'
}

/** Stable id used both for favourites and for the health cache. */
function entryId(service) {
  if (service.kind === 'container') return `container:${service.container?.name ?? service.label}`
  return `port:${service.port}`
}

export function ServicesView({ onOpenProcess }) {
  const { settings, update } = useSettings()
  const [overview, setOverview] = useState(null)
  const [health, setHealth] = useState({})
  const [busy, setBusy] = useState(null)
  const [logs, setLogs] = useState(null)
  const [logText, setLogText] = useState('')
  const [logBusy, setLogBusy] = useState(false)
  const [confirm, setConfirm] = useState(null)

  const refresh = useCallback(async () => {
    const result = await api.services.overview()
    setOverview(result)
    return result
  }, [])

  const checkHealth = useCallback(async (service) => {
    if (!service.port) return
    setHealth((current) => ({ ...current, [entryId(service)]: { status: 'checking' } }))

    if (service.protocol !== 'http') {
      // Non-HTTP ports (MySQL, Redis, gRPC) fall back to a raw TCP probe.
      const probe = await api.services.probe({ port: service.port })
      setHealth((current) => ({
        ...current,
        [entryId(service)]: {
          status: probe.ok ? 'healthy' : probe.reason === 'timeout' ? 'timeout' : 'unreachable',
          code: null,
          latencyMs: probe.latencyMs
        }
      }))
      return
    }

    const result = await api.services.health({
      port: service.port,
      path: service.healthPath ?? '/',
      protocol: service.protocol
    })
    setHealth((current) => ({ ...current, [entryId(service)]: result }))
  }, [])

  const checkAll = useCallback(
    async (list) => {
      const targets = (list ?? overview?.services ?? []).filter((service) => service.port)
      await Promise.all(targets.map((service) => checkHealth(service)))
    },
    [checkHealth, overview]
  )

  useEffect(() => {
    refresh()
  }, [refresh])

  // Auto-check health once services are known, then every 20s.
  useEffect(() => {
    if (!settings.autoCheckHealth || !overview?.services?.length) return undefined
    checkAll(overview.services)
    const timer = setInterval(() => checkAll(overview.services), 20000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview?.at, settings.autoCheckHealth])

  const dockerAction = useCallback(
    async (service, action) => {
      const name = service.container?.name
      if (!name) return
      setBusy(`${name}:${action}`)
      const result = await api.services.dockerAction({ name, action })
      setBusy(null)
      if (result?.ok) {
        await refresh()
        if (settings.autoCheckHealth) checkAll()
      } else {
        setLogs({ name, error: result?.error ?? 'Action failed.' })
      }
    },
    [refresh, settings.autoCheckHealth, checkAll]
  )

  const openLogs = useCallback(async (service) => {
    const name = service.container?.name ?? service.label
    setLogs({ name })
    setLogBusy(true)
    const result = await api.services.dockerLogs({ name, tail: 300 })
    setLogBusy(false)
    setLogText(result?.ok ? result.text : (result?.error ?? 'Unable to read logs.'))
  }, [])

  const openBrowser = useCallback(async (url) => {
    await api.app.openExternal(url)
  }, [])

  const copyUrl = useCallback(async (url) => {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      /* clipboard permission can be denied; the URL is visible on the card */
    }
  }, [])

  const isFavorite = useCallback(
    (service) => settings.favorites.some((fav) => fav.id === entryId(service)),
    [settings.favorites]
  )

  const toggleFavorite = useCallback(
    (service) => {
      const id = entryId(service)
      const exists = settings.favorites.some((fav) => fav.id === id)
      const next = exists
        ? settings.favorites.filter((fav) => fav.id !== id)
        : [
            ...settings.favorites,
            {
              id,
              kind: service.kind,
              port: service.port ?? null,
              container: service.container?.name ?? null,
              label: service.label,
              category: service.category,
              tone: service.tone,
              protocol: service.protocol,
              url: service.url
            }
          ]
      update({ favorites: next })
    },
    [settings.favorites, update]
  )

  const requestContainerAction = useCallback(
    (service, action) => {
      if (action === 'remove') {
        setConfirm({ service, action, code: String(Math.floor(100000 + Math.random() * 900000)) })
        return
      }
      dockerAction(service, action)
    },
    [dockerAction]
  )

  /** Resolve every pinned id to its live service (or null when it is gone). */
  const favoriteEntries = useMemo(() => {
    const services = overview?.services ?? []
    return settings.favorites.map((fav) => ({
      fav,
      service: services.find((item) => entryId(item) === fav.id) ?? null
    }))
  }, [settings.favorites, overview])

  const favoriteSummary = useMemo(() => {
    let running = 0
    let paused = 0
    let stopped = 0
    let offline = 0

    for (const { service } of favoriteEntries) {
      if (!service) {
        offline += 1
        continue
      }
      const state = service.container?.state
      if (state === 'running') running += 1
      else if (state === 'paused') paused += 1
      else if (state) stopped += 1
      else if (!service.running) stopped += 1
      else running += 1
    }

    return { running, paused, stopped, offline, total: favoriteEntries.length }
  }, [favoriteEntries])

  const grouped = useMemo(() => {
    const services = overview?.services ?? []
    return {
      docker: services.filter((service) => service.container),
      apps: services.filter((service) => !service.container && !service.system),
      system: services.filter((service) => !service.container && service.system)
    }
  }, [overview])

  /* ---------------- search + grouping ---------------- */

  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState({})

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const services = overview?.services ?? []
    if (!needle) return services
    return services.filter((service) => {
      const haystack = [
        service.label,
        service.port ? String(service.port) : '',
        service.protocol,
        service.processName,
        service.appName,
        service.parentName,
        service.category,
        service.container?.name,
        service.container?.image,
        service.url
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  }, [overview, query])

  /** Ports grouped by the application that owns them (Docker / MAMP / …). */
  const appGroups = useMemo(() => {
    const map = new Map()
    for (const service of filtered) {
      const id = service.container
        ? `container:${service.container.name}`
        : service.appName
          ? `app:${service.appName}`
          : `proc:${service.processName}`
      let group = map.get(id)
      if (!group) {
        group = {
          id,
          fallbackName:
            service.container?.name ??
            service.appName ??
            titleCaseLabel(service.processName) ??
            'Unknown',
          category: service.category,
          tone: service.tone,
          system: service.system,
          services: [],
          ports: []
        }
        map.set(id, group)
      }
      group.services.push(service)
      if (service.port) group.ports.push(service.port)
    }

    return [...map.values()]
      .map((group) => ({
        ...group,
        name: settings.serviceGroups[group.id] ?? group.fallbackName,
        renamed: Boolean(settings.serviceGroups[group.id]),
        pinned: group.services.some((service) => isFavorite(service))
      }))
      .sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) ||
          b.services.length - a.services.length ||
          (a.ports[0] ?? 0) - (b.ports[0] ?? 0)
      )
  }, [filtered, settings.serviceGroups, isFavorite])

  const renameGroup = useCallback(
    (id, name) => {
      const next = { ...settings.serviceGroups }
      if (name && name.trim()) next[id] = name.trim()
      else delete next[id]
      update({ serviceGroups: next })
    },
    [settings.serviceGroups, update]
  )

  const runningCount = (overview?.containers ?? []).filter((container) => container.running).length

  /** Docker state -> badge tone / short label used on the card. */
  const containerBadge = (container) => {
    if (!container) return null
    const tone =
      container.state === 'running'
        ? 'ok'
        : container.state === 'paused' || container.state === 'restarting'
          ? 'warn'
          : 'danger'
    const label =
      container.state === 'running'
        ? 'Running'
        : container.state === 'paused'
          ? 'Paused'
          : container.state === 'restarting'
            ? 'Restarting'
            : container.state === 'created'
              ? 'Created'
              : 'Stopped'
    return { tone, label, status: container.status }
  }

  const renderService = (service) => {
    const id = entryId(service)
    const state = health[id]
    const Icon = CATEGORY_ICON[service.category] ?? IconLayers
    const iconTone = service.system ? 'muted' : (service.tone ?? 'accent')
    const container = service.container
    const badge = containerBadge(container)

    let dotTone
    if (container) dotTone = badge.tone === 'ok' ? (HEALTH_TONE[state?.status] ?? 'ok') : badge.tone
    else if (!service.running) dotTone = 'danger'
    else dotTone = HEALTH_TONE[state?.status] ?? 'muted'

    const favorite = isFavorite(service)

    return (
      <div className={`service-card${favorite ? ' is-fav' : ''}`} key={id}>
        <span className={`service-card__icon${service.system ? '' : ` service-card__icon--${iconTone}`}`}>
          <Icon size={18} />
        </span>

        <div className="service-card__main">
          <div className="service-card__title">
            <span className={`dot dot--${dotTone}`} />
            <span>{service.label}</span>
            {badge ? (
              <span className={`badge badge--${badge.tone}`} title={badge.status}>
                {badge.label}
              </span>
            ) : null}
            {container ? <span className="badge badge--accent">docker</span> : null}
            {service.system ? <span className="badge">system</span> : null}
            {service.external ? <span className="badge badge--warn">exposed</span> : null}
          </div>
          <div className="service-card__meta">
            {service.port ? (
              <span className="port-pill">
                :{service.port}
                <small>{service.protocol.toUpperCase()}</small>
              </span>
            ) : null}
            <span>{CATEGORY_LABEL[service.category] ?? service.category}</span>
            {container ? <span>{container.image}</span> : null}
            {!container && service.pid ? (
              <span>
                {service.processName} · PID {service.pid}
                {service.instances > 1 ? ` (+${service.instances - 1} workers)` : ''}
              </span>
            ) : null}
            {!container && service.appName ? <span>app: {service.appName}</span> : null}
            {container?.composeProject ? <span>compose: {container.composeProject}</span> : null}
            <span>{service.address ?? (container ? badge.status : '')}</span>
          </div>
        </div>

        <div className="service-card__side">
          <span className={`badge badge--${HEALTH_TONE[state?.status] ?? 'muted'}`}>
            {HEALTH_LABEL[state?.status] ?? '—'}
            {state?.code ? ` ${state.code}` : ''}
            {state?.latencyMs && state.status === 'healthy' ? ` · ${state.latencyMs}ms` : ''}
          </span>

          {service.port ? (
            <span className="port-pill">
              {service.protocol === 'http' ? 'HTTP' : 'TCP'} :{service.port}
            </span>
          ) : null}

          <button
            type="button"
            className={`btn btn--icon btn--sm${favorite ? ' btn--primary' : ''}`}
            title={favorite ? 'Remove from favourites' : 'Add to favourites'}
            onClick={() => toggleFavorite(service)}
          >
            {favorite ? '★' : '☆'}
          </button>

          {service.url ? (
            <>
              <button
                type="button"
                className="btn btn--icon btn--sm"
                title={`Open ${service.url}`}
                onClick={() => openBrowser(service.url)}
              >
                <IconExternal size={13} />
              </button>
              <button
                type="button"
                className="btn btn--icon btn--sm"
                title="Copy URL"
                onClick={() => copyUrl(service.url)}
              >
                <IconList size={13} />
              </button>
            </>
          ) : null}

          {container ? (
            <>
              {container.state !== 'running' && container.state !== 'paused' ? (
                <button
                  type="button"
                  className="btn btn--icon btn--sm"
                  title="Start container"
                  disabled={busy === `${container.name}:start`}
                  onClick={() => requestContainerAction(service, 'start')}
                >
                  {busy === `${container.name}:start` ? <span className="spinner" /> : <IconPlay size={13} />}
                </button>
              ) : null}

              {container.state === 'running' ? (
                <button
                  type="button"
                  className="btn btn--icon btn--sm"
                  title="Pause container (freeze its processes)"
                  disabled={busy === `${container.name}:pause`}
                  onClick={() => requestContainerAction(service, 'pause')}
                >
                  {busy === `${container.name}:pause` ? <span className="spinner" /> : <IconPause size={13} />}
                </button>
              ) : null}

              {container.state === 'paused' ? (
                <button
                  type="button"
                  className="btn btn--icon btn--sm"
                  title="Resume container (unpause)"
                  disabled={busy === `${container.name}:unpause`}
                  onClick={() => requestContainerAction(service, 'unpause')}
                >
                  {busy === `${container.name}:unpause` ? <span className="spinner" /> : <IconPlay size={13} />}
                </button>
              ) : null}

              {container.state !== 'created' ? (
                <button
                  type="button"
                  className="btn btn--icon btn--sm"
                  title="Stop container"
                  disabled={busy === `${container.name}:stop`}
                  onClick={() => requestContainerAction(service, 'stop')}
                >
                  {busy === `${container.name}:stop` ? <span className="spinner" /> : <IconStop size={13} />}
                </button>
              ) : null}

              {container.state === 'running' ? (
                <button
                  type="button"
                  className="btn btn--icon btn--sm"
                  title="Restart container"
                  disabled={busy === `${container.name}:restart`}
                  onClick={() => requestContainerAction(service, 'restart')}
                >
                  {busy === `${container.name}:restart` ? <span className="spinner" /> : <IconRestart size={13} />}
                </button>
              ) : null}

              <button
                type="button"
                className="btn btn--icon btn--sm"
                title="Show container logs"
                onClick={() => openLogs(service)}
              >
                <IconTerminal size={13} />
              </button>
              <button
                type="button"
                className="btn btn--icon btn--sm icon-btn--danger"
                title="Force remove container (needs a 6 digit code)"
                onClick={() => requestContainerAction(service, 'remove')}
              >
                <IconTrash size={13} />
              </button>
            </>
          ) : service.pid && !service.system ? (
            <button
              type="button"
              className="btn btn--icon btn--sm"
              title="Inspect the process behind this port"
              onClick={() => onOpenProcess(service.pid)}
            >
              <IconInfo size={13} />
            </button>
          ) : null}

          {service.port ? (
            <button
              type="button"
              className="btn btn--icon btn--sm"
              title="Re-check health"
              onClick={() => checkHealth(service)}
            >
              <IconRefresh size={13} />
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="view">
      <div className="service-toolbar">
        <span className="service-search">
          <span className="service-search__icon">
            <IconSearch size={14} />
          </span>
          <input
            className="input"
            type="search"
            placeholder="ค้นหา port, ชื่อ service, ชื่อ app หรือ container… เช่น 8888, mysql, n8n"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </span>

        <button
          type="button"
          className={`chip${settings.groupServices ? ' is-active' : ''}`}
          onClick={() => update({ groupServices: !settings.groupServices })}
          title="จัดกลุ่ม port ตาม application ที่เปิด port นั้น"
        >
          <IconGrid size={12} /> Group by app
        </button>

        <button
          type="button"
          className="btn btn--sm"
          onClick={() => refresh()}
          disabled={busy === 'refresh'}
        >
          {busy === 'refresh' ? <span className="spinner" /> : <IconRefresh size={13} />}
          Refresh
        </button>
      </div>

      <div className="note">
        <IconInfo size={15} />
        <div>
          <b>Services คืออะไร?</b> ทุก app ที่รอการเชื่อมต่ออยู่ (Docker container, MySQL,
          Redis, n8n, dev server ฯลฯ) จะเปิด <b>port</b> ไว้ — หน้านี้อ่านจาก{' '}
          <code className="kbd">lsof -iTCP -sTCP:LISTEN</code> แล้วจับคู่กับ{' '}
          <code className="kbd">docker ps</code> เพื่อบอกว่า port ไหนคือ app อะไร พร้อมจัดการ
          เริ่ม/หยุด/restart/ดู log และตรวจ health ได้ กด <b>★</b> เพื่อปักหมุดรายการโปรด
          (จำไว้ถาวร)
        </div>
      </div>

      <section className="grid-3">
        <div className="stat-card">
          <div className="stat-card__head">
            <span className="stat-card__icon stat-card__icon--accent">
              <IconGrid size={15} />
            </span>
            <span className="stat-card__label">Docker</span>
          </div>
          <div className="stat-card__value">
            {runningCount}
            <small>running</small>
          </div>
          <div className="stat-card__meta">
            {overview?.docker?.available
              ? `Docker Engine ${overview.docker.version}`
              : (overview?.docker?.reason ?? 'Docker not available')}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card__head">
            <span className="stat-card__icon stat-card__icon--ok">
              <IconNetwork size={15} />
            </span>
            <span className="stat-card__label">Listening ports</span>
          </div>
          <div className="stat-card__value">
            {(overview?.listeners ?? []).length}
            <small>ports</small>
          </div>
          <div className="stat-card__meta">
            {(overview?.services ?? []).filter((service) => service.port).length} identified by
            name
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card__head">
            <span className="stat-card__icon">
              <IconShield size={15} />
            </span>
            <span className="stat-card__label">Favourites</span>
          </div>
          <div className="stat-card__value">
            {settings.favorites.length}
            <small>pinned</small>
          </div>
          <div className="stat-card__meta">
            {grouped.docker.length} docker · {grouped.apps.length} apps ·{' '}
            {grouped.system.length} macOS
          </div>
        </div>
      </section>

      {favoriteEntries.length ? (
        <Panel
          title="Favourites"
          hint={`${favoriteEntries.length} pinned · ${favoriteSummary.running} running`}
          actions={
            <button type="button" className="btn btn--sm" onClick={() => update({ favorites: [] })}>
              Clear all
            </button>
          }
          flush
        >
          <div className="fav-summary">
            <span>
              <span className={`dot dot--${favoriteSummary.running ? 'ok' : 'muted'}`} />{' '}
              <b>{favoriteSummary.running}</b> running
            </span>
            <span>
              <span className={`dot dot--${favoriteSummary.paused ? 'warn' : 'muted'}`} />{' '}
              <b>{favoriteSummary.paused}</b> paused
            </span>
            <span>
              <span className={`dot dot--${favoriteSummary.stopped ? 'danger' : 'muted'}`} />{' '}
              <b>{favoriteSummary.stopped}</b> stopped
            </span>
            <span>
              <span className={`dot dot--${favoriteSummary.offline ? 'danger' : 'muted'}`} />{' '}
              <b>{favoriteSummary.offline}</b> offline / ไม่พบ
            </span>
          </div>

          {favoriteEntries.map(({ fav, service }) =>
            service ? (
              renderService(service)
            ) : (
              <div className="offline-card" key={fav.id}>
                <span className="offline-card__icon">
                  <IconInfo size={18} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="offline-card__title">{fav.label}</div>
                  <div className="offline-card__meta">
                    ไม่พบรายการนี้ตอนนี้ — {fav.kind === 'container' ? 'container ถูกลบไปแล้ว' : 'port ปิดอยู่ (app หยุดทำงาน)'}
                    {fav.port ? ` · port ${fav.port}` : ''}
                  </div>
                </div>
                <span className="badge badge--danger">offline</span>
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() =>
                    update({ favorites: settings.favorites.filter((item) => item.id !== fav.id) })
                  }
                >
                  เอาออกจากรายการโปรด
                </button>
              </div>
            )
          )}
        </Panel>
      ) : (
        <Panel title="Favourites" hint="Pin the services you use every day" flush>
          <Empty
            icon={<IconShield size={20} />}
            title="No favourites yet"
            text="กด ★ บนการ์ดของ n8n, Qdrant หรือ dev server ที่ใช้บ่อย — จะถูกยกขึ้นไว้บนสุดและจำไว้ถาวร พร้อมแจ้งสถานะ running / paused / stopped"
          />
        </Panel>
      )}

      {settings.groupServices ? (
        <Panel
          title="Applications & services by port"
          hint={`${appGroups.length} groups · ${filtered.length} services${
            query ? ` · filtered by "${query}"` : ''
          }`}
          actions={
            <span className="chip-row">
              <span className="badge">
                <IconSearch size={11} /> {filtered.length}/{(overview?.services ?? []).length}
              </span>
            </span>
          }
          flush
        >
          {appGroups.length === 0 ? (
            <Empty
              icon={<IconNetwork size={20} />}
              title={query ? 'ไม่พบรายการที่ตรงกับคำค้นหา' : 'No services listening'}
              text={
                query
                  ? 'ลองค้นหาด้วย port (เช่น 8888), ชื่อ service (เช่น mysql) หรือชื่อ app (เช่น MAMP)'
                  : undefined
              }
            />
          ) : (
            appGroups.map((group) => {
              const isCollapsed = collapsed[group.id] && !query
              return (
                <div className="app-group" key={group.id}>
                  <div
                    className="app-group__head"
                    role="button"
                    tabIndex={0}
                    onClick={() => setCollapsed((c) => ({ ...c, [group.id]: !c[group.id] }))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setCollapsed((c) => ({ ...c, [group.id]: !c[group.id] }))
                      }
                    }}
                  >
                    <span
                      className={`app-group__chevron${isCollapsed ? '' : ' app-group__chevron--open'}`}
                    >
                      <IconChevronRight size={15} />
                    </span>

                    <span className="app-group__icon">
                      {CATEGORY_ICON[group.category] ?? IconLayers}
                    </span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <input
                        className="app-group__name"
                        value={group.name}
                        title="ตั้งชื่อกลุ่มนี้ (จำไว้ถาวร)"
                        onChange={(event) => renameGroup(group.id, event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur()
                          event.stopPropagation()
                        }}
                        aria-label="Group name"
                      />
                      <div className="app-group__meta">
                        {group.services.length} service
                        {group.services.length > 1 ? 's' : ''}
                        {group.renamed ? ' · ตั้งชื่อเอง' : ''}
                        {group.system ? ' · macOS' : ''}
                      </div>
                    </div>

                    <div className="app-group__ports">
                      {group.ports.slice(0, 6).map((port) => {
                        const fav = group.services.some(
                          (service) => service.port === port && isFavorite(service)
                        )
                        return (
                          <span key={port} className={`port-pill${fav ? ' is-fav' : ''}`}>
                            :{port}
                          </span>
                        )
                      })}
                      {group.ports.length > 6 ? (
                        <span className="port-pill">+{group.ports.length - 6}</span>
                      ) : null}
                    </div>

                    {group.pinned ? <span className="badge badge--accent">★</span> : null}
                  </div>

                  {!isCollapsed ? (
                    <div className="app-group__cards">{group.services.map(renderService)}</div>
                  ) : null}
                </div>
              )
            })
          )}
        </Panel>
      ) : (
        <>
          <Panel
            title="Docker containers"
            hint={`${(overview?.containers ?? []).length} containers · ${runningCount} running`}
            flush
          >
            {(overview?.containers ?? []).length === 0 ? (
              <Empty
                icon={<IconGrid size={20} />}
                title="No containers"
                text={overview?.docker?.reason ?? 'Docker Desktop is not running or has no containers.'}
              />
            ) : (
              grouped.docker.map(renderService)
            )}
          </Panel>

          <Panel
            title="Applications on ports"
            hint={`${grouped.apps.length} services · health auto-checked every 20s`}
            flush
          >
            {grouped.apps.length === 0 ? (
              <Empty icon={<IconNetwork size={20} />} title="No local apps listening" />
            ) : (
              grouped.apps.map(renderService)
            )}
          </Panel>

          <Panel title="macOS built-in listeners" hint="ปล่อยไว้ได้ — ไม่ควร kill" flush>
            {grouped.system.length === 0 ? (
              <Empty icon={<IconShield size={20} />} title="No macOS system listeners" />
            ) : (
              grouped.system.map(renderService)
            )}
          </Panel>
        </>
      )}

      {logs ? (
        <>
          <div className="drawer-backdrop" onClick={() => setLogs(null)} />
          <aside className="drawer" role="dialog" aria-modal="true" aria-label="Container logs">
            <header className="drawer__header">
              <button
                type="button"
                className="btn btn--icon btn--ghost drawer__close"
                onClick={() => setLogs(null)}
                aria-label="Close logs"
              >
                <IconTrash size={15} />
              </button>
              <h2 className="drawer__title">
                <IconTerminal size={16} /> Logs · {logs.name}
              </h2>
              <p className="drawer__subtitle">
                docker logs --tail 300 --timestamps {logs.name}
              </p>
              <div className="drawer__actions">
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => openLogs({ container: { name: logs.name }, label: logs.name })}
                >
                  <IconRefresh size={13} /> Refresh
                </button>
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => navigator.clipboard.writeText(logText)}
                >
                  Copy
                </button>
              </div>
            </header>
            <div className="drawer__body">
              {logBusy ? (
                <Empty icon={<span className="spinner" />} title="Reading container logs…" />
              ) : logText ? (
                <pre className="log-viewer">{logText}</pre>
              ) : (
                <Empty icon={<IconFolder size={20} />} title="No log output" />
              )}
            </div>
          </aside>
        </>
      ) : null}

      <CodeConfirm
        open={Boolean(confirm)}
        code={confirm?.code}
        busy={busy === `${confirm?.service?.container?.name}:remove`}
        title={`Remove container "${confirm?.service?.container?.name}"?`}
        message={
          <>
            คำสั่งที่จะรันคือ <code>docker rm -f {confirm?.service?.container?.name}</code> —
            container และ writable layer ของมันจะถูกลบถาวร ข้อมูลใน volume ที่ mount ไว้จะยังอยู่
            แต่สิ่งที่เขียนไว้ <b>ข้างใน container</b> จะหายทั้งหมด
          </>
        }
        confirmLabel="ลบ container ถาวร"
        onRegenerate={() =>
          setConfirm((current) =>
            current ? { ...current, code: String(Math.floor(100000 + Math.random() * 900000)) } : current
          )
        }
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const target = confirm.service
          setConfirm(null)
          dockerAction(target, 'remove')
        }}
      />
    </div>
  )
}

