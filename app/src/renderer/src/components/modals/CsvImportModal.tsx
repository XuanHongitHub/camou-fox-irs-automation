import { useEffect, useState, useRef } from 'react'
import { X, Upload, FileText, CheckCircle2, AlertTriangle, Table2 } from 'lucide-react'
import { Button } from '../base/Button'
import Papa from 'papaparse'

interface Props {
    onClose: () => void
    onImport: (batchId: string, file: File, rows: Record<string, string>[]) => void
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
    const [file, setFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null)
    const [batchId, setBatchId] = useState(() => {
        const now = new Date()
        const ymd = now.toISOString().split('T')[0].replace(/-/g, '')
        const hm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0')
        return `batch_${ymd}_${hm}`
    })
    const [error, setError] = useState('')
    const [loadingSample, setLoadingSample] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
    }, [onClose])

    const handleFile = async (f: File) => {
        setFile(f)
        setError('')

        // Auto-update Batch ID with filename slug
        const now = new Date()
        const ymd = now.toISOString().split('T')[0].replace(/-/g, '')
        const hm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0')
        const nameSlug = f.name.replace(/\.[^/.]+$/, "").replace(/[^a-z0-9]/gi, '_').toLowerCase()
        setBatchId(`batch_${ymd}_${hm}_${nameSlug}`)

        let parsed: { headers: string[]; rows: Record<string, string>[] } = { headers: [], rows: [] }
        if (f.name.toLowerCase().endsWith('.csv')) {
            const text = await f.text()
            parsed = parseCsv(text)
        } else if (f.name.toLowerCase().endsWith('.xlsx')) {
            parsed = await parseXlsx(f)
        } else {
            setError('Chỉ hỗ trợ .csv hoặc .xlsx')
            setPreview(null)
            return
        }
        if (!parsed.headers.includes('record_id')) {
            // Accept NAME-based import without explicit record_id.
            const hasNewSchema = REQUIRED_NEW_SCHEMA.every((k) => parsed.headers.includes(k))
            if (!hasNewSchema) {
                setError('File cần cột "record_id" hoặc schema mới: NAME,SSN,ADDRESS,CITI,BANG,ZIP,Phone (country/county là tùy chọn)')
                setPreview(null)
            } else {
                setPreview(parsed)
            }
        } else {
            setPreview(parsed)
        }
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        const f = e.dataTransfer.files[0]
        if (f && (f.name.toLowerCase().endsWith('.csv') || f.name.toLowerCase().endsWith('.xlsx'))) handleFile(f)
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
            setFile(f)
            setPreview({ headers: parsed.headers, rows: picked })

            const now = new Date()
            const ymd = now.toISOString().split('T')[0].replace(/-/g, '')
            const hm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0')
            setBatchId(`batch_${ymd}_${hm}_sandbox_${picked.length}`)
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
                    <span className="font-semibold text-sm text-text">Import CSV</span>
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
                        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${file ? 'border-accent/40 bg-accent/5' : 'border-border hover:border-accent/30 hover:bg-surface/50'}`}
                    >
                        <input ref={inputRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                        {file ? (
                            <div className="flex items-center justify-center gap-2 text-sm">
                                <FileText className="w-4 h-4 text-accent" />
                                <span className="font-medium text-text">{file.name}</span>
                                <span className="text-muted">({(file.size / 1024).toFixed(1)} kB)</span>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                <Upload className="w-6 h-6 text-muted mx-auto" />
                                <div className="text-sm text-muted">Kéo thả hoặc click để chọn file CSV</div>
                                <div className="text-[11px] text-muted/50">Hỗ trợ CSV/XLSX. Cần cột: record_id hoặc schema NAME/SSN/.../Phone (country/county tùy chọn)</div>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                        {[10, 20, 50, 100].map((n) => (
                            <Button key={n} variant="secondary" size="xs" onClick={() => handleLoadSample(n)} disabled={loadingSample}>
                                {loadingSample ? 'Loading...' : `Sample ${n}`}
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
                    {preview && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-[11px] text-success">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                {preview.rows.length} records · {preview.headers.length} columns
                            </div>

                            <div className="border border-border rounded-lg overflow-hidden">
                                <div className="overflow-x-auto max-h-[180px] overflow-y-auto">
                                    <table className="w-full text-[10px]">
                                        <thead className="bg-surface sticky top-0">
                                            <tr>
                                                {preview.headers.map(h => (
                                                    <th key={h} className={`text-left px-2.5 py-2 font-medium border-b border-border ${h === 'record_id' ? 'text-accent' : 'text-muted'}`}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {preview.rows.slice(0, 5).map((row, i) => (
                                                <tr key={i} className="border-b border-border/40 hover:bg-surface/30">
                                                    {preview.headers.map(h => (
                                                        <td key={h} className="px-2.5 py-1.5 text-text/70 font-mono truncate max-w-[120px]">{row[h]}</td>
                                                    ))}
                                                </tr>
                                            ))}
                                            {preview.rows.length > 5 && (
                                                <tr><td colSpan={preview.headers.length} className="px-2.5 py-1.5 text-muted/50 text-center">+{preview.rows.length - 5} more rows</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Batch ID */}
                    <div className="space-y-1.5">
                        <label className="text-[11px] text-muted font-medium">Batch ID</label>
                        <input
                            value={batchId}
                            onChange={e => setBatchId(e.target.value)}
                            className="w-full h-8 px-3 text-[11px] font-mono bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-accent/60 transition-colors"
                        />
                        <div className="text-[10px] text-muted/50">Artifacts sẽ lưu vào: artifacts/{batchId}/{"<record_id>"}/</div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center gap-2 px-5 py-4 border-t border-border">
                    <Button variant="secondary" size="sm" onClick={onClose}>Hủy</Button>
                    <Button
                        variant="primary" size="sm"
                        className="ml-auto gap-1.5"
                        disabled={!preview || !!error || !batchId.trim()}
                        onClick={() => preview && file && onImport(batchId, file, preview.rows)}
                    >
                        <Upload className="w-3.5 h-3.5" />
                        Enqueue {preview?.rows.length ?? 0} records
                    </Button>
                </div>
            </div>
        </div>
    )
}
