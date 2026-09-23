-- Atomic stock operations, called via supabase.rpc(...) from the API layer.
-- Using SECURITY DEFINER + a fixed search_path so these can run under RLS
-- with the checks encoded here rather than relying on client-side races.

-- Decrement stock and create the transaction row atomically.
-- Raises an exception (caught by the API as a 409) if stock is insufficient
-- or the item does not exist, so the caller never decrements twice.
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

comment on function checkout_item is
  'Atomically decrements items.available_quantity and inserts the matching BORROWED transaction. Raises INSUFFICIENT_STOCK if not enough stock.';

-- Mark a transaction returned and restock the item atomically.
create or replace function return_item(
  p_transaction_id uuid
)
returns transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txn transactions;
begin
  update transactions
    set status = 'RETURNED', returned_at = now()
    where id = p_transaction_id
      and status = 'BORROWED'
    returning * into v_txn;

  if not found then
    raise exception 'TRANSACTION_NOT_RETURNABLE: transaction % is missing or already returned', p_transaction_id
      using errcode = 'P0001';
  end if;

  update items
    set available_quantity = least(total_quantity, available_quantity + v_txn.quantity)
    where id = v_txn.item_id;

  return v_txn;
end;
$$;

comment on function return_item is
  'Marks a BORROWED transaction as RETURNED and restocks the item. Raises TRANSACTION_NOT_RETURNABLE if already returned or missing.';

-- Fuzzy item lookup used by the AI resolution step: ranks catalog items by
-- trigram similarity against both the item name and any alias.
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
  where i.name % p_query
     or exists (select 1 from unnest(i.aliases) a where a % p_query)
  order by similarity desc
  limit p_limit;
$$;

comment on function search_items is
  'Trigram fuzzy search across item name + aliases, used to resolve natural-language item mentions to catalog rows.';

grant execute on function checkout_item(uuid, int, text, text, uuid, text) to authenticated;
grant execute on function return_item(uuid) to authenticated;
grant execute on function search_items(text, int) to authenticated;
