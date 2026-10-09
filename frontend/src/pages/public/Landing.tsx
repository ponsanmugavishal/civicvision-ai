import {
  ArrowRight,
  BellRing,
  Building2,
  Camera,
  CheckCircle2,
  Eye,
  FileSearch,
  Landmark,
  Layers,
  MapPinned,
  Route,
  ShieldCheck,
  Sparkles,
  TimerReset,
  Users,
} from 'lucide-react'
import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { CategoryIcon } from '@/components/report/Badges'
import { DemoTag } from '@/components/ui/Badge'
import { ButtonLink } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Feedback'
import { useAuth } from '@/context/AuthContext'
import { useApi } from '@/hooks/useApi'
import { CATEGORY_META } from '@/lib/domain'
import { api } from '@/services'
import type { IssueCategory } from '@/types'

const MAIN_CATEGORIES: IssueCategory[] = ['garbage', 'drainage', 'pothole']

const CATEGORY_DETAIL: Record<string, string[]> = {
  garbage: ['Overflowing community bins', 'Illegal dumping on plots and canal banks', 'Missed collection points'],
  drainage: ['Blocked or silted drains', 'Sewage and manhole overflow', 'Waterlogging after rain'],
  pothole: ['Potholes and cave-ins', 'Unrestored trench cuts', 'Broken road edges and speed breakers'],
}

