import { useEffect, useRef, useState } from 'react'
import { X, Plus, Trash2, RefreshCw, Shield, Info, AlertTriangle, ClipboardPaste, ChevronDown } from 'lucide-react'
import { Button } from '../base/Button'
import { useI18n } from '../../i18n/useI18n'

interface ProxyEntry {
    id: string
    code: string   // auto-generated, shown as read-only tag
    host: string
    port: string
    username: string
    password: string
    rotateSecs: number
    enabled: boolean
}

interface Props {
    onClose: () => void
    onSave: (
        proxies: ProxyEntry[],
        globalRotateSecs: number,
        proxyAuth: { bearerToken: string; providerUsername: string; providerPassword: string; rotateUrl: string }
    ) => void
    initial?: ProxyEntry[]
    initialAuth?: { bearerToken?: string; providerUsername?: string; providerPassword?: string; rotateUrl?: string }
    onTestRotate?: (payload: { bearerToken: string; providerUsername: string; providerPassword: string; rotateUrl: string }) => Promise<{ ok: boolean; message: string }>
    profileName?: string
}

function normalizeRotateSeconds(value: unknown) {
    const raw = Number(value)
    if (!Number.isFinite(raw)) return 5
    const normalized = Math.max(0, Math.floor(raw))
    // Legacy default in old configs.
    if (normalized === 600) return 5
    return normalized
}

// ── Auto code generator ────────────────────────────────────────────────────────

function autoCode(_host: string, index: number): string {
    // Try to extract a meaningful slug from hostname
    // e.g. "4gusa4.id.proxyxoay.net" → "PROXY-01"
    // Short readable tag
    return `P-${String(index + 1).padStart(2, '0')}`
}

// ── Quick-paste parser ─────────────────────────────────────────────────────────
// Supports multiple formats:
// 1. Labeled block (proxyxoay style):
//    IP: host
//    Tài Khoản: user   (or Account: / Username:)
//    Mật Khẩu: pass    (or Password:)
//    HTTP Port: 8178   (or Port:)
//
// 2. Colon-separated inline: host:port:user:pass  or  host:port
// 3. URL:  http://user:pass@host:port or socks5://user:pass@host:port
// 4. user:pass@host:port

function parseProxyText(raw: string): Omit<ProxyEntry, 'id' | 'code' | 'rotateSecs' | 'enabled'>[] {
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
    const results: Omit<ProxyEntry, 'id' | 'code' | 'rotateSecs' | 'enabled'>[] = []

    const labelKeys: Record<string, keyof Omit<ProxyEntry, 'id' | 'code' | 'rotateSecs' | 'enabled'>> = {
        'ip': 'host', 'host': 'host', 'server': 'host', 'proxy': 'host', 'address': 'host',
        'tai khoan': 'username', 'account': 'username', 'username': 'username', 'user': 'username', 'tên đăng nhập': 'username', 'tài khoản': 'username',
        'mat khau': 'password', 'password': 'password', 'pass': 'password', 'mật khẩu': 'password', 'pwd': 'password',
        'http port': 'port', 'port': 'port', 'https port': 'port', 'socks port': 'port', 'cổng': 'port',
    }

    const normalize = (k: string) => k.toLowerCase().trim()

    let current: Partial<Omit<ProxyEntry, 'id' | 'code' | 'rotateSecs' | 'enabled'>> = {}

    for (const line of lines) {
        // Try labeled line: "Key: Value"
        const colonIdx = line.indexOf(':')
        let matchedLabel = false

        if (colonIdx > 0 && colonIdx < 30) { // arbitrary limit to avoid mistaking inline proxy for label
            const rawKey = line.slice(0, colonIdx)
            const val = line.slice(colonIdx + 1).trim()
            const normKey = normalize(rawKey)

            // Check if normKey matches any label closely
            const field = Object.entries(labelKeys).find(([k]) => normKey.includes(k))?.[1]

            if (field) {
                // If we already have this field, it means a new proxy block started
                if (current[field]) {
                    if (current.host) results.push({ host: current.host, port: current.port || '8080', username: current.username || '', password: current.password || '' })
                    current = {}
                }
                current[field] = val
                matchedLabel = true
            }
        }

        if (!matchedLabel) {
            const entry = parseInline(line)
            if (entry) {
                // If we were building a labeled block, finish it first
                if (current.host) {
                    results.push({ host: current.host, port: current.port || '8080', username: current.username || '', password: current.password || '' })
                    current = {}
                }
                results.push(entry)
            }
        }
    }

    if (current.host) {
        results.push({ host: current.host, port: current.port || '8080', username: current.username || '', password: current.password || '' })
    }

    return results
}

