import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, extname, basename, dirname } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../renderer/src/assets/app-logo.png?asset'
import { spawn, ChildProcess } from 'child_process'
import net from 'net'
import tls from 'tls'
import { createSign } from 'crypto'
import { mkdirSync, existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { promises as fs } from 'fs'
import * as XLSX from 'xlsx-js-style'

let pythonProcess: ChildProcess | null = null
let lineBuffer = ''
let ensureDevPythonReadyPromise: Promise<void> | null = null
let startPythonBackendPromise: Promise<void> | null = null
let stopPythonBackendPromise: Promise<void> | null = null
let workerShouldRun = false
let appIsQuitting = false
let devPythonReady = false
let pythonProcessMode: 'worker' | 'manual' | null = null
type UpdateStatus = 'disabled' | 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
let updateState: {
  status: UpdateStatus
  message: string
  currentVersion: string
  targetVersion?: string
  percent?: number
  downloadedBytes?: number
  totalBytes?: number
  releaseDate?: string
  checkedAt?: string
  error?: string
} = {
  status: is.dev ? 'disabled' : 'idle',
  message: is.dev ? 'Updates disabled in dev mode' : 'Idle',
  currentVersion: app.getVersion(),
}

function sendToAllWindows(channel: string, payload: unknown) {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(channel, payload)
  })
}

function setUpdateState(patch: Partial<typeof updateState>) {
  updateState = {
    ...updateState,
    ...patch,
    currentVersion: app.getVersion(),
  }
  sendToAllWindows('app:update-state', updateState)
}

function setupAutoUpdater() {
  if (!app.isPackaged) {
    setUpdateState({
      status: 'disabled',
      message: 'Updates disabled in dev mode',
      checkedAt: new Date().toISOString(),
    })
    return
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = console

  autoUpdater.on('checking-for-update', () => {
    setUpdateState({
      status: 'checking',
      message: 'Checking for updates...',
      checkedAt: new Date().toISOString(),
      error: undefined,
    })
  })

  autoUpdater.on('update-available', (info) => {
    setUpdateState({
      status: 'available',
      message: `Update available: ${info.version}`,
      targetVersion: info.version,
      releaseDate: info.releaseDate,
      percent: 0,
      checkedAt: new Date().toISOString(),
      error: undefined,
    })
  })

  autoUpdater.on('update-not-available', () => {
    setUpdateState({
      status: 'not-available',
      message: 'App is up to date',
      targetVersion: undefined,
      percent: undefined,
      checkedAt: new Date().toISOString(),
      error: undefined,
    })
  })

  autoUpdater.on('download-progress', (p) => {
    setUpdateState({
      status: 'downloading',
      message: `Downloading update... ${Math.round(p.percent)}%`,
      percent: p.percent,
      downloadedBytes: p.transferred,
      totalBytes: p.total,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    setUpdateState({
      status: 'downloaded',
      message: `Update ${info.version} downloaded. Ready to install.`,
      targetVersion: info.version,
      percent: 100,
      releaseDate: info.releaseDate,
      error: undefined,
    })
  })

  autoUpdater.on('error', (err) => {
    const msg = String(err?.message || err)
    if (msg.includes('404')) {
      setUpdateState({
        status: 'not-available',
        message: 'Chưa có bản phát hành mới trên GitHub (App đang là bản mới nhất)',
        checkedAt: new Date().toISOString(),
        error: undefined,
      })
      return
    }
    setUpdateState({
      status: 'error',
      message: `Update error: ${msg}`,
      error: String(err?.stack || msg),
      checkedAt: new Date().toISOString(),
    })
  })

  // Light startup check.
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      const msg = String(err?.message || err)
      if (msg.includes('404')) {
        setUpdateState({
          status: 'not-available',
          message: 'Chưa có bản phát hành mới trên GitHub (App đang là bản mới nhất)',
          checkedAt: new Date().toISOString(),
          error: undefined,
        })
        return
      }
      setUpdateState({
        status: 'error',
        message: `Update check failed: ${msg}`,
        error: msg,
      })
    })
  }, 3000)
}

function foxAutoRootPath() {
  return is.dev ? join(__dirname, '../../../') : process.resourcesPath
}

function cliBinaryPath() {
  return is.dev ? join(__dirname, '../../../irs_bot/cli.py') : join(process.resourcesPath, 'irs_bot_server.exe')
}

function pythonDevLaunch(baseArgs: string[]) {
  if (process.platform === 'win32') {
    return { cmd: 'py', args: ['-3', ...baseArgs] }
  }
  return { cmd: 'python3', args: baseArgs }
}

function spawnAndCollect(cmd: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(cmd, args, { cwd, env })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => { stdout += d.toString() })
    child.stderr?.on('data', (d) => { stderr += d.toString() })
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
  })
}

async function ensureDevPythonReady() {
  if (!is.dev) return
  if (devPythonReady) return
  if (ensureDevPythonReadyPromise) return ensureDevPythonReadyPromise
  ensureDevPythonReadyPromise = (async () => {
    const root = foxAutoRootPath()
    const launch = pythonDevLaunch(['-c', 'import yaml, pandas, openpyxl, requests, camoufox, socks, geoip2, browserforge, apify_fingerprint_datapoints'])
    const probe = await spawnAndCollect(launch.cmd, launch.args, root, { ...process.env, PYTHONPATH: root })
    if (probe.code !== 0) {
      const install = pythonDevLaunch(['-m', 'pip', 'install', '-r', join(root, 'irs_bot', 'requirements.txt')])
      const installed = await spawnAndCollect(install.cmd, install.args, root, { ...process.env, PYTHONPATH: root })
      if (installed.code !== 0) {
        throw new Error(installed.stderr || installed.stdout || 'Failed to install Python requirements')
      }
    }
    devPythonReady = true
  })().finally(() => {
    ensureDevPythonReadyPromise = null
  })
  return ensureDevPythonReadyPromise
}

function userDataDir() {
  return app.getPath('userData')
}

const DEFAULT_GOOGLE_DRIVE_EXPORT_FOLDER_ID = '1T2dKn2ZKq77xsPBV-fI_Qo-DUyyZi5-d'
const GOOGLE_DRIVE_CHUNK_SIZE = 200

function runtimeConfigPath() {
  const dir = join(userDataDir(), 'irs-bot')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'config.yml')
}

function appSettingsPath() {
  const dir = join(userDataDir(), 'ui')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'settings.json')
}

type AppUiSettings = {
  storageDir?: string
  queueTimezone?: string
  queueCountry?: string
  queueStartHour?: number
  forceRunNow?: boolean
  workerCount?: number
  proxies?: any[]
  proxyAuth?: any
  globalRotateSecs?: number
}

function loadAppSettings(): AppUiSettings {
  try {
    const path = appSettingsPath()
    if (!existsSync(path)) return {}
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    return {
      storageDir: raw?.storageDir ? String(raw.storageDir) : undefined,
      queueTimezone: raw?.queueTimezone ? String(raw.queueTimezone) : undefined,
      queueCountry: raw?.queueCountry ? String(raw.queueCountry) : undefined,
      queueStartHour: Number.isFinite(Number(raw?.queueStartHour)) ? Number(raw.queueStartHour) : undefined,
      forceRunNow: Boolean(raw?.forceRunNow),
      workerCount: Number.isFinite(Number(raw?.workerCount)) ? Number(raw.workerCount) : undefined,
      proxies: Array.isArray(raw?.proxies) ? raw.proxies : undefined,
      proxyAuth: raw?.proxyAuth ? raw.proxyAuth : undefined,
      globalRotateSecs: Number.isFinite(Number(raw?.globalRotateSecs)) ? Number(raw.globalRotateSecs) : undefined,
    }
  } catch {
    return {}
  }
}

function saveAppSettings(patch: Partial<AppUiSettings>) {
  const current = loadAppSettings()
  const next = { ...current, ...patch }
  writeFileSync(appSettingsPath(), JSON.stringify(next, null, 2), 'utf-8')
}

function normalizeRuntimePath(input: string) {
  const raw = String(input || '').trim()
  if (!raw) return ''
  if (process.platform === 'win32') {
    const marker = /[\\/]AppData[\\/]Roaming[\\/]bug-auto[\\/](.*)$/i
    const match = raw.match(marker)
    if (match && match[1]) {
      const relocated = join(userDataDir(), match[1])
      if (existsSync(relocated) || !existsSync(raw)) {
        return relocated
      }
    }
    return raw
  }
  const m = raw.match(/^([a-zA-Z]):[\\/](.*)$/)
  if (!m) return raw
  const drive = m[1].toLowerCase()
  const rest = m[2].replace(/\\/g, '/')
  return `/mnt/${drive}/${rest}`
}

function formatDobForReport(input: unknown) {
  const raw = String(input ?? '').trim()
  if (!raw) return ''
  if (/^\d{8}$/.test(raw)) {
    const mm = raw.slice(0, 2)
    const dd = raw.slice(2, 4)
    const yyyy = raw.slice(4, 8)
    return `${mm}/${dd}/${yyyy}`
  }
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw)
    // Excel/Sheets serial date; allow older DOB values (e.g. 18044 => 1949-05-19).
    if (Number.isFinite(serial) && serial >= 1 && serial < 100000) {
      const utcDays = Math.floor(serial - 25569)
      const ms = utcDays * 86400 * 1000
      const dt = new Date(ms)
      const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
      const dd = String(dt.getUTCDate()).padStart(2, '0')
      const yyyy = String(dt.getUTCFullYear())
      return `${mm}/${dd}/${yyyy}`
    }
  }
  return raw
}

function normalizeBodForReport(input: unknown) {
  return formatDobForReport(String(input ?? '').trim())
}

function buildSelectedReportRows(rows: any[]) {
  const toText = (v: unknown) => String(v ?? '').trim()
  return rows.map((row) => {
    return {
      NAME: toText(row?.NAME),
      SSN: toText(row?.SSN),
      ADDRESS: toText(row?.ADDRESS),
      CITI: toText(row?.CITI),
      BANG: toText(row?.BANG),
      ZIP: toText(row?.ZIP),
      BOD: normalizeBodForReport(row?.BOD),
      GENDER: toText(row?.GENDER),
      EIN: toText(row?.EIN),
      'NAME LLC': toText(row?.['NAME LLC']),
      'ADDRESS LLC': toText(row?.['ADDRESS LLC']),
      'CITI LLC': toText(row?.['CITI LLC']),
      'BANG LLC': toText(row?.['BANG LLC']),
      'ZIP LLC': toText(row?.['ZIP LLC']),
      PDF: toText(row?.PDF),
      FOLDER_URL: toText(row?.FOLDER_URL),
    }
  })
}

type GoogleDriveConfig = {
  authMode: 'oauth_user' | 'service_account'
  serviceAccountPath?: string
  oauthClientPath?: string
  oauthRefreshTokenPath?: string
  folderId: string
}

type GoogleServiceAccount = {
  client_email: string
  private_key: string
  token_uri?: string
}

type GoogleOAuthWebClient = {
  web?: {
    client_id?: string
    client_secret?: string
    token_uri?: string
  }
}

const googleDriveFolderCache = new Map<string, string>()
const googleDriveLockChains = new Map<string, Promise<void>>()

async function withGoogleDriveLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prior = googleDriveLockChains.get(key) || Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => { release = resolve })
  googleDriveLockChains.set(key, prior.then(() => current))
  await prior
  try {
    return await fn()
  } finally {
    release()
    if (googleDriveLockChains.get(key) === current) {
      googleDriveLockChains.delete(key)
    }
  }
}

function applyReportSheetLayout(ws: XLSX.WorkSheet, headers: string[], rows: Array<Record<string, unknown>>) {
  const textColumns = new Set(['SSN', 'ZIP', 'BOD', 'EIN', 'GENDER', 'PDF', 'FOLDER_URL', 'REPORT_URL', 'DATE'])
  ws['!cols'] = headers.map((header) => {
    const maxLen = Math.max(
      header.length,
      ...rows.map((row) => String(row?.[header] ?? '').length),
    )
    const maxWidth = header === 'PDF' || header === 'FOLDER_URL' || header === 'REPORT_URL' ? 96 : 36
    return { wch: Math.min(Math.max(maxLen + 2, 12), maxWidth) }
  })
  for (let rowIdx = 0; rowIdx < rows.length; rowIdx += 1) {
    for (let colIdx = 0; colIdx < headers.length; colIdx += 1) {
      const header = headers[colIdx]
      if (!textColumns.has(header)) continue
      const addr = XLSX.utils.encode_cell({ r: rowIdx + 1, c: colIdx })
      const cell = ws[addr]
      if (!cell) continue
      cell.t = 's'
      cell.v = String(rows[rowIdx]?.[header] ?? '')
      delete cell.z
      delete cell.w
    }
  }
  const genderIndex = headers.indexOf('GENDER')
  if (genderIndex >= 0) {
    const femaleFill = { patternType: 'solid', fgColor: { rgb: 'DDEBF7' } }
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx += 1) {
      if (String(rows[rowIdx]?.GENDER ?? '').trim().toUpperCase() !== 'F') continue
      for (let colIdx = 0; colIdx < headers.length; colIdx += 1) {
        const cell = ws[XLSX.utils.encode_cell({ r: rowIdx + 1, c: colIdx })]
        if (cell) cell.s = { ...(cell.s || {}), fill: femaleFill }
      }
    }
  }
}

function storageRootDir() {
  const s = loadAppSettings()
  if (s.storageDir && s.storageDir.trim()) {
    return normalizeRuntimePath(s.storageDir)
  }
  return normalizeRuntimePath(userDataDir())
}

function windowStatePath() {
  const dir = join(userDataDir(), 'ui')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'window-state.json')
}

type WindowState = { width: number; height: number; x?: number; y?: number }

function loadWindowState() {
  const fallback: WindowState = { width: 1280, height: 820 }
  try {
    const path = windowStatePath()
    if (!existsSync(path)) return fallback
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    return {
      width: Number(raw?.width || fallback.width),
      height: Number(raw?.height || fallback.height),
      x: Number.isFinite(Number(raw?.x)) ? Number(raw.x) : undefined,
      y: Number.isFinite(Number(raw?.y)) ? Number(raw.y) : undefined,
    }
  } catch {
    return fallback
  }
}

function saveWindowState(win: BrowserWindow) {
  try {
    if (win.isMinimized() || win.isMaximized() || win.isFullScreen()) return
    const b = win.getBounds()
    writeFileSync(windowStatePath(), JSON.stringify(b), 'utf-8')
  } catch {
    // ignore
  }
}

function resolveWorkerCount() {
  const saved = loadAppSettings().workerCount
  const raw = Number.isFinite(saved) ? saved! : Number(process.env.BUG_AUTO_WORKERS || '3')
  if (!Number.isFinite(raw)) return 3
  return Math.max(1, Math.min(8, Math.floor(raw)))
}

function waitForProcessClose(proc: ChildProcess, timeoutMs = 5000) {
  return new Promise<void>((resolve) => {
    if (proc.exitCode !== null) {
      resolve()
      return
    }
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      resolve()
    }
    proc.once('close', done)
    setTimeout(done, Math.max(500, timeoutMs))
  })
}

function killProcessTree(proc: ChildProcess) {
  return new Promise<void>((resolve) => {
    const pid = Number(proc.pid || 0)
    if (!Number.isFinite(pid) || pid <= 0) {
      try { proc.kill() } catch { /* ignore */ }
      resolve()
      return
    }
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
      killer.on('close', () => {
        try {
          const browserKiller = spawn('taskkill', ['/IM', 'camoufox.exe', '/F'], { windowsHide: true })
          browserKiller.on('close', () => resolve())
          browserKiller.on('error', () => resolve())
        } catch {
          resolve()
        }
      })
      killer.on('error', () => {
        try { proc.kill() } catch { /* ignore */ }
        try { spawn('taskkill', ['/IM', 'camoufox.exe', '/F'], { windowsHide: true }) } catch { /* ignore */ }
        resolve()
      })
      return
    }

    try {
      proc.kill('SIGTERM')
    } catch {
      // ignore
    }
    setTimeout(() => {
      if (proc.exitCode === null) {
        try { proc.kill('SIGKILL') } catch { /* ignore */ }
      }
      resolve()
    }, 1200)
  })
}

