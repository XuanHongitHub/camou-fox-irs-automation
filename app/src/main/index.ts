import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, basename, extname } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../renderer/src/assets/app-logo.png?asset'
import { spawn, ChildProcess } from 'child_process'
import net from 'net'
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { promises as fs } from 'fs'
import * as XLSX from 'xlsx'

let pythonProcess: ChildProcess | null = null
let lineBuffer = ''
let ensureDevPythonReadyPromise: Promise<void> | null = null
let startPythonBackendPromise: Promise<void> | null = null
let stopPythonBackendPromise: Promise<void> | null = null
let workerShouldRun = false
let appIsQuitting = false
let devPythonReady = false
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
    setUpdateState({
      status: 'error',
      message: `Update error: ${String(err?.message || err)}`,
      error: String(err?.stack || err?.message || err),
      checkedAt: new Date().toISOString(),
    })
  })

  // Light startup check.
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      setUpdateState({
        status: 'error',
        message: `Update check failed: ${String(err)}`,
        error: String(err),
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
    const launch = pythonDevLaunch(['-c', 'import yaml, pandas, openpyxl, requests, camoufox, socks'])
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
  if (process.platform === 'win32') return raw
  const m = raw.match(/^([a-zA-Z]):[\\/](.*)$/)
  if (!m) return raw
  const drive = m[1].toLowerCase()
  const rest = m[2].replace(/\\/g, '/')
  return `/mnt/${drive}/${rest}`
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
  const raw = Number(process.env.BUG_AUTO_WORKERS || '1')
  if (!Number.isFinite(raw)) return 1
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
      killer.on('close', () => resolve())
      killer.on('error', () => {
        try { proc.kill() } catch { /* ignore */ }
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
    const workerCount = resolveWorkerCount()
    console.log(`Starting Python worker x${workerCount}...`)

    if (is.dev) {
      // In dev: run as package module to preserve relative imports.
      const foxAutoRoot = foxAutoRootPath()
      const launch = pythonDevLaunch(['-m', 'irs_bot', '--config', runtimeConfigPath(), 'worker', '--queues', 'ein.high,ein.default,ein.retry,ein.sandbox', '--workers', String(workerCount)])
      pythonProcess = spawn(launch.cmd, launch.args, {
        cwd: foxAutoRoot,
        env: { ...process.env, PYTHONPATH: foxAutoRoot }
      })
    } else {
      // In production: run the bundled PyInstaller exe.
      const exePath = cliBinaryPath()
      pythonProcess = spawn(exePath, ['--config', runtimeConfigPath(), 'worker', '--queues', 'ein.high,ein.default,ein.retry,ein.sandbox', '--workers', String(workerCount)], {
        cwd: process.resourcesPath
      })
    }

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
      const shouldRestart = workerShouldRun && !appIsQuitting
      pythonProcess = null
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

async function stopPythonBackend() {
  workerShouldRun = false
  if (stopPythonBackendPromise) {
    return stopPythonBackendPromise
  }
  const proc = pythonProcess
  if (!proc || proc.exitCode !== null) {
    return
  }
  stopPythonBackendPromise = (async () => {
    await killProcessTree(proc)
    await waitForProcessClose(proc, 6000)
    if (pythonProcess === proc) {
      pythonProcess = null
    }
  })().finally(() => {
    stopPythonBackendPromise = null
  })
  return stopPythonBackendPromise
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

  if (host.includes('://')) {
    try {
      const parsed = new URL(host)
      const scheme = normalizeProxyScheme(parsed.protocol.replace(':', ''))
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
  }
}

function buildSelectedReportRows(rows: any[]) {
  const toText = (v: unknown) => String(v ?? '').trim()
  const toNumOrBlank = (v: unknown) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : ''
  }
  return rows.map((row) => {
    const pdfPath = toText(row?.final_pdf_path || row?.pdf_path)
    return {
      record_id: toText(row?.record_id),
      name: toText(row?.name),
      status: toText(row?.status),
      confirmation_number: toText(row?.confirmation_number),
      step6_ein: toText(row?.step6_ein || row?.confirmation_number || row?.ein),
      step6_legal_name: toText(row?.step6_legal_name),
      step6_county: toText(row?.step6_county),
      step6_state: toText(row?.step6_state),
      step6_start_date: toText(row?.step6_start_date),
      step6_principal_activity: toText(row?.step6_principal_activity),
      step6_principal_product_service: toText(row?.step6_principal_product_service),
      step6_reason_for_applying: toText(row?.step6_reason_for_applying),
      error_code: toText(row?.error_code),
      error_message: toText(row?.error_message),
      last_step: toText(row?.last_step),
      proxy_used: toText(row?.proxy_used),
      proxy_ip: toText(row?.proxy_ip),
      duration_s: toNumOrBlank(row?.duration_s),
      completed_at: toText(row?.completed_at),
      pdf_file: pdfPath ? basename(pdfPath) : '',
      artifact_folder: toText(row?.artifact_dir) ? basename(toText(row?.artifact_dir)) : '',
      source: toText(row?.source_file) ? basename(toText(row?.source_file)) : '',
      batch_id: toText(row?.batch_id),
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

const EXPORT_CONTINUATION_FILENAME = 'continuation-v1.json'

function emptyExportContinuationState(): ExportContinuationState {
  return {
    version: 1,
    exported_keys: {},
    exported_keys_by_token: {},
    part_by_token: {},
    last_seq_by_token: {},
  }
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
    const pdfPath = toText(row?.final_pdf_path || row?.pdf_path)
    return {
      name: toText(row?.name),
      confirmation_number: toText(row?.confirmation_number),
      legal_name: toText(row?.step6_legal_name),
      county: toText(row?.step6_county),
      state: toText(row?.step6_state),
      start_date: toText(row?.step6_start_date),
      principal_activity: toText(row?.step6_principal_activity),
      principal_product_service: toText(row?.step6_principal_product_service),
      reason_for_applying: toText(row?.step6_reason_for_applying),
      pdf_file: pdfPath ? basename(pdfPath) : '',
      record_id: toText(row?.record_id),
      batch_id: toText(row?.batch_id),
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
  const activeProxy = (payload.proxies || []).find((p) => p.enabled) || (payload.proxies || [])[0] || {}
  let preservedRotateUrl = ''
  let preservedProxyHost = ''
  let preservedProxyPort = 0
  let preservedProxyUsername = ''
  let preservedProxyPassword = ''
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
  } catch {
    // ignore
  }
  const flowMode = String(payload.flowMode || 'sandbox')
  const rotateUrl = normalizeUrlLike(String(payload.rotateUrl || preservedRotateUrl || ''))
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
  // Running multiple workers in headed mode is unstable; force silent/headless.
  const autoHeadless = browserMode !== 'browser' || resolveWorkerCount() > 1
  const rotateWaitSecondsRaw = Number.isFinite(Number(payload.globalRotateSecs))
    ? Number(payload.globalRotateSecs)
    : 5
  const rotateWaitSeconds = (() => {
    const normalized = Math.max(0, Math.floor(rotateWaitSecondsRaw))
    // Legacy UI default was 600s; migrate runtime rotate to 5s for continuous flow.
    if (rotateUrl && normalized === 600) return 5
    return normalized
  })()
  const configText = `target_url: ${toYamlScalar(targetUrl)}

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
  rotate_url: ${toYamlScalar(rotateUrl)}
  change_ip_wait_seconds: ${Number.isFinite(rotateWaitSeconds) ? rotateWaitSeconds : 0}
  healthcheck_url: "http://api.ipify.org?format=json"
  skip_healthcheck: true

queue:
  queue_high: "ein.high"
  queue_default: "ein.default"
  queue_retry: "ein.retry"
  queue_manual: "ein.manual"
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
      const target = normalizeUrlLike(String(prev.match(/^\s*target_url:\s*["']?(.*?)["']?\s*$/m)?.[1] || ''))
      if (target.toLowerCase().includes('ein-sandbox.test')) flowMode = 'sandbox'
      const headlessRaw = String(prev.match(/^\s*headless:\s*(true|false)\s*$/m)?.[1] || '').toLowerCase()
      if (headlessRaw === 'false') browserMode = 'browser'
    } catch {
      // use defaults
    }
    await writeRuntimeConfig({
      flowMode,
      browserMode,
    })
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
  mainWindow.on('move', () => saveWindowState(mainWindow))
  mainWindow.on('close', () => saveWindowState(mainWindow))
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
  ipcMain.handle('irs:worker:stop', async () => {
    await stopPythonBackend()
    try {
      await runPythonCli(['queue', 'recover-running', '--stale-seconds', '0'])
    } catch (err) {
      console.warn(`Failed to recover running queue rows on stop: ${String(err)}`)
    }
    return { ok: true }
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
  ipcMain.handle('irs:queue:list', async () => {
    try {
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
  ipcMain.handle('irs:queue:remove', async (_event, payload) => {
    try {
      const ids = Array.isArray(payload?.ids) ? payload.ids.map((x: any) => String(x).trim()).filter(Boolean) : []
      if (!ids.length) return { ok: true, deleted: 0 }
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
        : sourceRows
      if (!filteredRows.length) {
        return { ok: false, error: reportType === 'failures' ? 'No failed rows in selection' : 'No rows after filter' }
      }

      const legacyCompact = nextOnly && reportType === 'report'
      const reportDedupeToken = legacyCompact ? 'legacy_report:F' : `report_selected:${reportType}:${batchToken}`
      let rowsForKey = legacyCompact ? buildLegacyCompactReportRows(filteredRows) : buildSelectedReportRows(filteredRows)
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

      const headers = legacyCompact
        ? [
          'name',
          'confirmation_number',
          'legal_name',
          'county',
          'state',
          'start_date',
          'principal_activity',
          'principal_product_service',
          'reason_for_applying',
          'pdf_file',
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
      const sheetRows = legacyCompact
        ? rowsForKey.map((row) => ({
          name: row.name,
          confirmation_number: row.confirmation_number,
          legal_name: row.legal_name,
          county: row.county,
          state: row.state,
          start_date: row.start_date,
          principal_activity: row.principal_activity,
          principal_product_service: row.principal_product_service,
          reason_for_applying: row.reason_for_applying,
          pdf_file: row.pdf_file,
        }))
        : rowsForKey
      const ws = XLSX.utils.json_to_sheet(sheetRows, { header: headers })
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'report')

      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const outDir = join(base, 'outputs', 'reports')
      await fs.mkdir(outDir, { recursive: true })
      const fileBase = legacyCompact
        ? `${hcmDateLabel()}-F${part}`
        : nextOnly
          ? `selected_${reportType}_${batchToken}_part${part}_${ts}`
          : `selected_${reportType}_${batchToken}_${ts}`
      const xlsxPath = join(outDir, `${fileBase}.xlsx`)
      const csvPath = join(outDir, `${fileBase}.csv`)
      const writeBothFormats = legacyCompact

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
      }
    } catch (err) {
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
      const slug = (v: string, max = 48) =>
        String(v || '')
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/gi, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, max)
      const stripExt = (name: string) => String(name || '').replace(/\.[^/.]+$/, '')
      for (let i = 0; i < rowsToCopy.length; i++) {
        const r = rowsToCopy[i] || {}
        const src = String(r.final_pdf_path || r.pdf_path || '').trim()
        const rid = String(r.record_id || `row-${i + 1}`).trim()
        const person = String(r.name || '').trim()
        const ein = String(r.step6_ein || r.confirmation_number || '').trim()
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
        const baseName = stripExt(basename(src))
        const seqForFile = sequence + 1
        const parts = [
          String(seqForFile).padStart(3, '0'),
          slug(person, 40),
          slug(rid, 44),
          slug(ein, 24),
          slug(baseName, 40),
        ].filter(Boolean)
        let fileName = `${parts.join('_')}${ext}`
        let target = join(outDir, fileName)
        let dup = 2
        while (existsSync(target)) {
          fileName = `${parts.join('_')}_${dup}${ext}`
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
      saveAppSettings({ queueTimezone, queueCountry, queueStartHour, forceRunNow })
      return { ok: true, queueTimezone, queueCountry, queueStartHour, forceRunNow }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
  ipcMain.handle('irs:proxy:healthcheck', async (_event, payload) => {
    try {
      const parsedProxy = parseProxyEndpointInput({
        host: String(payload?.host || ''),
        port: payload?.port,
      })
      const host = String(parsedProxy.socketHost || '').trim()
      const port = Number(parsedProxy.port || 0)
      if (!host || !Number.isFinite(port) || port <= 0) return { ok: false, error: 'Invalid host/port' }
      const timeoutMs = Math.min(15000, Math.max(500, Number(payload?.timeoutMs || 5000)))
      const started = Date.now()
      const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const socket = net.createConnection({ host, port })
        let settled = false
        const done = (ok: boolean, error?: string) => {
          if (settled) return
          settled = true
          try { socket.destroy() } catch { /* ignore */ }
          resolve({ ok, error })
        }
        socket.setTimeout(timeoutMs)
        socket.once('connect', () => done(true))
        socket.once('timeout', () => done(false, `timeout ${timeoutMs}ms`))
        socket.once('error', (e) => done(false, String(e)))
      })
      return { ok: result.ok, error: result.error, latencyMs: Date.now() - started }
    } catch (err) {
      return { ok: false, error: String(err) }
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
