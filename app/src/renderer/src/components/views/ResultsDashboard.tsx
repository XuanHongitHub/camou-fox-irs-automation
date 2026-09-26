import { useState, useMemo, useCallback, Fragment, useEffect, useRef } from 'react'
import {
    Download, Search, Filter, CheckCircle2, AlertCircle,
    FileText, RefreshCw, Copy,
    ChevronDown, ChevronUp, X, Check, BarChart3, Clock, Calendar,
    Globe, Hash, ChevronRight, FolderOpen,
    Cloud, EyeOff, Eye, RotateCcw, ShieldCheck, SlidersHorizontal
} from 'lucide-react'
import { Button } from '../base/Button'
import { useI18n } from '../../i18n/useI18n'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResultRow {
    // Input (preserved from CSV)
    record_id: string
    name: string
    ein: string
    [key: string]: string | number | boolean | undefined
    // Result
    status: 'done' | 'failed'
    confirmation_number?: string
    error_type?: string
    error_code?: string
    error_message?: string
    last_step?: string
    proxy_used?: string
    proxy_ip?: string
    step6_legal_name?: string
    step6_name_control?: string
    step6_phone_number?: string
    step6_county?: string
    step6_state?: string
    step6_start_date?: string
    step6_principal_activity?: string
    step6_principal_product_service?: string
    step6_reason_for_applying?: string
    step6_physical_location?: string
    step6_responsible_name?: string
    step6_responsible_ssn_itin?: string
    step6_data_json?: string
    pdf_path?: string
    final_pdf_path?: string
    artifact_dir?: string
    attempt_count?: number
    duration_s?: number
    started_at?: string
    completed_at?: string
    source_file?: string
    batch_id?: string
    uploaded_to_drive?: boolean
    drive_pdf_url?: string
    is_hidden?: boolean
}

type SortField = 'completed_at' | 'name' | 'ein' | 'status' | 'duration_s'
type SortDir = 'asc' | 'desc'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escCsv(val: string | number | boolean | undefined) {
    if (val === undefined || val === null) return ''
    const s = String(val)
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
}

function shortPathName(path: string | number | undefined): string {
    const s = String(path || '').trim()
    if (!s) return ''
    const parts = s.split(/[\\/]/).filter(Boolean)
    return parts.length ? parts[parts.length - 1] : s
}