async function startPythonBackend() {
  workerShouldRun = true
  if (stopPythonBackendPromise) {
    await stopPythonBackendPromise
  }
  if (pythonProcess && pythonProcess.exitCode === null) {
    return
  }
  if (startPythonBackendPromise) {
    return startPythonBackendPromise
  }
  startPythonBackendPromise = (async () => {
    if (is.dev) {
      await ensureDevPythonReady()
    }
    if (pythonProcess && pythonProcess.exitCode === null) {
      return
    }
    const runtime = await ensureRuntimeConfig()
    const flowMode = String(runtime?.flowMode || 'full')
    const workerCount = resolveWorkerCount()
    console.log(`Starting Python backend mode=${flowMode} workers=${workerCount}...`)

    if (flowMode === 'manual') {
      pythonProcessMode = 'manual'
      if (is.dev) {
        const foxAutoRoot = foxAutoRootPath()
        const launch = pythonDevLaunch(['-u', '-m', 'irs_bot', '--config', runtimeConfigPath(), 'manual'])
        pythonProcess = spawn(launch.cmd, launch.args, {
          cwd: foxAutoRoot,
          env: { ...process.env, PYTHONPATH: foxAutoRoot, PYTHONUNBUFFERED: '1' }
        })
      } else {
        const exePath = cliBinaryPath()
        pythonProcess = spawn(exePath, ['--config', runtimeConfigPath(), 'manual'], {
          cwd: process.resourcesPath
        })
      }
    } else if (is.dev) {
      pythonProcessMode = 'worker'
      // In dev: run as package module to preserve relative imports.
      const foxAutoRoot = foxAutoRootPath()
      const launch = pythonDevLaunch(['-u', '-m', 'irs_bot', '--config', runtimeConfigPath(), 'worker', '--queues', 'ein.high,ein.default,ein.retry,ein.observe,ein.sandbox', '--workers', String(workerCount)])
      pythonProcess = spawn(launch.cmd, launch.args, {
        cwd: foxAutoRoot,
        env: { ...process.env, PYTHONPATH: foxAutoRoot, PYTHONUNBUFFERED: '1' }
      })
    } else {
      pythonProcessMode = 'worker'
      // In production: run the bundled PyInstaller exe.
      const exePath = cliBinaryPath()
      pythonProcess = spawn(exePath, ['--config', runtimeConfigPath(), 'worker', '--queues', 'ein.high,ein.default,ein.retry,ein.observe,ein.sandbox', '--workers', String(workerCount)], {
        cwd: process.resourcesPath
      })
    }

    try {
      const candidates = [
        join(storageRootDir(), 'state', 'worker_start.signal'),
        join(foxAutoRootPath(), 'state', 'worker_start.signal'),
      ]
      for (const sig of candidates) {
        if (existsSync(sig)) unlinkSync(sig)
      }
    } catch {}

    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('py:worker_started', { mode: pythonProcessMode, workers: workerCount })
    })

    const EVENT_PREFIX = 'EVENT::'

    // Buffer for partial lines across chunks
    lineBuffer = ''

    pythonProcess.stdout?.on('data', (data) => {
      lineBuffer += data.toString()
      const lines = lineBuffer.split('\n')
      lineBuffer = lines.pop() ?? '' // keep last incomplete line

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line) continue

        if (line.startsWith(EVENT_PREFIX)) {
          // Structured JSON event → emit typed IPC
          try {
            const payload = JSON.parse(line.slice(EVENT_PREFIX.length))
            const eventType: string = payload.event
            if (eventType === 'job_complete') {
              void (async () => {
                try {
                  await autoPushConfirmedPdfToDrive(payload)
                  await autoPushBatchReportOnConfirm(String(payload?.batch_id || ''))
                } catch (driveErr) {
                  console.warn('[DriveAutoPush] error on job_complete:', driveErr)
                }
              })()
            }
            if (eventType === 'system_stop_requested') {
              void (async () => {
                await stopPythonBackend()
                try {
                  if (process.platform === 'win32') {
                    spawn('taskkill', ['/IM', 'camoufox.exe', '/F'], { windowsHide: true })
                  }
                } catch { /* ignore */ }
              })()
            }
            BrowserWindow.getAllWindows().forEach(win => {
              win.webContents.send(`py:${eventType}`, payload)
            })
          } catch {
            console.warn('[IPC] Failed to parse EVENT line:', line)
          }
        } else {
          // Plain log line → forward as-is
          console.log(`[Python]: ${line}`)
          BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('python-log', line)
          })
        }
      }
    })

    pythonProcess.stderr?.on('data', (data) => {
      const text = data.toString()
      const lines = text.split('\n').map((x) => x.trim()).filter(Boolean)
      for (const line of lines) {
        const isError = /(?:\bERROR\b|Traceback|Exception|CRITICAL)/i.test(line)
        const tag = isError ? '[Python Error]' : '[Python]'
        if (isError) console.error(`${tag}: ${line}`)
        else console.log(`${tag}: ${line}`)
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('python-log', `${tag}: ${line}`)
        })
      }
    })

    pythonProcess.on('close', (code) => {
      console.log(`Python process exited with code ${code}`)
      BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('py:worker-stopped', { code })
      })
      const shouldRestart = workerShouldRun && !appIsQuitting && pythonProcessMode === 'worker'
      pythonProcess = null
      pythonProcessMode = null
      if (shouldRestart) {
        setTimeout(() => {
          startPythonBackend().catch((err) => {
            console.error(`Failed to auto-restart Python worker: ${String(err)}`)
          })
        }, 1200)
      }
    })
  })().finally(() => {
    startPythonBackendPromise = null
  })
  return startPythonBackendPromise
}

async function safeStopPythonBackend(timeoutMs = 180000) {
  workerShouldRun = false
  if (stopPythonBackendPromise) {
    return stopPythonBackendPromise
  }
  const proc = pythonProcess
  if (!proc || proc.exitCode !== null) {
    return
  }
  stopPythonBackendPromise = (async () => {
    console.log('Safe stop requested: signaling Python backend to finish in-flight jobs...')
    try {
      const signalFile = join(storageRootDir(), 'state', 'worker_stop.signal')
      await fs.writeFile(signalFile, `${Date.now()}`, 'utf-8')
    } catch {}
    try {
      proc.stdin?.write('STOP\n')
    } catch {}

    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('py:worker_stopping', { graceful: true })
    })

    await waitForProcessClose(proc, timeoutMs)

    if (proc.exitCode === null) {
      console.warn(`Python backend did not exit within ${timeoutMs}ms; force killing...`)
      await killProcessTree(proc)
      await waitForProcessClose(proc, 4000)
    }

    if (pythonProcess === proc) {
      pythonProcess = null
    }
    pythonProcessMode = null
    try {
      const signalFile = join(storageRootDir(), 'state', 'worker_stop.signal')
      if (existsSync(signalFile)) await fs.unlink(signalFile)
    } catch {}
  })().finally(() => {
    stopPythonBackendPromise = null
  })
  return stopPythonBackendPromise
}

async function forceStopPythonBackend() {
  workerShouldRun = false
  const proc = pythonProcess
  if (!proc || proc.exitCode !== null) {
    return
  }
  console.log('Force stopping Python backend immediately...')
  await killProcessTree(proc)
  await waitForProcessClose(proc, 4000)
  if (pythonProcess === proc) {
    pythonProcess = null
  }
  pythonProcessMode = null
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/IM', 'camoufox.exe', '/F'], { windowsHide: true })
    }
  } catch {}
  try {
    const signalFile = join(storageRootDir(), 'state', 'worker_stop.signal')
    if (existsSync(signalFile)) await fs.unlink(signalFile)
  } catch {}
  try {
    await runPythonCli(['queue', 'recover-running', '--stale-seconds', '0'])
  } catch {}
}

async function stopPythonBackend() {
  return safeStopPythonBackend()
}

function runPythonCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    ;(async () => {
      const root = foxAutoRootPath()
      const cli = cliBinaryPath()
      if (is.dev) {
        await ensureDevPythonReady()
      }
      const devLaunch = is.dev
        ? pythonDevLaunch(['-m', 'irs_bot', '--config', runtimeConfigPath(), ...args])
        : null
      const cmd = is.dev ? devLaunch!.cmd : cli
      const fullArgs = is.dev
        ? devLaunch!.args
        : ['--config', runtimeConfigPath(), ...args]
      resolve(await spawnAndCollect(cmd, fullArgs, root, { ...process.env, PYTHONPATH: root }))
    })().catch((err) => {
      resolve({ code: 1, stdout: '', stderr: String(err) })
    })
  })
}

function toYamlScalar(v: string | number | boolean) {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return `"${String(v ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function normalizeUrlLike(v: string) {
  let s = String(v || '').trim()
  while (
    s.length >= 2 &&
    ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
  ) {
    s = s.slice(1, -1).trim()
  }
  if (s.startsWith('"') || s.startsWith("'")) s = s.slice(1).trim()
  if (s.endsWith('"') || s.endsWith("'")) s = s.slice(0, -1).trim()
  return s
}

function normalizeProxyScheme(v: string) {
  const scheme = String(v || '').trim().toLowerCase()
  if (['http', 'https', 'socks5', 'socks5h', 'socks4', 'socks4a'].includes(scheme)) return scheme
  return 'http'
}

function parseProxyEndpointInput(input: {
  host?: string
  port?: string | number
  username?: string
  password?: string
}) {
  let host = normalizeUrlLike(String(input.host || ''))
  let port = Number(input.port || 0)
  let username = normalizeUrlLike(String(input.username || ''))
  let password = normalizeUrlLike(String(input.password || ''))
  let socketHost = host
  let scheme = 'http'

  if (host.includes('://')) {
    try {
      const parsed = new URL(host)
      scheme = normalizeProxyScheme(parsed.protocol.replace(':', ''))
      const parsedHost = String(parsed.hostname || '').trim()
      if (parsedHost) {
        socketHost = parsedHost
        host = `${scheme}://${parsedHost}`
      }
      if (parsed.port) {
        const parsedPort = Number(parsed.port)
        if (Number.isFinite(parsedPort) && parsedPort > 0) port = parsedPort
      }
      if (!username && parsed.username) {
        try { username = decodeURIComponent(parsed.username) } catch { username = parsed.username }
      }
      if (!password && parsed.password) {
        try { password = decodeURIComponent(parsed.password) } catch { password = parsed.password }
      }
    } catch {
      host = host.replace(/\/+$/, '')
      socketHost = host
    }
  } else {
    const inline = host.match(/^(?:[^@]+@)?([^:\s]+):(\d+)$/)
    if (inline) {
      socketHost = inline[1]
      host = inline[1]
      if (!Number.isFinite(port) || port <= 0) {
        const parsedPort = Number(inline[2])
        if (Number.isFinite(parsedPort) && parsedPort > 0) port = parsedPort
      }
    }
  }

  socketHost = String(socketHost || '').replace(/^\[/, '').replace(/\]$/, '').trim()
  if (!host) host = socketHost
  if (!Number.isFinite(port) || port <= 0) port = 8178

  return {
    host,
    port,
    username,
    password,
    socketHost,
    scheme,
  }
}

function buildProxyAuthHeader(username: string, password: string) {
  if (!username && !password) return ''
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf-8').toString('base64')}`
}

async function openProxyTunnel(payload: {
  proxyHost: string
  proxyPort: number
  username?: string
  password?: string
  targetHost: string
  targetPort: number
  timeoutMs: number
}) {
  const {
    proxyHost, proxyPort, username = '', password = '', targetHost, targetPort, timeoutMs,
  } = payload
  return await new Promise<net.Socket>((resolve, reject) => {
    const socket = net.createConnection({ host: proxyHost, port: proxyPort })
    let settled = false
    let buffer = ''

    const finish = (err?: Error) => {
      if (settled) return
      settled = true
      if (err) {
        try { socket.destroy() } catch { /* ignore */ }
        reject(err)
      } else {
        socket.removeAllListeners('data')
        socket.removeAllListeners('error')
        socket.removeAllListeners('timeout')
        resolve(socket)
      }
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => {
      const auth = buildProxyAuthHeader(username, password)
      const lines = [
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1`,
        `Host: ${targetHost}:${targetPort}`,
      ]
      if (auth) lines.push(`Proxy-Authorization: ${auth}`)
      lines.push('Connection: keep-alive', '', '')
      socket.write(lines.join('\r\n'))
    })
    socket.on('data', (chunk) => {
      buffer += chunk.toString('latin1')
      if (!buffer.includes('\r\n\r\n')) return
      const header = buffer.slice(0, buffer.indexOf('\r\n\r\n'))
      const firstLine = header.split('\r\n')[0] || ''
      const match = firstLine.match(/^HTTP\/\d\.\d\s+(\d{3})/)
      const statusCode = match ? Number(match[1]) : 0
      if (statusCode === 200) {
        finish()
        return
      }
      finish(new Error(firstLine || 'Proxy CONNECT failed'))
    })
    socket.once('timeout', () => finish(new Error(`timeout ${timeoutMs}ms`)))
    socket.once('error', (err) => finish(err))
  })
}

async function requestIrsViaProxy(payload: {
  proxyHost: string
  proxyPort: number
  username?: string
  password?: string
  timeoutMs: number
}) {
  const tunnel = await openProxyTunnel({
    ...payload,
    targetHost: 'sa.www4.irs.gov',
    targetPort: 443,
  })
  return await new Promise<{ statusCode: number; statusLine: string; bodySnippet: string }>((resolve, reject) => {
    const secure = tls.connect({
      socket: tunnel,
      servername: 'sa.www4.irs.gov',
      timeout: payload.timeoutMs,
    })
    let raw = ''
    let settled = false

    const finish = (err?: Error, result?: { statusCode: number; statusLine: string; bodySnippet: string }) => {
      if (settled) return
      settled = true
      try { secure.destroy() } catch { /* ignore */ }
      if (err) reject(err)
      else resolve(result || { statusCode: 0, statusLine: '', bodySnippet: '' })
    }

    secure.once('secureConnect', () => {
      const request = [
        'GET /applyein/legalStructure HTTP/1.1',
        'Host: sa.www4.irs.gov',
        'User-Agent: bug-auto-proxy-check/1.0',
        'Accept: text/html,application/xhtml+xml',
        'Connection: close',
        '',
        '',
      ].join('\r\n')
      secure.write(request)
    })
    secure.setEncoding('utf8')
    secure.on('data', (chunk) => {
      raw += chunk
      if (raw.length >= 8192) {
        const headerEnd = raw.indexOf('\r\n\r\n')
        const header = headerEnd >= 0 ? raw.slice(0, headerEnd) : raw
        const body = headerEnd >= 0 ? raw.slice(headerEnd + 4) : ''
        const firstLine = header.split('\r\n')[0] || ''
        const match = firstLine.match(/^HTTP\/\d\.\d\s+(\d{3})/)
        finish(undefined, {
          statusCode: match ? Number(match[1]) : 0,
          statusLine: firstLine,
          bodySnippet: body.slice(0, 400),
        })
      }
    })
    secure.once('end', () => {
      const headerEnd = raw.indexOf('\r\n\r\n')
      const header = headerEnd >= 0 ? raw.slice(0, headerEnd) : raw
      const body = headerEnd >= 0 ? raw.slice(headerEnd + 4) : ''
      const firstLine = header.split('\r\n')[0] || ''
      const match = firstLine.match(/^HTTP\/\d\.\d\s+(\d{3})/)
      finish(undefined, {
        statusCode: match ? Number(match[1]) : 0,
        statusLine: firstLine,
        bodySnippet: body.slice(0, 400),
      })
    })
    secure.once('timeout', () => finish(new Error(`timeout ${payload.timeoutMs}ms`)))
    secure.once('error', (err) => finish(err))
  })
}


function googleDriveServiceAccountCandidates() {
  return [
    process.env.BUG_AUTO_GOOGLE_DRIVE_SERVICE_ACCOUNT || '',
    join(userDataDir(), 'google-drive', 'service-account.json'),
    join(storageRootDir(), 'google-drive', 'service-account.json'),
    is.dev ? join(foxAutoRootPath(), 'private', 'google-drive', 'service-account.json') : '',
  ].filter(Boolean)
}

function googleDriveOAuthClientCandidates() {
  return [
    process.env.BUG_AUTO_GOOGLE_OAUTH_CLIENT || '',
    join(userDataDir(), 'google-drive', 'oauth-web-client.json'),
    join(storageRootDir(), 'google-drive', 'oauth-web-client.json'),
    is.dev ? join(foxAutoRootPath(), 'private', 'google-drive', 'oauth-web-client.json') : '',
  ].filter(Boolean)
}

function googleDriveOAuthRefreshTokenCandidates() {
  return [
    process.env.BUG_AUTO_GOOGLE_OAUTH_REFRESH_TOKEN_FILE || '',
    join(userDataDir(), 'google-drive', 'oauth-user.json'),
    join(storageRootDir(), 'google-drive', 'oauth-user.json'),
    is.dev ? join(foxAutoRootPath(), 'private', 'google-drive', 'oauth-user.json') : '',
  ].filter(Boolean)
}

function resolveGoogleDriveConfig(): GoogleDriveConfig | null {
  const folderId = String(process.env.BUG_AUTO_GOOGLE_DRIVE_FOLDER_ID || DEFAULT_GOOGLE_DRIVE_EXPORT_FOLDER_ID).trim()
  if (!folderId) return null
  for (const clientPath of googleDriveOAuthClientCandidates()) {
    if (!existsSync(clientPath)) continue
    for (const refreshTokenPath of googleDriveOAuthRefreshTokenCandidates()) {
      if (!existsSync(refreshTokenPath)) continue
      return {
        authMode: 'oauth_user',
        oauthClientPath: clientPath,
        oauthRefreshTokenPath: refreshTokenPath,
        folderId,
      }
    }
  }
  for (const candidate of googleDriveServiceAccountCandidates()) {
    if (existsSync(candidate)) {
      return {
        authMode: 'service_account',
        serviceAccountPath: candidate,
        folderId,
      }
    }
  }
  return null
}

function base64UrlEncode(input: Buffer | string) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

async function fetchServiceAccountToken(serviceAccountPath: string): Promise<string> {
  const raw = JSON.parse(await fs.readFile(serviceAccountPath, 'utf-8')) as GoogleServiceAccount
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + 3600
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claimSet = base64UrlEncode(JSON.stringify({
    iss: raw.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: raw.token_uri || 'https://oauth2.googleapis.com/token',
    exp,
    iat,
  }))
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claimSet}`)
  signer.end()
  const signature = base64UrlEncode(signer.sign(raw.private_key))
  const assertion = `${header}.${claimSet}.${signature}`
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  })
  const resp = await fetch(raw.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await resp.json() as { access_token?: string; error?: string; error_description?: string }
  if (!resp.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `Google service account token error ${resp.status}`)
  }
  return data.access_token
}

async function fetchGoogleDriveAccessToken(config: GoogleDriveConfig): Promise<string> {
  if (config.authMode === 'oauth_user' && config.oauthClientPath && config.oauthRefreshTokenPath) {
    try {
      const oauthClient = JSON.parse(await fs.readFile(config.oauthClientPath, 'utf-8')) as GoogleOAuthWebClient
      const refreshRaw = JSON.parse(await fs.readFile(config.oauthRefreshTokenPath, 'utf-8')) as { refresh_token?: string }
      const clientId = String(oauthClient?.web?.client_id || '').trim()
      const clientSecret = String(oauthClient?.web?.client_secret || '').trim()
      const refreshToken = String(refreshRaw?.refresh_token || '').trim()
      if (clientId && clientSecret && refreshToken) {
        const body = new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        })
        const resp = await fetch(oauthClient?.web?.token_uri || 'https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        })
        const data = await resp.json() as { access_token?: string; error?: string; error_description?: string }
        if (resp.ok && data.access_token) {
          return data.access_token
        }
        console.warn(`[Google Drive] OAuth refresh token failed (${data.error || 'unknown'}), falling back to Service Account...`)
      }
    } catch (oauthErr) {
      console.warn(`[Google Drive] OAuth token attempt failed: ${String(oauthErr)}, falling back to Service Account...`)
    }
  }

  // Fallback or primary: Service Account
  for (const candidate of googleDriveServiceAccountCandidates()) {
    if (existsSync(candidate)) {
      try {
        return await fetchServiceAccountToken(candidate)
      } catch (saErr) {
        console.warn(`[Google Drive] Service Account candidate ${candidate} failed: ${String(saErr)}`)
      }
    }
  }

  throw new Error('Google Drive authentication failed: OAuth token expired and Service Account not available.')
}

async function googleDriveFindFileIdByName(token: string, folderId: string, fileName: string) {
  const q = encodeURIComponent(`'${folderId}' in parents and name = '${fileName.replace(/'/g, "\\'")}' and trashed = false`)
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await resp.json() as { files?: Array<{ id: string; name: string }> }
  if (!resp.ok) {
    throw new Error(`Google list error ${resp.status}`)
  }
  return data.files?.[0]?.id || ''
}

async function googleDriveListChildren(token: string, folderId: string) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`)
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,modifiedTime)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await resp.json() as { files?: Array<{ id: string; name: string; mimeType: string; modifiedTime?: string }> }
  if (!resp.ok) {
    throw new Error(`Google list error ${resp.status}`)
  }
  return data.files || []
}

async function googleDriveDeleteFile(token: string, fileId: string) {
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resp.ok && resp.status !== 404) {
    const text = await resp.text()
    throw new Error(text || `Google delete error ${resp.status}`)
  }
}

async function clearDirectoryContents(dirPath: string) {
  let entries: Array<import('fs').Dirent>
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true }) as Array<import('fs').Dirent>
  } catch {
    return
  }
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      await fs.rm(fullPath, { recursive: true, force: true })
    } else {
      await fs.unlink(fullPath).catch(() => {})
    }
  }
}

async function googleDriveDeleteChildrenExcept(token: string, folderId: string, keepNames: Set<string>) {
  const children = await googleDriveListChildren(token, folderId)
  const toDelete = children.filter((child) => !keepNames.has(String(child?.name || '')))
  await Promise.all(toDelete.map((child) => googleDriveDeleteFile(token, String(child.id || '')).catch(() => {})))
}

async function googleSheetsGetSpreadsheet(token: string, spreadsheetId: string) {
  const resp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await resp.json() as {
    sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>
  }
  if (!resp.ok) {
    throw new Error(`Google Sheets get error ${resp.status}`)
  }
  return data
}

async function googleDriveEnsureSpreadsheetFile(token: string, folderId: string, fileName: string) {
  const existingId = await googleDriveFindFileIdByName(token, folderId, fileName)
  if (existingId) return existingId
  const resp = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: fileName,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [folderId],
    }),
  })
  const data = await resp.json() as { id?: string; error?: { message?: string } }
  if (!resp.ok || !data.id) {
    throw new Error(data.error?.message || `Google spreadsheet create error ${resp.status}`)
  }
  return data.id
}

function buildSheetCellData(value: unknown) {
  const text = String(value ?? '')
  return {
    userEnteredValue: { stringValue: text },
  }
}

async function googleSheetsWriteBundleReport(token: string, spreadsheetId: string, headers: string[], rows: Array<Record<string, unknown>>) {
  const spreadsheet = await googleSheetsGetSpreadsheet(token, spreadsheetId)
  const sheetId = Number(spreadsheet?.sheets?.[0]?.properties?.sheetId || 0)
  const headerRow = {
    values: headers.map((header) => buildSheetCellData(header)),
  }
  const dataRows = rows.map((row) => ({
    values: headers.map((header) => {
      return buildSheetCellData(row?.[header])
    }),
  }))
  const requests: any[] = [
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          title: 'report',
          gridProperties: {
            rowCount: Math.max(rows.length + 20, 200),
            columnCount: Math.max(headers.length + 2, 18),
          },
        },
        fields: 'title,gridProperties.rowCount,gridProperties.columnCount',
      },
    },
    {
      updateCells: {
        range: {
          sheetId,
        },
        rows: [],
        fields: 'userEnteredValue',
      },
    },
    {
      updateCells: {
        start: {
          sheetId,
          rowIndex: 0,
          columnIndex: 0,
        },
        rows: [headerRow, ...dataRows],
        fields: 'userEnteredValue',
      },
    },
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: headers.length,
        },
        cell: {
          userEnteredFormat: {
            textFormat: {
              bold: true,
            },
          },
        },
        fields: 'userEnteredFormat.textFormat.bold',
      },
    },
    ...headers.map((header, index) => ({
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: 'COLUMNS',
          startIndex: index,
          endIndex: index + 1,
        },
        properties: {
          pixelSize: header === 'PDF' || header === 'FOLDER_URL' ? 420 : 160,
        },
        fields: 'pixelSize',
      },
    })),
  ]
  const genderIndex = headers.indexOf('GENDER')
  if (genderIndex >= 0) {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      if (String(rows[rowIndex]?.GENDER ?? '').trim().toUpperCase() !== 'F') continue
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: rowIndex + 1,
            endRowIndex: rowIndex + 2,
            startColumnIndex: 0,
            endColumnIndex: headers.length,
          },
          cell: { userEnteredFormat: { backgroundColor: { red: 0.866, green: 0.922, blue: 0.969 } } },
          fields: 'userEnteredFormat.backgroundColor',
        },
      })
    }
  }
  const resp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  })
  const data = await resp.json() as { error?: { message?: string } }
  if (!resp.ok) {
    throw new Error(data?.error?.message || `Google Sheets batchUpdate error ${resp.status}`)
  }
}

async function googleDriveEnsureChildFolder(token: string, parentId: string, folderName: string) {
  const cacheKey = `${parentId}:${folderName}`
  const cached = googleDriveFolderCache.get(cacheKey)
  if (cached) return cached
  return await withGoogleDriveLock(`folder:${cacheKey}`, async () => {
    const fromCache = googleDriveFolderCache.get(cacheKey)
    if (fromCache) return fromCache
    const children = await googleDriveListChildren(token, parentId)
    const matches = children
      .filter((file) => file.name === folderName && file.mimeType === 'application/vnd.google-apps.folder')
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    if (matches[0]?.id) {
      googleDriveFolderCache.set(cacheKey, matches[0].id)
      return matches[0].id
    }
    const resp = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      }),
    })
    const data = await resp.json() as { id?: string; error?: { message?: string } }
    if (!resp.ok || !data.id) {
      throw new Error(data.error?.message || `Google folder create error ${resp.status}`)
    }
    googleDriveFolderCache.set(cacheKey, data.id)
    return data.id
  })
}

async function googleDriveResolveBatchContainer(token: string, batchId: string) {
  const cfg = resolveGoogleDriveConfig()
  if (!cfg) throw new Error('Google Drive config missing')
  const batchToken = prettifyBatchToken(batchId, 'mixed')
  return await withGoogleDriveLock(`resolve-batch-container:${batchToken}`, async () => {
    const batchRootId = await googleDriveEnsureChildFolder(token, cfg.folderId, batchToken)
    return {
      rootId: cfg.folderId,
      batchRootId,
      batchToken,
    }
  })
}

async function googleDriveResolveChunkFolder(token: string, batchId: string, chunkIndex: number) {
  const batch = await googleDriveResolveBatchContainer(token, batchId)
  const chunkLabel = chunkLabelFromIndex(chunkIndex)
  const chunkFolderId = await googleDriveEnsureChildFolder(token, batch.batchRootId, chunkLabel)
  return {
    ...batch,
    chunkIndex,
    chunkLabel,
    chunkFolderId,
  }
}

async function googleDriveUploadFile(input: {
  token: string
  folderId: string
  localPath: string
  remoteName: string
  mimeType: string
  replaceExisting?: boolean
}) {
  const fileBuffer = await fs.readFile(input.localPath)
  const boundary = `bugauto-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const metadata = JSON.stringify({
    name: input.remoteName,
    parents: [input.folderId],
  })
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  const existingId = input.replaceExisting
    ? await googleDriveFindFileIdByName(input.token, input.folderId, input.remoteName)
    : ''
  const uploadUrl = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart&supportsAllDrives=true`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true'
  const resp = await fetch(uploadUrl, {
    method: existingId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${input.token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })
  const data = await resp.json() as { id?: string; error?: { message?: string } }
  if (!resp.ok || !data.id) {
    throw new Error(data.error?.message || `Google upload error ${resp.status}`)
  }
  return data.id
}

async function googleDriveMakePublic(token: string, fileId: string) {
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      role: 'reader',
      type: 'anyone',
    }),
  })
  if (!resp.ok && resp.status !== 409) {
    const text = await resp.text()
    throw new Error(text || `Google permission error ${resp.status}`)
  }
}

function googleDriveViewUrl(fileId: string) {
  return `https://drive.google.com/file/d/${fileId}/view`
}

