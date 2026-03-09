export interface AdapterConfig {
  enabled: boolean
  endpoint: string
  timeoutMs: number
  authToken: string
  retryCount: number
}

export interface OAuthConfig {
  enabled: boolean
  clientId: string
  clientSecret: string
  redirectUri: string
  authUrl: string
  tokenUrl: string
  scopes: string[]
}

export interface ModelConfig {
  enabled: boolean
  baseUrl: string
  apiKey: string
}

export interface BotPackConfig {
  enabled: boolean
  defaultAdapter: string
  defaultOAuthProvider: string
  defaultModelProvider: string
  adapters: Record<string, AdapterConfig>
  oauthProviders: Record<string, OAuthConfig>
  modelProviders: Record<string, ModelConfig>
}

function boolEnv(key: string, fallback: boolean): boolean {
  const raw = String(process.env[key] ?? '').trim().toLowerCase()
  if (!raw) return fallback
  return ['1', 'true', 'yes', 'on'].includes(raw)
}

function intEnv(key: string, fallback: number): number {
  const n = Number(process.env[key] ?? fallback)
  return Number.isFinite(n) ? Math.max(1, Math.floor(n)) : fallback
}

export function loadBotPackConfig(): BotPackConfig {
  return {
    enabled: boolEnv('BUGFORGE_BOT_PACK_ENABLED', false),
    defaultAdapter: String(process.env.BUGFORGE_BOT_PACK_DEFAULT_ADAPTER ?? 'openclaw').trim(),
    defaultOAuthProvider: String(
      process.env.BUGFORGE_BOT_PACK_DEFAULT_OAUTH_PROVIDER ?? 'chatgpt'
    ).trim(),
    defaultModelProvider: String(
      process.env.BUGFORGE_BOT_PACK_DEFAULT_MODEL_PROVIDER ?? 'openai'
    ).trim(),
    adapters: {
      openclaw: {
        enabled: boolEnv('BUGFORGE_BOT_PACK_ADAPTER_OPENCLAW_ENABLED', true),
        endpoint: String(process.env.BUGFORGE_BOT_PACK_OPENCLAW_ENDPOINT ?? '').trim(),
        timeoutMs: intEnv('BUGFORGE_BOT_PACK_OPENCLAW_TIMEOUT_MS', 30000),
        authToken: String(process.env.BUGFORGE_BOT_PACK_OPENCLAW_AUTH_TOKEN ?? '').trim(),
        retryCount: intEnv('BUGFORGE_BOT_PACK_OPENCLAW_RETRY_COUNT', 1)
      },
      browser_use: {
        enabled: boolEnv('BUGFORGE_BOT_PACK_ADAPTER_BROWSER_USE_ENABLED', false),
        endpoint: String(process.env.BUGFORGE_BOT_PACK_BROWSER_USE_ENDPOINT ?? '').trim(),
        timeoutMs: intEnv('BUGFORGE_BOT_PACK_BROWSER_USE_TIMEOUT_MS', 30000),
        authToken: String(process.env.BUGFORGE_BOT_PACK_BROWSER_USE_AUTH_TOKEN ?? '').trim(),
        retryCount: intEnv('BUGFORGE_BOT_PACK_BROWSER_USE_RETRY_COUNT', 1)
      },
      skyvern: {
        enabled: boolEnv('BUGFORGE_BOT_PACK_ADAPTER_SKYVERN_ENABLED', false),
        endpoint: String(process.env.BUGFORGE_BOT_PACK_SKYVERN_ENDPOINT ?? '').trim(),
        timeoutMs: intEnv('BUGFORGE_BOT_PACK_SKYVERN_TIMEOUT_MS', 30000),
        authToken: String(process.env.BUGFORGE_BOT_PACK_SKYVERN_AUTH_TOKEN ?? '').trim(),
        retryCount: intEnv('BUGFORGE_BOT_PACK_SKYVERN_RETRY_COUNT', 1)
      }
    },
    oauthProviders: {
      chatgpt: {
        enabled: boolEnv('BUGFORGE_BOT_PACK_OAUTH_CHATGPT_ENABLED', true),
        clientId: String(process.env.BUGFORGE_BOT_PACK_OAUTH_CHATGPT_CLIENT_ID ?? '').trim(),
        clientSecret: String(
          process.env.BUGFORGE_BOT_PACK_OAUTH_CHATGPT_CLIENT_SECRET ?? ''
        ).trim(),
        redirectUri: String(
          process.env.BUGFORGE_BOT_PACK_OAUTH_CHATGPT_REDIRECT_URI ?? ''
        ).trim(),
        authUrl: String(process.env.BUGFORGE_BOT_PACK_OAUTH_CHATGPT_AUTH_URL ?? '').trim(),
        tokenUrl: String(process.env.BUGFORGE_BOT_PACK_OAUTH_CHATGPT_TOKEN_URL ?? '').trim(),
        scopes: String(process.env.BUGFORGE_BOT_PACK_OAUTH_CHATGPT_SCOPES ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      },
      codex: {
        enabled: boolEnv('BUGFORGE_BOT_PACK_OAUTH_CODEX_ENABLED', true),
        clientId: String(process.env.BUGFORGE_BOT_PACK_OAUTH_CODEX_CLIENT_ID ?? '').trim(),
        clientSecret: String(process.env.BUGFORGE_BOT_PACK_OAUTH_CODEX_CLIENT_SECRET ?? '').trim(),
        redirectUri: String(process.env.BUGFORGE_BOT_PACK_OAUTH_CODEX_REDIRECT_URI ?? '').trim(),
        authUrl: String(process.env.BUGFORGE_BOT_PACK_OAUTH_CODEX_AUTH_URL ?? '').trim(),
        tokenUrl: String(process.env.BUGFORGE_BOT_PACK_OAUTH_CODEX_TOKEN_URL ?? '').trim(),
        scopes: String(process.env.BUGFORGE_BOT_PACK_OAUTH_CODEX_SCOPES ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      }
    },
    modelProviders: {
      openai: {
        enabled: boolEnv('BUGFORGE_BOT_PACK_MODEL_OPENAI_ENABLED', true),
        baseUrl: String(process.env.BUGFORGE_BOT_PACK_MODEL_OPENAI_BASE_URL ?? 'https://api.openai.com/v1').trim(),
        apiKey: String(process.env.BUGFORGE_BOT_PACK_MODEL_OPENAI_API_KEY ?? '').trim()
      },
      anthropic: {
        enabled: boolEnv('BUGFORGE_BOT_PACK_MODEL_ANTHROPIC_ENABLED', false),
        baseUrl: String(
          process.env.BUGFORGE_BOT_PACK_MODEL_ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com'
        ).trim(),
        apiKey: String(process.env.BUGFORGE_BOT_PACK_MODEL_ANTHROPIC_API_KEY ?? '').trim()
      },
      openrouter: {
        enabled: boolEnv('BUGFORGE_BOT_PACK_MODEL_OPENROUTER_ENABLED', false),
        baseUrl: String(
          process.env.BUGFORGE_BOT_PACK_MODEL_OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1'
        ).trim(),
        apiKey: String(process.env.BUGFORGE_BOT_PACK_MODEL_OPENROUTER_API_KEY ?? '').trim()
      }
    }
  }
}
