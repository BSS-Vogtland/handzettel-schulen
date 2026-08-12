begin;

-- Phase A mutation boundary. All functions are object-bound, fail closed and
-- contain no provider, HTTP, refund, adjustment or mail operation.

create or replace function public.create_school_request_after_sales_case(
  p_request_id uuid,
  p_invoice_id uuid,
  p_intake_withdrawal_request_id uuid,
  p_case_type text,
  p_scope_type text,
  p_payment_state_snapshot text,
  p_payment_method_snapshot text,
  p_fulfillment_state_snapshot text,
  p_actor_type text,
  p_actor_reference text,
  p_reason text,
  p_confirmation text
)
returns public.school_request_after_sales_cases
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request_row public.school_requests%rowtype;
  invoice_row public.school_request_invoices%rowtype;
  intake_row public.customer_withdrawal_requests%rowtype;
  case_row public.school_request_after_sales_cases%rowtype;
  case_id uuid := gen_random_uuid();
  now_value timestamptz := clock_timestamp();
  expected_payment_state text;
begin
  if p_case_type not in ('cancellation','withdrawal','complaint')
     or p_scope_type not in ('full','partial')
     or p_actor_type not in ('admin','service','system','customer_intake')
     or nullif(btrim(p_actor_reference),'') is null
     or nullif(btrim(p_reason),'') is null
     or nullif(btrim(p_confirmation),'') is null then
    raise exception 'AFTER_SALES_CREATE_INPUT_INVALID';
  end if;

  select r.* into request_row
  from public.school_requests r where r.id=p_request_id for update;
  if not found then raise exception 'AFTER_SALES_REQUEST_NOT_FOUND'; end if;
  select i.* into invoice_row
  from public.school_request_invoices i
  where i.id=p_invoice_id and i.request_id=p_request_id for share;
  if not found then raise exception 'AFTER_SALES_INVOICE_BINDING_MISMATCH'; end if;

  -- The request row lock serializes exact create retries. An identical retry
  -- returns the original case and cannot duplicate revision or event.
  select c.* into case_row
  from public.school_request_after_sales_cases c
  where c.request_id=p_request_id and c.invoice_id=p_invoice_id
    and c.intake_withdrawal_request_id is not distinct from
      p_intake_withdrawal_request_id
    and c.case_type=p_case_type and c.scope_type=p_scope_type
    and c.payment_state_snapshot=p_payment_state_snapshot
    and c.payment_method_snapshot is not distinct from p_payment_method_snapshot
    and c.fulfillment_state_snapshot=p_fulfillment_state_snapshot
    and c.created_by_actor_type=p_actor_type
    and c.created_by_actor_reference=btrim(p_actor_reference)
    and c.creation_reason=btrim(p_reason)
    and c.creation_confirmation=btrim(p_confirmation)
  order by c.created_at limit 1;
  if found then return case_row; end if;

  expected_payment_state := case
    when invoice_row.payment_status='payment_received'
      and invoice_row.selected_payment_method in ('paypal','stripe')
      then 'paid_provider'
    when invoice_row.payment_status='payment_received' then 'paid_manual'
    when invoice_row.payment_status in ('cancelled','failed')
      then 'cancelled_or_failed'
    when invoice_row.payment_status in (
      'not_selected','waiting_for_payment','payment_pending'
    ) then 'unpaid'
    else 'unknown_or_ambiguous'
  end;
  if p_payment_state_snapshot is distinct from expected_payment_state
     or p_payment_method_snapshot is distinct from
       invoice_row.selected_payment_method
     or p_fulfillment_state_snapshot is distinct from
       request_row.fulfillment_status then
    raise exception 'AFTER_SALES_SNAPSHOT_MISMATCH';
  end if;
  if p_intake_withdrawal_request_id is not null then
    select w.* into intake_row from public.customer_withdrawal_requests w
    where w.id=p_intake_withdrawal_request_id for share;
    if not found then raise exception 'AFTER_SALES_INTAKE_NOT_FOUND'; end if;
    if intake_row.contract_reference not in (
      request_row.request_number, invoice_row.invoice_number
    ) then raise exception 'AFTER_SALES_INTAKE_BINDING_MISMATCH'; end if;
  end if;

  begin
    insert into public.school_request_after_sales_cases (
      id, case_reference, request_id, invoice_id,
      intake_withdrawal_request_id, case_type, case_status, scope_type,
      payment_state_snapshot, payment_method_snapshot, payment_snapshot_at,
      fulfillment_state_snapshot, fulfillment_snapshot_at,
      created_by_actor_type, created_by_actor_reference,
      creation_reason, creation_confirmation, revision
    ) values (
      case_id, 'ASC-' || upper(substr(replace(case_id::text,'-',''),1,16)),
      p_request_id, p_invoice_id, p_intake_withdrawal_request_id,
      p_case_type, 'received', p_scope_type, p_payment_state_snapshot,
      p_payment_method_snapshot, now_value, p_fulfillment_state_snapshot,
      now_value, p_actor_type, btrim(p_actor_reference), btrim(p_reason),
      btrim(p_confirmation), 0
    ) returning * into case_row;
  exception when unique_violation then
    raise exception 'AFTER_SALES_CREATE_CONFLICT';
  end;

  insert into public.school_request_after_sales_case_events (
    case_id, revision_before, revision_after, event_type,
    actor_type, actor_reference, reason, confirmation
  ) values (
    case_row.id, 0, 0, 'case_created', p_actor_type,
    btrim(p_actor_reference), btrim(p_reason), btrim(p_confirmation)
  );
  return case_row;
