import { loadBotPackConfig } from './config'
import { BotAdapter, BotPackTaskRequest, ModelProvider, OAuthProvider } from './contracts'
import { BrowserUseAdapter, OpenClawAdapter, SkyvernAdapter } from './adapters'
import {
  AnthropicModelProvider,
  ChatGptOAuthProvider,
  CodexOAuthProvider,
  OpenAiModelProvider,
  OpenRouterModelProvider
} from './providers'
import { quickIntegrateAdapterOAuth } from './integration'

export class BotPackManager {
  private config = loadBotPackConfig()
  private readonly adapters: Map<string, BotAdapter>
  private readonly oauthProviders: Map<string, OAuthProvider>
  private readonly modelProviders: Map<string, ModelProvider>

  constructor() {
    this.adapters = new Map<string, BotAdapter>([
      ['openclaw', new OpenClawAdapter(this.config.adapters.openclaw)],
      ['browser_use', new BrowserUseAdapter(this.config.adapters.browser_use)],
      ['skyvern', new SkyvernAdapter(this.config.adapters.skyvern)]
    ])

    this.oauthProviders = new Map<string, OAuthProvider>([
      ['chatgpt', new ChatGptOAuthProvider(this.config.oauthProviders.chatgpt)],
      ['codex', new CodexOAuthProvider(this.config.oauthProviders.codex)]
    ])

    this.modelProviders = new Map<string, ModelProvider>([
      ['openai', new OpenAiModelProvider(this.config.modelProviders.openai)],
      ['anthropic', new AnthropicModelProvider(this.config.modelProviders.anthropic)],
      ['openrouter', new OpenRouterModelProvider(this.config.modelProviders.openrouter)]
    ])
  }

  isEnabled(): boolean {
    return this.config.enabled
  }

  setEnabled(enabled: boolean) {
    const next = Boolean(enabled)
    this.config.enabled = next
    process.env.BUGFORGE_BOT_PACK_ENABLED = next ? '1' : '0'
    return this.health()
  }

  health() {
    return {
      success: true,
      enabled: this.config.enabled,
      defaults: {
        adapter: this.config.defaultAdapter,
        oauthProvider: this.config.defaultOAuthProvider,
        modelProvider: this.config.defaultModelProvider
      }
    }
  }

  async listProviders() {
    return {
      success: true,
      enabled: this.config.enabled,
      adapters: Array.from(this.adapters.values()).map((a) => a.health()),
      oauthProviders: Array.from(this.oauthProviders.values()).map((p) => p.descriptor()),
      modelProviders: Array.from(this.modelProviders.values()).map((p) => p.descriptor())
    }
  }

  private resolveAdapter(adapterKeyRaw: string): BotAdapter | null {
    const adapterKey = String(adapterKeyRaw || this.config.defaultAdapter).trim()
    return this.adapters.get(adapterKey) || null
  }

  async oauthBegin(
    adapterKey: string,
    providerKey: string,
    options?: { scopes?: string[]; openExternal?: boolean }
  ) {
    if (!this.config.enabled) {
      return {
        success: false,
        enabled: false,
        error: 'Bot Pack is disabled. Set BUGFORGE_BOT_PACK_ENABLED=1 to enable.'
      }
    }
    const adapter = this.resolveAdapter(adapterKey)
    const oauth = this.oauthProviders.get(String(providerKey || '').trim())
    if (!adapter) return { success: false, error: `Unknown adapter [${adapterKey}]` }
    if (!oauth) return { success: false, error: `Unknown oauth provider [${providerKey}]` }
    if (!adapter.enabled) return { success: false, error: `Adapter [${adapter.key}] is disabled.` }
    if (!oauth.enabled) return { success: false, error: `OAuth provider [${oauth.key}] is disabled.` }
    return adapter.oauthBegin(oauth.key, options)
  }

  async oauthComplete(
    adapterKey: string,
    providerKey: string,
    payload: { code: string; state: string }
  ) {
    if (!this.config.enabled) {
      return {
        success: false,
        enabled: false,
        error: 'Bot Pack is disabled. Set BUGFORGE_BOT_PACK_ENABLED=1 to enable.'
      }
    }
    const adapter = this.resolveAdapter(adapterKey)
    const oauth = this.oauthProviders.get(String(providerKey || '').trim())
    if (!adapter) return { success: false, error: `Unknown adapter [${adapterKey}]` }
    if (!oauth) return { success: false, error: `Unknown oauth provider [${providerKey}]` }
    if (!adapter.enabled) return { success: false, error: `Adapter [${adapter.key}] is disabled.` }
    if (!oauth.enabled) return { success: false, error: `OAuth provider [${oauth.key}] is disabled.` }
    return adapter.oauthComplete(oauth.key, payload)
  }

