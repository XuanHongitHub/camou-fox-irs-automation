import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button } from '../base/Button'
import {
  ShoppingBag,
  RefreshCw,
  Camera,
  Check,
  Globe,
  Smartphone,
  Image as ImageIcon,
  Sparkles,
  AlertCircle,
  Search,
  ChevronRight,
  Sliders,
  FolderOpen,
  Building,
  CheckCircle2,
  X,
  Plus,
  ArrowRight,
  Lock,
  Copy,
  CheckSquare,
  Square as SquareIcon,
  Zap,
  FileText,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  UploadCloud,
  ChevronDown,
  Clock,
  History,
  Stethoscope,
  XCircle,
  CheckCheck,
  Play
} from 'lucide-react'

export interface RecordItem {
  rowNumber: number
  id: string
  status: string
  regDate: string
  submissionRound?: number
  liveStatus?: string
  history?: any[]
  lastError?: string
  issueDate?: string
  seller?: string
  email: string
  mailPass: string
  twoFactor: string
  proxy: string
  tiktokPass?: string
  phone?: string
  phoneCodeUrl?: string
  fullName: string
  dob: string
  is195x?: boolean
  ageWarning?: string
  gender?: string
  address: string
  city: string
  state: string
  zipCode: string
  dl: string
  ssn: string
  ein: string
  nameLlc?: string
  addressLlc?: string
  cityLlc?: string
  stateLlc?: string
  zipLlc?: string
  pdfDoc?: string
  folderUrl?: string
  bankStatement?: string
  businessType: string
  businessName: string
  sourceTab?: string
  assignedPort?: number
  proxyMeta?: any
  adspowerId?: string
  readyStatus?: '100_ready' | '99_ready' | 'pending'
  readinessScore?: number
  checkList?: {
    hasInfo: boolean
    hasTax: boolean
    hasDocs: boolean
    hasAuth: boolean
    hasProxy: boolean
    hasBrowser: boolean
    hasPhotos: boolean
  }
}

export interface PhotoAssignment {
  frontOriginal?: string
  frontProcessed?: string
  backOriginal?: string
  backProcessed?: string
  preset?: string
  updatedAt?: number
}

// 50 US States + DC Matrix for Flexible Real-time Binding
export const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' }
]

// Historical & Master Data Tabs - Strictly Protected (Read-Only)
export const PROTECTED_TABS = new Set([
  'phần 1', 'phần 2', 'automation', 'acc cap', 'info cũ',
  'phan 1', 'phan 2', 'info cu'
])

const ttsIpc = {
  status: async () => {
    if (window.api?.tts?.status) return await window.api.tts.status()
    if (window.electron?.ipcRenderer) return await window.electron.ipcRenderer.invoke('tts:status')
    return { ok: false, error: 'IPC unavailable' }
  },
  fetchSheet: async (params?: any) => {
    if (window.api?.tts?.fetchSheet) return await window.api.tts.fetchSheet(params)
    if (window.electron?.ipcRenderer) return await window.electron.ipcRenderer.invoke('tts:sheet:fetch', params)
    return { ok: false, error: 'IPC unavailable' }
  },
  smartSetup: async (params: { record: any; autoBuyProxy?: boolean }) => {
    if (window.api?.tts?.smartSetup) return await window.api.tts.smartSetup(params)
    if (window.electron?.ipcRenderer) return await window.electron.ipcRenderer.invoke('tts:smart:setup', params)
    return { ok: false, error: 'IPC unavailable' }
  },
  batchSmartSetup: async (params: { records: any[]; autoBuyProxy?: boolean }) => {
    if (window.api?.tts?.batchSmartSetup) return await window.api.tts.batchSmartSetup(params)
    if (window.electron?.ipcRenderer) return await window.electron.ipcRenderer.invoke('tts:smart:batch-setup', params)
    return { ok: false, error: 'IPC unavailable' }
  },
  hideproxyPorts: async () => {
    if (window.api?.tts?.hideproxy?.ports) return await window.api.tts.hideproxy.ports()
    if (window.electron?.ipcRenderer) return await window.electron.ipcRenderer.invoke('tts:hideproxy:ports')
    return { ok: false, data: [] }
  },
  hideproxyPortInfo: async () => {
    if (window.api?.tts?.hideproxy?.portInfo) return await window.api.tts.hideproxy.portInfo()
    if (window.electron?.ipcRenderer) return await window.electron.ipcRenderer.invoke('tts:hideproxy:port-info')
    return { ok: false, data: [] }
  },
  hideproxyForward: async (params: { id: string; port: number }) => {
    if (window.api?.tts?.hideproxy?.forward) return await window.api.tts.hideproxy.forward(params)
    if (window.electron?.ipcRenderer) return await window.electron.ipcRenderer.invoke('tts:hideproxy:forward', params)
    return { ok: false, error: 'IPC unavailable' }
  },
  hideproxyBuy: async (params: any) => {
    if (window.api?.tts?.hideproxy?.buy) return await window.api.tts.hideproxy.buy(params)
    if (window.electron?.ipcRenderer) return await window.electron.ipcRenderer.invoke('tts:hideproxy:buy', params)
    return { ok: false, error: 'IPC unavailable' }
  },
  adspowerList: async (groupId?: string) => {
    if (window.api?.tts?.adspower?.list) return await window.api.tts.adspower.list(groupId)
    if (window.electron?.ipcRenderer) return await window.electron.ipcRenderer.invoke('tts:adspower:list', groupId)
    return { ok: false, data: [] }
  },
  adspowerCreate: async (payload: any) => {
    if (window.api?.tts?.adspower?.create) return await window.api.tts.adspower.create(payload)
    if (window.electron?.ipcRenderer) return await window.electron.ipcRenderer.invoke('tts:adspower:create', payload)
    return { ok: false, error: 'IPC unavailable' }
  },
  adspowerStart: async (userId: string) => {
    if (window.api?.tts?.adspower?.start) return await window.api.tts.adspower.start(userId)
    if (window.electron?.ipcRenderer) return await window.electron.ipcRenderer.invoke('tts:adspower:start', userId)
    return { ok: false, error: 'IPC unavailable' }
  },
  adspowerStop: async (userId: string) => {
    if (window.api?.tts?.adspower?.stop) return await window.api.tts.adspower.stop(userId)
    if (window.electron?.ipcRenderer) return await window.electron.ipcRenderer.invoke('tts:adspower:stop', userId)
    return { ok: false, error: 'IPC unavailable' }
  },
  inboxList: async () => {
    if (window.api?.tts?.inbox?.list) return await window.api.tts.inbox.list()
    if (window.electron?.ipcRenderer) return await window.electron.ipcRenderer.invoke('tts:inbox:list')
    return { ok: false, files: [] }
  },
  pickImage: async () => {
    if (window.api?.tts?.inbox?.pickImage) return await window.api.tts.inbox.pickImage()
    if (window.electron?.ipcRenderer) return await window.electron.ipcRenderer.invoke('tts:dialog:pick-image')
    return { ok: false, cancelled: true }
  },
  pickMultipleImages: async () => {
    if (window.api?.tts?.inbox?.pickMultipleImages) return await window.api.tts.inbox.pickMultipleImages()
    if (window.electron?.ipcRenderer) return await window.electron.ipcRenderer.invoke('tts:dialog:pick-multiple-images')
    return { ok: false, cancelled: true, filePaths: [] }
  },
  pickFolder: async () => {
    if (window.api?.tts?.inbox?.pickFolder) return await window.api.tts.inbox.pickFolder()
    if (window.electron?.ipcRenderer) return await window.electron.ipcRenderer.invoke('tts:dialog:pick-folder')
    return { ok: false, cancelled: true }
  },
  autoDetect2Sides: async (params: { records: any[]; folderPath?: string; filePaths?: string[]; preset?: string }) => {
    if (window.api?.tts?.pool?.autoDetect2Sides) return await window.api.tts.pool.autoDetect2Sides(params)
    if (window.electron?.ipcRenderer) return await window.electron.ipcRenderer.invoke('tts:pool:auto-detect-2sides', params)
    return { ok: false, error: 'IPC unavailable' }
  },
  getVariants: async (profileId: string) => {
    if (window.api?.tts?.pool?.getVariants) return await window.api.tts.pool.getVariants(profileId)
    if (window.electron?.ipcRenderer) return await window.electron.ipcRenderer.invoke('tts:pool:get-variants', profileId)
    return { ok: false, variants: [] }
  },
  assignVariant: async (params: { profileId: string; frontPath: string; backPath: string; name?: string }) => {
    if (window.api?.tts?.pool?.assignVariant) return await window.api.tts.pool.assignVariant(params)
    if (window.electron?.ipcRenderer) return await window.electron.ipcRenderer.invoke('tts:pool:assign-variant', params)
    return { ok: false }
  },
  readImageDataUrl: async (filePath: string) => {
    if (window.api?.tts?.image?.readDataUrl) return await window.api.tts.image.readDataUrl(filePath)
    if (window.electron?.ipcRenderer) return await window.electron.ipcRenderer.invoke('tts:image:read-data-url', filePath)
    return { ok: false }
  },
  processImage: async (params: any) => {
    if (window.api?.tts?.processImage) return await window.api.tts.processImage(params)
    if (window.electron?.ipcRenderer) return await window.electron.ipcRenderer.invoke('tts:image:process', params)
    return { ok: false, error: 'IPC unavailable' }
  },
  stateGet: async () => {
    if (window.api?.tts?.state?.get) return await window.api.tts.state.get()
    if (window.electron?.ipcRenderer) return await window.electron.ipcRenderer.invoke('tts:state:get')
    return { ok: false }
  },
  stateSave: async (payload: any) => {
    if (window.api?.tts?.state?.save) return await window.api.tts.state.save(payload)
    if (window.electron?.ipcRenderer) return await window.electron.ipcRenderer.invoke('tts:state:save', payload)
    return { ok: false }
  },
  preflight: async () => {
    if ((window.api?.tts as any)?.preflight) return await (window.api.tts as any).preflight()
    if (window.electron?.ipcRenderer) return await window.electron.ipcRenderer.invoke('tts:system:preflight')
    return { ok: false, error: 'IPC unavailable' }
  },
  mailCheck: async (params: { email: string; pass?: string; twoFactor?: string }) => {
    if (window.electron?.ipcRenderer) return await window.electron.ipcRenderer.invoke('tts:mail:check', params)
    return { ok: false, error: 'IPC unavailable' }
  },
  mailBatchCheck: async (records: any[]) => {
    if (window.electron?.ipcRenderer) return await window.electron.ipcRenderer.invoke('tts:mail:batch-check', records)
    return { ok: false, error: 'IPC unavailable' }
  },
  uploadHarvest: async (payload: any) => {
    if (window.electron?.ipcRenderer) return await window.electron.ipcRenderer.invoke('tts:upload:harvest', payload)
    return { ok: false, error: 'IPC unavailable' }
  },
  uploadGetHarvested: async (recordId: string) => {
    if (window.electron?.ipcRenderer) return await window.electron.ipcRenderer.invoke('tts:upload:get-harvested', recordId)
    return { ok: false, list: [] }
  }
}


