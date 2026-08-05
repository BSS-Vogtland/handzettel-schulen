begin;

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
    payment_provider_status='completed', paid_at=p_now,
    paypal_follow_up_state='pending', paypal_follow_up_claimed_at=null,
    paypal_follow_up_claimed_by=null, paypal_follow_up_completed_at=null,
    paypal_follow_up_last_error_code=null, paypal_follow_up_last_error_message=null,
    updated_at=p_now
  where id=p_invoice_id;
  return jsonb_build_object('status','claimed_now');
exception when unique_violation then
  return jsonb_build_object('status','conflict','reason','CAPTURE_ID_CONFLICT');
end $$;

revoke all on function public.claim_verified_paypal_payment(uuid,text,text,text,text,bigint,text,text,text,timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_verified_paypal_payment(uuid,text,text,text,text,bigint,text,text,text,timestamptz)
  to service_role;

commit;