function googleDriveFolderUrl(folderId: string) {
  return `https://drive.google.com/drive/folders/${folderId}`
}

function chunkIndexForOrdinal(ordinal: number) {
  return Math.max(1, Math.floor(Math.max(0, ordinal - 1) / GOOGLE_DRIVE_CHUNK_SIZE) + 1)
}

function chunkLabelFromIndex(index: number) {
  const safeIndex = Math.max(1, Number(index || 1))
  const start = (safeIndex - 1) * GOOGLE_DRIVE_CHUNK_SIZE + 1
  const end = safeIndex * GOOGLE_DRIVE_CHUNK_SIZE
  return `chunk_${String(safeIndex).padStart(4, '0')}_${String(start).padStart(4, '0')}-${String(end).padStart(4, '0')}`
}

function buildUploadBundleName(rowCount: number) {
  return `${hcmDateLabel()} - ${Math.max(0, Number(rowCount || 0))} DONE`
}

async function autoPushConfirmedPdfToDrive(row: any) {
  const cfg = resolveGoogleDriveConfig()
  if (!cfg) return
  const ein = String(row?.confirmation_number || row?.step6_ein || '').trim()
  if (!ein) return
  const batchId = String(row?.batch_id || '').trim()
  const recordId = String(row?.record_id || '').trim()
  const stateKey = makeBatchRecordKey(batchId, recordId)
  if (stateKey) {
    const state = await loadGoogleDriveAutoPushState(storageRootDir())
    if (String(state.pdf_url_by_batch_record[stateKey] || '').trim()) return
  }
  const localPath = normalizeRuntimePath(String(row?.final_pdf_path || row?.pdf_path || '').trim())
  if (!localPath) return
  try {
    await fs.access(localPath)
  } catch {
    return
  }
  try {
    await new Promise((resolve) => setTimeout(resolve, 200))
    await withGoogleDriveLock(`batch-upload:${batchId}`, async () => {
      const base = storageRootDir()
      const confirmedRows = await loadConfirmedRowsForBatch(base, batchId)
      const ordinal = confirmedRows.findIndex((item) => String(item?.record_id || '').trim() === recordId) + 1
      const chunkIndex = chunkIndexForOrdinal(ordinal > 0 ? ordinal : confirmedRows.length || 1)
      const token = await fetchGoogleDriveAccessToken(cfg)
      const chunk = await googleDriveResolveChunkFolder(token, batchId, chunkIndex)
      const remoteName = buildPrettyPdfFileName(row, 1, extname(localPath) || '.pdf')
      const fileId = await googleDriveUploadFile({
        token,
        folderId: chunk.chunkFolderId,
        localPath,
        remoteName,
        mimeType: 'application/pdf',
        replaceExisting: true,
      })
      await googleDriveMakePublic(token, fileId)
      const state = await loadGoogleDriveAutoPushState(storageRootDir())
      if (stateKey) {
        state.pdf_url_by_batch_record[stateKey] = googleDriveViewUrl(fileId)
        await saveGoogleDriveAutoPushState(storageRootDir(), state)
      }
    })
  } catch (err) {
    console.warn(`Google Drive auto PDF push skipped: ${String(err)}`)
  }
}

async function reconcileGoogleDriveChunkOutputs(token: string, batchId: string, chunkIndex: number, chunkRows: any[]) {
  const chunk = await googleDriveResolveChunkFolder(token, batchId, chunkIndex)
  const keepPdfNames = new Set<string>()
  chunkRows.forEach((row, idx) => {
    const localPath = normalizeRuntimePath(String(row?.final_pdf_path || row?.pdf_path || '').trim())
    const ext = extname(localPath || '') || '.pdf'
    keepPdfNames.add(buildPrettyPdfFileName(row, idx + 1, ext))
  })
  const children = (await googleDriveListChildren(token, chunk.chunkFolderId))
    .filter((file) => String(file?.mimeType || '').toLowerCase() !== 'application/vnd.google-apps.folder')
    .sort((a, b) => String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || '')) || String(a.id).localeCompare(String(b.id)))
  const keptPdfNames = new Set<string>()
  let keptReport = false
  for (const file of children) {
    const isReport = file.name === 'report.xlsx'
    if (isReport && !keptReport) {
      keptReport = true
      continue
    }
    if (isReport) {
      await googleDriveDeleteFile(token, file.id)
      continue
    }
    const shouldKeep = keepPdfNames.has(file.name) && !keptPdfNames.has(file.name)
    if (shouldKeep) {
      keptPdfNames.add(file.name)
      continue
    }
    await googleDriveDeleteFile(token, file.id)
  }
}

async function updateGoogleDriveBatchSummary(token: string, baseDir: string, batchId: string, confirmedRows: any[]) {
  const batch = await googleDriveResolveBatchContainer(token, batchId)
  const batchToken = prettifyBatchToken(batchId, 'mixed')
  const summaryRows: Array<Record<string, unknown>> = []
  const chunkCount = chunkIndexForOrdinal(Math.max(1, confirmedRows.length))
  for (let chunkIndex = 1; chunkIndex <= chunkCount; chunkIndex += 1) {
    const start = (chunkIndex - 1) * GOOGLE_DRIVE_CHUNK_SIZE
    const chunkRows = confirmedRows.slice(start, start + GOOGLE_DRIVE_CHUNK_SIZE)
    if (!chunkRows.length) continue
    const chunk = await googleDriveResolveChunkFolder(token, batchId, chunkIndex)
    const reportId = await googleDriveFindFileIdByName(token, chunk.chunkFolderId, 'report.xlsx')
    const latestCompletedAt = String(chunkRows[chunkRows.length - 1]?.completed_at || new Date().toISOString()).trim()
    summaryRows.push({
      CHUNK: chunk.chunkLabel,
      FOLDER_URL: googleDriveFolderUrl(chunk.chunkFolderId),
      REPORT_URL: reportId ? googleDriveViewUrl(reportId) : '',
      ROWS: chunkRows.length,
      DATE: latestCompletedAt,
    })
  }
  const { xlsxPath } = await writeBatchChunkSummaryBundle(baseDir, batchToken, summaryRows)
  const summaryId = await googleDriveUploadFile({
    token,
    folderId: batch.batchRootId,
    localPath: xlsxPath,
    remoteName: 'summary.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    replaceExisting: true,
  })
  await googleDriveMakePublic(token, summaryId)
}

async function loadArchivedInputByRecordIds(base: string, recordIds: string[]) {
  const wanted = new Set(recordIds.map((v) => String(v || '').trim()).filter(Boolean))
  const byRecord = new Map<string, Record<string, string>>()
  if (!wanted.size) return byRecord
  const candidateFiles = new Map<string, number>()
  const archiveDir = join(base, 'state', 'ui_archive')
  if (existsSync(archiveDir)) {
    const entries = await fs.readdir(archiveDir)
    const archiveFiles = await Promise.all(
      entries
        .filter((name) => name.toLowerCase().endsWith('.csv'))
        .map(async (name) => {
          const fullPath = join(archiveDir, name)
          const stat = await fs.stat(fullPath)
          return { fullPath, mtimeMs: stat.mtimeMs }
        }),
    )
    for (const file of archiveFiles) {
      candidateFiles.set(file.fullPath, file.mtimeMs)
    }
  }
  const batchDir = join(base, 'state', 'batches')
  if (existsSync(batchDir)) {
    const batchEntries = await fs.readdir(batchDir)
    for (const name of batchEntries) {
      if (!name.toLowerCase().endsWith('.json')) continue
      const fullPath = join(batchDir, name)
      try {
        const stat = await fs.stat(fullPath)
        const payload = JSON.parse(await fs.readFile(fullPath, 'utf-8')) as { source_file?: string }
        const sourceFile = normalizeRuntimePath(String(payload?.source_file || '').trim())
        if (!sourceFile) continue
        if (!existsSync(sourceFile)) continue
        candidateFiles.set(sourceFile, Math.max(candidateFiles.get(sourceFile) || 0, stat.mtimeMs))
      } catch {
        // ignore broken batch manifest
      }
    }
  }
  const queueDbPath = join(base, 'state', 'queue.db')
  if (existsSync(queueDbPath)) {
    try {
      const BetterSqlite3 = (await import('better-sqlite3')).default
      const db = new BetterSqlite3(queueDbPath, { readonly: true })
      const jobRows = db.prepare('SELECT payload FROM jobs').all() as Array<{ payload?: string }>
      for (const jobRow of jobRows) {
        try {
          const payload = JSON.parse(String(jobRow?.payload || '')) as { record?: Record<string, unknown> }
          const record = payload?.record || {}
          const recordId = String(record.record_id || '').trim()
          if (!recordId || !wanted.has(recordId)) continue
          byRecord.set(recordId, Object.fromEntries(
            Object.entries(record).map(([key, value]) => [key, String(value ?? '').trim()]),
          ))
        } catch {
          // ignore bad queue payload
        }
      }
      db.close()
    } catch {
      // queue db fallback only
    }
  }
  const csvFiles = Array.from(candidateFiles.entries()).map(([fullPath, mtimeMs]) => ({ fullPath, mtimeMs }))
  csvFiles.sort((a, b) => a.mtimeMs - b.mtimeMs)
  for (const file of csvFiles) {
    const raw = await fs.readFile(file.fullPath, 'utf-8')
    const wb = XLSX.read(raw, { type: 'string' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    for (const row of rows) {
      const recordId = String(row?.record_id || '').trim()
      if (!recordId || !wanted.has(recordId)) continue
      byRecord.set(recordId, Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, String(value ?? '').trim()]),
      ))
    }
  }
  return byRecord
}

