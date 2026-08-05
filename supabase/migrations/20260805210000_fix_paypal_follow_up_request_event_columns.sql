begin;

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
    request_id, event_type, title, description, metadata, created_at
  ) values (
    v.request_id, 'paypal_payment_completed', 'PayPal-Zahlung abgeschlossen',
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

revoke all on function public.complete_paypal_payment_follow_up(uuid,text,text,bigint,text,text,text,text,timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_paypal_payment_follow_up(uuid,text,text,bigint,text,text,text,text,timestamptz)
  to service_role;

commit;
