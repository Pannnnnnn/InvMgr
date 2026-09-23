#!/usr/bin/env node
// Minimal migration runner for the Supabase Postgres database.
//
// Usage:
//   DATABASE_URL=postgres://... node scripts/run-migrations.mjs
//
// DATABASE_URL is the Supabase project's Postgres connection string
// (Project Settings -> Database -> Connection string -> URI), NOT the
// Supabase API URL. Requires the `pg` dev dependency (already listed in
// package.json).
//
// This is intentionally simple (no rollback/down migrations): it applies
// each .sql file in supabase/migrations, in filename order, exactly once,
// tracked in a `_migrations` table.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    'DATABASE_URL is not set. Pass your Supabase Postgres connection string:\n' +
      '  DATABASE_URL=postgres://postgres:[password]@db.[project-ref].supabase.co:5432/postgres node scripts/run-migrations.mjs'
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  await client.query(`
    create table if not exists _migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const { rows } = await client.query('select name from _migrations');
  const applied = new Set(rows.map((r) => r.name));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip  ${file} (already applied)`);
      continue;
    }
    const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`apply ${file}`);
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into _migrations (name) values ($1)', [file]);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      console.error(`failed ${file}:`, err.message);
      process.exitCode = 1;
      break;
    }
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