function parseInline(s: string): Omit<ProxyEntry, 'id' | 'code' | 'rotateSecs' | 'enabled'> | null {
    s = s.trim()
    if (!s) return null

    // Normalize delimiters to colon
    const norm = s.replace(/[\|;]/g, ':')

    // http://... / socks5://... / socks5h://... / socks4://...
    const urlMatch = norm.match(/^([a-z0-9]+):\/\/(?:([^:@]+):([^@]+)@)?([^:/]+):(\d+)/i)
    if (urlMatch) {
        const scheme = String(urlMatch[1] || '').toLowerCase()
        if (!['http', 'https', 'socks5', 'socks5h', 'socks4', 'socks4a'].includes(scheme)) return null
        return {
            host: `${scheme}://${urlMatch[4]}`,
            port: urlMatch[5],
            username: urlMatch[2] || '',
            password: urlMatch[3] || '',
        }
    }

    // user:pass@host:port
    const atMatch = norm.match(/^([^:@]+):([^@]+)@([^:]+):(\d+)$/)
    if (atMatch) {
        return { host: atMatch[3], port: atMatch[4], username: atMatch[1], password: atMatch[2] }
    }

    const parts = norm.split(':').map(p => p.trim())

    // host:port:user:pass
    if (parts.length === 4 && /^\d+$/.test(parts[1])) {
        return { host: parts[0], port: parts[1], username: parts[2], password: parts[3] }
    }

    // user:pass:host:port
    if (parts.length === 4 && /^\d+$/.test(parts[3])) {
        return { host: parts[2], port: parts[3], username: parts[0], password: parts[1] }
    }

    // host:port
    if (parts.length === 2 && /^\d+$/.test(parts[1])) {
        return { host: parts[0], port: parts[1], username: '', password: '' }
    }

    return null
}

// ── Constants ──────────────────────────────────────────────────────────────────

function emptyProxy(): ProxyEntry {
    return { id: crypto.randomUUID(), code: '', host: '', port: '8080', username: '', password: '', rotateSecs: 5, enabled: true }
}

const ROTATE_PRESETS = [
    { label: '5s', secs: 5 },
    { label: '10s', secs: 10 },
    { label: '30s', secs: 30 },
    { label: '60s', secs: 60 },
]

// ── Component ──────────────────────────────────────────────────────────────────

