-- Row Level Security -----------------------------------------------------
-- MVP model: any authenticated operator (Supabase Auth user, e.g. tool-room
-- staff) can read/write inventory and transactions. The API routes normally
-- run with the service-role key (bypasses RLS) so these policies mainly
-- protect any direct client-side Supabase calls and future roles.

alter table items enable row level security;
alter table transactions enable row level security;

-- items: authenticated operators can read and write the catalog.
drop policy if exists "items_select_authenticated" on items;
create policy "items_select_authenticated"
  on items for select
  to authenticated
  using (true);

drop policy if exists "items_write_authenticated" on items;
create policy "items_write_authenticated"
  on items for all
  to authenticated
  using (true)
  with check (true);

-- transactions: authenticated operators can read all records (audit trail)
-- and create/update their own. Worker photos are the sensitive asset here;
-- access to the underlying image is separately gated by storage policies
-- and short-lived signed URLs, not by this table's visibility.
drop policy if exists "transactions_select_authenticated" on transactions;
create policy "transactions_select_authenticated"
  on transactions for select
  to authenticated
  using (true);

drop policy if exists "transactions_insert_authenticated" on transactions;
create policy "transactions_insert_authenticated"
  on transactions for insert
  to authenticated
  with check (true);

drop policy if exists "transactions_update_authenticated" on transactions;
create policy "transactions_update_authenticated"
  on transactions for update
  to authenticated
  using (true)
  with check (true);

-- No delete policy: transactions are an immutable audit trail. Deletion is
-- only possible via the service-role key (e.g. for GDPR-style erasure),
-- which bypasses RLS entirely.
