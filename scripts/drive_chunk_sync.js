#!/usr/bin/env node
const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const XLSX = require('../app/node_modules/xlsx')
const { spawnSync } = require('child_process')

const BASE = process.env.BUG_AUTO_BASE || '/mnt/c/Users/Acer/AppData/Roaming/bug-auto'
const ROOT_FOLDER_ID = process.env.BUG_AUTO_GOOGLE_DRIVE_FOLDER_ID || '1T2dKn2ZKq77xsPBV-fI_Qo-DUyyZi5-d'
const OAUTH_CLIENT = process.env.BUG_AUTO_GOOGLE_OAUTH_CLIENT || '/mnt/f/herd/fox-auto/private/google-drive/oauth-web-client.json'
const OAUTH_REFRESH = process.env.BUG_AUTO_GOOGLE_OAUTH_REFRESH || '/mnt/f/herd/fox-auto/private/google-drive/oauth-user.json'
const CHUNK_SIZE = 200

function normalizeRuntimePath(input) {
  const raw = String(input || '').trim()
  if (!raw) return ''
  const m = raw.match(/^([A-Za-z]):[\\/](.*)$/)
  if (!m) return raw.replace(/\\/g, '/')
  return `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, '/')}`
}

function prettifyBatchToken(batchId) {
  return String(batchId || '')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36) || 'mixed'
}

function chunkIndexForOrdinal(ordinal) {
  return Math.max(1, Math.floor(Math.max(0, ordinal - 1) / CHUNK_SIZE) + 1)
}

function chunkLabelFromIndex(index) {
  const start = (index - 1) * CHUNK_SIZE + 1
  const end = index * CHUNK_SIZE
  return `chunk_${String(index).padStart(4, '0')}_${String(start).padStart(4, '0')}-${String(end).padStart(4, '0')}`
}

function buildPrettyPdfFileName(row, sequence, ext) {
  const person = String(row.name || row.record_name || row.NAME || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  const docId = String(row.confirmation_number || row.step6_ein || row.ein || '')
    .replace(/[^A-Za-z0-9-]+/g, '')
    .trim()
    .slice(0, 24)
  const recordId = String(row.record_id || '').trim().replace(/[^A-Za-z0-9-]+/g, '-').slice(0, 24)
  return `${[person || 'Record', docId || recordId || String(sequence).padStart(3, '0')].filter(Boolean).join(' - ')}${ext}`
}

function formatDob(rawInput) {
  const raw = String(rawInput || '').trim()
  if (!raw) return ''
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 2)}/${raw.slice(2, 4)}/${raw.slice(4, 8)}`
  const serial = Number(raw)
  if (Number.isFinite(serial) && serial > 20000 && serial < 60000) {
    const utcDays = Math.floor(serial - 25569)
    const dt = new Date(utcDays * 86400 * 1000)
    return `${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${String(dt.getUTCDate()).padStart(2, '0')}/${dt.getUTCFullYear()}`
  }
  return raw
}

function fileUrl(id) {
  return `https://drive.google.com/file/d/${id}/view`
}

function folderUrl(id) {
  return `https://drive.google.com/drive/folders/${id}`
}

function setSheetLayout(ws, headers, rows) {
  const textColumns = new Set(['SSN', 'ZIP', 'BOD', 'EIN', 'PDF', 'FOLDER_URL', 'REPORT_URL', 'DATE'])
  ws['!cols'] = headers.map((header) => {
    const maxLen = Math.max(header.length, ...rows.map((r) => String(r[header] || '').length))
    const maxWidth = ['PDF', 'FOLDER_URL', 'REPORT_URL'].includes(header) ? 96 : 36
    return { wch: Math.min(Math.max(maxLen + 2, 12), maxWidth) }
  })
  for (let r = 0; r < rows.length; r += 1) {
    for (let c = 0; c < headers.length; c += 1) {
      const header = headers[c]
      if (!textColumns.has(header)) continue
      const addr = XLSX.utils.encode_cell({ r: r + 1, c })
      if (!ws[addr]) continue
      ws[addr].t = 's'
      ws[addr].v = String(rows[r][header] || '')
      delete ws[addr].z
      delete ws[addr].w
    }
  }
}

