-- A single checkout event can cover multiple items (e.g. "2 torque wrenches
-- and a multimeter"). checkout_item() is atomic per item, but a photo/worker
-- checkout with several items needs all-or-nothing semantics: if any one
-- item is out of stock, none should be decremented. A single PL/pgSQL
-- function call is implicitly one transaction, so raising an exception here
-- rolls back every update made earlier in the same call.

create or replace function checkout_batch(
  p_items        jsonb,   -- [{ "item_id": uuid, "quantity": int }, ...]
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
        and available_quantity >= v_qty
      returning * into v_updated;

    if not found then
      -- Raising aborts the whole function call, rolling back every
      -- decrement already applied earlier in this loop.
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

comment on function checkout_batch is
  'Atomically decrements stock and inserts one transaction row per item for a multi-item checkout event. All-or-nothing: raises INSUFFICIENT_STOCK and rolls back entirely if any item cannot be fulfilled.';

grant execute on function checkout_batch(jsonb, text, text, uuid, text) to authenticated;
