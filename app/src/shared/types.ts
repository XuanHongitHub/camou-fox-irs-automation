export interface ApiResponse<T> {
  success: boolean
  error?: string
  data?: T
}

export type ProxyStatus = 'unknown' | 'healthy' | 'degraded' | 'dead' | 'auth_error'

export interface ProxyItem {
  id: string
  name: string
  host: string
  port: number
  username?: string
  password?: string
  status?: ProxyStatus
  lastCheckedAt?: string
  latencyMs?: number
  lastError?: string
  enabled?: boolean
  provider?: string
  country?: string
  city?: string
  tags?: string[]
  consecutiveFailures?: number
  successCount?: number
  failureCount?: number
  lastStatusReason?: string
  createdAt?: string
  updatedAt?: string
}

export type ProxySortBy = 'host' | 'port' | 'status' | 'latencyMs' | 'lastCheckedAt' | 'createdAt'
export type SortDirection = 'asc' | 'desc'

export interface ProxyListQuery {
  page?: number
  pageSize?: number
  search?: string
  statuses?: ProxyStatus[]
  hasAuth?: boolean
  enabled?: boolean
  sortBy?: ProxySortBy
  sortDir?: SortDirection
}

export interface ProxyListResult {
  items: ProxyItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ProxyTestAllPayload {
  query?: ProxyListQuery
  timeoutMs?: number
  concurrency?: number
}

export interface ProxyTestAllResult {
  total: number
  tested: number
  healthy: number
  degraded: number
  dead: number
  auth_error: number
  unknown: number
}

export interface ProxyBulkPatch {
  enabled?: boolean
  provider?: string
  country?: string
  city?: string
  tags?: string[]
}

export interface BrowserProfile {
  id: string
  name: string
  role: 'master' | 'worker'
  proxyId?: string
  userAgent: string
  viewport?: { width: number; height: number }
  lifecyclePolicy: 'one_time' | 'persistent'
  consumedAt?: string
  lastError?: string
  status: 'ready' | 'consumed' | 'error' | 'running' | 'syncing'
  createdAt: string
  lastUsedAt?: string
  totalSessions?: number
  careEnabled?: boolean
  carePlatforms?: string[]
  careLastRunAt?: string
  platformSignals?: string
  launchMode?: 'human' | 'automation'
  executablePath?: string
  defaultExtensionStatus?: 'ok' | 'unknown' | 'missing'
  defaultExtensionError?: string
  defaultExtensionCheckedAt?: string
  defaultExtensionSyncState?: string
  defaultExtensionSyncAt?: string
}

export type InputSourceType = 'csv' | 'xlsx' | 'api'

export interface InputSourceConfig {
  filePath?: string
  sheetName?: string
  delimiter?: string
  hasHeader?: boolean
  apiUrl?: string
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: Record<string, unknown> | string
  dataPath?: string
  businessKeyField?: string
}

export interface InputSourceRecord {
  id: string
  name: string
  type: InputSourceType
  configJson: string
  status: 'ready' | 'error'
  createdAt: string
  updatedAt: string
}

export interface InputBatchRecord {
  id: string
  sourceId: string
  fileName: string
  checksum: string
  totalRows: number
  acceptedRows: number
  rejectedRows: number
  status: 'imported' | 'failed'
  createdAt: string
}

export interface InputRecordRow {
  id: string
  batchId: string
  rowIndex: number
  payloadJson: string
  businessKey?: string
  status: 'pending' | 'accepted' | 'rejected' | 'processing' | 'done' | 'failed'
  validationError?: string
  createdAt: string
}

export interface SelectorSpec {
  css?: string[]
  labelText?: string
  placeholder?: string
  name?: string
  id?: string
}

export type AutomationStepType =
  | 'start'
  | 'end'
  | 'condition'
  | 'fork'
  | 'merge'
  | 'loop'
  | 'goto'
  | 'waitFor'
  | 'fillText'
  | 'selectOption'
  | 'setCheckbox'
  | 'setRadio'
  | 'uploadFile'
  | 'click'
  | 'submit'
  | 'assert'
  | 'screenshot'
  | 'sleep'

export interface AutomationStep {
  type: AutomationStepType
  label?: string
  selector?: string
  selectors?: SelectorSpec
  value?: string
  valueFrom?: string
  const?: string | number | boolean | null
  timeoutMs?: number
  assertType?: 'success' | 'noError' | 'containsText' | 'urlIncludes'
  expression?: string
  mergeMode?: 'any' | 'all'
  loopItemsFrom?: string
  loopItemAlias?: string
  loopIndexAlias?: string
  maxIterations?: number
  message?: string
  saveAs?: string
}

export interface AutomationTemplateV1 {
  schemaVersion: '1.0'
  meta?: {
    name?: string
    version?: string
    description?: string
  }
  targetDomain: string
  successIndicators?: string[]
  errorIndicators?: string[]
  steps: AutomationStep[]
}

export interface AutomationGraphNode {
  id: string
  step: AutomationStep
  position: { x: number; y: number }
}

export interface AutomationGraphEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
}

export interface AutomationTemplateV2 {
  schemaVersion: '2.0'
  meta?: {
    name?: string
    version?: string
    description?: string
  }
  targetDomain: string
  successIndicators?: string[]
  errorIndicators?: string[]
  entryNodeId: string
  nodes: AutomationGraphNode[]
  edges: AutomationGraphEdge[]
}

export type AutomationTemplate = AutomationTemplateV1 | AutomationTemplateV2

export interface AutomationTemplateRecord {
  id: string
  name: string
  version: string
  targetDomain: string
  schemaVersion: string
  templateJson: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type RunStatus =
  | 'created'
  | 'queued'
  | 'scheduled'
  | 'running'
  | 'draining'
  | 'deferred'
  | 'paused'
  | 'stopped'
  | 'completed'
  | 'failed'

export type RunRecordStatus =
  | 'queued'
  | 'retry_scheduled'
  | 'running'
  | 'done'
  | 'failed'
  | 'blocked'
  | 'manual_pending'
  | 'timed_out'
  | 'cancelled'

export interface RunRecord {
  id: string
  name: string
  targetDomain: string
  templateId: string
  sourceBatchId: string
  status: RunStatus
  startedAt?: string
  endedAt?: string
  statsJson?: string
  createdAt: string
}

export interface RunRecordItem {
  id: string
  runId: string
  inputRecordId: string
  profileId?: string
  proxyId?: string
  status: RunRecordStatus
  stage?: string
  attempt: number
  errorCode?: string
  errorMessage?: string
  startedAt?: string
  endedAt?: string
  createdAt: string
}

export interface RecordStepItem {
  id: string
  runRecordId: string
  stepIndex: number
  stepType: string
  status: 'pending' | 'running' | 'done' | 'failed'
  message?: string
  screenshotPath?: string
  durationMs?: number
  createdAt: string
}

export interface ManualTakeoverState {
  runRecordId: string
  reason: string
  startedAt: string
  resumedAt?: string
  abortedAt?: string
}

export type UiLanguage = 'vi' | 'en'

export interface QueueWindowConfig {
  enabled: boolean
  timezone: string
  start: string
  end: string
}

export interface QueueHealthSnapshot {
  withinWindow: boolean
  checkedAt: string
  nextWindowStartAt: string
  queueWindow: QueueWindowConfig
}