export function ProxyConfigModal({ onClose, onSave, initial, initialAuth, onTestRotate, profileName }: Props) {
    const { locale } = useI18n()
    const [proxies, setProxies] = useState<ProxyEntry[]>(initial ?? [])
    const [globalRotate, setGlobalRotate] = useState(5)
    const [applyGlobal, setApplyGlobal] = useState(false)
    const [pasteText, setPasteText] = useState('')
    const [pasteOpen, setPasteOpen] = useState(true)
    const [parseError, setParseError] = useState('')
    const [bearerToken, setBearerToken] = useState(initialAuth?.bearerToken ?? '')
    const [providerUsername, setProviderUsername] = useState(initialAuth?.providerUsername ?? '')
    const [providerPassword, setProviderPassword] = useState(initialAuth?.providerPassword ?? '')
    const [rotateUrl, setRotateUrl] = useState(initialAuth?.rotateUrl ?? '')
    const [useRotateUrl, setUseRotateUrl] = useState(Boolean((initialAuth?.rotateUrl || '').trim()))
    const [testingRotate, setTestingRotate] = useState(false)
    const [rotateResult, setRotateResult] = useState('')
    const importRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
    }, [onClose])

    const update = (id: string, field: keyof ProxyEntry, val: string | number | boolean) => {
        setProxies(p => p.map(px => px.id === id ? { ...px, [field]: val } : px))
    }

    const remove = (id: string) => setProxies(p => p.filter(px => px.id !== id))

    const applyGlobalRotate = () => {
        setProxies(p => p.map(px => ({ ...px, rotateSecs: globalRotate })))
        setApplyGlobal(false)
    }

    const handleParse = () => {
        setParseError('')
        const parsed = parseProxyText(pasteText)
        if (!parsed.length) {
            setParseError('Không nhận diện được proxy nào. Thử format: IP:Port:User:Pass hoặc block có nhãn.')
            return
        }
        const startIdx = proxies.length
        const newEntries: ProxyEntry[] = parsed.map((p, i) => ({
            ...p,
            id: crypto.randomUUID(),
            code: autoCode(p.host, startIdx + i),
            rotateSecs: globalRotate,
            enabled: true,
        }))
        setProxies(prev => [...prev, ...newEntries])
        setPasteText('')
        setPasteOpen(false)
    }

    const enabledCount = proxies.filter(p => p.enabled).length
    const avgRotate = enabledCount > 0
        ? Math.round(proxies.filter(p => p.enabled).reduce((s, p) => s + p.rotateSecs, 0) / enabledCount)
        : 0

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose()
            }}
        >
            <div
                className="w-[960px] max-w-[96vw] max-h-[90vh] bg-panel border border-border rounded-2xl shadow-panel flex flex-col overflow-hidden"
                onMouseDown={(e) => e.stopPropagation()}
            >

                {/* Header */}
                <div className="flex items-center gap-2 px-5 py-4 border-b border-border shrink-0">
                    <Shield className="w-4 h-4 text-accent" />
                    <span className="font-semibold text-sm text-text">{locale === 'en' ? 'Proxy Pool Settings' : 'Thiết lập pool proxy'}</span>
                    <span className="text-[10px] text-muted ml-1">{proxies.length} {locale === 'en' ? 'configured' : 'đã cấu hình'}{profileName ? ` · ${profileName}` : ''}</span>
                    <button
                        onClick={() => setProxies([])}
                        className="ml-auto px-2 py-0.5 text-[10px] text-danger border border-danger/30 hover:bg-danger/10 rounded transition-colors"
                        title="Xóa toàn bộ proxy cũ"
                    >
                        Xóa sạch proxy
                    </button>
                    <button onClick={onClose} className="ml-2 text-muted hover:text-text transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Quick paste section */}
                <div className="border-b border-border shrink-0">
                    <button
                        onClick={() => setPasteOpen(o => !o)}
                        className="w-full flex items-center gap-2 px-5 py-2.5 text-[11px] font-medium text-text hover:bg-surface/30 transition-colors"
                    >
                        <ClipboardPaste className="w-3.5 h-3.5 text-accent" />
                        {locale === 'en' ? 'Quick Paste' : 'Dán nhanh'}
                        <span className="text-[10px] text-muted font-normal ml-1">— {locale === 'en' ? 'paste proxy details in almost any format' : 'dán thông tin proxy ở nhiều định dạng'}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted ml-auto transition-transform ${pasteOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {pasteOpen && (
                        <div className="px-5 pb-3 space-y-2">
                            <textarea
                                value={pasteText}
                                onChange={e => { setPasteText(e.target.value); setParseError('') }}
                                placeholder={`Dán proxy info vào đây. Hỗ trợ nhiều format:\n\nIP: 4gusa4.id.proxyxoay.net\nTài Khoản: feko9v3s\nMật Khẩu: fEkO9v3s\nHTTP Port: 8178\n\nhoặc: host:port:user:pass\nhoặc: socks5://user:pass@host:port\nhoặc: http://user:pass@host:port\nhoặc nhiều block cùng lúc`}
                                className="w-full h-28 px-3 py-2.5 text-[11px] font-mono bg-surface border border-border rounded-xl text-text placeholder:text-muted/30 focus:outline-none focus:border-accent/50 resize-none leading-relaxed"
                            />
                            {parseError && (
                                <div className="flex items-center gap-1.5 text-[10px] text-danger">
                                    <AlertTriangle className="w-3 h-3" />{parseError}
                                </div>
                            )}
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-muted">
                                    Formats: <code className="bg-surface px-1 rounded">Labeled block</code> · <code className="bg-surface px-1 rounded">host:port:user:pass</code> · <code className="bg-surface px-1 rounded">user:pass@host:port</code> · <code className="bg-surface px-1 rounded">socks5://...</code> · <code className="bg-surface px-1 rounded">http://...</code>
                                </span>
                                <Button
                                    variant="primary" size="xs"
                                    className="ml-auto gap-1.5"
                                    disabled={!pasteText.trim()}
                                    onClick={handleParse}
                                >
                                    <ClipboardPaste className="w-3 h-3" />Parse & Add
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* ProxyXoay auth */}
                <div className="px-5 py-3 border-b border-border bg-surface/20">
                <div className="flex items-center gap-2 mb-2">
                    <div className="text-[11px] font-medium text-text">Rotate Config</div>
                    <label className="ml-auto inline-flex items-center gap-1.5 text-[10px] text-muted cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={useRotateUrl}
                            onChange={e => setUseRotateUrl(e.target.checked)}
                            className="ba-checkbox"
                        />
                        Bật rotate link
                    </label>
                </div>
                <div className="grid grid-cols-1 gap-2">
                    <input
                        value={rotateUrl}
                        onChange={e => setRotateUrl(e.target.value)}
                        disabled={!useRotateUrl}
                        placeholder="Rotate URL (không cần bearer với proxy mới)"
                        className="w-full h-8 px-3 text-[11px] font-mono bg-surface border border-border rounded-lg text-text placeholder:text-muted/40 focus:outline-none focus:border-accent/60"
                    />
                    <input
                        value={bearerToken}
                        onChange={e => setBearerToken(e.target.value)}
                            disabled={!useRotateUrl}
                            placeholder="Bearer access token (ưu tiên dùng token này)"
                            className="w-full h-8 px-3 text-[11px] font-mono bg-surface border border-border rounded-lg text-text placeholder:text-muted/40 focus:outline-none focus:border-accent/60"
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <input
                                value={providerUsername}
                                onChange={e => setProviderUsername(e.target.value)}
                                disabled={!useRotateUrl}
                                placeholder="ProxyXoay username (fallback login)"
                                className="w-full h-8 px-3 text-[11px] font-mono bg-surface border border-border rounded-lg text-text placeholder:text-muted/40 focus:outline-none focus:border-accent/60"
                            />
                            <input
                                value={providerPassword}
                                onChange={e => setProviderPassword(e.target.value)}
                                disabled={!useRotateUrl}
                                placeholder="ProxyXoay password (fallback login)"
                                className="w-full h-8 px-3 text-[11px] font-mono bg-surface border border-border rounded-lg text-text placeholder:text-muted/40 focus:outline-none focus:border-accent/60"
                            />
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <input
                                ref={importRef}
                                type="file"
                                accept=".json"
                                className="hidden"
                                onChange={async (e) => {
                                    const f = e.target.files?.[0]
                                    if (!f) return
                                    try {
                                        const txt = await f.text()
                                        const parsed = JSON.parse(txt)
                                        const importedProxies = Array.isArray(parsed?.proxies) ? parsed.proxies : []
                                        const importedRotate = normalizeRotateSeconds(parsed?.globalRotateSecs)
                                        const importedAuth = parsed?.proxyAuth || {}
                                        setProxies(importedProxies.map((p: ProxyEntry, i: number) => ({
                                            ...emptyProxy(),
                                            ...p,
                                            id: p.id || crypto.randomUUID(),
                                            code: p.code || autoCode(p.host || '', i),
                                        })))
                                        setGlobalRotate(importedRotate)
                                        setBearerToken(String(importedAuth?.bearerToken || ''))
                                        setProviderUsername(String(importedAuth?.providerUsername || ''))
                                        setProviderPassword(String(importedAuth?.providerPassword || ''))
                                        const importedRotateUrl = String(importedAuth?.rotateUrl || '')
                                        setRotateUrl(importedRotateUrl)
                                        setUseRotateUrl(Boolean(importedRotateUrl.trim()))
                                        setRotateResult(`Imported ${importedProxies.length} proxies from ${f.name}`)
                                    } catch (err) {
                                        setRotateResult(`Import failed: ${String(err)}`)
                                    } finally {
                                        if (importRef.current) importRef.current.value = ''
                                    }
                                }}
                            />
                            <Button
                                variant="secondary"
                                size="xs"
                                className="whitespace-nowrap"
                                onClick={() => {
                                    const payload = {
                                        profileName: profileName || 'default',
                                        exportedAt: new Date().toISOString(),
                                        globalRotateSecs: globalRotate,
                                        proxies,
                                        proxyAuth: {
                                            bearerToken: useRotateUrl ? bearerToken : '',
                                            providerUsername: useRotateUrl ? providerUsername : '',
                                            providerPassword: useRotateUrl ? providerPassword : '',
                                            rotateUrl: useRotateUrl ? rotateUrl : '',
                                        },
                                    }
                                    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
                                    const url = URL.createObjectURL(blob)
                                    const a = document.createElement('a')
                                    a.href = url
                                    a.download = `proxy_profile_${(profileName || 'default').replace(/[^a-z0-9_-]+/gi, '_')}.json`
                                    document.body.appendChild(a)
                                    a.click()
                                    a.remove()
                                    URL.revokeObjectURL(url)
                                    setRotateResult('Profile exported')
                                }}
                            >
                                Export
                            </Button>
                            <Button
                                variant="secondary"
                                size="xs"
                                className="whitespace-nowrap"
                                onClick={() => importRef.current?.click()}
                            >
                                Import
                            </Button>
                            <Button
                                variant="secondary"
                                size="xs"
                                className="whitespace-nowrap"
                                disabled={!onTestRotate || testingRotate || !useRotateUrl}
                                onClick={async () => {
                                    if (!onTestRotate || !useRotateUrl) return
                                    setTestingRotate(true)
                                    setRotateResult('')
                                    try {
                                        const res = await onTestRotate({ bearerToken, providerUsername, providerPassword, rotateUrl })
                                        setRotateResult(res.message)
                                    } catch (err) {
                                        setRotateResult(String(err))
                                    } finally {
                                        setTestingRotate(false)
                                    }
                                }}
                            >
                                {testingRotate ? 'Testing...' : 'Test Rotate'}
                            </Button>
                        </div>
                        {rotateResult && (
                            <div className={`mt-2 rounded-lg border px-2.5 py-2 text-[10px] leading-relaxed whitespace-pre-wrap break-words max-h-20 overflow-y-auto ${
                                /error|traceback|failed|exception|no handler|enoent/i.test(rotateResult)
                                    ? 'border-danger/40 bg-danger/10 text-danger'
                                    : 'border-border bg-surface/70 text-muted'
                            }`}>
                                {rotateResult}
                            </div>
                        )}
                    </div>
                </div>

                {/* Stats + global rotate */}
                <div className="flex items-center gap-4 px-5 py-2.5 bg-surface/20 border-b border-border text-[11px] shrink-0">
                    <span className="text-muted">Pool: <span className="text-text font-medium">{enabledCount}/{proxies.length} active</span></span>
                    <span className="text-muted">Avg rotate: <span className="text-text font-medium">{avgRotate}s</span></span>
                    {enabledCount === 0 && proxies.length > 0 && (
                        <span className="flex items-center gap-1 text-warning text-[10px]"><AlertTriangle className="w-3 h-3" />No proxy enabled</span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                        <span className="text-muted text-[10px]">Set all:</span>
                        <div className="flex items-center bg-surface border border-border rounded-lg overflow-hidden">
                            {ROTATE_PRESETS.map(p => (
                                <button key={p.secs}
                                    onClick={() => { setGlobalRotate(p.secs); setApplyGlobal(true) }}
                                    className={`px-2 py-1 text-[10px] transition-colors ${globalRotate === p.secs && applyGlobal ? 'bg-accent text-white' : 'text-muted hover:text-text'}`}
                                >{p.label}</button>
                            ))}
                            <input type="number" value={globalRotate}
                                onChange={e => { setGlobalRotate(+e.target.value); setApplyGlobal(true) }}
                                className="w-14 px-1.5 py-1 text-[10px] bg-transparent text-right text-text border-l border-border focus:outline-none"
                            />
                        </div>
                        {applyGlobal && (
                            <button onClick={applyGlobalRotate} className="text-[10px] text-accent hover:text-accentHover flex items-center gap-1 transition-colors">
                                <RefreshCw className="w-3 h-3" />Apply
                            </button>
                        )}
                    </div>
                </div>

                {/* Proxy list */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
                    {proxies.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-32 text-muted gap-2">
                            <Shield className="w-6 h-6 opacity-20" />
                            <span className="text-[11px]">Paste proxy info bên trên để bắt đầu</span>
                        </div>
                    ) : (
                        proxies.map((px, i) => (
                            <div key={px.id}
                                className={`border rounded-xl transition-colors ${px.enabled ? 'border-border/60 bg-surface/20' : 'border-border/20 opacity-40'}`}
                            >
                                <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
                                    <input type="checkbox" checked={px.enabled}
                                        onChange={e => update(px.id, 'enabled', e.target.checked)}
                                        className="ba-checkbox" />
                                    {/* Auto code tag */}
                                    <span className="text-[9px] font-mono px-1.5 py-0.5 bg-accent/10 text-accent border border-accent/20 rounded">
                                        {px.code || autoCode(px.host, i)}
                                    </span>
                                    <span className="text-[10px] text-muted font-mono truncate max-w-[220px]">
                                        {px.host}{px.port ? `:${px.port}` : ''}
                                    </span>
                                    {px.username && <span className="text-[9px] text-muted/50">· {px.username}</span>}
                                    <div className={`ml-auto text-[9px] px-1.5 py-0.5 rounded-full border ${px.enabled ? 'text-success border-success/30 bg-success/5 font-bold uppercase tracking-tighter' : 'text-muted border-border/40 font-bold uppercase tracking-tighter'}`}>
                                        {px.enabled ? 'Active' : 'Disabled'}
                                    </div>
                                    <button onClick={() => remove(px.id)} className="text-muted hover:text-danger transition-colors ml-1">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>

                                <div className="grid grid-cols-6 gap-2 px-3 pb-2.5">
                                    <div className="col-span-2">
                                        <label className="text-[9px] text-muted uppercase tracking-wider">Host</label>
                                        <input value={px.host} onChange={e => update(px.id, 'host', e.target.value)}
                                            className="w-full mt-0.5 h-6 px-2 text-[10px] font-mono bg-surface border border-border rounded-md text-text focus:outline-none focus:border-accent/60" />
                                    </div>
                                    <div>
                                        <label className="text-[9px] text-muted uppercase tracking-wider">Port</label>
                                        <input value={px.port} onChange={e => update(px.id, 'port', e.target.value)}
                                            className="w-full mt-0.5 h-6 px-2 text-[10px] font-mono bg-surface border border-border rounded-md text-text focus:outline-none focus:border-accent/60" />
                                    </div>
                                    <div>
                                        <label className="text-[9px] text-muted uppercase tracking-wider">User</label>
                                        <input value={px.username} onChange={e => update(px.id, 'username', e.target.value)}
                                            className="w-full mt-0.5 h-6 px-2 text-[10px] font-mono bg-surface border border-border rounded-md text-text focus:outline-none focus:border-accent/60" />
                                    </div>
                                    <div>
                                        <label className="text-[9px] text-muted uppercase tracking-wider">Pass</label>
                                        <input type="password" value={px.password} onChange={e => update(px.id, 'password', e.target.value)}
                                            className="w-full mt-0.5 h-6 px-2 text-[10px] font-mono bg-surface border border-border rounded-md text-text focus:outline-none focus:border-accent/60" />
                                    </div>
                                    <div>
                                        <label className="text-[9px] text-muted uppercase tracking-wider">Rotate (s)</label>
                                        <input type="number" value={px.rotateSecs} onChange={e => update(px.id, 'rotateSecs', +e.target.value)}
                                            className="w-full mt-0.5 h-6 px-2 text-[10px] font-mono bg-surface border border-border rounded-md text-text focus:outline-none focus:border-accent/60" />
                                    </div>
                                </div>

                                {px.enabled && px.rotateSecs < 120 && (
                                    <div className="px-3 pb-2 text-[9px] text-warning flex items-center gap-1">
                                        <AlertTriangle className="w-2.5 h-2.5" />Rotation &lt; 2 min — detect risk
                                    </div>
                                )}
                            </div>
                        ))
                    )}

                    <button onClick={() => setProxies(p => [...p, emptyProxy()])}
                        className="w-full h-8 border-2 border-dashed border-border/30 rounded-xl text-[10px] text-muted hover:text-text hover:border-accent/30 hover:bg-surface/20 transition-colors flex items-center justify-center gap-1.5">
                        <Plus className="w-3 h-3" />Add manually
                    </button>
                </div>

                {/* Info bar */}
                <div className="flex items-center gap-2 px-5 py-2 bg-accent/5 border-t border-accent/10 text-[10px] text-muted shrink-0">
                    <Info className="w-3 h-3 text-accent shrink-0" />
                    Round-robin pool. Khi proxy bị block → tự next proxy. ≥10 min rotation với ≤3 proxies là hợp lý.
                </div>

                {/* Footer */}
                <div className="flex items-center gap-2 px-5 py-3.5 border-t border-border shrink-0">
                    <span className="text-[10px] text-muted">
                        {enabledCount} proxy · avg {avgRotate}s · ~{enabledCount > 0 ? Math.round(3600 / avgRotate * enabledCount) : 0} rotations/hr
                    </span>
                    <Button variant="secondary" size="sm" onClick={onClose} className="ml-auto">Hủy</Button>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() => onSave(proxies, globalRotate, {
                            bearerToken: useRotateUrl ? bearerToken : '',
                            providerUsername: useRotateUrl ? providerUsername : '',
                            providerPassword: useRotateUrl ? providerPassword : '',
                            rotateUrl: useRotateUrl ? rotateUrl : '',
                        })}
                        className="gap-1.5"
                    >
                        <Shield className="w-3.5 h-3.5" />Save Config
                    </Button>
                </div>
            </div>
        </div>
    )
}
