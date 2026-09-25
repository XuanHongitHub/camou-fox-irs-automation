import { useState, useEffect, useRef, useCallback, useMemo, type Dispatch, type SetStateAction } from 'react'
import { AppShell } from './components/layout/AppShell'
import { SidebarPrimary } from './components/layout/SidebarPrimary'
import { Button } from './components/base/Button'
import { CsvImportModal } from './components/modals/CsvImportModal'
import { ProxyConfigModal } from './components/modals/ProxyConfigModal'
import { ResultsDashboard } from './components/views/ResultsDashboard'
import type { ResultRow } from './components/views/ResultsDashboard'
import { I18nProvider } from './i18n/I18nProvider'
import type { UILanguage } from './i18n/dictionaries'
import {
  Zap, FlaskConical, Workflow, Settings,
  Play, Square, RefreshCw, TerminalSquare,
  CheckCircle2, XCircle, Clock, Loader2, CircleDot,
  Upload, AlarmClock, ChevronRight,
  FileText,
  AlertTriangle, Copy, Filter, Inbox, BarChart2,
  Globe, RotateCw, Hash, BookOpen, ShieldAlert, Shield,
  Check, AlertCircle, X, LayoutDashboard, ArrowDownToLine, Monitor, Ghost, Users
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type FlowMode = 'manual' | 'sandbox' | 'full' | 'observe'
type BrowserMode = 'silent' | 'browser'
type JobStatus = 'pending' | 'running' | 'done' | 'failed'
type WorkspacePage = 'work' | 'proxy_manager' | 'settings'

// Mirrors automation steps in runner.py
type AutoStep = 'init' | 'proxy_rotate' | 'loaded' | 'filled' | 'review' | 'submitted' | 'confirmed' | 'exception'

interface JobStep {
  step: AutoStep
  status: 'done' | 'running' | 'pending' | 'failed' | 'skipped'
  ts?: string
  note?: string
}

interface JobArtifact {
  name: string           // e.g. "result.json", "screenshot_review.png"
  type: 'json' | 'csv' | 'png' | 'pdf' | 'log'
  path: string
  size?: string
}

interface Job {
  job_id: string
  queue_name: string
  status: JobStatus
  // Record info
  record_id: string
  name: string
  ein: string
  batch_id: string
  source_file: string
  // Runtime info
  attempt_count: number
  max_attempts: number
  proxy_used?: string
  proxy_ip?: string
  last_step: AutoStep
  // Result
  confirmation_number?: string
  step6_legal_name?: string
  step6_data?: Record<string, unknown>
  pdf_path?: string
  error_code?: string
  error_message?: string
  artifact_dir?: string
  artifacts?: JobArtifact[]
  steps: JobStep[]
  // Times
  created_at: number
  updated_at: number
  duration_s?: number
}

interface LogLine {
  id: string
  ts: string
  level: 'info' | 'success' | 'error' | 'warning'
  msg: string
  job_id?: string
  step?: AutoStep
  proxy_ip?: string   // e.g. "14.185.42.71 via VN-4G-03"
}

type UpdateState = {
  status: 'disabled' | 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  message: string
  currentVersion: string
  targetVersion?: string
  percent?: number
  releaseDate?: string
  checkedAt?: string
  error?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STEP_ORDER: AutoStep[] = ['init', 'proxy_rotate', 'loaded', 'filled', 'review', 'submitted', 'confirmed']
const STEP_LABELS: Record<AutoStep, string> = {
  init: 'Init', proxy_rotate: 'Proxy', loaded: 'Load', filled: 'Fill',
  review: 'Review', submitted: 'Submit', confirmed: 'Confirm', exception: 'Error'
}
const STEP_ICONS: Record<AutoStep, React.ReactNode> = {
  init: <CircleDot className="w-3 h-3" />,
  proxy_rotate: <RotateCw className="w-3 h-3" />,
  loaded: <Globe className="w-3 h-3" />,
  filled: <BookOpen className="w-3 h-3" />,
  review: <FileText className="w-3 h-3" />,
  submitted: <CheckCircle2 className="w-3 h-3" />,
  confirmed: <Hash className="w-3 h-3" />,
  exception: <ShieldAlert className="w-3 h-3" />,
}

const FLOWS = [
  { id: 'manual' as FlowMode, icon: <Zap className="w-3.5 h-3.5" />, label: 'Manual', desc: 'IRS trực tiếp, bỏ proxy', locked: true, color: 'text-warning', queue: 'ein.manual' },
  { id: 'sandbox' as FlowMode, icon: <FlaskConical className="w-3.5 h-3.5" />, label: 'Sandbox', desc: 'ein-sandbox.test', locked: false, color: 'text-accent', queue: 'ein.sandbox' },
  { id: 'full' as FlowMode, icon: <Workflow className="w-3.5 h-3.5" />, label: 'Tự động', desc: 'Proxy + Queue + IRS', locked: true, color: 'text-success', queue: 'ein.default' },
  { id: 'observe' as FlowMode, icon: <Monitor className="w-3.5 h-3.5" />, label: 'Quan sát', desc: 'Full flow chậm hơn để quan sát', locked: true, color: 'text-warning', queue: 'ein.observe' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useClock(timeZone: string) {
  const compute = () => {
    const now = new Date()
    const localized = new Date(now.toLocaleString('en-US', { timeZone }))
    return {
      hour: localized.getHours(),
      timeLabel: now.toLocaleTimeString('vi-VN', {
        timeZone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    }
  }
  const [clock, setClock] = useState(compute)
  useEffect(() => {
    const t = setInterval(() => setClock(compute()), 1000)
    return () => clearInterval(t)
  }, [timeZone])
  return clock
}

function normalizeRotateSeconds(value: unknown) {
  const raw = Number(value)
  if (!Number.isFinite(raw)) return 5
  const normalized = Math.max(0, Math.floor(raw))
  // Legacy default in old builds was 600s; migrate to 5s for runtime mode.
  if (normalized === 600) return 5
  return normalized
}

function formatHourForTimeInput(hour: number) {
  const normalized = Math.max(0, Math.min(23, Number.isFinite(hour) ? Math.floor(hour) : 18))
  return `${String(normalized).padStart(2, '0')}:00`
}

function parseHourFromTimeInput(value: string) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return 18
  const hour = Math.max(0, Math.min(23, Number(match[1] || 18)))
  const minutes = Math.max(0, Math.min(59, Number(match[2] || 0)))
  return minutes >= 30 ? Math.min(23, hour + 1) : hour
}

function timeSince(ts: number) {
  const s = Math.floor(Date.now() / 1000 - ts)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}

function logLevel(raw: string): LogLine['level'] {
  const l = raw.toLowerCase()
  if (l.includes('error') || l.includes('fail') || l.includes('block') || l.includes('captcha')) return 'error'
  if (l.includes('success') || l.includes('done') || l.includes('confirm') || l.includes('✓')) return 'success'
  if (l.includes('warn') || l.includes('retry') || l.includes('skip') || l.includes('timeout')) return 'warning'
  return 'info'
}

function inferStepStates(lastStep: AutoStep, status: JobStatus, previous?: JobStep[]): JobStep[] {
  const prevMap = new Map((previous || []).map((s) => [s.step, s]))
  const idx = STEP_ORDER.indexOf(lastStep)
  return STEP_ORDER.map((step, i) => {
    const prev = prevMap.get(step)
    let next: JobStep['status'] = 'pending'
    if (status === 'pending') {
      next = 'pending'
    } else if (status === 'running') {
      if (idx >= 0) {
        if (i < idx) next = 'done'
        else if (i === idx) next = 'running'
      } else if (step === 'init') {
        next = 'running'
      }
    } else if (status === 'done') {
      // UX rule: once record is done, show full pipeline done.
      next = 'done'
    } else if (status === 'failed') {
      if (idx >= 0) {
        if (i < idx) next = 'done'
        else if (i === idx) next = 'failed'
      } else if (step === 'init') {
        next = 'failed'
      }
    }
    return {
      step,
      status: next,
      ts: prev?.ts,
      note: prev?.note,
    }
  })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: JobStatus }) {
  const map: Record<JobStatus, { icon: React.ReactNode; cls: string; label: string }> = {
    pending: { icon: <Clock className="w-3 h-3" />, cls: 'text-muted border-border/60', label: 'Pending' },
    running: { icon: <Loader2 className="w-3 h-3 animate-spin" />, cls: 'text-accent border-accent/40 bg-accent/5', label: 'Running' },
    done: { icon: <CheckCircle2 className="w-3 h-3" />, cls: 'text-success border-success/40 bg-success/5', label: 'Done' },
    failed: { icon: <XCircle className="w-3 h-3" />, cls: 'text-danger border-danger/40 bg-danger/5', label: 'Failed' },
  }
  const { icon, cls, label } = map[status]
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${cls}`}>
      {icon}{label}
    </span>
  )
}

function StepPipeline({ steps, compact = false }: { steps: JobStep[]; compact?: boolean }) {
  if (compact) {
    // Small dots for table row
    return (
      <div className="flex items-center gap-0.5">
        {STEP_ORDER.map(s => {
          const step = steps.find(st => st.step === s)
          const cls =
            step?.status === 'done' ? 'bg-success/80' :
              step?.status === 'running' ? 'bg-accent animate-pulse' :
                step?.status === 'failed' ? 'bg-danger' :
                  step?.status === 'skipped' ? 'bg-border/30' : 'bg-border/40'
          return <span key={s} className={`w-2 h-2 rounded-full ${cls}`} title={STEP_LABELS[s]} />
        })}
      </div>
    )
  }

  // Full step view
  return (
    <div className="flex items-start gap-1 mt-3">
      {STEP_ORDER.map((s, i) => {
        const step = steps.find(st => st.step === s)
        const isDone = step?.status === 'done'
        const isRunning = step?.status === 'running'
        const isFailed = step?.status === 'failed'
        const isSkipped = step?.status === 'skipped'
        const isPending = !step || step.status === 'pending'

        const iconCls = isDone ? 'text-success bg-success/10 border-success/30' :
          isRunning ? 'text-accent bg-accent/10 border-accent/30 animate-pulse-subtle' :
            isFailed ? 'text-danger bg-danger/10 border-danger/30' :
              (isSkipped || isPending) ? 'text-muted/30 bg-transparent border-border/20' :
                'text-muted/40 bg-transparent border-border/30'

        return (
          <div key={s} className="flex-1 flex flex-col items-center gap-1">
            <div className={`w-6 h-6 rounded-full border flex items-center justify-center ${iconCls}`}>
              {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : STEP_ICONS[s]}
            </div>
            <div className={`text-[9px] font-medium text-center ${isDone ? 'text-success' : isFailed ? 'text-danger' : isRunning ? 'text-accent' : 'text-muted/50'}`}>
              {STEP_LABELS[s]}
            </div>
            {step?.ts && <div className="text-[9px] text-muted/40">{step.ts}</div>}
            {step?.note && (
              <div className={`text-[9px] text-center leading-tight mt-0.5 max-w-[72px] ${isFailed ? 'text-danger/70' : 'text-muted/50'}`}>
                {step.note}
              </div>
            )}
            {/* Connector line */}
            {i < STEP_ORDER.length - 1 && (
              <div className="hidden" />
            )}
          </div>
        )
      })}
    </div>
  )
}

function JobRow({
  job,
  selected,
  onToggleSelect,
}: {
  job: Job
  selected: boolean
  onToggleSelect: (jobId: string, checked: boolean) => void
}) {
  const [expanded, setExpanded] = useState(job.status === 'running')
  const openPath = (path: string, reveal = false) => {
    const ipc = window.electron?.ipcRenderer
    if (!ipc || !path) return
    ipc.invoke('irs:open-path', { path, reveal }).catch(() => {
      // no-op
    })
  }

  const rowBg =
    job.status === 'running' ? 'bg-accent/[0.03] hover:bg-accent/[0.06]' :
      job.status === 'failed' ? 'bg-danger/[0.03] hover:bg-danger/[0.06]' :
        job.status === 'done' ? '' : ''

  return (
    <>
      <tr
        onClick={() => setExpanded(p => !p)}
        className={`cursor-pointer border-b border-border/50 transition-colors hover:bg-surface/40 ${rowBg}`}
      >
        <td className="pl-3 pr-1 py-2.5 w-8" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onToggleSelect(job.job_id, e.target.checked)}
            className="ba-checkbox"
          />
        </td>
        {/* Expand */}
        <td className="pl-3 pr-1 py-2.5 w-6">
          <ChevronRight className={`w-3 h-3 text-muted/40 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </td>
        {/* Record */}
        <td className="px-3 py-2.5">
          <div className="font-medium text-text text-[11px]">{job.name}</div>
          <div className="text-[10px] text-muted font-mono">{job.ein} · {job.record_id}</div>
        </td>
        {/* Status */}
        <td className="px-3 py-2.5">
          <StatusBadge status={job.status} />
          {job.status === 'failed' && job.error_code && (
            <div className="text-[9px] text-danger/70 mt-0.5 font-mono">{job.error_code}</div>
          )}
          {job.status === 'done' && job.confirmation_number && (
            <div className="text-[9px] text-success/70 mt-0.5 font-mono">{job.confirmation_number}</div>
          )}
        </td>
        {/* Step pipeline (compact) */}
        <td className="px-3 py-2.5">
          <StepPipeline steps={job.steps} compact />
          <div className="text-[9px] text-muted/50 mt-0.5">{STEP_LABELS[job.last_step]}</div>
        </td>
        {/* Attempts */}
        <td className="px-3 py-2.5 text-[11px] text-muted">
          {Math.max(1, Number(job.attempt_count || 1))}
          {job.proxy_used && <div className="text-[9px] font-mono">{job.proxy_used}</div>}
        </td>
        {/* Duration / time */}
        <td className="px-3 py-2.5 text-[11px] text-muted">
          {job.duration_s ? `${job.duration_s}s` : timeSince(job.created_at)}
        </td>
      </tr>

      {/* Expanded detail */}
      {expanded && (
        <tr className="border-b border-border/30">
          <td />
          <td colSpan={6} className="px-4 pb-4 pt-1">
            <div className="bg-surface/50 border border-border/40 rounded-xl p-4 space-y-4">

              {/* Step pipeline full */}
              <div>
                <div className="text-[10px] text-muted font-medium mb-2 uppercase tracking-wider">Automation Steps</div>
                <StepPipeline steps={job.steps} />
              </div>
              <div>
                <div className="text-[10px] text-muted font-medium mb-2 uppercase tracking-wider">Step Timeline</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-[10px]">
                  {job.steps.filter(s => s.status !== 'pending').map((s) => (
                    <div key={`tl-${s.step}`} className="flex items-center gap-2 px-2 py-1 rounded-md border border-border/40 bg-panel/40">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        s.status === 'done' ? 'bg-success' :
                        s.status === 'failed' ? 'bg-danger' :
                        s.status === 'running' ? 'bg-accent animate-pulse' : 'bg-muted/40'
                      }`} />
                      <span className="font-medium text-text/90">{STEP_LABELS[s.step]}</span>
                      <span className="ml-auto text-muted tabular-nums">{s.ts || '—'}</span>
                      {s.note && <span className="text-muted truncate max-w-[140px]">{s.note}</span>}
                    </div>
                  ))}
                  {job.steps.filter(s => s.status !== 'pending').length === 0 && (
                    <div className="text-muted">No timeline yet</div>
                  )}
                </div>
              </div>

              {/* Error (if failed) */}
              {job.error_message && (
                <div className="flex gap-2 p-3 bg-danger/5 border border-danger/20 rounded-lg">
                  <AlertTriangle className="w-3.5 h-3.5 text-danger shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[10px] font-medium text-danger mb-0.5">
                      Error @ step: {STEP_LABELS[job.last_step]} {job.error_code && `(${job.error_code})`}
                    </div>
                    <div className="text-[10px] text-danger/70 leading-relaxed">{job.error_message}</div>
                  </div>
                </div>
              )}

              {/* Confirmation (if done) */}
              {job.confirmation_number && (
                <div className="flex items-center gap-3 p-3 bg-success/5 border border-success/20 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                  <div>
                    <div className="text-[10px] font-medium text-success">EIN Application Confirmed</div>
                    <div className="text-sm font-mono font-semibold text-text mt-0.5">{job.confirmation_number}</div>
                    {job.step6_legal_name && <div className="text-[10px] text-muted mt-0.5">{job.step6_legal_name}</div>}
                  </div>
                  <button
                    className="ml-auto text-muted hover:text-text transition-colors"
                    onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(job.confirmation_number!) }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div>
                <div className="text-[10px] text-muted font-medium mb-2 uppercase tracking-wider">Output</div>
                <div className="flex flex-wrap gap-2">
                  {job.pdf_path && (
                    <button
                      className="text-[10px] px-2 py-1 rounded-md border border-success/30 text-success bg-success/5 hover:bg-success/10"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (job.pdf_path) openPath(job.pdf_path)
                      }}
                    >
                      Open Final PDF
                    </button>
                  )}
                  {job.artifact_dir && (
                    <button
                      className="text-[10px] px-2 py-1 rounded-md border border-accent/30 text-accent bg-accent/5 hover:bg-accent/10"
                      onClick={(e) => { e.stopPropagation(); openPath(job.artifact_dir || '', true) }}
                    >
                      Open Artifact Folder
                    </button>
                  )}
                </div>
                <div className="text-[9px] text-muted/40 mt-1 font-mono break-all">{job.artifact_dir}</div>
              </div>

              {/* Metadata row */}
              <div className="flex gap-4 text-[10px] text-muted pt-1 border-t border-border/30">
                <span>Batch: <span className="text-text font-mono">{job.batch_id}</span></span>
                <span>Source: <span className="text-text font-mono">{job.source_file}</span></span>
                <span>Queue: <span className="text-text">{job.queue_name}</span></span>
                {job.proxy_used && <span>Proxy: <span className="text-text font-mono">{job.proxy_used}</span></span>}
                {job.proxy_ip && <span>IP: <span className="text-text font-mono">{job.proxy_ip}</span></span>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}



// ─── Main App ─────────────────────────────────────────────────────────────────

function AppContent({
  uiLanguage,
  setUiLanguage,
}: {
  uiLanguage: UILanguage
  setUiLanguage: Dispatch<SetStateAction<UILanguage>>
}) {
  const JOBS_STORAGE_KEY = 'fox_jobs_v1'
  const RESULTS_STORAGE_KEY = 'fox_results_v1'
  const [activeFlow, setActiveFlow] = useState<FlowMode>('full')
  const [workspacePage, setWorkspacePage] = useState<WorkspacePage>('work')
  const [workerRunning, setWorkerRunning] = useState(false)
  const [workerStarting, setWorkerStarting] = useState(false)
  const [workerStopping, setWorkerStopping] = useState(false)
  const [workerCount, setWorkerCount] = useState(3)
  const [jobs, setJobs] = useState<Job[]>(() => {
    const raw = localStorage.getItem(JOBS_STORAGE_KEY)
    if (!raw) return []
    try { return JSON.parse(raw) as Job[] } catch { return [] }
  })
  const jobsRef = useRef<Job[]>([])
  useEffect(() => { jobsRef.current = jobs }, [jobs])
  const [showCsvModal, setShowCsvModal] = useState(false)
  const [bundleUploadRunning, setBundleUploadRunning] = useState(false)
  const [bundleUploadLabel, setBundleUploadLabel] = useState('Tải lên mục đã chọn')
  const [bundleUploadPercent, setBundleUploadPercent] = useState(0)
  const [bundleUploadCurrent, setBundleUploadCurrent] = useState(0)
  const [bundleUploadTotal, setBundleUploadTotal] = useState(0)
  const [bundleUploadDetail, setBundleUploadDetail] = useState('')
  const [bundleUploadFolderName, setBundleUploadFolderName] = useState('')
  const [bundleUploadPanelOpen, setBundleUploadPanelOpen] = useState(false)
  const [bundleUploadFolderUrl, setBundleUploadFolderUrl] = useState('')
  const [bundleUploadReportUrl, setBundleUploadReportUrl] = useState('')
  const [showProxyModal, setShowProxyModal] = useState(false)
  const [logs, setLogs] = useState<LogLine[]>([])
  const [logFilter, setLogFilter] = useState<'all' | 'error' | 'success' | 'warning'>('all')
  const [jobFilter, setJobFilter] = useState<'all' | JobStatus>('all')
  const [activeTab, setActiveTab] = useState<'queue' | 'logs' | 'results'>('results')
  const [results, _setResults] = useState<ResultRow[]>(() => {
    const raw = localStorage.getItem(RESULTS_STORAGE_KEY)
    if (!raw) return []
    try { return JSON.parse(raw) as ResultRow[] } catch { return [] }
  })
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set())
  const [proxies, setProxies] = useState<any[]>(() => {
    const saved = localStorage.getItem('fox_proxies')
    return saved ? JSON.parse(saved) : []
  })
  const [_globalRotate, setGlobalRotate] = useState(() => {
    const saved = localStorage.getItem('fox_global_rotate')
    return normalizeRotateSeconds(saved ? parseInt(saved, 10) : 5)
  })
  const [proxyAuth, setProxyAuth] = useState(() => ({
    bearerToken: localStorage.getItem('fox_proxy_bearer') || '',
    providerUsername: localStorage.getItem('fox_proxy_provider_username') || '',
    providerPassword: localStorage.getItem('fox_proxy_provider_password') || '',
    rotateUrl: localStorage.getItem('fox_proxy_rotate_url') || '',
  }))
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('fox_theme_mode')
    return saved === 'light' ? 'light' : 'dark'
  })
  const [storageDir, setStorageDir] = useState<string>('')
  const [userDataPath, setUserDataPath] = useState<string>('')
  const [runtimeConfigFilePath, setRuntimeConfigFilePath] = useState<string>('')
  const [appSettingsFilePath, setAppSettingsFilePath] = useState<string>('')
  const [queueTimezone, setQueueTimezone] = useState<string>(() => localStorage.getItem('fox_queue_timezone') || 'Asia/Ho_Chi_Minh')
  const [queueCountry, setQueueCountry] = useState<string>(() => localStorage.getItem('fox_queue_country') || 'VN')
  const [queueStartHour, setQueueStartHour] = useState<number>(() => Number(localStorage.getItem('fox_queue_start_hour') || 18))
  const [forceRunNow, setForceRunNow] = useState<boolean>(() => localStorage.getItem('fox_force_run_now') === '1')
  const [runArmed, setRunArmed] = useState<boolean>(() => localStorage.getItem('fox_run_armed') === '1')
  const [browserMode, setBrowserMode] = useState<BrowserMode>(() => (localStorage.getItem('fox_browser_mode') === 'browser' ? 'browser' : 'silent'))
  const [proxyHealth, setProxyHealth] = useState<Record<string, {
    ok: boolean
    latencyMs?: number
    checkedAt: number
    error?: string
    irsStatusCode?: number
    resultKind?: 'proxy_ok' | 'target_blocked_403' | 'target_error' | 'proxy_auth_error' | 'proxy_error'
  }>>({})
  const [selectedExportBatch, setSelectedExportBatch] = useState<string>('')
  const [queueBatchFilter, setQueueBatchFilter] = useState<string>('all')
  const [toasts, setToasts] = useState<Array<{ id: string; msg: string; type: 'success' | 'error' | 'warning' | 'info' }>>([])
  const toastDedupRef = useRef<Record<string, number>>({})
  const logDedupRef = useRef<Record<string, number>>({})
  const batchDoneToastRef = useRef<string>('')
  const queueSyncErrorRef = useRef<string>('')
  const [miniRunCollapsed, setMiniRunCollapsed] = useState(false)
  const [uiNowMs, setUiNowMs] = useState<number>(Date.now())
  const [appVersion, setAppVersion] = useState<string>('')
  const [updateState, setUpdateState] = useState<UpdateState>({
    status: 'idle',
    message: 'Chưa kiểm tra',
    currentVersion: '',
  })
  const [recentRunNotice, setRecentRunNotice] = useState<{
    recordId: string
    name: string
    status: 'done' | 'failed'
    lastStep: AutoStep
    at: number
  } | null>(null)
  const derivedDefaultUserDataPath = (
    userDataPath
    || appSettingsFilePath.replace(/[\\/]+ui[\\/]+settings\.json$/i, '')
    || runtimeConfigFilePath.replace(/[\\/]+irs-bot[\\/]+config\.yml$/i, '')
  )

  useEffect(() => {
    localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(jobs))
  }, [jobs])

  useEffect(() => {
    localStorage.setItem(RESULTS_STORAGE_KEY, JSON.stringify(results))
  }, [results])

  useEffect(() => {
    localStorage.setItem('fox_theme_mode', themeMode)
    document.documentElement.classList.toggle('light', themeMode === 'light')
  }, [themeMode])

  useEffect(() => {
    const ipc = window.electron?.ipcRenderer
    if (!ipc) return
    ipc.invoke('app:version').then((res: any) => {
      if (res?.ok) setAppVersion(String(res.version || ''))
    }).catch(() => {
      // ignore
    })
    ipc.invoke('app:update:get-state').then((res: any) => {
      if (!res?.ok) return
      setUpdateState({
        status: String(res.status || 'idle') as UpdateState['status'],
        message: String(res.message || 'Chưa kiểm tra'),
        currentVersion: String(res.currentVersion || ''),
        targetVersion: res.targetVersion ? String(res.targetVersion) : undefined,
        percent: Number.isFinite(Number(res.percent)) ? Number(res.percent) : undefined,
        releaseDate: res.releaseDate ? String(res.releaseDate) : undefined,
        checkedAt: res.checkedAt ? String(res.checkedAt) : undefined,
        error: res.error ? String(res.error) : undefined,
      })
    }).catch(() => {
      // ignore
    })
    ipc.invoke('irs:settings:get-storage-dir').then((res: any) => {
      if (res?.ok) setStorageDir(String(res.storageDir || ''))
    }).catch(() => {
      // ignore
    })
    ipc.invoke('irs:settings:get-paths').then((res: any) => {
      if (!res?.ok) return
      setUserDataPath(String(res.userDataDir || ''))
      setRuntimeConfigFilePath(String(res.runtimeConfigPath || ''))
      setAppSettingsFilePath(String(res.appSettingsPath || ''))
    }).catch(() => {
      // ignore
    })
    ipc.invoke('irs:settings:get-runtime').then((res: any) => {
      if (!res?.ok) return
      setQueueTimezone(String(res.queueTimezone || 'Asia/Ho_Chi_Minh'))
      setQueueCountry(String(res.queueCountry || 'VN'))
      setQueueStartHour(Number(res.queueStartHour ?? 18))
      setForceRunNow(Boolean(res.forceRunNow))
      if (Number.isFinite(Number(res?.workerCount))) setWorkerCount(Number(res.workerCount))
      if (Array.isArray(res?.proxies) && res.proxies.length > 0) setProxies(res.proxies)
      if (res?.proxyAuth) setProxyAuth(res.proxyAuth)
      if (Number.isFinite(Number(res?.globalRotateSecs))) setGlobalRotate(normalizeRotateSeconds(res.globalRotateSecs))
    }).catch(() => {
      // ignore
    })
  }, [])

  useEffect(() => {
    localStorage.setItem('fox_queue_timezone', queueTimezone)
    localStorage.setItem('fox_queue_country', queueCountry)
    localStorage.setItem('fox_queue_start_hour', String(queueStartHour))
    localStorage.setItem('fox_force_run_now', forceRunNow ? '1' : '0')
  }, [queueTimezone, queueCountry, queueStartHour, forceRunNow])
  useEffect(() => {
    localStorage.setItem('fox_browser_mode', browserMode)
  }, [browserMode])
  useEffect(() => {
    localStorage.setItem('fox_run_armed', runArmed ? '1' : '0')
  }, [runArmed])

  useEffect(() => {
    const t = setInterval(() => setUiNowMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const showMessage = (msg: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => {
    const cleanMsg = String(msg || '').trim()
    if (!cleanMsg) return
    const now = Date.now()
    const key = `${type}::${cleanMsg}`
    const lastTs = toastDedupRef.current[key] || 0
    // Dedupe fast duplicate events (e.g. UI action + worker event).
    if (now - lastTs < 2200) return
    toastDedupRef.current[key] = now
    // lightweight prune
    if (Object.keys(toastDedupRef.current).length > 120) {
      const cutoff = now - 15000
      for (const [k, ts] of Object.entries(toastDedupRef.current)) {
        if (ts < cutoff) delete toastDedupRef.current[k]
      }
    }
    const id = crypto.randomUUID()
    setToasts(prev => [...prev.slice(-3), { id, msg: cleanMsg, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3200)
  }

  const appendLog = useCallback((entry: Omit<LogLine, 'id'>) => {
    const now = Date.now()
    const key = `${entry.level}|${entry.job_id || ''}|${entry.step || ''}|${entry.msg}`
    const last = logDedupRef.current[key] || 0
    if (now - last < 900) return
    logDedupRef.current[key] = now
    if (Object.keys(logDedupRef.current).length > 800) {
      const cutoff = now - 20000
      for (const [k, ts] of Object.entries(logDedupRef.current)) {
        if (ts < cutoff) delete logDedupRef.current[k]
      }
    }
    setLogs(prev => [...prev.slice(-399), { ...entry, id: crypto.randomUUID() }])
  }, [])

  const logRef = useRef<HTMLDivElement>(null)
  const clock = useClock(queueTimezone || 'Asia/Ho_Chi_Minh')
  const profileKey = (flow: FlowMode) => `fox_profile_${flow}`

  const mapDbStatusToUi = (s: string): JobStatus => {
    const v = String(s || '').toLowerCase()
    if (v === 'pending') return 'pending'
    if (v === 'running') return 'running'
    if (v === 'done' || v === 'success') return 'done'
    if (v === 'manual_required') return 'failed'
    if (v === 'failed' || v === 'cancelled') return 'failed'
    return 'pending'
  }

  const basename = (p: string) => {
    const s = String(p || '').trim()
    if (!s) return ''
    const parts = s.split(/[\\/]/).filter(Boolean)
    return parts.length ? parts[parts.length - 1] : s
  }

  async function refreshQueueFromDb() {
    const ipc = window.electron?.ipcRenderer
    if (!ipc) return
    try {
      const res = await ipc.invoke('irs:queue:list')
      if (!res?.ok || !Array.isArray(res?.rows)) {
        const errorText = String(res?.error || 'queue:list returned invalid payload')
        if (queueSyncErrorRef.current !== errorText) {
          queueSyncErrorRef.current = errorText
          const ts = new Date().toLocaleTimeString('vi', { hour12: false })
          setLogs(prev => [...prev.slice(-399), {
            id: crypto.randomUUID(),
            ts,
            level: 'error',
            msg: `[queue-sync] ${errorText}`,
          }])
          showMessage(`Queue sync lỗi: ${errorText}`, 'error')
        }
        return
      }
      if (queueSyncErrorRef.current) queueSyncErrorRef.current = ''
      const existing = new Map(jobsRef.current.map(j => [j.job_id, j]))
      const mapped: Job[] = res.rows.map((row: any) => {
        const payload = row?.payload || {}
        const rec = payload?.record || {}
        const recordId = String(rec?.record_id || row?.job_id?.split(':').slice(1).join(':') || '')
        const prev = existing.get(String(row.job_id))
        const mappedStatus = mapDbStatusToUi(String(row.status || 'pending'))
        const lastStep = (prev?.last_step || 'init') as AutoStep
        return {
          job_id: String(row.job_id || ''),
          queue_name: String(row.queue_name || ''),
          status: mappedStatus,
          record_id: recordId,
          name: String(rec?.NAME || rec?.name || recordId),
          ein: String(rec?.ein || ''),
          batch_id: String(payload?.batch_id || ''),
          source_file: String(payload?.source_file || ''),
          attempt_count: prev?.attempt_count || 0,
          max_attempts: prev?.max_attempts || 3,
          proxy_used: prev?.proxy_used,
          proxy_ip: prev?.proxy_ip,
          last_step: lastStep,
          confirmation_number: prev?.confirmation_number,
          step6_legal_name: prev?.step6_legal_name,
          pdf_path: prev?.pdf_path,
          error_code: prev?.error_code,
          error_message: prev?.error_message,
          artifact_dir: prev?.artifact_dir,
          artifacts: prev?.artifacts,
          steps: inferStepStates(lastStep, mappedStatus, prev?.steps),
          created_at: Number(row.created_at || Date.now() / 1000),
          updated_at: Number(row.updated_at || Date.now() / 1000),
          duration_s: prev?.duration_s,
        }
      })
      setJobs(mapped)
    } catch (err) {
      const errorText = String(err || 'queue:list failed')
      if (queueSyncErrorRef.current !== errorText) {
        queueSyncErrorRef.current = errorText
        const ts = new Date().toLocaleTimeString('vi', { hour12: false })
        setLogs(prev => [...prev.slice(-399), {
          id: crypto.randomUUID(),
          ts,
          level: 'error',
          msg: `[queue-sync] ${errorText}`,
        }])
        showMessage(`Queue sync lỗi: ${errorText}`, 'error')
      }
    }
  }

  const loadResultsFromDisk = useCallback(async () => {
    const ipc = window.electron?.ipcRenderer
    if (!ipc) return
    try {
      const res = await ipc.invoke('irs:results:load')
      if (res?.ok && Array.isArray(res.rows) && res.rows.length > 0) {
        const mapped: ResultRow[] = res.rows.map((r: any) => ({
          record_id: String(r.record_id || ''),
          name: String(r.record_name || r.name || ''),
          ein: String(r.step6_ein || r.confirmation_number || r.ein || ''),
          status: (String(r.status || '').toLowerCase() === 'success' || String(r.status || '').toLowerCase() === 'done') ? 'done' : 'failed',
          confirmation_number: String(r.confirmation_number || '') || undefined,
          error_type: String(r.error_type || '') || undefined,
          error_code: String(r.error_code || '') || undefined,
          error_message: String(r.error_message || '') || undefined,
          last_step: String(r.last_step || '') || undefined,
          proxy_used: String(r.proxy_used || '') || undefined,
          proxy_ip: String(r.proxy_ip || '') || undefined,
          step6_legal_name: String(r.step6_legal_name || '') || undefined,
          step6_name_control: String(r.step6_name_control || '') || undefined,
          step6_phone_number: String(r.step6_phone_number || '') || undefined,
          step6_county: String(r.step6_county || '') || undefined,
          step6_state: String(r.step6_state || '') || undefined,
          step6_start_date: String(r.step6_start_date || '') || undefined,
          step6_principal_activity: String(r.step6_principal_activity || '') || undefined,
          step6_principal_product_service: String(r.step6_principal_product_service || '') || undefined,
          step6_reason_for_applying: String(r.step6_reason_for_applying || '') || undefined,
          step6_physical_location: String(r.step6_physical_location || '') || undefined,
          step6_responsible_name: String(r.step6_responsible_name || '') || undefined,
          step6_responsible_ssn_itin: String(r.step6_responsible_ssn_itin || '') || undefined,
          step6_data_json: String(r.step6_data_json || '') || undefined,
          pdf_path: String(r.pdf_path || r.final_pdf_path || '') || undefined,
          final_pdf_path: String(r.final_pdf_path || r.pdf_path || '') || undefined,
          artifact_dir: String(r.artifact_dir || '') || undefined,
          attempt_count: Number(r.attempt_count || 1),
          started_at: String(r.started_at || '') || undefined,
          completed_at: String(r.ended_at || r.completed_at || '') || undefined,
          batch_id: String(r.batch_id || '') || undefined,
        }))
        _setResults(prev => {
          const map = new Map<string, ResultRow>()
          for (const m of mapped) {
            const k = `${m.batch_id || ''}:${m.record_id}`
            map.set(k, m)
          }
          for (const p of prev) {
            const k = `${p.batch_id || ''}:${p.record_id}`
            if (!map.has(k)) map.set(k, p)
          }
          return Array.from(map.values())
        })
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    loadResultsFromDisk()
  }, [loadResultsFromDisk])

  useEffect(() => {
    if (activeTab === 'results') {
      loadResultsFromDisk()
    }
  }, [activeTab, loadResultsFromDisk])

  useEffect(() => {
    let inFlight = false
    const t = setInterval(async () => {
      if (inFlight) return
      inFlight = true
      try {
        await refreshQueueFromDb()
      } catch {
        // ignore periodic sync errors
      } finally {
        inFlight = false
      }
    }, 1500)
    return () => clearInterval(t)
  }, [])

  const handleCsvImport = useCallback(async (items: Array<{ batchId: string; file: File; rows: Record<string, string>[] }>) => {
    const ipc = window.electron?.ipcRenderer
    const ts = Date.now() / 1000
    const flow = FLOWS.find(f => f.id === activeFlow)!
    const toLocalRecordId = (row: Record<string, string>, idx: number) =>
      row.record_id || row.NAME || row.name || `row-${String(idx + 1).padStart(3, '0')}`
    if (!items.length) return

    if (ipc) {
      try {
        let totalEnqueued = 0
        for (const item of items) {
          const res = await ipc.invoke('irs:import:rows', {
            batchId: item.batchId,
            sourceFileName: item.file.name,
            rows: item.rows,
            queueName: flow.queue,
          })
          if (!res?.ok) {
            showMessage(`Import queue lỗi: ${item.file.name} - ${res?.error || 'unknown error'}`, 'error')
            return
          }
          const enqueued = Number(res?.enqueued || item.rows.length)
          totalEnqueued += enqueued
          setLogs(prev => [...prev, { id: crypto.randomUUID(), ts: new Date().toLocaleTimeString('vi', { hour12: false }), level: 'success', msg: `Imported ${enqueued} records from ${item.file.name} (batch: ${res?.batchId || item.batchId})` }])
        }
        await refreshQueueFromDb()
        if (totalEnqueued <= 0) {
          showMessage('Import xong nhưng không có job nào được enqueue', 'warning')
          setShowCsvModal(false)
          setActiveTab('queue')
          return
        }
        showMessage(`Imported ${totalEnqueued} records from ${items.length} file`)
        setShowCsvModal(false)
        setActiveTab('queue')
        return
      } catch (err) {
        showMessage(`Không enqueue được CSV: ${String(err)}`, 'error')
        return
      }
    }

    const newJobs: Job[] = items.flatMap(({ batchId, file, rows }) => rows.map((row, idx) => ({
      job_id: `${batchId}:${toLocalRecordId(row, idx)}`,
      queue_name: flow.queue,
      status: 'pending' as JobStatus,
      record_id: toLocalRecordId(row, idx),
      name: row.NAME || row.name || toLocalRecordId(row, idx),
      ein: row.ein || '',
      batch_id: batchId,
      source_file: file.name,
      attempt_count: 0,
      max_attempts: 3,
      last_step: 'init' as AutoStep,
      steps: STEP_ORDER.map(s => ({ step: s, status: 'pending' as const })),
      created_at: ts,
      updated_at: ts,
    })))
    setJobs(prev => [...prev, ...newJobs])
    setLogs(prev => [...prev, { id: crypto.randomUUID(), ts: new Date().toLocaleTimeString('vi', { hour12: false }), level: 'success', msg: `Imported ${newJobs.length} records from ${items.length} file(s)` }])
    showMessage(`Imported ${newJobs.length} records from ${items.length} file`)
    setShowCsvModal(false)
    setActiveTab('queue')
  }, [activeFlow])


  const flow = FLOWS.find(f => f.id === activeFlow)!
  const canRun = !flow.locked || forceRunNow || clock.hour >= queueStartHour
  const runWindowLabel = `${String(queueStartHour).padStart(2, '0')}:00`
  const exportBatches = useMemo(() => {
    const byBatch = new Map<string, number>()
    for (const r of results) {
      const b = String(r.batch_id || '').trim()
      if (!b) continue
      const t = new Date(String(r.completed_at || 0)).getTime() || 0
      byBatch.set(b, Math.max(byBatch.get(b) || 0, t))
    }
    return Array.from(byBatch.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([batchId]) => batchId)
  }, [results])

  useEffect(() => {
    if (!exportBatches.length) {
      setSelectedExportBatch('')
      return
    }
    if (!selectedExportBatch || !exportBatches.includes(selectedExportBatch)) {
      setSelectedExportBatch(exportBatches[0])
    }
  }, [exportBatches, selectedExportBatch])

  useEffect(() => {
    const raw = localStorage.getItem(profileKey(activeFlow))
    if (!raw) return
    try {
      const profile = JSON.parse(raw)
      if (Array.isArray(profile?.proxies)) setProxies(profile.proxies)
      if (typeof profile?.globalRotateSecs === 'number') {
        setGlobalRotate(normalizeRotateSeconds(profile.globalRotateSecs))
      }
      if (profile?.proxyAuth) {
        setProxyAuth({
          bearerToken: String(profile.proxyAuth.bearerToken || ''),
          providerUsername: String(profile.proxyAuth.providerUsername || ''),
          providerPassword: String(profile.proxyAuth.providerPassword || ''),
          rotateUrl: String(profile.proxyAuth.rotateUrl || ''),
        })
      }
    } catch {
      // ignore broken profile
    }
  }, [activeFlow])

  useEffect(() => {
    refreshQueueFromDb()
  }, [])

  useEffect(() => {
    localStorage.setItem('fox_proxies', JSON.stringify(proxies))
    localStorage.setItem(profileKey(activeFlow), JSON.stringify({
      profileName: activeFlow,
      savedAt: new Date().toISOString(),
      globalRotateSecs: _globalRotate,
      proxies,
      proxyAuth,
    }))
  }, [activeFlow, proxies, _globalRotate, proxyAuth])

  // ── Real-time IPC listeners ───────────────────────────────────────────────
  useEffect(() => {
    const ipc = window.electron?.ipcRenderer
    if (!ipc) return

    const onPythonLog = (_e: unknown, raw: string) => {
      const msg = raw.trim()
      if (!msg) return
      const ts = new Date().toLocaleTimeString('vi', { hour12: false })
      appendLog({ ts, level: logLevel(msg), msg })
    }

    // Plain log line from Python
    ipc.on('python-log', onPythonLog)

    const onAppUpdateState = (_e: unknown, ev: any) => {
      const next: UpdateState = {
        status: String(ev?.status || 'idle') as UpdateState['status'],
        message: String(ev?.message || 'Chưa kiểm tra'),
        currentVersion: String(ev?.currentVersion || appVersion || ''),
        targetVersion: ev?.targetVersion ? String(ev.targetVersion) : undefined,
        percent: Number.isFinite(Number(ev?.percent)) ? Number(ev.percent) : undefined,
        releaseDate: ev?.releaseDate ? String(ev.releaseDate) : undefined,
        checkedAt: ev?.checkedAt ? String(ev.checkedAt) : undefined,
        error: ev?.error ? String(ev.error) : undefined,
      }
      setUpdateState(next)
      if (next.status === 'available') showMessage(next.message, 'info')
      if (next.status === 'downloaded') showMessage(next.message, 'success')
      if (next.status === 'error') showMessage(next.message, 'error')
    }
    ipc.on('app:update-state', onAppUpdateState)

    // Job picked up from queue → mark as running
    const onJobStarted = (_e: unknown, ev: { job_id: string; record_id: string; batch_id: string; source_file: string; attempt: number }) => {
      const ts = new Date().toLocaleTimeString('vi', { hour12: false })
      setJobs(prev => prev.map(j =>
        j.job_id === ev.job_id
          ? {
            ...j,
            status: 'running',
            attempt_count: ev.attempt,
            last_step: 'init',
            steps: inferStepStates('init', 'running', j.steps).map(s => s.step === 'init' ? { ...s, ts } : s),
            updated_at: Date.now() / 1000,
          }
          : j
      ))
      appendLog({
        ts,
        level: 'info',
        msg: `[${ev.record_id}] job started (attempt ${ev.attempt})`,
        job_id: ev.job_id,
        step: 'init',
      })
    }
    ipc.on('py:job_started', onJobStarted)

    // A step completed/failed → update step in job row + log with proxy IP
    const onStepUpdate = (_e: unknown, ev: { job_id: string; record_id: string; step: string; status: string; note?: string; proxy_code?: string; proxy_ip?: string }) => {
      const ts = new Date().toLocaleTimeString('vi', { hour12: false })
      setJobs(prev => prev.map(j => {
        if (j.job_id !== ev.job_id) return j
        const stepName = (ev.step as AutoStep)
        const base = inferStepStates(stepName, 'running', j.steps)
        const newSteps = base.map(s =>
          s.step === stepName ? { ...s, status: ev.status as JobStep['status'], ts, note: ev.note } : s
        )
        return {
          ...j,
          last_step: stepName,
          proxy_used: ev.proxy_code ?? j.proxy_used,
          proxy_ip: ev.proxy_ip ?? j.proxy_ip,
          steps: newSteps,
          updated_at: Date.now() / 1000,
        }
      }))
      appendLog({
        ts,
        level: ev.status === 'done' ? 'success' : ev.status === 'failed' ? 'error' : 'info',
        msg: `[${ev.record_id}] ${ev.step} → ${ev.status}${ev.note ? `: ${ev.note}` : ''}`,
        job_id: ev.job_id,
        step: ev.step as AutoStep,
        proxy_ip: ev.proxy_ip ? `${ev.proxy_ip} via ${ev.proxy_code}` : undefined,
      })
    }
    ipc.on('py:step_update', onStepUpdate)

    // Job finished → update job status + push into results table
    const onJobComplete = (_e: unknown, ev: {
      job_id: string; record_id: string; batch_id: string; source_file: string;
      record_name?: string; proxy_ip?: string; step6_ein?: string; step6_legal_name?: string; step6_data?: Record<string, unknown>; pdf_path?: string; final_pdf_path?: string;
      status: string; confirmation_number: string; error_type?: string; error_code: string; error_message: string;
      last_step: string; proxy_used: string; attempt_count: number;
      started_at: string; ended_at: string; artifact_dir: string;
    }) => {
      const ts = new Date().toLocaleTimeString('vi', { hour12: false })
      const isDone = ev.status === 'success'
      const finalStatus: JobStatus = isDone ? 'done' : 'failed'
      const step6Data = (ev.step6_data || {}) as Record<string, unknown>
      const step6Text = (key: string) => String(step6Data[key] ?? '')

      const known = jobsRef.current.find(j => j.job_id === ev.job_id)
      const jobName = ev.record_name || known?.name || ev.record_id
      const conf = ev.confirmation_number || ev.step6_ein || undefined
      const artifacts: JobArtifact[] = []
      if (ev.artifact_dir) {
        artifacts.push({
          name: 'result.json',
          path: `${ev.artifact_dir}/result.json`,
          type: 'json',
        })
      }
      const effectivePdfPath = ev.final_pdf_path || ev.pdf_path || ''
      if (effectivePdfPath) {
        const name = effectivePdfPath.split(/[\\/]/).pop() || 'CP_575_G.pdf'
        artifacts.push({ name, path: effectivePdfPath, type: 'pdf' })
      }

      // Update job queue row
      setJobs(prev => prev.map(j =>
        j.job_id === ev.job_id
          ? {
            ...j, status: finalStatus,
            name: jobName,
            last_step: ev.last_step as AutoStep,
            confirmation_number: conf,
            step6_legal_name: ev.step6_legal_name || undefined,
            step6_data: ev.step6_data || undefined,
            error_code: ev.error_code || undefined,
            error_message: ev.error_message || undefined,
            proxy_used: ev.proxy_used,
            proxy_ip: ev.proxy_ip || j.proxy_ip,
            attempt_count: ev.attempt_count,
            artifact_dir: ev.artifact_dir,
            pdf_path: effectivePdfPath || undefined,
            artifacts,
            steps: inferStepStates(ev.last_step as AutoStep, finalStatus, j.steps),
            updated_at: Date.now() / 1000,
            duration_s: ev.started_at && ev.ended_at
              ? Math.round((new Date(ev.ended_at).getTime() - new Date(ev.started_at).getTime()) / 1000) : undefined,
          }
          : j
      ))

      // Push to Results Dashboard
      _setResults(prev => {
        const key = `${ev.batch_id}:${ev.record_id}`
        const without = prev.filter(r => `${r.batch_id}:${r.record_id}` !== key)
        return [...without, {
          record_id: ev.record_id,
          name: jobName, ein: known?.ein || '',
          status: isDone ? 'done' : 'failed',
          confirmation_number: conf,
          error_code: ev.error_code || undefined,
          error_type: ev.error_type || undefined,
          error_message: ev.error_message || undefined,
          last_step: ev.last_step,
          proxy_used: ev.proxy_used,
          proxy_ip: ev.proxy_ip || '',
          step6_legal_name: ev.step6_legal_name || '',
          step6_name_control: step6Text('step6_name_control'),
          step6_phone_number: step6Text('step6_phone_number'),
          step6_county: step6Text('step6_county'),
          step6_state: step6Text('step6_state'),
          step6_start_date: step6Text('step6_start_date'),
          step6_principal_activity: step6Text('step6_principal_activity'),
          step6_principal_product_service: step6Text('step6_principal_product_service'),
          step6_reason_for_applying: step6Text('step6_reason_for_applying'),
          step6_physical_location: step6Text('step6_physical_location'),
          step6_responsible_name: step6Text('step6_responsible_name'),
          step6_responsible_ssn_itin: step6Text('step6_responsible_ssn_itin'),
          step6_data_json: JSON.stringify(ev.step6_data || {}),
          pdf_path: effectivePdfPath,
          artifact_dir: ev.artifact_dir,
          attempt_count: ev.attempt_count,
          started_at: ev.started_at,
          completed_at: ev.ended_at,
          source_file: basename(ev.source_file),
          batch_id: ev.batch_id,
        }]
      })

      if (!isDone && (ev.proxy_used || ev.proxy_ip)) {
        setProxies(prev => prev.map((p: any) => (
          String(p.code || '') === String(ev.proxy_used || '')
            ? { ...p, enabled: false, disabledReason: `failed:${ev.record_id}` }
            : p
        )))
      }

      appendLog({
        ts,
        level: isDone ? 'success' : 'error',
        msg: `[${ev.record_id}] ${isDone ? `✓ confirmed: ${ev.confirmation_number}` : `✕ failed @ ${ev.last_step}: ${ev.error_code}`}`,
        job_id: ev.job_id,
        step: ev.last_step as AutoStep,
      })
      if (!isDone) {
        showMessage(
          `[${ev.record_id}] fail @ ${ev.last_step}${ev.error_type ? ` (${ev.error_type})` : ''}: ${ev.error_code || ev.error_message || 'unknown'}`,
          'error',
        )
      } else {
        const snapshot = jobsRef.current.map(j => (j.job_id === ev.job_id ? { ...j, status: finalStatus } : j))
        const pendingOrRunning = snapshot.filter(j => j.status === 'pending' || j.status === 'running').length
        if (snapshot.length > 0 && pendingOrRunning === 0) {
          const doneCount = snapshot.filter(j => j.status === 'done').length
          const failedCount = snapshot.filter(j => j.status === 'failed').length
          const key = `${ev.batch_id}:${doneCount}:${failedCount}:${snapshot.length}`
          if (batchDoneToastRef.current !== key) {
            batchDoneToastRef.current = key
            showMessage(`Batch done: ${doneCount}/${snapshot.length} success, ${failedCount} fail`)
          }
        }
      }
      setRecentRunNotice({
        recordId: ev.record_id,
        name: jobName,
        status: isDone ? 'done' : 'failed',
        lastStep: ev.last_step as AutoStep,
        at: Date.now(),
      })
      refreshQueueFromDb()
    }
    ipc.on('py:job_complete', onJobComplete)

    // Worker stopped
    const onWorkerStopped = () => {
      setWorkerRunning(false)
      setWorkerStarting(false)
      setWorkerStopping(false)
      showMessage('Worker đã dừng an toàn', 'info')
      refreshQueueFromDb()
      loadResultsFromDisk()
    }
    ipc.on('py:worker-stopped', onWorkerStopped)
    ipc.on('py:worker_exit', onWorkerStopped)
    ipc.on('py:worker_stopped_cleanly', onWorkerStopped)

    const onWorkerStopping = (_e: unknown, payload: any) => {
      setWorkerStopping(true)
      const msg = String(payload?.message || 'Đang chờ các luồng hiện tại hoàn thành trước khi dừng an toàn...')
      showMessage(msg, 'info')
    }
    ipc.on('py:worker_stopping', onWorkerStopping)
    ipc.on('py:worker_graceful_stopping', onWorkerStopping)

    const onSystemStopRequested = (_e: unknown, payload: any) => {
      setWorkerRunning(false)
      setWorkerStarting(false)
      setRunArmed(false)
      const msg = String(payload?.message || 'Hệ thống đã tự động dừng worker')
      showMessage(msg, 'warning')
      refreshQueueFromDb()
    }
    ipc.on('py:system_stop_requested', onSystemStopRequested)

    const onBundleUploadProgress = (_e: unknown, ev: {
      running?: boolean
      percent?: number
      message?: string
      error?: boolean
      current?: number
      total?: number
      folderName?: string
    }) => {
      const running = Boolean(ev?.running)
      const percent = Number.isFinite(Number(ev?.percent)) ? Number(ev?.percent) : undefined
      const message = String(ev?.message || '').trim()
      const current = Number.isFinite(Number(ev?.current)) ? Number(ev?.current) : 0
      const total = Number.isFinite(Number(ev?.total)) ? Number(ev?.total) : 0
      const folderName = String(ev?.folderName || '').trim()
      const localizedMessage = (() => {
        if (uiLanguage === 'en') return message
        if (/^Preparing folder/i.test(message)) return 'Đang chuẩn bị thư mục'
        if (/^Uploading PDF/i.test(message)) return message.replace(/^Uploading PDF/i, 'Đang upload PDF')
        if (/^Building Google Sheet/i.test(message)) return 'Đang tạo Google Sheet'
        if (/^Completed$/i.test(message)) return 'Hoàn tất'
        return message
      })()
      if (running) {
        setBundleUploadRunning(true)
        setBundleUploadPercent(percent !== undefined ? Math.max(0, Math.min(100, Math.round(percent))) : 0)
        setBundleUploadCurrent(current)
        setBundleUploadTotal(total)
        setBundleUploadDetail(localizedMessage)
        setBundleUploadFolderName(folderName)
        setBundleUploadLabel(
          percent !== undefined
            ? `${localizedMessage || (uiLanguage === 'en' ? 'Uploading' : 'Đang upload')} ${Math.max(0, Math.min(100, Math.round(percent)))}%`
            : (localizedMessage || (uiLanguage === 'en' ? 'Uploading...' : 'Đang upload...')),
        )
        return
      }
      if (ev?.error) {
        setBundleUploadRunning(false)
        setBundleUploadPercent(0)
        setBundleUploadCurrent(0)
        setBundleUploadTotal(0)
        setBundleUploadDetail(localizedMessage || (uiLanguage === 'en' ? 'Upload failed' : 'Upload lỗi'))
        setBundleUploadLabel(uiLanguage === 'en' ? 'Upload Selection' : 'Tải lên mục đã chọn')
        return
      }
      setBundleUploadRunning(false)
      setBundleUploadPercent(100)
      setBundleUploadCurrent(total || current)
      setBundleUploadTotal(total || current)
      setBundleUploadDetail(localizedMessage || (uiLanguage === 'en' ? 'Completed' : 'Hoàn tất'))
      if (folderName) setBundleUploadFolderName(folderName)
      setBundleUploadLabel(localizedMessage ? `${localizedMessage} 100%` : (uiLanguage === 'en' ? 'Completed 100%' : 'Hoàn tất 100%'))
    }
    ipc.on('bundle-upload-progress', onBundleUploadProgress)

    ipc.invoke('irs:worker:status').then((res: any) => {
      if (res?.ok) {
        setWorkerRunning(Boolean(res.running))
        if (res.running) setWorkerStarting(false)
      }
    }).catch(() => {
      // ignore
    })

    return () => {
      ipc.removeListener('python-log', onPythonLog)
      ipc.removeListener('app:update-state', onAppUpdateState)
      ipc.removeListener('py:job_started', onJobStarted)
      ipc.removeListener('py:step_update', onStepUpdate)
      ipc.removeListener('py:job_complete', onJobComplete)
      ipc.removeListener('py:worker-stopped', onWorkerStopped)
      ipc.removeListener('py:system_stop_requested', onSystemStopRequested)
      ipc.removeListener('bundle-upload-progress', onBundleUploadProgress)
    }
  }, [uiLanguage])

  useEffect(() => {
    if (activeTab === 'logs' && logRef.current)
      logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs, activeTab])

  const scopedJobs = jobs.filter(j => j.queue_name === flow.queue)
  const otherQueuePending = jobs.filter(j => j.queue_name !== flow.queue && j.status === 'pending').length
  const stats = {
    total: scopedJobs.length,
    pending: scopedJobs.filter(j => j.status === 'pending').length,
    running: scopedJobs.filter(j => j.status === 'running').length,
    done: scopedJobs.filter(j => j.status === 'done').length,
    failed: scopedJobs.filter(j => j.status === 'failed').length,
  }
  const runningJobs = [...scopedJobs]
    .filter(j => j.status === 'running')
    .sort((a, b) => (b.updated_at || b.created_at) - (a.updated_at || a.created_at))
  const runningNow = runningJobs[0]
  const runningModeLabel = uiLanguage === 'en'
    ? (runningJobs.length > 1 ? `Running Multi (${runningJobs.length})` : runningJobs.length === 1 ? 'Running' : 'Idle')
    : (runningJobs.length > 1 ? `Đang chạy nhiều (${runningJobs.length})` : runningJobs.length === 1 ? 'Đang chạy' : 'Rảnh')
  const getJobProgress = (job: Job) => {
    const done = job.steps.filter(s => ['done', 'failed', 'skipped'].includes(s.status)).length
    const total = Math.max(1, job.steps.length || STEP_ORDER.length)
    const pct = Math.max(0, Math.min(100, Math.round((done / total) * 100)))
    const heartbeatSec = Math.max(0, Math.floor((uiNowMs - Math.round((job.updated_at || job.created_at) * 1000)) / 1000))
    const looksStale = heartbeatSec >= 180
    return { done, total, pct, heartbeatSec, looksStale }
  }
  const showingRecentNotice = !runningNow && !!recentRunNotice && (Date.now() - recentRunNotice.at < 4500)
  const miniQueueEmpty = runningJobs.length === 0 && !showingRecentNotice && stats.pending === 0 && otherQueuePending === 0
  useEffect(() => {
    if (miniQueueEmpty) setMiniRunCollapsed(true)
    else if (runningJobs.length > 0 || stats.pending > 0) setMiniRunCollapsed(false)
  }, [miniQueueEmpty, runningJobs.length, stats.pending])
  const finished = stats.done + stats.failed
  const progressPct = stats.total > 0 ? Math.max(0, Math.min(100, Math.round((finished / stats.total) * 100))) : 0
  const doneInFinishedPct = finished > 0 ? Math.round((stats.done / finished) * 100) : 0
  const failedInFinishedPct = finished > 0 ? Math.max(0, 100 - doneInFinishedPct) : 0
  const runningPct = stats.total > 0 ? Math.round((stats.running / stats.total) * 100) : 0

  const sortedJobs = [...jobs]
    .filter(j => queueBatchFilter === 'all' || j.batch_id === queueBatchFilter)
    .filter(j => jobFilter === 'all' || j.status === jobFilter)
    .sort((a, b) => {
      const s = (st: string) => ({ running: 4, pending: 3, failed: 2, done: 1 }[st] || 0)
      return s(b.status) - s(a.status) || b.created_at - a.created_at
    })
  const queueBatchOptions = Array.from(new Set(jobs.map(j => String(j.batch_id || '').trim()).filter(Boolean))).sort()
  useEffect(() => {
    if (queueBatchFilter !== 'all' && !queueBatchOptions.includes(queueBatchFilter)) {
      setQueueBatchFilter('all')
    }
  }, [queueBatchFilter, queueBatchOptions])

  const filteredLogs = logFilter === 'all' ? logs : logs.filter(l => l.level === logFilter)
  const selectedInView = sortedJobs.filter(j => selectedJobIds.has(j.job_id))
  const allSelectedInView = sortedJobs.length > 0 && selectedInView.length === sortedJobs.length

  const levelCls = (l: LogLine['level']) => ({
    info: 'text-text/50',
    success: 'text-success',
    error: 'text-danger',
    warning: 'text-warning',
  }[l])

  const copyLogs = useCallback(() => {
    navigator.clipboard.writeText(filteredLogs.map(l => `[${l.ts}][${l.level.toUpperCase()}] ${l.msg}`).join('\n'))
    showMessage(`Đã copy ${filteredLogs.length} dòng log`, 'info')
  }, [filteredLogs])

  const openExternalUrl = useCallback((url: string) => {
    const target = String(url || '').trim()
    if (!target) return
    window.open(target, '_blank', 'noopener,noreferrer')
  }, [])

  const toggleSelectJob = (jobId: string, checked: boolean) => {
    setSelectedJobIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(jobId)
      else next.delete(jobId)
      return next
    })
  }

  const toggleSelectAllJobsInView = (checked: boolean) => {
    setSelectedJobIds(prev => {
      const next = new Set(prev)
      sortedJobs.forEach(j => {
        if (checked) next.add(j.job_id)
        else next.delete(j.job_id)
      })
      return next
    })
  }

  const openOutputFolder = useCallback(async () => {
    const ipc = window.electron?.ipcRenderer
    if (!ipc) return
    const base = (storageDir || userDataPath || '').trim()
    const outPath = base ? `${base}${base.endsWith('\\') || base.endsWith('/') ? '' : '/'}outputs` : ''
    const target = outPath || base
    if (!target) {
      showMessage('Không xác định được output folder', 'error')
      return
    }
    const res = await ipc.invoke('irs:open-path', { path: target, reveal: true })
    if (res?.ok === false) {
      showMessage(`Mở output folder lỗi: ${res?.error || 'unknown'}`, 'error')
      return
    }
    showMessage('Đã mở thư mục output', 'info')
  }, [storageDir, userDataPath])

  const quickExportStyled = useCallback(async (batchIdRaw: string, reportType: 'report' | 'failures' = 'report') => {
    const ipc = window.electron?.ipcRenderer
    if (!ipc) return
    const batchId = String(batchIdRaw || '').trim()
    if (!batchId) {
      showMessage('Không có batch để export', 'warning')
      return
    }
    const res = await ipc.invoke('irs:report:export-annotated', { batchId, format: 'xlsx', type: reportType })
    if (!res?.ok) {
      showMessage(`Export report lỗi: ${res?.error || 'unknown'}`, 'error')
      return
    }
    const path = String(res.preferred_path || res.xlsx_path || res.csv_path || '')
    if (path) await ipc.invoke('irs:open-path', { path, reveal: true })
    showMessage(`Đã export ${reportType === 'failures' ? 'fail' : 'report'} XLSX: ${batchId}`)
  }, [])

  const quickExportSelectedStyled = useCallback(async (rows: ResultRow[], reportType: 'report' | 'failures' = 'report') => {
    const ipc = window.electron?.ipcRenderer
    if (!ipc) return
    const selectedRows = Array.isArray(rows) ? rows : []
    if (!selectedRows.length) {
      showMessage('Không có selected rows để export report', 'warning')
      return
    }
    const uniqueBatches = Array.from(new Set(selectedRows.map((r) => String(r.batch_id || '').trim()).filter(Boolean)))
    const batchToken = uniqueBatches.length === 1 ? uniqueBatches[0] : 'mixed'
    const res = await ipc.invoke('irs:report:export-selected', {
      rows: selectedRows,
      batchId: batchToken,
      format: 'xlsx',
      type: reportType,
    })
    if (!res?.ok) {
      showMessage(`Export selected report lỗi: ${res?.error || 'unknown'}`, 'error')
      return
    }
    const path = String(res.preferred_path || res.xlsx_path || res.csv_path || '')
    if (path) await ipc.invoke('irs:open-path', { path, reveal: true })
    showMessage(`Đã export selected ${reportType} XLSX: ${res.rows || selectedRows.length} rows`)
  }, [])

  const quickExportSelectedStyledNext = useCallback(async (rows: ResultRow[], reportType: 'report' | 'failures' = 'report') => {
    const ipc = window.electron?.ipcRenderer
    if (!ipc) return
    if (bundleUploadRunning) return
    const selectedRows = Array.isArray(rows) ? rows : []
    if (!selectedRows.length) {
      showMessage('Không có dòng nào được chọn để upload', 'warning')
      return
    }
    const uniqueBatches = Array.from(new Set(selectedRows.map((r) => String(r.batch_id || '').trim()).filter(Boolean)))
    const batchToken = uniqueBatches.length === 1 ? uniqueBatches[0] : 'mixed'
    setBundleUploadRunning(true)
    setBundleUploadPercent(0)
    setBundleUploadCurrent(0)
    setBundleUploadTotal(selectedRows.length)
    setBundleUploadDetail('Đang chuẩn bị upload...')
    setBundleUploadFolderName('')
    setBundleUploadFolderUrl('')
    setBundleUploadReportUrl('')
    setBundleUploadLabel(uiLanguage === 'en' ? 'Uploading 0%' : 'Đang tải lên 0%')
    try {
      const res = await ipc.invoke('irs:bundle:upload-next', {
        rows: selectedRows,
        batchId: batchToken,
        type: reportType,
        nextOnly: false,
      })
      if (!res?.ok) {
        showMessage(`Upload selected lỗi: ${res?.error || 'unknown'}`, 'error')
        return
      }
      setBundleUploadFolderUrl(String(res?.google_drive?.folder_url || ''))
      setBundleUploadReportUrl(String(res?.google_drive?.report_url || ''))
      setBundleUploadLabel(uiLanguage === 'en' ? 'Opening...' : 'Đang mở...')
      const path = String(res.folder || res.preferred_path || res.local_report_path || '')
      if (path) await ipc.invoke('irs:open-path', { path, reveal: true })
      const part = Number(res.part || 0)
      const skipped = Number(res.skipped_duplicates || 0)
      const partText = part > 0 ? ` part ${part}` : ''
      showMessage(`Đã upload phần đã chọn${partText}: ${res.rows || selectedRows.length} dòng${skipped ? ` (trùng ${skipped})` : ''}`)
    } finally {
      setBundleUploadRunning(false)
      setBundleUploadLabel(uiLanguage === 'en' ? 'Upload Selection' : 'Tải lên mục đã chọn')
    }
  }, [bundleUploadRunning])

  const applyRuntimeConfig = useCallback(async (override?: Partial<{ proxies: any[]; globalRotateSecs: number; bearerToken: string; providerUsername: string; providerPassword: string; rotateUrl: string; flowMode: FlowMode; browserMode: BrowserMode; forceRunNow: boolean }>) => {
    const ipc = window.electron?.ipcRenderer
    if (!ipc) return { ok: false, error: 'IPC unavailable' }
    const effectiveProxies = (override?.proxies && override.proxies.length > 0)
      ? override.proxies
      : (proxies && proxies.length > 0
          ? proxies
          : (() => {
              try {
                const raw = localStorage.getItem('fox_proxies')
                return raw ? JSON.parse(raw) : []
              } catch {
                return []
              }
            })())
    return ipc.invoke('irs:apply-runtime-config', {
      flowMode: override?.flowMode || activeFlow,
      proxies: effectiveProxies,
      globalRotateSecs: normalizeRotateSeconds(
        Number.isFinite(Number(override?.globalRotateSecs)) ? Number(override?.globalRotateSecs) : _globalRotate,
      ),
      bearerToken: override?.bearerToken ?? proxyAuth.bearerToken ?? '',
      providerUsername: override?.providerUsername ?? proxyAuth.providerUsername ?? '',
      providerPassword: override?.providerPassword ?? proxyAuth.providerPassword ?? '',
      rotateUrl: override?.rotateUrl ?? proxyAuth.rotateUrl ?? '',
      queueTimezone,
      queueCountry,
      queueStartHour,
      forceRunNow: override?.forceRunNow ?? forceRunNow,
      browserMode: override?.browserMode || browserMode,
    })
  }, [activeFlow, proxies, _globalRotate, proxyAuth, queueTimezone, queueCountry, queueStartHour, forceRunNow, browserMode])

  const saveRuntimeSettings = useCallback(async () => {
    const ipc = window.electron?.ipcRenderer
    if (!ipc) return
    const setRes = await ipc.invoke('irs:settings:set-runtime', {
      queueTimezone,
      queueCountry,
      queueStartHour,
      forceRunNow,
    })
    if (!setRes?.ok) {
      showMessage(`Lưu runtime settings lỗi: ${setRes?.error || 'unknown'}`, 'error')
      return
    }
    const applyRes = await applyRuntimeConfig()
    if (!applyRes?.ok) {
      showMessage(`Apply config lỗi: ${applyRes?.error || 'unknown'}`, 'error')
      return
    }
    showMessage('Đã lưu Runtime + Queue Window settings')
  }, [queueTimezone, queueCountry, queueStartHour, forceRunNow, applyRuntimeConfig])

  const runProxyHealthCheck = useCallback(async (proxy: any) => {
    const ipc = window.electron?.ipcRenderer
    if (!ipc) return
    const key = String(proxy.id || proxy.code || `${proxy.host}:${proxy.port}`)
    const res = await ipc.invoke('irs:proxy:healthcheck', {
      host: String(proxy.host || ''),
      port: Number(proxy.port || 0),
      username: String(proxy.username || ''),
      password: String(proxy.password || ''),
      timeoutMs: 8000,
    })
    setProxyHealth(prev => ({
      ...prev,
      [key]: {
        ok: Boolean(res?.ok),
        latencyMs: Number(res?.latencyMs || 0),
        checkedAt: Date.now(),
        irsStatusCode: Number.isFinite(Number(res?.irsStatusCode)) ? Number(res.irsStatusCode) : undefined,
        resultKind: String(res?.resultKind || (res?.ok ? 'proxy_ok' : 'target_error')) as any,
        error: res?.ok ? undefined : String(res?.error || 'healthcheck failed'),
      },
    }))
    if (res?.ok) {
      showMessage(`Proxy ${String(proxy.code || key)} OK (${Number(res?.latencyMs || 0)}ms)`, 'success')
    } else {
      showMessage(`Proxy ${String(proxy.code || key)} fail: ${String(res?.error || 'healthcheck failed')}`, 'warning')
    }
  }, [])

  const runAllProxyHealthChecks = useCallback(async () => {
    if (!proxies.length) {
      showMessage('Chưa có proxy để health check', 'warning')
      return
    }
    for (const proxy of proxies) {
      // keep this sequential to avoid opening too many sockets at once
      // and to preserve deterministic order in UI updates.
      await runProxyHealthCheck(proxy)
    }
    showMessage(`Đã health check ${proxies.length} proxy`, 'info')
  }, [proxies, runProxyHealthCheck])

  useEffect(() => {
    if (!runArmed || workerRunning || workerStarting || !canRun) return
    const ipc = window.electron?.ipcRenderer
    if (!ipc) return
    let cancelled = false
    ;(async () => {
      try {
        setWorkerStarting(true)
        const applyRes = await applyRuntimeConfig()
        if (!applyRes?.ok) {
          setWorkerStarting(false)
          showMessage(`Không apply runtime config được: ${applyRes?.error || 'unknown'}`, 'error')
          setRunArmed(false)
          return
        }
        const startRes = await ipc.invoke('irs:worker:start')
        if (cancelled) return
        if (!startRes?.ok) {
          setWorkerStarting(false)
          showMessage(`Không auto-start được worker: ${startRes?.error || 'unknown'}`, 'error')
          setRunArmed(false)
          return
        }
        setWorkerRunning(true)
        setWorkerStarting(false)
        setRunArmed(false)
        await refreshQueueFromDb()
        showMessage('Đã auto start worker đúng khung giờ', 'success')
      } catch (err) {
        if (!cancelled) {
          setWorkerStarting(false)
          showMessage(`Auto-start lỗi: ${String(err)}`, 'error')
          setRunArmed(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [runArmed, workerRunning, workerStarting, canRun, applyRuntimeConfig])

  return (
    <>
      <AppShell>
        {/* Sidebar */}
        <SidebarPrimary
          topItems={[
            {
              id: 'work',
              icon: <LayoutDashboard className="w-3.5 h-3.5" />,
              tooltip: 'Workspace',
              isActive: workspacePage === 'work',
              onClick: () => setWorkspacePage('work'),
            },
            {
              id: 'proxy_manager',
              icon: <Shield className="w-3.5 h-3.5" />,
              tooltip: 'Proxy Manager',
              isActive: workspacePage === 'proxy_manager',
              onClick: () => setWorkspacePage('proxy_manager')
            },
            {
              id: 'settings',
              icon: <Settings className="w-3.5 h-3.5" />,
              tooltip: 'Settings',
              isActive: workspacePage === 'settings',
              onClick: () => setWorkspacePage('settings')
            }
          ]}
          bottomItems={[
            {
              id: activeFlow,
              icon: <span className={FLOWS.find(f => f.id === activeFlow)?.color || 'text-muted'}>{FLOWS.find(f => f.id === activeFlow)?.icon}</span>,
              tooltip: `Mode: ${FLOWS.find(f => f.id === activeFlow)?.label || activeFlow}`,
              onClick: () => setWorkspacePage('work')
            }
          ]}
        />

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">

          {/* Header bar */}
          <div className="flex items-center gap-2 px-3 h-[46px] border-b border-border bg-panel shrink-0 min-w-0">
            {/* Left section: Title & Flow Mode */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-muted/40 text-[11px] hidden sm:inline">IRS Auto</span>
              <ChevronRight className="w-3 h-3 text-muted/30 hidden sm:inline" />
              <div className="flex items-center gap-1.5 bg-surface border border-border rounded-lg px-2 py-1">
                <span className="text-[10px] text-muted uppercase font-medium">Mode</span>
                <select
                  value={activeFlow}
                  onChange={(e) => setActiveFlow(e.target.value as FlowMode)}
                  className="h-6 bg-panel border border-border rounded px-1.5 text-[11px] text-text font-medium cursor-pointer"
                >
                  {FLOWS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </div>
            </div>

            {/* Middle section: Action tools (scrollable if screen is narrow, never overflows outside window) */}
            <div className="flex-1 flex items-center justify-end gap-1.5 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-0.5">
              {!canRun && (
                <div className="flex items-center gap-1 px-2 py-0.5 bg-warning/5 border border-warning/20 rounded-md text-[10px] text-warning font-medium shrink-0" title={`Main starts at ${runWindowLabel} (${queueTimezone})`}>
                  <AlarmClock className="w-3 h-3 shrink-0" />
                  <span className="hidden md:inline">Starts</span> {runWindowLabel}
                </div>
              )}
              <Button
                variant={forceRunNow ? 'primary' : 'secondary'}
                className="h-7 shrink-0 text-[11px] gap-1 px-2.5 pointer-events-auto"
                title={forceRunNow ? `Đang bỏ qua mốc ${runWindowLabel}, có thể chạy ngay` : `Bật để chạy ngay, không chờ mốc ${runWindowLabel}`}
                onClick={async () => {
                  const next = !forceRunNow
                  setForceRunNow(next)
                  const ipc = window.electron?.ipcRenderer
                  if (ipc) {
                    const res = await ipc.invoke('irs:settings:set-runtime', {
                      queueTimezone,
                      queueCountry,
                      queueStartHour,
                      forceRunNow: next,
                    })
                    if (!res?.ok) {
                      setForceRunNow(!next)
                      showMessage(`Lưu toggle run ngay lỗi: ${res?.error || 'unknown'}`, 'error')
                      return
                    }
                  }
                  showMessage(next ? `Đã bật Run ngay: bỏ qua mốc ${runWindowLabel}` : `Đã bật lại chờ mốc ${runWindowLabel}`, 'info')
                }}
              >
                {forceRunNow
                  ? <><Zap className="w-3 h-3" /><span>Run Ngay</span></>
                  : <><AlarmClock className="w-3 h-3" /><span>Chờ {runWindowLabel}</span></>}
              </Button>
              <div className="flex items-center gap-1 px-2 py-1 border border-border rounded-lg bg-surface text-[10px] shrink-0" title={`Múi giờ: ${queueTimezone}`}>
                <Clock className="w-3 h-3 text-accent shrink-0" />
                <span className="font-semibold text-text tabular-nums">{clock.timeLabel}</span>
              </div>
              <Button
                variant={browserMode === 'browser' ? 'primary' : 'secondary'}
                className="h-7 shrink-0 text-[11px] gap-1 px-2 pointer-events-auto"
                title={browserMode === 'browser' ? 'Đang hiện browser (headful)' : 'Đang chạy ẩn (headless)'}
                onClick={async () => {
                  if (workerRunning) {
                    showMessage('Hãy Stop worker trước khi đổi chế độ Browser/Silent', 'warning')
                    return
                  }
                  const next: BrowserMode = browserMode === 'browser' ? 'silent' : 'browser'
                  setBrowserMode(next)
                  const applyRes = await applyRuntimeConfig({ browserMode: next })
                  if (!applyRes?.ok) {
                    showMessage(`Apply config lỗi: ${applyRes?.error || 'unknown'}`, 'error')
                    return
                  }
                  showMessage(next === 'browser' ? 'Đã bật Browser mode (hiện trình duyệt)' : 'Đã bật Silent mode (headless)', 'info')
                }}
              >
                {browserMode === 'browser'
                  ? <><Monitor className="w-3 h-3" /><span>Browser</span></>
                  : <><Ghost className="w-3 h-3" /><span>Silent</span></>}
              </Button>
              <Button variant="secondary" className="h-7 shrink-0 text-[11px] gap-1 px-2 pointer-events-auto" onClick={() => setWorkspacePage('proxy_manager')} title="Quản lý Proxy">
                <Shield className="w-3 h-3" />Proxy
              </Button>
              <Button variant="secondary" className="h-7 shrink-0 text-[11px] gap-1 px-2 pointer-events-auto" onClick={() => setShowCsvModal(true)} title="Import danh sách CSV">
                <Upload className="w-3 h-3" />CSV
              </Button>
              <Button
                variant="secondary"
                className="h-7 shrink-0 text-[11px] gap-1 px-2 pointer-events-auto"
                title="Export kết quả marked output ra Excel/CSV"
                onClick={async () => {
                  const ipc = window.electron?.ipcRenderer
                  if (!ipc) return
                  const batchId = (selectedExportBatch || exportBatches[0] || '').trim()
                  if (!batchId) {
                    showMessage('Chưa có batch nào để export marked output', 'error')
                    return
                  }
                  const res = await ipc.invoke('irs:report:export-annotated', { batchId, format: 'xlsx' })
                  if (!res?.ok) {
                    showMessage(`Export marked output lỗi: ${res?.error || 'unknown'}`, 'error')
                    return
                  }
                  const path = String(res.preferred_path || res.xlsx_path || res.csv_path || '')
                  if (path) await ipc.invoke('irs:open-path', { path, reveal: true })
                  showMessage(`Đã export marked output batch ${batchId}: ${res.rows || 0} rows`)
                }}
              >
                <FileText className="w-3 h-3" />Export
              </Button>
              <select
                value={selectedExportBatch}
                onChange={(e) => setSelectedExportBatch(e.target.value)}
                className="h-7 w-28 lg:w-40 shrink-0 bg-surface border border-border rounded px-1.5 text-[10px] text-muted pointer-events-auto"
                title="Batch dùng để export marked output"
              >
                {!exportBatches.length ? (
                  <option value="">No batch</option>
                ) : exportBatches.map((batchId) => (
                  <option key={batchId} value={batchId}>{batchId}</option>
                ))}
              </select>
            </div>

            {/* Pinned Right section: Always visible, never pushed out */}
            <div className="flex items-center gap-1.5 shrink-0 pl-1.5 border-l border-border/80 z-20 pointer-events-auto">
              <div className="flex items-center gap-1 px-1.5 py-0.5 border border-border rounded-lg bg-surface shrink-0" title="Số luồng worker (chạy song song)">
                <Users className="w-3.5 h-3.5 text-accent" />
                <select
                  value={workerCount}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setWorkerCount(v)
                    if (!workerRunning) {
                      window.electron?.ipcRenderer?.invoke('irs:settings:set-runtime', {
                        queueTimezone,
                        queueCountry,
                        queueStartHour,
                        forceRunNow,
                        workerCount: v,
                      })
                    }
                  }}
                  disabled={workerRunning}
                  className="h-6 bg-panel border-0 rounded px-1 text-[11px] text-text font-semibold tabular-nums cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n}×</option>)}
                </select>
              </div>
              <Button
                variant={workerStopping ? 'secondary' : (workerRunning ? 'danger' : (!canRun ? 'secondary' : 'primary'))}
                disabled={workerStarting}
                className={`relative z-20 h-7 shrink-0 text-[11px] gap-1.5 px-3 pointer-events-auto ${workerStopping ? 'border-amber-500/50 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 animate-pulse' : ''}`}
                title={workerStopping ? 'Đang dừng an toàn... Bấm để buộc dừng ngay lập tức' : (workerRunning ? 'Bấm để dừng an toàn sau khi hoàn thành hồ sơ đang chạy' : 'Bắt đầu worker')}
                onClick={async () => {
                  const ipc = window.electron?.ipcRenderer
                  if (!ipc || workerStarting) return
                  try {
                    if (workerStopping) {
                      await ipc.invoke('irs:worker:stop', { force: true })
                      setWorkerRunning(false)
                      setWorkerStopping(false)
                      setRunArmed(false)
                      await refreshQueueFromDb()
                      await loadResultsFromDisk()
                      showMessage('Đã buộc dừng toàn bộ tiến trình ngay lập tức', 'warning')
                    } else if (workerRunning) {
                      setWorkerStopping(true)
                      showMessage('Đang dừng an toàn: Hệ thống sẽ không nhận thêm hồ sơ mới và đợi các luồng hiện tại hoàn thành.', 'info')
                      await ipc.invoke('irs:worker:stop', { force: false })
                      setWorkerRunning(false)
                      setWorkerStopping(false)
                      setRunArmed(false)
                      await refreshQueueFromDb()
                      await loadResultsFromDisk()
                      showMessage('Toàn bộ luồng đã hoàn tất an toàn và dừng hẳn', 'success')
                    } else if (!canRun) {
                      setRunArmed((prev) => {
                        const next = !prev
                        showMessage(next ? `Ready start at ${runWindowLabel} (${queueTimezone})` : 'Đã hủy ready start', 'info')
                        return next
                      })
                    } else {
                      setWorkerStarting(true)
                      await ipc.invoke('irs:settings:set-runtime', {
                        queueTimezone,
                        queueCountry,
                        queueStartHour,
                        forceRunNow,
                        workerCount,
                      })
                      const applyRes = await applyRuntimeConfig()
                      if (!applyRes?.ok) {
                        setWorkerStarting(false)
                        showMessage(`Không apply runtime config được: ${applyRes?.error || 'unknown'}`, 'error')
                        return
                      }
                      const startRes = await ipc.invoke('irs:worker:start')
                      if (!startRes?.ok) {
                        setWorkerStarting(false)
                        showMessage(`Không start được worker: ${startRes?.error || 'unknown'}`, 'error')
                        return
                      }
                      setWorkerRunning(true)
                      setWorkerStarting(false)
                      setRunArmed(false)
                      await refreshQueueFromDb()
                      showMessage('Worker đã chạy')
                    }
                  } catch (err) {
                    setWorkerStarting(false)
                    setWorkerStopping(false)
                    showMessage(`Worker action lỗi: ${String(err)}`, 'error')
                  }
                }}>
                {workerStarting
                  ? <><Loader2 className="w-3 h-3 animate-spin" />Starting</>
                  : workerStopping
                  ? <><Square className="w-3 h-3 animate-pulse text-amber-300" />Dừng an toàn... (Force?)</>
                  : workerRunning
                  ? <><Square className="w-3 h-3" />Safe Stop</>
                  : !canRun
                    ? (runArmed
                      ? <><CheckCircle2 className="w-3 h-3" />Armed {runWindowLabel}</>
                      : <><AlarmClock className="w-3 h-3" />Ready Start</>)
                    : <><Play className="w-3 h-3" />Run</>}
              </Button>
            </div>
          </div>

          {workspacePage !== 'work' ? (
            <div className="flex-1 min-h-0 overflow-auto p-4">
              {workspacePage === 'proxy_manager' ? (
                <div className="rounded-2xl border border-border bg-panel p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Shield className="w-4 h-4 text-accent" />
                    <h2 className="text-sm font-semibold">{uiLanguage === 'en' ? 'Proxy Manager' : 'Quản lý proxy'}</h2>
                    <div className="ml-auto flex items-center gap-2">
                      <Button variant="secondary" size="xs" onClick={() => setShowProxyModal(true)}>{uiLanguage === 'en' ? 'Edit Pool' : 'Sửa pool'}</Button>
                      <Button variant="secondary" size="xs" onClick={runAllProxyHealthChecks}>{uiLanguage === 'en' ? 'Check All Health' : 'Kiểm tra tất cả'}</Button>
                    </div>
                  </div>
                  <div className="overflow-auto rounded-xl border border-border">
                    <table className="w-full text-[11px]">
                      <thead className="bg-surface border-b border-border">
                        <tr>
                          <th className="text-left px-3 py-2">Code</th>
                          <th className="text-left px-3 py-2">Host</th>
                          <th className="text-left px-3 py-2">Port</th>
                          <th className="text-left px-3 py-2">User</th>
                          <th className="text-left px-3 py-2">{uiLanguage === 'en' ? 'Status' : 'Trạng thái'}</th>
                          <th className="text-left px-3 py-2">{uiLanguage === 'en' ? 'Latency' : 'Độ trễ'}</th>
                          <th className="text-left px-3 py-2">{uiLanguage === 'en' ? 'Checked' : 'Đã check'}</th>
                          <th className="text-left px-3 py-2">{uiLanguage === 'en' ? 'Action' : 'Thao tác'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {proxies.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="px-3 py-8 text-center text-muted">{uiLanguage === 'en' ? 'No proxy configured' : 'Chưa có proxy'}</td>
                          </tr>
                        ) : proxies.map((p: any) => {
                          const key = String(p.id || p.code || `${p.host}:${p.port}`)
                          const h = proxyHealth[key]
                          return (
                            <tr key={key} className="border-b border-border/40 last:border-b-0">
                              <td className="px-3 py-2 font-mono">{String(p.code || key)}</td>
                              <td className="px-3 py-2 font-mono">{String(p.host || '')}</td>
                              <td className="px-3 py-2 font-mono">{String(p.port || '')}</td>
                              <td className="px-3 py-2 font-mono">{String(p.username || '')}</td>
                              <td className="px-3 py-2">
                                {!h ? (
                                  <span className="text-muted">{uiLanguage === 'en' ? 'unknown' : 'chưa rõ'}</span>
                                ) : h.ok ? (
                                  <span className="text-success">{uiLanguage === 'en' ? 'Proxy OK' : 'Proxy OK'}</span>
                                ) : h.resultKind === 'target_blocked_403' ? (
                                  <span className="text-warning">{uiLanguage === 'en' ? 'Target blocked (403)' : 'Target chặn (403)'}</span>
                                ) : h.resultKind === 'proxy_auth_error' ? (
                                  <span className="text-danger">{uiLanguage === 'en' ? 'Proxy auth error' : 'Sai auth proxy'}</span>
                                ) : h.resultKind === 'proxy_error' ? (
                                  <span className="text-danger">{uiLanguage === 'en' ? 'Proxy error' : 'Lỗi proxy'}</span>
                                ) : (
                                  <span className="text-danger">{uiLanguage === 'en' ? 'Target error' : 'Lỗi target'}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 font-mono">{h?.latencyMs ? `${h.latencyMs}ms` : '—'}</td>
                              <td className="px-3 py-2 text-muted">{h?.checkedAt ? new Date(h.checkedAt).toLocaleTimeString('vi-VN', { hour12: false }) : '—'}</td>
                              <td className="px-3 py-2">
                                <button className="text-accent hover:underline" onClick={() => runProxyHealthCheck(p)}>{uiLanguage === 'en' ? 'Check' : 'Kiểm tra'}</button>
                                {h?.error && <span className="ml-2 text-danger text-[10px]">{h.error}</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className={`w-full max-w-[980px] rounded-xl overflow-hidden ${themeMode === 'light'
                  ? 'border border-[#d1d5db] bg-white shadow-[0_8px_22px_rgba(17,24,39,0.10)]'
                  : 'border border-border/60 bg-panel shadow-[0_10px_28px_rgba(0,0,0,0.26)]'
                }`}>
                  <div className={`px-4 py-3 border-b ${themeMode === 'light'
                    ? 'border-[#e5e7eb] bg-gradient-to-r from-sky-50 via-white to-emerald-50'
                    : 'border-border/60 bg-gradient-to-r from-accent/15 via-transparent to-success/10'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-accent/20 border border-accent/30 flex items-center justify-center">
                        <Settings className="w-4 h-4 text-accent" />
                      </div>
                      <div>
                        <h2 className="text-sm font-semibold tracking-tight">{uiLanguage === 'en' ? 'System Settings' : 'Thiết lập hệ thống'}</h2>
                        <div className={`text-[11px] mt-0.5 ${themeMode === 'light' ? 'text-[#4b5563]' : 'text-muted'}`}>{uiLanguage === 'en' ? 'Runtime, schedules, storage, language, and interface preferences.' : 'Thiết lập runtime, lịch chạy, storage, ngôn ngữ và tuỳ chọn giao diện.'}</div>
                      </div>
                      <div className="ml-auto flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md text-[9px] uppercase tracking-wider bg-success/15 text-success">Live</span>
                        <span className="px-2 py-0.5 rounded-md text-[9px] uppercase tracking-wider bg-accent/15 text-accent">Desktop</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="space-y-3">
                      <div className={`rounded-xl p-3 ${themeMode === 'light'
                        ? 'border border-[#bfdbfe] bg-gradient-to-b from-sky-50 to-white'
                        : 'border border-accent/30 bg-gradient-to-b from-accent/15 to-transparent'
                      }`}>
                        <div className="text-[10px] uppercase text-accent/80 font-semibold tracking-wider mb-1">{uiLanguage === 'en' ? 'Runtime Clock' : 'Đồng hồ runtime'}</div>
                        <div className="text-[34px] font-semibold tabular-nums leading-tight">{clock.timeLabel}</div>
                        <div className={`text-[11px] mt-2 ${themeMode === 'light' ? 'text-[#4b5563]' : 'text-muted'}`}>{queueTimezone} · {queueCountry}</div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button onClick={() => { setQueueTimezone('Asia/Ho_Chi_Minh'); setQueueCountry('VN') }} className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${themeMode === 'light' ? 'border-[#d1d5db] bg-white text-[#111827] hover:border-[#60a5fa] hover:text-[#0369a1]' : 'border-border bg-surface hover:border-accent/40 hover:text-accent'}`}>{uiLanguage === 'en' ? 'Vietnam' : 'Việt Nam'}</button>
                          <button onClick={() => { setQueueTimezone('America/New_York'); setQueueCountry('US') }} className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${themeMode === 'light' ? 'border-[#d1d5db] bg-white text-[#111827] hover:border-[#60a5fa] hover:text-[#0369a1]' : 'border-border bg-surface hover:border-accent/40 hover:text-accent'}`}>US East</button>
                        </div>
                      </div>

                      <div className={`rounded-xl border p-3 ${themeMode === 'light' ? 'border-[#e5e7eb] bg-[#f9fafb]' : 'border-border/60 bg-surface/60'}`}>
                        <div className={`text-[10px] uppercase font-semibold tracking-wider mb-2 ${themeMode === 'light' ? 'text-[#6b7280]' : 'text-muted'}`}>{uiLanguage === 'en' ? 'Queue Window' : 'Khung giờ queue'}</div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[11px] ${themeMode === 'light' ? 'text-[#6b7280]' : 'text-muted'}`}>{uiLanguage === 'en' ? 'Start time' : 'Giờ bắt đầu'}</span>
                          <input
                            type="time"
                            step={3600}
                            value={formatHourForTimeInput(queueStartHour)}
                            onChange={(e) => setQueueStartHour(parseHourFromTimeInput(e.target.value))}
                            className={`w-[110px] border rounded-md px-2 py-1 text-[11px] ${themeMode === 'light' ? 'bg-white border-[#d1d5db]' : 'bg-panel border-border'}`}
                          />
                          <span className={`text-[11px] ${themeMode === 'light' ? 'text-[#6b7280]' : 'text-muted'}`}>VN</span>
                        </div>
                        <div className={`text-[10px] mt-2 ${themeMode === 'light' ? 'text-[#6b7280]' : 'text-muted'}`}>{uiLanguage === 'en' ? `Scheduler starts from ${runWindowLabel} (${queueTimezone}).` : `Scheduler bắt đầu từ ${runWindowLabel} (${queueTimezone}).`}</div>
                        <label className="mt-3 flex items-center gap-2 text-[11px]">
                          <input
                            type="checkbox"
                            checked={forceRunNow}
                            onChange={(e) => setForceRunNow(e.target.checked)}
                          />
                          <span>Bỏ qua mốc {runWindowLabel}, cho phép chạy ngay</span>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className={`rounded-xl border p-3 ${themeMode === 'light' ? 'border-[#e5e7eb] bg-white' : 'border-border bg-surface/60'}`}>
                        <div className={`text-[10px] uppercase font-semibold tracking-wider mb-2 ${themeMode === 'light' ? 'text-[#6b7280]' : 'text-muted'}`}>{uiLanguage === 'en' ? 'Storage Paths' : 'Đường dẫn storage'}</div>
                        <div className="space-y-2 text-[11px]">
                          <div className="grid grid-cols-[150px_1fr] gap-2">
                            <span className={themeMode === 'light' ? 'text-[#6b7280]' : 'text-muted'}>{uiLanguage === 'en' ? 'Default userData' : 'userData mặc định'}</span>
                            <span className="font-mono break-all">{derivedDefaultUserDataPath || '—'}</span>
                          </div>
                          <div className="grid grid-cols-[150px_1fr] gap-2">
                            <span className={themeMode === 'light' ? 'text-[#6b7280]' : 'text-muted'}>{uiLanguage === 'en' ? 'Storage root' : 'Thư mục gốc storage'}</span>
                            <span className="font-mono break-all">{storageDir || derivedDefaultUserDataPath || '—'}</span>
                          </div>
                          <div className="grid grid-cols-[150px_1fr] gap-2">
                            <span className={themeMode === 'light' ? 'text-[#6b7280]' : 'text-muted'}>{uiLanguage === 'en' ? 'Runtime config' : 'Config runtime'}</span>
                            <span className="font-mono break-all">{runtimeConfigFilePath || '—'}</span>
                          </div>
                          <div className="grid grid-cols-[150px_1fr] gap-2">
                            <span className={themeMode === 'light' ? 'text-[#6b7280]' : 'text-muted'}>{uiLanguage === 'en' ? 'UI settings' : 'Cài đặt UI'}</span>
                            <span className="font-mono break-all">{appSettingsFilePath || '—'}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-3 pt-2 border-t border-border/50">
                          <Button variant="secondary" size="xs" onClick={async () => {
                            const ipc = window.electron?.ipcRenderer
                            if (!ipc) return
                            const [dirRes, pathRes] = await Promise.all([
                              ipc.invoke('irs:settings:get-storage-dir'),
                              ipc.invoke('irs:settings:get-paths'),
                            ])
                            if (dirRes?.ok) setStorageDir(String(dirRes.storageDir || ''))
                            if (pathRes?.ok) {
                              setUserDataPath(String(pathRes.userDataDir || ''))
                              setRuntimeConfigFilePath(String(pathRes.runtimeConfigPath || ''))
                              setAppSettingsFilePath(String(pathRes.appSettingsPath || ''))
                            }
                            if (!dirRes?.ok || !pathRes?.ok) {
                              showMessage(`Refresh paths lỗi: ${dirRes?.error || pathRes?.error || 'unknown'}`, 'error')
                              return
                            }
                            showMessage('Đã refresh storage paths', 'info')
                          }}>Refresh Paths</Button>
                          <Button variant="secondary" size="xs" onClick={async () => {
                            const ipc = window.electron?.ipcRenderer
                            if (!ipc) return
                            const res = await ipc.invoke('irs:settings:pick-storage-dir')
                            if (!res?.ok) {
                              if (!res?.cancelled) showMessage(`Chọn thư mục lỗi: ${res?.error || 'unknown'}`, 'error')
                              return
                            }
                            setStorageDir(String(res.storageDir || ''))
                            showMessage('Đã chọn storage folder', 'info')
                            await saveRuntimeSettings()
                          }}>Choose Folder</Button>
                          <Button variant="secondary" size="xs" onClick={async () => {
                            const ipc = window.electron?.ipcRenderer
                            if (!ipc) return
                            const res = await ipc.invoke('irs:settings:set-storage-dir', { storageDir: '' })
                            if (!res?.ok) {
                              showMessage(`Reset storage lỗi: ${res?.error || 'unknown'}`, 'error')
                              return
                            }
                            setStorageDir('')
                            showMessage('Đã reset về default storage', 'info')
                            await saveRuntimeSettings()
                          }}>Use Default</Button>
                          <Button variant="secondary" size="xs" onClick={async () => {
                            const ipc = window.electron?.ipcRenderer
                            if (!ipc) return
                            const target = storageDir || derivedDefaultUserDataPath
                            const res = await ipc.invoke('irs:open-path', { path: target, reveal: true })
                            if (res?.ok === false) {
                              showMessage(`Mở folder lỗi: ${res?.error || 'unknown'}`, 'error')
                              return
                            }
                            showMessage('Đã mở storage folder', 'info')
                          }}>Open Folder</Button>
                        </div>
                      </div>

                      <div className={`rounded-xl border p-3 ${themeMode === 'light' ? 'border-[#e5e7eb] bg-white' : 'border-border bg-surface/60'}`}>
                        <div className={`text-[10px] uppercase font-semibold tracking-wider mb-2 ${themeMode === 'light' ? 'text-[#6b7280]' : 'text-muted'}`}>{uiLanguage === 'en' ? 'Locale & Appearance' : 'Ngôn ngữ & giao diện'}</div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
                          <div className="space-y-1">
                            <label className={`text-[11px] ${themeMode === 'light' ? 'text-[#6b7280]' : 'text-muted'}`}>{uiLanguage === 'en' ? 'Timezone (IANA)' : 'Múi giờ (IANA)'}</label>
                            <input value={queueTimezone} onChange={(e) => setQueueTimezone(e.target.value)} className={`w-full border rounded-lg px-2 py-1.5 text-[11px] ${themeMode === 'light' ? 'bg-white border-[#d1d5db]' : 'bg-panel border-border'}`} />
                          </div>
                          <div className="space-y-1">
                            <label className={`text-[11px] ${themeMode === 'light' ? 'text-[#6b7280]' : 'text-muted'}`}>{uiLanguage === 'en' ? 'Country Code' : 'Mã quốc gia'}</label>
                            <input value={queueCountry} onChange={(e) => setQueueCountry(e.target.value.toUpperCase())} className={`w-full border rounded-lg px-2 py-1.5 text-[11px] ${themeMode === 'light' ? 'bg-white border-[#d1d5db]' : 'bg-panel border-border'}`} />
                          </div>
                        </div>
                        <div className="flex flex-wrap items-end gap-3 mb-3">
                          <div>
                            <label className={`text-[11px] ${themeMode === 'light' ? 'text-[#6b7280]' : 'text-muted'}`}>Ngôn ngữ / Language</label>
                            <div className="mt-1 flex items-center gap-2">
                              <Button
                                variant={uiLanguage === 'vi' ? 'primary' : 'secondary'}
                                size="xs"
                                onClick={() => setUiLanguage('vi')}
                              >
                                Tiếng Việt
                              </Button>
                              <Button
                                variant={uiLanguage === 'en' ? 'primary' : 'secondary'}
                                size="xs"
                                onClick={() => setUiLanguage('en')}
                              >
                                English
                              </Button>
                            </div>
                          </div>
                          <div>
                            <label className={`text-[11px] ${themeMode === 'light' ? 'text-[#6b7280]' : 'text-muted'}`}>{uiLanguage === 'en' ? 'Theme' : 'Giao diện'}</label>
                            <div className="mt-1">
                              <Button variant="secondary" size="xs" onClick={() => setThemeMode(prev => prev === 'dark' ? 'light' : 'dark')}>
                                {uiLanguage === 'en' ? `Theme: ${themeMode}` : `Giao diện: ${themeMode === 'dark' ? 'tối' : 'sáng'}`}
                              </Button>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button size="xs" onClick={saveRuntimeSettings}>{uiLanguage === 'en' ? 'Save Settings' : 'Lưu cài đặt'}</Button>
                        </div>
                      </div>

                      <div className={`rounded-xl border p-3 ${themeMode === 'light' ? 'border-[#e5e7eb] bg-white' : 'border-border bg-surface/60'}`}>
                        <div className={`text-[10px] uppercase font-semibold tracking-wider mb-2 ${themeMode === 'light' ? 'text-[#6b7280]' : 'text-muted'}`}>App Updates</div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 text-[11px] mb-3">
                          <div className="space-y-1">
                            <div className={themeMode === 'light' ? 'text-[#6b7280]' : 'text-muted'}>Current Version</div>
                            <div className="font-mono">{updateState.currentVersion || appVersion || '—'}</div>
                          </div>
                          <div className="space-y-1">
                            <div className={themeMode === 'light' ? 'text-[#6b7280]' : 'text-muted'}>Target Version</div>
                            <div className="font-mono">{updateState.targetVersion || '—'}</div>
                          </div>
                          <div className="space-y-1 lg:col-span-2">
                            <div className={themeMode === 'light' ? 'text-[#6b7280]' : 'text-muted'}>Status</div>
                            <div className="font-medium">{updateState.message || 'Idle'}</div>
                            {typeof updateState.percent === 'number' && (
                              <div className="h-1.5 rounded-full bg-surface overflow-hidden mt-1">
                                <div className="h-full bg-accent transition-all duration-300" style={{ width: `${Math.max(0, Math.min(100, Math.round(updateState.percent)))}%` }} />
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={async () => {
                              const ipc = window.electron?.ipcRenderer
                              if (!ipc) return
                              const res = await ipc.invoke('app:update:check')
                              if (!res?.ok) {
                                showMessage(`Check update lỗi: ${res?.error || 'unknown'}`, 'error')
                                return
                              }
                              showMessage('Đang kiểm tra bản cập nhật...', 'info')
                            }}
                          >
                            <RefreshCw className="w-3 h-3" />Check Update
                          </Button>
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={async () => {
                              const ipc = window.electron?.ipcRenderer
                              if (!ipc) return
                              const res = await ipc.invoke('app:update:download')
                              if (!res?.ok) {
                                showMessage(`Download update lỗi: ${res?.error || 'unknown'}`, 'error')
                                return
                              }
                              showMessage('Đang tải bản cập nhật...', 'info')
                            }}
                            disabled={!['available', 'downloading'].includes(updateState.status)}
                          >
                            <ArrowDownToLine className="w-3 h-3" />Download Update
                          </Button>
                          <Button
                            size="xs"
                            onClick={async () => {
                              const ipc = window.electron?.ipcRenderer
                              if (!ipc) return
                              const res = await ipc.invoke('app:update:install')
                              if (!res?.ok) {
                                showMessage(`Install update lỗi: ${res?.error || 'unknown'}`, 'error')
                                return
                              }
                              showMessage('App sẽ restart để cài bản cập nhật', 'success')
                            }}
                            disabled={updateState.status !== 'downloaded'}
                          >
                            Install & Restart
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
          <>
          {/* Compact Stats Bar */}
          <div className="flex items-center gap-6 px-4 py-2 border-b border-border bg-base/10 shrink-0 select-none">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted uppercase tracking-wider font-medium">Batch Progress</span>
              <div className="flex items-center gap-2 tabular-nums">
                <span className="text-sm font-semibold text-text">{stats.done + stats.failed}</span>
                <span className="text-muted text-[10px]">/ {stats.total}</span>
              </div>
            </div>
            <div className="h-4 w-px bg-border/50" />
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <CircleDot className="w-3 h-3 text-muted" />
                <span className="text-[11px] font-medium text-muted tabular-nums">{stats.pending}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3 text-accent animate-spin-slow" />
                <span className="text-[11px] font-medium text-accent tabular-nums">{stats.running}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-success" />
                <span className="text-[11px] font-medium text-success tabular-nums">{stats.done}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ShieldAlert className="w-3 h-3 text-danger" />
                <span className="text-[11px] font-medium text-danger tabular-nums">{stats.failed}</span>
              </div>
            </div>

            {stats.total > 0 && (
              <div className="flex-1 max-w-[240px] h-1.5 bg-surface rounded-full overflow-hidden ml-auto relative">
                <div className="absolute inset-y-0 left-0 bg-accent/20 transition-all duration-300" style={{ width: `${Math.min(100, progressPct + runningPct)}%` }} />
                <div className="absolute inset-y-0 left-0 overflow-hidden transition-all duration-300" style={{ width: `${progressPct}%` }}>
                  <div className="h-full w-full flex">
                    <div className="h-full bg-success" style={{ width: `${doneInFinishedPct}%` }} />
                    <div className="h-full bg-danger" style={{ width: `${failedInFinishedPct}%` }} />
                  </div>
                </div>
                {stats.running > 0 && (
                  <div
                    className="absolute top-0 h-full w-1.5 bg-accent animate-pulse rounded-full"
                    style={{ left: `calc(${Math.max(0, progressPct - 1)}% - 2px)` }}
                  />
                )}
              </div>
            )}
          </div>

          {/* Tab bar */}
          <div className="flex items-center px-4 border-b border-border bg-panel shrink-0">
            {(
              [[
                'results',
                uiLanguage === 'en' ? 'Results' : 'Kết quả',
                <BarChart2 className="w-3.5 h-3.5" />,
              ], [
                'queue',
                uiLanguage === 'en' ? 'Queue' : 'Hàng đợi',
                <Inbox className="w-3.5 h-3.5" />,
              ], [
                'logs',
                uiLanguage === 'en' ? 'Logs' : 'Nhật ký',
                <TerminalSquare className="w-3.5 h-3.5" />,
              ]] as const
            ).map(([id, label, icon]) => (
              <button key={id} onClick={() => setActiveTab(id as 'queue' | 'logs' | 'results')}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-medium border-b-2 -mb-px transition-colors ${activeTab === id ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text'}`}
              >
                {icon}
                {label}
                {id === 'queue' && stats.running > 0 && <span className="px-1.5 py-px bg-accent/15 text-accent text-[9px] rounded-full">{stats.running}</span>}
                {id === 'queue' && stats.failed > 0 && <span className="px-1.5 py-px bg-danger/15 text-danger text-[9px] rounded-full">{stats.failed}</span>}
                {id === 'results' && stats.done > 0 && <span className="px-1.5 py-px bg-success/15 text-success text-[9px] rounded-full">{stats.done}</span>}
              </button>
            ))}

            <div className="ml-auto flex items-center gap-1 py-2">
              {activeTab === 'queue' && (
                <>
                  <Filter className="w-3 h-3 text-muted" />
                  {(['all', 'running', 'pending', 'done', 'failed'] as const).map(f => (
                    <button key={f} onClick={() => setJobFilter(f)}
                      className={`text-[10px] px-2 py-0.5 rounded transition-colors ${jobFilter === f ? 'bg-surface text-text border border-border' : 'text-muted hover:text-text'}`}
                    >{f === 'all' ? (uiLanguage === 'en' ? 'all' : 'tất cả') : f === 'running' ? (uiLanguage === 'en' ? 'running' : 'đang chạy') : f === 'pending' ? (uiLanguage === 'en' ? 'pending' : 'chờ') : f === 'done' ? (uiLanguage === 'en' ? 'completed' : 'hoàn tất') : (uiLanguage === 'en' ? 'failed' : 'thất bại')}</button>
                  ))}
                  <select
                    value={queueBatchFilter}
                    onChange={(e) => setQueueBatchFilter(e.target.value)}
                    className="text-[10px] px-2 py-1 rounded border border-border bg-surface text-text"
                  >
                    <option value="all">{uiLanguage === 'en' ? 'all batches' : 'tất cả batch'}</option>
                    {queueBatchOptions.map((batchId) => (
                      <option key={batchId} value={batchId}>{batchId}</option>
                    ))}
                  </select>
                  <div className="w-px h-4 bg-border mx-1" />
                  <button onClick={() => setShowCsvModal(true)} className="flex items-center gap-1 text-[10px] text-muted hover:text-text px-2 py-1 rounded hover:bg-surface transition-colors">
                    <Upload className="w-3 h-3" />{uiLanguage === 'en' ? 'Import CSV' : 'Nhập CSV'}
                  </button>
                  <button onClick={async () => {
                    await refreshQueueFromDb()
                    showMessage('Đã refresh job queue', 'info')
                  }} className="flex items-center gap-1 text-[10px] text-muted hover:text-text px-2 py-1 rounded hover:bg-surface transition-colors">
                    <RefreshCw className="w-3 h-3" />
                  </button>
                  {selectedInView.length > 0 && (
                    <>
                      <div className="w-px h-4 bg-border mx-1" />
                      <button
                        onClick={async () => {
                          const ipc = window.electron?.ipcRenderer
                          if (!ipc) return
                          const ids = Array.from(selectedJobIds)
                          const res = await ipc.invoke('irs:queue:remove', { ids })
                          if (!res?.ok) {
                            showMessage(`Remove queue lỗi: ${res?.error || 'unknown'}`, 'error')
                            return
                          }
                          setSelectedJobIds(new Set())
                          await refreshQueueFromDb()
                          showMessage(`Đã xoá ${res.deleted || 0} job khỏi queue`)
                        }}
                        className="text-[10px] px-2 py-1 rounded border border-danger/30 text-danger hover:bg-danger/10 transition-colors"
                      >
                        {uiLanguage === 'en' ? 'Remove Selected' : 'Xóa mục chọn'} ({selectedInView.length})
                      </button>
                      <button
                        onClick={async () => {
                          const ipc = window.electron?.ipcRenderer
                          if (!ipc) return
                          const ids = Array.from(selectedJobIds)
                          const res = await ipc.invoke('irs:queue:requeue', { ids })
                          if (!res?.ok) {
                            showMessage(`Requeue lỗi: ${res?.error || 'unknown'}`, 'error')
                            return
                          }
                          setSelectedJobIds(new Set())
                          await refreshQueueFromDb()
                          showMessage(`Đã requeue ${res.requeued || 0} job`)
                        }}
                        className="text-[10px] px-2 py-1 rounded border border-accent/30 text-accent hover:bg-accent/10 transition-colors"
                      >
                        {uiLanguage === 'en' ? 'Requeue Selected' : 'Xếp lại hàng đợi'}
                      </button>
                    </>
                  )}
                  {queueBatchFilter !== 'all' && sortedJobs.length > 0 && (
                    <>
                      <div className="w-px h-4 bg-border mx-1" />
                      <button
                        onClick={async () => {
                          const ipc = window.electron?.ipcRenderer
                          if (!ipc) return
                          const ids = sortedJobs.map((job) => job.job_id)
                          const res = await ipc.invoke('irs:queue:remove', { ids })
                          if (!res?.ok) {
                            showMessage(`Remove batch lỗi: ${res?.error || 'unknown'}`, 'error')
                            return
                          }
                          setSelectedJobIds(new Set())
                          await refreshQueueFromDb()
                          showMessage(`Đã xoá batch ${queueBatchFilter}: ${res.deleted || 0} job`)
                        }}
                        className="text-[10px] px-2 py-1 rounded border border-danger/30 text-danger hover:bg-danger/10 transition-colors"
                      >
                        {uiLanguage === 'en' ? 'Remove Batch' : 'Xóa batch'} ({sortedJobs.length})
                      </button>
                    </>
                  )}
                </>
              )}
              {activeTab === 'logs' && (
                <>
                  {(['all', 'error', 'warning', 'success'] as const).map(lv => (
                    <button key={lv} onClick={() => setLogFilter(lv)}
                      className={`text-[10px] px-2 py-0.5 rounded transition-colors ${logFilter === lv ? 'bg-surface text-text border border-border' : 'text-muted hover:text-text'}`}
                    >{lv === 'all' ? (uiLanguage === 'en' ? 'all' : 'tất cả') : lv === 'error' ? (uiLanguage === 'en' ? 'error' : 'lỗi') : lv === 'warning' ? (uiLanguage === 'en' ? 'warning' : 'cảnh báo') : (uiLanguage === 'en' ? 'success' : 'thành công')}</button>
                  ))}
                  <button onClick={copyLogs} className="text-muted hover:text-text px-1.5 py-1 rounded hover:bg-surface transition-colors">
                    <Copy className="w-3 h-3" />
                  </button>
                  <button onClick={() => {
                    const count = logs.length
                    setLogs([])
                    showMessage(`Đã clear ${count} logs`, 'info')
                  }} className="text-[10px] text-muted hover:text-danger px-2 py-1 rounded hover:bg-surface transition-colors">
                    {uiLanguage === 'en' ? 'Clear' : 'Xóa'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Queue tab */}
          {activeTab === 'queue' && (
            <div className="flex-1 overflow-y-auto min-h-0">
              {sortedJobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted gap-3">
                  <Inbox className="w-8 h-8 opacity-20" />
                  <span className="text-sm">{uiLanguage === 'en' ? 'Queue is empty' : 'Hàng đợi đang trống'}</span>
                  <span className="text-xs opacity-50">{uiLanguage === 'en' ? 'Import CSV to add records to the queue' : 'Nhập CSV để thêm hồ sơ vào hàng đợi'}</span>
                </div>
              ) : (
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-panel/95 backdrop-blur border-b border-border z-10">
                    <tr>
                      <th className="w-8 text-left px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={allSelectedInView}
                          onChange={(e) => toggleSelectAllJobsInView(e.target.checked)}
                          className="ba-checkbox"
                        />
                      </th>
                      <th className="w-6" />
                      <th className="text-left text-muted font-medium px-3 py-2.5">Record / EIN</th>
                      <th className="text-left text-muted font-medium px-3 py-2.5">{uiLanguage === 'en' ? 'Status' : 'Trạng thái'}</th>
                      <th className="text-left text-muted font-medium px-3 py-2.5">{uiLanguage === 'en' ? 'Steps' : 'Tiến trình'}</th>
                      <th className="text-left text-muted font-medium px-3 py-2.5">{uiLanguage === 'en' ? 'Attempts' : 'Số lần'}</th>
                      <th className="text-left text-muted font-medium px-3 py-2.5">{uiLanguage === 'en' ? 'Time' : 'Thời gian'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedJobs.map(job => (
                      <JobRow
                        key={job.job_id}
                        job={job}
                        selected={selectedJobIds.has(job.job_id)}
                        onToggleSelect={toggleSelectJob}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Logs tab */}
          {activeTab === 'logs' && (
            <div
              ref={logRef}
              className={`flex-1 overflow-y-auto min-h-0 p-3 font-mono text-[11px] space-y-0.5 ${
                themeMode === 'light'
                  ? 'bg-[#f5f7fb] text-[#1f2937]'
                  : 'bg-[#0b0b0d] text-[#e5e7eb]'
              }`}
            >
              {filteredLogs.length === 0
                ? <div className={`${themeMode === 'light' ? 'text-[#6b7280]' : 'text-muted/25'} select-none pt-2 pl-1`}>{uiLanguage === 'en' ? 'Waiting for Python worker logs...' : 'Đang chờ log từ Python worker...'} (sandbox: http://ein-sandbox.test/applyein/legalStructure)</div>
                : filteredLogs.map(l => (
                  <div key={l.id} className={`flex gap-2 items-start group rounded px-1 py-0.5 ${themeMode === 'light' ? 'hover:bg-black/[0.04]' : 'hover:bg-white/[0.02]'}`}>
                    <span className={`${themeMode === 'light' ? 'text-[#6b7280]' : 'text-muted/30'} shrink-0 tabular-nums select-none w-16`}>{l.ts}</span>
                    <span className={`shrink-0 w-3 mt-0.5 ${l.level === 'error' ? 'text-danger' : l.level === 'success' ? 'text-success' : l.level === 'warning' ? 'text-warning' : 'text-muted/30'}`}>
                      {l.level === 'error' ? <X className="w-3 h-3" /> : l.level === 'success' ? <Check className="w-3 h-3" /> : l.level === 'warning' ? <AlertCircle className="w-3 h-3" /> : '·'}
                    </span>
                    {l.step && (
                      <span className={`shrink-0 text-[9px] px-1 border rounded ${themeMode === 'light' ? 'bg-white border-[#d1d5db] text-[#4b5563]' : 'bg-surface border-border text-muted'}`}>
                        {STEP_LABELS[l.step]}
                      </span>
                    )}
                    {l.proxy_ip && (
                      <span className={`shrink-0 text-[9px] px-1.5 rounded font-mono ${themeMode === 'light' ? 'bg-amber-50 border border-amber-200 text-amber-700' : 'bg-warning/10 border border-warning/25 text-warning/80'}`}>
                        {l.proxy_ip}
                      </span>
                    )}
                    {l.job_id && (
                      <span className={`shrink-0 text-[9px] font-mono ${themeMode === 'light' ? 'text-[#6b7280]' : 'text-muted/50'}`}>{l.job_id.split(':')[1]}</span>
                    )}
                    <span className={`leading-relaxed break-all ${levelCls(l.level)}`}>{l.msg}</span>
                  </div>
                ))
              }
            </div>
          )}

          {/* Results tab */}
          {activeTab === 'results' && (
            <ResultsDashboard
              results={results}
              onResultsChange={_setResults}
              onOpenOutputFolder={openOutputFolder}
              onRefresh={loadResultsFromDisk}
              onQuickExportStyled={quickExportStyled}
              onQuickExportSelected={quickExportSelectedStyled}
              onQuickExportSelectedNext={quickExportSelectedStyledNext}
              quickExportSelectedNextRunning={bundleUploadRunning}
              quickExportSelectedNextLabel={bundleUploadLabel}
              onNotify={showMessage}
            />
          )}

          {(bundleUploadRunning || bundleUploadDetail || bundleUploadPercent > 0) && (
            <div className="shrink-0 border-t border-border bg-panel/95 px-4 py-2">
              <button
                className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-surface/50 px-3 py-2 text-left hover:bg-surface/70 transition-colors"
                onClick={() => setBundleUploadPanelOpen(v => !v)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="font-semibold text-text">{uiLanguage === 'en' ? 'Google Drive Sync' : 'Đồng bộ Google Drive'}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${bundleUploadRunning ? 'bg-accent/10 text-accent' : 'bg-success/10 text-success'}`}>
                      {bundleUploadRunning ? (uiLanguage === 'en' ? 'Running' : 'Đang chạy') : (uiLanguage === 'en' ? 'Ready' : 'Sẵn sàng')}
                    </span>
                    <span className="text-muted">{bundleUploadPercent}%</span>
                    {bundleUploadTotal > 0 && (
                      <span className="text-muted font-mono">{bundleUploadCurrent}/{bundleUploadTotal} PDF</span>
                    )}
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border/60">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-300"
                      style={{ width: `${Math.max(0, Math.min(100, bundleUploadPercent))}%` }}
                    />
                  </div>
                </div>
                <span className="text-[10px] text-muted">{bundleUploadPanelOpen ? (uiLanguage === 'en' ? 'Hide' : 'Ẩn') : (uiLanguage === 'en' ? 'Show' : 'Xem')}</span>
              </button>
              {bundleUploadPanelOpen && (
                <div className="mt-2 rounded-xl border border-border/70 bg-base/20 px-3 py-3 text-[11px]">
                  <div className="grid gap-2 md:grid-cols-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted">{uiLanguage === 'en' ? 'Folder Name' : 'Tên thư mục'}</div>
                      <div className="mt-1 font-mono text-text break-all">{bundleUploadFolderName || (uiLanguage === 'en' ? 'Preparing...' : 'Đang chuẩn bị...')}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted">{uiLanguage === 'en' ? 'Stage' : 'Giai đoạn'}</div>
                      <div className="mt-1 text-text">{bundleUploadDetail || (uiLanguage === 'en' ? 'Waiting...' : 'Đang chờ...')}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted">{uiLanguage === 'en' ? 'PDF Progress' : 'Tiến độ PDF'}</div>
                      <div className="mt-1 text-text font-mono">
                        {bundleUploadTotal > 0 ? `${bundleUploadCurrent}/${bundleUploadTotal}` : '0/0'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted">Report</div>
                      <div className="mt-1 text-text">
                        {bundleUploadPercent >= 92
                          ? (uiLanguage === 'en' ? 'Building / uploading Google Sheet' : 'Đang tạo / upload Google Sheet')
                          : (uiLanguage === 'en' ? 'Waiting for PDFs' : 'Đang chờ PDF hoàn tất')}
                      </div>
                    </div>
                  </div>
                  {(bundleUploadFolderUrl || bundleUploadReportUrl) && (
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {bundleUploadFolderUrl && (
                        <div className="rounded-lg border border-border/60 bg-surface/40 p-2.5">
                          <div className="text-[10px] uppercase tracking-wider text-muted">{uiLanguage === 'en' ? 'Drive Folder Link' : 'Link thư mục Drive'}</div>
                          <div className="mt-1 font-mono text-[10px] text-text break-all">{bundleUploadFolderUrl}</div>
                          <div className="mt-2 flex gap-2">
                            <button
                              className="rounded-md border border-border px-2 py-1 text-[10px] text-text hover:bg-surface"
                              onClick={() => openExternalUrl(bundleUploadFolderUrl)}
                            >
                              {uiLanguage === 'en' ? 'Open link' : 'Mở link'}
                            </button>
                            <button
                              className="rounded-md border border-border px-2 py-1 text-[10px] text-text hover:bg-surface"
                              onClick={() => navigator.clipboard.writeText(bundleUploadFolderUrl)}
                            >
                              {uiLanguage === 'en' ? 'Copy link' : 'Copy link'}
                            </button>
                          </div>
                        </div>
                      )}
                      {bundleUploadReportUrl && (
                        <div className="rounded-lg border border-border/60 bg-surface/40 p-2.5">
                          <div className="text-[10px] uppercase tracking-wider text-muted">{uiLanguage === 'en' ? 'Drive Report Link' : 'Link report Drive'}</div>
                          <div className="mt-1 font-mono text-[10px] text-text break-all">{bundleUploadReportUrl}</div>
                          <div className="mt-2 flex gap-2">
                            <button
                              className="rounded-md border border-border px-2 py-1 text-[10px] text-text hover:bg-surface"
                              onClick={() => openExternalUrl(bundleUploadReportUrl)}
                            >
                              {uiLanguage === 'en' ? 'Open link' : 'Mở link'}
                            </button>
                            <button
                              className="rounded-md border border-border px-2 py-1 text-[10px] text-text hover:bg-surface"
                              onClick={() => navigator.clipboard.writeText(bundleUploadReportUrl)}
                            >
                              {uiLanguage === 'en' ? 'Copy link' : 'Copy link'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Status bar */}
          <div className="flex items-center gap-3 px-4 h-8 border-t border-border bg-panel text-[10px] text-muted shrink-0 overflow-x-auto whitespace-nowrap">
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${workerRunning ? 'bg-success animate-pulse' : 'bg-muted/30'}`} />
              {workerRunning ? `Worker ${flow.label}` : (uiLanguage === 'en' ? 'Worker idle' : 'Worker đang nghỉ')}
            </span>
            <span className="text-border">·</span>
            <span className="font-mono">{flow.queue}</span>
            <span className="text-border">·</span>
            <span className="tabular-nums">{finished}/{stats.total} ({progressPct}%)</span>
            <div className="w-28 h-1.5 rounded-full bg-surface overflow-hidden">
              <div className="h-full bg-success transition-all duration-300" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="text-success tabular-nums">{stats.done} done</span>
            <span className="text-accent tabular-nums">{stats.running} {uiLanguage === 'en' ? 'running' : 'đang chạy'}</span>
            <span className="text-muted tabular-nums">{stats.pending} {uiLanguage === 'en' ? 'pending' : 'chờ'}</span>
            <span className="text-danger tabular-nums">{stats.failed} fail</span>
            {runningJobs.length > 0 && (
              <>
                <span className="text-border">·</span>
                <span className="truncate max-w-[340px] text-accent font-medium">
                  {runningJobs.length === 1
                    ? `${uiLanguage === 'en' ? 'Now' : 'Hiện tại'}: ${runningJobs[0].name || runningJobs[0].record_id} · ${STEP_LABELS[runningJobs[0].last_step] || runningJobs[0].last_step}`
                    : `${uiLanguage === 'en' ? 'Running' : 'Đang chạy'} (${runningJobs.length}): ${runningJobs.map(j => `${j.name || j.record_id} [${STEP_LABELS[j.last_step] || j.last_step}]`).join('  ·  ')}`}
                </span>
              </>
            )}
            <span className="ml-auto opacity-60">{uiLanguage === 'en' ? 'Output: artifact folder (PDF + step6 + result)' : 'Output: thư mục artifact (PDF + step6 + result)'}</span>
            {!canRun && <span className="flex items-center gap-1.5 text-warning"><AlarmClock className="w-3 h-3" /> {uiLanguage === 'en' ? 'Opens' : 'Mở lúc'} {String(queueStartHour).padStart(2, '0')}:00</span>}
          </div>
          </>
          )}
        </div>
      </AppShell>

      {
        showCsvModal && (
          <CsvImportModal
            onClose={() => setShowCsvModal(false)}
            onImport={handleCsvImport}
          />
        )
      }
      {
        showProxyModal && (
          <ProxyConfigModal
            initial={proxies}
            initialAuth={proxyAuth}
            profileName={activeFlow}
            onTestRotate={async (auth) => {
              const ipc = window.electron?.ipcRenderer
              if (!ipc) return { ok: false, message: 'IPC unavailable' }
              const res = await ipc.invoke('irs:proxy:test-rotate', {
                flowMode: activeFlow,
                proxies,
                globalRotateSecs: _globalRotate,
                bearerToken: auth.bearerToken || '',
                providerUsername: auth.providerUsername || '',
                providerPassword: auth.providerPassword || '',
                rotateUrl: auth.rotateUrl || '',
                queueTimezone,
                queueCountry,
                queueStartHour,
                browserMode,
              })
              if (!res?.ok) return { ok: false, message: res?.error || 'rotate failed' }
              return { ok: true, message: res?.message || 'Rotate OK' }
            }}
            onClose={() => setShowProxyModal(false)}
            onSave={async (_proxies, _rotateSecs, auth) => {
              const rotateSecs = normalizeRotateSeconds(_rotateSecs)
              setProxies(_proxies)
              setGlobalRotate(rotateSecs)
              setProxyAuth(auth)
              localStorage.setItem('fox_proxies', JSON.stringify(_proxies))
              localStorage.setItem('fox_global_rotate', rotateSecs.toString())
              localStorage.setItem('fox_proxy_bearer', auth.bearerToken || '')
              localStorage.setItem('fox_proxy_provider_username', auth.providerUsername || '')
              localStorage.setItem('fox_proxy_provider_password', auth.providerPassword || '')
              localStorage.setItem('fox_proxy_rotate_url', auth.rotateUrl || '')
              localStorage.setItem(profileKey(activeFlow), JSON.stringify({
                profileName: activeFlow,
                savedAt: new Date().toISOString(),
                globalRotateSecs: rotateSecs,
                proxies: _proxies,
                proxyAuth: auth,
              }))
              try {
                const res = await applyRuntimeConfig({
                  proxies: _proxies,
                  globalRotateSecs: rotateSecs,
                  bearerToken: auth.bearerToken || '',
                  providerUsername: auth.providerUsername || '',
                  providerPassword: auth.providerPassword || '',
                  rotateUrl: auth.rotateUrl || '',
                })
                if (!res?.ok) {
                  showMessage(`Apply config lỗi: ${res?.error || 'unknown'}`, 'error')
                  return
                }
              } catch (err) {
                showMessage(`Apply config lỗi: ${String(err)}`, 'error')
                return
              }
              showMessage(`Đã lưu cấu hình ${_proxies.filter(p => p.enabled).length} proxies`)
              setShowProxyModal(false)
            }}
          />
        )
      }
      {/* Toast Notification */}
      {toasts.length > 0 && (
        <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[360px] max-w-[92vw] flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`toast-enter pointer-events-auto rounded-xl border px-3 py-2 shadow-lg backdrop-blur-md flex items-start gap-2 text-xs leading-5 ${
                t.type === 'error'
                  ? 'border-danger/45 bg-danger/10 text-danger'
                  : t.type === 'warning'
                    ? 'border-warning/45 bg-warning/10 text-warning'
                    : t.type === 'info'
                      ? 'border-accent/45 bg-accent/10 text-accent'
                      : 'border-success/45 bg-success/10 text-success'
              }`}
            >
              {t.type === 'error'
                ? <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                : t.type === 'warning'
                  ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  : t.type === 'info'
                    ? <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                    : <Check className="w-4 h-4 shrink-0 mt-0.5" />}
              <div className="min-w-0 break-words">{t.msg}</div>
              <button
                className="ml-auto rounded p-0.5 text-current/70 hover:bg-white/10 hover:text-current"
                onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {!miniQueueEmpty && (
      <div className="fixed right-4 bottom-6 z-[90] pointer-events-none">
        <div className="pointer-events-auto rounded-xl border border-border/80 bg-panel/95 backdrop-blur-md shadow-lg p-2.5 min-w-[250px] max-w-[320px]">
          {/* Header */}
          <div className="flex items-center gap-1.5 text-[11px] pb-1.5 border-b border-border/40">
            <RefreshCw className={`w-3 h-3 ${runningJobs.length > 0 ? 'text-accent animate-spin-slow' : showingRecentNotice ? (recentRunNotice?.status === 'done' ? 'text-success' : 'text-danger') : 'text-muted/40'}`} />
            <span className="font-semibold text-text">
              {runningJobs.length > 1
                ? (uiLanguage === 'en' ? `Running (${runningJobs.length} workers)` : `Đang chạy (${runningJobs.length} luồng)`)
                : runningJobs.length === 1
                ? (uiLanguage === 'en' ? 'Worker Running' : 'Đang xử lý')
                : runningModeLabel}
            </span>
            {runningJobs.length > 0 && (
              <span className="px-1.5 py-0.2 bg-accent/15 text-accent text-[9px] font-bold rounded-full">
                {runningJobs.length}×
              </span>
            )}
            <button
              className="ml-auto text-[10px] text-muted hover:text-text transition-colors px-1 py-0.5 rounded hover:bg-surface"
              onClick={() => setMiniRunCollapsed((v) => !v)}
              title={miniRunCollapsed ? 'Mở rộng' : 'Thu gọn'}
            >
              {miniRunCollapsed ? 'Expand' : 'Collapse'}
            </button>
          </div>

          {/* When Collapsed: Single ultra-compact summary line */}
          {miniRunCollapsed && (
            <div className="pt-1.5 flex items-center justify-between text-[10px] text-muted">
              {runningJobs.length > 0 ? (
                <>
                  <span className="truncate max-w-[190px] font-medium text-text">
                    {runningJobs.map(j => j.name || j.record_id).slice(0, 2).join(', ')}{runningJobs.length > 2 ? ` +${runningJobs.length - 2}` : ''}
                  </span>
                  <span className="text-accent font-mono text-[9px] shrink-0 font-semibold tabular-nums ml-2">
                    {Math.round(runningJobs.reduce((acc, j) => acc + getJobProgress(j).pct, 0) / runningJobs.length)}%
                  </span>
                </>
              ) : showingRecentNotice ? (
                <span className={recentRunNotice?.status === 'done' ? 'text-success font-medium' : 'text-danger font-medium'}>
                  {recentRunNotice?.name}: {recentRunNotice?.status === 'done' ? 'Hoàn tất' : 'Thất bại'}
                </span>
              ) : (
                <span>{stats.pending > 0 ? `Đang chờ: ${stats.pending}` : 'Sẵn sàng'}</span>
              )}
            </div>
          )}

          {/* When Expanded: Show each running job bar neatly */}
          {!miniRunCollapsed && (
            <div className="pt-1.5 space-y-2 max-h-[220px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {runningJobs.length > 0 ? (
                runningJobs.map((job, idx) => {
                  const p = getJobProgress(job)
                  return (
                    <div key={job.job_id || idx} className="space-y-1 pb-1.5 border-b border-border/30 last:border-b-0 last:pb-0">
                      <div className="flex items-center justify-between gap-1.5 text-[10px] leading-tight">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.looksStale ? 'bg-warning animate-ping' : 'bg-accent animate-pulse'}`} />
                          <span className="font-semibold text-text truncate max-w-[120px]" title={job.name || job.record_id}>
                            {job.name || job.record_id}
                          </span>
                        </div>
                        <span className="text-accent text-[9px] font-mono shrink-0 truncate max-w-[90px]" title={STEP_LABELS[job.last_step]}>
                          {STEP_LABELS[job.last_step] || job.last_step}
                        </span>
                        <span className="text-muted text-[9px] font-mono tabular-nums shrink-0 font-medium">
                          {p.pct}%
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-surface overflow-hidden relative">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${p.looksStale ? 'bg-warning' : 'bg-accent'}`}
                          style={{ width: `${Math.max(6, p.pct)}%` }}
                        />
                      </div>
                    </div>
                  )
                })
              ) : showingRecentNotice ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-medium text-text truncate">{recentRunNotice?.name}</span>
                    <span className={recentRunNotice?.status === 'done' ? 'text-success font-medium' : 'text-danger font-medium'}>
                      {recentRunNotice?.status === 'done' ? 'Hoàn tất' : 'Thất bại'}
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-surface overflow-hidden">
                    <div className={`h-full ${recentRunNotice?.status === 'done' ? 'bg-success' : 'bg-danger'}`} style={{ width: '100%' }} />
                  </div>
                </div>
              ) : stats.pending > 0 ? (
                <div className="text-[10px] text-muted py-1 flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-muted/60" />
                  <span>{uiLanguage === 'en' ? `Waiting for worker: ${stats.pending} pending` : `Đang chờ luồng chạy: còn ${stats.pending} mục`}</span>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
      )}
    </>
  )
}

export default function App() {
  const [uiLanguage, setUiLanguage] = useState<UILanguage>(() => {
    const saved = String(localStorage.getItem('fox_ui_language') || '').toLowerCase()
    return saved === 'en' ? 'en' : 'vi'
  })

  useEffect(() => {
    localStorage.setItem('fox_ui_language', uiLanguage)
  }, [uiLanguage])

  return (
    <I18nProvider locale={uiLanguage}>
      <AppContent uiLanguage={uiLanguage} setUiLanguage={setUiLanguage} />
    </I18nProvider>
  )
}
