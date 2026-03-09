import { useState, useMemo, useCallback, Fragment } from 'react'
import {
    Download, Search, Filter, CheckCircle2, AlertCircle,
    FileText, RefreshCw, Copy,
    ChevronDown, ChevronUp, X, Check, BarChart3, Clock, Calendar,
    Globe, Hash, ChevronRight, FolderOpen
} from 'lucide-react'
import { Button } from '../base/Button'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResultRow {
    // Input (preserved from CSV)
    record_id: string
    name: string
    ein: string
    [key: string]: string | number | undefined
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
}

type SortField = 'completed_at' | 'name' | 'ein' | 'status' | 'duration_s'
type SortDir = 'asc' | 'desc'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escCsv(val: string | number | undefined) {
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
        const mapped: Record<string, string | number | undefined> = {
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

function getMostRecentSixPm(now: Date = new Date()): Date {
    const cutoff = new Date(now.getTime())
    cutoff.setHours(18, 0, 0, 0)
    if (now.getTime() < cutoff.getTime()) {
        cutoff.setDate(cutoff.getDate() - 1)
    }
    return cutoff
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
                            <span className="text-success font-medium text-xs">EIN Confirmed:</span>
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
    onOpenOutputFolder,
    onQuickExportStyled,
    onQuickExportSelected,
    onQuickExportSelectedNext,
    onNotify,
}: {
    results: ResultRow[]
    onResultsChange?: (next: ResultRow[] | ((prev: ResultRow[]) => ResultRow[])) => void
    onOpenOutputFolder?: () => void
    onQuickExportStyled?: (batchId: string, reportType?: 'report' | 'failures') => void
    onQuickExportSelected?: (rows: ResultRow[], reportType?: 'report' | 'failures') => void
    onQuickExportSelectedNext?: (rows: ResultRow[], reportType?: 'report' | 'failures') => void
    onNotify?: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void
}) {
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<'all' | 'done' | 'failed'>('all')
    const [sourceFilter, setSourceFilter] = useState<string>('all')
    const [batchFilter, setBatchFilter] = useState<string>('all')
    const [errorFilter, setErrorFilter] = useState<string>('all')
    const [dateFilter, setDateFilter] = useState<'all' | 'since_6pm' | '7d' | '30d'>('since_6pm')
    const [sortField, setSortField] = useState<SortField>('completed_at')
    const [sortDir, setSortDir] = useState<SortDir>('desc')
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [selected, setSelected] = useState<Set<string>>(new Set())

    const sourceFiles = useMemo(() => ['all', ...new Set(results.map(r => r.source_file ?? '').filter(Boolean))], [results])
    const batches = useMemo(() => ['all', ...new Set(results.map(r => r.batch_id ?? '').filter(Boolean))], [results])


    const filtered = useMemo(() => {
        const q = search.toLowerCase()
        return results.filter(r => {
            if (statusFilter !== 'all' && r.status !== statusFilter) return false
            if (sourceFilter !== 'all' && r.source_file !== sourceFilter) return false
            if (batchFilter !== 'all' && r.batch_id !== batchFilter) return false
            if (errorFilter !== 'all' && r.error_code !== errorFilter) return false
            if (dateFilter !== 'all') {
                if (!r.completed_at) return false
                if (dateFilter === 'since_6pm') {
                    const completedAtMs = new Date(r.completed_at).getTime()
                    if (!Number.isFinite(completedAtMs)) return false
                    const cutoffMs = getMostRecentSixPm().getTime()
                    if (completedAtMs < cutoffMs) return false
                } else {
                    const diff = Date.now() - new Date(r.completed_at).getTime()
                    if (dateFilter === '7d' && diff > 7 * 86400000) return false
                    if (dateFilter === '30d' && diff > 30 * 86400000) return false
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
    }, [results, search, statusFilter, sourceFilter, batchFilter, errorFilter, dateFilter, sortField, sortDir])

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
        setSearch(''); setStatusFilter('all'); setSourceFilter('all')
        setBatchFilter('all'); setErrorFilter('all'); setDateFilter('since_6pm')
    }

    const hasFilter = search || statusFilter !== 'all' || sourceFilter !== 'all' || batchFilter !== 'all' || errorFilter !== 'all' || dateFilter !== 'since_6pm'
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
    const selectedBatchRows = batchFilter !== 'all' ? filtered.filter((r) => String(r.batch_id || '') === batchFilter) : []

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
                    <span className="text-[10px] text-muted uppercase tracking-widest font-medium">Outcomes</span>
                    <div className="flex items-center gap-4 mt-0.5">
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-xl font-bold text-text tabular-nums">{stats.total}</span>
                            <span className="text-[10px] text-muted uppercase">Results</span>
                        </div>
                        <div className="h-6 w-px bg-border/40" />
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-success" />
                                <div className="flex flex-col leading-none">
                                    <span className="text-sm font-bold text-success tabular-nums">{stats.done}</span>
                                    <span className="text-[9px] text-muted uppercase">Confirmed</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-danger" />
                                <div className="flex flex-col leading-none">
                                    <span className="text-sm font-bold text-danger tabular-nums">{stats.failed}</span>
                                    <span className="text-[9px] text-muted uppercase">Failed</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col ml-10">
                    <span className="text-[10px] text-muted uppercase tracking-widest font-medium">Performance</span>
                    <div className="flex items-center gap-4 mt-1">
                        <div className="flex items-center gap-2">
                            <BarChart3 className="w-3.5 h-3.5 text-muted" />
                            <span className="text-xs font-semibold tabular-nums text-text/80">{stats.total ? Math.round(stats.done / stats.total * 100) : 0}%</span>
                            <span className="text-[10px] text-muted uppercase">Success Rate</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-muted" />
                            <span className="text-xs font-semibold tabular-nums text-text/80">{stats.avgDuration}s</span>
                            <span className="text-[10px] text-muted uppercase">Avg Time</span>
                        </div>
                    </div>
                </div>
                <div className="ml-auto flex items-center gap-3">
                    <Button variant="ghost" size="xs" className="gap-1.5 text-muted hover:text-text" onClick={() => download(filtered, 'filtered')}>
                        <Download className="w-3.5 h-3.5" />Export
                    </Button>
                    {selectedRows.length > 0 && (
                        <>
                            <Button variant="ghost" size="xs" className="gap-1.5 text-accent" onClick={() => download(selectedRows, 'selected')}>
                                <Download className="w-3.5 h-3.5" />Selected ({selectedRows.length})
                            </Button>
                            <Button
                                variant="ghost"
                                size="xs"
                                className="gap-1.5 text-danger"
                                onClick={() => {
                                    if (!onResultsChange) return
                                    const selectedKeys = new Set(selectedRows.map(r => `${r.batch_id}:${r.record_id}`))
                                    onResultsChange(prev => prev.filter(r => !selectedKeys.has(`${r.batch_id}:${r.record_id}`)))
                                    setSelected(new Set())
                                }}
                            >
                                <X className="w-3.5 h-3.5" />Remove Selected
                            </Button>
                        </>
                    )}
                </div>
            </div>

            <div className="px-4 py-2 border-b border-border bg-panel shrink-0 overflow-x-auto">
                <div className="flex items-center gap-2 min-w-max whitespace-nowrap">
                <div className="relative group shrink-0">
                    <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2 group-focus-within:text-accent transition-colors" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search records, EIN, confirmations..."
                        className="h-8 pl-8 pr-3 text-[11px] bg-surface border border-border rounded-xl text-text placeholder:text-muted/40 focus:outline-none focus:border-accent/40 w-64 transition-all"
                    />
                </div>
                <div className="w-px h-5 bg-border mx-1" />
                <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-0.5 shrink-0">
                    {(['all', 'done', 'failed'] as const).map(s => (
                        <button key={s} onClick={() => setStatusFilter(s)}
                            className={`h-7 px-3 text-[10px] font-semibold rounded-lg transition-all ${statusFilter === s ? (s === 'done' ? 'bg-success text-white' : s === 'failed' ? 'bg-danger text-white' : 'bg-accent text-white') : 'text-muted hover:text-text'}`}
                        >
                            {s === 'all' ? 'All' : s === 'done' ? 'Confirmed' : 'Failed'}
                        </button>
                    ))}
                </div>
                <div className="w-px h-5 bg-border mx-1" />
                <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted mr-1">
                        <Calendar className="w-3 h-3" /> Period:
                    </div>
                    <select value={dateFilter} onChange={e => setDateFilter(e.target.value as typeof dateFilter)}
                        className="h-8 px-2 text-[11px] bg-surface border border-border rounded-xl text-text focus:outline-none focus:border-accent/40 cursor-pointer w-[140px]">
                        <option value="since_6pm">From Last 6PM</option>
                        <option value="all">Unlimited History</option>
                        <option value="7d">Last 7 Sessions</option>
                        <option value="30d">Last 30 Sessions</option>
                    </select>
                </div>
                <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
                    className="h-8 px-2 text-[11px] bg-surface border border-border rounded-xl text-muted focus:outline-none focus:border-accent/40 w-[140px]">
                    {sourceFiles.map(f => <option key={f} value={f}>{f === 'all' ? 'Every source' : f}</option>)}
                </select>
                <select value={batchFilter} onChange={e => setBatchFilter(e.target.value)}
                    className="h-8 px-2 text-[11px] bg-surface border border-border rounded-xl text-muted focus:outline-none focus:border-accent/40 w-[150px]">
                    {batches.map(b => <option key={b} value={b}>{b === 'all' ? 'Every batch' : b}</option>)}
                </select>
                {hasFilter && (
                    <button onClick={resetFilters} className="h-8 px-2 rounded-xl border border-border bg-danger/5 text-[10px] text-danger hover:bg-danger/10 transition-colors flex items-center gap-1.5">
                        <X className="w-3 h-3" />Clear
                    </button>
                )}
                <div className="ml-auto flex items-center gap-3 shrink-0 pl-2">
                    <Button
                        variant="secondary"
                        size="xs"
                        className="h-8 gap-1.5 rounded-xl px-3"
                        onClick={() => collectPdfs(selectedRows, 'selected', batchFilter !== 'all' ? String(batchFilter) : undefined)}
                        disabled={selectedRows.length === 0}
                    >
                        <Download className="w-3.5 h-3.5" />PDF Selected {selectedRows.length ? `(${selectedRows.length})` : ''}
                    </Button>
                    <Button
                        variant="secondary"
                        size="xs"
                        className="h-8 gap-1.5 rounded-xl px-3"
                        onClick={() => collectPdfs(selectedRows, 'selected', batchFilter !== 'all' ? String(batchFilter) : undefined, true)}
                        disabled={selectedRows.length === 0}
                    >
                        <Download className="w-3.5 h-3.5" />PDF Next
                    </Button>
                    <Button
                        variant="secondary"
                        size="xs"
                        className="h-8 gap-1.5 rounded-xl px-3"
                        onClick={() => collectPdfs(selectedBatchRows, 'batch', String(batchFilter))}
                        disabled={batchFilter === 'all' || selectedBatchRows.length === 0}
                    >
                        <Download className="w-3.5 h-3.5" />PDF Batch
                    </Button>
                    <Button
                        variant="secondary"
                        size="xs"
                        className="h-8 gap-1.5 rounded-xl px-3"
                        onClick={() => onOpenOutputFolder?.()}
                    >
                        <FolderOpen className="w-3.5 h-3.5" />Output
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
                        <Download className="w-3.5 h-3.5" />Report Selected {selectedRows.length ? `(${selectedRows.length})` : ''}
                    </Button>
                    <Button
                        variant="secondary"
                        size="xs"
                        className="h-8 gap-1.5 rounded-xl px-3"
                        onClick={() => {
                            if (!selectedRows.length) {
                                onNotify?.('Hãy tick ít nhất 1 record để export report next', 'warning')
                                return
                            }
                            const reportType = statusFilter === 'failed' ? 'failures' : 'report'
                            onQuickExportSelectedNext?.(selectedRows, reportType)
                        }}
                        disabled={selectedRows.length === 0}
                    >
                        <Download className="w-3.5 h-3.5" />Report Next
                    </Button>
                    <Button
                        variant="secondary"
                        size="xs"
                        className="h-8 gap-1.5 rounded-xl px-3"
                        onClick={() => {
                            if (batchFilter === 'all') {
                                onNotify?.('Hãy chọn 1 batch cụ thể trước khi export report', 'warning')
                                return
                            }
                            const reportType = statusFilter === 'failed' ? 'failures' : 'report'
                            onQuickExportStyled?.(String(batchFilter), reportType)
                        }}
                    >
                        <Download className="w-3.5 h-3.5" />Report XLSX
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
                        <div className="text-center font-bold">No records found</div>
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
                                    { label: 'Status', f: 'status' as SortField },
                                    { label: 'Confirmation' },
                                    { label: 'Detail' },
                                    { label: 'Proxy' },
                                    { label: 'Time', f: 'duration_s' as SortField },
                                    { label: 'Completed', f: 'completed_at' as SortField },
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
                                            <div className="font-bold text-text group-hover:text-accent transition-colors truncate max-w-[180px]">{row.name}</div>
                                            <div className="font-mono text-muted/50 text-[10px] mt-0.5">{row.ein}</div>
                                        </td>
                                        <td className="px-3 py-3">
                                            {row.status === 'done'
                                                ? <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-success bg-success/10 px-2 py-1 rounded-full"><Check className="w-3 h-3" />Done</span>
                                                : <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-danger bg-danger/10 px-2 py-1 rounded-full"><X className="w-3 h-3" />Fail</span>
                                            }
                                        </td>
                                        <td className="px-3 py-3">
                                            {row.confirmation_number
                                                ? <span className="font-mono font-bold text-success/80 text-[10px] bg-success/5 border border-success/10 px-1.5 py-0.5 rounded">{row.confirmation_number}</span>
                                                : <span className="text-muted/30">—</span>
                                            }
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

        </div>
    )
}

export default ResultsDashboard
