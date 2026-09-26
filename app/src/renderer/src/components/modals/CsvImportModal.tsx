import { useEffect, useState, useRef } from 'react'
import { X, Upload, FileText, CheckCircle2, AlertTriangle, Table2 } from 'lucide-react'
import { Button } from '../base/Button'
import Papa from 'papaparse'
import { useI18n } from '../../i18n/useI18n'

interface Props {
    onClose: () => void
    onImport: (items: Array<{ batchId: string; file: File; rows: Record<string, string>[] }>) => void
}

interface ImportItem {
    file: File
    batchId: string
    preview: { headers: string[]; rows: Record<string, string>[] }
}

const REQUIRED_NEW_SCHEMA = ['NAME', 'SSN', 'ADDRESS', 'CITI', 'BANG', 'ZIP', 'Phone'] as const

function normalizeHeaderKey(raw: string): string {
    return String(raw || '')
        .trim()
        .replace(/^\uFEFF/, '')
        .toLowerCase()
        .replace(/[\s_\-./()]+/g, '')
}

function canonicalHeader(raw: string): string {
    const n = normalizeHeaderKey(raw)
    const alias: Record<string, string> = {
        recordid: 'record_id',
        record: 'record_id',
        id: 'record_id',
        name: 'NAME',
        fullname: 'NAME',
        ownername: 'NAME',
        ssn: 'SSN',
        socialsecuritynumber: 'SSN',
        itin: 'SSN',
        dob: 'DOB',
        dateofbirth: 'DOB',
        birthdate: 'DOB',
        gender: 'GENDER',
        sex: 'GENDER',
        address: 'ADDRESS',
        street: 'ADDRESS',
        streetaddress: 'ADDRESS',
        citi: 'CITI',
        city: 'CITI',
        bang: 'BANG',
        state: 'BANG',
        statecode: 'BANG',
        province: 'BANG',
        zip: 'ZIP',
        zipcode: 'ZIP',
        postalcode: 'ZIP',
        phone: 'Phone',
        phonenumber: 'Phone',
        mobile: 'Phone',
        country: 'country',
        county: 'county',
        countywheresoleproprietorislocated: 'county',
        soleproprietorcounty: 'county',
    }
    return alias[n] || String(raw || '').trim()
}

function canonicalizeTable(headers: string[], rows: Record<string, string>[]) {
    const mapped = headers.map((h) => ({ raw: h, key: canonicalHeader(h) }))
    const outHeaders: string[] = []
    const seen = new Set<string>()
    for (const h of mapped.map((x) => x.key)) {
        if (!seen.has(h)) {
            seen.add(h)
            outHeaders.push(h)
        }
    }
    const outRows = rows.map((row) => {
        const out: Record<string, string> = {}
        for (const h of outHeaders) out[h] = ''
        for (const m of mapped) {
            const v = String(row[m.raw] ?? '').trim()
            if (!v) continue
            if (!out[m.key]) out[m.key] = v
        }
        return out
    })
    return { headers: outHeaders, rows: outRows }
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
    const parsed = Papa.parse<Record<string, unknown>>(text, {
        header: true,
        skipEmptyLines: true,
    })
    const headers = (parsed.meta.fields || []).map(h => String(h || '').trim())
    const rows = (parsed.data || []).map((row) => {
        const out: Record<string, string> = {}
        headers.forEach((h) => {
            out[h] = String((row as Record<string, unknown>)[h] ?? '').trim()
        })
        return out
    })
    return canonicalizeTable(headers, rows)
}

function toCsv(headers: string[], rows: Record<string, string>[]) {
    const esc = (v: string) => {
        if (v.includes(',') || v.includes('"') || v.includes('\n')) return `"${v.replace(/"/g, '""')}"`
        return v
    }
    const lines = [headers.join(',')]
    for (const row of rows) {
        lines.push(headers.map((h) => esc(String(row[h] ?? ''))).join(','))
    }
    return lines.join('\n')
}

async function parseXlsx(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
    const XLSX = await import('xlsx')
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const sheetName = wb.SheetNames[0]
    if (!sheetName) return { headers: [], rows: [] }
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
    if (!rows.length) return { headers: [], rows: [] }
    const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
    const normalized = rows.map((row) => {
        const out: Record<string, string> = {}
        headers.forEach((h) => {
            out[h] = String(row[h] ?? '').trim()
        })
        return out
    })
    return canonicalizeTable(headers, normalized)
}