function buildCsv(rows: ResultRow[], includeInput = true): string {
    if (!rows.length) return ''
    const resultCols = [
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
    const inputCols = includeInput ? ['record_id', 'name'] : []
    const allCols = [...inputCols, ...resultCols]

    const header = allCols.join(',')
    const body = rows.map(row => {
        const mapped: Record<string, string | number | boolean | undefined> = {
            ...row,
            pdf_file: shortPathName(row.pdf_path),
            artifact_folder: shortPathName(row.artifact_dir),
            source: shortPathName(row.source_file),
        }
        return allCols.map(c => escCsv(mapped[c])).join(',')
    }).join('\n')
    return `${header}\n${body}`
}

function downloadCsv(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
}

function fmtDate(iso?: string) {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleString('vi', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function errorTypeLabel(errorType?: string) {
    const t = String(errorType || '').toLowerCase()
    if (t === 'blocked') return { text: 'Blocked', cls: 'bg-warning/15 text-warning border-warning/30' }
    if (t === 'proxy') return { text: 'Proxy', cls: 'bg-accent/15 text-accent border-accent/30' }
    if (t === 'automation') return { text: 'Automation', cls: 'bg-danger/15 text-danger border-danger/30' }
    return { text: 'Unknown', cls: 'bg-surface text-muted border-border' }
}

function getDurationSeconds(row: ResultRow): number | undefined {
    if (typeof row.duration_s === 'number' && Number.isFinite(row.duration_s) && row.duration_s > 0) return row.duration_s
    if (row.started_at && row.completed_at) {
        const start = new Date(row.started_at).getTime()
        const end = new Date(row.completed_at).getTime()
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
            return Math.round((end - start) / 1000)
        }
    }
    return undefined
}

function openPath(path: string, reveal = false) {
    const ipc = window.electron?.ipcRenderer
    if (!ipc || !path) return
    ipc.invoke('irs:open-path', { path, reveal }).catch(() => {
        // no-op
    })
}

// ─── Row detail expand ────────────────────────────────────────────────────────

function ResultRowDetail({ row }: { row: ResultRow }) {
    const { locale } = useI18n()
    let step6Data: Record<string, unknown> = {}
    try {
        step6Data = row.step6_data_json ? JSON.parse(String(row.step6_data_json)) : {}
    } catch {
        step6Data = {}
    }
    return (
        <tr className="border-b border-border/10">
            <td colSpan={9} className="px-5 pb-4 pt-1">
                <div className="bg-surface/30 border border-border/40 rounded-2xl p-4 grid grid-cols-2 gap-x-12 gap-y-2 text-[11px]">
                    {row.status === 'done' && (
                        <div className="col-span-2 flex items-center gap-2 mb-2 p-2.5 bg-success/5 border border-success/20 rounded-xl">
                            <CheckCircle2 className="w-4 h-4 text-success" />
                            <span className="text-success font-medium text-xs">{locale === 'en' ? 'EIN Confirmed:' : 'EIN đã xác nhận:'}</span>
                            <span className="font-mono font-semibold text-text text-xs selection:bg-success/30">{row.confirmation_number}</span>
                            {row.step6_legal_name && <span className="text-[10px] text-muted">({row.step6_legal_name})</span>}
                            <button className="ml-auto p-1.5 hover:bg-success/10 rounded-lg transition-colors text-muted hover:text-success"
                                onClick={() => navigator.clipboard.writeText(row.confirmation_number!)}>
                                <Copy className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}
                    {row.status === 'failed' && row.error_message && (
                        <div className="col-span-2 flex items-start gap-2 mb-2 p-2.5 bg-danger/5 border border-danger/20 rounded-xl">
                            <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-danger font-bold text-xs">{row.error_code}</span>
                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${errorTypeLabel(row.error_type).cls}`}>
                                        {errorTypeLabel(row.error_type).text}
                                    </span>
                                </div>
                                <p className="text-danger/80 mt-0.5 leading-relaxed">{row.error_message}</p>
                            </div>
                        </div>
                    )}
                    {[
                        { label: 'Proxy Used', val: row.proxy_used, icon: <Globe className="w-3 h-3" /> },
                        { label: 'Proxy IP', val: row.proxy_ip, icon: <Globe className="w-3 h-3" /> },
                        { label: 'Error Type', val: row.error_type || '—', icon: <AlertCircle className="w-3 h-3" /> },
                        { label: 'Last Step', val: row.last_step, icon: <RefreshCw className="w-3 h-3" /> },
                        { label: 'Duration', val: getDurationSeconds(row) ? `${getDurationSeconds(row)}s` : '—', icon: <Clock className="w-3 h-3" /> },
                        { label: 'Attempts', val: row.attempt_count, icon: <RefreshCw className="w-3 h-3" /> },
                        { label: 'Source File', val: row.source_file, icon: <FileText className="w-3 h-3" /> },
                        { label: 'Batch ID', val: row.batch_id, icon: <Hash className="w-3 h-3" /> },
                        { label: 'Started', val: fmtDate(row.started_at), icon: <Calendar className="w-3 h-3" /> },
                        { label: 'Completed', val: fmtDate(row.completed_at), icon: <Calendar className="w-3 h-3" /> },
                        { label: 'Name Control', val: row.step6_name_control || step6Data.step6_name_control, icon: <FileText className="w-3 h-3" /> },
                        { label: 'County', val: row.step6_county || step6Data.step6_county, icon: <FileText className="w-3 h-3" /> },
                        { label: 'State', val: row.step6_state || step6Data.step6_state, icon: <FileText className="w-3 h-3" /> },
                        { label: 'Start Date', val: row.step6_start_date || step6Data.step6_start_date, icon: <Calendar className="w-3 h-3" /> },
                        { label: 'Phone', val: row.step6_phone_number || step6Data.step6_phone_number, icon: <Hash className="w-3 h-3" /> },
                        { label: 'Activity', val: row.step6_principal_activity || step6Data.step6_principal_activity, icon: <FileText className="w-3 h-3" /> },
                        { label: 'Product/Service', val: row.step6_principal_product_service || step6Data.step6_principal_product_service, icon: <FileText className="w-3 h-3" /> },
                        { label: 'Reason Applying', val: row.step6_reason_for_applying || step6Data.step6_reason_for_applying, icon: <FileText className="w-3 h-3" /> },
                        { label: 'Physical Location', val: row.step6_physical_location || step6Data.step6_physical_location, icon: <Globe className="w-3 h-3" /> },
                        { label: 'Responsible Name', val: row.step6_responsible_name || step6Data.step6_responsible_name, icon: <FileText className="w-3 h-3" /> },
                        { label: 'Responsible SSN/ITIN', val: row.step6_responsible_ssn_itin || step6Data.step6_responsible_ssn_itin, icon: <Hash className="w-3 h-3" /> },
                    ].map((item, idx) => (
                        <div key={idx} className="flex items-center gap-3 py-0.5 border-b border-border/5 last:border-0">
                            <span className="text-muted/60 w-24 shrink-0 flex items-center gap-1.5">
                                {item.icon}
                                {item.label}
                            </span>
                            <span className="font-mono text-text/90 truncate">{String(item.val ?? '—')}</span>
                        </div>
                    ))}
                    {(() => {
                        const effectivePdf = String(row.final_pdf_path || row.pdf_path || '').trim()
                        const effectiveArtifact = String(row.artifact_dir || '').trim()
                        const effectiveDrive = String(row.drive_pdf_url || '').trim()
                        return (effectivePdf || effectiveArtifact || effectiveDrive) && (
                            <div className="col-span-2 mt-1 flex items-center gap-3 text-[10px]">
                                {effectivePdf && (
                                    <button
                                        className="text-success hover:underline font-mono inline-flex items-center gap-1 font-semibold cursor-pointer"
                                        onClick={() => openPath(effectivePdf)}
                                        title="Mở file thông báo PDF"
                                    >
                                        <FileText className="w-3 h-3" /> Open PDF
                                    </button>
                                )}
                                {effectiveDrive && (
                                    <button
                                        className="text-sky-400 hover:underline font-mono inline-flex items-center gap-1 font-semibold cursor-pointer"
                                        onClick={() => openPath(effectiveDrive)}
                                        title={`Mở file trên Google Drive: ${effectiveDrive}`}
                                    >
                                        <Cloud className="w-3 h-3" /> Open Drive
                                    </button>
                                )}
                                {effectiveArtifact && (
                                    <button
                                        className="text-accent hover:underline font-mono inline-flex items-center gap-1 cursor-pointer"
                                        onClick={() => openPath(effectiveArtifact, true)}
                                        title="Mở thư mục artifact chứa file kết quả"
                                    >
                                        <FolderOpen className="w-3 h-3" /> Open Artifact Folder
                                    </button>
                                )}
                            </div>
                        )
                    })()}
                    {Object.keys(step6Data).length > 0 && (
                        <div className="col-span-2 mt-2 rounded-lg border border-border/40 bg-surface/50 p-2.5">
                            <div className="text-[10px] text-muted mb-1">Step 6 Parsed Data</div>
                            <pre className="text-[10px] leading-5 text-text/85 whitespace-pre-wrap break-words font-mono max-h-48 overflow-y-auto">
                                {JSON.stringify(step6Data, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
            </td>
        </tr>
    )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ResultsDashboard({
    results,
    onResultsChange,
    onHideRows,
    onUnhideRows,
    onOpenOutputFolder,
    onRefresh,
    onQuickExportStyled,
    onQuickExportSelected,
    onQuickExportSelectedNext,
    quickExportSelectedNextRunning = false,
    quickExportSelectedNextLabel = 'Upload đã chọn',
    onNotify,
}: {
    results: ResultRow[]
    onResultsChange?: (next: ResultRow[] | ((prev: ResultRow[]) => ResultRow[])) => void
    onHideRows?: (rows: ResultRow[]) => void
    onUnhideRows?: (rows?: ResultRow[], all?: boolean) => void
    onOpenOutputFolder?: () => void
    onRefresh?: () => void
    onQuickExportStyled?: (batchId: string, reportType?: 'report' | 'failures') => void
    onQuickExportSelected?: (rows: ResultRow[], reportType?: 'report' | 'failures') => void
    onQuickExportSelectedNext?: (rows: ResultRow[], reportType?: 'report' | 'failures') => void
    quickExportSelectedNextRunning?: boolean
    quickExportSelectedNextLabel?: string
    onNotify?: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void
}) {
    const { locale } = useI18n()
    void onQuickExportStyled
    const [search, setSearch] = useState('')

    // Display filter options in 1 dropdown checkbox
    const [displayFilterOpen, setDisplayFilterOpen] = useState(false)
    const [hideDriveUploaded, setHideDriveUploaded] = useState(() => {
        try { return localStorage.getItem('fox_hide_drive_uploaded') === 'true' } catch { return false }
    })
    const [onlyUnuploaded, setOnlyUnuploaded] = useState(() => {
        try { return localStorage.getItem('fox_only_unuploaded') === 'true' } catch { return false }
    })
    const [onlyUploaded, setOnlyUploaded] = useState(() => {
        try { return localStorage.getItem('fox_only_uploaded') === 'true' } catch { return false }
    })
    const [showHidden, setShowHidden] = useState(() => {
        try { return localStorage.getItem('fox_show_hidden') === 'true' } catch { return false }
    })

    const toggleHideDriveUploaded = (val: boolean) => {
        setHideDriveUploaded(val)
        try { localStorage.setItem('fox_hide_drive_uploaded', String(val)) } catch {}
    }
    const toggleOnlyUnuploaded = (val: boolean) => {
        setOnlyUnuploaded(val)
        if (val) setOnlyUploaded(false)
        try {
            localStorage.setItem('fox_only_unuploaded', String(val))
            if (val) localStorage.setItem('fox_only_uploaded', 'false')
        } catch {}
    }
    const toggleOnlyUploaded = (val: boolean) => {
        setOnlyUploaded(val)
        if (val) setOnlyUnuploaded(false)
        try {
            localStorage.setItem('fox_only_uploaded', String(val))
            if (val) localStorage.setItem('fox_only_unuploaded', 'false')
        } catch {}
    }
    const toggleShowHidden = (val: boolean) => {
        setShowHidden(val)
        try { localStorage.setItem('fox_show_hidden', String(val)) } catch {}
    }

    // Persisted date filters
    const [dateFrom, setDateFromState] = useState(() => {
        try { return localStorage.getItem('fox_results_date_from') || '' } catch { return '' }
    })
    const [dateTo, setDateToState] = useState(() => {
        try { return localStorage.getItem('fox_results_date_to') || '' } catch { return '' }
    })

    const setDateFrom = (val: string) => {
        setDateFromState(val)
        try { localStorage.setItem('fox_results_date_from', val) } catch {}
    }
    const setDateTo = (val: string) => {
        setDateToState(val)
        try { localStorage.setItem('fox_results_date_to', val) } catch {}
    }

    const setTodayFilter = () => {
        const d = new Date()
        d.setHours(0, 0, 0, 0)
        const pad = (n: number) => String(n).padStart(2, '0')
        const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00`
        setDateFrom(iso)
        setDateTo('')
    }

    const setAllTimeFilter = () => {
        setDateFrom('')
        setDateTo('')
    }

    const [statusFilter, setStatusFilter] = useState<'all' | 'done' | 'failed'>('all')
    const [batchFilter, setBatchFilter] = useState<string>('all')
    const [errorFilter, setErrorFilter] = useState<string>('all')
    const [sortField, setSortField] = useState<SortField>('completed_at')
    const [sortDir, setSortDir] = useState<SortDir>('desc')
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [selected, setSelected] = useState<Set<string>>(new Set())

    // ─── Auto Validate & Fix Postal Data ─────────────────────────────────────
    const [fixZipOpen, setFixZipOpen] = useState(false)
    const [fixZipScope, setFixZipScope] = useState<'all' | 'filtered' | 'selected'>('all')
    const [fixZipSyncDrive, setFixZipSyncDrive] = useState(true)
    const [fixZipRunning, setFixZipRunning] = useState(false)
    const [fixZipProgress, setFixZipProgress] = useState<{ current: number; total: number; percent: number } | null>(null)
    const [fixZipStats, setFixZipStats] = useState({ fixed_records: 0, fixed_pdfs: 0, synced_drive: 0, fixed_queue_jobs: 0 })
    const [fixZipLog, setFixZipLog] = useState<string[]>([])
    const [fixZipResult, setFixZipResult] = useState<{ message: string } | null>(null)
    const fixZipLogRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const ipc = window.electron?.ipcRenderer
        if (!ipc) return
        const handler = (_: unknown, data: any) => {
            if (data?.type === 'progress') {
                const cur = Number(data.current || 0)
                const tot = Number(data.total || 0)
                const pct = tot > 0 ? Math.min(100, Math.round((cur / tot) * 100)) : 0
                setFixZipProgress({ current: cur, total: tot, percent: pct })
                setFixZipStats({
                    fixed_records: Number(data.fixed_records || 0),
                    fixed_pdfs: Number(data.fixed_pdfs || 0),
                    synced_drive: Number(data.synced_drive || 0),
                    fixed_queue_jobs: Number(data.fixed_queue_jobs || 0),
                })
            }
            const msg = typeof data?.message === 'string' ? data.message : JSON.stringify(data)
            setFixZipLog(prev => [...prev.slice(-200), msg])
            if (data?.type === 'done') {
                setFixZipRunning(false)
                setFixZipProgress((prev) => {
                    const total = data.total || data.matched || data.scanned || prev?.total || 0
                    return { current: total, total, percent: 100 }
                })
                setFixZipStats({
                    fixed_records: Number(data.fixed_records || 0),
                    fixed_pdfs: Number(data.fixed_pdfs || 0),
                    synced_drive: Number(data.synced_drive || 0),
                    fixed_queue_jobs: Number(data.fixed_queue_jobs || 0),
                })
                setFixZipResult({ message: data.message || '✅ Hoàn tất Auto Validate thành công!' })
                onRefresh?.()
            }
            if (data?.type === 'error') {
                setFixZipRunning(false)
                setFixZipResult({ message: `❌ ${data.message || 'Có lỗi xảy ra khi Auto Validate'}` })
            }
        }
        ipc.on('irs:auto-validate:progress', handler)
        ipc.on('irs:fix-output-zips:progress', handler)
        return () => {
            ipc.removeListener?.('irs:auto-validate:progress', handler)
            ipc.removeListener?.('irs:fix-output-zips:progress', handler)
        }
    }, [onRefresh])

    useEffect(() => {
        if (fixZipLogRef.current) fixZipLogRef.current.scrollTop = fixZipLogRef.current.scrollHeight
    }, [fixZipLog])

    const batches = useMemo(() => ['all', ...new Set(results.map(r => r.batch_id ?? '').filter(Boolean))], [results])

    const viewCounts = useMemo(() => {
        const notHidden = results.filter(r => !r.is_hidden)
        return {
            all: notHidden.length,
            unuploaded: notHidden.filter(r => !r.uploaded_to_drive).length,
            uploaded: notHidden.filter(r => r.uploaded_to_drive).length,
            hidden: results.filter(r => r.is_hidden).length,
        }
    }, [results])

    const filtered = useMemo(() => {
        const q = search.toLowerCase()
        return results.filter(r => {
            if (showHidden) {
                if (!r.is_hidden) return false
            } else {
                if (r.is_hidden) return false
                if (onlyUnuploaded && r.uploaded_to_drive) return false
                if (onlyUploaded && !r.uploaded_to_drive) return false
                if (hideDriveUploaded && r.uploaded_to_drive) return false
            }
            if (statusFilter !== 'all' && r.status !== statusFilter) return false
            if (batchFilter !== 'all' && r.batch_id !== batchFilter) return false
            if (errorFilter !== 'all' && r.error_code !== errorFilter) return false
            if (dateFrom || dateTo) {
                if (!r.completed_at) return false
                const completedAtMs = new Date(r.completed_at).getTime()
                if (!Number.isFinite(completedAtMs)) return false
                if (dateFrom) {
                    const fromMs = new Date(dateFrom).getTime()
                    if (Number.isFinite(fromMs) && completedAtMs < fromMs) return false
                }
                if (dateTo) {
                    const toMs = new Date(dateTo).getTime()
                    if (Number.isFinite(toMs) && completedAtMs > toMs) return false
                }
            }
            if (q) {
                const blob = [r.name, r.ein, r.record_id, r.confirmation_number, r.error_code].join(' ').toLowerCase()
                if (!blob.includes(q)) return false
            }
            return true
        }).sort((a, b) => {
            let av: string | number = a[sortField] as string | number ?? ''
            let bv: string | number = b[sortField] as string | number ?? ''
            if (sortField === 'completed_at') { av = new Date(av as string).getTime() || 0; bv = new Date(bv as string).getTime() || 0 }
            const cmp = av < bv ? -1 : av > bv ? 1 : 0
            return sortDir === 'asc' ? cmp : -cmp
        })
    }, [results, showHidden, onlyUnuploaded, onlyUploaded, hideDriveUploaded, search, statusFilter, batchFilter, errorFilter, dateFrom, dateTo, sortField, sortDir])

    const stats = useMemo(() => ({
        total: filtered.length,
        done: filtered.filter(r => r.status === 'done').length,
        failed: filtered.filter(r => r.status === 'failed').length,
        avgDuration: (() => {
            const durations = filtered.map(getDurationSeconds).filter((v): v is number => typeof v === 'number' && v > 0)
            if (!durations.length) return 0
            return Math.round(durations.reduce((s, v) => s + v, 0) / durations.length)
        })(),
    }), [filtered])

    const toggleSort = (f: SortField) => {
        if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        else { setSortField(f); setSortDir('desc') }
    }

    const SortIcon = ({ f }: { f: SortField }) => sortField !== f ? null :
        sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />

    const download = useCallback((subset: ResultRow[], label: string) => {
        const ts = new Date().toISOString().slice(0, 10)
        downloadCsv(buildCsv(subset, true), `irs_results_${label}_${ts}.csv`)
    }, [])

    const resetFilters = () => {
        setSearch('')
        setStatusFilter('all')
        setBatchFilter('all')
        setErrorFilter('all')
        setDateFrom('')
        setDateTo('')
        setOnlyUnuploaded(false)
        setOnlyUploaded(false)
        setShowHidden(false)
        setHideDriveUploaded(false)
    }

    const hasFilter = search || statusFilter !== 'all' || batchFilter !== 'all' || errorFilter !== 'all' || dateFrom || dateTo || onlyUnuploaded || onlyUploaded || showHidden || hideDriveUploaded
    const allSelected = filtered.length > 0 && filtered.every(r => selected.has(`${r.batch_id}:${r.record_id}`))

    const toggleSelectRow = (row: ResultRow, checked: boolean) => {
        const key = `${row.batch_id}:${row.record_id}`
        setSelected(prev => {
            const next = new Set(prev)
            if (checked) next.add(key)
            else next.delete(key)
            return next
        })
    }

    const toggleSelectAllFiltered = (checked: boolean) => {
        setSelected(prev => {
            const next = new Set(prev)
            filtered.forEach(r => {
                const key = `${r.batch_id}:${r.record_id}`
                if (checked) next.add(key)
                else next.delete(key)
            })
            return next
        })
    }

    const selectedRows = filtered.filter(r => selected.has(`${r.batch_id}:${r.record_id}`))

    const runFixZip = useCallback(async () => {
        const ipc = window.electron?.ipcRenderer
        if (!ipc) { onNotify?.('IPC unavailable', 'error'); return }
        setFixZipRunning(true)
        setFixZipLog([])
        setFixZipResult(null)
        setFixZipProgress(null)
        setFixZipStats({ fixed_records: 0, fixed_pdfs: 0, synced_drive: 0, fixed_queue_jobs: 0 })

        let scope = 'all'
        let keys: string[] = []
        if (fixZipScope === 'selected') {
            scope = 'all'
            keys = selectedRows.map(r => `${r.batch_id}:${r.record_id}`)
        } else if (fixZipScope === 'filtered') {
            scope = 'all'
            keys = filtered.map(r => `${r.batch_id}:${r.record_id}`)
        } else {
            scope = 'all'
        }

        try {
            await ipc.invoke('irs:auto-validate', {
                scope,
                keys,
                syncDrive: fixZipSyncDrive,
            })
        } catch (err) {
            setFixZipRunning(false)
            onNotify?.(`Auto Validate lỗi: ${String(err)}`, 'error')
        }
    }, [fixZipScope, fixZipSyncDrive, selectedRows, filtered, onNotify])

    const collectPdfs = useCallback(async (rows: ResultRow[], scope: 'selected' | 'batch', batchId?: string, nextOnly = false) => {
        if (!rows.length) {
            onNotify?.('Không có record để gom PDF', 'warning')
            return
        }
        const ipc = window.electron?.ipcRenderer
        if (!ipc) {
            onNotify?.('IPC unavailable', 'error')
            return
        }
        const payloadRows = rows.map((r) => ({
            record_id: r.record_id,
            batch_id: r.batch_id,
            name: r.name,
            step6_ein: r.ein || '',
            confirmation_number: r.confirmation_number || '',
            pdf_path: r.pdf_path,
            final_pdf_path: r.final_pdf_path,
        }))
        try {
            const res = await ipc.invoke('irs:pdf:collect', { rows: payloadRows, scope, batchId, nextOnly })
            if (!res?.ok) {
                onNotify?.(`Gom PDF lỗi: ${String(res?.error || 'unknown error')}`, 'error')
                return
            }
            const copied = Number(res?.copied || 0)
            const total = Number(res?.total || rows.length)
            const missing = Array.isArray(res?.missing) ? res.missing.length : 0
            const skippedDup = Number(res?.skipped_duplicates || 0)
            const part = Number(res?.part || 0)
            const folder = String(res?.folder || '')
            const partText = part > 0 ? ` part ${part}` : ''
            onNotify?.(
                `Đã gom PDF${nextOnly ? `${partText} (next)` : ''}: ${copied}/${total}${missing ? ` (thiếu ${missing})` : ''}${skippedDup ? ` (trùng ${skippedDup})` : ''}`,
                copied > 0 ? 'success' : 'warning',
            )
            if (folder) {
                await ipc.invoke('irs:open-path', { path: folder, reveal: true })
            }
        } catch (err) {
            onNotify?.(`Gom PDF lỗi: ${String(err)}`, 'error')
        }
    }, [onNotify])

    return (
        <div className="flex flex-col h-full min-h-0 bg-base/5">
            <div className="flex items-center gap-8 px-5 py-3 border-b border-border bg-base/20 shrink-0 select-none">
                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted uppercase tracking-widest font-medium">{locale === 'en' ? 'Outcomes' : 'Kết quả'}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            {dateFrom || dateTo ? (locale === 'en' ? 'Custom Range' : 'Theo khoảng ngày') : (locale === 'en' ? 'All Time' : 'Toàn thời gian')}
                        </span>
                    </div>
                    <div className="flex items-center gap-4 mt-0.5">
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-xl font-bold text-text tabular-nums">{stats.total}</span>
                            <span className="text-[10px] text-muted uppercase">{locale === 'en' ? 'Results' : 'Dòng'}</span>
                        </div>
                        <div className="h-6 w-px bg-border/40" />
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-success" />
                                <div className="flex flex-col leading-none">
                                    <span className="text-sm font-bold text-success tabular-nums">{stats.done}</span>
                                    <span className="text-[9px] text-muted uppercase">{locale === 'en' ? 'Completed' : 'Hoàn tất'}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-danger" />
                                <div className="flex flex-col leading-none">
                                    <span className="text-sm font-bold text-danger tabular-nums">{stats.failed}</span>
                                    <span className="text-[9px] text-muted uppercase">{locale === 'en' ? 'Failed' : 'Thất bại'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col ml-8">
                    <span className="text-[10px] text-muted uppercase tracking-widest font-medium">{locale === 'en' ? 'Performance' : 'Hiệu suất'}</span>
                    <div className="flex items-center gap-4 mt-1">
                        <div className="flex items-center gap-2">
                            <BarChart3 className="w-3.5 h-3.5 text-accent" />
                            <span className="text-sm font-bold tabular-nums text-text">{stats.total ? Math.round(stats.done / stats.total * 100) : 0}%</span>
                            <span className="text-[10px] text-muted uppercase">{locale === 'en' ? 'Success Rate' : 'Tỷ lệ thành công'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-muted" />
                            <span className="text-xs font-semibold tabular-nums text-text/80">{stats.avgDuration}s</span>
                            <span className="text-[10px] text-muted uppercase">{locale === 'en' ? 'Avg Time' : 'TG trung bình'}</span>
                        </div>
                    </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    {onQuickExportSelected && (
                        <Button
                            variant="secondary"
                            size="xs"
                            className="gap-1.5 bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30 shadow-xs"
                            title={locale === 'en' ? 'Export filtered results to styled Excel (.xlsx)' : 'Xuất kết quả danh sách đang lọc ra file Excel (.xlsx)'}
                            onClick={() => onQuickExportSelected(filtered, 'report')}
                        >
                            <Download className="w-3.5 h-3.5" />
                            {locale === 'en' ? 'Export Excel' : 'Xuất Excel'}
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="xs"
                        className="gap-1.5 text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 border border-sky-500/20"
                        title="Mở thư mục tổng Google Drive chứa toàn bộ PDF và báo cáo"
                        onClick={() => openPath('https://drive.google.com/drive/folders/1T2dKn2ZKq77xsPBV-fI_Qo-DUyyZi5-d')}
                    >
                        <Cloud className="w-3.5 h-3.5" />
                        {locale === 'en' ? 'Drive Folder' : 'Thư mục Drive'}
                    </Button>
                    <Button variant="ghost" size="xs" className="gap-1.5 text-muted hover:text-text" onClick={() => download(filtered, (dateFrom || dateTo) ? 'custom' : 'all')}>
                        <Download className="w-3.5 h-3.5" />CSV
                    </Button>
                    {selectedRows.length > 0 && (
                        <>
                            <Button variant="ghost" size="xs" className="gap-1.5 text-accent" onClick={() => download(selectedRows, 'selected')}>
                        <Download className="w-3.5 h-3.5" />{locale === 'en' ? 'Selected' : 'Đã chọn'} ({selectedRows.length})
                            </Button>
                            {showHidden ? (
                                <>
                                    <Button
                                        variant="ghost"
                                        size="xs"
                                        className="gap-1.5 text-success hover:text-success/90"
                                        onClick={() => {
                                            onUnhideRows?.(selectedRows)
                                            setSelected(new Set())
                                        }}
                                    >
                                        <RotateCcw className="w-3.5 h-3.5" />{locale === 'en' ? 'Restore Selected' : 'Khôi phục mục chọn'}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="xs"
                                        className="gap-1.5 text-muted hover:text-text"
                                        onClick={() => {
                                            onUnhideRows?.(undefined, true)
                                            setSelected(new Set())
                                        }}
                                    >
                                        <Eye className="w-3.5 h-3.5" />{locale === 'en' ? 'Restore All' : 'Khôi phục tất cả'}
                                    </Button>
                                </>
                            ) : (
                                <Button
                                    variant="ghost"
                                    size="xs"
                                    className="gap-1.5 text-danger hover:text-danger/90"
                                    title={locale === 'en' ? 'Hide selected from view (data remains safely preserved in CSV/DB)' : 'Ẩn các dòng đã chọn khỏi bảng hiển thị (dữ liệu gốc vẫn lưu an toàn trong file)'}
                                    onClick={() => {
                                        if (onHideRows) {
                                            onHideRows(selectedRows)
                                        } else if (onResultsChange) {
                                            const selectedKeys = new Set(selectedRows.map(r => `${r.batch_id}:${r.record_id}`))
                                            onResultsChange(prev => prev.filter(r => !selectedKeys.has(`${r.batch_id}:${r.record_id}`)))
                                        }
                                        setSelected(new Set())
                                    }}
                                >
                                    <EyeOff className="w-3.5 h-3.5" />{locale === 'en' ? 'Hide Selected' : 'Ẩn mục chọn'}
                                </Button>
                            )}
                        </>
                    )}
                </div>
            </div>

            <div className="px-4 py-2 border-b border-border bg-panel shrink-0">
                <div className="flex flex-wrap items-center gap-2">
                <div className="relative group shrink-0">
                    <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2 group-focus-within:text-accent transition-colors" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={locale === 'en' ? 'Search records...' : 'Tìm record...'}
                        className="h-8 pl-8 pr-3 text-[11px] bg-surface border border-border rounded-xl text-text placeholder:text-muted/40 focus:outline-none focus:border-accent/40 w-64 transition-all"
                    />
                </div>
                <div className="w-px h-5 bg-border mx-1" />
                <div className="flex items-center gap-1.5 shrink-0 bg-surface border border-border rounded-xl px-2 py-0.5">
                    <div className="flex items-center gap-1 text-[10px] font-medium text-muted">
                        <Calendar className="w-3 h-3 text-accent" />
                    </div>
                    <input
                        type="datetime-local"
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        className="h-7 px-1.5 text-[10px] bg-transparent border-0 text-text focus:outline-none w-[165px]"
                        title="Từ ngày/giờ (From)"
                    />
                    <span className="text-[10px] text-muted">➔</span>
                    <input
                        type="datetime-local"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        className="h-7 px-1.5 text-[10px] bg-transparent border-0 text-text focus:outline-none w-[165px]"
                        title="Đến ngày/giờ (To)"
                    />
                    <button
                        onClick={setTodayFilter}
                        className={`h-6 px-1.5 text-[10px] font-medium rounded transition-colors ${dateFrom && !dateTo ? 'bg-accent/20 text-accent font-semibold' : 'text-muted hover:text-text'}`}
                        title="Lọc nhanh từ 00:00 hôm nay"
                    >
                        {locale === 'en' ? 'Today' : 'Hôm nay'}
                    </button>
                    {(dateFrom || dateTo) && (
                        <button
                            onClick={setAllTimeFilter}
                            className="h-6 px-1 text-[10px] text-muted hover:text-danger transition-colors"
                            title="Bỏ lọc thời gian (Tất cả)"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    )}
                </div>

                <div className="w-px h-5 bg-border mx-1" />
                <select
                    value={batchFilter}
                    onChange={e => setBatchFilter(e.target.value)}
                    className="h-8 px-2 text-[11px] bg-surface border border-border rounded-xl text-muted focus:outline-none focus:border-accent/40 w-[140px]"
                >
                    {batches.map(b => <option key={b} value={b}>{b === 'all' ? (locale === 'en' ? 'All batches' : 'Tất cả batch') : b}</option>)}
                </select>

                {/* Display filter options in 1 clean dropdown */}
                <div className="relative">
                    <button
                        onClick={() => setDisplayFilterOpen(v => !v)}
                        className={`h-8 px-2.5 text-[11px] font-medium rounded-xl border flex items-center gap-1.5 transition-all ${
                            (hideDriveUploaded || onlyUnuploaded || onlyUploaded || showHidden)
                                ? 'bg-sky-500/15 border-sky-500/40 text-sky-300 font-semibold'
                                : 'bg-surface border-border text-muted hover:text-text'
                        }`}
                        title="Tùy chọn lọc hiển thị Google Drive và mục ẩn"
                    >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        {locale === 'en' ? 'Display Filters' : 'Lọc hiển thị'}
                        {(hideDriveUploaded || onlyUnuploaded || onlyUploaded || showHidden) && (
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                        )}
                        <ChevronDown className="w-3 h-3 opacity-60" />
                    </button>

                    {displayFilterOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setDisplayFilterOpen(false)} />
                            <div className="absolute left-0 mt-1.5 w-64 bg-panel border border-border rounded-2xl shadow-2xl p-3 z-50 flex flex-col gap-2.5 text-[11px]">
                                <div className="font-semibold text-text text-[10px] uppercase tracking-wider text-muted mb-0.5">
                                    {locale === 'en' ? 'Display Options' : 'Tùy chọn hiển thị'}
                                </div>
                                <label className="flex items-center gap-2 cursor-pointer hover:text-text text-muted transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={hideDriveUploaded}
                                        onChange={e => toggleHideDriveUploaded(e.target.checked)}
                                        className="rounded border-border text-accent focus:ring-0"
                                    />
                                    <span>{locale === 'en' ? 'Hide already on Drive' : 'Ẩn hồ sơ đã lên Google Drive'}</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer hover:text-text text-muted transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={onlyUnuploaded}
                                        onChange={e => toggleOnlyUnuploaded(e.target.checked)}
                                        className="rounded border-border text-accent focus:ring-0"
                                    />
                                    <span>{locale === 'en' ? 'Only not yet on Drive' : 'Chỉ hiện hồ sơ CHƯA lên Drive'} ({viewCounts.unuploaded})</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer hover:text-text text-muted transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={onlyUploaded}
                                        onChange={e => toggleOnlyUploaded(e.target.checked)}
                                        className="rounded border-border text-accent focus:ring-0"
                                    />
                                    <span>{locale === 'en' ? 'Only already on Drive' : 'Chỉ hiện hồ sơ ĐÃ lên Drive'} ({viewCounts.uploaded})</span>
                                </label>
                                <div className="h-px bg-border/40 my-0.5" />
                                <label className="flex items-center gap-2 cursor-pointer hover:text-purple-300 text-muted transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={showHidden}
                                        onChange={e => toggleShowHidden(e.target.checked)}
                                        className="rounded border-border text-purple-500 focus:ring-0"
                                    />
                                    <span>{locale === 'en' ? 'Show hidden records' : 'Xem các dòng đã ẩn (Hidden)'} ({viewCounts.hidden})</span>
                                </label>
                                {viewCounts.hidden > 0 && showHidden && onUnhideRows && (
                                    <button
                                        onClick={() => { onUnhideRows(undefined, true); setShowHidden(false) }}
                                        className="text-[10px] text-purple-400 hover:underline text-left mt-1"
                                    >
                                        {locale === 'en' ? 'Restore all hidden records' : 'Khôi phục toàn bộ các dòng đã ẩn'}
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {hasFilter && (
                    <button onClick={resetFilters} className="h-8 px-2 rounded-xl border border-border bg-danger/5 text-[10px] text-danger hover:bg-danger/10 transition-colors flex items-center gap-1.5" title="Xóa toàn bộ các bộ lọc đang chọn">
                        <X className="w-3 h-3" />Clear
                    </button>
                )}
                <div className="ml-auto flex flex-wrap items-center gap-2 shrink-0 pl-2">
                    <Button
                        variant="secondary"
                        size="xs"
                        className="h-8 gap-1.5 rounded-xl px-3"
                        onClick={() => collectPdfs(selectedRows, 'selected', batchFilter !== 'all' ? String(batchFilter) : undefined)}
                        disabled={selectedRows.length === 0}
                    >
                        <Download className="w-3.5 h-3.5" />{locale === 'en' ? 'Export PDFs' : 'Xuất PDF'} {selectedRows.length ? `(${selectedRows.length})` : ''}
                    </Button>
                    <Button
                        variant="secondary"
                        size="xs"
                        className="h-8 gap-1.5 rounded-xl px-3"
                        onClick={() => collectPdfs(selectedRows, 'selected', batchFilter !== 'all' ? String(batchFilter) : undefined, true)}
                        disabled={selectedRows.length === 0}
                    >
                        <Download className="w-3.5 h-3.5" />{locale === 'en' ? 'Next PDFs' : 'PDF tiếp theo'}
                    </Button>
                    <Button
                        variant="secondary"
                        size="xs"
                        className="h-8 gap-1.5 rounded-xl px-3"
                        onClick={() => onOpenOutputFolder?.()}
                    >
                        <FolderOpen className="w-3.5 h-3.5" />{locale === 'en' ? 'Output' : 'Thư mục output'}
                    </Button>
                    {onRefresh && (
                        <Button
                            variant="secondary"
                            size="xs"
                            className="h-8 gap-1.5 rounded-xl px-3"
                            onClick={() => onRefresh()}
                            title="Tải lại toàn bộ kết quả từ ổ đĩa"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />{locale === 'en' ? 'Refresh' : 'Làm mới'}
                        </Button>
                    )}
                    <Button
                        variant="secondary"
                        size="xs"
                        className={`h-8 gap-1.5 rounded-xl px-3 border ${fixZipRunning ? 'border-indigo-400/60 bg-indigo-500/10 text-indigo-300 animate-pulse' : 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20'}`}
                        onClick={() => setFixZipOpen(true)}
                        title="Tự động rà soát & chuẩn hóa mã ZIP cho toàn bộ Kết quả, Hàng đợi (Queue) và File nhập"
                    >
                        <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                        {fixZipRunning ? (locale === 'en' ? 'Validating...' : 'Đang Auto Validate...') : (locale === 'en' ? 'Auto Validate' : 'Auto Validate')}
                    </Button>

                    <Button
                        variant="secondary"
                        size="xs"
                        className="h-8 gap-1.5 rounded-xl px-3"
                        onClick={() => {
                            if (!selectedRows.length) {
                                onNotify?.('Hãy tick ít nhất 1 record để export report selected', 'warning')
                                return
                            }
                            const reportType = statusFilter === 'failed' ? 'failures' : 'report'
                            onQuickExportSelected?.(selectedRows, reportType)
                        }}
                        disabled={selectedRows.length === 0}
                    >
                        <Download className="w-3.5 h-3.5" />{locale === 'en' ? 'Export Report' : 'Xuất báo cáo'} {selectedRows.length ? `(${selectedRows.length})` : ''}
                    </Button>
                    <Button
                        variant="secondary"
                        size="xs"
                        className={`h-8 gap-1.5 rounded-xl px-3 ${quickExportSelectedNextRunning ? 'opacity-80' : ''}`}
                        onClick={() => {
                            if (quickExportSelectedNextRunning) return
                            if (!selectedRows.length) {
                                onNotify?.('Hãy tick ít nhất 1 record để upload selected', 'warning')
                                return
                            }
                            const reportType = statusFilter === 'failed' ? 'failures' : 'report'
                            onQuickExportSelectedNext?.(selectedRows, reportType)
                        }}
                        disabled={selectedRows.length === 0 || quickExportSelectedNextRunning}
                    >
                        {quickExportSelectedNextRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        {quickExportSelectedNextRunning ? quickExportSelectedNextLabel : (locale === 'en' ? 'Upload Selection' : 'Tải lên mục đã chọn')}
                    </Button>
                </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 px-4 pt-2">
                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted gap-4 opacity-50">
                        <div className="w-16 h-16 rounded-full bg-surface border border-border flex items-center justify-center">
                            <Filter className="w-8 h-8" />
                        </div>
                        <div className="text-center font-bold">{locale === 'en' ? 'No records found' : 'Không có record'}</div>
                    </div>
                ) : (
                    <table className="w-full text-[11px] border-separate border-spacing-0">
                        <thead className="sticky top-0 bg-panel border-b border-border z-10">
                            <tr>
                                <th className="w-8 p-0 pl-2">
                                    <input
                                        type="checkbox"
                                        checked={allSelected}
                                        onChange={(e) => toggleSelectAllFiltered(e.target.checked)}
                                        className="ba-checkbox"
                                    />
                                </th>
                                <th className="w-8 p-0" />
                                {[
                                    { label: 'Record / EIN', f: 'name' as SortField },
                                    { label: locale === 'en' ? 'Status' : 'Trạng thái', f: 'status' as SortField },
                                    { label: 'Confirm' },
                                    { label: 'Drive' },
                                    { label: locale === 'en' ? 'Detail' : 'Chi tiết' },
                                    { label: 'Proxy' },
                                    { label: locale === 'en' ? 'Time' : 'Thời gian', f: 'duration_s' as SortField },
                                    { label: locale === 'en' ? 'Completed' : 'Xong lúc', f: 'completed_at' as SortField },
                                ].map(col => (
                                    <th key={col.label}
                                        onClick={col.f ? () => toggleSort(col.f!) : undefined}
                                        className={`text-left text-muted font-bold uppercase px-3 py-3 border-b border-border/60 ${col.f ? 'cursor-pointer hover:text-accent select-none' : ''}`}
                                    >
                                        <span className="flex items-center gap-1.5">
                                            {col.label}
                                            {col.f && <SortIcon f={col.f} />}
                                        </span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                            {filtered.map(row => (
                                <Fragment key={`${row.batch_id}:${row.record_id}`}>
                                    <tr
                                        onClick={() => setExpandedId(p => p === row.record_id ? null : row.record_id)}
                                        className={`group cursor-pointer transition-all hover:bg-surface border-transparent border-l-2 ${expandedId === row.record_id ? 'bg-surface border-l-accent' : row.status === 'done' ? 'hover:border-l-success' : 'hover:border-l-danger'}`}
                                    >
                                        <td className="pl-2 pr-0 py-3 w-8" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={selected.has(`${row.batch_id}:${row.record_id}`)}
                                                onChange={(e) => toggleSelectRow(row, e.target.checked)}
                                                className="ba-checkbox"
                                            />
                                        </td>
                                        <td className="pl-4 pr-0 py-3 w-8">
                                            <ChevronRight className={`w-3.5 h-3.5 text-muted/30 transition-transform ${expandedId === row.record_id ? 'rotate-90 text-accent' : ''}`} />
                                        </td>
                                        <td className="px-3 py-3">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-bold text-text group-hover:text-accent transition-colors truncate max-w-[180px]">{row.name}</span>
                                                {row.is_hidden && (
                                                    <span className="text-[9px] font-semibold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1 py-0.2 rounded shrink-0">Ẩn</span>
                                                )}
                                            </div>
                                            <div className="font-mono text-muted/50 text-[10px] mt-0.5">{row.ein}</div>
                                        </td>
                                        <td className="px-3 py-3">
                                            {row.status === 'done'
                                                ? <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-success bg-success/10 px-2 py-1 rounded-full"><Check className="w-3 h-3" />{locale === 'en' ? 'Completed' : 'Hoàn tất'}</span>
                                                : <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-danger bg-danger/10 px-2 py-1 rounded-full"><X className="w-3 h-3" />{locale === 'en' ? 'Failed' : 'Thất bại'}</span>
                                            }
                                        </td>
                                        <td className="px-3 py-3">
                                            {row.confirmation_number
                                                ? <span className="font-mono font-bold text-success/80 text-[10px] bg-success/5 border border-success/10 px-1.5 py-0.5 rounded">{row.confirmation_number}</span>
                                                : <span className="text-muted/30">—</span>
                                            }
                                        </td>
                                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                                            {row.uploaded_to_drive ? (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        if (row.drive_pdf_url) {
                                                            openPath(row.drive_pdf_url)
                                                        }
                                                    }}
                                                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-400 bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 rounded-full hover:bg-sky-500/20 transition-colors cursor-pointer"
                                                    title={row.drive_pdf_url ? `Mở: ${row.drive_pdf_url}` : 'Đã tải lên Google Drive'}
                                                >
                                                    <Cloud className="w-3 h-3" /> Drive
                                                </button>
                                            ) : (
                                                <span className="text-muted/30 text-[10px]">Chưa lên</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-3">
                                            {row.error_code ? (
                                                <div className="max-w-[180px]">
                                                    <span className="font-bold text-danger/70 text-[10px] truncate max-w-[120px] block">{row.error_code}</span>
                                                    {row.error_type && (
                                                        <span className={`inline-flex mt-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${errorTypeLabel(row.error_type).cls}`}>
                                                            {errorTypeLabel(row.error_type).text}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="max-w-[180px]">
                                                    <div className="text-text/85 text-[10px] truncate">{row.step6_legal_name || row.last_step || '—'}</div>
                                                    <div className="text-muted/60 text-[10px] truncate">{row.step6_principal_activity || row.step6_principal_product_service || '—'}</div>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-3 py-3 text-muted/80 font-mono text-[10px]">{row.proxy_used ?? '—'}</td>
                                        <td className="px-3 py-3 text-muted tabular-nums font-mono">{getDurationSeconds(row) ? `${getDurationSeconds(row)}s` : '—'}</td>
                                        <td className="px-3 py-3 text-muted/80 tabular-nums">{fmtDate(row.completed_at)}</td>
                                    </tr>
                                    {expandedId === row.record_id && <ResultRowDetail key={`d-${row.batch_id}-${row.record_id}`} row={row} />}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── Fix Output ZIPs Modal ─────────────────────────────────────── */}
            {fixZipOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { if (!fixZipRunning) setFixZipOpen(false) }}>
                    <div className="relative w-[520px] max-h-[88vh] flex flex-col bg-panel border border-border rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="flex items-center gap-3 px-5 pt-5 pb-3 border-b border-border">
                            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center shrink-0">
                                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                            </div>
                            <div>
                                <div className="text-sm font-semibold text-text">{locale === 'en' ? 'Auto Validate Postal Data' : 'Auto Validate Dữ liệu & Mã ZIP'}</div>
                                <div className="text-[11px] text-muted mt-0.5">{locale === 'en' ? 'Validates all queue jobs (all statuses), done results & notice PDFs. Enforces physical street delivery ZIPs.' : 'Rà soát chuẩn hóa: (1) Toàn bộ Hàng đợi Queue (all status), (2) Kết quả đã chạy & PDF notice, (3) Tự động kích hoạt cho các file nạp tương lai.'}</div>
                            </div>
                            {!fixZipRunning && (
                                <button onClick={() => setFixZipOpen(false)} className="ml-auto p-1.5 text-muted hover:text-text hover:bg-surface rounded-lg transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        {/* Scope & Options */}
                        <div className="px-5 py-4 border-b border-border">
                            <div className="text-[11px] font-medium text-muted mb-2">{locale === 'en' ? 'Scope for results scan:' : 'Phạm vi quét & chuẩn hóa:'}</div>
                            <div className="flex gap-2 flex-wrap mb-3">
                                {([
                                    ['all', `📋 Toàn bộ (${results.length} dòng + Queue)`, `📋 All (${results.length} rows + Queue)`],
                                    ['filtered', `🔍 Đang lọc (${filtered.length} dòng)`, `🔍 Filtered (${filtered.length} rows)`],
                                    ['selected', `☑️ Đã chọn (${selectedRows.length} dòng)`, `☑️ Selected (${selectedRows.length} rows)`],
                                ] as const).map(([val, labelVi, labelEn]) => (
                                    <button
                                        key={val}
                                        onClick={() => setFixZipScope(val as any)}
                                        disabled={fixZipRunning || (val === 'selected' && selectedRows.length === 0)}
                                        className={`h-8 px-3 text-[11px] font-semibold rounded-xl border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${fixZipScope === val ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-surface border-border text-muted hover:text-text'}`}
                                    >
                                        {locale === 'en' ? labelEn : labelVi}
                                    </button>
                                ))}
                            </div>

                            <label className="flex items-center gap-2 cursor-pointer text-[11px] text-text/80 hover:text-text select-none">
                                <input
                                    type="checkbox"
                                    checked={fixZipSyncDrive}
                                    onChange={e => setFixZipSyncDrive(e.target.checked)}
                                    disabled={fixZipRunning}
                                    className="rounded border-border text-indigo-600 focus:ring-0"
                                />
                                <span>{locale === 'en' ? 'Sync updated PDFs to Google Drive in-place' : 'Tự động đồng bộ cập nhật file PDF lên Google Drive nếu đã tải lên'}</span>
                            </label>
                        </div>

                        {/* Live Progress Bar & Stats */}
                        {(fixZipRunning || fixZipResult) && (
                            <>
                                {fixZipProgress && (
                                    <div className="px-5 pt-3 pb-1">
                                        <div className="flex items-center justify-between text-[11px] mb-1.5">
                                            <span className="text-text font-semibold flex items-center gap-1.5">
                                                {fixZipRunning ? (
                                                    <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                                                ) : (
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                                )}
                                                {fixZipRunning
                                                    ? (locale === 'en' ? 'Validating:' : 'Đang Auto Validate:')
                                                    : (locale === 'en' ? 'Validated Complete:' : 'Đã hoàn tất:')}{' '}
                                                <span className="font-mono">{fixZipProgress.current} / {fixZipProgress.total}</span> hồ sơ
                                            </span>
                                            <span className={`font-mono font-bold ${fixZipRunning ? 'text-indigo-400' : 'text-emerald-400'}`}>
                                                {fixZipProgress.percent}%
                                            </span>
                                        </div>
                                        <div className="w-full bg-border/60 rounded-full h-2.5 overflow-hidden">
                                            <div
                                                className={`h-2.5 transition-all duration-150 ${fixZipRunning ? 'bg-indigo-500' : 'bg-emerald-500'}`}
                                                style={{ width: `${Math.max(2, fixZipProgress.percent)}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-4 gap-2 px-5 py-2.5 bg-surface/30 border-b border-border/50 text-[10px]">
                                    <div className="flex flex-col">
                                        <span className="text-muted uppercase text-[9px]">Hàng đợi Queue</span>
                                        <span className="font-bold text-text tabular-nums mt-0.5">{fixZipStats.fixed_queue_jobs} đã sửa</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-muted uppercase text-[9px]">Kết quả</span>
                                        <span className="font-bold text-emerald-400 tabular-nums mt-0.5">{fixZipStats.fixed_records} đã sửa</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-muted uppercase text-[9px]">PDF Notice</span>
                                        <span className="font-bold text-sky-400 tabular-nums mt-0.5">{fixZipStats.fixed_pdfs} đã patch</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-muted uppercase text-[9px]">Google Drive</span>
                                        <span className="font-bold text-indigo-400 tabular-nums mt-0.5">{fixZipStats.synced_drive} đã sync</span>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Real-time Log stream */}
                        {(fixZipLog.length > 0 || fixZipRunning) && (
                            <div ref={fixZipLogRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 font-mono text-[10px] text-text/80 bg-black/30 border-b border-border max-h-56">
                                {fixZipLog.length === 0 && fixZipRunning && (
                                    <div className="text-muted flex items-center gap-2"><RefreshCw className="w-3 h-3 animate-spin" /> Đang khởi động Auto Validate...</div>
                                )}
                                {fixZipLog.map((line, i) => (
                                    <div key={i} className={`leading-5 ${line.includes('Hoàn tất') || line.includes('Completed') || line.includes('done') || line.includes('✓') ? 'text-success font-semibold' : line.includes('lỗi') || line.includes('error') || line.includes('Error') ? 'text-danger' : line.includes('Sửa') ? 'text-amber-300' : 'text-text/75'}`}>
                                        {line}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Result summary card */}
                        {fixZipResult && (
                            <div className={`px-5 py-3 border-b flex items-center gap-3 ${fixZipResult.message.startsWith('❌') ? 'bg-danger/10 border-danger/30 text-danger' : 'bg-success/10 border-success/30 text-success'}`}>
                                {fixZipResult.message.startsWith('❌') ? (
                                    <AlertCircle className="w-5 h-5 shrink-0" />
                                ) : (
                                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                                )}
                                <div className="text-[11px] font-medium">
                                    {fixZipResult.message || '✅ Hoàn tất Auto Validate thành công!'}
                                </div>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-3 px-5 py-4">
                            {!fixZipRunning && !fixZipResult && (
                                <>
                                    <Button
                                        variant="ghost"
                                        size="xs"
                                        className="text-muted"
                                        onClick={() => setFixZipOpen(false)}
                                    >
                                        {locale === 'en' ? 'Cancel' : 'Hủy'}
                                    </Button>
                                    <Button
                                        variant="primary"
                                        size="xs"
                                        className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white border-transparent ml-auto"
                                        onClick={runFixZip}
                                    >
                                        <ShieldCheck className="w-3.5 h-3.5" />
                                        {locale === 'en' ? 'Start Auto Validate' : 'Bắt đầu Auto Validate'}
                                    </Button>
                                </>
                            )}
                            {fixZipRunning && (
                                <div className="flex items-center gap-2 text-[11px] text-indigo-300 ml-auto">
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    {locale === 'en' ? 'Validating in real-time...' : 'Đang Auto Validate trực tiếp...'}
                                </div>
                            )}
                            {!fixZipRunning && fixZipResult && (
                                <>
                                    <Button
                                        variant="ghost"
                                        size="xs"
                                        className="text-muted"
                                        onClick={() => { setFixZipResult(null); setFixZipLog([]); setFixZipProgress(null) }}
                                    >
                                        {locale === 'en' ? 'Run Again' : 'Chạy lại'}
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        size="xs"
                                        className="ml-auto"
                                        onClick={() => setFixZipOpen(false)}
                                    >
                                        {locale === 'en' ? 'Close' : 'Đóng'}
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default ResultsDashboard