end;
$$;

create or replace function public.replace_school_request_after_sales_case_scope(
  p_case_id uuid,
  p_request_id uuid,
  p_invoice_id uuid,
  p_expected_status text,
  p_expected_revision integer,
  p_items jsonb,
  p_actor_type text,
  p_actor_reference text,
  p_reason text,
  p_confirmation text
)
returns public.school_request_after_sales_cases
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  case_row public.school_request_after_sales_cases%rowtype;
  result_row public.school_request_after_sales_cases%rowtype;
  input_count integer;
  source_count integer;
  now_value timestamptz := clock_timestamp();
begin
  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items)=0
     or p_actor_type not in ('admin','service','system','customer_intake')
     or nullif(btrim(p_actor_reference),'') is null
     or nullif(btrim(p_reason),'') is null
     or nullif(btrim(p_confirmation),'') is null then
    raise exception 'AFTER_SALES_SCOPE_INPUT_INVALID';
  end if;
  select c.* into case_row from public.school_request_after_sales_cases c
  where c.id=p_case_id for update;
  if not found then raise exception 'AFTER_SALES_CASE_NOT_FOUND'; end if;
  if case_row.request_id is distinct from p_request_id
     or case_row.invoice_id is distinct from p_invoice_id then
    raise exception 'AFTER_SALES_CASE_BINDING_MISMATCH';
  end if;
  if case_row.scope_locked_at is not null
     or case_row.case_status in ('completed','rejected','cancelled','manual_review') then
    raise exception 'AFTER_SALES_SCOPE_BLOCKED';
  end if;
  if case_row.case_status is distinct from p_expected_status
     or case_row.revision is distinct from p_expected_revision then
    return null;
  end if;

  create temporary table scope_input_tmp (
    invoice_item_id uuid primary key,
    requested_quantity numeric(12,2) not null
  ) on commit drop;
  begin
    insert into scope_input_tmp
    select x.invoice_item_id, x.requested_quantity
    from jsonb_to_recordset(p_items) as x(
      invoice_item_id uuid, requested_quantity numeric(12,2)
    );
  exception when unique_violation then
    raise exception 'AFTER_SALES_SCOPE_DUPLICATE_ITEM';
  end;
  select count(*) into input_count from scope_input_tmp;
  if input_count<>jsonb_array_length(p_items)
     or exists(select 1 from scope_input_tmp where requested_quantity<=0) then
    raise exception 'AFTER_SALES_SCOPE_INPUT_INVALID';
  end if;
  if exists (
    select 1 from scope_input_tmp x
    left join public.school_request_invoice_items i
      on i.id=x.invoice_item_id and i.invoice_id=p_invoice_id
      and i.request_id=p_request_id
    where i.id is null or x.requested_quantity>i.quantity
      or i.tax_rate_snapshot is null or i.product_gross_amount_snapshot is null
      or i.product_net_amount_snapshot is null
      or i.product_tax_amount_snapshot is null
  ) then raise exception 'AFTER_SALES_SCOPE_ITEM_INVALID'; end if;
  if case_row.scope_type='full' then
    select count(*) into source_count
    from public.school_request_invoice_items i
    where i.invoice_id=p_invoice_id and i.request_id=p_request_id;
    if source_count<>input_count or exists (
      select 1 from scope_input_tmp x
      join public.school_request_invoice_items i on i.id=x.invoice_item_id
      where x.requested_quantity is distinct from i.quantity
    ) then raise exception 'AFTER_SALES_FULL_SCOPE_INCOMPLETE'; end if;
  end if;

  delete from public.school_request_after_sales_case_items
  where case_id=p_case_id;
  insert into public.school_request_after_sales_case_items (
    case_id, invoice_item_id, invoice_id, request_id,
    product_id_snapshot, offer_item_id_snapshot, product_name_snapshot,
    product_sku_snapshot, invoiced_quantity_snapshot, requested_quantity,
    unit_snapshot, tax_rate_snapshot, unit_gross_amount_snapshot,
    unit_net_amount_snapshot, line_gross_amount_snapshot,
    line_net_amount_snapshot, line_tax_amount_snapshot,
    max_adjustable_gross_amount, max_refundable_gross_amount,
    scope_revision, created_by_actor_type, created_by_actor_reference
  )
  select p_case_id, i.id, i.invoice_id, i.request_id, i.product_id,
    i.offer_item_id, i.product_name, i.product_sku, i.quantity,
    x.requested_quantity, i.unit, i.tax_rate_snapshot, i.unit_price,
    round(i.product_net_amount_snapshot/nullif(i.quantity,0),2),
    i.product_gross_amount_snapshot, i.product_net_amount_snapshot,
    i.product_tax_amount_snapshot, i.product_gross_amount_snapshot,
    i.product_gross_amount_snapshot, p_expected_revision+1,
    p_actor_type, btrim(p_actor_reference)
  from scope_input_tmp x
  join public.school_request_invoice_items i on i.id=x.invoice_item_id
  order by i.id;

  update public.school_request_after_sales_cases c
  set revision=c.revision+1, updated_at=now_value
  where c.id=p_case_id and c.case_status=p_expected_status
    and c.revision=p_expected_revision and c.scope_locked_at is null
  returning * into result_row;
  if not found then raise exception 'AFTER_SALES_INTERNAL_CAS_FAILURE'; end if;
  insert into public.school_request_after_sales_case_events (
    case_id, revision_before, revision_after, event_type,
    actor_type, actor_reference, reason, confirmation
  ) values (p_case_id,p_expected_revision,p_expected_revision+1,
    'case_scope_changed',p_actor_type,btrim(p_actor_reference),
    btrim(p_reason),btrim(p_confirmation));
  return result_row;
