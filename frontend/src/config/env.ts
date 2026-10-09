/**
 * Typed access to public (VITE_*) environment variables.
 * Only non-secret values belong here — everything is bundled into browser JavaScript.
 */

function num(value: string | undefined, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && value !== undefined && value !== '' ? n : fallback
}

const e = import.meta.env

export const env = {
  /** 'mock' = in-browser demo data. 'api' = FastAPI backend + Supabase Auth. */
  dataMode: (e.VITE_DATA_MODE === 'api' ? 'api' : 'mock') as 'mock' | 'api',
  apiBaseUrl: ((e.VITE_API_BASE_URL as string | undefined) || 'http://localhost:8000').replace(/\/$/, ''),
  supabaseUrl: (e.VITE_SUPABASE_URL as string | undefined) ?? '',
  /** The anon key is public by design (RLS protects data). Never put the service-role key here. */
  supabaseAnonKey: (e.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '',
  /** Local development only: offers sign-in as seeded dev accounts via the backend's /api/dev/login. */
  devLogin: e.VITE_DEV_LOGIN === 'true',
  /** Supabase Realtime broadcast channel the backend publishes change events on. */
  realtimeChannel: (e.VITE_REALTIME_CHANNEL as string | undefined) || 'civic-updates',
  map: {
    center: [num(e.VITE_MAP_DEFAULT_LAT, 13.05), num(e.VITE_MAP_DEFAULT_LNG, 80.24)] as [number, number],
    zoom: num(e.VITE_MAP_DEFAULT_ZOOM, 13),
    tileUrl: (e.VITE_MAP_TILE_URL as string | undefined) || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
}

/** True when running on in-browser demo data (Phase 1 behaviour). */
export const isMockMode = env.dataMode === 'mock'
export const supabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey)
