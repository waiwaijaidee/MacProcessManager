# Mac Process Manager

A native-feeling macOS process manager built with **Electron + React 19 + Vite**.
It shows every running process with live CPU/memory, and lets you inspect, prioritise,
suspend and terminate them — plus sleep, restart, shut down or lock the Mac.

---

## Quick start

```bash
cd /Users/speedmac/Desktop/PROJECTs/MacProcessManager
npm install          # already done once; re-run after changing dependencies
npm run dev          # Vite dev server + Electron with hot reload + DevTools
```

Production-style launch (uses the pre-built `dist/`):

```bash
npm start            # builds the renderer, then opens Electron
npm run pack         # unsigned .app bundle in ./release (no installer)
npm run dist         # DMG for arm64 + x64
```

Run the automated checks (no GUI required):

```bash
npm test
```

---

## What it does

### Overview
* Radial gauges for live **CPU** and **memory** load plus rolling sparklines.
* Stat cards for process count, thread count, load average and the startup disk.
* Top 8 CPU and top 8 memory consumers — click any row to jump to its detail view.
* A colour-coded memory breakdown (App / Wired / Compressed / Cached files / Free)
  derived from `vm_stat`, plus thermal-throttling state from `pmset`.

### Processes
* Sortable, searchable table with filters for **All / My processes / System / App bundles / Zombies**.
* Per-row quick actions: **Suspend (SIGSTOP) · Resume (SIGCONT) · Details · Quit (SIGTERM) · Force Kill (SIGKILL)**.
* Live CPU is a real delta measurement (cumulative CPU time sampled twice), not a lifetime average.
* Footer shows the filter result count, combined CPU/memory, sample duration and last update time.

### Process detail drawer
* Full command line, executable path, parent process, child processes, start time, CPU time, nice value.
* **Open files** (`lsof`) grouped into file / directory / network / device / pipe, plus open sockets.
* **Working directory** and, where macOS permits, a best-effort environment listing.
* A nice slider that automatically requests administrator authorisation for negative values.

### Services
* Discovers every listening TCP port via `lsof -iTCP -sTCP:LISTEN` and matches it
  against `docker ps`, so `0.0.0.0:5678` becomes **n8n · container workshop_n8n**.
* A catalogue of 35 well-known signatures identifies MySQL, PostgreSQL, Redis, MongoDB,
  Qdrant, Ollama, Vite, Next.js, Django, nginx, RabbitMQ, Grafana, MinIO, Mailpit and more.
* Health checking: HTTP status codes for web services, raw TCP connect for databases and
  gRPC, auto-refreshed every 20s (configurable in Settings).
* Docker management: **Start / Stop / Pause / Resume / Restart / Logs / Remove** per
  container, including compose project grouping and container port ranges (`6333-6334`).
  State badges read straight from Docker: Running / Paused / Restarting / Stopped.
* **⭐ Favourites** — pin the services you use daily; they are stored persistently and
  always render in their own panel at the top with a live summary
  (`running / paused / stopped / offline`). A pin whose container was deleted or whose
  port has closed shows an explicit **offline** card.
* **Guarded removal** — `docker rm -f` requires typing a freshly generated 6 digit code;
  the confirm button stays disabled until it matches.
* macOS built-in listeners (AirPlay, Continuity) are separated and flagged so they are
  not killed by accident. Any app row links straight to its process in the Processes view.

### Applications
* Processes grouped by `.app` bundle with combined CPU and memory.
* Expand a group to see its individual processes, or quit the whole group in one action.

### System
* Power actions: **Sleep · Turn Off Display · Lock Screen · Restart · Shut Down · Log Out**
  (all destructive actions are confirmed and run through `osascript`).
* Storage usage per volume, a detailed memory table, CPU/core/load data, thermal state
  and the list of logged-in sessions.

### Settings
* Theme (dark / light / follow macOS), table density, sparkline toggle.
* Refresh interval (0.5s – 10s), show/hide system processes, default sort.
* Safety switches: confirm before kills, confirm before power actions, auto-escalate
  SIGTERM to SIGKILL for processes that ignore it.

---

## Architecture

