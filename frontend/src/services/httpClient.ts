/**
 * Thin fetch wrapper for the Phase 2 FastAPI backend.
 * Not used while VITE_DATA_MODE=mock. Kept here so the HTTP implementation of CivicApi
 * can be added without changing pages.
 */
import { env } from '@/config/env'
import { ApiError } from './errors'

type TokenProvider = () => Promise<string | null>
let getToken: TokenProvider = async () => null

export function setTokenProvider(fn: TokenProvider) {
  getToken = fn
}

export async function http<T>(path: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const token = await getToken()
  try {
    const res = await fetch(`${env.apiBaseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new ApiError(res.status, body.detail ?? res.statusText, body.field_errors)
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw new ApiError(408, 'The server took too long to respond.')
    throw err
  } finally {
    clearTimeout(timer)
  }
}
