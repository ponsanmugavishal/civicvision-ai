import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { getDataVersion, subscribeData } from '@/services/dataEvents'
import { errorMessage } from '@/services'

export interface AsyncState<T> {
  data: T | undefined
  error: string | null
  loading: boolean
  /** True only while no data has loaded yet. */
  initialLoading: boolean
  reload: () => void
}

/** Reactive version counter of the demo store; queries refetch when data changes. */
export function useDataVersion(): number {
  return useSyncExternalStore(subscribeData, getDataVersion)
}

/**
 * Runs an async query and re-runs it when deps change or demo data is mutated.
 * Stale responses from earlier calls are discarded.
 */
export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const version = useDataVersion()
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const callId = useRef(0)

  useEffect(() => {
    const id = ++callId.current
    setLoading(true)
    fetcher()
      .then((d) => {
        if (id !== callId.current) return
        setData(d)
        setError(null)
      })
      .catch((e: unknown) => {
        if (id !== callId.current) return
        setError(errorMessage(e))
      })
      .finally(() => {
        if (id === callId.current) setLoading(false)
      })
  }, [...deps, version, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, initialLoading: loading && data === undefined, reload }
}

type Success<R> = [R] extends [void] ? true : R

/**
 * Wraps a mutation with pending/error state. `run` resolves to the result (or `true` for void
 * mutations) on success, and `undefined` on failure — so callers can simply check truthiness.
 */
export function useMutation<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const run = useCallback(
    async (...args: A): Promise<Success<R> | undefined> => {
      setPending(true)
      setError(null)
      setFieldErrors({})
      try {
        const result = await fn(...args)
        return (result === undefined ? true : result) as Success<R>
      } catch (e) {
        setError(errorMessage(e))
        const fe = (e as { fieldErrors?: Record<string, string> }).fieldErrors
        if (fe) setFieldErrors(fe)
        return undefined
      } finally {
        setPending(false)
      }
    },
    [fn],
  )

  const reset = useCallback(() => {
    setError(null)
    setFieldErrors({})
  }, [])

  return { run, pending, error, fieldErrors, reset }
}