async function getToken() {
  const oauthClient = JSON.parse(await fsp.readFile(OAUTH_CLIENT, 'utf8'))
  const refresh = JSON.parse(await fsp.readFile(OAUTH_REFRESH, 'utf8'))
  const body = new URLSearchParams({
    client_id: oauthClient.web.client_id,
    client_secret: oauthClient.web.client_secret,
    refresh_token: refresh.refresh_token,
    grant_type: 'refresh_token',
  })
  const resp = await fetch(oauthClient.web.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await resp.json()
  if (!resp.ok || !data.access_token) throw new Error(JSON.stringify(data))
  return data.access_token
}

async function listChildren(token, folderId) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`)
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,modifiedTime)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = await resp.json()
  if (!resp.ok) throw new Error(`list ${resp.status} ${JSON.stringify(data)}`)
  return data.files || []
}

async function ensureFolder(token, parentId, name) {
  const kids = await listChildren(token, parentId)
  const found = kids
    .filter((f) => f.name === name && f.mimeType === 'application/vnd.google-apps.folder')
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0]
  if (found) return found.id
  const resp = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  })
  const data = await resp.json()
  if (!resp.ok || !data.id) throw new Error(`ensureFolder ${resp.status} ${JSON.stringify(data)}`)
  return data.id
}

async function findByName(token, folderId, name) {
  const q = encodeURIComponent(`'${folderId}' in parents and name = '${name.replace(/'/g, "\\'")}' and trashed = false`)
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = await resp.json()
  if (!resp.ok) throw new Error(`find ${resp.status} ${JSON.stringify(data)}`)
  return data.files?.[0]?.id || ''
}

async function uploadFile(token, folderId, localPath, remoteName, mimeType, replaceExisting = false) {
  const existingId = replaceExisting ? await findByName(token, folderId, remoteName) : ''
  const metadata = JSON.stringify(existingId ? { name: remoteName } : { name: remoteName, parents: [folderId] })
  const boundary = `bugauto-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const fileBuffer = await fsp.readFile(localPath)
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  const uploadUrl = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart&supportsAllDrives=true`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true'
  const resp = await fetch(uploadUrl, {
    method: existingId ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  const data = await resp.json()
  if (!resp.ok || !data.id) throw new Error(`upload ${resp.status} ${JSON.stringify(data)}`)
  return data.id
}

async function makePublic(token, fileId) {
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  })
  if (!resp.ok && resp.status !== 409) throw new Error(`perm ${resp.status} ${await resp.text()}`)
}

function loadCurrentData() {
  const py = spawnSync('python3', ['-c', `
import csv, json, sqlite3
base = r'${BASE}'
results = []
with open(base + '/outputs/results.csv', newline='', encoding='utf-8') as f:
    for row in csv.DictReader(f):
        if (row.get('confirmation_number','').strip() or row.get('step6_ein','').strip()):
            results.append(row)
conn = sqlite3.connect(base + '/state/queue.db')
cur = conn.cursor()
records = {}
for (payload,) in cur.execute('select payload from jobs'):
    try:
        data = json.loads(payload or '{}')
        rec = data.get('record') or {}
        rid = str(rec.get('record_id') or '').strip()
        if rid:
            records[rid] = {k: '' if v is None else str(v).strip() for k,v in rec.items()}
    except Exception:
        pass
print(json.dumps({'results': results, 'records': records}))
`], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 })
  if (py.status !== 0) throw new Error(py.stderr || 'python failed')
  return JSON.parse(py.stdout)
}