export function TtsBotView() {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'records' | 'studio' | 'hideproxy' | 'adspower'>('records')

  // Real-time Service Status
  const [status, setStatus] = useState<{
    adspower: { online: boolean; base: string }
    hideproxy: { online: boolean; base: string }
  }>({
    adspower: { online: false, base: 'http://127.0.0.1:50325' },
    hideproxy: { online: false, base: 'http://127.0.0.1:10101' }
  })
  const [isCheckingStatus, setIsCheckingStatus] = useState(false)

  // Sheet State
  const [sheetId] = useState('1wAh6we1CsSuPVbCOD5vRyO3KJqNKBbcdq7LBZVlI268')
  const [selectedSheetTab, setSelectedSheetTab] = useState('TTS Chạy Thật')
  const [customTabInput, setCustomTabInput] = useState('')
  const [isCustomTab, setIsCustomTab] = useState(false)
  const [records, setRecords] = useState<RecordItem[]>([])
  const [isLoadingSheet, setIsLoadingSheet] = useState(false)
  const [sheetError, setSheetError] = useState('')

  // Two-way & State Management
  const [activeRuns, setActiveRuns] = useState<RecordItem[]>([])
  const [consumedRecords, setConsumedRecords] = useState<Record<string, { consumedAt: number; fromTab: string }>>({})
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())
  const [hideConsumed, setHideConsumed] = useState(false)

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('')
  const [filterState, setFilterState] = useState<string>('all')

  // Smart Setup States
  const [isSettingUpId, setIsSettingUpId] = useState<string | null>(null)
  const [isBatchSettingUp, setIsBatchSettingUp] = useState(false)
  const [setupFeedback, setSetupFeedback] = useState<string>('')

  // Smart Setup Modal State (Single & Bulk with Live Telemetry)
  const [setupModalConfig, setSetupModalConfig] = useState<{
    isOpen: boolean
    mode: 'single' | 'bulk'
    records: RecordItem[]
    selectedPort?: number
    isExecuting?: boolean
    progress?: {
      current: number
      total: number
      currentRecordId?: string
      currentStatus?: string
    }
  }>({
    isOpen: false,
    mode: 'single',
    records: []
  })

  // Full Flow Dry-Run / Preflight Diagnostics State
  const [showPreflightModal, setShowPreflightModal] = useState(false)
  const [preflightData, setPreflightData] = useState<any>(null)
  const [isRunningPreflight, setIsRunningPreflight] = useState(false)
  const [preflightCopyFeedback, setPreflightCopyFeedback] = useState(false)

  // Selected Record & Drawer
  const [selectedRecordId, setSelectedRecordId] = useState<string>('')
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  // Add Record Modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState({
    id: '',
    fullName: '',
    state: 'AR',
    city: '',
    address: '',
    zipCode: '',
    dob: '',
    ssn: '',
    ein: '',
    phone: '',
    email: '',
    mailPass: '',
    twoFactor: ''
  })

  // Photo Assignments & State Persistence
  const [assignments, setAssignments] = useState<Record<string, PhotoAssignment>>({})
  const [profileSetups, setProfileSetups] = useState<Record<string, any>>({})
  const [inboxFiles, setInboxFiles] = useState<Array<{ name: string; fullPath: string; size: number; folder: string }>>([])
  const [selectedPreset, setSelectedPreset] = useState<string>('iPhone 15 Pro')
  const [isProcessingFront, setIsProcessingFront] = useState(false)
  const [isProcessingBack, setIsProcessingBack] = useState(false)
  const [studioFeedback, setStudioFeedback] = useState<string>('')

  // HideProxy State
  const [hpPorts, setHpPorts] = useState<any[]>([])
  const [isLoadingPorts, setIsLoadingPorts] = useState(false)
  const [buyProxyModalOpen, setBuyProxyModalOpen] = useState(false)
  const [targetProxyState, setTargetProxyState] = useState('')
  const [isBuyingProxy, setIsBuyingProxy] = useState(false)
  const [proxyBuyFeedback, setProxyBuyFeedback] = useState('')

  // AdsPower State
  const [adspowerProfiles, setAdspowerProfiles] = useState<any[]>([])
  const [isLoadingAdsProfiles, setIsLoadingAdsProfiles] = useState(false)
  const [isCreatingAdsProfile, setIsCreatingAdsProfile] = useState(false)
  const [adspowerFeedback, setAdspowerFeedback] = useState('')

  // Photo Pool Lightbox Modal State
  const [poolModalRecord, setPoolModalRecord] = useState<RecordItem | null>(null)
  const [poolVariants, setPoolVariants] = useState<any[]>([])
  const [poolThumbnails, setPoolThumbnails] = useState<{ front?: string; back?: string }>({})
  const [isLoadingPool, setIsLoadingPool] = useState(false)
  const [selectedVariantId, setSelectedVariantId] = useState<string>('')
  const [poolFeedback, setPoolFeedback] = useState<string>('')

  // Mail Checker State & Live Sync
  const [mailStatuses, setMailStatuses] = useState<Record<string, any>>({})
  const [isCheckingAllMails, setIsCheckingAllMails] = useState(false)
  const [checkingMailId, setCheckingMailId] = useState<string | null>(null)

  // Harvested Uploads (Auto-recorded from TikTok forms)
  const [harvestedUploads, setHarvestedUploads] = useState<Record<string, Array<{ fileName: string; side?: string; uploadedAt: number }>>>({})

  // Watchdog Timers (6 minutes per record)
  const [activeWatchdogs, setActiveWatchdogs] = useState<Record<string, { remaining: number; startedAt: number; intervalId?: any }>>({})

  // Pipeline Filter (Replaces old '99_ready', '100_ready')
  const [pipelineFilter, setPipelineFilter] = useState<'all' | 'not_registered' | 'otp_or_pending' | 'under_review' | 'rejected' | 'approved'>('all')

  // Pool folder path
  const [poolFolderPath, setPoolFolderPath] = useState<string>('outputs/clean_camera_mockups')

  // 1. Check API Status
  const refreshStatus = useCallback(async () => {
    setIsCheckingStatus(true)
    try {
      const res = await ttsIpc.status()
      if (res && res.ok) {
        setStatus({
          adspower: res.adspower,
          hideproxy: res.hideproxy
        })
      }
    } catch (err) {
      console.error('Failed to probe status:', err)
    } finally {
      setIsCheckingStatus(false)
    }
  }, [])

  // 2. Load Local State (Saved Assignments & Tasks)
  const loadSavedState = useCallback(async () => {
    try {
      const res = await ttsIpc.stateGet()
      if (res && res.ok && res.data) {
        if (res.data.assignments) setAssignments(res.data.assignments)
        if (res.data.profileSetups) setProfileSetups(res.data.profileSetups)
        if (res.data.activeRuns) setActiveRuns(res.data.activeRuns)
        if (res.data.consumedRecords) setConsumedRecords(res.data.consumedRecords)
        if (res.data.activeTab) setSelectedSheetTab(res.data.activeTab)
        if (res.data.harvestedUploads) setHarvestedUploads(res.data.harvestedUploads)
        if (res.data.mailStatuses) setMailStatuses(res.data.mailStatuses)
        if (res.data.poolFolderPath) setPoolFolderPath(res.data.poolFolderPath)
      }
    } catch (err) {
      console.error('Failed to load state:', err)
    }
  }, [])

  // 3. Save State Helper
  const persistState = useCallback(async (
    newAssignments?: Record<string, PhotoAssignment>,
    newActiveRuns?: RecordItem[],
    newConsumed?: Record<string, { consumedAt: number; fromTab: string }>,
    newHarvested?: Record<string, any>,
    newMailStatuses?: Record<string, any>
  ) => {
    try {
      await ttsIpc.stateSave({
        assignments: newAssignments ?? assignments,
        activeRuns: newActiveRuns ?? activeRuns,
        consumedRecords: newConsumed ?? consumedRecords,
        harvestedUploads: newHarvested ?? harvestedUploads,
        mailStatuses: newMailStatuses ?? mailStatuses,
        poolFolderPath,
        activeTab: selectedSheetTab,
        updatedAt: Date.now()
      })
    } catch (err) {
      console.error('Failed to save state:', err)
    }
  }, [assignments, activeRuns, consumedRecords, harvestedUploads, mailStatuses, poolFolderPath, selectedSheetTab])


  // State Normalization helper
  const normalizeState = (input: string): string => {
    if (!input) return ''
    const trimmed = input.trim().toLowerCase()
    const found = US_STATES.find(
      (s) => s.code.toLowerCase() === trimmed || s.name.toLowerCase() === trimmed
    )
    return found ? found.code : input.toUpperCase().trim()
  }

  // Open Single Setup Modal
  const openSingleSetupModal = (record: RecordItem) => {
    const stateNorm = normalizeState(record.state || '')
    const matched = hpPorts.find((p) => p.online && normalizeState(p.state || '') === stateNorm)
    const port = record.assignedPort || (matched ? matched.port : 50007)
    setSetupModalConfig({
      isOpen: true,
      mode: 'single',
      records: [record],
      selectedPort: port,
      isExecuting: false,
      progress: undefined
    })
  }

  // ─── Mail Checking Handlers (Auto-Trigger & Lightweight Native XOAUTH2) ───
  const handleCheckSingleMail = async (record: RecordItem) => {
    if (!record.email) return
    setCheckingMailId(record.id)
    try {
      const res = await ttsIpc.mailCheck({
        email: record.email,
        pass: record.mailPass,
        twoFactor: record.twoFactor
      })
      if (res && res.ok) {
        setMailStatuses((prev) => {
          const updated = { ...prev, [record.id]: res }
          persistState(undefined, undefined, undefined, undefined, updated)
          return updated
        })
      } else {
        setMailStatuses((prev) => ({
          ...prev,
          [record.id]: {
            ok: false,
            email: record.email,
            count: 0,
            status: 'error',
            label: res?.label || res?.error || 'Lỗi đọc mail',
            checkedAt: Date.now()
          }
        }))
      }
    } catch (e: any) {
      console.error('Mail check failed:', e)
    } finally {
      setCheckingMailId(null)
    }
  }

  const handleAutoCheckAllMails = async (targetList?: RecordItem[]) => {
    const list = (targetList || records).filter((r) => r.email)
    if (list.length === 0) return
    setIsCheckingAllMails(true)
    try {
      const payload = list.map((r) => ({
        id: r.id,
        email: r.email,
        pass: r.mailPass,
        twoFactor: r.twoFactor
      }))
      const res = await ttsIpc.mailBatchCheck(payload)
      if (res && res.ok && res.results) {
        setMailStatuses((prev) => {
          const updated = { ...prev, ...res.results }
          persistState(undefined, undefined, undefined, undefined, updated)
          return updated
        })
      }
    } catch (e) {
      console.error('Batch mail check error:', e)
    } finally {
      setIsCheckingAllMails(false)
    }
  }

  // ─── 6-Minute Watchdog Trigger ───
  const start6MinWatchdog = (record: RecordItem) => {
    const recId = record.id
    if (activeWatchdogs[recId]) return

    const totalSeconds = 360 // 6 minutes
    const startedAt = Date.now()

    const intervalId = setInterval(() => {
      setActiveWatchdogs((prev) => {
        const current = prev[recId]
        if (!current) return prev
        const remaining = Math.max(0, current.remaining - 1)

        // Poll mail every 30 seconds
        if (remaining % 30 === 0 || remaining === 0) {
          handleCheckSingleMail(record)
        }

        if (remaining <= 0) {
          clearInterval(current.intervalId)
          const updated = { ...prev }
          delete updated[recId]
          return updated
        }

        return { ...prev, [recId]: { ...current, remaining } }
      })
    }, 1000)

    setActiveWatchdogs((prev) => ({
      ...prev,
      [recId]: { remaining: totalSeconds, startedAt, intervalId }
    }))

    // Immediate check
    handleCheckSingleMail(record)
  }

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const stopWatchdog = (recId: string) => {
    setActiveWatchdogs((prev) => {
      const current = prev[recId]
      if (current?.intervalId) clearInterval(current.intervalId)
      const updated = { ...prev }
      delete updated[recId]
      return updated
    })
  }

  const [launchingProfileId, setLaunchingProfileId] = useState<string | null>(null)

  const handleLaunchAdsPower = async (record: RecordItem) => {
    const adsProfile = adspowerProfiles.find((p) => p.name === record.id || p.user_id === record.adspowerId)
    const userId = record.adspowerId || adsProfile?.user_id
    if (!userId) {
      handleSmartSetup(record)
      return
    }
    setLaunchingProfileId(record.id)
    try {
      const res = await ttsIpc.adspowerStart(userId)
      if (res?.ok) {
        setSetupFeedback(`Đã mở AdsPower profile: ${record.id}`)
      } else {
        setSetupFeedback(`Không thể mở AdsPower: ${res?.error || 'Lỗi không xác định'}`)
      }
    } catch (err: any) {
      setSetupFeedback(`Lỗi mở AdsPower: ${err?.message || err}`)
    } finally {
      setLaunchingProfileId(null)
    }
  }

  // Clean up active watchdogs on unmount
  useEffect(() => {
    return () => {
      Object.values(activeWatchdogs).forEach((w) => {
        if (w.intervalId) clearInterval(w.intervalId)
      })
    }
  }, [activeWatchdogs])


  // Open Bulk Setup Modal
  const openBulkSetupModal = () => {
    const targetRecords =
      selectedRowIds.size > 0
        ? records.filter((r) => selectedRowIds.has(r.id))
        : records.filter((r) => r.readyStatus !== '100_ready')

    if (targetRecords.length === 0) {
      setSetupFeedback('Không có hồ sơ nào cần thiết lập.')
      return
    }

    setSetupModalConfig({
      isOpen: true,
      mode: 'bulk',
      records: targetRecords,
      isExecuting: false,
      progress: undefined
    })
  }

  // Execute single setup from modal
  const handleExecuteModalSingleSetup = async () => {
    if (!setupModalConfig.records[0]) return
    const target = setupModalConfig.records[0]
    setIsSettingUpId(target.id)
    setSetupModalConfig((prev) => ({
      ...prev,
      isExecuting: true,
      progress: {
        current: 1,
        total: 1,
        currentRecordId: target.id,
        currentStatus: 'Đang gán Proxy & khởi tạo Profile AdsPower...'
      }
    }))
    try {
      const recWithPort = {
        ...target,
        assignedPort: setupModalConfig.selectedPort || target.assignedPort
      }
      const res = await ttsIpc.smartSetup({
        record: recWithPort,
        autoBuyProxy: false
      })
      if (res && res.ok && res.record) {
        setRecords((prev) => prev.map((r) => (r.id === res.record.id ? res.record : r)))
        setActiveRuns((prev) => prev.map((r) => (r.id === res.record.id ? res.record : r)))
        refreshHideProxyPorts()
        refreshAdsPowerProfiles()
        setSetupModalConfig((prev) => ({
          ...prev,
          records: [res.record],
          isExecuting: false,
          progress: {
            current: 1,
            total: 1,
            currentRecordId: target.id,
            currentStatus: 'Hoàn tất thiết lập!'
          }
        }))
        setSetupFeedback(
          `⚡ Setup thành công cho ${res.record.id}! Port: ${res.record.assignedPort}, AdsPower: ${res.record.adspowerId}`
        )
      } else {
        setSetupModalConfig((prev) => ({
          ...prev,
          isExecuting: false,
          progress: {
            current: 1,
            total: 1,
            currentRecordId: target.id,
            currentStatus: `Lỗi: ${res?.error || 'Thất bại'}`
          }
        }))
      }
    } catch (err: any) {
      setSetupModalConfig((prev) => ({
        ...prev,
        isExecuting: false,
        progress: {
          current: 1,
          total: 1,
          currentRecordId: target.id,
          currentStatus: `Lỗi: ${err?.message || err}`
        }
      }))
    } finally {
      setIsSettingUpId(null)
    }
  }

  // Execute bulk setup from modal
  const handleExecuteModalBulkSetup = async () => {
    if (setupModalConfig.records.length === 0) return
    const targetRecords = setupModalConfig.records
    setIsBatchSettingUp(true)
    setSetupModalConfig((prev) => ({
      ...prev,
      isExecuting: true,
      progress: {
        current: 0,
        total: targetRecords.length,
        currentStatus: 'Bắt đầu thiết lập hàng loạt...'
      }
    }))

    const updatedList: RecordItem[] = []
    try {
      for (let i = 0; i < targetRecords.length; i++) {
        const rec = targetRecords[i]
        setSetupModalConfig((prev) => ({
          ...prev,
          progress: {
            current: i,
            total: targetRecords.length,
            currentRecordId: rec.id,
            currentStatus: `Đang xử lý ${rec.id} (${rec.fullName || ''}) [Bang: ${rec.state}]...`
          }
        }))

        try {
          const res = await ttsIpc.smartSetup({
            record: rec,
            autoBuyProxy: false
          })
          if (res && res.ok && res.record) {
            updatedList.push(res.record)
            setRecords((prev) => prev.map((r) => (r.id === res.record.id ? res.record : r)))
            setActiveRuns((prev) => prev.map((r) => (r.id === res.record.id ? res.record : r)))
          } else {
            updatedList.push(rec)
          }
        } catch {
          updatedList.push(rec)
        }
      }

      refreshHideProxyPorts()
      refreshAdsPowerProfiles()
      setSetupModalConfig((prev) => ({
        ...prev,
        records: updatedList,
        isExecuting: false,
        progress: {
          current: targetRecords.length,
          total: targetRecords.length,
          currentStatus: `Đã hoàn tất toàn bộ ${targetRecords.length} hồ sơ!`
        }
      }))
      setSetupFeedback(`⚡ Đã hoàn tất Smart Setup cho ${targetRecords.length} hồ sơ!`)
    } finally {
      setIsBatchSettingUp(false)
    }
  }

  // 3.0 Full Flow Dry-Run & Preflight Diagnostic Handlers
  const handleRunPreflight = async () => {
    setIsRunningPreflight(true)
    setShowPreflightModal(true)
    setPreflightCopyFeedback(false)
    try {
      const res = await ttsIpc.preflight()
      if (res && res.ok) {
        setPreflightData(res)
      } else {
        setPreflightData({
          ok: false,
          overallStatus: 'fail',
          summary: `Lỗi kết nối kiểm thử: ${res?.error || 'Không xác định'}`,
          checks: []
        })
      }
    } catch (err: any) {
      setPreflightData({
        ok: false,
        overallStatus: 'fail',
        summary: `Lỗi: ${String(err?.message || err)}`,
        checks: []
      })
    } finally {
      setIsRunningPreflight(false)
    }
  }

  const handleCopyPreflightReport = () => {
    if (!preflightData) return
    const lines = [
      `=== FOX-AUTO TTS BOT FULL FLOW (DRY RUN) DIAGNOSTIC REPORT ===`,
      `Thời gian: ${new Date().toLocaleString('vi-VN')}`,
      `Trạng thái: ${preflightData.overallStatus?.toUpperCase()}`,
      `Tổng quan: ${preflightData.summary}`,
      `Thời gian kiểm tra: ${preflightData.durationMs || 0}ms`,
      `------------------------------------------------------------`,
      ...(preflightData.checks || []).map((c: any, idx: number) => {
        const icon = c.status === 'pass' ? '[PASS]' : c.status === 'warn' ? '[WARN]' : '[FAIL]'
        return `${idx + 1}. ${icon} ${c.name} (${c.category}) - ${c.latencyMs || 0}ms\n   Kết quả: ${c.message}\n   Khắc phục: ${c.fixGuide}\n`
      }),
      `============================================================`
    ]
    navigator.clipboard.writeText(lines.join('\n'))
    setPreflightCopyFeedback(true)
    setTimeout(() => setPreflightCopyFeedback(false), 2000)
  }

  // 3.1 Smart Setup for 1 Record (Auto-Match State Proxy + AdsPower Profile + 99% Ready Audit)
  const handleSmartSetup = async (recordToSetup: RecordItem, _autoBuy = false) => {
    openSingleSetupModal(recordToSetup)
  }

  // 3.2 Batch Smart Setup for Selected or Pending Records
  const handleBatchSmartSetup = async () => {
    openBulkSetupModal()
  }

  // 3.3 Auto-Detect 2-Side Pool & Multi-Upload
  const [isDetectingSides, setIsDetectingSides] = useState(false)
  const [showAutoDetectMenu, setShowAutoDetectMenu] = useState(false)

  const handleAutoDetect2Sides = async (mode: 'default_pool' | 'pick_folder' | 'pick_files') => {
    setShowAutoDetectMenu(false)
    const targetRecords =
      selectedRowIds.size > 0
        ? records.filter((r) => selectedRowIds.has(r.id))
        : records

    if (targetRecords.length === 0) {
      setSetupFeedback('Không có hồ sơ nào được chọn để quét ảnh 2 mặt.')
      return
    }

    let folderPath: string | undefined
    let filePaths: string[] | undefined

    if (mode === 'pick_folder') {
      const pickRes = await ttsIpc.pickFolder()
      if (pickRes.cancelled || !pickRes.folderPath) return
      folderPath = pickRes.folderPath
    } else if (mode === 'pick_files') {
      const pickRes = await ttsIpc.pickMultipleImages()
      if (pickRes.cancelled || !pickRes.filePaths || pickRes.filePaths.length === 0) return
      filePaths = pickRes.filePaths
    }

    setIsDetectingSides(true)
    setSetupFeedback(`Đang tự động quét pool ảnh & bắt cặp 2 mặt cho ${targetRecords.length} hồ sơ...`)

    try {
      const res = await ttsIpc.autoDetect2Sides({
        records: targetRecords,
        folderPath,
        filePaths
      })

      if (res && res.ok) {
        if (res.updatedRecords && res.updatedRecords.length > 0) {
          const updatedMap = new Map<string, RecordItem>(
            res.updatedRecords.map((r: any) => [r.id, r as RecordItem])
          )
          setRecords((prev) => prev.map((r) => updatedMap.get(r.id) || r))
          setActiveRuns((prev) => prev.map((r) => updatedMap.get(r.id) || r))
        }
        await loadSavedState()
        setSetupFeedback(
          `📷 Đã tự động bắt cặp đủ 2 mặt cho ${res.matchedCount || 0}/${targetRecords.length} hồ sơ thành công!`
        )
      } else {
        setSetupFeedback(`Lỗi quét pool 2 mặt: ${res?.error || 'Không tìm thấy ảnh phù hợp'}`)
      }
    } catch (err: any) {
      setSetupFeedback(`Lỗi quét ảnh 2 mặt: ${String(err?.message || err)}`)
    } finally {
      setIsDetectingSides(false)
    }
  }

  // 3.4 Photo Pool & Lightbox Manager
  const openPhotoPoolModal = async (record: RecordItem) => {
    setPoolModalRecord(record)
    setIsLoadingPool(true)
    setPoolFeedback('')
    setPoolThumbnails({})
    try {
      const res = await ttsIpc.getVariants(record.id)
      if (res && res.ok) {
        setPoolVariants(res.variants || [])
        const activeVar = res.variants?.find((v: any) => v.isActive) || res.variants?.[0]
        if (activeVar) {
          setSelectedVariantId(activeVar.id)
          const [fRes, bRes] = await Promise.all([
            ttsIpc.readImageDataUrl(activeVar.frontPath),
            ttsIpc.readImageDataUrl(activeVar.backPath)
          ])
          setPoolThumbnails({
            front: fRes?.ok ? fRes.dataUrl : undefined,
            back: bRes?.ok ? bRes.dataUrl : undefined
          })
        }
      }
    } catch (err: any) {
      setPoolFeedback(String(err?.message || err))
    } finally {
      setIsLoadingPool(false)
    }
  }

  const handleSelectPoolVariant = async (variant: any) => {
    if (!poolModalRecord) return
    setSelectedVariantId(variant.id)
    setIsLoadingPool(true)
    try {
      const [fRes, bRes] = await Promise.all([
        ttsIpc.readImageDataUrl(variant.frontPath),
        ttsIpc.readImageDataUrl(variant.backPath)
      ])
      setPoolThumbnails({
        front: fRes?.ok ? fRes.dataUrl : undefined,
        back: bRes?.ok ? bRes.dataUrl : undefined
      })
      await ttsIpc.assignVariant({
        profileId: poolModalRecord.id,
        frontPath: variant.frontPath,
        backPath: variant.backPath,
        name: variant.name
      })
      await loadSavedState()
      setPoolFeedback(`Đã kích hoạt: ${variant.name}`)
    } catch (err: any) {
      setPoolFeedback(String(err?.message || err))
    } finally {
      setIsLoadingPool(false)
    }
  }

  const handlePickNewPoolPhoto = async (side: 'front' | 'back') => {
    if (!poolModalRecord) return
    const pickRes = await ttsIpc.pickImage()
    if (pickRes.cancelled || !pickRes.filePath) return

    const currentVar = poolVariants.find((v) => v.id === selectedVariantId) || {}
    const frontPath = side === 'front' ? pickRes.filePath : currentVar.frontPath || assignments[poolModalRecord.id]?.frontProcessed
    const backPath = side === 'back' ? pickRes.filePath : currentVar.backPath || assignments[poolModalRecord.id]?.backProcessed

    await ttsIpc.assignVariant({
      profileId: poolModalRecord.id,
      frontPath: frontPath || pickRes.filePath,
      backPath: backPath || pickRes.filePath,
      name: `Custom Upload (${new Date().toLocaleDateString()})`
    })
    await openPhotoPoolModal(poolModalRecord)
    await loadSavedState()
  }

  // 4. Fetch Google Sheet Records
  const fetchSheetRecords = useCallback(async (tabToFetch?: string) => {
    const activeTabName = tabToFetch || (isCustomTab ? customTabInput : selectedSheetTab)
    if (!activeTabName) return

    // If active execution workspace tab, load from local activeRuns
    if (activeTabName === 'TTS Chạy Thật') {
      setIsLoadingSheet(false)
      setRecords(activeRuns)
      if (activeRuns.length > 0 && !selectedRecordId) {
        setSelectedRecordId(activeRuns[0].id)
      }
      handleAutoCheckAllMails(activeRuns)
      return
    }

    setIsLoadingSheet(true)
    setSheetError('')
    try {
      const res = await ttsIpc.fetchSheet({
        sheetId,
        tabName: activeTabName
      })

      if (res && res.ok && res.records) {
        setRecords(res.records)
        if (res.records.length > 0 && !selectedRecordId) {
          setSelectedRecordId(res.records[0].id)
        }
        handleAutoCheckAllMails(res.records)
      } else {
        setSheetError(res?.error || 'Không tải được dữ liệu Sheet')
      }
    } catch (err: any) {
      setSheetError(String(err?.message || err))
    } finally {
      setIsLoadingSheet(false)
    }
  }, [sheetId, selectedSheetTab, isCustomTab, customTabInput, selectedRecordId, activeRuns, handleAutoCheckAllMails])


  // 5. Fetch Inbox Files for Studio
  const refreshInboxFiles = useCallback(async () => {
    try {
      const res = await ttsIpc.inboxList()
      if (res && res.ok && res.files) {
        setInboxFiles(res.files)
      }
    } catch (err) {
      console.error('Failed to list inbox files:', err)
    }
  }, [])

  // 6. Fetch HideProxy Ports
  const refreshHideProxyPorts = useCallback(async () => {
    setIsLoadingPorts(true)
    try {
      const res = await ttsIpc.hideproxyPortInfo()
      if (res && res.ok && res.data) {
        setHpPorts(res.data)
      } else {
        const fallbackRes = await ttsIpc.hideproxyPorts()
        if (fallbackRes && fallbackRes.ok && fallbackRes.data) {
          setHpPorts(fallbackRes.data)
        }
      }
    } catch (err) {
      console.error('Failed to load hideproxy ports:', err)
    } finally {
      setIsLoadingPorts(false)
    }
  }, [])

  // 7. Fetch AdsPower Profiles
  const refreshAdsPowerProfiles = useCallback(async () => {
    setIsLoadingAdsProfiles(true)
    try {
      const res = await ttsIpc.adspowerList('10716270')
      if (res && res.ok && res.data) {
        setAdspowerProfiles(res.data)
      }
    } catch (err) {
      console.error('Failed to load adspower profiles:', err)
    } finally {
      setIsLoadingAdsProfiles(false)
    }
  }, [])

  // Initial Boot
  useEffect(() => {
    refreshStatus()
    loadSavedState()
    refreshInboxFiles()
    refreshHideProxyPorts()
    refreshAdsPowerProfiles()
  }, [])

  // Update records when activeRuns change and current tab is TTS Chạy Thật
  useEffect(() => {
    if (selectedSheetTab === 'TTS Chạy Thật') {
      setRecords(activeRuns)
    }
  }, [activeRuns, selectedSheetTab])

  // Is current tab protected?
  const isCurrentTabProtected = useMemo(() => {
    return PROTECTED_TABS.has(selectedSheetTab.trim().toLowerCase())
  }, [selectedSheetTab])

  // Pipeline Stage Counts
  const pipelineCounts = useMemo(() => {
    let notRegistered = 0
    let otpOrPending = 0
    let underReview = 0
    let rejected = 0
    let approved = 0

    records.forEach((r) => {
      const mailSt = mailStatuses[r.id]?.status
      const sheetSt = (r.status || '').toLowerCase()

      if (mailSt === 'approved' || sheetSt.includes('approved') || sheetSt.includes('verified') || sheetSt.includes('active')) {
        approved++
      } else if (mailSt === 'rejected_need_resubmit' || sheetSt.includes('information') || sheetSt.includes('lỗi') || sheetSt.includes('reject')) {
        rejected++
      } else if (mailSt === 'under_review' || sheetSt.includes('under review')) {
        underReview++
      } else if (mailSt === 'has_otp' || mailSt === 'incomplete_onboarding') {
        otpOrPending++
      } else {
        notRegistered++
      }
    })

    return { notRegistered, otpOrPending, underReview, rejected, approved }
  }, [records, mailStatuses])

  // Filtered Records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // If hiding consumed records in kho tab
      if (hideConsumed && consumedRecords[r.id]) {
        return false
      }

      // Search match
      const q = searchTerm.toLowerCase()
      const matchSearch =
        !q ||
        r.id.toLowerCase().includes(q) ||
        r.fullName.toLowerCase().includes(q) ||
        r.state.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q) ||
        r.ein.toLowerCase().includes(q) ||
        r.ssn.toLowerCase().includes(q) ||
        (r.phone && r.phone.toLowerCase().includes(q)) ||
        (r.email && r.email.toLowerCase().includes(q)) ||
        (r.pdfDoc && r.pdfDoc.toLowerCase().includes(q)) ||
        (r.bankStatement && r.bankStatement.toLowerCase().includes(q))

      if (!matchSearch) return false

      // State match
      if (filterState !== 'all' && r.state !== filterState) {
        return false
      }

      // Pipeline Filter match
      if (pipelineFilter !== 'all') {
        const mailSt = mailStatuses[r.id]?.status
        const sheetSt = (r.status || '').toLowerCase()
        if (pipelineFilter === 'not_registered') {
          return mailSt === 'not_registered' || (!sheetSt && !mailSt)
        }
        if (pipelineFilter === 'otp_or_pending') {
          return mailSt === 'has_otp' || mailSt === 'incomplete_onboarding'
        }
        if (pipelineFilter === 'under_review') {
          return mailSt === 'under_review' || sheetSt.includes('under review')
        }
        if (pipelineFilter === 'rejected') {
          return mailSt === 'rejected_need_resubmit' || sheetSt.includes('information') || sheetSt.includes('lỗi') || sheetSt.includes('reject')
        }
        if (pipelineFilter === 'approved') {
          return mailSt === 'approved' || sheetSt.includes('approved') || sheetSt.includes('active') || sheetSt.includes('verified')
        }
      }

      return true
    })
  }, [records, searchTerm, filterState, pipelineFilter, mailStatuses, hideConsumed, consumedRecords])


  // Current Selected Record
  const currentRecord = useMemo(() => {
    return records.find((r) => r.id === selectedRecordId) || records[0]
  }, [records, selectedRecordId])

  // Current Assignment
  const currentAssignment = useMemo(() => {
    if (!currentRecord) return {}
    return assignments[currentRecord.id] || {}
  }, [assignments, currentRecord])

  // Bê Record sang TTS Chạy Thật & Tô Đen Cell Đánh Dấu
  const handlePromoteSelectedRecords = () => {
    if (selectedRowIds.size === 0) return

    const recordsToPromote = records.filter(r => selectedRowIds.has(r.id))
    const newConsumed = { ...consumedRecords }
    const updatedActive = [...activeRuns]

    for (const rec of recordsToPromote) {
      newConsumed[rec.id] = {
        consumedAt: Date.now(),
        fromTab: selectedSheetTab
      }
      // Check if already in activeRuns
      if (!updatedActive.some(a => a.id === rec.id)) {
        updatedActive.push({
          ...rec,
          sourceTab: selectedSheetTab,
          status: 'Sẵn sàng chạy'
        })
      }
    }

    setConsumedRecords(newConsumed)
    setActiveRuns(updatedActive)
    setSelectedRowIds(new Set())
    persistState(assignments, updatedActive, newConsumed)
    setStudioFeedback(`Đã bê thành công ${recordsToPromote.length} hồ sơ sang TTS Chạy Thật và tô đen đánh dấu ô gốc!`)
  }

  // Thêm Hồ Sơ Mới Trực Tiếp Trên App
  const handleCreateNewRecord = () => {
    if (!addForm.id.trim() || !addForm.fullName.trim()) return

    const newRec: RecordItem = {
      rowNumber: activeRuns.length + 1,
      id: addForm.id.trim(),
      status: 'Mới tạo trên App',
      regDate: new Date().toLocaleDateString('vi-VN'),
      email: addForm.email.trim(),
      mailPass: addForm.mailPass.trim(),
      twoFactor: addForm.twoFactor.trim(),
      proxy: '',
      fullName: addForm.fullName.trim(),
      dob: addForm.dob.trim(),
      address: addForm.address.trim(),
      city: addForm.city.trim(),
      state: addForm.state.trim().toUpperCase(),
      zipCode: addForm.zipCode.trim(),
      dl: '',
      ssn: addForm.ssn.trim(),
      ein: addForm.ein.trim(),
      phone: addForm.phone.trim(),
      businessType: 'Sole Proprietorship',
      businessName: `${addForm.fullName.trim()} LLC`,
      sourceTab: 'App Creator'
    }

    const updatedActive = [newRec, ...activeRuns]
    setActiveRuns(updatedActive)
    setSelectedRecordId(newRec.id)
    persistState(assignments, updatedActive, consumedRecords)

    setShowAddModal(false)
    setAddForm({
      id: '',
      fullName: '',
      state: 'AR',
      city: '',
      address: '',
      zipCode: '',
      dob: '',
      ssn: '',
      ein: '',
      phone: '',
      email: '',
      mailPass: '',
      twoFactor: ''
    })
    setStudioFeedback(`Đã tạo hồ sơ ${newRec.id} (${newRec.fullName}) thành công!`)
  }

  // Copy Dòng cho Sheet (TSV Format - Ctrl+V trực tiếp vào Google Sheets)
  const handleCopyTsvForSheet = () => {
    const listToExport = selectedSheetTab === 'TTS Chạy Thật' ? activeRuns : filteredRecords
    if (listToExport.length === 0) return

    const header = [
      'Profile Name', 'Status', 'Ngày Reg', 'Ngày cấp', 'Seller', 'Mail',
      'Pass Titkok Shop', '2FA', 'Proxy', 'Tên', 'DOB', 'Address', 'City',
      'State', 'Zip', 'DL', 'SSN', 'EIN', 'Phone'
    ].join('\t')

    const rows = listToExport.map(r => [
      r.id, r.status, r.regDate, '', '', r.email,
      r.mailPass, r.twoFactor, r.proxy, r.fullName, r.dob, r.address, r.city,
      r.state, r.zipCode, r.dl, r.ssn, r.ein, r.phone
    ].join('\t'))

    const tsvContent = [header, ...rows].join('\n')
    navigator.clipboard.writeText(tsvContent)
    setStudioFeedback(`Đã copy ${listToExport.length} dòng dữ liệu theo chuẩn Sheet! Bạn có thể dán (Ctrl+V) ngay vào Google Sheets.`)
  }

  // Photo Assignment Handlers
  const handleAssignPhoto = (side: 'front' | 'back', filePath: string) => {
    if (!currentRecord) return
    const updated: Record<string, PhotoAssignment> = {
      ...assignments,
      [currentRecord.id]: {
        ...currentAssignment,
        [side === 'front' ? 'frontOriginal' : 'backOriginal']: filePath,
        updatedAt: Date.now()
      }
    }
    setAssignments(updated)
    persistState(updated)
    setStudioFeedback(`Đã gán ảnh ${side === 'front' ? 'Mặt trước' : 'Mặt sau'} cho ${currentRecord.id}`)
  }

  const handlePickLocalImage = async (side: 'front' | 'back') => {
    if (!currentRecord) return
    try {
      const res = await ttsIpc.pickImage()
      if (res && res.ok && res.filePath) {
        handleAssignPhoto(side, res.filePath)
      }
    } catch (err) {
      console.error('Pick image error:', err)
    }
  }

  const handleProcessImage = async (side: 'front' | 'back') => {
    if (!currentRecord) return
    const inputPath = side === 'front' ? currentAssignment.frontOriginal : currentAssignment.backOriginal
    if (!inputPath) {
      setStudioFeedback(`Vui lòng chọn ảnh ${side === 'front' ? 'Mặt trước' : 'Mặt sau'} trước khi xử lý`)
      return
    }

    if (side === 'front') setIsProcessingFront(true)
    else setIsProcessingBack(true)
    setStudioFeedback('')

    try {
      const res = await ttsIpc.processImage({
        inputPath,
        preset: selectedPreset,
        crop: true,
        profileId: currentRecord.id,
        side
      })

      if (res && res.ok && res.output) {
        const updated: Record<string, PhotoAssignment> = {
          ...assignments,
          [currentRecord.id]: {
            ...currentAssignment,
            [side === 'front' ? 'frontProcessed' : 'backProcessed']: res.output,
            preset: selectedPreset,
            updatedAt: Date.now()
          }
        }
        setAssignments(updated)
        persistState(updated)
        setStudioFeedback(
          `Đã cắt chuẩn CR80 (1.586:1) và tiêm EXIF ${selectedPreset} cho ${currentRecord.id} (${side}) thành công!`
        )
      } else {
        setStudioFeedback(`Lỗi xử lý: ${res?.error || 'Không xác định'}`)
      }
    } catch (err: any) {
      setStudioFeedback(`Lỗi: ${String(err?.message || err)}`)
    } finally {
      if (side === 'front') setIsProcessingFront(false)
      else setIsProcessingBack(false)
    }
  }

  const handleProcessBothSides = async () => {
    if (!currentRecord) return
    if (currentAssignment.frontOriginal) await handleProcessImage('front')
    if (currentAssignment.backOriginal) await handleProcessImage('back')
  }

  // HideProxy Safe Purchase
  const handleConfirmBuyProxy = async () => {
    if (!targetProxyState) return
    setIsBuyingProxy(true)
    setProxyBuyFeedback('')
    try {
      const res = await ttsIpc.hideproxyBuy({
        country: 'us',
        state: targetProxyState.toLowerCase()
      })
      if (res && res.ok) {
        setProxyBuyFeedback(`Mua thành công 1 proxy cho bang ${targetProxyState}!`)
        refreshHideProxyPorts()
        setTimeout(() => setBuyProxyModalOpen(false), 1500)
      } else {
        setProxyBuyFeedback(`Lỗi mua proxy: ${res?.error || 'Thất bại'}`)
      }
    } catch (err: any) {
      setProxyBuyFeedback(`Lỗi: ${String(err?.message || err)}`)
    } finally {
      setIsBuyingProxy(false)
    }
  }

  // AdsPower Profile Creation
  const handleCreateAdsProfile = async (rec: RecordItem) => {
    setIsCreatingAdsProfile(true)
    setAdspowerFeedback('')
    try {
      const res = await ttsIpc.adspowerCreate({
        name: rec.id,
        groupId: '10716270'
      })
      if (res && res.ok) {
        setAdspowerFeedback(`Tạo AdsPower profile ${rec.id} (iOS 390x844) thành công!`)
        refreshAdsPowerProfiles()
      } else {
        setAdspowerFeedback(`Lỗi: ${res?.error || 'Không thể tạo profile'}`)
      }
    } catch (err: any) {
      setAdspowerFeedback(`Lỗi: ${String(err?.message || err)}`)
    } finally {
      setIsCreatingAdsProfile(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden select-none relative">
      {/* 1. UNIFIED COMMAND HEADER (Single H-14 Bar - Clean & Minimalist) */}
      <header className="flex items-center justify-between px-5 h-14 bg-slate-900/95 border-b border-slate-800/80 backdrop-blur z-20 shrink-0 gap-4">
        {/* Left: App Brand & Sheet Tabs Segmented Selector */}
        <div className="flex items-center space-x-3 shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold tracking-tight text-white flex items-center space-x-1">
                <span>BUG AUTO</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </span>
              <span className="text-[10px] text-slate-400 font-medium">TTS Bot Studio</span>
            </div>
          </div>

          <div className="h-5 w-[1px] bg-slate-800" />

          {/* Sheet Tab Switcher */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800/80 text-xs">
            {/* Active Execution Workspace Tab */}
            <button
              onClick={() => {
                setIsCustomTab(false)
                setSelectedSheetTab('TTS Chạy Thật')
                fetchSheetRecords('TTS Chạy Thật')
              }}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                !isCustomTab && selectedSheetTab === 'TTS Chạy Thật'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-emerald-400 hover:text-emerald-200'
              }`}
            >
              <span>Chạy Thật ({activeRuns.length})</span>
            </button>

            {/* Protected Tabs */}
            <button
              onClick={() => {
                setIsCustomTab(false)
                setSelectedSheetTab('Automation')
                fetchSheetRecords('Automation')
              }}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                !isCustomTab && selectedSheetTab === 'Automation'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Tab Automation (Read-Only)"
            >
              <Lock className="w-3 h-3 text-amber-400" />
              <span>Automation</span>
            </button>

            <button
              onClick={() => {
                setIsCustomTab(false)
                setSelectedSheetTab('Phần 2')
                fetchSheetRecords('Phần 2')
              }}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                !isCustomTab && selectedSheetTab === 'Phần 2'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Kho Phôi Phần 2 (Read-Only)"
            >
              <Lock className="w-3 h-3 text-amber-400" />
              <span>Phần 2</span>
            </button>

            <button
              onClick={() => {
                setIsCustomTab(false)
                setSelectedSheetTab('Phần 1')
                fetchSheetRecords('Phần 1')
              }}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                !isCustomTab && selectedSheetTab === 'Phần 1'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Phần 1 (Read-Only)"
            >
              <Lock className="w-3 h-3 text-amber-400" />
              <span>Phần 1</span>
            </button>

            <button
              onClick={() => setIsCustomTab(true)}
              className={`px-2 py-1 rounded-md text-xs transition-all ${
                isCustomTab ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tùy biến...
            </button>
          </div>

          {isCustomTab && (
            <div className="flex items-center space-x-1">
              <input
                type="text"
                value={customTabInput}
                onChange={(e) => setCustomTabInput(e.target.value)}
                placeholder="Tên Tab..."
                className="w-24 px-2 py-0.5 text-xs bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={() => {
                  setSelectedSheetTab(customTabInput)
                  fetchSheetRecords(customTabInput)
                }}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded text-xs"
              >
                Tải
              </button>
            </div>
          )}
        </div>

        {/* Center: Main App View Switcher (Segmented Control) */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800/80 text-xs shadow-inner">
          <button
            onClick={() => setActiveTab('records')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg font-medium transition-all ${
              activeTab === 'records'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Hồ Sơ ({records.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('studio')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg font-medium transition-all ${
              activeTab === 'studio'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Studio 2 Mặt</span>
            {currentRecord && (
              <span className="text-[10px] px-1 bg-black/40 rounded border border-white/10 text-emerald-300">
                {currentRecord.id}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('hideproxy')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg font-medium transition-all ${
              activeTab === 'hideproxy'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>HideProxy ({hpPorts.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('adspower')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg font-medium transition-all ${
              activeTab === 'adspower'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>AdsPower ({adspowerProfiles.length})</span>
          </button>
        </div>

        {/* Right: Service Status Indicators & Actions */}
        <div className="flex items-center space-x-2.5 shrink-0 text-xs">
          {/* Micro Status Badges */}
          <div
            className={`flex items-center space-x-1.5 px-2 py-1 rounded-md border text-[11px] font-mono ${
              status.hideproxy.online
                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400'
                : 'bg-rose-950/40 border-rose-500/30 text-rose-400'
            }`}
            title="HideProxy Client (Port 10101)"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${status.hideproxy.online ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
            <span>Proxy</span>
          </div>

          <div
            className={`flex items-center space-x-1.5 px-2 py-1 rounded-md border text-[11px] font-mono ${
              status.adspower.online
                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400'
                : 'bg-rose-950/40 border-rose-500/30 text-rose-400'
            }`}
            title="AdsPower API (Port 50325)"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${status.adspower.online ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
            <span>Ads</span>
          </div>

          {/* Add Profile Button */}
          <button
            onClick={() => {
              setAddForm((prev) => ({ ...prev, id: `TTS-${String(activeRuns.length + 1).padStart(2, '0')}` }))
              setShowAddModal(true)
            }}
            className="flex items-center space-x-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg shadow-sm transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Hồ sơ</span>
          </button>

          {/* Sync Button */}
          <button
            onClick={() => {
              refreshStatus()
              fetchSheetRecords()
              refreshInboxFiles()
              refreshHideProxyPorts()
              refreshAdsPowerProfiles()
            }}
            disabled={isCheckingStatus || isLoadingSheet}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-all disabled:opacity-50"
            title="Đồng bộ lại toàn bộ dữ liệu và dịch vụ"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingStatus || isLoadingSheet ? 'animate-spin' : ''}`} />
          </button>

          {/* Full Flow Dry-Run / Preflight Diagnostic Button */}
          <button
            onClick={handleRunPreflight}
            disabled={isRunningPreflight}
            className="flex items-center space-x-1.5 px-2.5 py-1 bg-gradient-to-r from-cyan-950/80 to-blue-950/80 hover:from-cyan-900 hover:to-blue-900 text-cyan-300 border border-cyan-500/50 hover:border-cyan-400 font-semibold rounded-lg shadow-sm transition-all text-xs"
            title="Kiểm thử Full Flow & Chuẩn đoán kết nối trên máy mới"
          >
            <Stethoscope className={`w-3.5 h-3.5 text-cyan-400 ${isRunningPreflight ? 'animate-spin' : ''}`} />
            <span>Kiểm Thử Full Flow</span>
          </button>
        </div>
      </header>

      {/* Floating Feedback Notification (Toast) */}
      {setupFeedback && (
        <div className="fixed top-16 right-6 z-50 px-3.5 py-2 bg-slate-900/95 border border-cyan-500/40 rounded-xl text-xs text-cyan-300 shadow-2xl flex items-center space-x-2 animate-in slide-in-from-top-2">
          <Zap className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span>{setupFeedback}</span>
          <button onClick={() => setSetupFeedback('')} className="text-slate-400 hover:text-white ml-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Sheet Error Alert if any */}
      {sheetError && (
        <div className="flex items-center justify-between px-6 py-2 bg-rose-950/60 border-b border-rose-800 text-rose-300 text-xs">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{sheetError}</span>
          </div>
          <button onClick={() => setSheetError('')} className="text-rose-400 hover:text-rose-200">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. MAIN CONTENT AREA */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* ========================================================================= */}
        {/* TAB 1: RECORDS & RUNS TABLE */}
        {/* ========================================================================= */}
        {activeTab === 'records' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Clean, Streamlined Toolbar */}
            <div className="flex items-center justify-between px-5 py-2 bg-slate-900/50 border-b border-slate-800/80 gap-3 shrink-0">
              <div className="flex items-center space-x-3 flex-1">
                {/* Search Input */}
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Tìm theo Mã, Tên, EIN, SSN, SĐT..."
                    className="w-full pl-8 pr-3 py-1 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/70"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-200"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* 50 States Filter */}
                <div className="flex items-center space-x-1.5 text-xs text-slate-400">
                  <select
                    value={filterState}
                    onChange={(e) => setFilterState(e.target.value)}
                    className="px-2 py-1 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="all">Tất cả bang (50)</option>
                    {US_STATES.map((st) => (
                      <option key={st.code} value={st.code}>
                        {st.code} - {st.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Hide Consumed Toggle */}
                {isCurrentTabProtected && (
                  <label className="flex items-center space-x-1.5 text-xs text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hideConsumed}
                      onChange={(e) => setHideConsumed(e.target.checked)}
                      className="rounded bg-slate-950 border-slate-800 text-emerald-500 focus:ring-0"
                    />
                    <span>Ẩn phôi đã bốc</span>
                  </label>
                )}
              </div>

              {/* Pipeline Stage Tabs & Quick Action Tools */}
              <div className="flex items-center space-x-2 shrink-0">
                {/* 5-Stage Pipeline Filters */}
                <div className="flex items-center space-x-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                  <button
                    onClick={() => setPipelineFilter('all')}
                    className={`px-2 py-1 text-xs rounded transition-all ${
                      pipelineFilter === 'all'
                        ? 'bg-slate-800 text-white font-medium'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Tất cả ({records.length})
                  </button>
                  <button
                    onClick={() => setPipelineFilter('not_registered')}
                    className={`flex items-center space-x-1 px-2 py-1 text-xs rounded transition-all ${
                      pipelineFilter === 'not_registered'
                        ? 'bg-slate-800 text-slate-200 font-semibold border border-slate-700'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Chưa đăng ký trên TikTok hoặc mail chưa có thư TikTok"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                    <span>Chưa Reg ({pipelineCounts.notRegistered})</span>
                  </button>
                  <button
                    onClick={() => setPipelineFilter('otp_or_pending')}
                    className={`flex items-center space-x-1 px-2 py-1 text-xs rounded transition-all ${
                      pipelineFilter === 'otp_or_pending'
                        ? 'bg-amber-950 text-amber-300 font-semibold border border-amber-800/60'
                        : 'text-slate-400 hover:text-amber-200'
                    }`}
                    title="Đã nhận mã OTP hoặc đang nộp dở bước Onboarding"
                  >
                    <Zap className="w-3 h-3 text-amber-400" />
                    <span>Chờ OTP/Nộp ({pipelineCounts.otpOrPending})</span>
                  </button>
                  <button
                    onClick={() => setPipelineFilter('under_review')}
                    className={`flex items-center space-x-1 px-2 py-1 text-xs rounded transition-all ${
                      pipelineFilter === 'under_review'
                        ? 'bg-purple-950 text-purple-300 font-semibold border border-purple-800/60'
                        : 'text-slate-400 hover:text-purple-200'
                    }`}
                    title="Đang trong quá trình TikTok duyệt (Under Review - Canh 6 phút)"
                  >
                    <Clock className="w-3 h-3 text-purple-400" />
                    <span>Reviewing ({pipelineCounts.underReview})</span>
                  </button>
                  <button
                    onClick={() => setPipelineFilter('rejected')}
                    className={`flex items-center space-x-1 px-2 py-1 text-xs rounded transition-all ${
                      pipelineFilter === 'rejected'
                        ? 'bg-rose-950 text-rose-300 font-semibold border border-rose-800/60'
                        : 'text-slate-400 hover:text-rose-200'
                    }`}
                    title="Bị cờ đỏ ID hoặc yêu cầu nộp lại ảnh (Modifications detected)"
                  >
                    <AlertTriangle className="w-3 h-3 text-rose-400" />
                    <span>Lỗi ID ({pipelineCounts.rejected})</span>
                  </button>
                  <button
                    onClick={() => setPipelineFilter('approved')}
                    className={`flex items-center space-x-1 px-2 py-1 text-xs rounded transition-all ${
                      pipelineFilter === 'approved'
                        ? 'bg-emerald-950 text-emerald-300 font-semibold border border-emerald-800/60'
                        : 'text-slate-400 hover:text-emerald-200'
                    }`}
                    title="Đã được TikTok Shop xét duyệt thành công"
                  >
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>Approved ({pipelineCounts.approved})</span>
                  </button>
                </div>

                {/* Auto Check All Mails Button */}
                <button
                  onClick={() => handleAutoCheckAllMails()}
                  disabled={isCheckingAllMails}
                  className="flex items-center space-x-1.5 px-2.5 py-1 text-xs bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/60 rounded-lg transition-all font-semibold shadow-sm disabled:opacity-50"
                  title="Quét trạng thái hòm thư & bắt mã OTP tự động cho tất cả hồ sơ"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${isCheckingAllMails ? 'animate-spin' : ''}`} />
                  <span>{isCheckingAllMails ? 'Đang quét mail...' : 'Quét Hòm Thư'}</span>
                </button>

                {/* Photo Pool Manager Button */}
                <button
                  onClick={() => handleAutoDetect2Sides('pick_folder')}
                  className="flex items-center space-x-1 px-2.5 py-1 text-xs bg-slate-900 hover:bg-slate-800 text-emerald-300 border border-emerald-800/60 rounded-lg transition-all font-medium shadow-sm"
                  title="Chọn thư mục chứa kho ảnh thẻ mockup và tự động bắt cặp"
                >
                  <Camera className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Kho Ảnh</span>
                </button>

                {/* Copy Sheet Button */}
                <button
                  onClick={handleCopyTsvForSheet}
                  className="flex items-center space-x-1 px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-all"
                  title="Copy bảng dữ liệu để dán vào Google Sheets"
                >
                  <Copy className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copy</span>
                </button>

                {/* Bulk Setup Modal Button */}
                <button
                  onClick={openBulkSetupModal}
                  className="flex items-center space-x-1 px-2.5 py-1 text-xs bg-gradient-to-r from-amber-500/20 to-cyan-500/20 hover:from-amber-500/30 hover:to-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded-lg transition-all font-semibold shadow-sm"
                  title="Mở Modal Thiết Lập Môi Trường Hàng Loạt (Proxy & AdsPower)"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>Setup Hàng Loạt</span>
                </button>
              </div>
            </div>

            {/* Records Table View */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-900/95 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px] font-semibold backdrop-blur z-10">
                  <tr>
                    {isCurrentTabProtected && (
                      <th className="py-2.5 px-3 w-10 text-center">
                        <button
                          onClick={() => {
                            if (selectedRowIds.size > 0) setSelectedRowIds(new Set())
                            else setSelectedRowIds(new Set(filteredRecords.filter((r) => !consumedRecords[r.id]).map((r) => r.id)))
                          }}
                          className="text-slate-400 hover:text-white"
                          title="Chọn tất cả"
                        >
                          {selectedRowIds.size > 0 ? <CheckSquare className="w-4 h-4 text-emerald-400" /> : <SquareIcon className="w-4 h-4" />}
                        </button>
                      </th>
                    )}
                    <th className="py-2.5 px-3 min-w-[200px]">HỒ SƠ & THIẾT BỊ</th>
                    <th className="py-2.5 px-3 min-w-[240px]">HÒM THƯ (AUTO-CHECK)</th>
                    <th className="py-2.5 px-3 min-w-[180px]">TIẾN ĐỘ & CANH 6M</th>
                    <th className="py-2.5 px-3 min-w-[200px]">KHO ẢNH & FILE ĐÃ NỘP</th>
                    <th className="py-2.5 px-3 text-right min-w-[170px]">HÀNH ĐỘNG COPILOT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={isCurrentTabProtected ? 6 : 5} className="py-12 text-center text-slate-500">
                        {isLoadingSheet ? (
                          <div className="flex flex-col items-center justify-center space-y-2">
                            <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
                            <span>Đang tải dữ liệu Google Sheet...</span>
                          </div>
                        ) : selectedSheetTab === 'TTS Chạy Thật' ? (
                          <div className="flex flex-col items-center justify-center space-y-2">
                            <ShoppingBag className="w-8 h-8 text-slate-600 mb-1" />
                            <p className="text-slate-400 font-medium">Chưa có hồ sơ nào trong Tab TTS Chạy Thật</p>
                            <p className="text-[11px] text-slate-500">
                              Hãy chuyển sang tab kho (ví dụ <strong>Phần 2</strong>) để bốc hồ sơ sang, hoặc bấm <strong>&quot;+ Thêm Hồ sơ Mới&quot;</strong>.
                            </p>
                          </div>
                        ) : (
                          'Không tìm thấy hồ sơ nào khớp với bộ lọc'
                        )}
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((r) => {
                      const isSelected = selectedRecordId === r.id
                      const isConsumed = !!consumedRecords[r.id]
                      const isSettingUpThis = isSettingUpId === r.id
                      const adsProfile = adspowerProfiles.find((p) => p.name === r.id || p.user_id === r.adspowerId)
                      const hasAds = !!(r.adspowerId || adsProfile)
                      const mailData = mailStatuses[r.id]
                      const mailStatus = mailData?.status
                      const otpCode = mailData?.otpCode
                      const isCheckingThisMail = checkingMailId === r.id
                      const watchdog = activeWatchdogs[r.id]
                      const harvested = harvestedUploads[r.id] || []
                      const is195x = r.is195x

                      return (
                        <tr
                          key={r.id}
                          onClick={() => setSelectedRecordId(r.id)}
                          className={`transition-colors cursor-pointer ${
                            isConsumed
                              ? 'bg-black/90 text-slate-500 border-l-2 border-slate-700'
                              : isSelected
                              ? 'bg-emerald-950/20 border-l-2 border-emerald-500'
                              : 'hover:bg-slate-900/70'
                          }`}
                        >
                          {/* Checkbox for Selection */}
                          {isCurrentTabProtected && (
                            <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                disabled={isConsumed}
                                checked={selectedRowIds.has(r.id)}
                                onChange={(e) => {
                                  const s = new Set(selectedRowIds)
                                  if (e.target.checked) s.add(r.id)
                                  else s.delete(r.id)
                                  setSelectedRowIds(s)
                                }}
                                className="rounded bg-slate-950 border-slate-800 text-emerald-500 focus:ring-0 disabled:opacity-30"
                              />
                            </td>
                          )}

                          {/* Cột 1: HỒ SƠ & THIẾT BỊ */}
                          <td className="py-3 px-3">
                            <div className="flex items-center space-x-2">
                              <span className={`font-mono font-bold text-xs ${isConsumed ? 'text-slate-500 line-through' : 'text-emerald-400'}`}>
                                {r.id}
                              </span>
                              <span className={`font-semibold text-xs ${isConsumed ? 'text-slate-500' : 'text-slate-100'}`}>
                                {r.fullName || '(Chưa có tên)'}
                              </span>
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-800/50">
                                {r.state || 'N/A'}
                              </span>
                              {is195x && (
                                <span
                                  className="px-1.5 py-0.2 bg-red-950/80 text-red-400 border border-red-800/80 rounded text-[9px] font-bold flex items-center space-x-0.5"
                                  title={r.ageWarning || 'Năm sinh 195x: Khuyến nghị bỏ qua'}
                                >
                                  <AlertTriangle className="w-2.5 h-2.5 text-red-400" />
                                  <span>195x SKIP</span>
                                </span>
                              )}
                            </div>
                            <div className="flex items-center space-x-2 mt-1.5 text-[11px] font-mono">
                              {r.assignedPort ? (
                                <span className="text-emerald-400 flex items-center space-x-1" title="HideProxy SOCKS5 Port">
                                  <Globe className="w-3 h-3 text-emerald-400 shrink-0" />
                                  <span>:{r.assignedPort} ({r.proxyMeta?.state || r.state})</span>
                                </span>
                              ) : (
                                <span className="text-slate-600 flex items-center space-x-1">
                                  <Globe className="w-3 h-3 text-slate-600 shrink-0" />
                                  <span>Chưa gán port</span>
                                </span>
                              )}
                              <span className="text-slate-700">•</span>
                              {hasAds ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleLaunchAdsPower(r)
                                  }}
                                  disabled={launchingProfileId === r.id}
                                  className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/60 text-[10px] font-semibold transition-all"
                                  title="Mở trình duyệt AdsPower iOS"
                                >
                                  <Play className="w-2.5 h-2.5 fill-cyan-400 text-cyan-400" />
                                  <span>{launchingProfileId === r.id ? 'Đang mở...' : 'Mở Ads (iOS)'}</span>
                                </button>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleSmartSetup(r)
                                  }}
                                  disabled={isSettingUpThis}
                                  className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-amber-950 hover:bg-amber-900 text-amber-300 border border-amber-700/60 text-[10px] font-semibold transition-all"
                                  title="Tự động tạo Profile AdsPower iOS 390x844"
                                >
                                  <Plus className="w-2.5 h-2.5" />
                                  <span>{isSettingUpThis ? 'Đang tạo...' : '+ Tạo Ads'}</span>
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Cột 2: HÒM THƯ (AUTO-CHECK) */}
                          <td className="py-3 px-3">
                            <div className="flex items-center space-x-1.5">
                              <span className="font-mono text-slate-300 text-[11px] truncate max-w-[170px]" title={r.email}>
                                {r.email || '(Chưa có email)'}
                              </span>
                              {r.email && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    navigator.clipboard.writeText(r.email)
                                    setSetupFeedback(`Đã copy email: ${r.email}`)
                                  }}
                                  className="text-slate-500 hover:text-white p-0.5 rounded transition-colors"
                                  title="Copy Email"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleCheckSingleMail(r)
                                }}
                                disabled={isCheckingThisMail}
                                className="text-slate-400 hover:text-indigo-300 p-0.5 rounded transition-colors"
                                title="Check trạng thái hòm thư & OTP ngay"
                              >
                                <RefreshCw className={`w-3 h-3 ${isCheckingThisMail ? 'animate-spin text-indigo-400' : ''}`} />
                              </button>
                            </div>

                            {/* Live TikTok Mail Status Badges & OTP */}
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              {otpCode ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    navigator.clipboard.writeText(otpCode)
                                    setSetupFeedback(`Đã copy mã OTP: ${otpCode}`)
                                  }}
                                  className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/60 text-[11px] font-mono font-bold transition-all shadow-sm"
                                  title="Bấm để copy mã OTP 6 số"
                                >
                                  <Zap className="w-3 h-3 text-amber-400 animate-bounce shrink-0" />
                                  <span>OTP: <span className="underline tracking-wider font-extrabold">{otpCode}</span></span>
                                  <Copy className="w-2.5 h-2.5 ml-0.5 opacity-70 shrink-0" />
                                </button>
                              ) : null}

                              {mailStatus === 'approved' ? (
                                <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/50 text-[10px] font-semibold">
                                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                                  <span>Shop Approved</span>
                                </span>
                              ) : mailStatus === 'under_review' ? (
                                <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-500/50 text-[10px] font-semibold">
                                  <Clock className="w-2.5 h-2.5 text-purple-400 shrink-0" />
                                  <span>Đang xét duyệt</span>
                                </span>
                              ) : mailStatus === 'rejected_need_resubmit' ? (
                                <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-500/50 text-[10px] font-semibold">
                                  <AlertTriangle className="w-2.5 h-2.5 text-rose-400 shrink-0" />
                                  <span>Bị cờ đỏ ID</span>
                                </span>
                              ) : mailStatus === 'incomplete_onboarding' ? (
                                <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-500/50 text-[10px] font-semibold">
                                  <AlertCircle className="w-2.5 h-2.5 text-sky-400 shrink-0" />
                                  <span>Đang nộp dở</span>
                                </span>
                              ) : mailStatus === 'has_otp' && !otpCode ? (
                                <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-500/50 text-[10px] font-semibold">
                                  <span>Đã gửi OTP</span>
                                </span>
                              ) : mailStatus === 'not_registered' ? (
                                <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 text-[10px]">
                                  <span>Chưa Reg</span>
                                </span>
                              ) : mailData?.error ? (
                                <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-red-950/60 text-red-400 border border-red-900 text-[10px]" title={mailData.error}>
                                  <span>Lỗi check mail</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-slate-900 text-slate-500 border border-slate-800 text-[10px]">
                                  <span>Chưa check mail</span>
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Cột 3: TIẾN ĐỘ & CANH 6M (WATCHDOG) */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            {watchdog ? (
                              <div className="flex flex-col space-y-1">
                                <div className="flex items-center space-x-1.5 px-2 py-1 rounded-md bg-purple-950/90 text-purple-300 border border-purple-500/70 font-mono text-[11px] font-bold shadow animate-pulse">
                                  <Clock className="w-3.5 h-3.5 text-purple-400 shrink-0 animate-spin" />
                                  <span>⏱️ {formatTimer(watchdog.remaining)}</span>
                                  <span className="text-[9px] font-normal text-purple-200/70">(Tự check)</span>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    stopWatchdog(r.id)
                                  }}
                                  className="text-[9px] text-slate-400 hover:text-red-400 underline text-left"
                                >
                                  Dừng canh thư
                                </button>
                              </div>
                            ) : r.status && (r.status.toLowerCase().includes('approved') || r.status.toLowerCase().includes('active')) ? (
                              <div>
                                <div className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-500/50">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                  <span>Approved {r.submissionRound ? `(R${r.submissionRound})` : ''}</span>
                                </div>
                                {r.regDate && <div className="text-[10px] text-emerald-400/80 mt-0.5 font-mono">Ngày: {r.regDate}</div>}
                              </div>
                            ) : r.status && (r.status.toLowerCase().includes('information') || r.status.toLowerCase().includes('need info') || (r.submissionRound && r.submissionRound >= 5)) ? (
                              <div>
                                <div className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-500/70">
                                  <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                                  <span>Lỗi ID ({r.submissionRound || 1}/5)</span>
                                </div>
                                <div className="text-[10px] text-rose-400/90 mt-0.5 max-w-[140px] truncate" title={r.lastError}>
                                  {r.lastError ? r.lastError : 'Modifications detected'}
                                </div>
                              </div>
                            ) : r.status && r.status.toLowerCase().includes('under review') ? (
                              <div className="flex flex-col space-y-1">
                                <div className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-950 text-sky-300 border border-sky-500/50">
                                  <Clock className="w-3 h-3 text-sky-400" />
                                  <span>Under Review</span>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    start6MinWatchdog(r)
                                  }}
                                  className="flex items-center space-x-1 px-2 py-0.5 rounded bg-purple-950 hover:bg-purple-900 text-purple-300 border border-purple-700/60 text-[10px] font-semibold transition-all w-fit"
                                  title="Bật đếm ngược 6 phút tự động check hòm thư sau khi nộp"
                                >
                                  <Clock className="w-2.5 h-2.5 text-purple-400" />
                                  <span>⏱️ Canh 6 phút</span>
                                </button>
                              </div>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] bg-slate-900 text-slate-500 border border-slate-800">
                                {r.status || 'Chưa nộp đơn'}
                              </span>
                            )}
                          </td>

                          {/* Cột 4: KHO ẢNH & FILE ĐÃ NỘP */}
                          <td className="py-3 px-3">
                            {/* Auto-Harvested files from form submit */}
                            {harvested.length > 0 ? (
                              <div className="flex flex-col space-y-0.5">
                                <div className="text-[9px] font-semibold text-emerald-400 flex items-center space-x-1">
                                  <Check className="w-2.5 h-2.5" />
                                  <span>Đã nộp web ({harvested.length} ảnh):</span>
                                </div>
                                <div className="flex flex-wrap gap-1 max-w-[190px]">
                                  {harvested.map((h, idx) => (
                                    <span
                                      key={idx}
                                      className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono text-[9px] truncate max-w-[90px]"
                                      title={h.fileName}
                                    >
                                      {h.side ? `${h.side === 'front' ? 'T' : 'S'}: ` : ''}{h.fileName}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="text-slate-500 text-[10px] italic flex items-center space-x-1">
                                <span>⚪ Tự ghi nhận khi nộp web</span>
                              </div>
                            )}

                            {/* Photo pool variants button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                openPhotoPoolModal(r)
                              }}
                              className="flex items-center space-x-1 mt-1.5 px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-slate-700/80 text-[10px] font-medium transition-all group cursor-pointer"
                              title="Bấm để xem kho biến thể ảnh hoặc nạp ảnh thay thế"
                            >
                              <Camera className="w-3 h-3 text-emerald-400 group-hover:scale-110 transition-transform" />
                              <span>Kho ảnh biến thể</span>
                            </button>
                          </td>

                          {/* Cột 5: HÀNH ĐỘNG COPILOT (1-CHẠM) */}
                          <td className="py-3 px-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end space-x-1.5">
                              {/* 1-Click Action Button */}
                              {otpCode ? (
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(otpCode)
                                    setSetupFeedback(`Đã copy mã OTP: ${otpCode}`)
                                  }}
                                  className="px-2.5 py-1 text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg transition-all shadow-md flex items-center space-x-1"
                                  title="Copy mã OTP để dán vào TikTok"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copy OTP</span>
                                </button>
                              ) : (mailStatus === 'rejected_need_resubmit' || r.status?.toLowerCase().includes('information')) ? (
                                <button
                                  onClick={() => openPhotoPoolModal(r)}
                                  className="px-2.5 py-1 text-xs bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg transition-all shadow-md flex items-center space-x-1"
                                  title="Mở kho ảnh để chọn biến thể V2 nộp lại"
                                >
                                  <Camera className="w-3.5 h-3.5" />
                                  <span>Đổi Ảnh V2</span>
                                </button>
                              ) : (mailStatus === 'under_review' || r.status?.toLowerCase().includes('under review')) ? (
                                watchdog ? (
                                  <button
                                    onClick={() => handleCheckSingleMail(r)}
                                    disabled={isCheckingThisMail}
                                    className="px-2.5 py-1 text-xs bg-purple-900 hover:bg-purple-800 text-purple-200 font-semibold rounded-lg transition-all flex items-center space-x-1"
                                    title="Kiểm tra lại hòm thư ngay"
                                  >
                                    <RefreshCw className={`w-3 h-3 ${isCheckingThisMail ? 'animate-spin' : ''}`} />
                                    <span>Check lại</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => start6MinWatchdog(r)}
                                    className="px-2.5 py-1 text-xs bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg transition-all shadow-md flex items-center space-x-1"
                                    title="Bật đếm ngược 6 phút tự động check hòm thư sau khi nộp"
                                  >
                                    <Clock className="w-3.5 h-3.5" />
                                    <span>Canh 6 Phút</span>
                                  </button>
                                )
                              ) : (mailStatus === 'approved' || r.status?.toLowerCase().includes('approved')) ? (
                                <span className="px-2 py-1 text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 rounded font-semibold flex items-center space-x-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                  <span>Hoàn tất</span>
                                </span>
                              ) : hasAds ? (
                                <button
                                  onClick={() => handleLaunchAdsPower(r)}
                                  disabled={launchingProfileId === r.id}
                                  className="px-2.5 py-1 text-xs bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg transition-all shadow flex items-center space-x-1"
                                  title="Khởi động profile AdsPower iOS và điền form TikTok"
                                >
                                  <Play className="w-3 h-3 fill-white" />
                                  <span>Mở Ads (iOS)</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleSmartSetup(r)}
                                  disabled={isSettingUpThis}
                                  className="px-2.5 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition-all shadow flex items-center space-x-1"
                                  title="Gán Proxy và tạo Profile AdsPower cho hồ sơ này"
                                >
                                  <Zap className="w-3.5 h-3.5" />
                                  <span>Setup Ads</span>
                                </button>
                              )}

                              {/* Drawer button */}
                              <button
                                onClick={() => {
                                  setSelectedRecordId(r.id)
                                  setIsDrawerOpen(true)
                                }}
                                className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-all"
                                title="Xem chi tiết hồ sơ & Audit Scorecard"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* FLOATING CONTEXTUAL ACTION BAR (Appears smoothly when rows are selected) */}
            {selectedRowIds.size > 0 && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center space-x-2.5 px-4 py-2 bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl backdrop-blur-md text-xs animate-in slide-in-from-bottom-4 fade-in duration-200">
                <div className="flex items-center space-x-1.5 font-semibold text-white pr-2 border-r border-slate-700">
                  <CheckSquare className="w-4 h-4 text-emerald-400" />
                  <span>Đã chọn {selectedRowIds.size}</span>
                </div>

                {/* 1. Setup 99% */}
                <button
                  onClick={handleBatchSmartSetup}
                  disabled={isBatchSettingUp}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-cyan-500 hover:from-amber-400 hover:to-cyan-400 text-slate-950 font-semibold rounded-lg shadow transition-all disabled:opacity-50"
                  title="Tự động match ProxyHide và tạo Profile AdsPower iOS 390x844"
                >
                  <Zap className={`w-3.5 h-3.5 ${isBatchSettingUp ? 'animate-spin' : ''}`} />
                  <span>Setup 99% ({selectedRowIds.size})</span>
                </button>

                {/* 2. Auto-Detect 2 Sides */}
                <div className="relative">
                  <div className="flex items-center rounded-lg bg-emerald-600 p-[1px] shadow">
                    <button
                      onClick={() => handleAutoDetect2Sides('default_pool')}
                      disabled={isDetectingSides}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-950 hover:bg-slate-900 text-emerald-300 font-semibold rounded-l-lg transition-all disabled:opacity-50"
                      title="Tự động quét kho ảnh clean mockups & inbox"
                    >
                      <Sparkles className={`w-3.5 h-3.5 text-emerald-400 ${isDetectingSides ? 'animate-spin' : ''}`} />
                      <span>Bắt Cặp 2 Mặt ({selectedRowIds.size})</span>
                    </button>
                    <button
                      onClick={() => setShowAutoDetectMenu((prev) => !prev)}
                      className="px-1.5 py-1.5 bg-slate-950 hover:bg-slate-900 text-emerald-400 rounded-r-lg border-l border-emerald-900/50 transition-all"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {showAutoDetectMenu && (
                    <div className="absolute left-0 bottom-full mb-2 w-64 bg-slate-900 border border-slate-800 rounded-lg shadow-xl py-1 z-50 text-xs">
                      <button
                        onClick={() => handleAutoDetect2Sides('default_pool')}
                        className="w-full px-3 py-2 text-left hover:bg-slate-800 text-slate-200 flex items-center space-x-2"
                      >
                        <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div>
                          <div className="font-medium text-emerald-300">Quét Pool Sẵn Có (1-Click)</div>
                          <div className="text-[10px] text-slate-400">Từ Clean Mockups, Inbox & Outputs</div>
                        </div>
                      </button>
                      <button
                        onClick={() => handleAutoDetect2Sides('pick_folder')}
                        className="w-full px-3 py-2 text-left hover:bg-slate-800 text-slate-200 flex items-center space-x-2 border-t border-slate-800"
                      >
                        <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
                        <div>
                          <div className="font-medium text-amber-300">Chọn Thư Mục Chứa Ảnh...</div>
                          <div className="text-[10px] text-slate-400">Quét toàn bộ ảnh trong Folder</div>
                        </div>
                      </button>
                      <button
                        onClick={() => handleAutoDetect2Sides('pick_files')}
                        className="w-full px-3 py-2 text-left hover:bg-slate-800 text-slate-200 flex items-center space-x-2 border-t border-slate-800"
                      >
                        <UploadCloud className="w-4 h-4 text-cyan-400 shrink-0" />
                        <div>
                          <div className="font-medium text-cyan-300">Chọn Nhiều File Ảnh (Multi-Upload)...</div>
                          <div className="text-[10px] text-slate-400">Chọn hàng chục file ảnh cùng lúc</div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>

                {/* 3. Promote to active runs when on warehouse tabs (Phần 2, Phần 1) */}
                {isCurrentTabProtected && selectedSheetTab !== 'Automation' && (
                  <button
                    onClick={handlePromoteSelectedRecords}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg shadow transition-all"
                    title="Bê phôi từ kho sang trang tính chạy thật và đánh dấu CONSUMED"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>Bê sang Automation</span>
                  </button>
                )}

                {/* 4. Deselect */}
                <button
                  onClick={() => setSelectedRowIds(new Set())}
                  className="text-slate-400 hover:text-slate-200 px-2 py-1 text-xs"
                >
                  Bỏ chọn
                </button>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: 2-SIDE PHOTO STUDIO & EXIF INJECTION */}
        {/* ========================================================================= */}
        {activeTab === 'studio' && (
          <div className="flex-1 flex flex-col p-6 overflow-auto bg-slate-950">
            {/* Record Picker Header */}
            <div className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-xl mb-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-sm font-semibold text-white">2-Side Studio (Front & Back)</h2>
                    <span className="font-mono text-xs px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/40">
                      Hồ sơ: {currentRecord?.id || 'Chưa chọn'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Chủ thẻ: <span className="text-slate-200 font-medium">{currentRecord?.fullName}</span> | Bang:{' '}
                    <span className="text-emerald-400 font-medium">
                      {currentRecord?.state} ({US_STATES.find(s => s.code === currentRecord?.state)?.name || currentRecord?.state})
                    </span>
                  </p>
                </div>
              </div>

              {/* Actions & Device Preset */}
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-1.5 text-xs">
                  <span className="text-slate-400">Preset Camera:</span>
                  <select
                    value={selectedPreset}
                    onChange={(e) => setSelectedPreset(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-emerald-500"
                  >
                    <option value="iPhone 15 Pro">Apple iPhone 15 Pro (iOS 17.5.1)</option>
                    <option value="iPhone 14 Pro">Apple iPhone 14 Pro (iOS 17.2.1)</option>
                    <option value="iPhone 13 Pro">Apple iPhone 13 Pro (iOS 16.6.1)</option>
                  </select>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleProcessBothSides}
                  disabled={isProcessingFront || isProcessingBack || (!currentAssignment.frontOriginal && !currentAssignment.backOriginal)}
                  className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Xử lý chuẩn 2 Mặt</span>
                </Button>
              </div>
            </div>

            {/* Studio Feedback Alert */}
            {studioFeedback && (
              <div className="mb-4 p-3 bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 rounded-lg text-xs flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{studioFeedback}</span>
                </div>
                <button onClick={() => setStudioFeedback('')} className="text-emerald-400 hover:text-emerald-200">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* 2-Side Slots Side by Side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
              {/* SIDE 1: FRONT SIDE (MẶT TRƯỚC) */}
              <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-xl p-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <h3 className="font-semibold text-sm text-white">Mặt Trước (Front Side)</h3>
                  </div>
                  <button
                    onClick={() => handlePickLocalImage('front')}
                    className="flex items-center space-x-1 px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-all"
                  >
                    <FolderOpen className="w-3 h-3 text-emerald-400" />
                    <span>Duyệt ảnh máy tính...</span>
                  </button>
                </div>

                {/* File Dropdown / Selector */}
                <div className="mb-3">
                  <label className="text-[11px] text-slate-400 block mb-1">Chọn từ Inbox Submits / Download:</label>
                  <select
                    value={currentAssignment.frontOriginal || ''}
                    onChange={(e) => handleAssignPhoto('front', e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Chưa gán ảnh mặt trước --</option>
                    {inboxFiles.map((f) => (
                      <option key={f.fullPath} value={f.fullPath}>
                        [{f.folder}] {f.name} ({(f.size / 1024).toFixed(0)} KB)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Preview Box */}
                <div className="flex-1 min-h-[220px] bg-slate-950 border border-dashed border-slate-800 rounded-lg flex flex-col items-center justify-center p-4 relative overflow-hidden">
                  {currentAssignment.frontProcessed ? (
                    <div className="flex flex-col items-center w-full">
                      <div className="text-[11px] font-medium text-emerald-400 mb-2 flex items-center space-x-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Đã chuẩn hóa CR80 (1.586:1) & EXIF {currentAssignment.preset}</span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 bg-slate-900 p-2 rounded border border-slate-800 w-full break-all">
                        {currentAssignment.frontProcessed}
                      </div>
                    </div>
                  ) : currentAssignment.frontOriginal ? (
                    <div className="flex flex-col items-center w-full text-center">
                      <ImageIcon className="w-8 h-8 text-emerald-400/60 mb-2" />
                      <span className="text-xs text-slate-300 font-medium">Ảnh gốc đã được nạp</span>
                      <span className="text-[10px] text-slate-500 font-mono mt-1 break-all max-w-[90%]">
                        {currentAssignment.frontOriginal}
                      </span>
                    </div>
                  ) : (
                    <div className="text-center text-slate-500">
                      <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-xs">Chưa có ảnh mặt trước</p>
                      <p className="text-[10px] text-slate-600 mt-1">Chọn từ danh sách hoặc duyệt từ máy tính</p>
                    </div>
                  )}
                </div>

                {/* Action button */}
                <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleProcessImage('front')}
                    disabled={isProcessingFront || !currentAssignment.frontOriginal}
                    className="flex items-center space-x-1.5"
                  >
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                    <span>{isProcessingFront ? 'Đang xử lý...' : 'Cắt CR80 & Tiêm EXIF Mặt Trước'}</span>
                  </Button>
                </div>
              </div>

              {/* SIDE 2: BACK SIDE (MẶT SAU) */}
              <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-xl p-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                    <h3 className="font-semibold text-sm text-white">Mặt Sau (Back Side)</h3>
                  </div>
                  <button
                    onClick={() => handlePickLocalImage('back')}
                    className="flex items-center space-x-1 px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-all"
                  >
                    <FolderOpen className="w-3 h-3 text-blue-400" />
                    <span>Duyệt ảnh máy tính...</span>
                  </button>
                </div>

                {/* File Dropdown / Selector */}
                <div className="mb-3">
                  <label className="text-[11px] text-slate-400 block mb-1">Chọn từ Inbox Submits / Download:</label>
                  <select
                    value={currentAssignment.backOriginal || ''}
                    onChange={(e) => handleAssignPhoto('back', e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">-- Chưa gán ảnh mặt sau --</option>
                    {inboxFiles.map((f) => (
                      <option key={f.fullPath} value={f.fullPath}>
                        [{f.folder}] {f.name} ({(f.size / 1024).toFixed(0)} KB)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Preview Box */}
                <div className="flex-1 min-h-[220px] bg-slate-950 border border-dashed border-slate-800 rounded-lg flex flex-col items-center justify-center p-4 relative overflow-hidden">
                  {currentAssignment.backProcessed ? (
                    <div className="flex flex-col items-center w-full">
                      <div className="text-[11px] font-medium text-blue-400 mb-2 flex items-center space-x-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Đã chuẩn hóa CR80 (1.586:1) & EXIF {currentAssignment.preset}</span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 bg-slate-900 p-2 rounded border border-slate-800 w-full break-all">
                        {currentAssignment.backProcessed}
                      </div>
                    </div>
                  ) : currentAssignment.backOriginal ? (
                    <div className="flex flex-col items-center w-full text-center">
                      <ImageIcon className="w-8 h-8 text-blue-400/60 mb-2" />
                      <span className="text-xs text-slate-300 font-medium">Ảnh gốc đã được nạp</span>
                      <span className="text-[10px] text-slate-500 font-mono mt-1 break-all max-w-[90%]">
                        {currentAssignment.backOriginal}
                      </span>
                    </div>
                  ) : (
                    <div className="text-center text-slate-500">
                      <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-xs">Chưa có ảnh mặt sau</p>
                      <p className="text-[10px] text-slate-600 mt-1">Chọn từ danh sách hoặc duyệt từ máy tính</p>
                    </div>
                  )}
                </div>

                {/* Action button */}
                <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleProcessImage('back')}
                    disabled={isProcessingBack || !currentAssignment.backOriginal}
                    className="flex items-center space-x-1.5"
                  >
                    <Sparkles className="w-3 h-3 text-blue-400" />
                    <span>{isProcessingBack ? 'Đang xử lý...' : 'Cắt CR80 & Tiêm EXIF Mặt Sau'}</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: HIDEPROXY MANAGER */}
        {/* ========================================================================= */}
        {activeTab === 'hideproxy' && (
          <div className="flex-1 flex flex-col p-6 overflow-auto bg-slate-950">
            <div className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-xl mb-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">HideProxy Port Manager</h2>
                  <p className="text-xs text-slate-400">
                    Quản lý các port proxy đã mua, kiểm tra thời hạn sống và mua proxy chuẩn theo 50 Bang
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => {
                    setTargetProxyState(currentRecord?.state || 'AR')
                    setBuyProxyModalOpen(true)
                  }}
                  className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-all flex items-center space-x-1.5"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Mua Proxy Bang {currentRecord?.state || 'US'} (Qty=1)</span>
                </button>
              </div>
            </div>

            {/* Ports Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase text-[11px]">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Port</th>
                    <th className="py-2.5 px-4 font-semibold">IP Address</th>
                    <th className="py-2.5 px-4 font-semibold">Quốc gia & Bang</th>
                    <th className="py-2.5 px-4 font-semibold">Thành phố</th>
                    <th className="py-2.5 px-4 font-semibold">Nhà mạng (ISP)</th>
                    <th className="py-2.5 px-4 font-semibold">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {hpPorts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        {isLoadingPorts ? 'Đang tải danh sách port...' : 'Chưa có port HideProxy nào được kích hoạt'}
                      </td>
                    </tr>
                  ) : (
                    hpPorts.map((p, idx) => (
                      <tr key={p.id || idx} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-mono font-semibold text-emerald-400">{p.port || 'N/A'}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-200">{p.ip || '127.0.0.1'}</td>
                        <td className="py-2.5 px-4">
                          <span className="font-semibold text-slate-200">{p.countryCode || 'US'}</span> - {p.state_name || p.state || 'N/A'}
                        </td>
                        <td className="py-2.5 px-4 text-slate-300">{p.city_name || p.city || 'N/A'}</td>
                        <td className="py-2.5 px-4 text-slate-400">{p.isp_name || p.isp || 'N/A'}</td>
                        <td className="py-2.5 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                            {p.status || 'live'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: ADSPOWER MOBILE CDP */}
        {/* ========================================================================= */}
        {activeTab === 'adspower' && (
          <div className="flex-1 flex flex-col p-6 overflow-auto bg-slate-950">
            <div className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-xl mb-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">AdsPower Mobile CDP Profiles</h2>
                  <p className="text-xs text-slate-400">
                    Nhóm: <span className="text-emerald-400 font-medium">Team Remote (Thái) [10716270]</span> | Viewport:{' '}
                    <span className="text-slate-200 font-medium">iOS 390x844</span>
                  </p>
                </div>
              </div>

              {currentRecord && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleCreateAdsProfile(currentRecord)}
                  disabled={isCreatingAdsProfile}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  <Smartphone className="w-3.5 h-3.5 mr-1" />
                  <span>Tạo Profile cho {currentRecord.id}</span>
                </Button>
              )}
            </div>

            {adspowerFeedback && (
              <div className="mb-4 p-3 bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 rounded-lg text-xs">
                {adspowerFeedback}
              </div>
            )}

            {/* Profiles List */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase text-[11px]">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Tên Profile</th>
                    <th className="py-2.5 px-4 font-semibold">User ID</th>
                    <th className="py-2.5 px-4 font-semibold">IP / Proxy</th>
                    <th className="py-2.5 px-4 font-semibold">Thời gian tạo</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {adspowerProfiles.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        {isLoadingAdsProfiles ? 'Đang tải danh sách profile...' : 'Chưa có profile nào trong nhóm'}
                      </td>
                    </tr>
                  ) : (
                    adspowerProfiles.map((p) => (
                      <tr key={p.user_id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-semibold text-white">{p.name || 'N/A'}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-400">{p.user_id}</td>
                        <td className="py-2.5 px-4 text-slate-300">{p.ip || 'No proxy'}</td>
                        <td className="py-2.5 px-4 text-slate-500 text-[11px]">
                          {p.created_time ? new Date(p.created_time * 1000).toLocaleString() : 'N/A'}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            onClick={async () => {
                              try {
                                await ttsIpc.adspowerStart(p.user_id)
                              } catch (e) {
                                console.error(e)
                              }
                            }}
                            className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 rounded transition-all"
                          >
                            Mở Trình Duyệt CDP
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 4. DETAIL DRAWER (SLIDE OVER) */}
      {isDrawerOpen && currentRecord && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border-l border-slate-800 h-full flex flex-col p-6 shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <span className="font-mono text-base font-bold text-emerald-400">{currentRecord.id}</span>
                <span className="text-xs px-2 py-0.5 bg-slate-800 text-slate-300 rounded border border-slate-700">
                  {currentRecord.businessType}
                </span>
                {consumedRecords[currentRecord.id] && (
                  <span className="text-xs px-2 py-0.5 bg-black text-slate-400 rounded border border-slate-700">
                    Đã bốc từ {consumedRecords[currentRecord.id].fromTab}
                  </span>
                )}
              </div>
              <button onClick={() => setIsDrawerOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto py-4 space-y-4 text-xs">
              {/* Readiness Audit Scorecard Banner */}
              {currentRecord.readyStatus === '100_ready' ? (
                <div className="p-4 bg-emerald-500/15 border border-emerald-500/40 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      <span className="text-sm font-bold text-emerald-300">✓ 100% Full Ready</span>
                    </div>
                    <span className="font-mono text-xs px-2 py-0.5 bg-emerald-950 text-emerald-200 border border-emerald-800 rounded font-semibold">
                      100% Sẵn sàng
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Toàn bộ thông tin, giấy tờ pháp lý (IRS CP 575, Bank Statement), HideProxy (bang {currentRecord.state}), AdsPower iOS (390x844) và 2 mặt ảnh thẻ CR80 (tiêm EXIF iPhone 15 Pro) đã sẵn sàng để bot đăng ký tự động.
                  </p>
                </div>
              ) : currentRecord.readyStatus === '99_ready' ? (
                <div className="p-4 bg-gradient-to-r from-amber-500/15 via-cyan-500/15 to-emerald-500/10 border border-cyan-500/40 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Zap className="w-5 h-5 text-amber-400 animate-pulse" />
                      <span className="text-sm font-bold text-cyan-300">⚡ 99% Ready — Chờ 2 mặt ảnh</span>
                    </div>
                    <span className="font-mono text-xs px-2 py-0.5 bg-cyan-950 text-cyan-200 border border-cyan-800 rounded font-semibold">
                      99% Ready
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Hồ sơ cá nhân, Mã số thuế EIN, Thư xác nhận IRS CP 575, Bank Statement, HideProxy ({currentRecord.state}) và AdsPower Mobile đã thiết lập hoàn hảo! <strong>Chỉ cần nạp đủ 2 mặt ảnh thẻ</strong> để đạt 100% Full Ready.
                  </p>
                  <button
                    onClick={() => {
                      setIsDrawerOpen(false)
                      setActiveTab('studio')
                    }}
                    className="w-full py-2 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white rounded-lg text-xs font-semibold shadow-md flex items-center justify-center space-x-2 transition-all"
                  >
                    <Camera className="w-4 h-4" />
                    <span>📸 Chụp / Xử lý 2 Mặt Ảnh Thẻ Ngay</span>
                  </button>
                </div>
              ) : (
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <AlertCircle className="w-5 h-5 text-amber-400" />
                      <span className="text-sm font-bold text-slate-200">
                        Độ sẵn sàng: {currentRecord.readinessScore || 0}%
                      </span>
                    </div>
                    <span className="font-mono text-xs px-2 py-0.5 bg-slate-900 text-slate-400 border border-slate-700 rounded font-medium">
                      Chờ Setup
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Chưa kết nối HideProxy port theo bang hoặc chưa tạo AdsPower Profile cho hồ sơ này. Bấm nút dưới để tự động kích hoạt trạng thái 99% Ready.
                  </p>
                  <button
                    onClick={() => handleSmartSetup(currentRecord)}
                    disabled={isSettingUpId === currentRecord.id}
                    className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 rounded-lg text-xs font-semibold shadow-md flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
                  >
                    <Zap className={`w-4 h-4 ${isSettingUpId === currentRecord.id ? 'animate-spin' : ''}`} />
                    <span>⚡ Kích hoạt Smart Setup 99% Ngay</span>
                  </button>
                </div>
              )}

              {/* 195x Warning Alert */}
              {currentRecord.is195x && (
                <div className="p-3 bg-red-950/40 border border-red-800/80 rounded-xl flex items-start space-x-2 text-red-200">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-semibold text-xs text-red-300">Quy tắc Nghiệp vụ 195x (GEMINI.md Rule 2A)</div>
                    <div className="text-[11px] leading-relaxed text-red-300/90">
                      Năm sinh {currentRecord.dob} thuộc thập niên 195x (độ tuổi &gt; 65). Rất dễ bị kiểm duyệt từ chối danh tính hoặc thiếu phôi ảnh chân dung thực tế. <strong>Khuyến nghị BỎ QUA (SKIP).</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Card 1: Định danh & Địa chỉ cá nhân */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-slate-400 uppercase font-semibold text-[10px] tracking-wider flex items-center space-x-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>1. Thông tin Định danh & Địa chỉ cá nhân</span>
                  </h4>
                  <span className="text-[10px] text-emerald-400 font-medium">DMV 50 Bang</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Họ và tên:</span>
                    <span className="text-slate-200 font-semibold">{currentRecord.fullName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Ngày sinh (DOB):</span>
                    <span className={`font-mono ${currentRecord.is195x ? 'text-red-400 font-bold' : 'text-slate-200'}`}>
                      {currentRecord.dob || 'Chưa có'} {currentRecord.gender ? `(${currentRecord.gender})` : ''}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Số Bằng lái (DL#):</span>
                    <span className="text-emerald-400 font-mono font-semibold" title="Chuẩn DMV theo bang (Không dùng SSN)">
                      {currentRecord.dl || 'Chưa cấp'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Bang:</span>
                    <span className="text-emerald-300 font-semibold">
                      {currentRecord.state} - {US_STATES.find((s) => s.code === currentRecord.state)?.name || currentRecord.state}
                    </span>
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-slate-500">Địa chỉ cá nhân:</span>
                    <span className="text-slate-200 text-right max-w-[240px]">
                      {currentRecord.address}, {currentRecord.city}, {currentRecord.state} {currentRecord.zipCode}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 2: Mã số thuế & Doanh nghiệp Sole */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-slate-400 uppercase font-semibold text-[10px] tracking-wider flex items-center space-x-1.5">
                    <Building className="w-3.5 h-3.5 text-indigo-400" />
                    <span>2. Mã số Thuế & Doanh nghiệp Sole Proprietorship</span>
                  </h4>
                  <span className="text-[10px] px-1.5 py-0.2 bg-slate-800 text-slate-300 rounded">Sole Prop</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Tên Doanh nghiệp:</span>
                    <span className="text-emerald-400 font-semibold">{currentRecord.nameLlc || `${currentRecord.fullName} LLC`}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Mã EIN:</span>
                    <div className="flex items-center space-x-1.5">
                      <span className="text-slate-200 font-mono font-semibold">{currentRecord.ein || 'Chưa có'}</span>
                      {currentRecord.ein && (
                        <button
                          onClick={() => navigator.clipboard.writeText(currentRecord.ein)}
                          className="text-slate-500 hover:text-emerald-400 p-0.5"
                          title="Copy EIN"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Mã SSN:</span>
                    <div className="flex items-center space-x-1.5">
                      <span className="text-slate-200 font-mono">{currentRecord.ssn ? `***-**-${currentRecord.ssn.slice(-4)}` : 'Chưa có'}</span>
                      {currentRecord.ssn && (
                        <button
                          onClick={() => navigator.clipboard.writeText(currentRecord.ssn)}
                          className="text-slate-500 hover:text-emerald-400 p-0.5"
                          title="Copy SSN đầy đủ"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-slate-500">Địa chỉ Doanh nghiệp:</span>
                    <span className="text-slate-300 text-right max-w-[240px]">
                      {currentRecord.addressLlc || currentRecord.address}, {currentRecord.cityLlc || currentRecord.city},{' '}
                      {currentRecord.stateLlc || currentRecord.state} {currentRecord.zipLlc || currentRecord.zipCode}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 3: Tài liệu Pháp lý từ Cell Sheet */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-slate-400 uppercase font-semibold text-[10px] tracking-wider flex items-center space-x-1.5">
                    <FileText className="w-3.5 h-3.5 text-sky-400" />
                    <span>3. Tài liệu Pháp lý (Cell Sheet)</span>
                  </h4>
                  <span className="text-[10px] text-cyan-400 font-medium">Tự động trích xuất</span>
                </div>
                <div className="space-y-2.5">
                  {/* IRS CP 575 */}
                  <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-medium">Thư xác nhận thuế IRS (CP 575 / 147C):</span>
                      <span className={currentRecord.pdfDoc ? 'text-emerald-400 text-[10px]' : 'text-slate-600 text-[10px]'}>
                        {currentRecord.pdfDoc ? '✓ Có file PDF' : 'Chưa có'}
                      </span>
                    </div>
                    {currentRecord.pdfDoc ? (
                      <div className="flex items-center justify-between bg-slate-950 p-1.5 rounded border border-slate-800 text-[11px] font-mono text-slate-300">
                        <span className="truncate max-w-[340px]" title={currentRecord.pdfDoc}>
                          {currentRecord.pdfDoc}
                        </span>
                        <button
                          onClick={() => navigator.clipboard.writeText(currentRecord.pdfDoc || '')}
                          className="text-slate-400 hover:text-emerald-400 ml-1.5"
                          title="Copy tên file PDF"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-500 italic">Chưa có tên tệp PDF trên Sheet</div>
                    )}
                  </div>

                  {/* Bank Statement / Utility Bill */}
                  <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-medium">Hóa đơn tiện ích / Sao kê (Bank / Utility):</span>
                      <span className={currentRecord.bankStatement ? 'text-emerald-400 text-[10px]' : 'text-slate-600 text-[10px]'}>
                        {currentRecord.bankStatement ? '✓ Có file' : 'Chưa có'}
                      </span>
                    </div>
                    {currentRecord.bankStatement ? (
                      <div className="flex items-center justify-between bg-slate-950 p-1.5 rounded border border-slate-800 text-[11px] font-mono text-slate-300">
                        <span className="truncate max-w-[340px]" title={currentRecord.bankStatement}>
                          {currentRecord.bankStatement}
                        </span>
                        <button
                          onClick={() => navigator.clipboard.writeText(currentRecord.bankStatement || '')}
                          className="text-slate-400 hover:text-emerald-400 ml-1.5"
                          title="Copy tên file Bank Statement"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-500 italic">Chưa có tên tệp Bank Statement trên Sheet</div>
                    )}
                  </div>

                  {/* Folder URL */}
                  {currentRecord.folderUrl && (
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Folder Google Drive:</span>
                      <span className="font-mono text-slate-300">{currentRecord.folderUrl}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 4: Tài khoản TikTok & SMS Phone API */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-slate-400 uppercase font-semibold text-[10px] tracking-wider flex items-center space-x-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-pink-400" />
                    <span>4. Tài khoản TikTok Shop & API OTP Phone</span>
                  </h4>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Email:</span>
                    <div className="flex items-center space-x-1.5">
                      <span className="text-slate-200">{currentRecord.email || 'N/A'}</span>
                      {currentRecord.email && (
                        <button
                          onClick={() => navigator.clipboard.writeText(currentRecord.email)}
                          className="text-slate-500 hover:text-emerald-400 p-0.5"
                          title="Copy Email"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Mật khẩu Mail:</span>
                    <div className="flex items-center space-x-1.5">
                      <span className="text-slate-200 font-mono">{currentRecord.mailPass || 'N/A'}</span>
                      {currentRecord.mailPass && (
                        <button
                          onClick={() => navigator.clipboard.writeText(currentRecord.mailPass)}
                          className="text-slate-500 hover:text-emerald-400 p-0.5"
                          title="Copy Mail Pass"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Pass Titkok Shop:</span>
                    <div className="flex items-center space-x-1.5">
                      <span className="text-emerald-400 font-mono font-semibold">
                        {currentRecord.tiktokPass || currentRecord.mailPass || 'N/A'}
                      </span>
                      {(currentRecord.tiktokPass || currentRecord.mailPass) && (
                        <button
                          onClick={() => navigator.clipboard.writeText(currentRecord.tiktokPass || currentRecord.mailPass || '')}
                          className="text-slate-500 hover:text-emerald-400 p-0.5"
                          title="Copy TikTok Pass"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Số Điện Thoại (SMS):</span>
                    <div className="flex items-center space-x-1.5">
                      <span className="text-slate-200 font-mono font-semibold">{currentRecord.phone || 'N/A'}</span>
                      {currentRecord.phone && (
                        <button
                          onClick={() => navigator.clipboard.writeText(currentRecord.phone || '')}
                          className="text-slate-500 hover:text-emerald-400 p-0.5"
                          title="Copy SĐT"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* SMS API Button */}
                  {currentRecord.phoneCodeUrl && (
                    <div className="pt-1">
                      <a
                        href={currentRecord.phoneCodeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full py-1.5 px-3 bg-pink-950/40 hover:bg-pink-900/50 text-pink-300 border border-pink-700/50 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>🔗 Mở API Lấy Mã OTP SMS (SMS8)</span>
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 5: HideProxy Thông Minh */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-slate-400 uppercase font-semibold text-[10px] tracking-wider flex items-center space-x-1.5">
                    <Globe className="w-3.5 h-3.5 text-cyan-400" />
                    <span>5. HideProxy Thông Minh (State Matching)</span>
                  </h4>
                  <span className="text-[10px] text-cyan-400 font-medium">Bang: {currentRecord.state}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Cổng Port Gán Kết:</span>
                    <span className="text-cyan-300 font-mono font-bold">
                      {currentRecord.assignedPort ? `Port ${currentRecord.assignedPort}` : 'Chưa gán'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">IP Công khai:</span>
                    <span className="text-slate-200 font-mono">{currentRecord.proxyMeta?.public_ip || '127.0.0.1'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">ISP / Nhà mạng:</span>
                    <span className="text-slate-300 text-right max-w-[200px] truncate">
                      {currentRecord.proxyMeta?.isp || 'T-Mobile / AT&T'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Trạng thái Live:</span>
                    <span className="text-emerald-400 font-semibold flex items-center space-x-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span>{currentRecord.assignedPort ? 'Socks5 Sẵn sàng' : 'Chưa kết nối'}</span>
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleSmartSetup(currentRecord, false)}
                  disabled={isSettingUpId === currentRecord.id}
                  className="w-full mt-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 rounded-lg text-xs font-medium transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSettingUpId === currentRecord.id ? 'animate-spin' : ''}`} />
                  <span>Match lại Proxy cho Bang {currentRecord.state}</span>
                </button>
              </div>

              {/* Card 6: AdsPower Mobile Profile */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-slate-400 uppercase font-semibold text-[10px] tracking-wider flex items-center space-x-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                    <span>6. Môi trường AdsPower Profile (Mobile iOS)</span>
                  </h4>
                  <span className="text-[10px] text-emerald-400 font-medium">Nhóm 10716270</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Profile ID:</span>
                    <span className="text-emerald-400 font-mono font-bold">{currentRecord.adspowerId || 'Chưa tạo'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Nhóm Profile:</span>
                    <span className="text-slate-200">Team Remote (Thái)</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Viewport / Màn hình:</span>
                    <span className="text-slate-200 font-mono">390x844 (iPhone 15 Pro)</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Proxy Cấu hình:</span>
                    <span className="text-cyan-300 font-mono text-[11px]">
                      {currentRecord.assignedPort ? `socks5://127.0.0.1:${currentRecord.assignedPort}` : 'No Proxy'}
                    </span>
                  </div>
                </div>

                {currentRecord.adspowerId ? (
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button
                      onClick={async () => {
                        try {
                          await ttsIpc.adspowerStart(currentRecord.adspowerId!)
                        } catch (e) {
                          console.error(e)
                        }
                      }}
                      className="py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow transition-all flex items-center justify-center space-x-1"
                    >
                      <span>▶ Mở Trình Duyệt</span>
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await ttsIpc.adspowerStop(currentRecord.adspowerId!)
                        } catch (e) {
                          console.error(e)
                        }
                      }}
                      className="py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-semibold transition-all flex items-center justify-center space-x-1"
                    >
                      <span>⏹ Dừng Profile</span>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleSmartSetup(currentRecord)}
                    disabled={isSettingUpId === currentRecord.id}
                    className="w-full mt-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 rounded-lg text-xs font-medium transition-all"
                  >
                    Tạo Profile AdsPower Ngay
                  </button>
                )}
              </div>

              {/* Card 7: Trạng thái 2 Mặt Thẻ CR80 */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-slate-400 uppercase font-semibold text-[10px] tracking-wider flex items-center space-x-1.5">
                    <Camera className="w-3.5 h-3.5 text-amber-400" />
                    <span>7. Trạng thái 2 Mặt Thẻ CR80 (Chốt chặn 100%)</span>
                  </h4>
                  <span className="text-[10px] text-amber-400 font-medium">Tiêu chuẩn In ấn 1200 DPI</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Mặt trước (Front Side):</span>
                    <span className={currentAssignment.frontProcessed ? 'text-emerald-400 font-semibold' : 'text-amber-400'}>
                      {currentAssignment.frontProcessed ? '✓ Đã nạp EXIF iPhone 15 Pro' : currentAssignment.frontOriginal ? 'Đã nạp ảnh gốc' : 'Chưa có ảnh'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Mặt sau (Back Side / Barcode):</span>
                    <span className={currentAssignment.backProcessed ? 'text-emerald-400 font-semibold' : 'text-amber-400'}>
                      {currentAssignment.backProcessed ? '✓ Đã nạp EXIF iPhone 15 Pro' : currentAssignment.backOriginal ? 'Đã nạp ảnh gốc' : 'Chưa có ảnh'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsDrawerOpen(false)
                    setActiveTab('studio')
                  }}
                  className="w-full mt-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-medium transition-all flex items-center justify-center space-x-1.5"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Mở Studio Ảnh cho Hồ sơ này</span>
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => setIsDrawerOpen(false)}>
                Đóng
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 5. ADD NEW RECORD MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center space-x-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">Thêm Hồ sơ TTS Mới (Sole Proprietorship)</h3>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Mã Profile (*):</label>
                  <input
                    type="text"
                    value={addForm.id}
                    onChange={(e) => setAddForm({ ...addForm, id: e.target.value })}
                    placeholder="TTS-01, AM-07..."
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Họ và Tên (*):</label>
                  <input
                    type="text"
                    value={addForm.fullName}
                    onChange={(e) => setAddForm({ ...addForm, fullName: e.target.value })}
                    placeholder="John Doe"
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Bang (50 States):</label>
                  <select
                    value={addForm.state}
                    onChange={(e) => setAddForm({ ...addForm, state: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200"
                  >
                    {US_STATES.map((st) => (
                      <option key={st.code} value={st.code}>
                        {st.code} - {st.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Thành phố (City):</label>
                  <input
                    type="text"
                    value={addForm.city}
                    onChange={(e) => setAddForm({ ...addForm, city: e.target.value })}
                    placeholder="Little Rock, Miami..."
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Địa chỉ (Street Address):</label>
                <input
                  type="text"
                  value={addForm.address}
                  onChange={(e) => setAddForm({ ...addForm, address: e.target.value })}
                  placeholder="123 Main St, Apt 4B"
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Zip Code:</label>
                  <input
                    type="text"
                    value={addForm.zipCode}
                    onChange={(e) => setAddForm({ ...addForm, zipCode: e.target.value })}
                    placeholder="72201"
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Ngày sinh (DOB):</label>
                  <input
                    type="text"
                    value={addForm.dob}
                    onChange={(e) => setAddForm({ ...addForm, dob: e.target.value })}
                    placeholder="MM/DD/YYYY"
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">SĐT (Phone):</label>
                  <input
                    type="text"
                    value={addForm.phone}
                    onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                    placeholder="+1 (555) 000-0000"
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">SSN:</label>
                  <input
                    type="text"
                    value={addForm.ssn}
                    onChange={(e) => setAddForm({ ...addForm, ssn: e.target.value })}
                    placeholder="000-00-0000"
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">EIN:</label>
                  <input
                    type="text"
                    value={addForm.ein}
                    onChange={(e) => setAddForm({ ...addForm, ein: e.target.value })}
                    placeholder="00-0000000"
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Email TikTok:</label>
                  <input
                    type="text"
                    value={addForm.email}
                    onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                    placeholder="user@hotmail.com"
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Mật khẩu:</label>
                  <input
                    type="text"
                    value={addForm.mailPass}
                    onChange={(e) => setAddForm({ ...addForm, mailPass: e.target.value })}
                    placeholder="Password123"
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">2FA Secret:</label>
                  <input
                    type="text"
                    value={addForm.twoFactor}
                    onChange={(e) => setAddForm({ ...addForm, twoFactor: e.target.value })}
                    placeholder="M.C527..."
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-800 mt-5">
              <Button variant="ghost" size="sm" onClick={() => setShowAddModal(false)}>
                Hủy
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreateNewRecord}
                disabled={!addForm.id.trim() || !addForm.fullName.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                Lưu vào TTS Chạy Thật
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 6. BUY PROXY SAFE CONFIRMATION MODAL */}
      {buyProxyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Xác nhận Mua Proxy HideProxy</h3>
                <p className="text-xs text-slate-400">Số lượng cố định: 1 proxy (Tránh mất điểm)</p>
              </div>
            </div>

            <div className="space-y-3 mb-6 bg-slate-950 p-4 rounded-lg border border-slate-800 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Quốc gia:</span>
                <span className="text-white font-semibold">United States (US)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Bang mục tiêu:</span>
                <select
                  value={targetProxyState}
                  onChange={(e) => setTargetProxyState(e.target.value)}
                  className="px-2 py-1 text-xs bg-slate-900 border border-slate-700 rounded text-emerald-400 font-bold uppercase text-right"
                >
                  {US_STATES.map((st) => (
                    <option key={st.code} value={st.code}>
                      {st.code} - {st.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Số lượng:</span>
                <span className="text-emerald-400 font-bold">1 (Strict single buy)</span>
              </div>
            </div>

            {proxyBuyFeedback && (
              <div className="mb-4 p-2.5 bg-slate-950 border border-emerald-500/40 text-emerald-300 rounded text-xs">
                {proxyBuyFeedback}
              </div>
            )}

            <div className="flex items-center justify-end space-x-2">
              <Button variant="ghost" size="sm" onClick={() => setBuyProxyModalOpen(false)}>
                Hủy bỏ
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmBuyProxy}
                disabled={isBuyingProxy || !targetProxyState}
                className="bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                {isBuyingProxy ? 'Đang thực hiện...' : 'Xác nhận Mua (-1 Qty)'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 7. PHOTO POOL & LIGHTBOX MODAL */}
      {poolModalRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-b border-slate-800 shrink-0">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-bold text-white tracking-wide">KHO BIẾN THỂ & ẢNH 2 MẶT</h3>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                      {poolModalRecord.id}
                    </span>
                    {poolModalRecord.submissionRound && poolModalRecord.submissionRound > 0 && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 font-mono">
                        Lượt re-submit: {poolModalRecord.submissionRound}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Chủ sở hữu: <strong className="text-slate-200">{poolModalRecord.fullName}</strong> | Bang: <strong className="text-emerald-400">{poolModalRecord.state}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPoolModalRecord(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {poolFeedback && (
                <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 text-xs flex items-center justify-between">
                  <span>{poolFeedback}</span>
                  <button onClick={() => setPoolFeedback('')} className="text-emerald-400 hover:text-white cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* 5x Re-submission Warning Alert */}
              {poolModalRecord.submissionRound && poolModalRecord.submissionRound >= 5 && (
                <div className="p-4 rounded-xl bg-rose-950/70 border border-rose-600/70 text-rose-200 text-xs flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-bold text-rose-300 text-sm mb-1">
                      CẢNH BÁO: ĐÃ ĐẠT GIỚI HẠN 5 LẦN RE-SUBMIT CHO HỒ SƠ NÀY
                    </div>
                    <p className="text-rose-200/90 leading-relaxed">
                      TikTok vẫn giữ cờ đỏ cảnh báo ID. Hệ thống đã <strong>DỪNG TỰ ĐỘNG NỘP LẠI</strong> để tránh rủi ro khóa tài khoản vĩnh viễn. 
                      Vui lòng chụp lại ảnh phôi thẻ nhựa thực tế bằng camera điện thoại mới (không qua phần mềm cắt cúp), sau đó bấm nút bên dưới để nạp vào kho.
                    </p>
                  </div>
                </div>
              )}

              {/* 1. Pool Variants Selector Bar */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Kho Biến Thể Khả Dụng ({poolVariants.length})</span>
                  </h4>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handlePickNewPoolPhoto('front')}
                      className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg flex items-center space-x-1 transition-all cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
                      <span>+ Nạp Mặt Trước Mới...</span>
                    </button>
                    <button
                      onClick={() => handlePickNewPoolPhoto('back')}
                      className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg flex items-center space-x-1 transition-all cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
                      <span>+ Nạp Mặt Sau Mới...</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {poolVariants.map((v) => (
                    <div
                      key={v.id}
                      onClick={() => handleSelectPoolVariant(v)}
                      className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex flex-col justify-between ${
                        selectedVariantId === v.id
                          ? 'bg-emerald-950/40 border-emerald-500 shadow-md ring-1 ring-emerald-500/50'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-white truncate mr-2">{v.name}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            v.score >= 90 ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-amber-950 text-amber-300 border border-amber-800'
                          }`}>
                            {v.score}/100
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 space-y-0.5 font-mono">
                          <div>F: {v.frontSizeMb} MB • B: {v.backSizeMb} MB</div>
                          <div className="text-slate-500">EXIF: Apple iPhone 15 Pro</div>
                        </div>
                      </div>
                      <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                        <span className={`text-[10px] font-semibold ${selectedVariantId === v.id ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {selectedVariantId === v.id ? '● Đang chọn' : '○ Bấm để chọn'}
                        </span>
                        {v.isGold && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold">
                            GOLD
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Visual Front & Back High-Res Preview */}
              <div>
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
                  Ảnh 2 Mặt Thực Tế Đang Chọn (Visual Readback)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Front Side Card */}
                  <div className="flex flex-col bg-slate-950 border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-white flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span>Mặt Trước (Front Side)</span>
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-900/50">
                        1200 DPI Master
                      </span>
                    </div>
                    <div className="h-64 bg-slate-900 rounded-lg border border-slate-800/80 overflow-hidden flex items-center justify-center p-2 relative group">
                      {isLoadingPool ? (
                        <div className="text-slate-500 text-xs flex flex-col items-center">
                          <RefreshCw className="w-5 h-5 animate-spin mb-1 text-slate-600" />
                          <span>Đang nạp ảnh...</span>
                        </div>
                      ) : poolThumbnails.front ? (
                        <img
                          src={poolThumbnails.front}
                          alt="Front Side"
                          className="max-h-full max-w-full object-contain rounded shadow-lg group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="text-slate-500 text-xs flex flex-col items-center">
                          <ImageIcon className="w-8 h-8 text-slate-700 mb-1" />
                          <span>Chưa có ảnh mặt trước</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Back Side Card */}
                  <div className="flex flex-col bg-slate-950 border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-white flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span>Mặt Sau (Back Side)</span>
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-900/50">
                        PDF417 Barcode Match
                      </span>
                    </div>
                    <div className="h-64 bg-slate-900 rounded-lg border border-slate-800/80 overflow-hidden flex items-center justify-center p-2 relative group">
                      {isLoadingPool ? (
                        <div className="text-slate-500 text-xs flex flex-col items-center">
                          <RefreshCw className="w-5 h-5 animate-spin mb-1 text-slate-600" />
                          <span>Đang nạp ảnh...</span>
                        </div>
                      ) : poolThumbnails.back ? (
                        <img
                          src={poolThumbnails.back}
                          alt="Back Side"
                          className="max-h-full max-w-full object-contain rounded shadow-lg group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="text-slate-500 text-xs flex flex-col items-center">
                          <ImageIcon className="w-8 h-8 text-slate-700 mb-1" />
                          <span>Chưa có ảnh mặt sau</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Lịch Sử & Tiến Trình Nộp Hồ Sơ (Audit History Timeline) */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                    <History className="w-3.5 h-3.5 text-sky-400" />
                    <span>Lịch Sử Tiến Trình Nộp Hồ Sơ (Audit Timeline)</span>
                  </h4>
                  <span className="text-[11px] font-mono text-slate-400">
                    Trạng thái hiện tại: <strong className="text-emerald-400">{profileSetups[poolModalRecord.id]?.liveStatus || poolModalRecord.liveStatus || 'Chưa nộp'}</strong>
                  </span>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                  {profileSetups[poolModalRecord.id]?.history && profileSetups[poolModalRecord.id].history.length > 0 ? (
                    <div className="space-y-2">
                      {profileSetups[poolModalRecord.id].history.map((h: any, idx: number) => (
                        <div
                          key={idx}
                          className="flex items-start justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs"
                        >
                          <div className="flex items-start space-x-2.5">
                            <span className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-[11px] text-white shrink-0">
                              {h.round}
                            </span>
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="font-semibold text-slate-200">Lượt {h.round}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                  h.status.includes('Under review')
                                    ? 'bg-sky-950 text-sky-300 border border-sky-800'
                                    : 'bg-rose-950 text-rose-300 border border-rose-800'
                                }`}>
                                  {h.status}
                                </span>
                              </div>
                              {h.error && (
                                <div className="text-[11px] text-rose-400 mt-0.5 flex items-center space-x-1">
                                  <span>Chi tiết lỗi: {h.error}</span>
                                </div>
                              )}
                              {h.variant && (
                                <div className="text-[11px] text-emerald-400 font-mono mt-0.5">
                                  Biến thể nạp: {h.variant}
                                </div>
                              )}
                            </div>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono shrink-0 ml-3">{h.date}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-3 text-slate-500 text-xs italic">
                      Chưa có lịch sử submit cho hồ sơ này.
                    </div>
                  )}

                  {/* 5x Re-submission Warning Alert */}
                  {(profileSetups[poolModalRecord.id]?.submissionRound >= 5 || (poolModalRecord.submissionRound && poolModalRecord.submissionRound >= 5)) && (
                    <div className="mt-3 p-3 rounded-lg bg-rose-950/80 border border-rose-600 text-rose-200 text-xs flex items-center space-x-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>
                        <strong>Đạt giới hạn 5 lần resubmit:</strong> Hệ thống đã dừng tự động thử lại. Vui lòng chụp lại phôi ID từ thiết bị chụp thật mới và tải lên kho ảnh.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end px-6 py-4 bg-slate-950 border-t border-slate-800 shrink-0">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setPoolModalRecord(null)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                Đóng Kho Ảnh
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 8. SMART SETUP MODAL (SINGLE & BULK WITH RICH TELEMETRY) */}
      {setupModalConfig.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-b border-slate-800 shrink-0">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-gradient-to-tr from-amber-500/20 to-cyan-500/20 border border-cyan-500/30 rounded-xl text-cyan-400">
                  <Zap className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-bold text-white tracking-wide">
                      {setupModalConfig.mode === 'single'
                        ? `THIẾT LẬP MÔI TRƯỜNG HỒ SƠ [${setupModalConfig.records[0]?.id}]`
                        : `THIẾT LẬP MÔI TRƯỜNG HÀNG LOẠT (${setupModalConfig.records.length} HỒ SƠ)`}
                    </h3>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                      {setupModalConfig.mode === 'single'
                        ? `Bang: ${setupModalConfig.records[0]?.state || 'N/A'}`
                        : `${setupModalConfig.records.length} Profiles`}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {setupModalConfig.mode === 'single'
                      ? `Cấu hình Profile AdsPower iOS 390x844, Nạp Extension Copilot MV3 & Gán Proxy chuẩn Bang ${setupModalConfig.records[0]?.state}`
                      : `Tự động phân bổ Port HideProxy theo bang và khởi tạo Profile AdsPower cho ${setupModalConfig.records.length} hồ sơ đã chọn`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSetupModalConfig((prev) => ({ ...prev, isOpen: false }))}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
                disabled={setupModalConfig.isExecuting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {setupModalConfig.mode === 'single' ? (
                /* SINGLE MODE UI */
                (() => {
                  const curRec = setupModalConfig.records[0]
                  if (!curRec) return null
                  const curStateNorm = normalizeState(curRec.state || '')
                  const activePort =
                    setupModalConfig.selectedPort || curRec.assignedPort || 50007
                  const portInfo = hpPorts.find((p) => p.port === activePort)
                  const proxyStateNorm = normalizeState(portInfo?.state || '')
                  const isGeoMatch =
                    portInfo?.online &&
                    curStateNorm &&
                    proxyStateNorm &&
                    curStateNorm === proxyStateNorm

                  return (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {/* CARD 1: AdsPower Environment & Device Fingerprint */}
                        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
                          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                            <div className="flex items-center space-x-2 text-cyan-400 font-semibold text-xs uppercase tracking-wider">
                              <Smartphone className="w-4 h-4" />
                              <span>1. Môi Trường AdsPower (Mobile iOS)</span>
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">
                              Group 10716270
                            </span>
                          </div>

                          <div className="space-y-2.5 text-xs">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Tên Hồ Sơ:</span>
                              <span className="font-mono text-white font-semibold">
                                {curRec.id} - {curRec.fullName || 'TTS'}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Bang Hồ Sơ:</span>
                              <span className="font-mono text-cyan-300 font-bold">
                                {curRec.state} ({US_STATES.find((s) => s.code === curRec.state)?.name || curRec.state})
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Hệ Điều Hành & Thiết Bị:</span>
                              <span className="text-slate-200 font-medium">Apple iPhone 15 Pro (iOS 17.5.1)</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Độ Phân Giải / Viewport:</span>
                              <span className="font-mono text-emerald-400 font-medium">390 x 844 (Mobile Real)</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Ngôn Ngữ & Múi Giờ:</span>
                              <span className="text-slate-300 font-mono">en-US, en (Auto Geo-IP)</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Tiện Ích Copilot (MV3):</span>
                              <span className="text-emerald-400 font-semibold flex items-center space-x-1">
                                <CheckCircle2 className="w-3.5 h-3.5 inline mr-1 text-emerald-400" />
                                <span>Tự động nạp (--load-extension)</span>
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">AdsPower Profile ID:</span>
                              <span className="font-mono font-bold text-amber-400">
                                {curRec.adspowerId || profileSetups[curRec.id]?.adspowerId || 'Chưa khởi tạo'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* CARD 2: HideProxy Live Telemetry */}
                        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
                          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                            <div className="flex items-center space-x-2 text-amber-400 font-semibold text-xs uppercase tracking-wider">
                              <Globe className="w-4 h-4" />
                              <span>2. Thông Số Proxy & Hạ Tầng Mạng</span>
                            </div>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                                portInfo?.online
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : 'bg-rose-950 text-rose-300 border border-rose-800'
                              }`}
                            >
                              {portInfo?.online ? '🟢 Online' : '🔴 Offline'}
                            </span>
                          </div>

                          <div className="space-y-2.5 text-xs">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Chọn Cổng (Port):</span>
                              <select
                                value={activePort}
                                onChange={(e) =>
                                  setSetupModalConfig((prev) => ({
                                    ...prev,
                                    selectedPort: Number(e.target.value)
                                  }))
                                }
                                disabled={setupModalConfig.isExecuting}
                                className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-cyan-300 font-mono font-bold text-xs"
                              >
                                {hpPorts
                                  .filter((p) => p.online)
                                  .map((p) => (
                                    <option key={p.port} value={p.port}>
                                      Port {p.port} - {p.public_ip || 'IP'} ({p.state || 'US'})
                                    </option>
                                  ))}
                                {!hpPorts.some((p) => p.port === activePort && p.online) && (
                                  <option value={activePort}>Port {activePort} (Hiện tại)</option>
                                )}
                              </select>
                            </div>

                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Giao Thức:</span>
                              <span className="font-mono text-slate-300">
                                HTTP / 127.0.0.1:{activePort}
                              </span>
                            </div>

                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Exit Public IP:</span>
                              <span className="font-mono font-bold text-white text-sm">
                                {portInfo?.public_ip || '127.0.0.1'}
                              </span>
                            </div>

                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Vị Trí Địa Lý:</span>
                              <span className="font-medium text-slate-200">
                                {portInfo?.city ? `${portInfo.city}, ` : ''}
                                {portInfo?.state || 'US'}
                              </span>
                            </div>

                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Nhà Mạng / ISP:</span>
                              <span className="font-medium text-slate-300 truncate max-w-[220px]" title={portInfo?.isp || ''}>
                                {portInfo?.isp || 'Chưa có thông tin ISP'}
                              </span>
                            </div>
                          </div>

                          {/* Geo Match Verification Card */}
                          <div
                            className={`p-3 rounded-lg border text-xs flex items-center space-x-2.5 ${
                              isGeoMatch
                                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                                : 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                            }`}
                          >
                            {isGeoMatch ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                            )}
                            <div>
                              <div className="font-semibold">
                                {isGeoMatch
                                  ? `TRÙNG KHỚP BANG: ${curRec.state} == ${portInfo?.state}`
                                  : `CẢNH BÁO LỆCH BANG: Hồ sơ [${curRec.state}] vs Proxy [${portInfo?.state || 'Khác'}]`}
                              </div>
                              <div className="text-[11px] opacity-90 mt-0.5">
                                {isGeoMatch
                                  ? 'Proxy và hồ sơ đồng nhất vị trí địa lý, an toàn tuyệt đối khi đăng ký.'
                                  : 'Khuyến nghị chọn cổng có bang tương ứng hoặc mua proxy mới để đảm bảo tỷ lệ duyệt.'}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Execution Progress Banner */}
                      {setupModalConfig.progress && (
                        <div className="p-3.5 bg-slate-950 border border-cyan-800/80 rounded-xl space-y-1.5 animate-in fade-in">
                          <div className="flex justify-between text-xs">
                            <span className="text-cyan-400 font-semibold flex items-center space-x-2">
                              {setupModalConfig.isExecuting && (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              )}
                              <span>{setupModalConfig.progress.currentStatus}</span>
                            </span>
                            <span className="font-mono text-slate-400">
                              {setupModalConfig.progress.current} / {setupModalConfig.progress.total}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()
              ) : (
                /* BULK MODE UI */
                <div className="space-y-5">
                  {/* Summary Metric Pills */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                      <div className="text-[11px] text-slate-400 uppercase font-semibold">
                        Hồ Sơ Cần Thiết Lập
                      </div>
                      <div className="text-xl font-bold font-mono text-white mt-1">
                        {setupModalConfig.records.length} Profiles
                      </div>
                    </div>
                    <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                      <div className="text-[11px] text-slate-400 uppercase font-semibold">
                        Cổng Proxy Online
                      </div>
                      <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                        {hpPorts.filter((p) => p.online).length} Ports
                      </div>
                    </div>
                    <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                      <div className="text-[11px] text-slate-400 uppercase font-semibold">
                        Đã Đạt 99% / 100% Ready
                      </div>
                      <div className="text-xl font-bold font-mono text-cyan-400 mt-1">
                        {
                          setupModalConfig.records.filter(
                            (r) => r.readyStatus === '100_ready' || r.readyStatus === '99_ready'
                          ).length
                        }{' '}
                        / {setupModalConfig.records.length}
                      </div>
                    </div>
                  </div>

                  {/* Progress Tracker when Executing */}
                  {setupModalConfig.isExecuting && setupModalConfig.progress && (
                    <div className="bg-slate-950 p-4 rounded-xl border border-cyan-800 space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-cyan-300 font-semibold flex items-center space-x-2">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>{setupModalConfig.progress.currentStatus}</span>
                        </span>
                        <span className="font-mono text-white font-bold">
                          {Math.round(
                            ((setupModalConfig.progress.current || 0) /
                              setupModalConfig.records.length) *
                              100
                          )}
                          %
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-amber-500 to-cyan-500 h-2 transition-all duration-300"
                          style={{
                            width: `${Math.round(
                              ((setupModalConfig.progress.current || 0) /
                                setupModalConfig.records.length) *
                                100
                            )}%`
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Bulk Preview Table */}
                  <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                    <div className="max-h-[380px] overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-[10px] text-slate-400 uppercase font-semibold">
                          <tr>
                            <th className="py-2.5 px-3">Hồ Sơ</th>
                            <th className="py-2.5 px-2 text-center">Bang</th>
                            <th className="py-2.5 px-2 text-center">Port</th>
                            <th className="py-2.5 px-3">Exit Public IP</th>
                            <th className="py-2.5 px-3">Vị Trí (City, State)</th>
                            <th className="py-2.5 px-3">ISP / Nhà Mạng</th>
                            <th className="py-2.5 px-2 text-center">Khớp Bang</th>
                            <th className="py-2.5 px-3 text-right">Trạng Thái</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {setupModalConfig.records.map((rec) => {
                            const recStateNorm = normalizeState(rec.state || '')
                            const matchedPort =
                              rec.assignedPort ||
                              hpPorts.find(
                                (p) =>
                                  p.online && normalizeState(p.state || '') === recStateNorm
                              )?.port ||
                              50007
                            const portInfo = hpPorts.find((p) => p.port === matchedPort)
                            const pStateNorm = normalizeState(portInfo?.state || '')
                            const isMatch =
                              portInfo?.online &&
                              recStateNorm &&
                              pStateNorm &&
                              recStateNorm === pStateNorm
                            const hasAds = !!(
                              rec.adspowerId || profileSetups[rec.id]?.adspowerId
                            )

                            return (
                              <tr key={rec.id} className="hover:bg-slate-900/60 transition-colors">
                                <td className="py-2 px-3 font-semibold text-white">
                                  <span className="text-cyan-400 mr-1.5">{rec.id}</span>
                                  <span className="font-sans font-normal text-slate-300">
                                    {rec.fullName}
                                  </span>
                                </td>
                                <td className="py-2 px-2 text-center text-cyan-300 font-bold">
                                  {rec.state}
                                </td>
                                <td className="py-2 px-2 text-center text-amber-300">
                                  {matchedPort}
                                </td>
                                <td className="py-2 px-3 text-slate-200">
                                  {portInfo?.public_ip || '127.0.0.1'}
                                </td>
                                <td className="py-2 px-3 font-sans text-slate-300 truncate max-w-[160px]">
                                  {portInfo?.city ? `${portInfo.city}, ` : ''}
                                  {portInfo?.state || 'US'}
                                </td>
                                <td className="py-2 px-3 font-sans text-slate-400 truncate max-w-[160px]" title={portInfo?.isp || ''}>
                                  {portInfo?.isp || 'Charter / Comcast'}
                                </td>
                                <td className="py-2 px-2 text-center">
                                  {isMatch ? (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 font-sans">
                                      🟢 Khớp
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-950 text-amber-400 border border-amber-800 font-sans">
                                      🟡 Khác
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right">
                                  {hasAds ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800 font-sans font-semibold">
                                      99% Ready
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700 font-sans">
                                      Chờ tạo
                                    </span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-t border-slate-800 shrink-0">
              <div className="text-xs text-slate-400">
                {setupModalConfig.mode === 'single'
                  ? 'Tất cả thay đổi được đồng bộ tức thời qua SSOT Live Bus (:8787)'
                  : `Đã chọn ${setupModalConfig.records.length} hồ sơ để đồng bộ`}
              </div>

              <div className="flex items-center space-x-2.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSetupModalConfig((prev) => ({ ...prev, isOpen: false }))}
                  disabled={setupModalConfig.isExecuting}
                >
                  Đóng
                </Button>

                {setupModalConfig.mode === 'single' ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={refreshHideProxyPorts}
                      disabled={setupModalConfig.isExecuting}
                      className="text-slate-300 border border-slate-700 hover:bg-slate-800"
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1" />
                      Quét Lại Ports
                    </Button>

                    {setupModalConfig.records[0]?.adspowerId && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={async () => {
                          try {
                            await ttsIpc.adspowerStart(setupModalConfig.records[0].adspowerId!)
                          } catch (e) {
                            console.error(e)
                          }
                        }}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow"
                      >
                        ▶ Mở Trình Duyệt Ngay
                      </Button>
                    )}

                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleExecuteModalSingleSetup}
                      disabled={setupModalConfig.isExecuting}
                      className="bg-gradient-to-r from-amber-500 to-cyan-500 hover:from-amber-400 hover:to-cyan-400 text-slate-950 font-bold shadow"
                    >
                      {setupModalConfig.isExecuting ? (
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Zap className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      <span>
                        {setupModalConfig.records[0]?.adspowerId
                          ? 'Cập Nhật Profile & Gán Proxy'
                          : 'Xác Nhận & Thiết Lập 99%'}
                      </span>
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleExecuteModalBulkSetup}
                    disabled={setupModalConfig.isExecuting || setupModalConfig.records.length === 0}
                    className="bg-gradient-to-r from-amber-500 to-cyan-500 hover:from-amber-400 hover:to-cyan-400 text-slate-950 font-bold shadow"
                  >
                    {setupModalConfig.isExecuting ? (
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Zap className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    <span>
                      {setupModalConfig.isExecuting
                        ? 'Đang Thiết Lập Hàng Loạt...'
                        : `Bắt Đầu Thiết Lập (${setupModalConfig.records.length} Profiles)`}
                    </span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: FULL FLOW (DRY RUN) PREFLIGHT DIAGNOSTICS & CROSS-MACHINE CHECK  */}
      {/* ========================================================================= */}
      {showPreflightModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-cyan-950/60 via-slate-900 to-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-cyan-500/20 border border-cyan-500/40 rounded-xl text-cyan-400">
                  <Stethoscope className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-bold text-white tracking-wide">
                      Kiểm Thử Full Flow (Dry Run) & Chuẩn Đoán Máy Mới
                    </h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950 border border-cyan-500/40 text-cyan-300">
                      Zero-Desync Suite
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Kiểm tra toàn diện 7 kết nối: Google Sheet, HideProxy (:10101), AdsPower (:50325), Copilot Hub (:8787), Extension MV3, Storage & Simulation.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPreflightModal(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Overall Status Banner */}
              {isRunningPreflight ? (
                <div className="p-6 rounded-xl border border-cyan-500/40 bg-cyan-950/30 flex flex-col items-center justify-center text-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
                  <div>
                    <h4 className="text-sm font-semibold text-white">Đang thực hiện kiểm thử Full Flow song song...</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      Đang probe Google Sheets, HideProxy API, AdsPower API, Copilot Hub, quyền ổ đĩa và chạy mô phỏng profile...
                    </p>
                  </div>
                </div>
              ) : preflightData ? (
                <div className={`p-4 rounded-xl border ${
                  preflightData.overallStatus === 'pass'
                    ? 'border-emerald-500/50 bg-emerald-950/30'
                    : preflightData.overallStatus === 'warn'
                    ? 'border-amber-500/50 bg-amber-950/30'
                    : 'border-rose-500/50 bg-rose-950/30'
                }`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2.5">
                      {preflightData.overallStatus === 'pass' ? (
                        <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                      ) : preflightData.overallStatus === 'warn' ? (
                        <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />
                      ) : (
                        <XCircle className="w-6 h-6 text-rose-400 shrink-0" />
                      )}
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                            preflightData.overallStatus === 'pass'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : preflightData.overallStatus === 'warn'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}>
                            {preflightData.overallStatus === 'pass'
                              ? 'SẴN SÀNG VẬN HÀNH (100% PASS)'
                              : preflightData.overallStatus === 'warn'
                              ? 'CÓ CẢNH BÁO PHỤ'
                              : 'CHƯA ĐỦ ĐIỀU KIỆN - CẦN KHẮC PHỤC'}
                          </span>
                          <span className="text-xs text-slate-400 font-mono">
                            {preflightData.checks?.filter((c: any) => c.status === 'pass').length}/{preflightData.checks?.length} checks đạt
                          </span>
                          <span className="text-xs text-slate-500">·</span>
                          <span className="text-xs text-slate-400 font-mono">
                            ⏱️ {preflightData.durationMs || 0}ms
                          </span>
                        </div>
                        <p className="text-xs text-slate-200 mt-1 font-medium">
                          {preflightData.summary}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Checklist Items */}
              {preflightData?.checks && preflightData.checks.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
                    Danh Sách Kết Nối & Kiểm Thử Chi Tiết ({preflightData.checks.length} Thành Phần)
                  </h4>
                  <div className="grid grid-cols-1 gap-3">
                    {preflightData.checks.map((check: any) => {
                      const isPass = check.status === 'pass'
                      const isWarn = check.status === 'warn'
                      return (
                        <div
                          key={check.id}
                          className={`rounded-xl border p-4 transition-all ${
                            isPass
                              ? 'border-slate-800 bg-slate-950/60 hover:border-emerald-500/30'
                              : isWarn
                              ? 'border-amber-500/40 bg-amber-950/10 hover:border-amber-500/60'
                              : 'border-rose-500/40 bg-rose-950/10 hover:border-rose-500/60'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start space-x-3 flex-1 min-w-0">
                              <div className="mt-0.5 shrink-0">
                                {isPass ? (
                                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                ) : isWarn ? (
                                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                                ) : (
                                  <XCircle className="w-5 h-5 text-rose-400" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center space-x-2">
                                  <span className="text-xs font-bold text-white">{check.name}</span>
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400">
                                    {check.category}
                                  </span>
                                  {check.latencyMs !== undefined && (
                                    <span className="text-[10px] font-mono text-cyan-400/80">
                                      {check.latencyMs}ms
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-300 mt-1">
                                  {check.message}
                                </p>

                                {/* Remediation guidance for new machine */}
                                {check.fixGuide && (
                                  <div className="mt-2.5 p-2 rounded-lg bg-slate-900/90 border border-slate-800/80 text-[11px] text-slate-400 flex items-start space-x-1.5">
                                    <span className="text-amber-400 shrink-0 font-bold">💡 Hướng dẫn máy mới:</span>
                                    <span>{check.fixGuide}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                                  isPass
                                    ? 'bg-emerald-950 border border-emerald-500/40 text-emerald-400'
                                    : isWarn
                                    ? 'bg-amber-950 border border-amber-500/40 text-amber-400'
                                    : 'bg-rose-950 border border-rose-500/40 text-rose-400'
                                }`}
                              >
                                {check.status}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 bg-slate-900/95 border-t border-slate-800 flex items-center justify-between shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyPreflightReport}
                disabled={!preflightData}
                className="text-slate-300 border border-slate-700 hover:bg-slate-800 text-xs"
              >
                {preflightCopyFeedback ? (
                  <>
                    <CheckCheck className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                    <span>Đã Copy Báo Cáo!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                    <span>Copy Báo Cáo Chẩn Đoán</span>
                  </>
                )}
              </Button>

              <div className="flex items-center space-x-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRunPreflight}
                  disabled={isRunningPreflight}
                  className="bg-slate-800 hover:bg-slate-700 text-white text-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRunningPreflight ? 'animate-spin' : ''}`} />
                  <span>Chạy Lại Kiểm Thử</span>
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowPreflightModal(false)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4"
                >
                  Xong
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
