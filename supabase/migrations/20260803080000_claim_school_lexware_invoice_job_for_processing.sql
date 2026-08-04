begin;

create or replace function public.claim_school_lexware_invoice_job_for_processing(
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
  payload_hash_version text,
  target_organization_id text, local_invoice_id uuid, request_id uuid,
  lexware_invoice_id text, lexware_invoice_number text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invoice_row public.school_request_invoices%rowtype;
  job_row public.school_lexware_invoice_jobs%rowtype;
  old_status text;
  now_value timestamptz := clock_timestamp();
  candidate_count integer;
  is_read_back boolean;
begin
  if p_local_invoice_id is null then raise exception 'LOCAL_INVOICE_ID_REQUIRED'; end if;
  if p_expected_payload_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'PAYLOAD_SHA256_INVALID'; end if;
  if p_expected_payload_hash_version not in ('lexware-payload-json-v1', 'lexware-payload-canonical-v2') then raise exception 'PAYLOAD_HASH_VERSION_INVALID'; end if;
  if p_expected_target_organization_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'TARGET_ORGANIZATION_INVALID'; end if;
  if btrim(coalesce(p_locked_by, '')) = '' then raise exception 'LOCKED_BY_REQUIRED'; end if;
  if p_lock_duration_seconds not between 30 and 300 then raise exception 'LOCK_DURATION_INVALID'; end if;

  select * into invoice_row from public.school_request_invoices
    where id = p_local_invoice_id for update;
  if not found then raise exception 'LOCAL_INVOICE_NOT_FOUND'; end if;

  select count(*) into candidate_count from public.school_lexware_invoice_jobs
    where local_invoice_id = p_local_invoice_id or id = invoice_row.lexware_invoice_job_id;
  if candidate_count <> 1 then raise exception 'INVOICE_JOB_IDENTITY_CONFLICT'; end if;

  select * into job_row from public.school_lexware_invoice_jobs
    where local_invoice_id = p_local_invoice_id for update;
  if not found then raise exception 'INVOICE_JOB_NOT_FOUND'; end if;
  if invoice_row.lexware_invoice_job_id is distinct from job_row.id then raise exception 'INVOICE_JOB_LINK_MISMATCH'; end if;
  if invoice_row.request_id is distinct from job_row.request_id then raise exception 'REQUEST_ID_MISMATCH'; end if;
  if job_row.payload_hash_version is distinct from p_expected_payload_hash_version then raise exception 'PAYLOAD_HASH_VERSION_MISMATCH'; end if;
  if job_row.payload_sha256 <> p_expected_payload_sha256 then raise exception 'PAYLOAD_SHA256_MISMATCH'; end if;
  if lower(job_row.target_organization_id) <> lower(p_expected_target_organization_id) then raise exception 'TARGET_ORGANIZATION_MISMATCH'; end if;
  if job_row.status in ('succeeded', 'cancelled', 'manual_review') then raise exception 'JOB_STATUS_BLOCKED'; end if;
  if job_row.creation_state = 'creation_state_unknown' then raise exception 'CREATION_STATE_UNKNOWN'; end if;
  if job_row.status = 'processing'
     and (job_row.locked_at is null
       or job_row.lock_expires_at is null
       or job_row.lock_expires_at <= job_row.locked_at) then
    raise exception 'PROCESSING_LOCK_INVALID';
  end if;
  if job_row.status = 'processing' and job_row.lock_expires_at > now_value then raise exception 'ACTIVE_LOCK'; end if;

  is_read_back := job_row.creation_state = 'definitely_created' and job_row.lexware_invoice_id is not null;
  old_status := job_row.status;
  update public.school_lexware_invoice_jobs set
    status = 'processing', locked_at = now_value, locked_by = btrim(p_locked_by),
    lock_expires_at = now_value + make_interval(secs => p_lock_duration_seconds),
    attempt_count = school_lexware_invoice_jobs.attempt_count + 1,
    last_attempt_at = now_value, updated_at = now_value
  where id = job_row.id returning * into job_row;

  return query select job_row.id, true, is_read_back, old_status, job_row.status,
    job_row.creation_state, job_row.attempt_count, job_row.locked_at, job_row.lock_expires_at,
    job_row.payload_sha256, job_row.payload_hash_version, job_row.target_organization_id, job_row.local_invoice_id,
    job_row.request_id, job_row.lexware_invoice_id, job_row.lexware_invoice_number;
end;
$$;

revoke all on function public.claim_school_lexware_invoice_job_for_processing(uuid,text,text,text,text,integer) from public, anon, authenticated;
grant execute on function public.claim_school_lexware_invoice_job_for_processing(uuid,text,text,text,text,integer) to service_role;

commit;
