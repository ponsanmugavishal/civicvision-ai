import { useEffect, useSyncExternalStore } from 'react'
import { env, isMockMode } from '@/config/env'
import { supabase } from '@/lib/supabase'
import { bumpData } from '@/services/dataEvents'

/**
 * Live updates (API mode).
 *  • Supabase Realtime broadcast channel: the backend publishes a tiny "changed" event (ids only) after every write.
 *  • Supabase Realtime postgres_changes on the user's own notifications (RLS-filtered) — catches database-side
 *    escalations created by the scheduled SLA check.
 *  • Fallback: refresh every 30 s while the tab is visible (90 s when Realtime is connected).
 * Every signal just bumps the data version; open queries refetch through the normal authorised API.
 */
type LiveStatus = 'off' | 'polling' | 'live'
let status: LiveStatus = 'off'
const listeners = new Set<() => void>()
const setStatus = (s: LiveStatus) => {
  status = s
  listeners.forEach((l) => l())
}

export function useLiveStatus(): LiveStatus {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => status,
  )
}

let timer: ReturnType<typeof setTimeout> | null = null
function refreshSoon() {
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    bumpData()
  }, 400)
}

export function useLiveUpdates(userId: string | null) {
  useEffect(() => {
    if (isMockMode) return
    let connected = false
    setStatus('polling')
    const channels: { unsubscribe: () => unknown }[] = []
    if (supabase) {
      const broadcast = supabase
        .channel(env.realtimeChannel)
        .on('broadcast', { event: 'changed' }, refreshSoon)
        .subscribe((s) => {
          connected = s === 'SUBSCRIBED'
          setStatus(connected ? 'live' : 'polling')
        })
      channels.push(broadcast)
      if (userId) {
        channels.push(
          supabase
            .channel(`notifications:${userId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, refreshSoon)
            .subscribe(),
        )
      }
    }
    let last = Date.now()
    const poll = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - last >= (connected ? 90_000 : 30_000)) {
        last = Date.now()
        bumpData()
      }
    }, 5_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshSoon()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      channels.forEach((c) => void c.unsubscribe())
      setStatus('off')
    }
  }, [userId])
}
