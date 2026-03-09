export interface BotPackTaskRequest {
  task: string
  context?: Record<string, unknown>
  adapterKey?: string
  modelProviderKey?: string
  oauthProviderKey?: string
  dryRun?: boolean
}

export interface BotAdapter {
  key: string
  enabled: boolean
  endpoint?: string
  health(): Record<string, unknown>
  dispatch(request: BotPackTaskRequest): Promise<Record<string, unknown>>
  oauthBegin(
    providerKey: string,
    options?: { scopes?: string[]; openExternal?: boolean }
  ): Promise<Record<string, unknown>>
  oauthComplete(providerKey: string, payload: { code: string; state: string }): Promise<Record<string, unknown>>
  oauthStatus(providerKey: string): Promise<Record<string, unknown>>
  oauthDisconnect(providerKey: string): Promise<Record<string, unknown>>
}

export interface OAuthProvider {
  key: string
  enabled: boolean
  descriptor(): Record<string, unknown>
}

export interface ModelProvider {
  key: string
  enabled: boolean
  descriptor(): Record<string, unknown>
}