end;
$$;

create or replace function public.lock_school_request_after_sales_case_scope(
  p_case_id uuid, p_request_id uuid, p_invoice_id uuid,
  p_expected_status text, p_expected_revision integer,
  p_actor_type text, p_actor_reference text, p_reason text,
  p_confirmation text
)
returns public.school_request_after_sales_cases
language plpgsql security definer set search_path=public,pg_temp
as $$
declare c public.school_request_after_sales_cases%rowtype;
  result_row public.school_request_after_sales_cases%rowtype;
  now_value timestamptz:=clock_timestamp();
begin
  if p_actor_type not in ('admin','service','system')
     or nullif(btrim(p_actor_reference),'') is null
     or nullif(btrim(p_reason),'') is null
     or nullif(btrim(p_confirmation),'') is null then
    raise exception 'AFTER_SALES_SCOPE_LOCK_INPUT_INVALID'; end if;
  select x.* into c from public.school_request_after_sales_cases x
  where x.id=p_case_id for update;
  if not found then raise exception 'AFTER_SALES_CASE_NOT_FOUND'; end if;
  if c.request_id is distinct from p_request_id or c.invoice_id is distinct from p_invoice_id
    then raise exception 'AFTER_SALES_CASE_BINDING_MISMATCH'; end if;
  if c.scope_locked_at is not null then
    if c.scope_locked_revision=p_expected_revision+1
       and c.scope_locked_reason=btrim(p_reason)
       and c.scope_locked_by_actor_type=p_actor_type
       and c.scope_locked_by_actor_reference=btrim(p_actor_reference) then return c; end if;
    raise exception 'AFTER_SALES_SCOPE_ALREADY_LOCKED';
  end if;
  if c.case_status is distinct from p_expected_status
     or c.revision is distinct from p_expected_revision then return null; end if;
  if c.case_status in ('completed','rejected','cancelled','manual_review')
     or not exists(select 1 from public.school_request_after_sales_case_items i where i.case_id=p_case_id)
     or (c.scope_type='full' and exists(
       select 1 from public.school_request_invoice_items i
       where i.invoice_id=p_invoice_id and i.request_id=p_request_id
       and not exists(select 1 from public.school_request_after_sales_case_items ci
         where ci.case_id=p_case_id and ci.invoice_item_id=i.id
           and ci.requested_quantity=i.quantity))) then
    raise exception 'AFTER_SALES_SCOPE_LOCK_BLOCKED'; end if;
  update public.school_request_after_sales_cases x set
    scope_locked_at=now_value, scope_locked_revision=p_expected_revision+1,
    scope_locked_reason=btrim(p_reason), scope_locked_by_actor_type=p_actor_type,
    scope_locked_by_actor_reference=btrim(p_actor_reference),
    revision=p_expected_revision+1, updated_at=now_value
  where x.id=p_case_id and x.revision=p_expected_revision
  returning * into result_row;
  if not found then raise exception 'AFTER_SALES_INTERNAL_CAS_FAILURE'; end if;
  insert into public.school_request_after_sales_case_events(case_id,
    revision_before,revision_after,event_type,actor_type,actor_reference,
    reason,confirmation) values(p_case_id,p_expected_revision,
    p_expected_revision+1,'case_scope_locked',p_actor_type,
    btrim(p_actor_reference),btrim(p_reason),btrim(p_confirmation));
  return result_row;
