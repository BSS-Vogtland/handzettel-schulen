begin;

create or replace function public.audit_school_lexware_invoice_job_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invoice_row public.school_request_invoices%rowtype;
begin
  if tg_op = 'INSERT' then
    if new.trigger_source = 'admin_manual_enqueue' then
      select * into invoice_row
      from public.school_request_invoices
      where id = new.local_invoice_id;

      insert into public.school_lexware_outbox_events (
        request_id, invoice_job_id, mail_job_id, event_type,
        from_status, to_status, attempt_count, metadata, created_at
      ) values (
        new.request_id, new.id, null, 'invoice_job_enqueued',
        null, new.status, new.attempt_count,
        jsonb_build_object(
          'local_invoice_id', new.local_invoice_id,
          'invoice_number', invoice_row.invoice_number,
          'invoice_job_id', new.id,
          'snapshot_version', invoice_row.tax_snapshot_version,
          'payload_sha256', new.payload_sha256,
          'source', 'admin_manual_enqueue'
        ),
        clock_timestamp()
      );
    else
      insert into public.school_lexware_outbox_events (
        request_id, invoice_job_id, mail_job_id, event_type,
        from_status, to_status, attempt_count, metadata, created_at
      ) values (
        new.request_id, new.id, null, 'invoice_job_enqueued',
        null, new.status, new.attempt_count,
        jsonb_build_object(
          'idempotency_key', new.idempotency_key,
          'trigger_source', new.trigger_source,
          'target_organization_id', new.target_organization_id,
          'payment_method', new.payment_method,
          'payment_provider', new.payment_provider
        ),
        clock_timestamp()
      );
    end if;
    return new;
  end if;

  if old.status is distinct from new.status then
    insert into public.school_lexware_outbox_events (
      request_id, invoice_job_id, mail_job_id, event_type,
      from_status, to_status, attempt_count, metadata, created_at
    ) values (
      new.request_id, new.id, null, 'invoice_job_status_changed',
      old.status, new.status, new.attempt_count,
      jsonb_strip_nulls(jsonb_build_object(
        'lexware_invoice_id', new.lexware_invoice_id,
        'lexware_invoice_number', new.lexware_invoice_number,
        'last_error_code', new.last_error_code
      )),
      clock_timestamp()
    );
  end if;
  return new;
end;
$$;

