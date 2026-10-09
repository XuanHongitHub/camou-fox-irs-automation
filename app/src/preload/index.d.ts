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
  tts: {
    status: () => Promise<{
      ok: boolean
      adspower: { online: boolean; base: string }
      hideproxy: { online: boolean; base: string }
    }>
    fetchSheet: (params?: {
      sheetId?: string
      tabName?: string
    }) => Promise<{
      ok: boolean
      sheetId?: string
      tabName?: string
      total?: number
      records?: any[]
      error?: string
    }>
    hideproxy: {
      ports: () => Promise<{ ok: boolean; data?: any[]; error?: string }>
      portInfo: () => Promise<{ ok: boolean; data?: any[]; error?: string }>
      forward: (params: { id: string; port: number }) => Promise<{ ok: boolean; data?: any; error?: string }>
      states: (country?: string) => Promise<{ ok: boolean; data?: any[]; error?: string }>
      cities: (state: string) => Promise<{ ok: boolean; data?: any[]; error?: string }>
      buy: (params: {
        country?: string
        state?: string
        city?: string
        isp?: string
        port?: number
      }) => Promise<{ ok: boolean; data?: any; error?: string }>
    }
    adspower: {
      list: (groupId?: string) => Promise<{ ok: boolean; data?: any[]; error?: string }>
      create: (payload: any) => Promise<{ ok: boolean; data?: any; error?: string }>
      start: (userId: string) => Promise<{ ok: boolean; data?: any; error?: string }>
      stop: (userId: string) => Promise<{ ok: boolean; error?: string }>
    }
    smartSetup: (params: {
      record: any
      autoBuyProxy?: boolean
    }) => Promise<{ ok: boolean; record?: any; error?: string }>
    batchSmartSetup: (params: {
      records: any[]
      autoBuyProxy?: boolean
    }) => Promise<{ ok: boolean; total?: number; records?: any[]; error?: string }>
    inbox: {
      list: () => Promise<{
        ok: boolean
        files: Array<{ name: string; fullPath: string; size: number; mtime: number; folder: string }>
        error?: string
      }>
      pickImage: () => Promise<{ ok: boolean; cancelled?: boolean; filePath?: string; error?: string }>
      pickMultipleImages: () => Promise<{ ok: boolean; cancelled?: boolean; filePaths?: string[]; error?: string }>
      pickFolder: () => Promise<{ ok: boolean; cancelled?: boolean; folderPath?: string; error?: string }>
    }
    pool: {
      autoDetect2Sides: (params: {
        records: any[]
        folderPath?: string
        filePaths?: string[]
        preset?: string
      }) => Promise<{
        ok: boolean
        matchedCount?: number
        totalChecked?: number
        results?: Array<{ id: string; front: string; back: string }>
        updatedRecords?: any[]
        error?: string
      }>
      getVariants: (profileId: string) => Promise<{ ok: boolean; variants?: any[]; error?: string }>
      assignVariant: (params: { profileId: string; frontPath: string; backPath: string; name?: string }) =>
        Promise<{ ok: boolean; error?: string }>
    }
    image: {
      readDataUrl: (filePath: string) => Promise<{ ok: boolean; dataUrl?: string; error?: string }>
    }
    processImage: (params: {
      inputPath: string
      preset?: string
      crop?: boolean
      profileId?: string
      side?: string
    }) => Promise<{ ok: boolean; output?: string; exif?: any; error?: string }>
    state: {
      get: () => Promise<{ ok: boolean; data?: any; error?: string }>
      save: (payload: any) => Promise<{ ok: boolean; error?: string }>
    }
    doc: {
      generateCp575: (record: any) => Promise<{ ok: boolean; filePath?: string; fileName?: string; error?: string }>
      generateVerizon: (record: any) => Promise<{ ok: boolean; filePath?: string; fileName?: string; error?: string }>
      openFile: (filePath: string) => Promise<{ ok: boolean; error?: string }>
      openFolder: (folderPath?: string) => Promise<{ ok: boolean; path?: string; error?: string }>
    }
    extension: {
      getInfo: () => Promise<{ ok: boolean; extensionPath?: string; zipPath?: string; hasUnpacked?: boolean; hasZip?: boolean; manifest?: any; error?: string }>
      openFolder: () => Promise<{ ok: boolean; error?: string }>
      openZip: () => Promise<{ ok: boolean; error?: string }>
    }
    proxy: {
      test: (params: { proxyType?: string; host: string; port: number | string; user?: string; password?: string }) =>
        Promise<{ ok: boolean; latencyMs?: number; ip?: string; country?: string; region?: string; city?: string; isp?: string; error?: string }>
      updateProfile: (payload: {
        recordId: string
        adspowerId?: string
        proxyString: string
        proxyConfig: any
        restartIfActive?: boolean
      }) => Promise<{ ok: boolean; recordId?: string; adspowerId?: string; assignedProxy?: string; adsUpdated?: boolean; adsError?: string; restarted?: boolean; error?: string }>
      rotateUrl: (payload: { rotateUrl: string }) => Promise<{ ok: boolean; status?: number; body?: string; error?: string }>
      poolGet: () => Promise<{ ok: boolean; pool?: string[]; error?: string }>
      poolSave: (payload: { pool: string[] }) => Promise<{ ok: boolean; count?: number; error?: string }>
      poolPopNext: (payload: { recordId: string }) => Promise<{ ok: boolean; proxyString?: string; remaining?: number; error?: string }>
    }
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: IApi
  }
}