end; $$;

create or replace function public.set_after_sales_fulfillment_hold(
  p_case_id uuid, p_request_id uuid, p_invoice_id uuid,
  p_expected_case_status text, p_expected_case_revision integer,
  p_expected_fulfillment_status text, p_expected_fulfillment_revision integer,
  p_actor_type text, p_actor_reference text, p_reason text,
  p_confirmation text
)
returns public.school_request_after_sales_cases
language plpgsql security definer set search_path=public,pg_temp
as $$
declare c public.school_request_after_sales_cases%rowtype;
  r public.school_requests%rowtype;
  result_row public.school_request_after_sales_cases%rowtype;
  now_value timestamptz:=clock_timestamp(); manual_release boolean;
begin
  if p_confirmation<>'CONFIRM_SET_AFTER_SALES_FULFILLMENT_HOLD'
     or p_actor_type not in ('admin','service','system')
     or nullif(btrim(p_actor_reference),'') is null
     or nullif(btrim(p_reason),'') is null then
    raise exception 'AFTER_SALES_HOLD_INPUT_INVALID'; end if;
  select x.* into c from public.school_request_after_sales_cases x where x.id=p_case_id for update;
  if not found then raise exception 'AFTER_SALES_CASE_NOT_FOUND'; end if;
  select x.* into r from public.school_requests x where x.id=p_request_id for update;
  if not found then raise exception 'AFTER_SALES_REQUEST_NOT_FOUND'; end if;
  if c.request_id<>p_request_id or c.invoice_id<>p_invoice_id
     or not exists(select 1 from public.school_request_invoices i where i.id=p_invoice_id and i.request_id=p_request_id)
    then raise exception 'AFTER_SALES_CASE_BINDING_MISMATCH'; end if;
  if c.case_status in ('completed','rejected','cancelled','manual_review')
     or r.fulfillment_status in ('unknown','shipped','delivered','picked_up','cancelled')
    then raise exception 'AFTER_SALES_HOLD_BLOCKED'; end if;
  if r.fulfillment_hold then
    if r.fulfillment_hold_case_id=p_case_id and r.fulfillment_hold_reason=btrim(p_reason) then return c; end if;
    raise exception 'AFTER_SALES_FOREIGN_HOLD'; end if;
  if c.case_status<>p_expected_case_status or c.revision<>p_expected_case_revision
     or r.fulfillment_status<>p_expected_fulfillment_status
     or r.fulfillment_revision<>p_expected_fulfillment_revision then return null; end if;
  manual_release := r.fulfillment_status in ('picking','picked','packed','pickup_ready','ready_for_pickup','shipping_ready')
    or r.picking_status in ('picking','picked','packed');
  update public.school_requests x set fulfillment_hold=true,
    fulfillment_hold_reason=btrim(p_reason),fulfillment_hold_set_at=now_value,
    fulfillment_hold_case_id=p_case_id,
    fulfillment_hold_status_snapshot=x.fulfillment_status,
    fulfillment_hold_picking_status_snapshot=x.picking_status,
    fulfillment_hold_requires_manual_release=manual_release,
    fulfillment_revision=x.fulfillment_revision+1,updated_at=now_value
  where x.id=p_request_id and x.fulfillment_revision=p_expected_fulfillment_revision;
  if not found then return null; end if;
  update public.school_request_after_sales_cases x set revision=x.revision+1,
    updated_at=now_value where x.id=p_case_id and x.revision=p_expected_case_revision
    returning * into result_row;
  if not found then raise exception 'AFTER_SALES_INTERNAL_CAS_FAILURE'; end if;
  insert into public.school_request_after_sales_case_events(case_id,revision_before,
    revision_after,event_type,actor_type,actor_reference,reason,confirmation)
  values(p_case_id,p_expected_case_revision,p_expected_case_revision+1,
    'fulfillment_hold_set',p_actor_type,btrim(p_actor_reference),
    btrim(p_reason),p_confirmation);
  return result_row;
end; $$;

