import { isMockMode } from '@/config/env'
import { httpApi } from './http/httpApi'
import { mockApi } from './mock/mockApi'
import type { CivicApi } from './types'

/** The single entry point pages use for data: in-browser demo data, or the FastAPI backend. */
export const api: CivicApi = isMockMode ? mockApi : httpApi

export * from './types'
export { ApiError, errorMessage } from './errors'
