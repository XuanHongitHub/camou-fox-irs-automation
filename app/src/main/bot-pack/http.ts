function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function postJsonWithRetry(
  url: string,
  body: Record<string, unknown>,
  options: {
    timeoutMs: number
    retryCount: number
    authToken?: string
    headers?: Record<string, string>
  }
) {
  const retryCount = Math.max(0, Math.floor(options.retryCount || 0))
  const timeoutMs = Math.max(1000, Math.floor(options.timeoutMs || 30000))
  const token = String(options.authToken || '').trim()
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(options.headers || {})
  }
  if (token) headers.authorization = `Bearer ${token}`

  let lastError: unknown
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      })
      clearTimeout(timeout)

      const text = await response.text()
      let parsed: unknown = text
      try {
        parsed = text ? JSON.parse(text) : {}
      } catch {
        // keep text payload
      }

      if (response.status >= 500 || response.status === 429) {
        if (attempt < retryCount) {
          await sleep(200 * (attempt + 1))
          continue
        }
      }

      return {
        ok: response.ok,
        status: response.status,
        data: parsed
      }
    } catch (err) {
      clearTimeout(timeout)
      lastError = err
      if (attempt < retryCount) {
        await sleep(200 * (attempt + 1))
        continue
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}