create or replace function public.release_after_sales_fulfillment_hold(
  p_case_id uuid, p_request_id uuid, p_invoice_id uuid,
  p_expected_case_status text, p_expected_case_revision integer,
  p_expected_fulfillment_revision integer, p_expected_hold_set_at timestamptz,
  p_actor_type text, p_actor_reference text, p_reason text,
  p_confirmation text
)
returns public.school_request_after_sales_cases
language plpgsql security definer set search_path=public,pg_temp
as $$
declare c public.school_request_after_sales_cases%rowtype;
  r public.school_requests%rowtype;
  result_row public.school_request_after_sales_cases%rowtype;
  now_value timestamptz:=clock_timestamp();
begin
  select x.* into c from public.school_request_after_sales_cases x where x.id=p_case_id for update;
  if not found then raise exception 'AFTER_SALES_CASE_NOT_FOUND'; end if;
  select x.* into r from public.school_requests x where x.id=p_request_id for update;
  if not found then raise exception 'AFTER_SALES_REQUEST_NOT_FOUND'; end if;
  if c.request_id<>p_request_id or c.invoice_id<>p_invoice_id
    then raise exception 'AFTER_SALES_CASE_BINDING_MISMATCH'; end if;
  if not r.fulfillment_hold then return null; end if;
  if r.fulfillment_hold_case_id<>p_case_id
    then raise exception 'AFTER_SALES_FOREIGN_HOLD'; end if;
  if r.fulfillment_hold_set_at is distinct from p_expected_hold_set_at
    then raise exception 'AFTER_SALES_HOLD_BINDING_MISMATCH'; end if;
  if r.fulfillment_hold_requires_manual_release then
    if p_actor_type<>'admin'
       or p_confirmation<>'CONFIRM_MANUAL_AFTER_SALES_FULFILLMENT_RELEASE'
       or nullif(btrim(p_actor_reference),'') is null or nullif(btrim(p_reason),'') is null
      then raise exception 'AFTER_SALES_MANUAL_RELEASE_REQUIRED'; end if;
  elsif p_confirmation<>'CONFIRM_RELEASE_AFTER_SALES_FULFILLMENT_HOLD'
    then raise exception 'AFTER_SALES_RELEASE_INPUT_INVALID'; end if;
  if c.case_status<>p_expected_case_status or c.revision<>p_expected_case_revision
     or r.fulfillment_revision<>p_expected_fulfillment_revision then return null; end if;
  update public.school_requests x set fulfillment_hold=false,
    fulfillment_hold_reason=null,fulfillment_hold_set_at=null,
    fulfillment_hold_case_id=null,fulfillment_hold_status_snapshot=null,
    fulfillment_hold_picking_status_snapshot=null,
    fulfillment_hold_requires_manual_release=false,
    fulfillment_revision=x.fulfillment_revision+1,updated_at=now_value
  where x.id=p_request_id and x.fulfillment_revision=p_expected_fulfillment_revision;
  if not found then return null; end if;
  update public.school_request_after_sales_cases x set revision=x.revision+1,
    updated_at=now_value where x.id=p_case_id and x.revision=p_expected_case_revision
    returning * into result_row;
  if not found then raise exception 'AFTER_SALES_INTERNAL_CAS_FAILURE'; end if;
  insert into public.school_request_after_sales_case_events(case_id,revision_before,
    revision_after,event_type,actor_type,actor_reference,reason,confirmation)
  values(p_case_id,p_expected_case_revision,p_expected_case_revision+1,
    'fulfillment_hold_released',p_actor_type,btrim(p_actor_reference),
    btrim(p_reason),p_confirmation);
  return result_row;
end; $$;

create or replace function public.transition_school_request_after_sales_case(
  p_case_id uuid, p_request_id uuid, p_invoice_id uuid,
  p_expected_status text, p_expected_revision integer, p_target_status text,
  p_resolution_type text, p_return_state text,
  p_adjustment_requirement text, p_refund_requirement text,
  p_actor_type text, p_actor_reference text, p_reason text,
  p_confirmation text
)
returns public.school_request_after_sales_cases
language plpgsql security definer set search_path=public,pg_temp
as $$
declare c public.school_request_after_sales_cases%rowtype;
  result_row public.school_request_after_sales_cases%rowtype;
  r public.school_requests%rowtype; now_value timestamptz:=clock_timestamp();
  allowed boolean:=false; event_name text:='case_status_changed';
