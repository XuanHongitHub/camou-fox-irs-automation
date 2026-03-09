import { ModelConfig, OAuthConfig } from './config'
import { ModelProvider, OAuthProvider } from './contracts'

abstract class BaseOAuthProvider implements OAuthProvider {
  public readonly key: string
  public readonly enabled: boolean
  protected readonly clientId: string
  protected readonly clientSecret: string
  protected readonly redirectUri: string

  constructor(key: string, config: OAuthConfig) {
    this.key = key
    this.enabled = Boolean(config.enabled)
    this.clientId = String(config.clientId || '').trim()
    this.clientSecret = String(config.clientSecret || '').trim()
    this.redirectUri = String(config.redirectUri || '').trim()
  }

  descriptor(): Record<string, unknown> {
    return {
      key: this.key,
      enabled: this.enabled,
      configured: this.enabled,
      mode: 'adapter-managed'
    }
  }
}

abstract class BaseModelProvider implements ModelProvider {
  public readonly key: string
  public readonly enabled: boolean
  protected readonly baseUrl: string
  protected readonly apiKey: string

  constructor(key: string, config: ModelConfig) {
    this.key = key
    this.enabled = Boolean(config.enabled)
    this.baseUrl = String(config.baseUrl || '').trim()
    this.apiKey = String(config.apiKey || '').trim()
  }

  descriptor(): Record<string, unknown> {
    return {
      key: this.key,
      enabled: this.enabled,
      configured: Boolean(this.apiKey),
      baseUrl: this.baseUrl
    }
  }
}

export class ChatGptOAuthProvider extends BaseOAuthProvider {
  constructor(config: OAuthConfig) {
    super('chatgpt', config)
  }
}

export class CodexOAuthProvider extends BaseOAuthProvider {
  constructor(config: OAuthConfig) {
    super('codex', config)
  }
}

export class OpenAiModelProvider extends BaseModelProvider {
  constructor(config: ModelConfig) {
    super('openai', config)
  }
}

export class AnthropicModelProvider extends BaseModelProvider {
  constructor(config: ModelConfig) {
    super('anthropic', config)
  }
}

export class OpenRouterModelProvider extends BaseModelProvider {
  constructor(config: ModelConfig) {
    super('openrouter', config)
  }
}