async function enrichSelectedReportRows(base: string, rows: any[]) {
  const inputs = await loadArchivedInputByRecordIds(base, rows.map((row) => String(row?.record_id || '')))
  const pushState = await loadGoogleDriveAutoPushState(base)
  const driveConfig = resolveGoogleDriveConfig()
  const pdfUrls = new Map<string, string>()
  const chunkFolderUrls = new Map<string, string>()
  if (driveConfig) {
    try {
      const token = await fetchGoogleDriveAccessToken(driveConfig)
      const batchIds = Array.from(new Set(rows.map((row) => String(row?.batch_id || '').trim()).filter(Boolean)))
      const confirmedRowsByBatch = new Map<string, any[]>()
      const chunkFolderByKey = new Map<string, string>()
      for (const batchId of batchIds) {
        confirmedRowsByBatch.set(batchId, await loadConfirmedRowsForBatch(base, batchId))
      }
      const uploadedByPath = new Map<string, string>()
      for (let idx = 0; idx < rows.length; idx += 1) {
        const row = rows[idx] || {}
        const batchId = String(row?.batch_id || '').trim()
        const recordId = String(row?.record_id || '').trim()
        const confirmedEin = String(row?.confirmation_number || row?.step6_ein || '').trim()
        if (!confirmedEin) continue
        const confirmedRows = confirmedRowsByBatch.get(batchId) || []
        const ordinal = confirmedRows.findIndex((item) => String(item?.record_id || '').trim() === recordId) + 1
        const chunkIndex = chunkIndexForOrdinal(ordinal > 0 ? ordinal : confirmedRows.length || idx + 1)
        const chunkKey = `${batchId}::${chunkIndex}`
        let chunkFolderUrl = chunkFolderByKey.get(chunkKey) || ''
        let chunkFolderId = ''
        if (!chunkFolderUrl) {
          const chunk = await googleDriveResolveChunkFolder(token, batchId, chunkIndex)
          chunkFolderId = chunk.chunkFolderId
          chunkFolderUrl = googleDriveFolderUrl(chunk.chunkFolderId)
          chunkFolderByKey.set(chunkKey, chunkFolderUrl)
        }
        chunkFolderUrls.set(recordId, chunkFolderUrl)
        const stateKey = makeBatchRecordKey(batchId, recordId)
        const cachedPdfUrl = stateKey ? String(pushState.pdf_url_by_batch_record[stateKey] || '').trim() : ''
        if (cachedPdfUrl) {
          pdfUrls.set(recordId, cachedPdfUrl)
          continue
        }
        const localPath = normalizeRuntimePath(String(row?.final_pdf_path || row?.pdf_path || '').trim())
        if (!localPath) continue
        try {
          await fs.access(localPath)
        } catch {
          continue
        }
        let fileId = uploadedByPath.get(localPath) || ''
        if (!fileId) {
          const remoteName = buildPrettyPdfFileName(row, idx + 1, extname(localPath) || '.pdf')
          const targetFolderId = chunkFolderId || (await googleDriveResolveChunkFolder(token, batchId, chunkIndex)).chunkFolderId
          fileId = await googleDriveUploadFile({
            token,
            folderId: targetFolderId,
            localPath,
            remoteName,
            mimeType: 'application/pdf',
            replaceExisting: true,
          })
          await googleDriveMakePublic(token, fileId)
          uploadedByPath.set(localPath, fileId)
        }
        const pdfUrl = googleDriveViewUrl(fileId)
        pdfUrls.set(recordId, pdfUrl)
        if (stateKey) {
          pushState.pdf_url_by_batch_record[stateKey] = pdfUrl
        }
      }
    } catch (err) {
      console.warn(`Google Drive PDF upload skipped: ${String(err)}`)
    }
  }
  await saveGoogleDriveAutoPushState(base, pushState)

  return rows.map((row) => {
    const input = inputs.get(String(row?.record_id || '').trim()) || {}
    const inputAddress = String(input.ADDRESS || '').trim()
    const inputCity = String(input.CITI || '').trim()
    const inputState = String(input.BANG || '').trim()
    const inputZip = String(input.ZIP || '').trim()
    return {
      NAME: String(input.NAME || row?.name || row?.record_name || '').trim(),
      SSN: String(input.SSN || '').trim(),
      ADDRESS: inputAddress,
      CITI: inputCity,
      BANG: inputState,
      ZIP: inputZip,
      BOD: formatDobForReport(input.DOB || ''),
      GENDER: String(input.GENDER || '').trim(),
      EIN: String(row?.confirmation_number || row?.step6_ein || '').trim(),
      'NAME LLC': String(row?.step6_legal_name || input.NAME || row?.name || row?.record_name || '').trim(),
      'ADDRESS LLC': inputAddress,
      'CITI LLC': inputCity,
      'BANG LLC': String(row?.step6_state || inputState || '').trim(),
      'ZIP LLC': inputZip,
      PDF: pdfUrls.get(String(row?.record_id || '').trim()) || '',
      FOLDER_URL: chunkFolderUrls.get(String(row?.record_id || '').trim()) || '',
    }
  })
}

type ExportContinuationState = {
  version: 1
  exported_keys: Record<string, true>
  exported_keys_by_token: Record<string, Record<string, true>>
  part_by_token: Record<string, number>
  last_seq_by_token: Record<string, number>
}

type GoogleDriveAutoPushState = {
  version: 1
  report_pushed_count_by_batch: Record<string, number>
  pdf_url_by_batch_record: Record<string, string>
}

const EXPORT_CONTINUATION_FILENAME = 'continuation-v1.json'
const GOOGLE_DRIVE_AUTO_PUSH_FILENAME = 'google-drive-auto-v1.json'

function emptyExportContinuationState(): ExportContinuationState {
  return {
    version: 1,
    exported_keys: {},
    exported_keys_by_token: {},
    part_by_token: {},
    last_seq_by_token: {},
  }
}

function emptyGoogleDriveAutoPushState(): GoogleDriveAutoPushState {
  return {
    version: 1,
    report_pushed_count_by_batch: {},
    pdf_url_by_batch_record: {},
  }
}

type BundleMasterIndexEntry = {
  bundle_name: string
  date: string
  rows: number
  batch_id: string
  local_folder: string
  local_report_path: string
  drive_folder_url: string
  drive_report_url: string
  created_at: string
}

async function loadBundleMasterIndex(baseDir: string): Promise<BundleMasterIndexEntry[]> {
  const stateDir = join(baseDir, 'outputs', 'export_state')
  const statePath = join(stateDir, 'bundle_master_index.json')
  try {
    const raw = JSON.parse(await fs.readFile(statePath, 'utf-8'))
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

async function saveBundleMasterIndex(baseDir: string, entries: BundleMasterIndexEntry[]) {
  const stateDir = join(baseDir, 'outputs', 'export_state')
  const statePath = join(stateDir, 'bundle_master_index.json')
  await fs.mkdir(stateDir, { recursive: true })
  await fs.writeFile(statePath, JSON.stringify(entries, null, 2), 'utf-8')
}

function upsertBundleMasterIndexEntry(entries: BundleMasterIndexEntry[], next: BundleMasterIndexEntry) {
  const without = entries.filter((entry) => String(entry.bundle_name || '').trim() !== next.bundle_name)
  return [next, ...without].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
}

function makeBatchRecordKey(batchId: unknown, recordId: unknown) {
  const batch = String(batchId || '').trim()
  const record = String(recordId || '').trim()
  if (!batch || !record) return ''
  return `${batch}::${record}`
}

async function loadGoogleDriveAutoPushState(baseDir: string): Promise<GoogleDriveAutoPushState> {
  const stateDir = join(baseDir, 'outputs', 'export_state')
  const statePath = join(stateDir, GOOGLE_DRIVE_AUTO_PUSH_FILENAME)
  try {
    const raw = JSON.parse(await fs.readFile(statePath, 'utf-8'))
    return {
      version: 1,
      report_pushed_count_by_batch: raw?.report_pushed_count_by_batch && typeof raw.report_pushed_count_by_batch === 'object'
        ? raw.report_pushed_count_by_batch
        : {},
      pdf_url_by_batch_record: raw?.pdf_url_by_batch_record && typeof raw.pdf_url_by_batch_record === 'object'
        ? raw.pdf_url_by_batch_record
        : {},
    }
  } catch {
    return emptyGoogleDriveAutoPushState()
  }
}

async function saveGoogleDriveAutoPushState(baseDir: string, state: GoogleDriveAutoPushState) {
  const stateDir = join(baseDir, 'outputs', 'export_state')
  const statePath = join(stateDir, GOOGLE_DRIVE_AUTO_PUSH_FILENAME)
  await fs.mkdir(stateDir, { recursive: true })
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8')
}

function hiddenResultsPath(baseDir: string): string {
  const dir = join(baseDir, 'state')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'hidden_results.json')
}

async function loadHiddenResultsKeys(baseDir: string): Promise<Set<string>> {
  try {
    const p = hiddenResultsPath(baseDir)
    if (!existsSync(p)) return new Set()
    const raw = JSON.parse(await fs.readFile(p, 'utf-8'))
    const list = Array.isArray(raw?.hidden_keys) ? raw.hidden_keys : []
    return new Set(list.map((k: any) => String(k || '').trim()).filter(Boolean))
  } catch {
    return new Set()
  }
}

async function saveHiddenResultsKeys(baseDir: string, keys: Set<string>): Promise<void> {
  try {
    const p = hiddenResultsPath(baseDir)
    const data = {
      version: 1,
      updated_at: new Date().toISOString(),
      hidden_keys: Array.from(keys),
    }
    await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf-8')
  } catch {}
}

async function loadResultsRowsForBatch(baseDir: string, batchId: string) {
  const resultsPath = join(baseDir, 'outputs', 'results.csv')
  if (!existsSync(resultsPath)) return []
  const raw = await fs.readFile(resultsPath, 'utf-8')
  const wb = XLSX.read(raw, { type: 'string' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  return rows.filter((row) => String(row?.batch_id || '').trim() === batchId)
}

async function loadConfirmedRowsForBatch(baseDir: string, batchId: string) {
  const batchRows = await loadResultsRowsForBatch(baseDir, batchId)
  return batchRows.filter((row) => String(row?.confirmation_number || row?.step6_ein || '').trim())
}

async function writeCompactReportBundle(baseDir: string, fileBase: string, sheetRows: Array<Record<string, unknown>>) {
  const headers = [
    'NAME',
    'SSN',
    'ADDRESS',
    'CITI',
    'BANG',
    'ZIP',
    'BOD',
    'GENDER',
    'EIN',
    'NAME LLC',
    'ADDRESS LLC',
    'CITI LLC',
    'BANG LLC',
    'ZIP LLC',
    'PDF',
    'FOLDER_URL',
  ]
  const ws = XLSX.utils.json_to_sheet(sheetRows, { header: headers })
  applyReportSheetLayout(ws, headers, sheetRows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'report')
  const outDir = join(baseDir, 'outputs', 'reports')
  await fs.mkdir(outDir, { recursive: true })
  const csvPath = join(outDir, `${fileBase}.csv`)
  const xlsxPath = join(outDir, `${fileBase}.xlsx`)
  await fs.writeFile(csvPath, XLSX.utils.sheet_to_csv(ws), 'utf-8')
  XLSX.writeFile(wb, xlsxPath)
  return { csvPath, xlsxPath }
}

async function writeBatchChunkSummaryBundle(baseDir: string, batchToken: string, rows: Array<Record<string, unknown>>) {
  const headers = ['CHUNK', 'FOLDER_URL', 'REPORT_URL', 'ROWS', 'DATE']
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers })
  applyReportSheetLayout(ws, headers, rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'chunks')
  const outDir = join(baseDir, 'outputs', 'reports')
  await fs.mkdir(outDir, { recursive: true })
  const xlsxPath = join(outDir, `summary_${batchToken}.xlsx`)
  XLSX.writeFile(wb, xlsxPath)
  return { xlsxPath }
}

async function writeBundleMasterIndexWorkbook(filePath: string, rows: BundleMasterIndexEntry[]) {
  const headers = [
    'DATE',
    'BUNDLE_NAME',
    'ROWS',
    'BATCH_ID',
    'LOCAL_FOLDER',
    'LOCAL_REPORT_PATH',
    'DRIVE_FOLDER_URL',
    'DRIVE_REPORT_URL',
    'CREATED_AT',
  ]
  const sheetRows = rows.map((row) => ({
    DATE: row.date,
    BUNDLE_NAME: row.bundle_name,
    ROWS: row.rows,
    BATCH_ID: row.batch_id,
    LOCAL_FOLDER: row.local_folder,
    LOCAL_REPORT_PATH: row.local_report_path,
    DRIVE_FOLDER_URL: row.drive_folder_url,
    DRIVE_REPORT_URL: row.drive_report_url,
    CREATED_AT: row.created_at,
  }))
  const ws = XLSX.utils.json_to_sheet(sheetRows, { header: headers })
  applyReportSheetLayout(ws, headers, sheetRows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'bundles')
  await fs.mkdir(dirname(filePath), { recursive: true })
  XLSX.writeFile(wb, filePath)
}

async function googleSheetsWriteGenericTable(token: string, spreadsheetId: string, headers: string[], rows: Array<Record<string, unknown>>) {
  const spreadsheet = await googleSheetsGetSpreadsheet(token, spreadsheetId)
  const sheetId = Number(spreadsheet?.sheets?.[0]?.properties?.sheetId || 0)
  const headerRow = {
    values: headers.map((header) => buildSheetCellData(header)),
  }
  const dataRows = rows.map((row) => ({
    values: headers.map((header) => {
      return buildSheetCellData(row?.[header])
    }),
  }))
  const requests = [
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          title: 'bundles',
          gridProperties: {
            rowCount: Math.max(rows.length + 20, 200),
            columnCount: Math.max(headers.length + 2, 16),
          },
        },
        fields: 'title,gridProperties.rowCount,gridProperties.columnCount',
      },
    },
    {
      updateCells: {
        range: { sheetId },
        rows: [],
        fields: 'userEnteredValue',
      },
    },
    {
      updateCells: {
        start: { sheetId, rowIndex: 0, columnIndex: 0 },
        rows: [headerRow, ...dataRows],
        fields: 'userEnteredValue',
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: headers.length },
        cell: { userEnteredFormat: { textFormat: { bold: true } } },
        fields: 'userEnteredFormat.textFormat.bold',
      },
    },
    ...headers.map((header, index) => ({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: index, endIndex: index + 1 },
        properties: {
          pixelSize: header.endsWith('_URL') || header.startsWith('LOCAL_') ? 360 : 170,
        },
        fields: 'pixelSize',
      },
    })),
  ]
  const resp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  })
  const data = await resp.json() as { error?: { message?: string } }
  if (!resp.ok) {
    throw new Error(data?.error?.message || `Google Sheets batchUpdate error ${resp.status}`)
  }
}

async function updateBundleMasterIndexes(baseDir: string, entry: BundleMasterIndexEntry) {
  const nextEntries = upsertBundleMasterIndexEntry(await loadBundleMasterIndex(baseDir), entry)
  await saveBundleMasterIndex(baseDir, nextEntries)

  const desktopDir = app.getPath('desktop')
  const localMasterPath = join(desktopDir, '_MASTER_UPLOAD_INDEX.xlsx')
  await writeBundleMasterIndexWorkbook(localMasterPath, nextEntries)

  const driveConfig = resolveGoogleDriveConfig()
  if (!driveConfig) return
  const token = await fetchGoogleDriveAccessToken(driveConfig)
  const spreadsheetId = await googleDriveEnsureSpreadsheetFile(token, driveConfig.folderId, '_MASTER_UPLOAD_INDEX')
  const rows = nextEntries.map((row) => ({
    DATE: row.date,
    BUNDLE_NAME: row.bundle_name,
    ROWS: row.rows,
    BATCH_ID: row.batch_id,
    LOCAL_FOLDER: row.local_folder,
    LOCAL_REPORT_PATH: row.local_report_path,
    DRIVE_FOLDER_URL: row.drive_folder_url,
    DRIVE_REPORT_URL: row.drive_report_url,
    CREATED_AT: row.created_at,
  }))
  await googleSheetsWriteGenericTable(token, spreadsheetId, [
    'DATE',
    'BUNDLE_NAME',
    'ROWS',
    'BATCH_ID',
    'LOCAL_FOLDER',
    'LOCAL_REPORT_PATH',
    'DRIVE_FOLDER_URL',
    'DRIVE_REPORT_URL',
    'CREATED_AT',
  ], rows)
  await googleDriveMakePublic(token, spreadsheetId)
}

