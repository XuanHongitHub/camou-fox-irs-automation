import { useState, useMemo, useCallback, Fragment, useEffect, useRef } from 'react'
import {
    Download, Search, Filter, CheckCircle2, AlertCircle,
    FileText, RefreshCw, Copy,
    ChevronDown, ChevronUp, X, Check, BarChart3, Clock, Calendar,
    Globe, Hash, ChevronRight, FolderOpen,
    Cloud, EyeOff, Eye, RotateCcw, ShieldCheck
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

// ─── Row detail expand ────────────────────────────────────────────────────────

function ResultRowDetail({ row }: { row: ResultRow }) {
    const { locale } = useI18n()
    let step6Data: Record<string, unknown> = {}
    try {
        step6Data = row.step6_data_json ? JSON.parse(String(row.step6_data_json)) : {}
    } catch {
        step6Data = {}
    }
    const openPath = (path: string, reveal = false) => {
        const ipc = window.electron?.ipcRenderer
        if (!ipc || !path) return
        ipc.invoke('irs:open-path', { path, reveal }).catch(() => {
            // no-op
        })
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
                    {(row.pdf_path || row.artifact_dir) && (
                        <div className="col-span-2 mt-1 flex items-center gap-3 text-[10px]">
                            {row.pdf_path && (
                                <button className="text-success hover:underline font-mono" onClick={() => openPath(String(row.pdf_path))}>
                                    Open PDF
                                </button>
                            )}
                            {row.artifact_dir && (
                                <button className="text-accent hover:underline font-mono" onClick={() => openPath(String(row.artifact_dir), true)}>
                                    Open Artifact Folder
                                </button>
                            )}
                        </div>
                    )}
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
    const [viewTab, setViewTab] = useState<'all' | 'unuploaded' | 'uploaded' | 'hidden'>('all')
    const [hideDriveUploaded, setHideDriveUploaded] = useState(() => {
        try {
            return localStorage.getItem('fox_hide_drive_uploaded') === 'true'
        } catch {
            return false
        }
    })
    const toggleHideDriveUploaded = (val: boolean) => {
        setHideDriveUploaded(val)
        try { localStorage.setItem('fox_hide_drive_uploaded', String(val)) } catch {}
    }
    const [timePreset, setTimePreset] = useState<'tonight' | 'today' | 'all'>('tonight')
    const tonightStartMs = useMemo(() => {
        const d = new Date()
        d.setHours(18, 0, 0, 0)
        return d.getTime()
    }, [])
    const todayStartMs = useMemo(() => {
        const d = new Date()
        d.setHours(0, 0, 0, 0)
        return d.getTime()
    }, [])
    const [statusFilter, setStatusFilter] = useState<'all' | 'done' | 'failed'>('all')
    const [batchFilter, setBatchFilter] = useState<string>('all')
    const [errorFilter, setErrorFilter] = useState<string>('all')
    const [dateFrom, setDateFrom] = useState<string>('')
    const [dateTo, setDateTo] = useState<string>('')
    const [sortField, setSortField] = useState<SortField>('completed_at')
    const [sortDir, setSortDir] = useState<SortDir>('desc')
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [selected, setSelected] = useState<Set<string>>(new Set())

    // ─── Fix Output ZIPs ──────────────────────────────────────────────────────
    const [fixZipOpen, setFixZipOpen] = useState(false)
    const [fixZipScope, setFixZipScope] = useState<'tonight' | 'today' | 'all' | 'selected'>('tonight')
    const [fixZipRunning, setFixZipRunning] = useState(false)
    const [fixZipLog, setFixZipLog] = useState<string[]>([])
    const [fixZipResult, setFixZipResult] = useState<{ fixed_records: number; fixed_pdfs: number; message: string } | null>(null)
    const fixZipLogRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const ipc = window.electron?.ipcRenderer
        if (!ipc) return
        const handler = (_: unknown, data: any) => {
            const msg = typeof data?.message === 'string' ? data.message : JSON.stringify(data)
            setFixZipLog(prev => [...prev.slice(-80), msg])
            if (data?.type === 'done') {
                setFixZipRunning(false)
                setFixZipResult({ fixed_records: Number(data.fixed_records || 0), fixed_pdfs: Number(data.fixed_pdfs || 0), message: msg })
                onRefresh?.()
            }
        }
        ipc.on('irs:fix-output-zips:progress', handler)
        return () => { ipc.removeListener?.('irs:fix-output-zips:progress', handler) }
    }, [onRefresh])

    useEffect(() => {
        if (fixZipLogRef.current) fixZipLogRef.current.scrollTop = fixZipLogRef.current.scrollHeight
    }, [fixZipLog])

    // ─── runFixZip is declared after selectedRows below ───────────────────────

    const batches = useMemo(() => ['all', ...new Set(results.map(r => r.batch_id ?? '').filter(Boolean))], [results])

    const viewCounts = useMemo(() => {
        const checkTime = (r: ResultRow) => {
            if (timePreset === 'all') return true
            if (!r.completed_at) return false
            const t = new Date(r.completed_at).getTime()
            if (!Number.isFinite(t)) return false
            if (timePreset === 'tonight') return t >= tonightStartMs
            if (timePreset === 'today') return t >= todayStartMs
            return true
        }
        const scopedResults = results.filter(checkTime)
        const notHidden = scopedResults.filter(r => !r.is_hidden)
        return {
            all: notHidden.length,
            unuploaded: notHidden.filter(r => !r.uploaded_to_drive).length,
            uploaded: notHidden.filter(r => r.uploaded_to_drive).length,
            hidden: scopedResults.filter(r => r.is_hidden).length,
        }
    }, [results, timePreset, tonightStartMs, todayStartMs])

    const filtered = useMemo(() => {
        const q = search.toLowerCase()
        return results.filter(r => {
            if (timePreset === 'tonight') {
                if (!r.completed_at) return false
                const t = new Date(r.completed_at).getTime()
                if (!Number.isFinite(t) || t < tonightStartMs) return false
            } else if (timePreset === 'today') {
                if (!r.completed_at) return false
                const t = new Date(r.completed_at).getTime()
                if (!Number.isFinite(t) || t < todayStartMs) return false
            }
            if (viewTab === 'hidden') {
                if (!r.is_hidden) return false
            } else {
                if (r.is_hidden) return false
                if (viewTab === 'unuploaded' && r.uploaded_to_drive) return false
                if (viewTab === 'uploaded' && !r.uploaded_to_drive) return false
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
    }, [results, viewTab, hideDriveUploaded, search, statusFilter, batchFilter, errorFilter, dateFrom, dateTo, sortField, sortDir])

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
        setSearch(''); setStatusFilter('all')
        setBatchFilter('all'); setErrorFilter('all'); setDateFrom(''); setDateTo('')
    }

    const hasFilter = search || statusFilter !== 'all' || batchFilter !== 'all' || errorFilter !== 'all' || dateFrom || dateTo
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
        const scope = fixZipScope === 'selected' ? 'all' : fixZipScope
        const keys = fixZipScope === 'selected' ? selectedRows.map(r => `${r.batch_id}:${r.record_id}`) : []
        try {
            await ipc.invoke('irs:fix-output-zips', { scope, keys })
        } catch (err) {
            setFixZipRunning(false)
            onNotify?.(`Fix ZIP lỗi: ${String(err)}`, 'error')
        }
    }, [fixZipScope, selectedRows, onNotify])

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
                            {timePreset === 'tonight' ? (locale === 'en' ? 'Tonight (≥ 18:00)' : 'Tối nay (≥ 18:00)') : timePreset === 'today' ? (locale === 'en' ? 'Today' : 'Hôm nay') : (locale === 'en' ? 'All Time' : 'Toàn thời gian')}
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
                            {timePreset === 'tonight' ? (locale === 'en' ? 'Export Tonight (Excel)' : 'Xuất Excel tối nay') : (locale === 'en' ? 'Export Excel' : 'Xuất Excel')}
                        </Button>
                    )}
                    <Button variant="ghost" size="xs" className="gap-1.5 text-muted hover:text-text" onClick={() => download(filtered, timePreset === 'tonight' ? 'tonight' : 'filtered')}>
                        <Download className="w-3.5 h-3.5" />CSV
                    </Button>
                    {selectedRows.length > 0 && (
                        <>
                            <Button variant="ghost" size="xs" className="gap-1.5 text-accent" onClick={() => download(selectedRows, 'selected')}>
                        <Download className="w-3.5 h-3.5" />{locale === 'en' ? 'Selected' : 'Đã chọn'} ({selectedRows.length})
                            </Button>
                            {viewTab === 'hidden' ? (
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
                <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-0.5 shrink-0">
                    <button
                        onClick={() => setViewTab('all')}
                        className={`h-7 px-2.5 text-[10px] font-semibold rounded-lg transition-all ${viewTab === 'all' ? 'bg-accent text-white shadow-xs' : 'text-muted hover:text-text'}`}
                    >
                        {locale === 'en' ? 'All' : 'Tất cả'} ({viewCounts.all})
                    </button>
                    <button
                        onClick={() => setViewTab('unuploaded')}
                        className={`h-7 px-2.5 text-[10px] font-semibold rounded-lg transition-all flex items-center gap-1.5 ${viewTab === 'unuploaded' ? 'bg-amber-600 text-white shadow-xs' : 'text-muted hover:text-text'}`}
                        title={locale === 'en' ? 'Show records not yet pushed to Drive' : 'Chỉ xem hồ sơ chưa đẩy lên Google Drive'}
                    >
                        <Cloud className="w-3 h-3" />
                        {locale === 'en' ? 'Not on Drive' : 'Chưa lên Drive'} ({viewCounts.unuploaded})
                    </button>
                    <button
                        onClick={() => setViewTab('uploaded')}
                        className={`h-7 px-2.5 text-[10px] font-semibold rounded-lg transition-all flex items-center gap-1.5 ${viewTab === 'uploaded' ? 'bg-sky-600 text-white shadow-xs' : 'text-muted hover:text-text'}`}
                        title={locale === 'en' ? 'Show records already pushed to Drive' : 'Xem các hồ sơ đã đẩy lên Google Drive'}
                    >
                        <CheckCircle2 className="w-3 h-3" />
                        {locale === 'en' ? 'On Drive' : 'Đã lên Drive'} ({viewCounts.uploaded})
                    </button>
                    {viewCounts.hidden > 0 && (
                        <button
                            onClick={() => setViewTab('hidden')}
                            className={`h-7 px-2.5 text-[10px] font-semibold rounded-lg transition-all flex items-center gap-1.5 ${viewTab === 'hidden' ? 'bg-purple-600 text-white shadow-xs' : 'text-purple-400 hover:text-purple-300'}`}
                            title={locale === 'en' ? 'View hidden records (data is preserved safely in CSV/DB)' : 'Xem các dòng đã ẩn (dữ liệu gốc vẫn an toàn trong file)'}
                        >
                            <EyeOff className="w-3 h-3" />
                            {locale === 'en' ? 'Hidden' : 'Đã ẩn'} ({viewCounts.hidden})
                        </button>
                    )}
                </div>
                {viewTab !== 'hidden' && (
                    <button
                        onClick={() => toggleHideDriveUploaded(!hideDriveUploaded)}
                        className={`h-7 px-2.5 text-[10px] font-medium rounded-xl border transition-all flex items-center gap-1.5 ${hideDriveUploaded ? 'bg-sky-500/20 text-sky-300 border-sky-500/40 shadow-xs' : 'bg-surface border-border text-muted hover:text-text'}`}
                        title={locale === 'en' ? 'Hide results already uploaded to Google Drive' : 'Lọc bỏ các kết quả đã được upload lên Google Drive để tránh nhiễu'}
                    >
                        <Cloud className="w-3 h-3" />
                        {hideDriveUploaded ? (locale === 'en' ? 'Hiding Drive' : 'Đang ẩn đã lên Drive') : (locale === 'en' ? 'Hide Drive' : 'Ẩn đã lên Drive')}
                    </button>
                )}
                <div className="w-px h-5 bg-border mx-1" />
                <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-0.5 shrink-0">
                    {(['all', 'done', 'failed'] as const).map(s => (
                        <button key={s} onClick={() => setStatusFilter(s)}
                            className={`h-7 px-3 text-[10px] font-semibold rounded-lg transition-all ${statusFilter === s ? (s === 'done' ? 'bg-success text-white' : s === 'failed' ? 'bg-danger text-white' : 'bg-accent text-white') : 'text-muted hover:text-text'}`}
                        >
                            {s === 'all' ? (locale === 'en' ? 'All' : 'Tất cả') : s === 'done' ? (locale === 'en' ? 'Completed' : 'Hoàn tất') : (locale === 'en' ? 'Failed' : 'Thất bại')}
                        </button>
                    ))}
                </div>
                <div className="w-px h-5 bg-border mx-1" />
                <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-0.5 shrink-0">
                    <button
                        onClick={() => { setTimePreset('tonight'); setDateFrom(''); setDateTo('') }}
                        className={`h-7 px-2.5 text-[10px] font-semibold rounded-lg transition-all ${timePreset === 'tonight' ? 'bg-indigo-600 text-white shadow-xs' : 'text-muted hover:text-text'}`}
                        title="Chỉ hiển thị các lượt chạy tối nay (từ 18:00)"
                    >
                        🌙 {locale === 'en' ? 'Tonight' : 'Tối nay'}
                    </button>
                    <button
                        onClick={() => { setTimePreset('today'); setDateFrom(''); setDateTo('') }}
                        className={`h-7 px-2.5 text-[10px] font-semibold rounded-lg transition-all ${timePreset === 'today' ? 'bg-indigo-600 text-white shadow-xs' : 'text-muted hover:text-text'}`}
                        title="Chỉ hiển thị các lượt chạy trong ngày hôm nay"
                    >
                        📅 {locale === 'en' ? 'Today' : 'Hôm nay'}
                    </button>
                    <button
                        onClick={() => setTimePreset('all')}
                        className={`h-7 px-2.5 text-[10px] font-semibold rounded-lg transition-all ${timePreset === 'all' ? 'bg-accent text-white shadow-xs' : 'text-muted hover:text-text'}`}
                        title="Hiển thị toàn bộ lịch sử"
                    >
                        {locale === 'en' ? 'All Time' : 'Tất cả'}
                    </button>
                </div>
                <div className="w-px h-5 bg-border mx-1" />
                <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted mr-1">
                        <Calendar className="w-3 h-3" /> {locale === 'en' ? 'Time:' : 'Tùy chỉnh:'}
                    </div>
                    <input
                        type="datetime-local"
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        className="h-8 px-2 text-[11px] bg-surface border border-border rounded-xl text-text focus:outline-none focus:border-accent/40 w-[182px]"
                        title="From date/time"
                    />
                    <span className="text-[10px] text-muted">to</span>
                    <input
                        type="datetime-local"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        className="h-8 px-2 text-[11px] bg-surface border border-border rounded-xl text-text focus:outline-none focus:border-accent/40 w-[182px]"
                        title="To date/time"
                    />
                </div>
                <select value={batchFilter} onChange={e => setBatchFilter(e.target.value)}
                    className="h-8 px-2 text-[11px] bg-surface border border-border rounded-xl text-muted focus:outline-none focus:border-accent/40 w-[180px]">
                    {batches.map(b => <option key={b} value={b}>{b === 'all' ? (locale === 'en' ? 'All batches' : 'Tất cả batch') : b}</option>)}
                </select>
                {hasFilter && (
                    <button onClick={resetFilters} className="h-8 px-2 rounded-xl border border-border bg-danger/5 text-[10px] text-danger hover:bg-danger/10 transition-colors flex items-center gap-1.5">
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
                                                <a
                                                    href={row.drive_pdf_url || '#'}
                                                    target={row.drive_pdf_url ? '_blank' : undefined}
                                                    rel="noreferrer"
                                                    onClick={(e) => { if (!row.drive_pdf_url) e.preventDefault(); e.stopPropagation() }}
                                                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-400 bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 rounded-full hover:bg-sky-500/20 transition-colors"
                                                    title={row.drive_pdf_url ? 'Mở PDF trên Google Drive' : 'Đã tải lên Google Drive'}
                                                >
                                                    <Cloud className="w-3 h-3" /> Drive
                                                </a>
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

                        {/* Scope selector */}
                        <div className="px-5 py-4 border-b border-border">
                            <div className="text-[11px] font-medium text-muted mb-2">{locale === 'en' ? 'Scope for results scan:' : 'Phạm vi quét kết quả:'}</div>
                            <div className="flex gap-2 flex-wrap">
                                {([
                                    ['tonight', '🌙 Tối nay (≥ 18:00)', '🌙 Tonight (≥ 18:00)'],
                                    ['today', '📅 Hôm nay', '📅 Today'],
                                    ['all', '📋 Tất cả', '📋 All Records'],
                                    ['selected', `☑️ Đã chọn (${selectedRows.length})`, `☑️ Selected (${selectedRows.length})`],
                                ] as const).map(([val, labelVi, labelEn]) => (
                                    <button
                                        key={val}
                                        onClick={() => setFixZipScope(val)}
                                        disabled={val === 'selected' && selectedRows.length === 0}
                                        className={`h-8 px-3 text-[11px] font-semibold rounded-xl border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${fixZipScope === val ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-surface border-border text-muted hover:text-text'}`}
                                    >
                                        {locale === 'en' ? labelEn : labelVi}
                                    </button>
                                ))}
                            </div>
                            <div className="mt-3 text-[10px] text-muted/70 leading-relaxed space-y-1">
                                <div>{locale === 'en' ? '⚡ 1. Queue DB: Checks every job (pending, running, failed, done) and patches invalid/PO Box ZIPs in-place.' : '⚡ 1. Hàng đợi Queue: Tự quét mọi job (pending, running, failed, done) và chuẩn hóa mã ZIP trực tiếp trong database.'}</div>
                                <div>{locale === 'en' ? '⚡ 2. Results & PDFs: Surgically corrects ZIP in notice PDFs (y 140-220) while preserving PDF417 barcode.' : '⚡ 2. Kết quả & PDF: Chỉnh sửa mã ZIP trong PDF notice (y 140-220), bảo toàn 100% mã vạch PDF417.'}</div>
                                <div>{locale === 'en' ? '⚡ 3. Future Imports: Auto-validates all incoming CSV/XLSX imports automatically upon enqueue.' : '⚡ 3. File tương lai: Mọi file CSV/XLSX nạp vào hàng đợi về sau sẽ tự động được chuẩn hóa ngay lập tức.'}</div>
                            </div>
                        </div>

                        {/* Log area */}
                        {(fixZipLog.length > 0 || fixZipRunning) && (
                            <div ref={fixZipLogRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 font-mono text-[10px] text-text/80 bg-black/20 border-b border-border max-h-52">
                                {fixZipLog.length === 0 && fixZipRunning && (
                                    <div className="text-muted flex items-center gap-2"><RefreshCw className="w-3 h-3 animate-spin" /> Đang khởi động Auto Validate...</div>
                                )}
                                {fixZipLog.map((line, i) => (
                                    <div key={i} className={`leading-5 ${line.includes('Hoàn tất') || line.includes('Completed') || line.includes('done') || line.includes('chuẩn hóa') ? 'text-success font-semibold' : line.includes('lỗi') || line.includes('error') || line.includes('Error') ? 'text-danger' : ''}`}>
                                        {line}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Result summary */}
                        {fixZipResult && (
                            <div className="px-5 py-3 bg-success/5 border-b border-success/20 flex items-center gap-3">
                                <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                                <div className="text-[11px] text-success font-medium">
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
                                    {locale === 'en' ? 'Running Auto Validate in background...' : 'Đang Auto Validate ngầm...'}
                                </div>
                            )}
                            {!fixZipRunning && fixZipResult && (
                                <>
                                    <Button
                                        variant="ghost"
                                        size="xs"
                                        className="text-muted"
                                        onClick={() => { setFixZipResult(null); setFixZipLog([]) }}
                                    >
                                        {locale === 'en' ? 'Run Again' : 'Chạy lại'}
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        size="xs"
                                        className="ml-auto"
                                        onClick={() => setFixZipOpen(false)}
                                    >
                                        {locale === 'en' ? 'Done' : 'Xong'}
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
