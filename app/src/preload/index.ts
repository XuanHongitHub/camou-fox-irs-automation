import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  store: {
    proxies: {
      get: () => ipcRenderer.invoke('store:proxies:get'),
      list: (query?: any) => ipcRenderer.invoke('store:proxies:list', query),
      set: (proxies: any[]) => ipcRenderer.invoke('store:proxies:set', proxies),
      add: (proxy: any) => ipcRenderer.invoke('store:proxies:add', proxy),
      remove: (id: string) => ipcRenderer.invoke('store:proxies:remove', id),
      clear: () => ipcRenderer.invoke('store:proxies:clear'),
      bulkDelete: (ids: string[]) => ipcRenderer.invoke('store:proxies:bulkDelete', ids),
      bulkUpdate: (payload: { ids: string[]; patch: any }) =>
        ipcRenderer.invoke('store:proxies:bulkUpdate', payload),
      toggleEnabled: (id: string, enabled: boolean) =>
        ipcRenderer.invoke('store:proxies:toggleEnabled', id, enabled),
      bulkParse: (raw: string) => ipcRenderer.invoke('store:proxies:bulkParse', raw),
      test: (
        proxy: { host: string; port: number; username?: string; password?: string },
        timeoutMs?: number
      ) => ipcRenderer.invoke('store:proxies:test', proxy, timeoutMs),
      testAll: (payload?: { query?: any; timeoutMs?: number; concurrency?: number }) =>
        ipcRenderer.invoke('store:proxies:testAll', payload)
    },
    profiles: {
      get: () => ipcRenderer.invoke('store:profiles:get'),
      add: (profile: any) => ipcRenderer.invoke('store:profiles:add', profile),
      update: (id: string, patch: any) => ipcRenderer.invoke('store:profiles:update', id, patch),
      remove: (id: string) => ipcRenderer.invoke('store:profiles:remove', id),
      bulkCreate: (payload: { count: number; prefix?: string }) =>
        ipcRenderer.invoke('store:profiles:bulkCreate', payload),
      quickCreateFromProxies: (payload?: {
        prefix?: string
        lifecyclePolicy?: 'one_time' | 'persistent'
      }) => ipcRenderer.invoke('store:profiles:quickCreateFromProxies', payload)
    },
    settings: {
      get: () => ipcRenderer.invoke('store:settings:get'),
      set: (key: string, value: string) => ipcRenderer.invoke('store:settings:set', key, value)
    }
  },
  system: {
    pickFile: (payload?: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }) =>
      ipcRenderer.invoke('system:pickFile', payload)
  },
  input: {
    source: {
      list: () => ipcRenderer.invoke('input:source:list'),
      create: (payload: any) => ipcRenderer.invoke('input:source:create', payload),
      update: (sourceId: string, patch: any) => ipcRenderer.invoke('input:source:update', sourceId, patch),
      delete: (sourceId: string) => ipcRenderer.invoke('input:source:delete', sourceId),
      preview: (sourceId: string, limit?: number) =>
        ipcRenderer.invoke('input:source:preview', sourceId, limit),
      import: (sourceId: string) => ipcRenderer.invoke('input:source:import', sourceId)
    },
    batch: {
      list: (sourceId?: string) => ipcRenderer.invoke('input:batch:list', sourceId),
      records: (batchId: string) => ipcRenderer.invoke('input:batch:records', batchId)
    }
  },
  template: {
    list: () => ipcRenderer.invoke('template:list'),
    create: (payload: any) => ipcRenderer.invoke('template:create', payload),
    update: (templateId: string, patch: any) => ipcRenderer.invoke('template:update', templateId, patch),
    delete: (templateId: string) => ipcRenderer.invoke('template:delete', templateId),
    validate: (templateJson: string) => ipcRenderer.invoke('template:validate', templateJson),
    scan: (url: string) => ipcRenderer.invoke('template:scan', url)
  },
  run: {
    list: () => ipcRenderer.invoke('run:list'),
    get: (runId: string) => ipcRenderer.invoke('run:get', runId),
    create: (payload: any) => ipcRenderer.invoke('run:create', payload),
    start: (runId: string) => ipcRenderer.invoke('run:start', runId),
    pause: (runId: string) => ipcRenderer.invoke('run:pause', runId),
    resume: (runId: string) => ipcRenderer.invoke('run:resume', runId),
    stop: (runId: string) => ipcRenderer.invoke('run:stop', runId),
    record: {
      list: (runId: string) => ipcRenderer.invoke('run:record:list', runId),
      retry: (runRecordId: string) => ipcRenderer.invoke('run:record:retry', runRecordId),
      manualTakeover: (runRecordId: string) =>
        ipcRenderer.invoke('run:record:manualTakeover', runRecordId),
      manualResume: (runRecordId: string) => ipcRenderer.invoke('run:record:manualResume', runRecordId),
      manualAbort: (runRecordId: string) => ipcRenderer.invoke('run:record:manualAbort', runRecordId)
    }
  },
  report: {
    export: (runId: string, format: 'csv' | 'xlsx') => ipcRenderer.invoke('report:export', runId, format)
  },
  runtime: {
    onLog: (callback: (entry: any) => void) => {
      const subscription = (_event: unknown, payload: unknown) => callback(payload)
      ipcRenderer.on('runtime:log', subscription)
      return () => ipcRenderer.removeListener('runtime:log', subscription)
    }
  },
  queue: {
    health: () => ipcRenderer.invoke('queue:health')
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('api', api)
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