create or replace function public.enqueue_existing_v2_lexware_invoice_job(
  p_local_invoice_id uuid,
  p_idempotency_key text,
  p_payload_snapshot jsonb,
  p_payload_sha256 text,
  p_expected_snapshot_at timestamptz,
  p_expected_item_count integer
)
returns table (
  invoice_job_id uuid,
  job_status text,
  job_creation_state text,
  payload_sha256 text,
  idempotency_key text,
  created_new_job boolean,
  linked_invoice boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  settings_row public.business_runtime_settings%rowtype;
  invoice_row public.school_request_invoices%rowtype;
  job_row public.school_lexware_invoice_jobs%rowtype;
  candidate_ids uuid[];
  locked_request_id uuid;
  item_count integer;
  created_new boolean := false;
  invoice_was_linked boolean := false;
begin
  if p_local_invoice_id is null then raise exception 'LOCAL_INVOICE_ID_REQUIRED'; end if;
  if btrim(coalesce(p_idempotency_key, '')) = '' then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if p_idempotency_key <> 'lexware:local-invoice:' || p_local_invoice_id::text || ':v1' then raise exception 'IDEMPOTENCY_KEY_INVALID'; end if;
  if p_payload_snapshot is null or jsonb_typeof(p_payload_snapshot) <> 'object' then raise exception 'PAYLOAD_SNAPSHOT_INVALID'; end if;
  if p_payload_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'PAYLOAD_SHA256_INVALID'; end if;
  if p_expected_snapshot_at is null then raise exception 'SNAPSHOT_TIMESTAMP_REQUIRED'; end if;
  if p_expected_item_count is null or p_expected_item_count < 1 then raise exception 'ITEM_COUNT_INVALID'; end if;

  select * into settings_row from public.business_runtime_settings where id = 'default';
  if not found then raise exception 'RUNTIME_SETTINGS_MISSING'; end if;
  if nullif(btrim(settings_row.lexware_production_organization_id), '') is null
     or nullif(btrim(settings_row.lexware_production_credential_alias), '') is null then
    raise exception 'PRODUCTION_JOB_TARGET_CONFIGURATION_MISSING';
  end if;

  select * into invoice_row
  from public.school_request_invoices
  where id = p_local_invoice_id;
  if not found then raise exception 'LOCAL_INVOICE_NOT_FOUND'; end if;
  if invoice_row.request_id is null then raise exception 'REQUEST_ID_MISSING'; end if;
  locked_request_id := invoice_row.request_id;

  perform 1 from public.school_requests where id = locked_request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;

  select coalesce(array_agg(distinct candidate_id), '{}'::uuid[]) into candidate_ids
  from (
    select invoice_row.lexware_invoice_job_id as candidate_id
    union all select id from public.school_lexware_invoice_jobs where local_invoice_id = invoice_row.id
    union all select id from public.school_lexware_invoice_jobs where school_lexware_invoice_jobs.idempotency_key = p_idempotency_key
    union all select id from public.school_lexware_invoice_jobs where request_id = locked_request_id
  ) candidates
  where candidate_id is not null;
  if cardinality(candidate_ids) > 1 then raise exception 'CONFLICTING_INVOICE_JOB_LINKS'; end if;

  if cardinality(candidate_ids) = 1 then
    select * into job_row
    from public.school_lexware_invoice_jobs
    where id = candidate_ids[1]
    for update;
  end if;

  select * into invoice_row
  from public.school_request_invoices
  where id = p_local_invoice_id
  for update;
  if not found or invoice_row.request_id is distinct from locked_request_id then raise exception 'LOCAL_INVOICE_IDENTITY_CHANGED'; end if;

  if invoice_row.invoice_status is null
     or invoice_row.invoice_status not in ('draft', 'sent')
     or invoice_row.payment_status = 'cancelled' then
    raise exception 'LOCAL_INVOICE_NOT_ELIGIBLE';
  end if;
  if invoice_row.invoice_cutover_version is null then raise exception 'LOCAL_INVOICE_CUTOVER_VERSION_MISSING'; end if;
  if invoice_row.invoice_provider = 'legacy_internal'
     and (invoice_row.lexware_invoice_id is not null
       or invoice_row.lexware_invoice_number is not null
       or invoice_row.lexware_organization_id is not null) then
    raise exception 'LOCAL_INVOICE_LEXWARE_IDENTITY_CONFLICT';
  end if;
  if invoice_row.tax_snapshot_status is distinct from 'complete'
     or invoice_row.tax_snapshot_version is distinct from 'invoice-tax-snapshot-v2'
     or invoice_row.tax_snapshot_source is distinct from 'product_catalog_at_checkout'
     or invoice_row.tax_snapshot_at is distinct from p_expected_snapshot_at
     or invoice_row.tax_breakdown_snapshot is null
     or invoice_row.total_net_amount_snapshot is null
     or invoice_row.total_tax_amount_snapshot is null
     or invoice_row.total_amount is null then
    raise exception 'LOCAL_INVOICE_V2_SNAPSHOT_INVALID';
  end if;
  if abs(invoice_row.total_net_amount_snapshot + invoice_row.total_tax_amount_snapshot - invoice_row.total_amount) > 0.01 then raise exception 'LOCAL_INVOICE_TOTAL_MISMATCH'; end if;

  select count(*)::integer into item_count
  from public.school_request_invoice_items item
  where item.invoice_id = invoice_row.id;
  if item_count <> p_expected_item_count then raise exception 'LOCAL_INVOICE_ITEM_COUNT_CHANGED'; end if;
  if exists (
    select 1 from public.school_request_invoice_items item
    where item.invoice_id = invoice_row.id
      and (item.tax_snapshot_version is distinct from invoice_row.tax_snapshot_version
        or item.tax_snapshot_source is distinct from invoice_row.tax_snapshot_source
        or item.tax_snapshot_at is distinct from invoice_row.tax_snapshot_at
        or item.product_gross_amount_snapshot is null
        or item.product_net_amount_snapshot is null
        or item.product_tax_amount_snapshot is null
        or abs(item.product_net_amount_snapshot + item.product_tax_amount_snapshot - item.product_gross_amount_snapshot) > 0.01)
  ) then raise exception 'LOCAL_INVOICE_ITEM_SNAPSHOT_INVALID'; end if;

  if cardinality(candidate_ids) = 0
     and invoice_row.lexware_invoice_job_id is not null then
    raise exception 'LOCAL_INVOICE_JOB_LINK_CHANGED';
  end if;

  if cardinality(candidate_ids) = 1 then
    if job_row.request_id <> invoice_row.request_id
       or job_row.local_invoice_id is distinct from invoice_row.id
       or job_row.idempotency_key <> p_idempotency_key then
      raise exception 'EXISTING_INVOICE_JOB_IDENTITY_CONFLICT';
    end if;
    if job_row.payload_sha256 <> p_payload_sha256 then raise exception 'EXISTING_INVOICE_JOB_PAYLOAD_CONFLICT'; end if;
    if invoice_row.lexware_invoice_job_id is not null
       and invoice_row.lexware_invoice_job_id <> job_row.id then raise exception 'INVOICE_JOB_LINK_CONFLICT'; end if;
    if invoice_row.lexware_invoice_id is distinct from job_row.lexware_invoice_id
       or invoice_row.lexware_invoice_number is distinct from job_row.lexware_invoice_number then
      if invoice_row.lexware_invoice_id is not null
         or invoice_row.lexware_invoice_number is not null
         or job_row.lexware_invoice_id is not null
         or job_row.lexware_invoice_number is not null then
        raise exception 'LEXWARE_IDENTITY_CONFLICT';
      end if;
    end if;
  else
    insert into public.school_lexware_invoice_jobs (
      request_id, local_invoice_id, idempotency_key, cutover_version,
      target_organization_id, credential_alias_snapshot, trigger_source,
      payment_method, status, creation_state, attempt_count, max_attempts,
      next_attempt_at, payload_snapshot, payload_sha256
    ) values (
      invoice_row.request_id, invoice_row.id, p_idempotency_key,
      invoice_row.invoice_cutover_version,
      settings_row.lexware_production_organization_id,
      settings_row.lexware_production_credential_alias,
      'admin_manual_enqueue', invoice_row.selected_payment_method,
      'waiting_for_activation', 'not_attempted', 0,
      settings_row.lexware_invoice_job_max_attempts,
      clock_timestamp(), p_payload_snapshot, p_payload_sha256
    ) returning * into job_row;
    created_new := true;
  end if;

  if invoice_row.lexware_invoice_job_id is null then
    update public.school_request_invoices
    set lexware_invoice_job_id = job_row.id,
        lexware_payload_snapshot = p_payload_snapshot
    where id = invoice_row.id;
    invoice_was_linked := true;
  elsif invoice_row.lexware_invoice_job_id <> job_row.id then
    raise exception 'INVOICE_JOB_LINK_CONFLICT';
  end if;

  return query select job_row.id, job_row.status, job_row.creation_state,
    job_row.payload_sha256, job_row.idempotency_key, created_new, invoice_was_linked;
end;
$$;

revoke all on function public.enqueue_existing_v2_lexware_invoice_job(uuid,text,jsonb,text,timestamptz,integer) from public, anon, authenticated;
grant execute on function public.enqueue_existing_v2_lexware_invoice_job(uuid,text,jsonb,text,timestamptz,integer) to service_role;

comment on function public.enqueue_existing_v2_lexware_invoice_job(uuid,text,jsonb,text,timestamptz,integer) is
  'Legt für eine bestehende vollständige V2-Rechnung atomar genau einen wartenden Lexware-Rechnungsjob an und verknüpft ihn. Kein externer Aufruf und kein Mailjob.';

commit;
