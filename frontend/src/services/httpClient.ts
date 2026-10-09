/**
 * Fetch wrapper for the FastAPI backend (API mode).
 *  • Adds the Supabase access token.
 *  • Free hosting sleeps when idle and restarts during deploys, so read requests are retried on network
 *    failures and the timeout allows for a cold start. Writes are never retried automatically (no duplicates).
 *  • A 401 on an authenticated request means the session ended — the auth layer is told so it can sign out
 *    locally and send the user back to the right login page.
 */
import { env } from '@/config/env'
import { ApiError } from './errors'

type TokenProvider = () => Promise<string | null>
let getToken: TokenProvider = async () => null
let onUnauthorized: (() => void) | null = null

export function setTokenProvider(fn: TokenProvider) {
  getToken = fn
}

export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn
}

const OFFLINE_MESSAGE = 'Can’t reach the CIVICVISION server right now. It may be waking up or updating — please try again in a minute.'
const RETRY_DELAYS = [1500, 4000, 8000]
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function http<T>(path: string, init: RequestInit = {}, timeoutMs = 60_000): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const retryable = method === 'GET' || method === 'HEAD'
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const token = await getToken()
    let res: Response
    try {
      res = await fetch(`${env.apiBaseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init.headers,
        },
      })
    } catch (err) {
      clearTimeout(timer)
      const timedOut = err instanceof DOMException && err.name === 'AbortError'
      if (retryable && attempt < RETRY_DELAYS.length && !timedOut) {
        await sleep(RETRY_DELAYS[attempt])
        continue
      }
      throw new ApiError(timedOut ? 408 : 0, timedOut ? 'The server took too long to respond. Please try again.' : OFFLINE_MESSAGE)
    }
    clearTimeout(timer)
    if (!res.ok) {
      // 502/503/504 come from the hosting proxy while the server restarts — retry reads.
      if (retryable && [502, 503, 504].includes(res.status) && attempt < RETRY_DELAYS.length) {
        await sleep(RETRY_DELAYS[attempt])
        continue
      }
      const body = await res.json().catch(() => ({}))
      if (res.status === 401 && token) onUnauthorized?.()
      throw new ApiError(res.status, body.detail ?? (res.status >= 500 ? OFFLINE_MESSAGE : res.statusText), body.field_errors)
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
  }
}
