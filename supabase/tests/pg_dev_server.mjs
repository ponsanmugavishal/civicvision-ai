// Local Postgres for integration testing without Docker or a Supabase project.
// Starts an in-memory PGlite (real Postgres compiled to WASM), installs minimal Supabase stubs
// (auth.users, auth.uid(), storage.buckets, anon/authenticated roles), applies every migration and seed.sql,
// registers the dev accounts in auth.users, and serves the Postgres wire protocol on 127.0.0.1:54329.
//
//   cd supabase/tests && npm install && node pg_dev_server.mjs
//   DATABASE_URL=postgresql+psycopg://postgres:postgres@127.0.0.1:54329/postgres
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const port = Number(process.env.PG_PORT ?? 54329)
const db = new PGlite()

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  grant usage on schema public to anon, authenticated;
`)
const migDir = path.join(root, 'supabase', 'migrations')
for (const f of fs.readdirSync(migDir).sort()) {
  await db.exec(fs.readFileSync(path.join(migDir, f), 'utf8'))
  console.log(`applied ${f}`)
}
await db.exec(fs.readFileSync(path.join(root, 'supabase', 'seed.sql'), 'utf8'))
console.log('applied seed.sql')

// Dev accounts (same ids as backend/app/seed.py). The auth trigger creates them as citizens;
// `python -m app.seed --dev` then provisions their staff/supervisor roles like an administrator would.
const dev = { a1: 'asha', a2: 'vikram', a3: 'meera', b1: 'karthik', b2: 'divya', b3: 'rahul', b4: 'arun', b5: 'joseph', c1: 'lakshmi', c9: 'admin' }
for (const [hex, name] of Object.entries(dev)) {
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [`00000000-0000-4000-8000-000000000${hex.padStart(3, '0')}`, `${name}@dev.civicvision.local`])
}
console.log('registered dev auth users')

const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 20 })
await server.start()
console.log(`PGlite Postgres listening on 127.0.0.1:${port}`)