```
MacProcessManager/
├── electron/
│   ├── main.js              # window + menu (ESM)
│   ├── preload.cjs          # sandboxed contextBridge surface
│   └── lib/
│       ├── ipc.js           # every IPC channel, registered in one place
│       ├── exec.js          # promise wrapper around execFile
│       ├── parse.js         # pure parsers & formatters (unit tested)
│       ├── processes.js     # ps sampler + live CPU deltas + app grouping
│       ├── system.js        # top / vm_stat / sysctl / df / pmset + power actions
│       ├── actions.js       # signals, kill escalation, renice, lsof inspector
│       └── services.js      # docker + listening ports + service catalogue + health
├── src/
│   ├── api.js               # renderer wrapper over window.mpm (with browser mock)
│   ├── App.jsx              # orchestrator: polling, confirmations, toasts
│   ├── components/          # Sidebar, table, drawer, charts, dialogs, toasts
│   ├── hooks/               # useSettings (context + localStorage), usePoll, useHistory
│   ├── views/               # Overview, Processes, Services, Applications, System, Settings
│   ├── styles/              # design tokens + layout + component CSS
│   └── utils/format.js      # renderer-side formatting helpers
└── scripts/smoke-test.mjs   # 33 automated checks
```

### Data flow

1. The renderer polls `processes:list` and `system:stats` on the interval from Settings.
2. `processes.js` runs a single `ps -ww -axo ...` (plus a `ps` call for full command
   lines), diffs cumulative CPU time against the previous sample and derives real CPU %.
3. `system.js` caches `top -l 1 -n 0`, `vm_stat`, `sysctl`, `df` and `pmset` output for
   ~1.2 s so an aggressive refresh interval stays cheap.
4. Actions go through `electron/lib/actions.js`, which validates the target, refuses
   PID 0/1 and this app itself, and escalates to `osascript ... with administrator
   privileges` only when macOS returns `EPERM`.

### Security

* `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
* The renderer only ever sees the explicit `window.mpm` API — no `fs`, no `ipcRenderer`.
* A strict CSP is set in `index.html`; it is relaxed with `'unsafe-inline'` **only in dev**
  so Vite's Fast Refresh preamble can run.
* Navigation away from the app shell and `window.open` are blocked.
* The app makes **no network requests** and sends no data anywhere.


---

## macOS commands used

| Tool | Purpose |
| --- | --- |
| `/bin/ps` | process table, full command lines, start times |
| `/usr/bin/top` | system CPU / load / thread header |
| `/usr/bin/vm_stat` | memory page breakdown |
| `/usr/sbin/sysctl` | hardware model, memory size, boot time, swap |
| `/bin/df` | volume usage |
| `/usr/sbin/lsof` | open files, working directory, sockets |
| `/usr/bin/pmset` | thermal limits, display sleep |
| `/usr/bin/osascript` | sleep / restart / shut down / log out, privileged actions |
| `/usr/bin/renice`, `/bin/kill` | priority changes and signals |
| `docker` | containers, logs, start/stop/restart (auto-located; not on the app PATH) |
| `/usr/sbin/lsof` | **also** used to enumerate listening TCP ports |

---

## Known macOS limitations

* **Environment variables** of other processes are hidden by SIP. The drawer explains
  this instead of showing an empty list; processes you own are shown when available.
* **Other users' processes** require administrator rights. The UI reports the
  permission error, and the kill / renice paths can be elevated via `osascript`
  (renice does this automatically for negative values).
* `ps` reports `VSZ`, which is enormous on macOS — treat "Virtual" as informational only.
* macOS `top -l 1` can report an empty process table on its very first sample; the
  collector keeps the previous reading rather than flashing zeroes.
* Live CPU is a delta over the refresh interval, so the very first sample after launch
  falls back to `ps`'s lifetime average until the second sample arrives (~2 s).

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Window is blank | Run `npm run build` first, or use `npm run dev` which starts Vite. |
| "Running outside Electron" banner | You opened the Vite URL in a normal browser; the bridge only exists in Electron. |
| Kill reports "Operation not permitted" | The process belongs to `root` or another user — approve the administrator prompt. |
| Electron binary missing after `npm install` | Run `node node_modules/electron/install.js`. |
| Port 5173 already in use | Stop the other Vite server; `strictPort` is enabled on purpose. |

* About panel with Electron / Chromium / Node versions and the signal table.
