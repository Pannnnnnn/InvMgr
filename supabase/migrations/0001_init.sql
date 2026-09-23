-- FactoryLens: initial schema
-- Extensions -----------------------------------------------------------
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- fuzzy/trigram matching for item aliases

-- 1. Inventory Catalog ---------------------------------------------------
create table if not exists items (
  id                 uuid primary key default gen_random_uuid(),
  sku                text unique not null,
  name               text not null,
  category           text,
  aliases            text[] not null default '{}',  -- e.g. ['drill', 'makita cordless']
  total_quantity     int not null default 1 check (total_quantity >= 0),
  available_quantity int not null default 1 check (available_quantity >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint available_lte_total check (available_quantity <= total_quantity)
);

comment on table items is 'Inventory catalog: tools/equipment/consumables tracked for checkout.';
comment on column items.aliases is 'Alternate/fuzzy names used to resolve natural-language item mentions.';

create index if not exists items_name_trgm_idx on items using gin (name gin_trgm_ops);
create index if not exists items_aliases_gin_idx on items using gin (aliases);
create index if not exists items_sku_idx on items (sku);

-- 2. Borrow Records --------------------------------------------------------
create table if not exists transactions (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references items(id) on delete restrict,
  quantity      int not null default 1 check (quantity > 0),
  worker_name   text,
  photo_url     text not null,          -- storage object path (not a public URL)
  operator_id   uuid references auth.users(id),
  status        text not null default 'BORROWED' check (status in ('BORROWED', 'RETURNED')),
  notes         text,
  borrowed_at   timestamptz not null default now(),
  returned_at   timestamptz
);

comment on table transactions is 'Audit log of checkout/return events, one row per borrow action.';
comment on column transactions.photo_url is 'Object path within the worker-photos storage bucket; resolve to a signed URL for display.';

create index if not exists transactions_item_id_idx on transactions (item_id);
create index if not exists transactions_worker_name_trgm_idx on transactions using gin (worker_name gin_trgm_ops);
create index if not exists transactions_borrowed_at_idx on transactions (borrowed_at desc);
create index if not exists transactions_status_idx on transactions (status);

-- updated_at trigger for items ------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists items_set_updated_at on items;
create trigger items_set_updated_at
  before update on items
  for each row
  execute function set_updated_at();
