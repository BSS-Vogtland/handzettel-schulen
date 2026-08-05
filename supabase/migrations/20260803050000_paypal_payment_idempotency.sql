begin;

alter table public.school_request_invoices
  add column if not exists paypal_payment_fingerprint text,
  add column if not exists paypal_create_request_id text,
  add column if not exists paypal_capture_request_id text,
  add column if not exists paypal_webhook_event_id text,
  add column if not exists paypal_captured_amount_cents bigint,
  add column if not exists paypal_captured_currency text,
  add column if not exists paypal_payment_source text,
  add column if not exists paypal_follow_up_state text,
  add column if not exists paypal_follow_up_claimed_at timestamptz,
  add column if not exists paypal_follow_up_claimed_by text,
  add column if not exists paypal_follow_up_completed_at timestamptz,
  add column if not exists paypal_follow_up_last_error_code text,
  add column if not exists paypal_follow_up_last_error_message text,
  add column if not exists paypal_follow_up_attempt_count integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.school_request_invoices'::regclass
      and conname = 'school_request_invoices_paypal_follow_up_state_check'
  ) then
    alter table public.school_request_invoices
      add constraint school_request_invoices_paypal_follow_up_state_check
      check (paypal_follow_up_state is null or paypal_follow_up_state in
        ('pending', 'processing', 'completed', 'failed_retryable', 'failed_terminal'));
  end if;
end $$;

create unique index if not exists school_request_invoices_paypal_order_unique
  on public.school_request_invoices (paypal_order_id) where paypal_order_id is not null;
create unique index if not exists school_request_invoices_paypal_capture_unique
  on public.school_request_invoices (paypal_capture_id) where paypal_capture_id is not null;
create unique index if not exists school_request_invoices_paypal_event_unique
  on public.school_request_invoices (paypal_webhook_event_id) where paypal_webhook_event_id is not null;
create unique index if not exists school_request_invoices_paypal_create_request_unique
  on public.school_request_invoices (paypal_create_request_id) where paypal_create_request_id is not null;
create unique index if not exists school_request_invoices_paypal_capture_request_unique
  on public.school_request_invoices (paypal_capture_request_id) where paypal_capture_request_id is not null;

