// Usage: cd supabase/tests && npm install && npm run verify
// Applies supabase/migrations + seed.sql to an in-memory Postgres (PGlite) with stub Supabase schemas,
// then checks triggers, constraints and RLS behaviour.
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'))
const db = new PGlite()
const results = []
const check = async (name, fn) => {
  try {
    await fn()
    results.push(['PASS', name])
  } catch (e) {
    results.push(['FAIL', name, e.message])
  }
}
const expectError = async (sql, params = []) => {
  try {
    await db.query(sql, params)
  } catch {
    return
  }
  throw new Error('expected an error but the statement succeeded')
}

// --- Supabase stubs (roles, auth.users, auth.uid(), storage.buckets)
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
  await check(`migration ${f} applies`, () => db.exec(fs.readFileSync(path.join(migDir, f), 'utf8')))
}
await check('seed.sql applies', () => db.exec(fs.readFileSync(path.join(root, 'supabase', 'seed.sql'), 'utf8')))
await check('seed.sql is idempotent', () => db.exec(fs.readFileSync(path.join(root, 'supabase', 'seed.sql'), 'utf8')))

await check('reference rows + private bucket', async () => {
  const counts = await db.query(`select (select count(*) from departments) d, (select count(*) from zones) z, (select count(*) from sla_policies) s, (select public from storage.buckets where id='report-media') pub`)
  const r = counts.rows[0]
  if (Number(r.d) !== 4 || Number(r.z) !== 4 || Number(r.s) !== 16 || r.pub !== false) throw new Error(JSON.stringify(r))
})

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
await check('new auth user always gets a citizen profile (metadata cannot pick a role)', async () => {
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'a@example.org', '{"display_name":"Asha","role":"administrator"}'), ($2, 'b@example.org', '{}')`, [A, B])
  const r = await db.query(`select id, role, display_name from profiles order by email`)
  if (r.rows.length !== 2 || r.rows.some((x) => x.role !== 'citizen') || r.rows[0].display_name !== 'Asha') throw new Error(JSON.stringify(r.rows))
})

const reportSql = `insert into reports (id, public_id, citizen_id, category, description, latitude, longitude, acknowledgement_deadline, action_deadline, resolution_deadline,
  original_acknowledgement_deadline, original_action_deadline, original_resolution_deadline)
  values ($1, $2, $3, 'drainage', 'Drain blocked and overflowing near the school.', 13.05, 80.24, now(), now(), now(), now(), now(), now())`
const R1 = '33333333-3333-4333-8333-333333333333'
await check('owner can insert a valid report', () => db.query(reportSql, [R1, 'CV-2026-00001', A]))
await check('check constraints reject bad data', async () => {
  await expectError(`update reports set category = 'fire' where id = $1`, [R1])
  await expectError(`update reports set latitude = 100 where id = $1`, [R1])
  await expectError(`update reports set status = 'resolved' where id = $1`, [R1]) // no summary
  await expectError(reportSql, ['44444444-4444-4444-8444-444444444444', 'CV-2026-00001', A]) // duplicate public id
})
await check('status history is append-only', async () => {
  await db.query(`insert into status_history (report_id, new_status, changed_by, changed_by_role) values ($1, 'open', $2, 'citizen')`, [R1, A])
  await expectError(`update status_history set comment = 'edited'`)
  await expectError(`delete from status_history`)
})
await check('audit log is append-only', async () => {
  await db.query(`insert into audit_logs (actor_role, action, entity_type, entity_id, summary) values ('citizen', 'x', 'report', '1', 'y')`)
  await expectError(`update audit_logs set summary = 'edited'`)
  await expectError(`delete from audit_logs`)
})
await check('escalation events are unique per report/stage/deadline', async () => {
  await db.query(`insert into escalation_events (report_id, level, reason, deadline_kind, deadline_at) values ($1, 1, 'r', 'acknowledgement', '2026-10-01T00:00:00Z')`, [R1])
  await expectError(`insert into escalation_events (report_id, level, reason, deadline_kind, deadline_at) values ($1, 1, 'r', 'acknowledgement', '2026-10-01T00:00:00Z')`, [R1])
  await db.query(`insert into escalation_events (report_id, level, reason, deadline_kind, deadline_at) values ($1, 1, 'r', 'acknowledgement', '2026-10-05T00:00:00Z')`, [R1])
})
await check('only one pending extension per report', async () => {
  const ins = `insert into deadline_extension_requests (report_id, deadline_kind, current_deadline, requested_deadline, requested_by, reason) values ($1, 'resolution', now(), now() + interval '2 days', $2, 'Need heavy machinery')`
  await db.query(ins, [R1, A])
  await expectError(ins, [R1, A])
})

// --- RLS as client roles
const asRole = async (role, sub, fn) => {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${sub ?? ''}', false);`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role;`)
  }
}
await check('anon can read reference data only', () =>
  asRole('anon', null, async () => {
    await db.query(`select * from departments`)
    await expectError(`select * from public_reports`) // removed: public data goes through the backend
  }),
)
await check('anon cannot read base tables or write anything', () =>
  asRole('anon', null, async () => {
    await expectError(`select * from reports`)
    await expectError(`select * from profiles`)
    await expectError(`select * from audit_logs`)
    await expectError(`insert into departments (slug, name, short_name) values ('x','x','x')`)
  }),
)
await check('citizen reads only own profile/reports', () =>
  asRole('authenticated', B, async () => {
    const p = await db.query(`select id from profiles`)
    const r = await db.query(`select id from reports`)
    if (p.rows.length !== 1 || p.rows[0].id !== B || r.rows.length !== 0) throw new Error(JSON.stringify({ p: p.rows, r: r.rows }))
  }),
)
await check('owner citizen sees own report', () =>
  asRole('authenticated', A, async () => {
    const r = await db.query(`select id from reports`)
    if (r.rows.length !== 1) throw new Error('expected own report')
  }),
)
await check('users cannot promote themselves or edit others', () =>
  asRole('authenticated', A, async () => {
    await expectError(`update profiles set role = 'administrator' where id = '${A}'`)
    await expectError(`update profiles set department_id = null, all_zones = true where id = '${A}'`)
    await db.query(`update profiles set display_name = 'Asha R' where id = '${A}'`)
    const other = await db.query(`update profiles set display_name = 'hacked' where id = '${B}' returning id`)
    if (other.rows.length !== 0) throw new Error('updated another profile')
  }),
)
await check('clients cannot write reports, evidence, history or escalations', () =>
  asRole('authenticated', A, async () => {
    await expectError(reportSql, ['55555555-5555-4555-8555-555555555555', 'CV-2026-00099', A])
    await expectError(`update reports set status = 'resolved'`)
    await expectError(`select * from escalation_events`)
    await expectError(`select * from progress_notes`)
  }),
)
await check('profile role unchanged after attempts', async () => {
  const role = await db.query(`select role, display_name from profiles where id = $1`, [A])
  if (role.rows[0].role !== 'citizen' || role.rows[0].display_name !== 'Asha R') throw new Error(JSON.stringify(role.rows[0]))
})

await check('database SLA check is idempotent and notifies supervisors', async () => {
  await db.query(`update profiles set role = 'supervisor', all_zones = true where id = $1`, [B])
  const R2 = '66666666-6666-4666-8666-666666666666'
  await db.query(`insert into reports (id, public_id, citizen_id, category, description, latitude, longitude, acknowledgement_deadline, action_deadline, resolution_deadline,
    original_acknowledgement_deadline, original_action_deadline, original_resolution_deadline)
    values ($1, 'CV-2026-00002', $2, 'garbage', 'Garbage piled up beside the market entrance.', 13.05, 80.24, now() - interval '1 hour', now() + interval '1 day', now() + interval '3 days', now(), now(), now())`, [R2, A])
  const first = await db.query(`select public.run_sla_check() as n`)
  const second = await db.query(`select public.run_sla_check() as n`)
  const ev = await db.query(`select count(*)::int as c from escalation_events where report_id = $1`, [R2])
  const nt = await db.query(`select count(*)::int as c from notifications where user_id = $1`, [B])
  if (first.rows[0].n < 1 || second.rows[0].n !== 0 || ev.rows[0].c !== 1 || nt.rows[0].c < 1) throw new Error(JSON.stringify({ first: first.rows, second: second.rows, ev: ev.rows, nt: nt.rows }))
})
await check('clients cannot call the SLA function or read AI suggestions', () =>
  asRole('authenticated', A, async () => {
    await expectError(`select public.run_sla_check()`)
    await expectError(`select * from ai_suggestions`)
  }),
)

for (const [s, n, e] of results) console.log(`${s}  ${n}${e ? `  — ${e}` : ''}`)
const failed = results.filter((r) => r[0] === 'FAIL').length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