export function CsvImportModal({ onClose, onImport }: Props) {
    const { locale } = useI18n()
    const [items, setItems] = useState<ImportItem[]>([])
    const [error, setError] = useState('')
    const [loadingSample, setLoadingSample] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const buildBatchId = (f: File, suffix?: string) => {
        const now = new Date()
        const ymd = now.toISOString().split('T')[0].replace(/-/g, '')
        const hm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0')
        const nameSlug = f.name.replace(/\.[^/.]+$/, "").replace(/[^a-z0-9]/gi, '_').toLowerCase()
        return `batch_${ymd}_${hm}_${nameSlug}${suffix ? `_${suffix}` : ''}`
    }

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
    }, [onClose])

    const parseSingleFile = async (f: File): Promise<ImportItem> => {
        let parsed: { headers: string[]; rows: Record<string, string>[] } = { headers: [], rows: [] }
        if (f.name.toLowerCase().endsWith('.csv')) {
            const text = await f.text()
            parsed = parseCsv(text)
        } else if (f.name.toLowerCase().endsWith('.xlsx')) {
            parsed = await parseXlsx(f)
        } else {
            throw new Error('Chỉ hỗ trợ .csv hoặc .xlsx')
        }
        if (!parsed.headers.includes('record_id')) {
            const hasNewSchema = REQUIRED_NEW_SCHEMA.every((k) => parsed.headers.includes(k))
            if (!hasNewSchema) {
                throw new Error(`${f.name}: thiếu cột "record_id" hoặc schema NAME,SSN,ADDRESS,CITI,BANG,ZIP,Phone`)
            }
        }
        return {
            file: f,
            batchId: buildBatchId(f),
            preview: parsed,
        }
    }

    const handleFiles = async (fileList: FileList | File[]) => {
        const picked = Array.from(fileList).filter((f) => f.name.toLowerCase().endsWith('.csv') || f.name.toLowerCase().endsWith('.xlsx'))
        if (!picked.length) return
        setError('')
        try {
            const nextItems: ImportItem[] = []
            for (const [index, file] of picked.entries()) {
                const parsed = await parseSingleFile(file)
                if (parsed) {
                    parsed.batchId = buildBatchId(file, picked.length > 1 ? String(index + 1).padStart(2, '0') : '')
                    nextItems.push(parsed)
                }
            }
            setItems(nextItems)
        } catch (err) {
            setItems([])
            setError(String(err))
        }
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
    }

    const handleLoadSample = async (limit: number) => {
        const ipc = window.electron?.ipcRenderer
        if (!ipc) {
            setError('IPC unavailable')
            return
        }
        setLoadingSample(true)
        setError('')
        try {
            const res = await ipc.invoke('irs:sample-csv:get')
            if (!res?.ok) {
                setError(`Không tìm thấy sample CSV: ${res?.error || 'unknown'}`)
                return
            }
            const content = String(res.content || '')
            const name = String(res.name || 'sandbox_100_records.csv')
            const parsed = parseCsv(content)
            if (!parsed.rows.length) {
                setError('Sample CSV rỗng')
                return
            }
            const picked = parsed.rows.slice(0, Math.max(1, Math.min(limit, parsed.rows.length)))
            const csv = toCsv(parsed.headers, picked)
            const f = new File([csv], name.replace(/\.csv$/i, `_${picked.length}.csv`), { type: 'text/csv' })
            setItems([{
                file: f,
                batchId: buildBatchId(f),
                preview: { headers: parsed.headers, rows: picked },
            }])
        } catch (err) {
            setError(`Load sample lỗi: ${String(err)}`)
        } finally {
            setLoadingSample(false)
        }
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose()
            }}
        >
            <div
                className="w-[560px] max-h-[80vh] bg-panel border border-border rounded-2xl shadow-panel flex flex-col overflow-hidden"
                onMouseDown={(e) => e.stopPropagation()}
            >

                {/* Header */}
                <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
                    <Table2 className="w-4 h-4 text-accent" />
                    <span className="font-semibold text-sm text-text">{locale === 'en' ? 'Import CSV' : 'Nhập CSV'}</span>
                    <button onClick={onClose} className="ml-auto text-muted hover:text-text transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">

                    {/* Drop zone */}
                    <div
                        onDrop={handleDrop}
                        onDragOver={e => e.preventDefault()}
                        onClick={() => inputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${items.length ? 'border-accent/40 bg-accent/5' : 'border-border hover:border-accent/30 hover:bg-surface/50'}`}
                    >
                        <input ref={inputRef} type="file" multiple accept=".csv,.xlsx" className="hidden" onChange={e => e.target.files?.length && handleFiles(e.target.files)} />
                        {items.length ? (
                            <div className="space-y-2 text-sm">
                                <div className="flex items-center justify-center gap-2">
                                    <FileText className="w-4 h-4 text-accent" />
                                    <span className="font-medium text-text">{items.length} {locale === 'en' ? 'file' : 'file'}</span>
                                    <span className="text-muted">{items.length > 1 ? 's' : ''} {locale === 'en' ? 'ready' : 'đã sẵn sàng'}</span>
                                </div>
                                <div className="max-h-24 overflow-y-auto text-[11px] text-muted space-y-1">
                                    {items.map((item, idx) => (
                                        <div key={`${item.file.name}-${idx}`} className="truncate">
                                            {idx + 1}. {item.file.name} · {item.preview.rows.length} rows
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                <Upload className="w-6 h-6 text-muted mx-auto" />
                                <div className="text-sm text-muted">{locale === 'en' ? 'Drag and drop or click to choose one or more CSV/XLSX files' : 'Kéo thả hoặc bấm để chọn một hay nhiều file CSV/XLSX'}</div>
                                <div className="text-[11px] text-muted/50">{locale === 'en' ? 'Supports CSV/XLSX. Each file becomes its own batch and runs in the order you choose.' : 'Hỗ trợ CSV/XLSX. Mỗi file sẽ thành một batch riêng và chạy theo thứ tự bạn chọn.'}</div>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                        {[10, 20, 50, 100].map((n) => (
                            <Button key={n} variant="secondary" size="xs" onClick={() => handleLoadSample(n)} disabled={loadingSample}>
                                {loadingSample ? (locale === 'en' ? 'Loading...' : 'Đang tải...') : `Sample ${n}`}
                            </Button>
                        ))}
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="flex items-center gap-2 text-[11px] text-danger bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{error}
                        </div>
                    )}

                    {/* Preview */}
                    {items[0]?.preview && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-[11px] text-success">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Preview file đầu tiên: {items[0].preview.rows.length} records · {items[0].preview.headers.length} columns
                            </div>

                            <div className="border border-border rounded-lg overflow-hidden">
                                <div className="overflow-x-auto max-h-[180px] overflow-y-auto">
                                    <table className="w-full text-[10px]">
                                                <thead className="bg-surface sticky top-0">
                                            <tr>
                                                {items[0].preview.headers.map(h => (
                                                    <th key={h} className={`text-left px-2.5 py-2 font-medium border-b border-border ${h === 'record_id' ? 'text-accent' : 'text-muted'}`}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {items[0].preview.rows.slice(0, 5).map((row, i) => (
                                                <tr key={i} className="border-b border-border/40 hover:bg-surface/30">
                                                    {items[0].preview.headers.map(h => (
                                                        <td key={h} className="px-2.5 py-1.5 text-text/70 font-mono truncate max-w-[120px]">{row[h]}</td>
                                                    ))}
                                                </tr>
                                            ))}
                                            {items[0].preview.rows.length > 5 && (
                                                <tr><td colSpan={items[0].preview.headers.length} className="px-2.5 py-1.5 text-muted/50 text-center">+{items[0].preview.rows.length - 5} more rows</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {items.length > 0 && (
                        <div className="space-y-1.5">
                            <label className="text-[11px] text-muted font-medium">Batch Queue</label>
                            <div className="max-h-32 overflow-y-auto rounded-lg border border-border bg-surface/40">
                                {items.map((item, idx) => (
                                    <div key={`${item.batchId}-${idx}`} className="px-3 py-2 text-[11px] border-b border-border/50 last:border-b-0">
                                        <div className="font-mono text-text">{idx + 1}. {item.batchId}</div>
                                        <div className="text-muted truncate">{item.file.name} · {item.preview.rows.length} rows</div>
                                    </div>
                                ))}
                            </div>
                            <div className="text-[10px] text-muted/50">Artifacts sẽ lưu theo từng batch riêng, file đứng trước sẽ enqueue trước.</div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center gap-2 px-5 py-4 border-t border-border">
                    <Button variant="secondary" size="sm" onClick={onClose}>Hủy</Button>
                    <Button
                        variant="primary" size="sm"
                        className="ml-auto gap-1.5"
                        disabled={!items.length || !!error}
                        onClick={() => onImport(items.map((item) => ({ batchId: item.batchId, file: item.file, rows: item.preview.rows })))}
                    >
                        <Upload className="w-3.5 h-3.5" />
                        Enqueue {items.reduce((sum, item) => sum + item.preview.rows.length, 0)} records
                    </Button>
                </div>
            </div>
        </div>
    )
}