  async oauthStatus(adapterKey: string, providerKey: string) {
    if (!this.config.enabled) {
      return {
        success: false,
        enabled: false,
        error: 'Bot Pack is disabled. Set BUGFORGE_BOT_PACK_ENABLED=1 to enable.'
      }
    }
    const adapter = this.resolveAdapter(adapterKey)
    const oauth = this.oauthProviders.get(String(providerKey || '').trim())
    if (!adapter) return { success: false, error: `Unknown adapter [${adapterKey}]` }
    if (!oauth) return { success: false, error: `Unknown oauth provider [${providerKey}]` }
    if (!adapter.enabled) return { success: false, error: `Adapter [${adapter.key}] is disabled.` }
    if (!oauth.enabled) return { success: false, error: `OAuth provider [${oauth.key}] is disabled.` }
    return adapter.oauthStatus(oauth.key)
  }

  async oauthDisconnect(adapterKey: string, providerKey: string) {
    if (!this.config.enabled) {
      return {
        success: false,
        enabled: false,
        error: 'Bot Pack is disabled. Set BUGFORGE_BOT_PACK_ENABLED=1 to enable.'
      }
    }
    const adapter = this.resolveAdapter(adapterKey)
    const oauth = this.oauthProviders.get(String(providerKey || '').trim())
    if (!adapter) return { success: false, error: `Unknown adapter [${adapterKey}]` }
    if (!oauth) return { success: false, error: `Unknown oauth provider [${providerKey}]` }
    if (!adapter.enabled) return { success: false, error: `Adapter [${adapter.key}] is disabled.` }
    if (!oauth.enabled) return { success: false, error: `OAuth provider [${oauth.key}] is disabled.` }
    return adapter.oauthDisconnect(oauth.key)
  }

  async quickIntegrate(adapterKey: string, providerKey: string) {
    const adapter = this.resolveAdapter(adapterKey)
    const oauth = this.oauthProviders.get(String(providerKey || '').trim())
    if (!adapter) return { success: false, error: `Unknown adapter [${adapterKey}]` }
    if (!oauth) return { success: false, error: `Unknown oauth provider [${providerKey}]` }
    return quickIntegrateAdapterOAuth(adapter.key, oauth.key)
  }

  async dispatch(request: BotPackTaskRequest) {
    if (!this.config.enabled) {
      return {
        success: false,
        enabled: false,
        error: 'Bot Pack is disabled. Set BUGFORGE_BOT_PACK_ENABLED=1 to enable.'
      }
    }

    const task = String(request.task || '').trim()
    if (!task) {
      return { success: false, error: 'Task is required.' }
    }

    const adapterKey = String(request.adapterKey || this.config.defaultAdapter).trim()
    const oauthProviderKey = String(request.oauthProviderKey || this.config.defaultOAuthProvider).trim()
    const modelProviderKey = String(request.modelProviderKey || this.config.defaultModelProvider).trim()

    const adapter = this.adapters.get(adapterKey)
    const oauth = this.oauthProviders.get(oauthProviderKey)
    const model = this.modelProviders.get(modelProviderKey)

    if (!adapter) return { success: false, error: `Unknown adapter [${adapterKey}].` }
    if (!oauth) return { success: false, error: `Unknown oauth provider [${oauthProviderKey}].` }
    if (!model) return { success: false, error: `Unknown model provider [${modelProviderKey}].` }
    if (!adapter.enabled) return { success: false, error: `Adapter [${adapterKey}] is disabled.` }
    if (!oauth.enabled) return { success: false, error: `OAuth provider [${oauthProviderKey}] is disabled.` }
    if (!model.enabled) return { success: false, error: `Model provider [${modelProviderKey}] is disabled.` }

    const dispatchPayload: BotPackTaskRequest = {
      ...request,
      task,
      adapterKey,
      oauthProviderKey,
      modelProviderKey,
      dryRun: request.dryRun !== false
    }
    const result = await adapter.dispatch(dispatchPayload)

    return {
      success: true,
      enabled: true,
      adapter: adapterKey,
      oauthProvider: oauthProviderKey,
      modelProvider: modelProviderKey,
      dispatch: result
    }
  }
}