create or replace function public.register_paypal_order(
  p_invoice_id uuid, p_fingerprint text, p_create_request_id text,
  p_order_id text, p_provider_payload jsonb, p_now timestamptz
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v public.school_request_invoices%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'not authorized'; end if;
  select * into v from public.school_request_invoices where id = p_invoice_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if v.paypal_order_id is not null then
    if v.paypal_payment_fingerprint = p_fingerprint then
      return jsonb_build_object('status','existing','order_id',v.paypal_order_id);
    end if;
    return jsonb_build_object('status','fingerprint_mismatch');
  end if;
  update public.school_request_invoices set
    paypal_order_id=p_order_id, paypal_payment_fingerprint=p_fingerprint,
    paypal_create_request_id=p_create_request_id, payment_provider_payload=p_provider_payload,
    selected_payment_method='paypal', payment_status='waiting_for_payment',
    payment_provider='paypal', paypal_payment_status='created',
    payment_provider_reference=p_order_id, payment_provider_status='created', updated_at=p_now
  where id=p_invoice_id;
  return jsonb_build_object('status','registered','order_id',p_order_id);
exception when unique_violation then return jsonb_build_object('status','conflict');
end $$;

create or replace function public.claim_verified_paypal_payment(
  p_invoice_id uuid, p_order_id text, p_fingerprint text,
  p_capture_request_id text, p_capture_id text, p_amount_cents bigint,
  p_currency text, p_event_id text, p_source text, p_now timestamptz
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v public.school_request_invoices%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'not authorized'; end if;
  select * into v from public.school_request_invoices where id=p_invoice_id for update;
  if not found then return jsonb_build_object('status','conflict','reason','ORDER_NOT_FOUND'); end if;
  if v.paypal_order_id is distinct from p_order_id
     or v.paypal_payment_fingerprint is distinct from p_fingerprint then
    return jsonb_build_object('status','conflict','reason','ORDER_MISMATCH');
  end if;
  if p_capture_id is null or btrim(p_capture_id) = '' then
    return jsonb_build_object('status','conflict','reason','CAPTURE_ID_MISSING');
  end if;
  if upper(coalesce(p_currency,'')) <> 'EUR' or p_amount_cents is null
     or p_amount_cents <> round(v.total_amount::numeric * 100)::bigint then
    return jsonb_build_object('status','conflict','reason','CAPTURE_AMOUNT_MISMATCH');
  end if;
  if v.payment_status = 'payment_received' then
    if v.paypal_capture_id = p_capture_id
       and v.paypal_captured_amount_cents = p_amount_cents
       and v.paypal_captured_currency = upper(p_currency) then
      if p_event_id is not null and v.paypal_webhook_event_id is null then
        update public.school_request_invoices
        set paypal_webhook_event_id=p_event_id, updated_at=p_now
        where id=v.id;
      end if;
      return jsonb_build_object('status','already_claimed_same_payment');
    end if;
    return jsonb_build_object('status','conflict','reason','CAPTURE_ID_CONFLICT');
  end if;
  update public.school_request_invoices set
    payment_status='payment_received', selected_payment_method='paypal', payment_provider='paypal',
    paypal_payment_status='completed', paypal_capture_id=p_capture_id,
    paypal_capture_request_id=p_capture_request_id, paypal_webhook_event_id=p_event_id,
    paypal_captured_amount_cents=p_amount_cents, paypal_captured_currency=upper(p_currency),
    paypal_payment_source=p_source, payment_provider_reference=p_order_id,
    payment_provider_status='completed', payment_received_at=p_now, paid_at=p_now,
    paypal_follow_up_state='pending', paypal_follow_up_claimed_at=null,
    paypal_follow_up_claimed_by=null, paypal_follow_up_completed_at=null,
    paypal_follow_up_last_error_code=null, paypal_follow_up_last_error_message=null,
    updated_at=p_now
  where id=p_invoice_id;
  return jsonb_build_object('status','claimed_now');
exception when unique_violation then
  return jsonb_build_object('status','conflict','reason','CAPTURE_ID_CONFLICT');
end $$;

create or replace function public.claim_paypal_payment_follow_up(
  p_invoice_id uuid, p_order_id text, p_capture_id text,
  p_amount_cents bigint, p_currency text, p_claimed_by text, p_now timestamptz
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v public.school_request_invoices%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'not authorized'; end if;
  select * into v from public.school_request_invoices where id=p_invoice_id for update;
  if not found then return jsonb_build_object('status','conflict','reason','ORDER_NOT_FOUND'); end if;
  if v.payment_status <> 'payment_received' or v.paypal_order_id is distinct from p_order_id
     or v.paypal_capture_id is distinct from p_capture_id
     or v.paypal_captured_amount_cents is distinct from p_amount_cents
     or v.paypal_captured_currency is distinct from upper(p_currency) then
    return jsonb_build_object('status','conflict','reason','PAYMENT_IDENTITY_MISMATCH');
  end if;
  if v.paypal_follow_up_state is null then
    return jsonb_build_object('status','legacy_unadopted');
  end if;
  if v.paypal_follow_up_state = 'completed' then return jsonb_build_object('status','completed'); end if;
  if v.paypal_follow_up_state = 'failed_terminal' then return jsonb_build_object('status','failed_terminal'); end if;
  if v.paypal_follow_up_state = 'processing'
     and v.paypal_follow_up_claimed_at >= p_now - interval '5 minutes' then
    return jsonb_build_object('status','in_progress');
  end if;
  update public.school_request_invoices set
    paypal_follow_up_state='processing', paypal_follow_up_claimed_at=p_now,
    paypal_follow_up_claimed_by=p_claimed_by,
    paypal_follow_up_attempt_count=paypal_follow_up_attempt_count+1,
    paypal_follow_up_last_error_code=null, paypal_follow_up_last_error_message=null,
    updated_at=p_now
  where id=p_invoice_id;
  return jsonb_build_object('status','claimed');
end $$;

create or replace function public.complete_paypal_payment_follow_up(
  p_invoice_id uuid, p_order_id text, p_capture_id text,
  p_amount_cents bigint, p_currency text, p_claimed_by text,
  p_source text, p_event_id text, p_now timestamptz
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v public.school_request_invoices%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'not authorized'; end if;
  select * into v from public.school_request_invoices where id=p_invoice_id for update;
  if not found then return jsonb_build_object('status','conflict','reason','ORDER_NOT_FOUND'); end if;
  if v.paypal_follow_up_state = 'completed' then return jsonb_build_object('status','completed'); end if;
  if v.paypal_follow_up_state <> 'processing' or v.paypal_follow_up_claimed_by is distinct from p_claimed_by
     or v.paypal_order_id is distinct from p_order_id or v.paypal_capture_id is distinct from p_capture_id
     or v.paypal_captured_amount_cents is distinct from p_amount_cents
     or v.paypal_captured_currency is distinct from upper(p_currency) then
    return jsonb_build_object('status','conflict','reason','FOLLOW_UP_CLAIM_MISMATCH');
  end if;

  update public.school_requests set
    selected_payment_method='paypal', payment_status='payment_received',
    payment_received_at=p_now, latest_invoice_id=v.id, updated_at=p_now
  where id=v.request_id;
  if not found then raise exception 'PAYPAL_REQUEST_NOT_FOUND'; end if;

  insert into public.school_request_payment_events (
    invoice_id, request_id, event_type, payment_method, payment_provider,
    amount, currency, provider_reference, provider_status, provider_payload, message, created_at
  ) values (
    v.id, v.request_id, 'paypal_payment_completed', 'paypal', 'paypal',
    v.total_amount, upper(p_currency), p_capture_id, 'completed',
    jsonb_build_object('source',p_source,'event_id',p_event_id),
    'PayPal-Zahlung wurde serverseitig verifiziert und abgeschlossen.', p_now
  );

  insert into public.school_request_events (
    request_id, event_type, title, message, description, metadata, created_at
  ) values (
    v.request_id, 'paypal_payment_completed', 'PayPal-Zahlung abgeschlossen',
    'Die PayPal-Zahlung wurde serverseitig verifiziert.',
    'Die PayPal-Zahlung wurde serverseitig verifiziert.',
    jsonb_build_object('invoice_id',v.id,'paypal_order_id',p_order_id,
      'paypal_capture_id',p_capture_id,'source',p_source,'event_id',p_event_id), p_now
  );

  update public.school_request_invoices set
    paypal_follow_up_state='completed', paypal_follow_up_completed_at=p_now,
    paypal_follow_up_claimed_at=null, paypal_follow_up_claimed_by=null,
    paypal_follow_up_last_error_code=null, paypal_follow_up_last_error_message=null,
    updated_at=p_now
  where id=v.id;
  return jsonb_build_object('status','completed_now');
end $$;

create or replace function public.fail_paypal_payment_follow_up(
  p_invoice_id uuid, p_claimed_by text, p_error_code text,
  p_error_message text, p_terminal boolean, p_now timestamptz
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'not authorized'; end if;
  update public.school_request_invoices set
    paypal_follow_up_state=case when p_terminal then 'failed_terminal' else 'failed_retryable' end,
    paypal_follow_up_claimed_at=null, paypal_follow_up_claimed_by=null,
    paypal_follow_up_last_error_code=left(coalesce(p_error_code,'FOLLOW_UP_FAILED'),100),
    paypal_follow_up_last_error_message=left(coalesce(p_error_message,'PayPal follow-up failed'),500),
    updated_at=p_now
  where id=p_invoice_id and paypal_follow_up_state='processing'
    and paypal_follow_up_claimed_by=p_claimed_by;
  if not found then return jsonb_build_object('status','claim_lost'); end if;
  return jsonb_build_object('status',case when p_terminal then 'failed_terminal' else 'failed_retryable' end);
end $$;

revoke all on function public.register_paypal_order(uuid,text,text,text,jsonb,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.claim_verified_paypal_payment(uuid,text,text,text,text,bigint,text,text,text,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.claim_paypal_payment_follow_up(uuid,text,text,bigint,text,text,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.complete_paypal_payment_follow_up(uuid,text,text,bigint,text,text,text,text,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.fail_paypal_payment_follow_up(uuid,text,text,text,boolean,timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.register_paypal_order(uuid,text,text,text,jsonb,timestamptz) to service_role;
grant execute on function public.claim_verified_paypal_payment(uuid,text,text,text,text,bigint,text,text,text,timestamptz) to service_role;
grant execute on function public.claim_paypal_payment_follow_up(uuid,text,text,bigint,text,text,timestamptz) to service_role;
grant execute on function public.complete_paypal_payment_follow_up(uuid,text,text,bigint,text,text,text,text,timestamptz) to service_role;
grant execute on function public.fail_paypal_payment_follow_up(uuid,text,text,text,boolean,timestamptz) to service_role;

commit;
