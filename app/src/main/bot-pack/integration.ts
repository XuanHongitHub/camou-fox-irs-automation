import { shell } from 'electron'
import { spawn } from 'child_process'

function mapOpenClawProvider(providerKey: string): string {
  const key = String(providerKey || '').trim().toLowerCase()
  if (key === 'chatgpt' || key === 'codex' || key === 'openai-codex') return 'openai-codex'
  return key || 'openai-codex'
}

function openTerminalWithCommand(command: string): { success: boolean; message: string } {
  const cmd = String(command || '').trim()
  if (!cmd) return { success: false, message: 'Missing command.' }

  try {
    if (process.platform === 'win32') {
      spawn('cmd.exe', ['/c', 'start', '"BugForge Bot Integrate"', 'cmd.exe', '/k', cmd], {
        detached: true,
        stdio: 'ignore'
      }).unref()
      return { success: true, message: `Opened terminal with command: ${cmd}` }
    }

    if (process.platform === 'darwin') {
      const escaped = cmd.replace(/"/g, '\\"')
      spawn(
        'osascript',
        [
          '-e',
          `tell application "Terminal" to do script "${escaped}"`,
          '-e',
          'tell application "Terminal" to activate'
        ],
        { detached: true, stdio: 'ignore' }
      ).unref()
      return { success: true, message: `Opened Terminal with command: ${cmd}` }
    }

    // Linux fallback: try xdg-open docs when no universal terminal launcher is guaranteed.
    return { success: false, message: `No terminal launcher available. Run manually: ${cmd}` }
  } catch (err: any) {
    return { success: false, message: err?.message || String(err) }
  }
}

export async function quickIntegrateAdapterOAuth(
  adapterKey: string,
  oauthProviderKey: string
): Promise<Record<string, unknown>> {
  const adapter = String(adapterKey || '').trim().toLowerCase()
  const provider = String(oauthProviderKey || '').trim().toLowerCase()

  if (adapter === 'openclaw') {
    const mapped = mapOpenClawProvider(provider)
    const command = `openclaw models auth login --provider ${mapped}`
    const launched = openTerminalWithCommand(command)
    return {
      success: launched.success,
      adapter,
      oauthProvider: provider,
      mode: 'cli',
      command,
      message: launched.message
    }
  }

  if (adapter === 'browser_use') {
    const url = 'https://docs.browser-use.com/customize/mcp-server'
    await shell.openExternal(url)
    return {
      success: true,
      adapter,
      oauthProvider: provider,
      mode: 'docs',
      url,
      message: 'Opened Browser Use MCP/Auth documentation.'
    }
  }

  if (adapter === 'skyvern') {
    const url = 'https://docs.skyvern.com/'
    await shell.openExternal(url)
    return {
      success: true,
      adapter,
      oauthProvider: provider,
      mode: 'docs',
      url,
      message: 'Opened Skyvern documentation.'
    }
  }

  return {
    success: false,
    adapter,
    oauthProvider: provider,
    message: `Quick integrate is not defined for adapter [${adapter}].`
  }
}