export default function Landing() {
  const { user } = useAuth()
  const location = useLocation()
  const { data: stats } = useApi(() => api.analytics.summary(null), [])
  const reportHref = user?.role === 'citizen' ? '/citizen/report/new' : '/login?next=/citizen/report/new'

  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
  }, [location.hash])

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line bg-surface">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,var(--color-brand-50),transparent_55%)]" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800">
              <MapPinned className="size-3.5" aria-hidden />
              Map-first civic accountability
            </p>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-ink sm:text-5xl">
              CIVICVISION <span className="text-brand-700">AI</span>
            </h1>
            <p className="mt-3 text-xl font-medium text-ink-soft sm:text-2xl">From Citizen Reports to Intelligent Civic Action.</p>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-soft">
              Report garbage, drainage and road problems on one shared map. Every complaint gets a public ID, a responsible department, response deadlines and a visible
              history — so residents can see what happened, and supervisors can step in when work slips.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink to={reportHref} size="lg" icon={<Camera className="size-5" />}>
                Report an issue
              </ButtonLink>
              <ButtonLink to="/map" size="lg" variant="secondary" icon={<MapPinned className="size-5" />}>
                Explore civic map
              </ButtonLink>
            </div>
            <p className="mt-4 text-xs text-ink-muted">Independent hackathon prototype. Not affiliated with any government body.</p>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-5 shadow-pop">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">Live snapshot</p>
              <DemoTag />
            </div>
            <p className="mt-0.5 text-xs text-ink-muted">Computed from the sample dataset bundled with this demo.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                { label: 'Complaints on map', value: stats?.total, tone: 'text-ink' },
                { label: 'Resolved with evidence', value: stats?.resolved, tone: 'text-green-700' },
                { label: 'Due soon', value: stats?.approaching, tone: 'text-orange-600' },
                { label: 'Overdue & escalated', value: stats?.overdue, tone: 'text-red-600' },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-line bg-canvas/60 p-3">
                  <p className="text-xs text-ink-muted">{s.label}</p>
                  {s.value === undefined ? <Skeleton className="mt-1 h-7 w-12" /> : <p className={`mt-0.5 text-2xl font-semibold tabular-nums ${s.tone}`}>{s.value}</p>}
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              {MAIN_CATEGORIES.map((c) => {
                const n = stats?.byCategory[c] ?? 0
                const pct = stats?.total ? Math.round((n / stats.total) * 100) : 0
                return (
                  <div key={c} className="flex items-center gap-3 text-sm">
                    <CategoryIcon category={c} />
                    <span className="w-20 text-ink-soft">{CATEGORY_META[c].short}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: CATEGORY_META[c].color }} />
                    </span>
                    <span className="w-8 text-right text-ink-muted tabular-nums">{stats ? n : '–'}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">The problem: complaints disappear</h2>
          <p className="mt-3 text-ink-soft">
            Everyday civic issues are reported through scattered phone lines, social posts and paper forms. Residents rarely learn what happened, the same spot gets reported again and
            again, and nobody can see which problems are overdue.
          </p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            { icon: Layers, title: 'Fragmented channels', body: 'Reports are split across departments and formats, so duplicates pile up and context is lost.' },
            { icon: Eye, title: 'No visibility', body: 'Citizens can’t track progress or see proof that work was actually done.' },
            { icon: TimerReset, title: 'No accountability', body: 'Without deadlines and escalation, delayed complaints quietly fall through the cracks.' },
          ].map((p) => (
            <div key={p.title} className="rounded-xl border border-line bg-surface p-5 shadow-card">
              <p.icon className="size-6 text-brand-700" aria-hidden />
              <h3 className="mt-3 font-semibold">{p.title}</h3>
              <p className="mt-1 text-sm text-ink-soft">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Three issue types, one map</h2>
          <p className="mt-3 max-w-2xl text-ink-soft">CIVICVISION AI focuses on the high-frequency problems that most affect daily life and public health.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {MAIN_CATEGORIES.map((c) => (
              <article key={c} className="flex flex-col rounded-xl border border-line bg-canvas/40 p-5">
                <span className="flex size-11 items-center justify-center rounded-xl bg-surface shadow-card">
                  <CategoryIcon category={c} className="size-5.5" />
                </span>
                <h3 className="mt-4 font-semibold">{CATEGORY_META[c].label}</h3>
                <p className="mt-1 text-sm text-ink-soft">{CATEGORY_META[c].description}</p>
                <ul className="mt-3 space-y-1.5 text-sm text-ink-soft">
                  {CATEGORY_DETAIL[c].map((d) => (
                    <li key={d} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
                      {d}
                    </li>
                  ))}
                </ul>
                <ButtonLink to={`/map?category=${c}`} variant="ghost" size="sm" className="mt-4 self-start px-0 text-brand-700 hover:bg-transparent hover:underline">
                  View {CATEGORY_META[c].short.toLowerCase()} reports <ArrowRight className="size-4" aria-hidden />
                </ButtonLink>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Transparent tracking, built-in escalation</h2>
        <p className="mt-3 max-w-2xl text-ink-soft">Each complaint moves through a controlled workflow, and every step is recorded in a timeline anyone can follow.</p>
        <ol className="mt-8 grid gap-4 md:grid-cols-4">
          {[
            { icon: Camera, title: '1. Report', body: 'Pin the spot on the map, choose a category, add a photo and a short description. You get a public complaint ID.' },
            { icon: Route, title: '2. Route', body: 'The complaint is routed to the responsible department and zone, with acknowledgement, action and resolution targets.' },
            { icon: CheckCircle2, title: '3. Resolve with proof', body: 'Staff post progress updates and must upload resolution photos before closing. Citizens can rate the fix or request reopening.' },
            { icon: BellRing, title: '4. Escalate if late', body: 'Missed targets create an auditable escalation for supervisors, who can reassign work or review extension requests.' },
          ].map((s) => (
            <li key={s.title} className="rounded-xl border border-line bg-surface p-5 shadow-card">
              <s.icon className="size-6 text-brand-700" aria-hidden />
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-ink-soft">{s.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-line bg-surface p-5">
            <h3 className="font-semibold">Severity and deadlines are kept separate</h3>
            <p className="mt-1 text-sm text-ink-soft">
              <strong>Severity</strong> describes how serious the problem is (low → critical). <strong>Deadline status</strong> shows whether the response target is on track, due
              soon or overdue. A minor issue can be overdue; a critical one can be on track. The map shows them with different visual cues.
            </p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-5">
            <h3 className="font-semibold">Duplicate warnings and recurring hotspots</h3>
            <p className="mt-1 text-sm text-ink-soft">
              Repeated reports near the same spot are grouped into hotspots so supervisors can spot chronic problems. Rules-based duplicate warnings before submission are planned for
              Phase 3 — they will warn, never silently discard a report.
            </p>
          </div>
        </div>
      </section>

      {/* Portals */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Three role-specific portals</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { icon: Users, title: 'Public / Citizens', body: 'Submit and track complaints, view resolution evidence, give feedback, request reopening.', to: '/login/citizen', cta: 'Citizen login' },
              { icon: Building2, title: 'Department Authority', body: 'Work queue scoped to their department and zone, status workflow, progress notes, evidence uploads, deadline countdowns.', to: '/login/authority', cta: 'Authority login' },
              { icon: Landmark, title: 'Higher Officials', body: 'Overdue, due-soon and critical queues, escalation review, reassignment, extension decisions, performance and hotspot analysis, audit trail, account management.', to: '/login/official', cta: 'Officials login' },
            ].map((p) => (
              <div key={p.title} className="flex flex-col rounded-xl border border-line p-5">
                <p.icon className="size-6 text-brand-700" aria-hidden />
                <h3 className="mt-3 font-semibold">{p.title}</h3>
                <p className="mt-1 flex-1 text-sm text-ink-soft">{p.body}</p>
                <ButtonLink to={p.to} variant="secondary" size="sm" className="mt-4 self-start">
                  {p.cta} <ArrowRight className="size-4" aria-hidden />
                </ButtonLink>
              </div>
            ))}
          </div>
          <p className="mt-4 flex items-start gap-2 text-sm text-ink-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            Roles are assigned by administrators, never self-selected. Public views never show reporter identity, contact details or internal notes.
          </p>
        </div>
      </section>

      {/* Impact & SDGs */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Intended impact</h2>
            <p className="mt-3 text-ink-soft">
              Faster, fairer responses to everyday civic problems — and a shared, evidence-based record that helps residents and officials focus on recurring trouble spots.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-ink-soft">
              {['Cleaner streets and fewer public-health risks', 'Less waterlogging damage and safer roads', 'Measurable response times instead of anecdotes', 'Trust built through visible proof of work'].map((t) => (
                <li key={t} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
              <p className="inline-flex rounded-md bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-800">SDG 11</p>
              <h3 className="mt-2 font-semibold">Sustainable Cities and Communities</h3>
              <p className="mt-1 text-sm text-ink-soft">Supports better municipal waste management, safer public spaces and participatory, transparent local governance.</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
              <p className="inline-flex rounded-md bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-800">SDG 9</p>
              <h3 className="mt-2 font-semibold">Industry, Innovation and Infrastructure</h3>
              <p className="mt-1 text-sm text-ink-soft">Helps maintain resilient drainage and road infrastructure through data on where failures recur.</p>
            </div>
            <div className="rounded-xl border border-dashed border-line bg-surface p-5 sm:col-span-2">
              <p className="flex items-center gap-2 font-semibold">
                <Sparkles className="size-4 text-brand-700" aria-hidden />
                About the “AI” in CIVICVISION AI
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                Optional image assistance (Phase 3) will use an existing pretrained model through the Gemini API to <em>suggest</em> a category from a photo. We have not trained a
                custom model; suggestions are always confirmed by the citizen, and the platform works fully without AI. AI assistance is not active in this demo.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-line bg-brand-800 text-white">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 py-12 sm:px-6 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-semibold">See an issue on your street?</h2>
            <p className="mt-1 text-brand-100">It takes about a minute to report, and you can follow every step afterwards.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink to={reportHref} size="lg" variant="secondary" icon={<Camera className="size-5" />}>
              Report an issue
            </ButtonLink>
            <ButtonLink to="/track" size="lg" className="bg-brand-700 ring-1 ring-white/30 hover:bg-brand-900" icon={<FileSearch className="size-5" />}>
              Track a complaint
            </ButtonLink>
          </div>
        </div>
      </section>
    </div>
  )
}
