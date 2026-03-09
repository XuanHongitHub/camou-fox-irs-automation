import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  ApiResponse,
  AutomationTemplate,
  AutomationTemplateRecord,
  BrowserProfile,
  InputBatchRecord,
  InputRecordRow,
  InputSourceConfig,
  InputSourceRecord,
  InputSourceType,
  ProxyBulkPatch,
  ProxyItem,
  ProxyListQuery,
  ProxyListResult,
  ProxyTestAllPayload,
  ProxyTestAllResult,
  QueueHealthSnapshot,
  RunRecord,
  RunRecordItem
} from '../shared/types'

export interface IApi {
  store: {
    proxies: {
      get: () => Promise<ProxyItem[]>
      list: (query?: ProxyListQuery) => Promise<ApiResponse<ProxyListResult>>
      set: (proxies: ProxyItem[]) => Promise<{ success: boolean; error?: string }>
      add: (proxy: ProxyItem) => Promise<{ success: boolean; error?: string }>
      remove: (id: string) => Promise<{ success: boolean; error?: string }>
      clear: () => Promise<{ success: boolean; error?: string }>
      bulkDelete: (ids: string[]) => Promise<ApiResponse<{ removed: number }>>
      bulkUpdate: (
        payload: { ids: string[]; patch: ProxyBulkPatch }
      ) => Promise<ApiResponse<{ updated: number }>>
      toggleEnabled: (id: string, enabled: boolean) => Promise<ApiResponse<boolean>>
      bulkParse: (raw: string) => Promise<
        ApiResponse<{
          totalLines: number
          parsed: number
          added: number
          duplicatesSkipped: number
          failedParse: number
        }>
      >
      test: (
        proxy: { host: string; port: number; username?: string; password?: string },
        timeoutMs?: number
      ) => Promise<
        ApiResponse<{
          success: boolean
          status: 'healthy' | 'degraded' | 'dead' | 'auth_error'
          latencyMs?: number
          error?: string
        }>
      >
      testAll: (payload?: ProxyTestAllPayload) => Promise<ApiResponse<ProxyTestAllResult>>
    }
    profiles: {
      get: () => Promise<BrowserProfile[]>
      add: (profile: Partial<BrowserProfile>) => Promise<{ success: boolean; error?: string }>
      update: (
        id: string,
        patch: Partial<BrowserProfile>
      ) => Promise<{ success: boolean; error?: string }>
      remove: (id: string) => Promise<{
        success: boolean
        profileId: string
        dataDirRemoved: boolean
        warning?: string
      }>
      bulkCreate: (payload: {
        count: number
        prefix?: string
      }) => Promise<{ success: boolean; error?: string }>
      quickCreateFromProxies: (payload?: {
        prefix?: string
        lifecyclePolicy?: 'one_time' | 'persistent'
      }) => Promise<ApiResponse<{ created: number; totalProxies: number }>>
    }
    settings: {
      get: () => Promise<Record<string, string>>
      set: (key: string, value: string) => Promise<{ success: boolean; error?: string }>
    }
  }
  system: {
    pickFile: (payload?: {
      title?: string
      filters?: Array<{ name: string; extensions: string[] }>
    }) => Promise<ApiResponse<string | null>>
  }
  input: {
    source: {
      list: () => Promise<ApiResponse<InputSourceRecord[]>>
      create: (payload: {
        name: string
        type: InputSourceType
        config: InputSourceConfig
      }) => Promise<ApiResponse<InputSourceRecord>>
      update: (
        sourceId: string,
        patch: { name?: string; type?: InputSourceType; config?: InputSourceConfig }
      ) => Promise<ApiResponse<boolean>>
      delete: (sourceId: string) => Promise<ApiResponse<boolean>>
      preview: (sourceId: string, limit?: number) => Promise<ApiResponse<Array<Record<string, unknown>>>>
      import: (sourceId: string) => Promise<ApiResponse<InputBatchRecord>>
    }
    batch: {
      list: (sourceId?: string) => Promise<ApiResponse<InputBatchRecord[]>>
      records: (batchId: string) => Promise<ApiResponse<InputRecordRow[]>>
    }
  }
  template: {
    list: () => Promise<ApiResponse<AutomationTemplateRecord[]>>
    create: (payload: {
      name: string
      version: string
      targetDomain: string
      templateJson: string
      isActive?: boolean
    }) => Promise<ApiResponse<AutomationTemplateRecord>>
    update: (
      templateId: string,
      patch: Partial<{
        name: string
        version: string
        targetDomain: string
        templateJson: string
        isActive: boolean
      }>
    ) => Promise<ApiResponse<boolean>>
    delete: (templateId: string) => Promise<ApiResponse<boolean>>
    validate: (
      templateJson: string
    ) => Promise<ApiResponse<{ valid: boolean; errors: string[]; normalized?: string }>>
    scan: (url: string) => Promise<ApiResponse<AutomationTemplate>>
  }
  run: {
    list: () => Promise<ApiResponse<RunRecord[]>>
    get: (runId: string) => Promise<ApiResponse<RunRecord | null>>
    create: (payload: {
      name: string
      targetDomain: string
      templateId: string
      sourceBatchId: string
    }) => Promise<ApiResponse<RunRecord>>
    start: (runId: string) => Promise<ApiResponse<boolean>>
    pause: (runId: string) => Promise<ApiResponse<boolean>>
    resume: (runId: string) => Promise<ApiResponse<boolean>>
    stop: (runId: string) => Promise<ApiResponse<boolean>>
    record: {
      list: (runId: string) => Promise<ApiResponse<RunRecordItem[]>>
      retry: (runRecordId: string) => Promise<ApiResponse<boolean>>
      manualTakeover: (runRecordId: string) => Promise<ApiResponse<boolean>>
      manualResume: (runRecordId: string) => Promise<ApiResponse<boolean>>
      manualAbort: (runRecordId: string) => Promise<ApiResponse<boolean>>
    }
  }
  report: {
    export: (runId: string, format: 'csv' | 'xlsx') => Promise<ApiResponse<string>>
  }
  runtime: {
    onLog: (
      callback: (entry: {
        id: string
        timestamp: string
        level: 'info' | 'warning' | 'error' | 'success'
        message: string
        data?: unknown
      }) => void
    ) => () => void
  }
  queue: {
    health: () => Promise<ApiResponse<QueueHealthSnapshot>>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: IApi
  }
}