async function buildAndUploadDriveBundle(input: {
  baseDir: string
  rows: any[]
  batchId: string
  folderName: string
  onProgress?: (payload: { percent: number; message: string; current?: number; total?: number }) => void
}) {
  const driveConfig = resolveGoogleDriveConfig()
  if (!driveConfig) throw new Error('Google Drive config missing')
  const desktopDir = app.getPath('desktop')
  const localFolder = join(desktopDir, input.folderName)
  const localPdfFolder = join(localFolder, 'PDF')
  await fs.mkdir(localFolder, { recursive: true })
  await clearDirectoryContents(localFolder)
  await fs.mkdir(localFolder, { recursive: true })
  await fs.mkdir(localPdfFolder, { recursive: true })

  const token = await fetchGoogleDriveAccessToken(driveConfig)
  input.onProgress?.({ percent: 5, message: 'Preparing folder...' })
  const driveFolderId = await googleDriveEnsureChildFolder(token, driveConfig.folderId, input.folderName)
  const drivePdfFolderId = await googleDriveEnsureChildFolder(token, driveFolderId, 'PDF')
  await googleDriveDeleteChildrenExcept(token, driveFolderId, new Set(['PDF']))
  await googleDriveMakePublic(token, driveFolderId).catch(() => {})
  await googleDriveMakePublic(token, drivePdfFolderId).catch(() => {})
  const driveFolderUrl = googleDriveFolderUrl(driveFolderId)
  const existingPdfChildren = await googleDriveListChildren(token, drivePdfFolderId)
  const existingPdfByName = new Map(
    existingPdfChildren
      .filter((child) => String(child?.mimeType || '') !== 'application/vnd.google-apps.folder')
      .map((child) => [String(child.name || ''), String(child.id || '')]),
  )
  const inputs = await loadArchivedInputByRecordIds(input.baseDir, input.rows.map((row) => String(row?.record_id || '')))
  const reportRows: Array<Record<string, unknown>> = []
  const uploadedNames = new Set<string>()
  let reusedPdfCount = 0
  const totalSteps = Math.max(1, input.rows.length + 2)
  input.onProgress?.({
    percent: 8,
    message: `Checking existing PDFs (${existingPdfByName.size} found on Drive)`,
    current: 0,
    total: input.rows.length,
  })

  type PreparedPdfItem = {
    idx: number
    row: Record<string, unknown>
    source: Record<string, unknown>
    sourcePdfPath: string
    fileName: string
    localPdfPath: string
    hasPdf: boolean
  }

  const items: PreparedPdfItem[] = []
  for (let idx = 0; idx < input.rows.length; idx += 1) {
    const row = input.rows[idx] || {}
    const source = inputs.get(String(row?.record_id || '').trim()) || {}
    const sourcePdfPath = normalizeRuntimePath(String(row?.final_pdf_path || row?.pdf_path || '').trim())
    let fileName = ''
    let localPdfPath = ''
    let hasPdf = false
    if (sourcePdfPath) {
      fileName = buildPrettyPdfFileName({ ...row, ...source }, idx + 1, extname(sourcePdfPath) || '.pdf')
      if (uploadedNames.has(fileName)) {
        const ext = extname(fileName) || '.pdf'
        const stem = fileName.slice(0, -ext.length)
        fileName = `${stem} - ${slugFilePart(row?.record_id, 24)}${ext}`
      }
      uploadedNames.add(fileName)
      localPdfPath = join(localPdfFolder, fileName)
      hasPdf = true
    }
    items.push({ idx, row, source, sourcePdfPath, fileName, localPdfPath, hasPdf })
  }

  const pdfUrlByIndex = new Map<number, string>()
  let processedCount = 0
  const UPLOAD_CONCURRENCY = 8

  let cursor = 0
  const workers = Array.from({ length: Math.min(UPLOAD_CONCURRENCY, Math.max(1, items.length)) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]
      if (!item) break
      if (item.hasPdf) {
        try {
          await fs.access(item.sourcePdfPath)
          await fs.copyFile(item.sourcePdfPath, item.localPdfPath)
          let fileId = String(existingPdfByName.get(item.fileName) || '').trim()
          if (fileId) {
            reusedPdfCount += 1
          } else {
            for (let attempt = 1; attempt <= 2; attempt += 1) {
              try {
                fileId = await googleDriveUploadFile({
                  token,
                  folderId: drivePdfFolderId,
                  localPath: item.localPdfPath,
                  remoteName: item.fileName,
                  mimeType: 'application/pdf',
                  replaceExisting: true,
                })
                existingPdfByName.set(item.fileName, fileId)
                break
              } catch (upErr) {
                if (attempt === 2) throw upErr
                await new Promise((r) => setTimeout(r, 1000))
              }
            }
          }
          await googleDriveMakePublic(token, fileId).catch(() => {})
          pdfUrlByIndex.set(item.idx, googleDriveViewUrl(fileId))
        } catch {
          // keep empty PDF url when local file is unavailable
        }
      }
      processedCount += 1
      input.onProgress?.({
        percent: Math.min(90, Math.round((processedCount / totalSteps) * 100)),
        message: `PDF ${processedCount}/${input.rows.length} · reused ${reusedPdfCount}`,
        current: processedCount,
        total: input.rows.length,
      })
    }
  })
  await Promise.all(workers)

  for (let idx = 0; idx < input.rows.length; idx += 1) {
    const item = items[idx]
    const row = item.row
    const source = item.source
    const pdfUrl = pdfUrlByIndex.get(idx) || ''
    const inputAddress = String(source.ADDRESS || '').trim()
    const inputCity = String(source.CITI || '').trim()
    const inputState = String(source.BANG || '').trim()
    const inputZip = String(source.ZIP || '').trim()
    reportRows.push({
      NAME: String(source.NAME || row?.name || row?.record_name || '').trim(),
      SSN: String(source.SSN || '').trim(),
      ADDRESS: inputAddress,
      CITI: inputCity,
      BANG: inputState,
      ZIP: inputZip,
      BOD: formatDobForReport(source.DOB || ''),
      GENDER: String(source.GENDER || '').trim(),
      EIN: String(row?.confirmation_number || row?.step6_ein || '').trim(),
      'NAME LLC': String(row?.step6_legal_name || source.NAME || row?.name || row?.record_name || '').trim(),
      'ADDRESS LLC': inputAddress,
      'CITI LLC': inputCity,
      'BANG LLC': String(row?.step6_state || inputState || '').trim(),
      'ZIP LLC': inputZip,
      PDF: pdfUrl,
      FOLDER_URL: driveFolderUrl,
    })
  }

  const headers = [
    'NAME',
    'SSN',
    'ADDRESS',
    'CITI',
    'BANG',
    'ZIP',
    'BOD',
    'GENDER',
    'EIN',
    'NAME LLC',
    'ADDRESS LLC',
    'CITI LLC',
    'BANG LLC',
    'ZIP LLC',
    'PDF',
    'FOLDER_URL',
  ]
  const ws = XLSX.utils.json_to_sheet(reportRows, { header: headers })
  applyReportSheetLayout(ws, headers, reportRows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'report')
  const localReportPath = join(localFolder, `${input.folderName}.xlsx`)
  XLSX.writeFile(wb, localReportPath)
  const manifestPath = join(localFolder, 'manifest.json')
  await fs.writeFile(manifestPath, JSON.stringify({
    schema_version: 1,
    created_at: new Date().toISOString(),
    bundle_name: input.folderName,
    batch_id: input.batchId,
    rows: reportRows.length,
    report_file: `${input.folderName}.xlsx`,
    pdf_folder: 'PDF',
  }, null, 2), 'utf-8')
  await googleDriveDeleteChildrenExcept(token, drivePdfFolderId, uploadedNames)
  input.onProgress?.({ percent: 92, message: 'Building Google Sheet...', current: input.rows.length, total: input.rows.length })
  const reportSheetName = input.folderName
  const reportId = await googleDriveEnsureSpreadsheetFile(token, driveFolderId, reportSheetName)
  await googleSheetsWriteBundleReport(token, reportId, headers, reportRows)
  await googleDriveMakePublic(token, reportId)
  input.onProgress?.({ percent: 100, message: 'Completed' })

  return {
    localFolder,
    localReportPath,
    driveFolderUrl,
    driveReportUrl: googleDriveViewUrl(reportId),
    rows: reportRows.length,
  }
}

async function autoPushBatchReportOnConfirm(batchId: string) {
  const cleanBatchId = String(batchId || '').trim()
  if (!cleanBatchId) return
  const base = storageRootDir()
  await new Promise((resolve) => setTimeout(resolve, 350))
  const confirmedRows = await loadConfirmedRowsForBatch(base, cleanBatchId)
  const confirmedCount = confirmedRows.length
  if (confirmedCount < 1) return
  const state = await loadGoogleDriveAutoPushState(base)
  const lastPushed = Number(state.report_pushed_count_by_batch[cleanBatchId] || 0)
  if (lastPushed >= confirmedCount) return
  const chunkIndex = chunkIndexForOrdinal(confirmedCount)
  const chunkStart = (chunkIndex - 1) * GOOGLE_DRIVE_CHUNK_SIZE
  const rowsForReport = confirmedRows.slice(chunkStart, chunkStart + GOOGLE_DRIVE_CHUNK_SIZE)
  const enrichedRows = await enrichSelectedReportRows(base, rowsForReport)
  const sheetRows = buildSelectedReportRows(enrichedRows)
  const batchToken = prettifyBatchToken(cleanBatchId, 'mixed')
  const fileBase = `report_${batchToken}_${chunkLabelFromIndex(chunkIndex)}`
  const { xlsxPath } = await writeCompactReportBundle(base, fileBase, sheetRows as Array<Record<string, unknown>>)
  const driveConfig = resolveGoogleDriveConfig()
  if (!driveConfig) return
  await withGoogleDriveLock(`batch-upload:${cleanBatchId}`, async () => {
    const token = await fetchGoogleDriveAccessToken(driveConfig)
    const chunk = await googleDriveResolveChunkFolder(token, cleanBatchId, chunkIndex)
    const xlsxLatestId = await googleDriveUploadFile({
      token,
      folderId: chunk.chunkFolderId,
      localPath: xlsxPath,
      remoteName: 'report.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      replaceExisting: true,
    })
    await googleDriveMakePublic(token, xlsxLatestId)
    if (confirmedCount <= 5 || confirmedCount % 10 === 0 || confirmedCount % GOOGLE_DRIVE_CHUNK_SIZE === 0) {
      await reconcileGoogleDriveChunkOutputs(token, cleanBatchId, chunkIndex, rowsForReport)
    }
    await updateGoogleDriveBatchSummary(token, base, cleanBatchId, confirmedRows)
  })
  state.report_pushed_count_by_batch[cleanBatchId] = confirmedCount
  await saveGoogleDriveAutoPushState(base, state)
}

function ensureTokenExportMap(state: ExportContinuationState, token: string): Record<string, true> {
  if (!state.exported_keys_by_token || typeof state.exported_keys_by_token !== 'object') {
    state.exported_keys_by_token = {}
  }
  const existing = state.exported_keys_by_token[token]
  if (existing && typeof existing === 'object') return existing
  const next: Record<string, true> = {}
  state.exported_keys_by_token[token] = next
  return next
}

