import { ipcMain } from 'electron'
import { BotPackManager } from './BotPackManager'
import { BotPackTaskRequest } from './contracts'

export function registerBotPackIpcHandlers(manager: BotPackManager) {
  ipcMain.handle('botPack:health', async () => manager.health())
  ipcMain.handle('botPack:setEnabled', async (_event, enabled: boolean) => manager.setEnabled(enabled))

  ipcMain.handle('botPack:providers', async () => manager.listProviders())

  ipcMain.handle('botPack:dispatch', async (_event, request: BotPackTaskRequest) => {
    try {
      return await manager.dispatch(request ?? { task: '' })
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) }
    }
  })

  ipcMain.handle(
    'botPack:oauthBegin',
    async (
      _event,
      adapterKey: string,
      providerKey: string,
      options?: { scopes?: string[]; openExternal?: boolean }
    ) => {
      try {
        return await manager.oauthBegin(adapterKey, providerKey, options)
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) }
      }
    }
  )

  ipcMain.handle(
    'botPack:oauthComplete',
    async (
      _event,
      adapterKey: string,
      providerKey: string,
      payload: { code: string; state: string }
    ) => {
      try {
        return await manager.oauthComplete(adapterKey, providerKey, payload)
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) }
      }
    }
  )

  ipcMain.handle('botPack:oauthStatus', async (_event, adapterKey: string, providerKey: string) => {
    try {
      return await manager.oauthStatus(adapterKey, providerKey)
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) }
    }
  })

  ipcMain.handle('botPack:oauthDisconnect', async (_event, adapterKey: string, providerKey: string) => {
    try {
      return await manager.oauthDisconnect(adapterKey, providerKey)
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) }
    }
  })

  ipcMain.handle('botPack:quickIntegrate', async (_event, adapterKey: string, providerKey: string) => {
    try {
      return await manager.quickIntegrate(adapterKey, providerKey)
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) }
    }
  })
}
