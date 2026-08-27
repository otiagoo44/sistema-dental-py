import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const pgliteEntry = process.env.PGLITE_ENTRY;

if (!pgliteEntry) {
  throw new Error('Set PGLITE_ENTRY to the absolute @electric-sql/pglite entry file.');
}

const { PGlite } = await import(pathToFileURL(pgliteEntry).href);
const projectRoot = path.resolve(import.meta.dirname, '..');
const migrationsDir = path.join(projectRoot, 'supabase', 'migrations');
const database = new PGlite();

const bootstrapSql = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create role authenticator nologin;

  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    role text,
    aud text,
    created_at timestamptz not null default now()
  );

  create or replace function auth.uid()
  returns uuid
  language sql
  stable
  set search_path = ''
  as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;

  create or replace function auth.role()
  returns text
  language sql
  stable
  set search_path = ''
  as $$
    select nullif(current_setting('request.jwt.claim.role', true), '');
  $$;

  create or replace function auth.jwt()
  returns jsonb
  language sql
  stable
  set search_path = ''
  as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  $$;

  create publication supabase_realtime;
`;

await database.exec(bootstrapSql);

const migrationNames = (await readdir(migrationsDir))
  .filter((name) => name.endsWith('.sql'))
  .sort();

for (const migrationName of migrationNames) {
  const sql = (await readFile(path.join(migrationsDir, migrationName), 'utf8'))
    // PGlite exposes gen_random_uuid() from PostgreSQL core but does not package
    // Supabase's pgcrypto extension control file. Supabase itself does.
    .replaceAll('create extension if not exists pgcrypto;', '');
  try {
    await database.exec(sql);
    process.stdout.write(`PASS migration ${migrationName}\n`);
  } catch (error) {
    process.stderr.write(`FAIL migration ${migrationName}\n${error.message}\n`);
    throw error;
  }
}

for (const testName of ['operational-integrity.sql', 'operational-workflows-e2e.sql', 'clarity-scoring.sql']) {
  const sql = await readFile(path.join(projectRoot, 'tests', testName), 'utf8');
  try {
    await database.exec(sql);
    process.stdout.write(`PASS SQL contract ${testName}\n`);
  } catch (error) {
    process.stderr.write(`FAIL SQL contract ${testName}\n${error.message}\n`);
    throw error;
  }
}

await database.close();
