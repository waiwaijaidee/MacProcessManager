import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { app, BrowserWindow, Menu, nativeTheme, shell, dialog } from 'electron'
import { registerIpc } from './lib/ipc.js'
import { checkDependencies, repairDependencies } from './lib/deps.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV === 'development'
const DEV_URL = 'http://127.0.0.1:5173'

/** Electron is only ever pointed at our own renderer. */
function isTrustedUrl(url) {
  if (url.startsWith('file://')) return true
  try {
    return new URL(url).origin === DEV_URL
  } catch {
    return false
  }
}

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'Mac Process Manager',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 22 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b1120' : '#f4f6fb',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  // Surface renderer problems in the terminal - invaluable when something
  // fails before DevTools is open. Electron 35+ passes a single event object
  // while older versions pass positional arguments, so both are handled.
  mainWindow.webContents.on('console-message', (event, level, message, lineNumber) => {
    const severity = event?.level ?? level
    const text = event?.message ?? message
    const line = event?.lineNumber ?? lineNumber
    const isProblem =
      severity === 'error' || severity === 'warning' || severity === 2 || severity === 3
    if (isProblem) console.log(`[renderer:${severity}] ${text} (line ${line})`)
  })
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`[renderer] failed to load ${url}: ${description} (${code})`)
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer] process gone:', details?.reason)
  })

  // Block any navigation / popup away from the app shell.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedUrl(url)) event.preventDefault()
  })

  if (isDev) {
    mainWindow.loadURL(DEV_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'Developer',
      submenu: [
        {
          label: 'Waiwai Jaidee — Facebook (fb.com/kroowaiwai)',
          click: () => shell.openExternal('https://fb.com/kroowaiwai')
        },
        {
          label: 'Waiwai IT (waiwai-it.com)',
          click: () => shell.openExternal('https://waiwai-it.com')
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(async () => {
  // Dependency / installation check before the UI comes up.
  const deps = await checkDependencies()
  if (!deps.ok) {
    if (deps.missingAppFiles.length > 0) {
      dialog.showErrorBox(
        'Mac Process Manager — installation incomplete',
        'Required app files are missing. The installation appears corrupted.\n' +
          'Please reinstall the app from the original DMG.\n\n' +
          deps.missingAppFiles.join('\n')
      )
      app.quit()
      return
    }

    if (deps.missingCommands.length > 0) {
      const list = deps.missingCommands.map((m) => `${m.bin}  (${m.purpose})`).join('\n')
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['Try to Fix', 'Quit'],
        defaultId: 0,
        cancelId: 1,
        title: 'Mac Process Manager — missing dependencies',
        message: 'Some macOS tools this app needs were not found:',
        detail: list + '\n\nThese tools normally ship with macOS. The app can try to repair them, otherwise quit.'
      })
      if (response === 0) {
        await repairDependencies(deps.missingCommands)
        const retry = await checkDependencies()
        if (!retry.ok) {
          dialog.showErrorBox(
            'Could not repair dependencies',
            'Some tools are still unavailable. This usually means a non-standard macOS installation — reinstalling macOS command line tools may help.'
          )
          app.quit()
          return
        }
      } else {
        app.quit()
        return
      }
    }
  }

  registerIpc()
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