begin
  if p_actor_type not in ('admin','service','system')
     or nullif(btrim(p_actor_reference),'') is null
     or nullif(btrim(p_reason),'') is null
     or nullif(btrim(p_confirmation),'') is null then
    raise exception 'AFTER_SALES_TRANSITION_INPUT_INVALID'; end if;
  select x.* into c from public.school_request_after_sales_cases x where x.id=p_case_id for update;
  if not found then raise exception 'AFTER_SALES_CASE_NOT_FOUND'; end if;
  select x.* into r from public.school_requests x where x.id=p_request_id for share;
  if not found or c.request_id<>p_request_id or c.invoice_id<>p_invoice_id
    then raise exception 'AFTER_SALES_CASE_BINDING_MISMATCH'; end if;
  if c.case_status in ('completed','rejected','cancelled','manual_review')
    then raise exception 'AFTER_SALES_TRANSITION_SOURCE_BLOCKED'; end if;
  if c.case_status<>p_expected_status or c.revision<>p_expected_revision then return null; end if;
  allowed := case p_expected_status
    when 'received' then p_target_status in ('identity_pending','scope_pending','eligibility_review','hold_pending','in_review','cancelled')
    when 'identity_pending' then p_target_status in ('scope_pending','eligibility_review','in_review','rejected','cancelled')
    when 'scope_pending' then p_target_status in ('eligibility_review','hold_pending','in_review','cancelled')
    when 'eligibility_review' then p_target_status in ('hold_pending','in_review','awaiting_customer','awaiting_return','resolution_approved','rejected','cancelled')
    when 'hold_pending' then p_target_status in ('in_review','awaiting_customer','awaiting_return','resolution_approved','cancelled')
    when 'in_review' then p_target_status in ('awaiting_customer','awaiting_return','resolution_approved','rejected','cancelled')
    when 'awaiting_customer' then p_target_status in ('in_review','awaiting_return','resolution_approved','rejected','cancelled')
    when 'awaiting_return' then p_target_status in ('return_in_transit','return_received','in_review','cancelled')
    when 'return_in_transit' then p_target_status in ('return_received','in_review')
    when 'return_received' then p_target_status in ('return_inspection','resolution_approved')
    when 'return_inspection' then p_target_status in ('resolution_approved','in_review')
    when 'resolution_approved' then p_target_status in ('adjustment_pending','refund_pending','replacement_pending','completed')
    when 'adjustment_pending' then p_target_status in ('adjustment_processing','refund_pending','completed')
    when 'adjustment_processing' then p_target_status in ('refund_pending','completed')
    when 'refund_pending' then p_target_status in ('refund_processing','completed')
    when 'refund_processing' then p_target_status='completed'
    when 'replacement_pending' then p_target_status in ('replacement_processing','completed')
    when 'replacement_processing' then p_target_status='completed'
    else false end;
  if not allowed or p_target_status='manual_review' then
    raise exception 'AFTER_SALES_TRANSITION_NOT_ALLOWED'; end if;
  if p_target_status='completed' and (
      r.fulfillment_hold or c.scope_locked_at is null
      or coalesce(p_return_state,c.return_state) not in ('not_required','waived','closed')
      or coalesce(p_adjustment_requirement,c.adjustment_requirement) not in ('not_required','completed')
      or coalesce(p_refund_requirement,c.refund_requirement) not in ('not_required','completed')
      or coalesce(p_resolution_type,c.resolution_type) is null) then
    raise exception 'AFTER_SALES_COMPLETION_BLOCKED'; end if;
  if p_target_status='rejected' then event_name:='case_rejected';
  elsif p_target_status='cancelled' then event_name:='case_cancelled';
  elsif p_target_status='completed' then event_name:='case_completed'; end if;
  update public.school_request_after_sales_cases x set
    case_status=p_target_status,
    resolution_type=coalesce(p_resolution_type,x.resolution_type),
    return_state=coalesce(p_return_state,x.return_state),
    adjustment_requirement=coalesce(p_adjustment_requirement,x.adjustment_requirement),
    refund_requirement=coalesce(p_refund_requirement,x.refund_requirement),
    completed_at=case when p_target_status='completed' then now_value else null end,
    rejected_at=case when p_target_status='rejected' then now_value else null end,
    cancelled_at=case when p_target_status='cancelled' then now_value else null end,
    revision=x.revision+1,updated_at=now_value
  where x.id=p_case_id and x.case_status=p_expected_status and x.revision=p_expected_revision
  returning * into result_row;
  if not found then raise exception 'AFTER_SALES_INTERNAL_CAS_FAILURE'; end if;
  insert into public.school_request_after_sales_case_events(case_id,revision_before,
    revision_after,event_type,previous_status,next_status,actor_type,
    actor_reference,reason,confirmation) values(p_case_id,p_expected_revision,
    p_expected_revision+1,event_name,p_expected_status,p_target_status,
    p_actor_type,btrim(p_actor_reference),btrim(p_reason),btrim(p_confirmation));
  return result_row;
end; $$;

