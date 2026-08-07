begin;

create or replace function public.claim_native_lexware_invoice_job_for_processing(
  p_local_invoice_id uuid,
  p_expected_payload_sha256 text,
  p_expected_payload_hash_version text,
  p_expected_target_organization_id text,
  p_locked_by text,
  p_lock_duration_seconds integer
)
returns table (
  invoice_job_id uuid, claim_acquired boolean, read_back_only boolean,
  previous_status text, job_status text, creation_state text, attempt_count integer,
  locked_at timestamptz, lock_expires_at timestamptz, payload_sha256 text,
  payload_hash_version text, target_organization_id text, local_invoice_id uuid,
  request_id uuid, lexware_invoice_id text, lexware_invoice_number text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  settings_row public.business_runtime_settings%rowtype;
  invoice_row public.school_request_invoices%rowtype;
  job_row public.school_lexware_invoice_jobs%rowtype;
  old_status text;
  now_value timestamptz := clock_timestamp();
begin
  select * into settings_row from public.business_runtime_settings where id = 'default' for share;
  if not found then raise exception 'RUNTIME_SETTINGS_MISSING'; end if;
  if settings_row.invoice_provider_after <> 'lexware' then raise exception 'NATIVE_PROVIDER_CUTOVER_INACTIVE'; end if;
  if settings_row.lexware_production_write_enabled is not true then raise exception 'PRODUCTION_WRITE_DISABLED'; end if;
  if p_expected_payload_hash_version is distinct from 'lexware-payload-canonical-v2' then raise exception 'PAYLOAD_HASH_VERSION_INVALID'; end if;
  if p_expected_payload_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'PAYLOAD_SHA256_INVALID'; end if;
  if p_lock_duration_seconds not between 30 and 300 then raise exception 'LOCK_DURATION_INVALID'; end if;
  if nullif(btrim(p_locked_by), '') is null then raise exception 'LOCKED_BY_REQUIRED'; end if;

  select * into invoice_row from public.school_request_invoices where id = p_local_invoice_id for update;
  if not found then raise exception 'LOCAL_INVOICE_NOT_FOUND'; end if;
  if invoice_row.invoice_provider is distinct from 'lexware'
     or invoice_row.tax_snapshot_status is distinct from 'complete'
     or invoice_row.tax_snapshot_version is distinct from 'invoice-tax-snapshot-v2' then
    raise exception 'NATIVE_INVOICE_CONTRACT_INVALID';
  end if;

  select * into job_row from public.school_lexware_invoice_jobs as candidate_job
  where candidate_job.local_invoice_id = invoice_row.id for update;
  if not found then raise exception 'NATIVE_INVOICE_JOB_NOT_FOUND'; end if;
  if invoice_row.lexware_invoice_job_id is distinct from job_row.id
     or invoice_row.request_id is distinct from job_row.request_id
     or job_row.trigger_source is distinct from 'checkout_native_lexware' then
    raise exception 'NATIVE_INVOICE_JOB_IDENTITY_INVALID';
  end if;
  if job_row.status not in ('pending', 'retry') then raise exception 'NATIVE_JOB_STATUS_BLOCKED'; end if;
  if job_row.creation_state not in ('not_attempted', 'definite_not_created') then raise exception 'NATIVE_CREATION_STATE_BLOCKED'; end if;
  if job_row.payload_sha256 <> p_expected_payload_sha256
     or job_row.payload_hash_version is distinct from p_expected_payload_hash_version then
    raise exception 'NATIVE_PAYLOAD_BINDING_MISMATCH';
  end if;
  if lower(job_row.target_organization_id) <> lower(p_expected_target_organization_id)
     or lower(job_row.target_organization_id) <> lower(settings_row.lexware_production_organization_id) then
    raise exception 'NATIVE_TARGET_ORGANIZATION_MISMATCH';
  end if;
  if job_row.lexware_invoice_id is not null or job_row.lexware_invoice_number is not null
     or invoice_row.lexware_invoice_id is not null or invoice_row.lexware_invoice_number is not null then
    raise exception 'NATIVE_EXTERNAL_IDENTITY_ALREADY_PRESENT';
  end if;
  if job_row.locked_at is not null or job_row.lock_expires_at is not null or job_row.locked_by is not null then
    raise exception 'NATIVE_JOB_LOCK_CONFLICT';
  end if;

  old_status := job_row.status;
  update public.school_lexware_invoice_jobs set
    status = 'processing', locked_at = now_value, locked_by = btrim(p_locked_by),
    lock_expires_at = now_value + make_interval(secs => p_lock_duration_seconds),
    attempt_count = school_lexware_invoice_jobs.attempt_count + 1,
    last_attempt_at = now_value, updated_at = now_value
  where id = job_row.id returning * into job_row;

  return query select job_row.id, true, false, old_status, job_row.status,
    job_row.creation_state, job_row.attempt_count, job_row.locked_at,
    job_row.lock_expires_at, job_row.payload_sha256, job_row.payload_hash_version,
    job_row.target_organization_id, job_row.local_invoice_id, job_row.request_id,
    job_row.lexware_invoice_id, job_row.lexware_invoice_number;
end;
$$;

revoke all on function public.claim_native_lexware_invoice_job_for_processing(uuid,text,text,text,text,integer)
  from public, anon, authenticated;
grant execute on function public.claim_native_lexware_invoice_job_for_processing(uuid,text,text,text,text,integer)
  to service_role;

commit;
