/**
 * Global "data changed" signal. Queries (useApi) re-run when the version changes.
 * The mock store bumps it on every mutation; the HTTP client bumps it after successful writes.
 */
let version = 0
const listeners = new Set<() => void>()

export function getDataVersion(): number {
  return version
}

export function subscribeData(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function bumpData(): void {
  version++
  listeners.forEach((l) => l())
}