create or replace function public.enter_after_sales_case_manual_review(
  p_case_id uuid,p_request_id uuid,p_invoice_id uuid,
  p_expected_status text,p_expected_revision integer,
  p_actor_type text,p_actor_reference text,p_reason text,p_confirmation text
)
returns public.school_request_after_sales_cases
language plpgsql security definer set search_path=public,pg_temp
as $$
declare c public.school_request_after_sales_cases%rowtype;
  result_row public.school_request_after_sales_cases%rowtype;
  now_value timestamptz:=clock_timestamp();
begin
  if p_actor_type not in ('admin','service','system')
     or nullif(btrim(p_actor_reference),'') is null
     or nullif(btrim(p_reason),'') is null
     or nullif(btrim(p_confirmation),'') is null then
    raise exception 'AFTER_SALES_MANUAL_REVIEW_INPUT_INVALID'; end if;
  select x.* into c from public.school_request_after_sales_cases x where x.id=p_case_id for update;
  if not found then raise exception 'AFTER_SALES_CASE_NOT_FOUND'; end if;
  if c.request_id<>p_request_id or c.invoice_id<>p_invoice_id
    then raise exception 'AFTER_SALES_CASE_BINDING_MISMATCH'; end if;
  if c.case_status='manual_review' and c.manual_review_reason=btrim(p_reason) then
    if exists (
      select 1 from public.school_request_after_sales_case_events e
      where e.case_id=p_case_id and e.revision_after=c.revision
        and e.event_type='manual_review_entered'
        and e.actor_type=p_actor_type
        and e.actor_reference=btrim(p_actor_reference)
        and e.reason=btrim(p_reason)
        and e.confirmation is not distinct from btrim(p_confirmation)
    ) then return c; end if;
    raise exception 'AFTER_SALES_MANUAL_REVIEW_BINDING_MISMATCH';
  end if;
  if c.case_status in ('completed','rejected','cancelled')
    then raise exception 'AFTER_SALES_MANUAL_REVIEW_BLOCKED'; end if;
  if c.case_status<>p_expected_status or c.revision<>p_expected_revision then return null; end if;
  update public.school_request_after_sales_cases x set case_status='manual_review',
    manual_review_reason=btrim(p_reason),manual_review_set_at=now_value,
    revision=x.revision+1,updated_at=now_value
  where x.id=p_case_id and x.revision=p_expected_revision returning * into result_row;
  insert into public.school_request_after_sales_case_events(case_id,revision_before,
    revision_after,event_type,previous_status,next_status,actor_type,
    actor_reference,reason,confirmation) values(p_case_id,p_expected_revision,
    p_expected_revision+1,'manual_review_entered',p_expected_status,'manual_review',
    p_actor_type,btrim(p_actor_reference),btrim(p_reason),btrim(p_confirmation));
  return result_row;
end; $$;

create or replace function public.resolve_after_sales_case_manual_review(
  p_case_id uuid,p_request_id uuid,p_invoice_id uuid,
  p_expected_revision integer,p_target_status text,
  p_actor_type text,p_actor_reference text,p_reason text,p_confirmation text
)
returns public.school_request_after_sales_cases
language plpgsql security definer set search_path=public,pg_temp
as $$
declare c public.school_request_after_sales_cases%rowtype;
  result_row public.school_request_after_sales_cases%rowtype;
  now_value timestamptz:=clock_timestamp();
begin
  if p_actor_type<>'admin'
     or p_confirmation<>'CONFIRM_RESOLVE_AFTER_SALES_MANUAL_REVIEW'
     or p_target_status not in ('in_review','eligibility_review','scope_pending','awaiting_customer')
     or nullif(btrim(p_actor_reference),'') is null
     or length(btrim(coalesce(p_reason,'')))<10 then
    raise exception 'AFTER_SALES_MANUAL_REVIEW_RESOLVE_INPUT_INVALID'; end if;
  select x.* into c from public.school_request_after_sales_cases x where x.id=p_case_id for update;
  if not found then raise exception 'AFTER_SALES_CASE_NOT_FOUND'; end if;
  if c.request_id<>p_request_id or c.invoice_id<>p_invoice_id
    then raise exception 'AFTER_SALES_CASE_BINDING_MISMATCH'; end if;
  if c.case_status=p_target_status and c.manual_review_reason is null then return null; end if;
  if c.case_status<>'manual_review' then raise exception 'AFTER_SALES_MANUAL_REVIEW_REQUIRED'; end if;
  if c.revision<>p_expected_revision then return null; end if;
  update public.school_request_after_sales_cases x set case_status=p_target_status,
    manual_review_reason=null,manual_review_set_at=null,
    revision=x.revision+1,updated_at=now_value
  where x.id=p_case_id and x.case_status='manual_review'
    and x.revision=p_expected_revision returning * into result_row;
  insert into public.school_request_after_sales_case_events(case_id,revision_before,
    revision_after,event_type,previous_status,next_status,actor_type,
    actor_reference,reason,confirmation) values(p_case_id,p_expected_revision,
    p_expected_revision+1,'manual_review_resolved','manual_review',p_target_status,
    p_actor_type,btrim(p_actor_reference),btrim(p_reason),p_confirmation);
  return result_row;
