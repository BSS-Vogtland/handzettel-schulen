begin;

create or replace function public.reclaim_native_lexware_invoice_job_for_processing(
  p_local_invoice_id uuid,
  p_expected_job_id uuid,
  p_expected_request_id uuid,
  p_expected_payload_sha256 text,
  p_expected_payload_hash_version text,
  p_expected_target_organization_id text,
  p_expected_credential_alias text,
  p_expected_idempotency_key text,
  p_locked_by text,
  p_lock_duration_seconds integer
)
returns table (
  invoice_job_id uuid, claim_acquired boolean, read_back_only boolean,
  previous_status text, job_status text, creation_state text, attempt_count integer,
  locked_at timestamptz, lock_expires_at timestamptz, payload_sha256 text,
  payload_hash_version text, target_organization_id text, local_invoice_id uuid,
  request_id uuid, lexware_invoice_id text, lexware_invoice_number text,
  lock_owner text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  settings_row public.business_runtime_settings%rowtype;
  invoice_row public.school_request_invoices%rowtype;
  job_row public.school_lexware_invoice_jobs%rowtype;
  previous_attempt_count integer;
  previous_status_value text;
  now_value timestamptz := clock_timestamp();
begin
  select settings.* into settings_row
  from public.business_runtime_settings as settings
  where settings.id = 'default'
  for share;
  if not found then raise exception 'NATIVE_RECLAIM_RUNTIME_SETTINGS_MISSING'; end if;
  if settings_row.invoice_provider_after <> 'lexware' then raise exception 'NATIVE_RECLAIM_PROVIDER_CUTOVER_INACTIVE'; end if;
  if settings_row.invoice_cutover_at > now_value then raise exception 'NATIVE_RECLAIM_CUTOVER_NOT_REACHED'; end if;
  if settings_row.lexware_production_write_enabled is not true then raise exception 'NATIVE_RECLAIM_PRODUCTION_WRITE_DISABLED'; end if;
  if p_expected_payload_hash_version is distinct from 'lexware-payload-canonical-v2' then raise exception 'NATIVE_RECLAIM_HASH_VERSION_INVALID'; end if;
  if p_expected_payload_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'NATIVE_RECLAIM_HASH_INVALID'; end if;
  if nullif(btrim(p_expected_credential_alias), '') is null then raise exception 'NATIVE_RECLAIM_CREDENTIAL_ALIAS_REQUIRED'; end if;
  if nullif(btrim(p_expected_idempotency_key), '') is null then raise exception 'NATIVE_RECLAIM_IDEMPOTENCY_KEY_REQUIRED'; end if;
  if nullif(btrim(p_locked_by), '') is null then raise exception 'NATIVE_RECLAIM_LOCK_OWNER_REQUIRED'; end if;
  if p_lock_duration_seconds not between 30 and 300 then raise exception 'NATIVE_RECLAIM_LOCK_DURATION_INVALID'; end if;

  select candidate_invoice.* into invoice_row
  from public.school_request_invoices as candidate_invoice
  where candidate_invoice.id = p_local_invoice_id
  for update;
  if not found then raise exception 'NATIVE_RECLAIM_INVOICE_NOT_FOUND'; end if;
  if invoice_row.request_id is distinct from p_expected_request_id
     or invoice_row.lexware_invoice_job_id is distinct from p_expected_job_id then
    raise exception 'NATIVE_RECLAIM_INVOICE_IDENTITY_MISMATCH';
  end if;
  if invoice_row.invoice_provider is distinct from 'lexware'
     or invoice_row.tax_snapshot_status is distinct from 'complete'
     or invoice_row.tax_snapshot_version is distinct from 'invoice-tax-snapshot-v2' then
    raise exception 'NATIVE_RECLAIM_INVOICE_CONTRACT_INVALID';
  end if;
  if invoice_row.lexware_invoice_id is not null
     or invoice_row.lexware_invoice_number is not null
     or invoice_row.lexware_finalized_at is not null then
    raise exception 'NATIVE_RECLAIM_INVOICE_ALREADY_EXTERNAL';
  end if;

  select candidate_job.* into job_row
  from public.school_lexware_invoice_jobs as candidate_job
  where candidate_job.id = p_expected_job_id
  for update;
  if not found then raise exception 'NATIVE_RECLAIM_JOB_NOT_FOUND'; end if;
  if job_row.local_invoice_id is distinct from invoice_row.id
     or job_row.request_id is distinct from invoice_row.request_id
     or job_row.trigger_source is distinct from 'checkout_native_lexware' then
    raise exception 'NATIVE_RECLAIM_JOB_IDENTITY_MISMATCH';
  end if;
  if job_row.status is distinct from 'processing' then raise exception 'NATIVE_RECLAIM_STATUS_BLOCKED'; end if;
  if job_row.creation_state not in ('not_attempted', 'definite_not_created') then raise exception 'NATIVE_RECLAIM_CREATION_STATE_BLOCKED'; end if;
  if job_row.attempt_count >= job_row.max_attempts then raise exception 'NATIVE_RECLAIM_ATTEMPTS_EXHAUSTED'; end if;
  if job_row.locked_at is null or job_row.locked_by is null or job_row.lock_expires_at is null
     or job_row.lock_expires_at <= job_row.locked_at then
    raise exception 'NATIVE_RECLAIM_LOCK_INVALID';
  end if;
  if job_row.lock_expires_at > now_value then raise exception 'NATIVE_RECLAIM_ACTIVE_LOCK'; end if;
  if job_row.external_write_started_at is not null
     or job_row.external_write_completed_at is not null
     or job_row.last_error_code is not null
     or job_row.last_external_http_status is not null
     or job_row.last_external_retry_after_seconds is not null
     or job_row.lexware_invoice_id is not null
     or job_row.lexware_invoice_number is not null
     or job_row.lexware_resource_uri is not null
     or job_row.lexware_created_date is not null
     or job_row.lexware_response_snapshot is not null then
    raise exception 'NATIVE_RECLAIM_EXTERNAL_WRITE_STATE_BLOCKED';
  end if;
  if job_row.payload_hash_version is distinct from p_expected_payload_hash_version
     or job_row.payload_sha256 <> p_expected_payload_sha256 then
    raise exception 'NATIVE_RECLAIM_PAYLOAD_MISMATCH';
  end if;
  if lower(job_row.target_organization_id) <> lower(p_expected_target_organization_id)
     or lower(job_row.target_organization_id) <> lower(settings_row.lexware_production_organization_id) then
    raise exception 'NATIVE_RECLAIM_ORGANIZATION_MISMATCH';
  end if;
  if job_row.credential_alias_snapshot <> p_expected_credential_alias then raise exception 'NATIVE_RECLAIM_CREDENTIAL_ALIAS_MISMATCH'; end if;
  if job_row.idempotency_key <> p_expected_idempotency_key then raise exception 'NATIVE_RECLAIM_IDEMPOTENCY_KEY_MISMATCH'; end if;

  previous_attempt_count := job_row.attempt_count;
  previous_status_value := job_row.status;
  update public.school_lexware_invoice_jobs as reclaimed_job set
    locked_at = now_value,
    locked_by = btrim(p_locked_by),
    lock_expires_at = now_value + make_interval(secs => p_lock_duration_seconds),
    attempt_count = reclaimed_job.attempt_count + 1,
    last_attempt_at = now_value,
    updated_at = now_value
  where reclaimed_job.id = job_row.id
  returning reclaimed_job.* into job_row;

  insert into public.school_lexware_outbox_events (
    request_id, invoice_job_id, mail_job_id, event_type,
    from_status, to_status, attempt_count, metadata, created_at
  ) values (
    job_row.request_id, job_row.id, null, 'native_invoice_job_reclaimed',
    previous_status_value, job_row.status, job_row.attempt_count,
    jsonb_build_object(
      'previous_attempt_count', previous_attempt_count,
      'new_attempt_count', job_row.attempt_count,
      'previous_lock_expired', true,
      'source', 'checkout_native_lexware'
    ),
    now_value
  );

  return query select
    job_row.id, true, false, previous_status_value, job_row.status,
    job_row.creation_state, job_row.attempt_count, job_row.locked_at,
    job_row.lock_expires_at, job_row.payload_sha256, job_row.payload_hash_version,
    job_row.target_organization_id, job_row.local_invoice_id, job_row.request_id,
    job_row.lexware_invoice_id, job_row.lexware_invoice_number, job_row.locked_by;
end;
$$;

revoke all on function public.reclaim_native_lexware_invoice_job_for_processing(uuid,uuid,uuid,text,text,text,text,text,text,integer)
  from public, anon, authenticated;
grant execute on function public.reclaim_native_lexware_invoice_job_for_processing(uuid,uuid,uuid,text,text,text,text,text,text,integer)
  to service_role;

commit;