async function syncOnce() {
  const token = await getToken()
  const dump = loadCurrentData()
  const results = dump.results || []
  const records = dump.records || {}
  const byBatch = new Map()
  for (const row of results) {
    const batchId = String(row.batch_id || '').trim() || 'mixed'
    if (!byBatch.has(batchId)) byBatch.set(batchId, [])
    byBatch.get(batchId).push(row)
  }
  const state = { version: 1, report_pushed_count_by_batch: {}, pdf_url_by_batch_record: {} }
  const outDir = path.join(BASE, 'outputs', 'reports')
  await fsp.mkdir(outDir, { recursive: true })

  for (const [batchId, batchRows] of byBatch.entries()) {
    const batchToken = prettifyBatchToken(batchId)
    const batchRootId = await ensureFolder(token, ROOT_FOLDER_ID, batchToken)
    const chunkCount = Math.max(1, Math.ceil(batchRows.length / CHUNK_SIZE))
    const summaryRows = []
    for (let chunkIndex = 1; chunkIndex <= chunkCount; chunkIndex += 1) {
      const start = (chunkIndex - 1) * CHUNK_SIZE
      const chunkRows = batchRows.slice(start, start + CHUNK_SIZE)
      if (!chunkRows.length) continue
      const chunkLabel = chunkLabelFromIndex(chunkIndex)
      const chunkFolderId = await ensureFolder(token, batchRootId, chunkLabel)
      const chunkFolderUrl = folderUrl(chunkFolderId)
      const reportRows = []
      const nameSeen = new Set()
      for (let i = 0; i < chunkRows.length; i += 1) {
        const result = chunkRows[i]
        const input = records[String(result.record_id || '').trim()] || {}
        const localPath = normalizeRuntimePath(String(result.final_pdf_path || result.pdf_path || '').trim())
        let pdfUrl = ''
        if (localPath && fs.existsSync(localPath)) {
          let remoteName = buildPrettyPdfFileName({ ...result, ...input }, i + 1, path.extname(localPath) || '.pdf')
          if (nameSeen.has(remoteName)) {
            const ext = path.extname(remoteName) || '.pdf'
            const stem = remoteName.slice(0, -ext.length)
            remoteName = `${stem} - ${String(result.record_id || '').trim().slice(0, 24)}${ext}`
          }
          nameSeen.add(remoteName)
          const fileId = await uploadFile(token, chunkFolderId, localPath, remoteName, 'application/pdf', true)
          await makePublic(token, fileId)
          pdfUrl = fileUrl(fileId)
          state.pdf_url_by_batch_record[`${batchId}::${String(result.record_id || '').trim()}`] = pdfUrl
        }
        const addr = String(input.ADDRESS || '').trim()
        const citi = String(input.CITI || '').trim()
        const bang = String(input.BANG || '').trim()
        const zip = String(input.ZIP || '').trim()
        reportRows.push({
          NAME: String(input.NAME || result.name || result.record_name || '').trim(),
          SSN: String(input.SSN || '').trim(),
          ADDRESS: addr,
          CITI: citi,
          BANG: bang,
          ZIP: zip,
          BOD: formatDob(input.DOB || ''),
          EIN: String(result.confirmation_number || result.step6_ein || '').trim(),
          'NAME LLC': String(result.step6_legal_name || input.NAME || result.name || result.record_name || '').trim(),
          'ADDRESS LLC': addr,
          'CITI LLC': citi,
          'BANG LLC': String(result.step6_state || bang || '').trim(),
          'ZIP LLC': zip,
          PDF: pdfUrl,
          FOLDER_URL: chunkFolderUrl,
        })
      }
      const reportHeaders = ['NAME', 'SSN', 'ADDRESS', 'CITI', 'BANG', 'ZIP', 'BOD', 'EIN', 'NAME LLC', 'ADDRESS LLC', 'CITI LLC', 'BANG LLC', 'ZIP LLC', 'PDF', 'FOLDER_URL']
      const reportWs = XLSX.utils.json_to_sheet(reportRows, { header: reportHeaders })
      setSheetLayout(reportWs, reportHeaders, reportRows)
      const reportWb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(reportWb, reportWs, 'report')
      const localReport = path.join(outDir, `${batchToken}_${chunkLabel}.xlsx`)
      XLSX.writeFile(reportWb, localReport)
      const reportId = await uploadFile(token, chunkFolderId, localReport, 'report.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', true)
      await makePublic(token, reportId)
      summaryRows.push({
        CHUNK: chunkLabel,
        FOLDER_URL: chunkFolderUrl,
        REPORT_URL: fileUrl(reportId),
        ROWS: chunkRows.length,
        DATE: String(chunkRows[chunkRows.length - 1].completed_at || new Date().toISOString()).trim(),
      })
    }
    const summaryHeaders = ['CHUNK', 'FOLDER_URL', 'REPORT_URL', 'ROWS', 'DATE']
    const summaryWs = XLSX.utils.json_to_sheet(summaryRows, { header: summaryHeaders })
    setSheetLayout(summaryWs, summaryHeaders, summaryRows)
    const summaryWb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(summaryWb, summaryWs, 'chunks')
    const localSummary = path.join(outDir, `summary_${batchToken}.xlsx`)
    XLSX.writeFile(summaryWb, localSummary)
    const summaryId = await uploadFile(token, batchRootId, localSummary, 'summary.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', true)
    await makePublic(token, summaryId)
    state.report_pushed_count_by_batch[batchId] = batchRows.length
  }
  await fsp.mkdir(path.dirname(path.join(BASE, 'outputs', 'export_state', 'google-drive-auto-v1.json')), { recursive: true })
  await fsp.writeFile(path.join(BASE, 'outputs', 'export_state', 'google-drive-auto-v1.json'), JSON.stringify(state, null, 2), 'utf8')
  return { batches: Array.from(byBatch.keys()), confirmed: results.length }
}

async function main() {
  const intervalMs = Number(process.env.BUG_AUTO_DRIVE_SYNC_INTERVAL_MS || '15000')
  while (true) {
    try {
      const res = await syncOnce()
      console.log(`[drive-sync] synced confirmed=${res.confirmed} batches=${res.batches.join(',')}`)
    } catch (err) {
      console.error(`[drive-sync] ${String(err)}`)
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
