import { Bell, CheckCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { isMockMode } from '@/config/env'
import { useNavigate } from 'react-router'
import { useCurrentUser } from '@/context/AuthContext'
import { useApi } from '@/hooks/useApi'
import { cn } from '@/lib/cn'
import { formatRelative } from '@/lib/format'
import { api } from '@/services'

export function NotificationBell() {
  const user = useCurrentUser()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { data = [], reload } = useApi(() => api.notifications.list(user), [user.id])

  // API mode: poll for new in-app notifications (no push channel exists).
  useEffect(() => {
    if (isMockMode) return
    const t = setInterval(reload, 60_000)
    return () => clearInterval(t)
  }, [reload])
  const unread = data.filter((n) => !n.read).length

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        className="relative rounded-lg p-2 text-ink-soft hover:bg-slate-100 hover:text-ink"
      >
        <Bell className="size-5" />
        {unread > 0 && <span className="absolute top-1 right-1 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] leading-4 font-semibold text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-[1200] mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline" onClick={() => void api.notifications.markRead(user, 'all')}>
                <CheckCheck className="size-3.5" aria-hidden />
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {data.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-muted">You're all caught up.</li>}
            {data.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    void api.notifications.markRead(user, [n.id])
                    setOpen(false)
                    if (n.link) navigate(n.link)
                  }}
                  className={cn('flex w-full gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-canvas', !n.read && 'bg-brand-50/40')}
                >
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-brand-600')} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{n.title}</span>
                    <span className="line-clamp-2 block text-xs text-ink-soft">{n.body}</span>
                    <span className="mt-0.5 block text-[11px] text-ink-muted">{formatRelative(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="border-t border-line bg-canvas px-4 py-2 text-[11px] text-ink-muted">In-app notifications only. No email, SMS or push messages are sent in demo mode.</p>
        </div>
      )}
    </div>
  )
}
