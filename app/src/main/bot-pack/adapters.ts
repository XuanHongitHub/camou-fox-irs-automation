import { BotAdapter, BotPackTaskRequest } from './contracts'
import { AdapterConfig } from './config'
import { postJsonWithRetry } from './http'

abstract class BaseAdapter implements BotAdapter {
  public readonly key: string
  public readonly enabled: boolean
  public readonly endpoint: string
  protected readonly timeoutMs: number
  protected readonly authToken: string
  protected readonly retryCount: number

  constructor(key: string, config: AdapterConfig) {
    this.key = key
    this.enabled = Boolean(config.enabled)
    this.endpoint = String(config.endpoint || '').trim()
    this.timeoutMs = Math.max(1000, Number(config.timeoutMs || 30000))
    this.authToken = String(config.authToken || '').trim()
    this.retryCount = Math.max(0, Math.floor(Number(config.retryCount || 0)))
  }

  health(): Record<string, unknown> {
    return {
      key: this.key,
      enabled: this.enabled,
      endpoint: this.endpoint,
      timeoutMs: this.timeoutMs,
      retryCount: this.retryCount,
      hasAuthToken: Boolean(this.authToken)
    }
  }

  async dispatch(request: BotPackTaskRequest): Promise<Record<string, unknown>> {
    if (!this.endpoint) {
      return {
        adapter: this.key,
        accepted: false,
        error: `Adapter [${this.key}] endpoint is not configured.`
      }
    }

    const payload: Record<string, unknown> = {
      task: request.task,
      context: request.context ?? {},
      adapterKey: request.adapterKey,
      modelProviderKey: request.modelProviderKey,
      oauthProviderKey: request.oauthProviderKey,
      dryRun: request.dryRun !== false,
      source: 'bug-forge-bot-pack',
      timestamp: new Date().toISOString()
    }

    try {
      const response = await postJsonWithRetry(this.endpoint, payload, {
        timeoutMs: this.timeoutMs,
        retryCount: this.retryCount,
        authToken: this.authToken
      })
      return {
        adapter: this.key,
        accepted: response.ok,
        status: response.status,
        response: response.data
      }
    } catch (err: any) {
      return {
        adapter: this.key,
        accepted: false,
        error: err?.message || String(err)
      }
    }
  }

  protected endpointFor(suffix: string): string {
    const base = this.endpoint.replace(/\/+$/, '')
    const tail = String(suffix || '').replace(/^\/+/, '')
    return `${base}/${tail}`
  }

  protected async postAdapterJson(
    path: string,
    payload: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!this.endpoint) {
      return {
        success: false,
        adapter: this.key,
        error: `Adapter [${this.key}] endpoint is not configured.`
      }
    }
    try {
      const response = await postJsonWithRetry(this.endpointFor(path), payload, {
        timeoutMs: this.timeoutMs,
        retryCount: this.retryCount,
        authToken: this.authToken
      })
      return {
        success: response.ok,
        adapter: this.key,
        status: response.status,
        ...(response.data && typeof response.data === 'object'
          ? (response.data as Record<string, unknown>)
          : { data: response.data })
      }
    } catch (err: any) {
      return {
        success: false,
        adapter: this.key,
        error: err?.message || String(err)
      }
    }
  }

  async oauthBegin(
    providerKey: string,
    options?: { scopes?: string[]; openExternal?: boolean }
  ): Promise<Record<string, unknown>> {
    return this.postAdapterJson('oauth/begin', {
      providerKey,
      scopes: options?.scopes || [],
      openExternal: Boolean(options?.openExternal)
    })
  }

  async oauthComplete(
    providerKey: string,
    payload: { code: string; state: string }
  ): Promise<Record<string, unknown>> {
    return this.postAdapterJson('oauth/complete', {
      providerKey,
      code: String(payload?.code || ''),
      state: String(payload?.state || '')
    })
  }

  async oauthStatus(providerKey: string): Promise<Record<string, unknown>> {
    return this.postAdapterJson('oauth/status', { providerKey })
  }

  async oauthDisconnect(providerKey: string): Promise<Record<string, unknown>> {
    return this.postAdapterJson('oauth/disconnect', { providerKey })
  }
}

export class OpenClawAdapter extends BaseAdapter {
  constructor(config: AdapterConfig) {
    super('openclaw', config)
  }
}

export class BrowserUseAdapter extends BaseAdapter {
  constructor(config: AdapterConfig) {
    super('browser_use', config)
  }
}

export class SkyvernAdapter extends BaseAdapter {
  constructor(config: AdapterConfig) {
    super('skyvern', config)
  }
}
