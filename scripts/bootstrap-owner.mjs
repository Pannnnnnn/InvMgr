#!/usr/bin/env node
// One-time bootstrap: approves a single account as clearance 1 (dev/owner)
// so they can start approving everyone else from /admin. See README section
// 6. Run this from your own machine's terminal (not through any sandbox),
// since it needs to reach your real Supabase project directly.
//
// Usage:
//   node scripts/bootstrap-owner.mjs you@example.com
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from
// .env.local (same file the app already uses) — nothing is typed or
// printed except your email/user id and the resulting status.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/bootstrap-owner.mjs <email>');
  process.exit(1);
}

const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let page = 1;
let user = null;
while (!user) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    console.error('Failed to list users:', error.message);
    process.exit(1);
  }
  user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
  if (data.users.length < 200) break; // last page
  page += 1;
}

if (!user) {
  console.error(`No user found with email ${email}. Register at /register first.`);
  process.exit(1);
}

const { data, error } = await admin.auth.admin.updateUserById(user.id, {
  app_metadata: { status: 'approved', clearance: 1 },
});
if (error) {
  console.error('Failed to update user:', error.message);
  process.exit(1);
}

console.log(`✅ ${data.user.email} is now clearance 1 (owner). Sign in at /login — you'll see the Admin link in the nav.`);
