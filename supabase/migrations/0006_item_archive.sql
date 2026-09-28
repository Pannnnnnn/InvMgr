-- Removing a catalog item: hard-delete isn't always safe. transactions.item_id
-- has "on delete restrict" (see 0001_init.sql) precisely so a checkout/return
-- audit trail can never be silently lost when an item is removed. That meant
-- there was previously NO way to remove an item that had ever been checked
-- out/restocked at all — the DELETE would just fail with a FK violation, and
-- there was no DELETE route or UI to even attempt it.
--
-- Fix: soft-delete via items.is_active. The API layer (see
-- src/app/api/items/[id]/route.ts) tries a real DELETE first — a placeholder
-- item with no transaction history is gone for good, no orphaned row left
-- behind. Only when the DB rejects that with the FK-restrict error does the
-- API fall back to archiving (is_active = false), which keeps the row (and
-- every transaction pointing at it) intact for the audit trail while hiding
-- it from search/checkout/inventory-count by default.

alter table items add column if not exists is_active boolean not null default true;

comment on column items.is_active is
  'False = archived/removed from the catalog. Items with transaction history can''t be hard-deleted (transactions.item_id is ON DELETE RESTRICT), so removing them sets this instead. Archived items are excluded from search_items, checkout_item/checkout_batch, and the default items list.';

create index if not exists items_is_active_idx on items (is_active);

-- Exclude archived items from fuzzy search (checkout AI resolution + item picker).
create or replace function search_items(p_query text, p_limit int default 5)
returns table (
  id uuid,
  sku text,
  name text,
  category text,
  aliases text[],
  available_quantity int,
  total_quantity int,
  similarity real
)
language sql
stable
as $$
  select
    i.id, i.sku, i.name, i.category, i.aliases, i.available_quantity, i.total_quantity,
    greatest(
      similarity(i.name, p_query),
      coalesce((select max(similarity(a, p_query)) from unnest(i.aliases) a), 0)
    ) as similarity
  from items i
  where i.is_active
    and (i.name % p_query or exists (select 1 from unnest(i.aliases) a where a % p_query))
  order by similarity desc
  limit p_limit;
$$;

-- Belt-and-suspenders: even if a stale/cached item id reaches checkout
-- (e.g. an archive happens mid-session), an archived item can never be
-- decremented — it just reads as "insufficient stock", same as any other
-- checkout the UI already knows how to reject.
create or replace function checkout_item(
  p_item_id     uuid,
  p_quantity    int,
  p_worker_name text,
  p_photo_url   text,
  p_operator_id uuid,
  p_notes       text default null
)
returns transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated items;
  v_txn transactions;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'INVALID_QUANTITY: quantity must be a positive integer' using errcode = '22023';
  end if;

  update items
    set available_quantity = available_quantity - p_quantity
    where id = p_item_id
      and is_active
      and available_quantity >= p_quantity
    returning * into v_updated;

  if not found then
    raise exception 'INSUFFICIENT_STOCK: item % does not have % unit(s) available', p_item_id, p_quantity
      using errcode = 'P0001';
  end if;

  insert into transactions (item_id, quantity, worker_name, photo_url, operator_id, notes, status)
  values (p_item_id, p_quantity, p_worker_name, p_photo_url, p_operator_id, p_notes, 'BORROWED')
  returning * into v_txn;

  return v_txn;
end;
$$;

create or replace function checkout_batch(
  p_items        jsonb,
  p_worker_name  text,
  p_photo_url    text,
  p_operator_id  uuid,
  p_notes        text default null
)
returns setof transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry   jsonb;
  v_item_id uuid;
  v_qty     int;
  v_updated items;
  v_txn     transactions;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CHECKOUT: at least one item is required' using errcode = '22023';
  end if;

  for v_entry in select * from jsonb_array_elements(p_items)
  loop
    v_item_id := (v_entry ->> 'item_id')::uuid;
    v_qty := (v_entry ->> 'quantity')::int;

    if v_qty is null or v_qty <= 0 then
      raise exception 'INVALID_QUANTITY: quantity must be a positive integer for item %', v_item_id
        using errcode = '22023';
    end if;

    update items
      set available_quantity = available_quantity - v_qty
      where id = v_item_id
        and is_active
        and available_quantity >= v_qty
      returning * into v_updated;

    if not found then
      raise exception 'INSUFFICIENT_STOCK: item % does not have % unit(s) available', v_item_id, v_qty
        using errcode = 'P0001';
    end if;

    insert into transactions (item_id, quantity, worker_name, photo_url, operator_id, notes, status)
    values (v_item_id, v_qty, p_worker_name, p_photo_url, p_operator_id, p_notes, 'BORROWED')
    returning * into v_txn;

    return next v_txn;
  end loop;

  return;
end;
$$;