end; $$;

alter function public.create_school_request_after_sales_case(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text) owner to postgres;
alter function public.replace_school_request_after_sales_case_scope(uuid,uuid,uuid,text,integer,jsonb,text,text,text,text) owner to postgres;
alter function public.lock_school_request_after_sales_case_scope(uuid,uuid,uuid,text,integer,text,text,text,text) owner to postgres;
alter function public.set_after_sales_fulfillment_hold(uuid,uuid,uuid,text,integer,text,integer,text,text,text,text) owner to postgres;
alter function public.release_after_sales_fulfillment_hold(uuid,uuid,uuid,text,integer,integer,timestamptz,text,text,text,text) owner to postgres;
alter function public.transition_school_request_after_sales_case(uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,text,text) owner to postgres;
alter function public.enter_after_sales_case_manual_review(uuid,uuid,uuid,text,integer,text,text,text,text) owner to postgres;
alter function public.resolve_after_sales_case_manual_review(uuid,uuid,uuid,integer,text,text,text,text,text) owner to postgres;
comment on function public.create_school_request_after_sales_case(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text)
  is 'Object-bound Phase A case creation with server-validated snapshots and one atomic creation event.';
comment on function public.replace_school_request_after_sales_case_scope(uuid,uuid,uuid,text,integer,jsonb,text,text,text,text)
  is 'CAS replacement of the complete unlocked case scope; all financial snapshots come from invoice items.';
comment on function public.lock_school_request_after_sales_case_scope(uuid,uuid,uuid,text,integer,text,text,text,text)
  is 'CAS scope lock with an atomic revision-bound event.';
comment on function public.set_after_sales_fulfillment_hold(uuid,uuid,uuid,text,integer,text,integer,text,text,text,text)
  is 'Object-bound atomic fulfillment hold; no provider operation.';
comment on function public.release_after_sales_fulfillment_hold(uuid,uuid,uuid,text,integer,integer,timestamptz,text,text,text,text)
  is 'Object-bound explicit fulfillment hold release with stricter admin confirmation for manual release.';
comment on function public.transition_school_request_after_sales_case(uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,text,text)
  is 'DB-enforced Phase A transition allowlist; cannot leave manual_review.';
comment on function public.enter_after_sales_case_manual_review(uuid,uuid,uuid,text,integer,text,text,text,text)
  is 'Dedicated CAS entry into manual review.';
comment on function public.resolve_after_sales_case_manual_review(uuid,uuid,uuid,integer,text,text,text,text,text)
  is 'Dedicated admin-only CAS resolution of manual review into a reversible state.';

revoke all on function public.create_school_request_after_sales_case(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.replace_school_request_after_sales_case_scope(uuid,uuid,uuid,text,integer,jsonb,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.lock_school_request_after_sales_case_scope(uuid,uuid,uuid,text,integer,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.set_after_sales_fulfillment_hold(uuid,uuid,uuid,text,integer,text,integer,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.release_after_sales_fulfillment_hold(uuid,uuid,uuid,text,integer,integer,timestamptz,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.transition_school_request_after_sales_case(uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.enter_after_sales_case_manual_review(uuid,uuid,uuid,text,integer,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.resolve_after_sales_case_manual_review(uuid,uuid,uuid,integer,text,text,text,text,text) from public,anon,authenticated,service_role;

grant execute on function public.create_school_request_after_sales_case(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text) to service_role;
grant execute on function public.replace_school_request_after_sales_case_scope(uuid,uuid,uuid,text,integer,jsonb,text,text,text,text) to service_role;
grant execute on function public.lock_school_request_after_sales_case_scope(uuid,uuid,uuid,text,integer,text,text,text,text) to service_role;
grant execute on function public.set_after_sales_fulfillment_hold(uuid,uuid,uuid,text,integer,text,integer,text,text,text,text) to service_role;
grant execute on function public.release_after_sales_fulfillment_hold(uuid,uuid,uuid,text,integer,integer,timestamptz,text,text,text,text) to service_role;
grant execute on function public.transition_school_request_after_sales_case(uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,text,text) to service_role;
grant execute on function public.enter_after_sales_case_manual_review(uuid,uuid,uuid,text,integer,text,text,text,text) to service_role;
grant execute on function public.resolve_after_sales_case_manual_review(uuid,uuid,uuid,integer,text,text,text,text,text) to service_role;

commit;
