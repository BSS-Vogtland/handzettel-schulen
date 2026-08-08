begin;

create or replace function public.recover_native_lexware_pre_dispatch_marker(
  p_job_id uuid,
  p_local_invoice_id uuid,
  p_expected_request_id uuid,
  p_expected_attempt_count integer,
  p_expected_locked_by text,
  p_expected_locked_at timestamptz,
  p_expected_lock_expires_at timestamptz,
  p_expected_external_write_started_at timestamptz,
  p_expected_payload_sha256 text,
  p_expected_payload_hash_version text,
  p_expected_target_organization_id text,
  p_expected_credential_alias text,
  p_expected_idempotency_key text,
  p_confirmation text
)
returns table (
  recovery_applied boolean,
  job_id uuid,
  local_invoice_id uuid,
  status text,
  attempt_count integer,
  external_write_started_at timestamptz,
  creation_state text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  settings_row public.business_runtime_settings%rowtype;
  invoice_row public.school_request_invoices%rowtype;
  job_row public.school_lexware_invoice_jobs%rowtype;
  now_value timestamptz := clock_timestamp();
begin
  if p_confirmation is distinct from 'CONFIRM_NO_PROVIDER_DISPATCH_PRE_MARKER_RECOVERY' then
    raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_CONFIRMATION_INVALID';
  end if;
  if p_expected_attempt_count < 1 then raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_ATTEMPT_INVALID'; end if;
  if nullif(btrim(p_expected_locked_by), '') is null then raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_LOCK_OWNER_REQUIRED'; end if;
  if p_expected_locked_at is null or p_expected_lock_expires_at is null
     or p_expected_lock_expires_at <= p_expected_locked_at then
    raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_LOCK_INVALID';
  end if;
  if p_expected_external_write_started_at is null then raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_MARKER_REQUIRED'; end if;
  if p_expected_payload_hash_version is distinct from 'lexware-payload-canonical-v2' then raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_HASH_VERSION_INVALID'; end if;
  if p_expected_payload_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_HASH_INVALID'; end if;
  if nullif(btrim(p_expected_target_organization_id), '') is null then raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_ORGANIZATION_REQUIRED'; end if;
  if nullif(btrim(p_expected_credential_alias), '') is null then raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_CREDENTIAL_ALIAS_REQUIRED'; end if;
  if nullif(btrim(p_expected_idempotency_key), '') is null then raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_IDEMPOTENCY_KEY_REQUIRED'; end if;

  select settings.* into settings_row
  from public.business_runtime_settings as settings
  where settings.id = 'default'
  for share;
  if not found then raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_RUNTIME_SETTINGS_MISSING'; end if;
  if settings_row.lexware_production_write_enabled is not true then raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_PRODUCTION_WRITE_DISABLED'; end if;
  if settings_row.invoice_provider_after is distinct from 'lexware' then raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_PROVIDER_CUTOVER_INACTIVE'; end if;
  if settings_row.invoice_cutover_at is null or settings_row.invoice_cutover_at > now_value then raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_CUTOVER_NOT_REACHED'; end if;

  select candidate_invoice.* into invoice_row
  from public.school_request_invoices as candidate_invoice
  where candidate_invoice.id = p_local_invoice_id
  for update;
  if not found then raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_INVOICE_NOT_FOUND'; end if;
  if invoice_row.request_id is distinct from p_expected_request_id
     or invoice_row.lexware_invoice_job_id is distinct from p_job_id then
    raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_INVOICE_IDENTITY_MISMATCH';
  end if;
  if invoice_row.invoice_provider is distinct from 'lexware'
     or invoice_row.tax_snapshot_status is distinct from 'complete'
     or invoice_row.tax_snapshot_version is distinct from 'invoice-tax-snapshot-v2' then
    raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_INVOICE_CONTRACT_INVALID';
  end if;
  if invoice_row.lexware_invoice_id is not null
     or invoice_row.lexware_invoice_number is not null
     or invoice_row.lexware_finalized_at is not null then
    raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_INVOICE_ALREADY_EXTERNAL';
  end if;

  select candidate_job.* into job_row
  from public.school_lexware_invoice_jobs as candidate_job
  where candidate_job.id = p_job_id
  for update;
  if not found then raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_JOB_NOT_FOUND'; end if;
  if job_row.local_invoice_id is distinct from invoice_row.id
     or job_row.request_id is distinct from invoice_row.request_id
     or job_row.trigger_source is distinct from 'checkout_native_lexware' then
    raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_JOB_IDENTITY_MISMATCH';
  end if;
  if job_row.status is distinct from 'processing' then raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_STATUS_BLOCKED'; end if;
  if job_row.creation_state is distinct from 'not_attempted' then raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_CREATION_STATE_BLOCKED'; end if;
  if job_row.attempt_count is distinct from p_expected_attempt_count then raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_ATTEMPT_MISMATCH'; end if;
  if job_row.attempt_count >= job_row.max_attempts then raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_ATTEMPTS_EXHAUSTED'; end if;
  if job_row.locked_by is distinct from btrim(p_expected_locked_by)
     or job_row.locked_at is distinct from p_expected_locked_at
     or job_row.lock_expires_at is distinct from p_expected_lock_expires_at then
    raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_LOCK_MISMATCH';
  end if;
  if job_row.locked_at is null or job_row.lock_expires_at is null
     or job_row.lock_expires_at <= job_row.locked_at then
    raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_LOCK_INVALID';
  end if;
  if job_row.lock_expires_at > now_value then raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_ACTIVE_LOCK'; end if;
  if job_row.external_write_started_at is distinct from p_expected_external_write_started_at then
    raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_MARKER_MISMATCH';
  end if;
  if job_row.external_write_completed_at is not null
     or job_row.last_external_http_status is not null
     or job_row.last_external_retry_after_seconds is not null
     or job_row.last_error_code is not null
     or job_row.last_error_message is not null
     or job_row.lexware_invoice_id is not null
     or job_row.lexware_invoice_number is not null
     or job_row.lexware_resource_uri is not null
     or job_row.lexware_voucher_status is not null
     or job_row.lexware_created_date is not null
     or job_row.lexware_response_snapshot is not null then
    raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_EXTERNAL_STATE_BLOCKED';
  end if;
  if job_row.payload_hash_version is distinct from p_expected_payload_hash_version
     or job_row.payload_sha256 is distinct from p_expected_payload_sha256 then
    raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_PAYLOAD_MISMATCH';
  end if;
  if lower(job_row.target_organization_id) is distinct from lower(p_expected_target_organization_id)
     or lower(job_row.target_organization_id) is distinct from lower(settings_row.lexware_production_organization_id) then
    raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_ORGANIZATION_MISMATCH';
  end if;
  if job_row.credential_alias_snapshot is distinct from p_expected_credential_alias then raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_CREDENTIAL_ALIAS_MISMATCH'; end if;
  if job_row.idempotency_key is distinct from p_expected_idempotency_key then raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_IDEMPOTENCY_KEY_MISMATCH'; end if;

  update public.school_lexware_invoice_jobs as recovered_job set
    external_write_started_at = null,
    updated_at = now_value
  where recovered_job.id = job_row.id
    and recovered_job.local_invoice_id = invoice_row.id
    and recovered_job.request_id = invoice_row.request_id
    and recovered_job.trigger_source = 'checkout_native_lexware'
    and recovered_job.status = 'processing'
    and recovered_job.creation_state = 'not_attempted'
    and recovered_job.attempt_count = p_expected_attempt_count
    and recovered_job.locked_by = btrim(p_expected_locked_by)
    and recovered_job.locked_at = p_expected_locked_at
    and recovered_job.lock_expires_at = p_expected_lock_expires_at
    and recovered_job.lock_expires_at <= now_value
    and recovered_job.external_write_started_at = p_expected_external_write_started_at
    and recovered_job.external_write_completed_at is null
    and recovered_job.last_external_http_status is null
    and recovered_job.last_external_retry_after_seconds is null
    and recovered_job.last_error_code is null
    and recovered_job.last_error_message is null
    and recovered_job.lexware_invoice_id is null
    and recovered_job.lexware_invoice_number is null
    and recovered_job.lexware_resource_uri is null
    and recovered_job.lexware_voucher_status is null
    and recovered_job.lexware_created_date is null
    and recovered_job.lexware_response_snapshot is null
    and recovered_job.payload_sha256 = p_expected_payload_sha256
    and recovered_job.payload_hash_version = p_expected_payload_hash_version
    and lower(recovered_job.target_organization_id) = lower(p_expected_target_organization_id)
    and recovered_job.credential_alias_snapshot = p_expected_credential_alias
    and recovered_job.idempotency_key = p_expected_idempotency_key
  returning recovered_job.* into job_row;
  if not found then raise exception 'NATIVE_PRE_DISPATCH_RECOVERY_CAS_CONFLICT'; end if;

  insert into public.school_lexware_outbox_events (
    request_id, invoice_job_id, mail_job_id, event_type,
    from_status, to_status, attempt_count, metadata, created_at
  ) values (
    job_row.request_id, job_row.id, null, 'native_pre_dispatch_marker_recovered',
    job_row.status, job_row.status, job_row.attempt_count,
    jsonb_build_object(
      'attempt_count', job_row.attempt_count,
      'previous_started_marker_present', true,
      'provider_dispatch_confirmed_absent', true,
      'recovery_reason', 'controlled_pre_dispatch_stop',
      'source', 'checkout_native_lexware'
    ),
    now_value
  );

  return query select
    true, job_row.id, job_row.local_invoice_id, job_row.status,
    job_row.attempt_count, job_row.external_write_started_at,
    job_row.creation_state;
end;
$$;

revoke all on function public.recover_native_lexware_pre_dispatch_marker(uuid,uuid,uuid,integer,text,timestamptz,timestamptz,timestamptz,text,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.recover_native_lexware_pre_dispatch_marker(uuid,uuid,uuid,integer,text,timestamptz,timestamptz,timestamptz,text,text,text,text,text,text)
  to service_role;

commit;