function normalizeExportKeyPart(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function makeExportRowKey(row: any): string {
  const batch = normalizeExportKeyPart(row?.batch_id)
  const record = normalizeExportKeyPart(row?.record_id)
  if (batch && record) return `${batch}:${record}`
  if (record) return `record:${record}`

  const name = normalizeExportKeyPart(row?.name)
  const ein = normalizeExportKeyPart(row?.step6_ein || row?.confirmation_number || row?.ein)
  if (name && ein) return `name_ein:${name}:${ein}`
  return ''
}

function slugFilePart(v: unknown, max = 48): string {
  return String(v || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, max)
}

function prettifyBatchToken(batchId: string, fallback = 'mixed'): string {
  const cleaned = String(batchId || '').trim()
  if (!cleaned) return fallback
  return slugFilePart(cleaned, 36) || fallback
}

function buildSelectedExportBaseName(input: {
  reportType: 'report' | 'failures'
  batchId: string
  rowCount: number
  nextOnly?: boolean
  part?: number
  ts: string
}) {
  const scope = prettifyBatchToken(input.batchId, 'mixed')
  const kind = input.reportType === 'failures' ? 'failures' : 'report'
  const countToken = `${Math.max(0, Number(input.rowCount || 0))}rows`
  if (input.nextOnly) {
    const partToken = input.part && input.part > 0 ? `part${input.part}` : 'part1'
    return `${kind}_${scope}_${countToken}_${partToken}_${input.ts}`
  }
  return `${kind}_${scope}_${countToken}_${input.ts}`
}

function buildPrettyPdfFileName(row: any, sequence: number, ext: string) {
  const person = String(row?.name || row?.record_name || row?.NAME || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  const docId = String(row?.confirmation_number || row?.step6_ein || row?.ein || '')
    .replace(/[^A-Za-z0-9-]+/g, '')
    .trim()
    .slice(0, 24)
  const recordId = slugFilePart(row?.record_id, 24)
  const fallbackOrdinal = String(sequence).padStart(3, '0')
  const label = [
    person || 'Record',
    docId || fallbackOrdinal,
    recordId,
  ]
    .filter(Boolean)
    .join(' - ')
  return `${label}${ext}`
}

async function readReportRows(filePath: string): Promise<any[]> {
  try {
    const wb = XLSX.readFile(filePath, { cellDates: false })
    const firstSheet = wb.SheetNames[0]
    if (!firstSheet) return []
    const ws = wb.Sheets[firstSheet]
    if (!ws) return []
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

async function hydrateExportKeysFromReports(baseDir: string): Promise<Record<string, true>> {
  const keys: Record<string, true> = {}
  const reportsDir = join(baseDir, 'outputs', 'reports')
  let entries: Array<{ isFile: () => boolean; name: string }>
  try {
    entries = (await fs.readdir(reportsDir, { withFileTypes: true, encoding: 'utf8' })) as Array<{ isFile: () => boolean; name: string }>
  } catch {
    return keys
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue
    const ext = extname(entry.name).toLowerCase()
    if (ext !== '.xlsx' && ext !== '.csv') continue
    const filePath = join(reportsDir, entry.name)
    const rows = await readReportRows(filePath)
    for (const row of rows) {
      const key = makeExportRowKey(row)
      if (!key) continue
      keys[key] = true
    }
  }
  return keys
}

function hcmDateLabel(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  return fmt.format(now).replace(/\//g, '-')
}

async function detectMaxLegacyFPart(baseDir: string): Promise<number> {
  const reportsDir = join(baseDir, 'outputs', 'reports')
  let entries: string[] = []
  try {
    entries = await fs.readdir(reportsDir, { encoding: 'utf8' })
  } catch {
    return 0
  }
  let maxPart = 0
  for (const name of entries) {
    const m = String(name).match(/^\d{2}-\d{2}-\d{4}-F(\d+)\.(?:xlsx|csv)$/i)
    if (!m) continue
    const n = Number(m[1])
    if (Number.isFinite(n) && n > maxPart) maxPart = n
  }
  return maxPart
}

async function detectMaxPdfSequence(baseDir: string, batchToken: string, scope: string): Promise<number> {
  const pdfDir = join(baseDir, 'outputs', 'pdf_exports')
  let entries: Array<{ isDirectory: () => boolean; name: string }> = []
  try {
    entries = (await fs.readdir(pdfDir, { withFileTypes: true, encoding: 'utf8' })) as Array<{ isDirectory: () => boolean; name: string }>
  } catch {
    return 0
  }

  const folderPrefix = `${batchToken}_${scope}_`
  let maxSeq = 0
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const folderName = String(entry.name || '')
    if (!folderName.startsWith(folderPrefix)) continue
    const folderPath = join(pdfDir, folderName)
    let files: string[] = []
    try {
      files = await fs.readdir(folderPath, { encoding: 'utf8' })
    } catch {
      continue
    }
    for (const file of files) {
      const m = String(file).match(/^(\d{1,6})_/)
      if (!m) continue
      const n = Number(m[1])
      if (Number.isFinite(n) && n > maxSeq) maxSeq = n
    }
  }
  return maxSeq
}

function buildLegacyCompactReportRows(rows: any[]) {
  const toText = (v: unknown) => String(v ?? '').trim()
  return rows.map((row) => {
    return {
      NAME: toText(row?.NAME),
      SSN: toText(row?.SSN),
      ADDRESS: toText(row?.ADDRESS),
      CITI: toText(row?.CITI),
      BANG: toText(row?.BANG),
      ZIP: toText(row?.ZIP),
      BOD: normalizeBodForReport(row?.BOD),
      GENDER: toText(row?.GENDER),
      EIN: toText(row?.EIN),
      'NAME LLC': toText(row?.['NAME LLC']),
      'ADDRESS LLC': toText(row?.['ADDRESS LLC']),
      'CITI LLC': toText(row?.['CITI LLC']),
      'BANG LLC': toText(row?.['BANG LLC']),
      'ZIP LLC': toText(row?.['ZIP LLC']),
      PDF: toText(row?.PDF),
    }
  })
}

async function loadExportContinuationState(baseDir: string): Promise<ExportContinuationState> {
  const stateDir = join(baseDir, 'outputs', 'export_state')
  const statePath = join(stateDir, EXPORT_CONTINUATION_FILENAME)
  try {
    const raw = JSON.parse(await fs.readFile(statePath, 'utf-8'))
    const legacyFlat = raw?.exported_keys && typeof raw.exported_keys === 'object' ? raw.exported_keys : {}
    const byToken = raw?.exported_keys_by_token && typeof raw.exported_keys_by_token === 'object'
      ? raw.exported_keys_by_token
      : {}
    if (!Object.keys(byToken).length && Object.keys(legacyFlat).length) {
      byToken['legacy_report:F'] = legacyFlat
    }
    return {
      version: 1,
      exported_keys: legacyFlat,
      exported_keys_by_token: byToken,
      part_by_token: raw?.part_by_token && typeof raw.part_by_token === 'object' ? raw.part_by_token : {},
      last_seq_by_token: raw?.last_seq_by_token && typeof raw.last_seq_by_token === 'object' ? raw.last_seq_by_token : {},
    }
  } catch {
    const seeded = emptyExportContinuationState()
    seeded.exported_keys = {}
    seeded.exported_keys_by_token['legacy_report:F'] = await hydrateExportKeysFromReports(baseDir)
    return seeded
  }
}

async function saveExportContinuationState(baseDir: string, state: ExportContinuationState) {
  const stateDir = join(baseDir, 'outputs', 'export_state')
  const statePath = join(stateDir, EXPORT_CONTINUATION_FILENAME)
  await fs.mkdir(stateDir, { recursive: true })
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8')
}

function nextPartNumber(state: ExportContinuationState, token: string): number {
  const part = Number(state.part_by_token?.[token] || 0)
  if (!Number.isFinite(part) || part <= 0) return 1
  return part + 1
}

async function writeRuntimeConfig(payload: {
  flowMode?: string
  proxies?: Array<{ enabled?: boolean; host?: string; port?: string | number; username?: string; password?: string }>
  globalRotateSecs?: number
  bearerToken?: string
  providerUsername?: string
  providerPassword?: string
  rotateUrl?: string
  queueTimezone?: string
  queueCountry?: string
  queueStartHour?: number
  forceRunNow?: boolean
  browserMode?: string
}) {
  const configPath = runtimeConfigPath()
  const userDir = storageRootDir()
  const artifactsDir = join(userDir, 'artifacts')
  const stateDir = join(userDir, 'state')
  const outputCsv = join(userDir, 'outputs', 'results.csv')
  mkdirSync(artifactsDir, { recursive: true })
  mkdirSync(stateDir, { recursive: true })
  mkdirSync(join(userDir, 'outputs'), { recursive: true })

  const savedSettings = loadAppSettings()
  const rawProxyInput = Array.isArray(payload.proxies) && payload.proxies.length > 0
    ? payload.proxies
    : (Array.isArray(savedSettings.proxies) && savedSettings.proxies.length > 0 ? savedSettings.proxies : [])

  const normalizedProxyList = rawProxyInput
    .map((p) => {
      const parsed = parseProxyEndpointInput({
        host: String(p?.host || ''),
        port: p?.port || 0,
        username: String(p?.username || ''),
        password: String(p?.password || ''),
      })
      return {
        enabled: Boolean(p?.enabled ?? true),
        host: String(parsed.host || '').trim(),
        port: Number(parsed.port || 0),
        username: String(parsed.username || ''),
        password: String(parsed.password || ''),
      }
    })
    .filter((p) => !!p.host && Number.isFinite(p.port) && p.port > 0)

  if (Array.isArray(payload.proxies) && payload.proxies.length > 0) {
    saveAppSettings({ proxies: normalizedProxyList })
  }

  const activeProxy = normalizedProxyList.find((p) => p.enabled) || normalizedProxyList[0] || {}
  let preservedRotateUrl = ''
  let preservedProxyHost = ''
  let preservedProxyPort = 0
  let preservedProxyUsername = ''
  let preservedProxyPassword = ''
  let preservedProxyListYaml = ''
  try {
    const prev = await fs.readFile(configPath, 'utf-8')
    const runtimeBlock = (prev.match(/proxy_runtime:\n([\s\S]*?)\n\nqueue:/m)?.[1] || '')
    const getRuntimeValue = (key: string) => {
      const m = runtimeBlock.match(new RegExp(`^\\s*${key}:\\s*["']?(.*?)["']?\\s*$`, 'm'))
      return m?.[1] ? String(m[1]).trim() : ''
    }
    preservedRotateUrl = normalizeUrlLike(getRuntimeValue('rotate_url'))
    preservedProxyHost = normalizeUrlLike(getRuntimeValue('host'))
    preservedProxyUsername = normalizeUrlLike(getRuntimeValue('username'))
    preservedProxyPassword = normalizeUrlLike(getRuntimeValue('password'))
    const parsedPort = Number(getRuntimeValue('port'))
    preservedProxyPort = Number.isFinite(parsedPort) ? parsedPort : 0
    const listMatch = runtimeBlock.match(/proxy_list:\n([\s\S]*?)\n\s*rotate_url:/m)
    if (listMatch && listMatch[1] && !listMatch[1].includes('[]')) {
      preservedProxyListYaml = listMatch[1].trimEnd()
    }
  } catch {
    // ignore
  }
  const flowMode = String(payload.flowMode || 'sandbox')
  const hasRotateUrlInPayload = Object.prototype.hasOwnProperty.call(payload || {}, 'rotateUrl')
  const rotateUrlSource = hasRotateUrlInPayload ? payload.rotateUrl : preservedRotateUrl
  const rotateUrl = normalizeUrlLike(String(rotateUrlSource ?? ''))
  const queueTimezone = String(payload.queueTimezone || loadAppSettings().queueTimezone || 'Asia/Ho_Chi_Minh')
  const queueCountry = String(payload.queueCountry || loadAppSettings().queueCountry || 'VN')
  const configuredQueueStartHour = Number.isFinite(Number(payload.queueStartHour))
    ? Number(payload.queueStartHour)
    : Number(loadAppSettings().queueStartHour ?? 18)
  const forceRunNow = Boolean(
    payload.forceRunNow ?? loadAppSettings().forceRunNow,
  )
  const queueStartHour = forceRunNow ? 0 : configuredQueueStartHour
  const targetUrl = flowMode === 'sandbox'
    ? 'http://ein-sandbox.test/applyein/legalStructure'
    : 'https://sa.www4.irs.gov/applyein/legalStructure'
  const parsedProxy = parseProxyEndpointInput({
    host: String(activeProxy.host || preservedProxyHost || '4gusa4.id.proxyxoay.net'),
    port: activeProxy.port || preservedProxyPort || 8178,
    username: String(activeProxy.username || preservedProxyUsername || ''),
    password: String(activeProxy.password || preservedProxyPassword || ''),
  })
  const proxyHost = String(parsedProxy.host || '4gusa4.id.proxyxoay.net')
  const proxyPort = Number(parsedProxy.port || 8178)
  const proxyUsername = String(parsedProxy.username || '')
  const proxyPassword = String(parsedProxy.password || '')

  const browserMode = String(payload.browserMode || 'silent').toLowerCase()
  const autoHeadless = browserMode !== 'browser'
  const rotateWaitSecondsRaw = Number.isFinite(Number(payload.globalRotateSecs))
    ? Number(payload.globalRotateSecs)
    : 5
  const rotateWaitSeconds = (() => {
    const normalized = Math.max(0, Math.floor(rotateWaitSecondsRaw))
    // Legacy UI default was 600s; migrate runtime rotate to 5s for continuous flow.
    if (rotateUrl && normalized === 600) return 5
    return normalized
  })()
  const configText = `app_flow_mode: ${toYamlScalar(flowMode)}
target_url: ${toYamlScalar(targetUrl)}

required_columns:
  - NAME
  - SSN
  - ADDRESS
  - CITI
  - BANG
  - ZIP
  - Phone

proxyxoay:
  base_url: "https://id.proxyxoay.net"
  tenant: "proxyxoay"
  timezone: "7"
  vm_type: "ROTATING_PROXY_4G"
  type_search: "NORMAL"
  auth:
    login_endpoint: "/api/v1/auth/login"
    username: ${toYamlScalar(payload.providerUsername || 'YOUR_PROXYXOAY_USERNAME')}
    password: ${toYamlScalar(payload.providerPassword || 'YOUR_PROXYXOAY_PASSWORD')}
    access_token: ${toYamlScalar(payload.bearerToken || '')}

proxy_runtime:
  host: ${toYamlScalar(proxyHost)}
  port: ${proxyPort}
  username: ${toYamlScalar(proxyUsername)}
  password: ${toYamlScalar(proxyPassword)}
  proxy_list:
${normalizedProxyList.length
  ? normalizedProxyList.map((p) => [
      `    - enabled: ${p.enabled ? 'true' : 'false'}`,
      `      host: ${toYamlScalar(p.host)}`,
      `      port: ${Number.isFinite(p.port) ? p.port : 8178}`,
      `      username: ${toYamlScalar(p.username)}`,
      `      password: ${toYamlScalar(p.password)}`,
    ].join('\n')).join('\n')
  : (preservedProxyListYaml ? preservedProxyListYaml : '    []')}
  rotate_url: ${toYamlScalar(rotateUrl)}
  change_ip_wait_seconds: ${Number.isFinite(rotateWaitSeconds) ? rotateWaitSeconds : 10}
  healthcheck_url: "http://api.ipify.org?format=json"
  skip_healthcheck: true

queue:
  queue_high: "ein.high"
  queue_default: "ein.default"
  queue_retry: "ein.retry"
  queue_manual: "ein.manual"
  queue_observe: "ein.observe"
  queue_timezone: ${toYamlScalar(queueTimezone)}
  queue_country: ${toYamlScalar(queueCountry)}
  queue_start_hour: ${Number.isFinite(queueStartHour) ? queueStartHour : 18}
  watch_poll_seconds: 7
  file_stable_seconds: 3

retry:
  max_retries_per_record: 2
  base_backoff_seconds: 5
  max_attempt_seconds: 240

submit_guard:
  two_step_confirm: false
  require_tty: false

capture:
  checkpoints:
    - loaded
    - filled
    - review
    - submitted

output:
  artifacts_dir: ${toYamlScalar(artifactsDir)}
  state_dir: ${toYamlScalar(stateDir)}
  output_csv: ${toYamlScalar(outputCsv)}
  keep_debug_artifacts: false

browser:
  headless: ${toYamlScalar(autoHeadless)}
  force_background_headless: ${toYamlScalar(autoHeadless)}
  timeout_ms: 30000
  step_delay_ms: 180
  step_delay_jitter_ms: 120
  observe_mode_active: false
  observe_step_delay_multiplier: 2.5
  observe_extra_delay_ms: 350
  observe_min_delay_ms: 1400
  observe_min_jitter_ms: 450
  observe_disable_ready_speedup: true
  observe_type_char_delay_ms: 140
  observe_field_pause_ms: 800
  manual_window_width: 1600
  manual_window_height: 960
  manual_autosave_seconds: 1.0
  block_keywords:
    - "captcha"
    - "verify you are human"
    - "blocked"

selectors:
  legal_structure: "input[name='legalStructureInput']"
  next_button: "button[data-testid='btn-continue']"
  submit_button: "button[aria-label='Submit EIN Request']"
  confirmation_number: "body"

workflow: []
`
  await fs.writeFile(configPath, configText, 'utf-8')
}

async function ensureRuntimeConfig() {
  const path = runtimeConfigPath()
  try {
    let flowMode = 'full'
    let browserMode = 'silent'
    try {
      const prev = await fs.readFile(path, 'utf-8')
      const savedFlow = normalizeUrlLike(String(prev.match(/^\s*app_flow_mode:\s*["']?(.*?)["']?\s*$/m)?.[1] || ''))
      if (savedFlow) flowMode = savedFlow
      const target = normalizeUrlLike(String(prev.match(/^\s*target_url:\s*["']?(.*?)["']?\s*$/m)?.[1] || ''))
      if (!savedFlow && target.toLowerCase().includes('ein-sandbox.test')) flowMode = 'sandbox'
      const headlessRaw = String(prev.match(/^\s*headless:\s*(true|false)\s*$/m)?.[1] || '').toLowerCase()
      if (headlessRaw === 'false') browserMode = 'browser'
    } catch {
      // use defaults
    }
    await writeRuntimeConfig({
      flowMode,
      browserMode,
    })
    return { flowMode, browserMode }
  } catch {
    await writeRuntimeConfig({
      flowMode: 'full',
      proxies: [],
      globalRotateSecs: 5,
      bearerToken: '',
      providerUsername: '',
      providerPassword: '',
      browserMode: 'silent',
    })
    return { flowMode: 'full', browserMode: 'silent' }
  }
}

async function readSampleCsv(): Promise<{ name: string; path: string; content: string } | null> {
  const candidates = [
    join(foxAutoRootPath(), 'outputs', 'sandbox_100_records.csv'),
    join(storageRootDir(), 'outputs', 'sandbox_100_records.csv'),
    join(userDataDir(), 'outputs', 'sandbox_100_records.csv')
  ]
  for (const path of candidates) {
    try {
      await fs.access(path)
      const content = await fs.readFile(path, 'utf-8')
      return { name: 'sandbox_100_records.csv', path, content }
    } catch {
      // try next
    }
  }
  return null
}

function createWindow(): BrowserWindow {
  const state = loadWindowState()
  const mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.on('resize', () => saveWindowState(mainWindow))
  let isClosingWindow = false
  mainWindow.on('close', async (e) => {
    saveWindowState(mainWindow)
    if (isClosingWindow) return
    if (pythonProcess && pythonProcess.exitCode === null) {
      e.preventDefault()
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['Đợi hoàn thành rồi đóng', 'Đóng ngay lập tức', 'Hủy (ở lại app)'],
        defaultId: 0,
        cancelId: 2,
        title: 'Xác nhận đóng ứng dụng',
        message: 'Đang có hồ sơ IRS được xử lý!',
        detail: 'Nếu đóng ngay lập tức, các hồ sơ đang xử lý dở sẽ bị hủy. Bạn có muốn đợi các luồng hoàn thành hồ sơ hiện tại rồi đóng an toàn không?'
      })
      if (response === 0) {
        isClosingWindow = true
        mainWindow.webContents.send('py:worker_stopping', { graceful: true })
        await safeStopPythonBackend()
        mainWindow.destroy()
      } else if (response === 1) {
        isClosingWindow = true
        await forceStopPythonBackend()
        mainWindow.destroy()
      }
    }
  })
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.foxauto.irsbot')
  await ensureRuntimeConfig()

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(icon)
  }

  app.on('browser-window-created', (_event, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('ping', () => console.log('pong'))
  ipcMain.handle('app:version', async () => ({ ok: true, version: app.getVersion() }))
  ipcMain.handle('app:update:get-state', async () => ({ ok: true, ...updateState }))
  ipcMain.handle('app:update:check', async () => {
    if (!app.isPackaged) {
      setUpdateState({
        status: 'disabled',
        message: 'Updates disabled in dev mode',
        checkedAt: new Date().toISOString(),
      })
      return { ok: false, error: 'Updates are disabled in development mode' }
    }
    try {
      await autoUpdater.checkForUpdates()
      return { ok: true }
    } catch (err) {
      const error = String(err)
      if (error.includes('404')) {
        setUpdateState({
          status: 'not-available',
          message: 'Chưa có bản phát hành mới trên GitHub (App đang là bản mới nhất)',
          checkedAt: new Date().toISOString(),
          error: undefined,
        })
        return { ok: true, message: 'Chưa có bản phát hành mới trên GitHub (App đang là bản mới nhất)' }
      }
      setUpdateState({ status: 'error', message: `Update check failed: ${error}`, error })
      return { ok: false, error }
    }
  })
  ipcMain.handle('app:update:download', async () => {
    if (!app.isPackaged) {
      return { ok: false, error: 'Updates are disabled in development mode' }
    }
    try {
      await autoUpdater.downloadUpdate()
      return { ok: true }
    } catch (err) {
      const error = String(err)
      setUpdateState({ status: 'error', message: `Update download failed: ${error}`, error })
      return { ok: false, error }
    }
  })
  ipcMain.handle('app:update:install', async () => {
    if (!app.isPackaged) return { ok: false, error: 'Updates are disabled in development mode' }
    if (pythonProcess && pythonProcess.exitCode === null) {
      return { ok: false, error: 'Worker is running. Stop worker before installing update.' }
    }
    if (updateState.status !== 'downloaded') {
      return { ok: false, error: 'No downloaded update available' }
    }
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 120)
    return { ok: true }
  })
  ipcMain.handle('irs:worker:status', async () => ({ ok: true, running: !!pythonProcess && pythonProcess.exitCode === null }))
  ipcMain.handle('irs:worker:start', async () => {
    try {
      await startPythonBackend()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
  ipcMain.handle('irs:worker:stop', async (_event, payload) => {
    const force = Boolean(payload?.force)
    try {
      if (force) {
        await forceStopPythonBackend()
      } else {
        await safeStopPythonBackend()
      }
      return { ok: true, forced: force }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
  ipcMain.handle('irs:apply-runtime-config', async (_event, payload) => {
    try {
      await writeRuntimeConfig(payload || {})
      // Only hot-reload when worker is already running. This avoids
      // needless stop/start loops while the app is idle.
      if (pythonProcess && pythonProcess.exitCode === null) {
        await stopPythonBackend()
        await startPythonBackend()
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
  ipcMain.handle('irs:import:rows', async (_event, payload) => {
    try {
      const batchId = String(payload?.batchId || `batch_${Date.now()}`)
      const sourceFileName = String(payload?.sourceFileName || 'ui_import.csv')
      const queueName = String(payload?.queueName || 'ein.default')
      const rows = Array.isArray(payload?.rows) ? payload.rows : []
      if (!rows.length) return { ok: false, error: 'No rows' }

      const keys = Array.from(new Set(rows.flatMap((r: Record<string, unknown>) => Object.keys(r || {})))) as string[]
      const safeKeys: string[] = keys.length ? keys : ['NAME', 'SSN', 'DOB', 'GENDER', 'ADDRESS', 'CITI', 'BANG', 'ZIP', 'Phone', 'country', 'county']
      const csvEscape = (v: unknown) => {
        const s = String(v ?? '')
        if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
        return s
      }
      const lines = [
        safeKeys.join(','),
        ...rows.map((r: any) => safeKeys.map((k) => csvEscape(r?.[k])).join(',')),
      ]
      const base = storageRootDir()
      const inputDir = join(base, 'state', 'ui_inbox')
      const archiveDir = join(base, 'state', 'ui_archive')
      const errorDir = join(base, 'state', 'ui_error')
      await fs.mkdir(inputDir, { recursive: true })
      await fs.mkdir(archiveDir, { recursive: true })
      await fs.mkdir(errorDir, { recursive: true })
      const sourceStem = sourceFileName
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-z0-9_.-]+/gi, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '') || 'ui_import'
      // Always materialize UI payload rows as CSV in inbox.
      const inputPath = join(inputDir, `${batchId}_${sourceStem}.csv`)
      await fs.writeFile(inputPath, lines.join('\n'), 'utf-8')

      const result = await runPythonCli(['import-excel', inputPath, '--archive', archiveDir, '--error', errorDir, '--queue', queueName])
      if (result.code !== 0) {
        return { ok: false, error: result.stderr || result.stdout || `exit ${result.code}` }
      }
      let parsed: any = {}
      try {
        parsed = JSON.parse(result.stdout || '{}')
      } catch {
        parsed = {}
      }
      const enqueued = Number(parsed?.enqueued ?? (Array.isArray(parsed?.job_ids) ? parsed.job_ids.length : 0))
      return {
        ok: true,
        stdout: result.stdout,
        batchId: String(parsed?.batch_id || batchId),
        enqueued,
      }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
  ipcMain.handle('irs:proxy:test-rotate', async (_event, payload) => {
    try {
      await writeRuntimeConfig(payload || {})
      const result = await runPythonCli(['proxy', 'rotate-auto'])
      if (result.code !== 0) {
        return { ok: false, error: result.stderr || result.stdout || `exit ${result.code}` }
      }
      let message = 'Rotate OK'
      try {
        const parsed = JSON.parse(result.stdout || '{}')
        if (parsed && parsed.cooldown) {
          const wait = Number(parsed.wait_seconds || 0)
          return {
            ok: false,
            cooldown: true,
            waitSeconds: wait,
            error: parsed.message || (wait > 0 ? `Vui lòng chờ ${wait}s` : 'Proxy rotate cooldown'),
          }
        }
        const code = parsed?.proxy_code || ''
        const newIp = parsed?.response?.data?.[0]?.newIp || ''
        message = [code, newIp].filter(Boolean).join(' -> ') || 'Rotate OK'
      } catch {
        // ignore parse errors, keep generic message
      }
      return { ok: true, stdout: result.stdout, message }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
  ipcMain.handle('irs:sample-csv:get', async () => {
    try {
      const sample = await readSampleCsv()
      if (!sample) return { ok: false, error: 'Sample CSV not found' }
      return { ok: true, ...sample }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
  function getQueueDbPath(): string {
    const candidates = [
      join(storageRootDir(), 'state', 'queue.db'),
      join(foxAutoRootPath(), 'state', 'queue.db'),
      join(userDataDir(), 'state', 'queue.db'),
    ]
    for (const c of candidates) {
      if (existsSync(c)) return c
    }
    return candidates[0]
  }

  ipcMain.handle('irs:queue:list', async () => {
    try {
      const dbPath = getQueueDbPath()
      if (existsSync(dbPath)) {
        const BetterSqlite3 = (await import('better-sqlite3')).default
        const db = new BetterSqlite3(dbPath, { readonly: true, timeout: 2000 })
        try {
          const stmt = db.prepare('SELECT job_id, queue_name, status, payload, created_at, updated_at FROM jobs ORDER BY created_at ASC')
          const rawRows = stmt.all() as Array<{ job_id: string; queue_name: string; status: string; payload: string; created_at: number; updated_at: number }>
          const rows = rawRows.map((r) => {
            let parsedPayload: any = {}
            try {
              parsedPayload = JSON.parse(r.payload || '{}')
            } catch {}
            return {
              job_id: r.job_id,
              queue_name: r.queue_name,
              status: r.status,
              payload: parsedPayload,
              created_at: Number(r.created_at || 0),
              updated_at: Number(r.updated_at || 0),
            }
          })
          return { ok: true, rows }
        } finally {
          db.close()
        }
      }
      const result = await runPythonCli(['queue', 'list'])
      if (result.code !== 0) {
        return { ok: false, error: result.stderr || result.stdout || `exit ${result.code}` }
      }
      const parsed = JSON.parse(result.stdout || '{}')
      return { ok: true, rows: Array.isArray(parsed?.rows) ? parsed.rows : [] }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
  ipcMain.handle('irs:results:load', async () => {
    try {
      const userDir = storageRootDir()
      const resultsPath = join(userDir, 'outputs', 'results.csv')
      if (!existsSync(resultsPath)) return { ok: true, rows: [], hiddenKeys: [] }
      const raw = await fs.readFile(resultsPath, 'utf-8')
      const wb = XLSX.read(raw, { type: 'string' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

      const drivePushState = await loadGoogleDriveAutoPushState(userDir)
      const driveMap = drivePushState.pdf_url_by_batch_record || {}
      const hiddenKeys = await loadHiddenResultsKeys(userDir)

      const enrichedRows = rows.map((r: any) => {
        const bid = String(r.batch_id || '').trim()
        const rid = String(r.record_id || '').trim()
        const k1 = `${bid}::${rid}`
        const k2 = `${bid}:${rid}`
        const k3 = rid
        const driveUrl = driveMap[k1] || driveMap[k2] || driveMap[k3] || ''
        const isUploaded = Boolean(driveUrl)
        const isHidden = hiddenKeys.has(k2) || hiddenKeys.has(k1) || (rid ? hiddenKeys.has(rid) : false)
        return {
          ...r,
          uploaded_to_drive: isUploaded,
          drive_pdf_url: driveUrl || undefined,
          is_hidden: isHidden,
        }
      })

      return { ok: true, rows: enrichedRows, hiddenKeys: Array.from(hiddenKeys) }
    } catch (err) {
      return { ok: false, error: String(err), rows: [], hiddenKeys: [] }
    }
  })
  ipcMain.handle('irs:results:hide', async (_event, payload) => {
    try {
      const userDir = storageRootDir()
      const keys = Array.isArray(payload?.keys) ? payload.keys.map((k: any) => String(k || '').trim()).filter(Boolean) : []
      if (!keys.length) return { ok: true, count: 0, hiddenKeys: [] }
      const current = await loadHiddenResultsKeys(userDir)
      for (const k of keys) current.add(k)
      await saveHiddenResultsKeys(userDir, current)
      return { ok: true, count: current.size, hiddenKeys: Array.from(current) }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
  ipcMain.handle('irs:results:unhide', async (_event, payload) => {
    try {
      const userDir = storageRootDir()
      const all = Boolean(payload?.all)
      if (all) {
        await saveHiddenResultsKeys(userDir, new Set())
        return { ok: true, count: 0, hiddenKeys: [] }
      }
      const keys = Array.isArray(payload?.keys) ? payload.keys.map((k: any) => String(k || '').trim()).filter(Boolean) : []
      const current = await loadHiddenResultsKeys(userDir)
      for (const k of keys) current.delete(k)
      await saveHiddenResultsKeys(userDir, current)
      return { ok: true, count: current.size, hiddenKeys: Array.from(current) }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
  ipcMain.handle('irs:queue:remove', async (_event, payload) => {
    try {
      const ids = Array.isArray(payload?.ids) ? payload.ids.map((x: any) => String(x).trim()).filter(Boolean) : []
      if (!ids.length) return { ok: true, deleted: 0 }
      const dbPath = getQueueDbPath()
      if (existsSync(dbPath)) {
        const BetterSqlite3 = (await import('better-sqlite3')).default
        const db = new BetterSqlite3(dbPath, { timeout: 3000 })
        try {
          let deleted = 0
          for (let i = 0; i < ids.length; i += 80) {
            const chunk = ids.slice(i, i + 80)
            const placeholders = chunk.map(() => '?').join(',')
            const info = db.prepare(`DELETE FROM jobs WHERE job_id IN (${placeholders})`).run(...chunk)
            deleted += info.changes
          }
          return { ok: true, deleted }
        } finally {
          db.close()
        }
      }
      let deleted = 0
      for (let i = 0; i < ids.length; i += 80) {
        const chunk = ids.slice(i, i + 80)
        const result = await runPythonCli(['queue', 'remove', '--ids', chunk.join(',')])
        if (result.code !== 0) {
          return { ok: false, error: result.stderr || result.stdout || `exit ${result.code}` }
        }
        const parsed = JSON.parse(result.stdout || '{}')
        deleted += Number(parsed?.deleted || 0)
      }
      return { ok: true, deleted }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
  ipcMain.handle('irs:queue:requeue', async (_event, payload) => {
    try {
      const ids = Array.isArray(payload?.ids) ? payload.ids.map((x: any) => String(x).trim()).filter(Boolean) : []
      if (!ids.length) return { ok: true, requeued: 0 }
      const dbPath = getQueueDbPath()
      if (existsSync(dbPath)) {
        const BetterSqlite3 = (await import('better-sqlite3')).default
        const db = new BetterSqlite3(dbPath, { timeout: 3000 })
        try {
          let requeued = 0
          const now = Date.now() / 1000
          for (let i = 0; i < ids.length; i += 80) {
            const chunk = ids.slice(i, i + 80)
            const placeholders = chunk.map(() => '?').join(',')
            const info = db.prepare(`UPDATE jobs SET status = 'pending', updated_at = ? WHERE job_id IN (${placeholders})`).run(now, ...chunk)
            requeued += info.changes
          }
          return { ok: true, requeued }
        } finally {
          db.close()
        }
      }
      let requeued = 0
      for (let i = 0; i < ids.length; i += 80) {
        const chunk = ids.slice(i, i + 80)
        const result = await runPythonCli(['queue', 'requeue', '--ids', chunk.join(',')])
        if (result.code !== 0) {
          return { ok: false, error: result.stderr || result.stdout || `exit ${result.code}` }
        }
        const parsed = JSON.parse(result.stdout || '{}')
        requeued += Number(parsed?.requeued || 0)
      }
      return { ok: true, requeued }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
  ipcMain.handle('irs:report:export-annotated', async (_event, payload) => {
    try {
      const batchId = String(payload?.batchId || '').trim()
      if (!batchId) return { ok: false, error: 'Missing batchId' }
      const format = String(payload?.format || 'xlsx').toLowerCase() === 'csv' ? 'csv' : 'xlsx'
      const reportType = String(payload?.type || 'report').toLowerCase() === 'failures' ? 'failures' : 'report'
      const result = await runPythonCli(['queue', 'export-annotated', '--batch-id', batchId, '--format', format, '--type', reportType])
      if (result.code !== 0) {
        return { ok: false, error: result.stderr || result.stdout || `exit ${result.code}` }
      }
      const parsed = JSON.parse(result.stdout || '{}')
      return { ok: true, ...parsed }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
  ipcMain.handle('irs:report:export-debug-pack', async (_event, payload) => {
    try {
      const batchId = String(payload?.batchId || '').trim()
      if (!batchId) return { ok: false, error: 'Missing batchId' }
      const result = await runPythonCli(['queue', 'export-debug-pack', '--batch-id', batchId])
      if (result.code !== 0) {
        return { ok: false, error: result.stderr || result.stdout || `exit ${result.code}` }
      }
      const parsed = JSON.parse(result.stdout || '{}')
      return { ok: true, ...parsed }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
  ipcMain.handle('irs:report:export-selected', async (_event, payload) => {
    try {
      const sourceRows = Array.isArray(payload?.rows) ? payload.rows : []
      if (!sourceRows.length) return { ok: false, error: 'No selected rows' }
      const format = String(payload?.format || 'xlsx').toLowerCase() === 'csv' ? 'csv' : 'xlsx'
      const reportType = String(payload?.type || 'report').toLowerCase() === 'failures' ? 'failures' : 'report'
      const nextOnly = Boolean(payload?.nextOnly)
      const batchId = String(payload?.batchId || '').trim()
      const batchToken = (batchId || 'mixed').replace(/[^a-z0-9_-]+/gi, '_')
      const filteredRows = reportType === 'failures'
        ? sourceRows.filter((row: any) => String(row?.status || '').toLowerCase() === 'failed')
        : sourceRows.filter((row: any) => String(row?.confirmation_number || row?.step6_ein || '').trim())
      if (!filteredRows.length) {
        return { ok: false, error: reportType === 'failures' ? 'No failed rows in selection' : 'No rows after filter' }
      }

      const compactReport = reportType === 'report'
      const legacyCompact = nextOnly && compactReport
      const reportDedupeToken = legacyCompact ? 'legacy_report:F' : `report_selected:${reportType}:${batchToken}`
      let rowsForKey = filteredRows
      let skippedDuplicates = 0
      let part = 0
      const base = storageRootDir()
      let continuationState: ExportContinuationState | null = null
      if (nextOnly) {
        continuationState = await loadExportContinuationState(base)
        const tokenExported = ensureTokenExportMap(continuationState, reportDedupeToken)
        const seen = new Set<string>()
        const dedupedRows: any[] = []
        for (const row of rowsForKey) {
          const key = makeExportRowKey(row)
          if (!key) {
            dedupedRows.push(row)
            continue
          }
          if (tokenExported[key] || seen.has(key)) {
            skippedDuplicates += 1
            continue
          }
          seen.add(key)
          dedupedRows.push(row)
        }
        rowsForKey = dedupedRows
        if (!rowsForKey.length) {
          return { ok: false, error: 'No new rows after removing duplicates (already exported)' }
        }
        if (legacyCompact) {
          let lastPart = Number(continuationState.part_by_token[reportDedupeToken] || 0)
          if (!Number.isFinite(lastPart) || lastPart <= 0) {
            lastPart = await detectMaxLegacyFPart(base)
          }
          part = lastPart + 1
          continuationState.part_by_token[reportDedupeToken] = part
        } else {
          part = nextPartNumber(continuationState, reportDedupeToken)
          continuationState.part_by_token[reportDedupeToken] = part
        }
      }

      if (compactReport) {
        const enrichedRows = await enrichSelectedReportRows(base, rowsForKey)
        rowsForKey = legacyCompact ? buildLegacyCompactReportRows(enrichedRows) : buildSelectedReportRows(enrichedRows)
      }

      const headers = compactReport
        ? [
          'NAME',
          'SSN',
          'ADDRESS',
          'CITI',
          'BANG',
          'ZIP',
          'BOD',
          'GENDER',
          'EIN',
          'NAME LLC',
          'ADDRESS LLC',
          'CITI LLC',
          'BANG LLC',
          'ZIP LLC',
          'PDF',
          'FOLDER_URL',
        ]
        : [
          'record_id',
          'name',
          'status',
          'confirmation_number',
          'step6_ein',
          'step6_legal_name',
          'step6_county',
          'step6_state',
          'step6_start_date',
          'step6_principal_activity',
          'step6_principal_product_service',
          'step6_reason_for_applying',
          'error_code',
          'error_message',
          'last_step',
          'proxy_used',
          'proxy_ip',
          'duration_s',
          'completed_at',
          'pdf_file',
          'artifact_folder',
          'source',
          'batch_id',
        ]
      const sheetRows = compactReport
        ? rowsForKey.map((row) => ({
          NAME: row.NAME,
          SSN: row.SSN,
          ADDRESS: row.ADDRESS,
          CITI: row.CITI,
          BANG: row.BANG,
          ZIP: row.ZIP,
          BOD: row.BOD,
          GENDER: row.GENDER,
          EIN: row.EIN,
          'NAME LLC': row['NAME LLC'],
          'ADDRESS LLC': row['ADDRESS LLC'],
          'CITI LLC': row['CITI LLC'],
          'BANG LLC': row['BANG LLC'],
          'ZIP LLC': row['ZIP LLC'],
          PDF: row.PDF,
          FOLDER_URL: row.FOLDER_URL,
        }))
        : rowsForKey
      const ws = XLSX.utils.json_to_sheet(sheetRows, { header: headers })
      if (compactReport) {
        applyReportSheetLayout(ws, headers, sheetRows as Array<Record<string, unknown>>)
      }
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'report')

      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const outDir = join(base, 'outputs', 'reports')
      await fs.mkdir(outDir, { recursive: true })
      const fileBase = legacyCompact
        ? `${hcmDateLabel()}-F${part}`
        : buildSelectedExportBaseName({
          reportType,
          batchId: batchToken,
          rowCount: rowsForKey.length,
          nextOnly,
          part,
          ts,
        })
      const xlsxPath = join(outDir, `${fileBase}.xlsx`)
      const csvPath = join(outDir, `${fileBase}.csv`)
      const writeBothFormats = legacyCompact || compactReport
      let driveBatch: Awaited<ReturnType<typeof googleDriveResolveBatchContainer>> | null = null
      if (compactReport) {
        const driveConfig = resolveGoogleDriveConfig()
        if (driveConfig) {
          const driveToken = await fetchGoogleDriveAccessToken(driveConfig)
          driveBatch = await googleDriveResolveBatchContainer(driveToken, batchToken)
        }
      }

      if (format === 'csv') {
        const csv = XLSX.utils.sheet_to_csv(ws)
        await fs.writeFile(csvPath, csv, 'utf-8')
        if (writeBothFormats) {
          XLSX.writeFile(wb, xlsxPath)
        }
        if (nextOnly && continuationState) {
          const tokenExported = ensureTokenExportMap(continuationState, reportDedupeToken)
          for (const row of rowsForKey) {
            const key = makeExportRowKey(row)
            if (!key) continue
            tokenExported[key] = true
          }
          await saveExportContinuationState(base, continuationState)
        }
        let googleDrive: Record<string, string> | undefined
        if (compactReport) {
          try {
            const driveConfig = resolveGoogleDriveConfig()
            if (driveConfig) {
              googleDrive = {}
              await withGoogleDriveLock(`batch-upload:${batchToken}`, async () => {
                const token = await fetchGoogleDriveAccessToken(driveConfig)
                const reportFolderId = driveBatch?.batchRootId || (await googleDriveResolveBatchContainer(token, batchToken)).batchRootId
                if (writeBothFormats) {
                  const archiveXlsxId = await googleDriveUploadFile({
                    token,
                    folderId: reportFolderId,
                    localPath: xlsxPath,
                    remoteName: basename(xlsxPath),
                    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                  })
                  await googleDriveMakePublic(token, archiveXlsxId)
                  const latestXlsxId = await googleDriveUploadFile({
                    token,
                    folderId: reportFolderId,
                    localPath: xlsxPath,
                    remoteName: 'manual_report_latest.xlsx',
                    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    replaceExisting: true,
                  })
                  await googleDriveMakePublic(token, latestXlsxId)
                  googleDrive!.xlsx_archive_url = googleDriveViewUrl(archiveXlsxId)
                  googleDrive!.xlsx_latest_url = googleDriveViewUrl(latestXlsxId)
                }
              })
            }
          } catch (err) {
            console.warn(`Google Drive report upload skipped: ${String(err)}`)
          }
        }
        return {
          ok: true,
          rows: rowsForKey.length,
          report_type: reportType,
          format: 'csv',
          csv_path: csvPath,
          xlsx_path: writeBothFormats ? xlsxPath : undefined,
          preferred_path: writeBothFormats ? xlsxPath : csvPath,
          skipped_duplicates: skippedDuplicates,
          part,
          next_only: nextOnly,
          google_drive: googleDrive,
        }
      }

      XLSX.writeFile(wb, xlsxPath)
      if (writeBothFormats) {
        const csv = XLSX.utils.sheet_to_csv(ws)
        await fs.writeFile(csvPath, csv, 'utf-8')
      }
      if (nextOnly && continuationState) {
        const tokenExported = ensureTokenExportMap(continuationState, reportDedupeToken)
        for (const row of rowsForKey) {
          const key = makeExportRowKey(row)
          if (!key) continue
          tokenExported[key] = true
        }
        await saveExportContinuationState(base, continuationState)
      }
      let googleDrive: Record<string, string> | undefined
      if (compactReport) {
        try {
          const driveConfig = resolveGoogleDriveConfig()
          if (driveConfig) {
            await withGoogleDriveLock(`batch-upload:${batchToken}`, async () => {
              const token = await fetchGoogleDriveAccessToken(driveConfig)
              const reportFolderId = driveBatch?.batchRootId || (await googleDriveResolveBatchContainer(token, batchToken)).batchRootId
              const archiveXlsxId = await googleDriveUploadFile({
                token,
                folderId: reportFolderId,
                localPath: xlsxPath,
                remoteName: basename(xlsxPath),
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              })
              await googleDriveMakePublic(token, archiveXlsxId)
              const latestXlsxId = await googleDriveUploadFile({
                token,
                folderId: reportFolderId,
                localPath: xlsxPath,
                remoteName: 'manual_report_latest.xlsx',
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                replaceExisting: true,
              })
              await googleDriveMakePublic(token, latestXlsxId)
              googleDrive = {
                xlsx_archive_url: googleDriveViewUrl(archiveXlsxId),
                xlsx_latest_url: googleDriveViewUrl(latestXlsxId),
              }
            })
          }
        } catch (err) {
          console.warn(`Google Drive report upload skipped: ${String(err)}`)
        }
      }
      return {
        ok: true,
        rows: rowsForKey.length,
        report_type: reportType,
        format: 'xlsx',
        xlsx_path: xlsxPath,
        csv_path: writeBothFormats ? csvPath : undefined,
        preferred_path: xlsxPath,
        skipped_duplicates: skippedDuplicates,
        part,
        next_only: nextOnly,
        google_drive: googleDrive,
      }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
  ipcMain.handle('irs:bundle:upload-next', async (_event, payload) => {
    try {
      const sourceRows = Array.isArray(payload?.rows) ? payload.rows : []
      if (!sourceRows.length) return { ok: false, error: 'No selected rows' }
      const filteredRows = sourceRows.filter((row: any) => String(row?.confirmation_number || row?.step6_ein || '').trim())
      if (!filteredRows.length) return { ok: false, error: 'No confirmed rows after filter' }
      const base = storageRootDir()
      const nextOnly = Boolean(payload?.nextOnly ?? true)
      const uniqueBatches = Array.from(new Set(filteredRows.map((row: any) => String(row?.batch_id || '').trim()).filter(Boolean)))
      const batchToken = String(uniqueBatches.length === 1 ? uniqueBatches[0] : 'mixed')
      const uploadToken = `bundle_upload:${batchToken}`
      let rowsToUpload = filteredRows
      let skippedDuplicates = 0
      let part = 1
      let continuationState: ExportContinuationState | null = null
      if (nextOnly) {
        continuationState = await loadExportContinuationState(base)
        const tokenExported = ensureTokenExportMap(continuationState, uploadToken)
        const seen = new Set<string>()
        const dedupedRows: any[] = []
        for (const row of filteredRows) {
          const key = makeExportRowKey(row)
          if (!key) {
            dedupedRows.push(row)
            continue
          }
          if (tokenExported[key] || seen.has(key)) {
            skippedDuplicates += 1
            continue
          }
          seen.add(key)
          dedupedRows.push(row)
        }
        rowsToUpload = dedupedRows
        if (!rowsToUpload.length) return { ok: false, error: 'No new rows after removing duplicates (already uploaded)' }
        part = nextPartNumber(continuationState, uploadToken)
        continuationState.part_by_token[uploadToken] = part
      }

      const folderName = buildUploadBundleName(rowsToUpload.length)
      const bundle = await withGoogleDriveLock(`bundle-upload:${folderName}`, async () => {
        return await buildAndUploadDriveBundle({
          baseDir: base,
          rows: rowsToUpload,
          batchId: batchToken,
          folderName,
          onProgress: (progress) => {
            sendToAllWindows('bundle-upload-progress', {
              running: true,
              percent: progress.percent,
              message: progress.message,
              current: progress.current,
              total: progress.total,
              folderName,
              rows: rowsToUpload.length,
            })
          },
        })
      })

      await updateBundleMasterIndexes(base, {
        bundle_name: folderName,
        date: hcmDateLabel(),
        rows: bundle.rows,
        batch_id: batchToken,
        local_folder: bundle.localFolder,
        local_report_path: bundle.localReportPath,
        drive_folder_url: bundle.driveFolderUrl,
        drive_report_url: bundle.driveReportUrl,
        created_at: new Date().toISOString(),
      })

      try {
        const drivePushState = await loadGoogleDriveAutoPushState(base)
        for (const row of rowsToUpload) {
          const k1 = makeBatchRecordKey(row?.batch_id, row?.record_id)
          const k2 = `${row?.batch_id || ''}:${row?.record_id || ''}`
          const k3 = String(row?.record_id || '').trim()
          const pdfUrl = String(row?.drive_pdf_url || bundle.driveFolderUrl || '')
          if (k1) drivePushState.pdf_url_by_batch_record[k1] = pdfUrl
          if (k2) drivePushState.pdf_url_by_batch_record[k2] = pdfUrl
          if (k3) drivePushState.pdf_url_by_batch_record[k3] = pdfUrl
        }
        await saveGoogleDriveAutoPushState(base, drivePushState)
      } catch {}

      if (nextOnly && continuationState) {
        const tokenExported = ensureTokenExportMap(continuationState, uploadToken)
        for (const row of rowsToUpload) {
          const key = makeExportRowKey(row)
          if (!key) continue
          tokenExported[key] = true
        }
        await saveExportContinuationState(base, continuationState)
      }

      sendToAllWindows('bundle-upload-progress', {
        running: false,
        percent: 100,
        message: 'Completed',
        current: rowsToUpload.length,
        total: rowsToUpload.length,
        folderName,
        rows: rowsToUpload.length,
      })

      return {
        ok: true,
        rows: bundle.rows,
        part,
        skipped_duplicates: skippedDuplicates,
        folder: bundle.localFolder,
        preferred_path: bundle.localReportPath,
        local_report_path: bundle.localReportPath,
        google_drive: {
          folder_url: bundle.driveFolderUrl,
          report_url: bundle.driveReportUrl,
        },
      }
    } catch (err) {
      sendToAllWindows('bundle-upload-progress', {
        running: false,
        percent: 0,
        message: String(err),
        current: 0,
        total: 0,
        error: true,
      })
      return { ok: false, error: String(err) }
    }
  })
  ipcMain.handle('irs:pdf:collect', async (_event, payload) => {
    try {
      const rows = Array.isArray(payload?.rows) ? payload.rows : []
      if (!rows.length) return { ok: false, error: 'No rows' }
      const scope = String(payload?.scope || 'selected')
      const batchId = String(payload?.batchId || '').trim()
      const batchToken = (batchId || 'mixed').replace(/[^a-z0-9_-]+/gi, '_')
      const nextOnly = Boolean(payload?.nextOnly)
      const pdfDedupeToken = `pdf_collect:${scope}:${batchToken}`
      const base = storageRootDir()
      let part = 0
      let skippedDuplicates = 0
      let rowsToCopy = rows
      let sequence = 0
      let continuationState: ExportContinuationState | null = null
      if (nextOnly) {
        continuationState = await loadExportContinuationState(base)
        const tokenExported = ensureTokenExportMap(continuationState, pdfDedupeToken)
        const seen = new Set<string>()
        const dedupedRows: any[] = []
        for (const row of rows) {
          const key = makeExportRowKey(row)
          if (!key) {
            dedupedRows.push(row)
            continue
          }
          if (tokenExported[key] || seen.has(key)) {
            skippedDuplicates += 1
            continue
          }
          seen.add(key)
          dedupedRows.push(row)
        }
        rowsToCopy = dedupedRows
        if (!rowsToCopy.length) {
          return { ok: false, error: 'No new rows after removing duplicates (already exported)' }
        }
        part = nextPartNumber(continuationState, pdfDedupeToken)
        continuationState.part_by_token[pdfDedupeToken] = part

        const seqToken = `pdf_seq:${scope}:${batchToken}`
        const stateSeq = Number(continuationState.last_seq_by_token?.[seqToken] || 0)
        if (Number.isFinite(stateSeq) && stateSeq > 0) {
          sequence = stateSeq
        } else {
          sequence = await detectMaxPdfSequence(base, batchToken, scope)
        }
      }

      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const outDirName = `${batchToken}_${scope}_${ts}`
      const outDir = join(base, 'outputs', 'pdf_exports', outDirName)
      await fs.mkdir(outDir, { recursive: true })

      let copied = 0
      const missing: string[] = []
      const copiedKeys: string[] = []
      for (let i = 0; i < rowsToCopy.length; i++) {
        const r = rowsToCopy[i] || {}
        const src = String(r.final_pdf_path || r.pdf_path || '').trim()
        const rid = String(r.record_id || `row-${i + 1}`).trim()
        if (!src) {
          missing.push(rid)
          continue
        }
        try {
          await fs.access(src)
        } catch {
          missing.push(rid)
          continue
        }
        const ext = extname(src) || '.pdf'
        const seqForFile = sequence + 1
        let fileName = buildPrettyPdfFileName(r, seqForFile, ext)
        let target = join(outDir, fileName)
        let dup = 2
        while (existsSync(target)) {
          const fallbackId = String(r.confirmation_number || r.step6_ein || r.ein || rid || '').trim()
          fileName = buildPrettyPdfFileName({ ...r, confirmation_number: `${fallbackId}-${dup}` }, seqForFile, ext)
          target = join(outDir, fileName)
          dup += 1
        }
        try {
          await fs.copyFile(src, target)
          copied += 1
          sequence = seqForFile
          const key = makeExportRowKey(r)
          if (key) copiedKeys.push(key)
        } catch {
          missing.push(rid)
        }
      }
      if (nextOnly && continuationState) {
        const tokenExported = ensureTokenExportMap(continuationState, pdfDedupeToken)
        for (const key of copiedKeys) {
          tokenExported[key] = true
        }
        const seqToken = `pdf_seq:${scope}:${batchToken}`
        if (!continuationState.last_seq_by_token) {
          continuationState.last_seq_by_token = {}
        }
        continuationState.last_seq_by_token[seqToken] = sequence
        await saveExportContinuationState(base, continuationState)
      }
      return {
        ok: true,
        copied,
        total: rowsToCopy.length,
        missing,
        folder: outDir,
        skipped_duplicates: skippedDuplicates,
        part,
        next_only: nextOnly,
      }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
  ipcMain.handle('irs:open-path', async (_event, payload) => {
    try {
      const target = String(payload?.path || '').trim()
      if (!target) return { ok: false, error: 'Missing path' }
      const reveal = Boolean(payload?.reveal)
      if (reveal) {
        shell.showItemInFolder(target)
        return { ok: true }
      }
      const err = await shell.openPath(target)
      return err ? { ok: false, error: err } : { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
  ipcMain.handle('irs:settings:get-storage-dir', async () => {
    try {
      return { ok: true, storageDir: loadAppSettings().storageDir || '' }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
  ipcMain.handle('irs:settings:set-storage-dir', async (_event, payload) => {
    try {
      const dir = String(payload?.storageDir || '').trim()
      if (!dir) {
        saveAppSettings({ storageDir: '' })
      } else {
        mkdirSync(dir, { recursive: true })
        saveAppSettings({ storageDir: dir })
      }
      return { ok: true, storageDir: loadAppSettings().storageDir || '' }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
  ipcMain.handle('irs:settings:get-paths', async () => {
    try {
      return {
        ok: true,
        userDataDir: userDataDir(),
        effectiveStorageDir: storageRootDir(),
        runtimeConfigPath: runtimeConfigPath(),
        appSettingsPath: appSettingsPath(),
      }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
  ipcMain.handle('irs:settings:get-runtime', async () => {
    try {
      const s = loadAppSettings()
      return {
        ok: true,
        queueTimezone: s.queueTimezone || 'Asia/Ho_Chi_Minh',
        queueCountry: s.queueCountry || 'VN',
        queueStartHour: Number.isFinite(Number(s.queueStartHour)) ? Number(s.queueStartHour) : 18,
        forceRunNow: Boolean(s.forceRunNow),
        workerCount: Number.isFinite(Number(s.workerCount)) ? Number(s.workerCount) : 3,
        proxies: Array.isArray(s.proxies) ? s.proxies : [],
        proxyAuth: s.proxyAuth || null,
        globalRotateSecs: Number.isFinite(Number(s.globalRotateSecs)) ? Number(s.globalRotateSecs) : 5,
      }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
  ipcMain.handle('irs:settings:set-runtime', async (_event, payload) => {
    try {
      const queueTimezone = String(payload?.queueTimezone || 'Asia/Ho_Chi_Minh').trim() || 'Asia/Ho_Chi_Minh'
      const queueCountry = String(payload?.queueCountry || 'VN').trim() || 'VN'
      const queueStartHour = Math.min(23, Math.max(0, Number(payload?.queueStartHour ?? 18)))
      const forceRunNow = Boolean(payload?.forceRunNow)
      const workerCount = Number.isFinite(Number(payload?.workerCount)) ? Math.max(1, Math.min(8, Math.floor(Number(payload.workerCount)))) : undefined
      const patch: Partial<AppUiSettings> = { queueTimezone, queueCountry, queueStartHour, forceRunNow }
      if (workerCount !== undefined) patch.workerCount = workerCount
      if (Array.isArray(payload?.proxies)) patch.proxies = payload.proxies
      if (payload?.proxyAuth) patch.proxyAuth = payload.proxyAuth
      if (Number.isFinite(Number(payload?.globalRotateSecs))) patch.globalRotateSecs = Number(payload.globalRotateSecs)
      saveAppSettings(patch)
      return { ok: true, queueTimezone, queueCountry, queueStartHour, forceRunNow, workerCount: workerCount ?? loadAppSettings().workerCount ?? 3 }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
  ipcMain.handle('irs:proxy:healthcheck', async (_event, payload) => {
    try {
      const parsedProxy = parseProxyEndpointInput({
        host: String(payload?.host || ''),
        port: payload?.port,
        username: String(payload?.username || ''),
        password: String(payload?.password || ''),
      })
      const host = String(parsedProxy.socketHost || '').trim()
      const port = Number(parsedProxy.port || 0)
      if (!host || !Number.isFinite(port) || port <= 0) return { ok: false, error: 'Invalid host/port' }
      const timeoutMs = Math.min(20000, Math.max(1000, Number(payload?.timeoutMs || 8000)))
      if (String(parsedProxy.scheme || 'http').startsWith('socks')) {
        return { ok: false, error: `IRS healthcheck chưa hỗ trợ ${parsedProxy.scheme} proxy` }
      }
      const started = Date.now()
      let irs: { statusCode: number; statusLine: string; bodySnippet: string } | null = null
      let lastTargetErr = ''
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          irs = await requestIrsViaProxy({
            proxyHost: host,
            proxyPort: port,
            username: String(parsedProxy.username || ''),
            password: String(parsedProxy.password || ''),
            timeoutMs,
          })
          break
        } catch (err) {
          lastTargetErr = String(err || '')
          if (attempt < 3) {
            await new Promise((r) => setTimeout(r, 300 * attempt))
          }
        }
      }
      const latencyMs = Date.now() - started
      if (!irs) {
        const low = String(lastTargetErr || '').toLowerCase()
        const looksTlsOrReset =
          low.includes('ssleof')
          || low.includes('eof')
          || low.includes('tls')
          || low.includes('econnreset')
          || low.includes('connection reset')
          || low.includes('socket hang up')
        return {
          ok: false,
          resultKind: 'target_error',
          latencyMs,
          error: looksTlsOrReset
            ? 'Target TLS/reset (proxy alive but target unstable/blocked)'
            : `Target unreachable: ${lastTargetErr || 'unknown error'}`,
        }
      }
      const body = String(irs.bodySnippet || '')
      const looksBlocked = irs.statusCode === 403 || /access denied|reference #/i.test(body)
      if (irs.statusCode >= 200 && irs.statusCode < 400 && !looksBlocked) {
        return {
          ok: true,
          resultKind: 'proxy_ok',
          latencyMs,
          irsStatusCode: irs.statusCode,
          irsStatusLine: irs.statusLine,
        }
      }
      return {
        ok: false,
        resultKind: looksBlocked ? 'target_blocked_403' : 'target_error',
        latencyMs,
        irsStatusCode: irs.statusCode,
        irsStatusLine: irs.statusLine,
        error: looksBlocked
          ? `IRS blocked (${irs.statusCode || 'n/a'})`
          : `IRS healthcheck failed (${irs.statusCode || 'n/a'})`,
      }
    } catch (err) {
      const message = String(err || '')
      const low = message.toLowerCase()
      if (low.includes('407') || low.includes('proxy authentication required')) {
        return { ok: false, resultKind: 'proxy_auth_error', error: 'Proxy auth failed (407)' }
      }
      if (
        low.includes('connect failed')
        || low.includes('econnrefused')
        || low.includes('econnreset')
        || low.includes('timeout')
        || low.includes('proxy')
      ) {
        return { ok: false, resultKind: 'proxy_error', error: message }
      }
      return { ok: false, resultKind: 'target_error', error: message }
    }
  })
  ipcMain.handle('irs:settings:pick-storage-dir', async () => {
    try {
      const res = await dialog.showOpenDialog({
        title: 'Chọn thư mục lưu output',
        properties: ['openDirectory', 'createDirectory'],
      })
      if (res.canceled || !res.filePaths?.length) return { ok: false, cancelled: true }
      const picked = String(res.filePaths[0] || '').trim()
      if (!picked) return { ok: false, cancelled: true }
      mkdirSync(picked, { recursive: true })
      saveAppSettings({ storageDir: picked })
      return { ok: true, storageDir: picked }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  setupAutoUpdater()

  createWindow()

  setInterval(() => {
    try {
      const candidates = [
        join(storageRootDir(), 'state', 'worker_start.signal'),
        join(foxAutoRootPath(), 'state', 'worker_start.signal'),
      ]
      for (const sig of candidates) {
        if (existsSync(sig)) {
          try { unlinkSync(sig) } catch {}
          if (!pythonProcess || pythonProcess.exitCode !== null) {
            console.log(`[Signal] Detected worker_start.signal at ${sig}. Starting worker backend...`)
            startPythonBackend().catch((err) => console.error('[Signal] Failed starting worker:', err))
          }
        }
      }
    } catch {}
  }, 1000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  appIsQuitting = true
  workerShouldRun = false
  if (pythonProcess) {
    console.log('Stopping Python process tree...')
    void stopPythonBackend()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
