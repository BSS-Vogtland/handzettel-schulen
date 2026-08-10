begin;

create table if not exists public.school_lexware_invoice_pdf_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  local_invoice_id uuid not null references public.school_request_invoices(id),
  request_id uuid not null references public.school_requests(id),
  invoice_job_id uuid not null references public.school_lexware_invoice_jobs(id),
  target_organization_id text not null,
  external_invoice_id text not null,
  payload_sha256 text not null,
  payload_hash_version text not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 8,
  locked_at timestamptz,
  lock_expires_at timestamptz,
  locked_by text,
  last_attempt_at timestamptz,
  last_error_code text,
  manual_review_reason text,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint school_lexware_invoice_pdf_delivery_jobs_invoice_unique unique (local_invoice_id),
  constraint school_lexware_invoice_pdf_delivery_jobs_invoice_job_unique unique (invoice_job_id),
  constraint school_lexware_invoice_pdf_delivery_jobs_hash_check check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  constraint school_lexware_invoice_pdf_delivery_jobs_hash_version_check check (payload_hash_version = 'lexware-payload-canonical-v2'),
  constraint school_lexware_invoice_pdf_delivery_jobs_status_check check (
    status in ('pending','processing','retry','succeeded','failed','manual_review')
  ),
  constraint school_lexware_invoice_pdf_delivery_jobs_attempts_check check (
    attempt_count >= 0 and max_attempts between 1 and 32 and attempt_count <= max_attempts
  ),
  constraint school_lexware_invoice_pdf_delivery_jobs_lock_check check (
    (locked_at is null and lock_expires_at is null and locked_by is null)
    or (locked_at is not null and lock_expires_at > locked_at and nullif(btrim(locked_by),'') is not null)
  ),
  constraint school_lexware_invoice_pdf_delivery_jobs_state_check check (
    (status = 'processing' and locked_at is not null and completed_at is null and failed_at is null and manual_review_reason is null)
    or (status = 'succeeded' and locked_at is null and completed_at is not null and failed_at is null and manual_review_reason is null)
    or (status = 'failed' and locked_at is null and completed_at is null and failed_at is not null and manual_review_reason is null)
    or (status = 'manual_review' and locked_at is null and completed_at is null and failed_at is null and nullif(btrim(manual_review_reason),'') is not null)
    or (status in ('pending','retry') and locked_at is null and completed_at is null and failed_at is null and manual_review_reason is null)
  )
);

create index if not exists school_lexware_invoice_pdf_delivery_jobs_claim_idx
  on public.school_lexware_invoice_pdf_delivery_jobs (status, attempt_count, created_at)
  where status in ('pending','retry');

create or replace function public.enqueue_native_lexware_invoice_pdf_delivery_job(
  p_invoice_id uuid,
  p_request_id uuid,
  p_invoice_job_id uuid,
  p_expected_organization_id text,
  p_expected_external_invoice_id text,
  p_expected_payload_sha256 text,
  p_expected_payload_hash_version text,
  p_max_attempts integer
)
returns public.school_lexware_invoice_pdf_delivery_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invoice_row public.school_request_invoices%rowtype;
  invoice_job_row public.school_lexware_invoice_jobs%rowtype;
  delivery_job_row public.school_lexware_invoice_pdf_delivery_jobs%rowtype;
begin
  if p_expected_payload_hash_version is distinct from 'lexware-payload-canonical-v2'
     or p_expected_payload_sha256 !~ '^[a-f0-9]{64}$'
     or nullif(btrim(p_expected_organization_id),'') is null
     or nullif(btrim(p_expected_external_invoice_id),'') is null
     or p_max_attempts not between 1 and 32 then
    raise exception 'NATIVE_PDF_DELIVERY_ENQUEUE_INPUT_INVALID';
  end if;

  select candidate_invoice.* into invoice_row
  from public.school_request_invoices as candidate_invoice
  where candidate_invoice.id = p_invoice_id
  for update;
  if not found then raise exception 'NATIVE_PDF_DELIVERY_INVOICE_NOT_FOUND'; end if;

  select candidate_job.* into invoice_job_row
  from public.school_lexware_invoice_jobs as candidate_job
  where candidate_job.id = p_invoice_job_id
  for share;
  if not found then raise exception 'NATIVE_PDF_DELIVERY_INVOICE_JOB_NOT_FOUND'; end if;

  if invoice_row.request_id is distinct from p_request_id
     or invoice_row.lexware_invoice_job_id is distinct from p_invoice_job_id
     or invoice_job_row.local_invoice_id is distinct from p_invoice_id
     or invoice_job_row.request_id is distinct from p_request_id then
    raise exception 'NATIVE_PDF_DELIVERY_IDENTITY_MISMATCH';
  end if;
  if invoice_row.invoice_provider is distinct from 'lexware'
     or invoice_job_row.trigger_source is distinct from 'checkout_native_lexware'
     or invoice_job_row.status is distinct from 'succeeded'
     or invoice_job_row.creation_state is distinct from 'definitely_created'
     or invoice_row.lexware_finalized_at is null then
    raise exception 'NATIVE_PDF_DELIVERY_STATE_BLOCKED';
  end if;
  if invoice_row.lexware_invoice_id is distinct from p_expected_external_invoice_id
     or invoice_job_row.lexware_invoice_id is distinct from p_expected_external_invoice_id
     or invoice_job_row.target_organization_id is distinct from p_expected_organization_id
     or invoice_job_row.payload_sha256 is distinct from p_expected_payload_sha256
     or invoice_job_row.payload_hash_version is distinct from p_expected_payload_hash_version then
    raise exception 'NATIVE_PDF_DELIVERY_BINDING_MISMATCH';
  end if;
  if invoice_row.lexware_pdf_fetched_at is not null
     or invoice_row.lexware_pdf_sha256 is not null
     or invoice_row.lexware_pdf_size_bytes is not null
     or invoice_row.lexware_pdf_content_type is not null
     or invoice_row.lexware_pdf_filename is not null
     or invoice_row.lexware_pdf_storage_bucket is not null
     or invoice_row.lexware_pdf_storage_path is not null
     or invoice_row.lexware_pdf_stored_at is not null then
    raise exception 'NATIVE_PDF_DELIVERY_ALREADY_STORED';
  end if;

  insert into public.school_lexware_invoice_pdf_delivery_jobs (
    local_invoice_id, request_id, invoice_job_id, target_organization_id,
    external_invoice_id, payload_sha256, payload_hash_version, max_attempts
  ) values (
    p_invoice_id, p_request_id, p_invoice_job_id, p_expected_organization_id,
    p_expected_external_invoice_id, p_expected_payload_sha256,
    p_expected_payload_hash_version, p_max_attempts
  )
  on conflict (local_invoice_id) do nothing
  returning * into delivery_job_row;

  if not found then
    select candidate_delivery.* into delivery_job_row
    from public.school_lexware_invoice_pdf_delivery_jobs as candidate_delivery
    where candidate_delivery.local_invoice_id = p_invoice_id;
    if delivery_job_row.request_id is distinct from p_request_id
       or delivery_job_row.invoice_job_id is distinct from p_invoice_job_id
       or delivery_job_row.target_organization_id is distinct from p_expected_organization_id
       or delivery_job_row.external_invoice_id is distinct from p_expected_external_invoice_id
       or delivery_job_row.payload_sha256 is distinct from p_expected_payload_sha256
       or delivery_job_row.payload_hash_version is distinct from p_expected_payload_hash_version
       or delivery_job_row.max_attempts is distinct from p_max_attempts then
      raise exception 'NATIVE_PDF_DELIVERY_EXISTING_BINDING_MISMATCH';
    end if;
  end if;
  return delivery_job_row;
end;
$$;

create or replace function public.claim_native_lexware_invoice_pdf_delivery_job(
  p_delivery_job_id uuid,
  p_invoice_id uuid,
  p_request_id uuid,
  p_invoice_job_id uuid,
  p_expected_organization_id text,
  p_expected_external_invoice_id text,
  p_expected_payload_sha256 text,
  p_expected_payload_hash_version text,
  p_locked_by text,
  p_lock_seconds integer
)
returns public.school_lexware_invoice_pdf_delivery_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  delivery_job_row public.school_lexware_invoice_pdf_delivery_jobs%rowtype;
  invoice_row public.school_request_invoices%rowtype;
  invoice_job_row public.school_lexware_invoice_jobs%rowtype;
  now_value timestamptz := clock_timestamp();
begin
  if nullif(btrim(p_locked_by),'') is null or p_lock_seconds not between 30 and 300 then
    raise exception 'NATIVE_PDF_DELIVERY_CLAIM_INPUT_INVALID';
  end if;
  select candidate_invoice.* into invoice_row
  from public.school_request_invoices as candidate_invoice
  where candidate_invoice.id = p_invoice_id
  for share;
  if not found then raise exception 'NATIVE_PDF_DELIVERY_INVOICE_NOT_FOUND'; end if;
  select candidate_job.* into invoice_job_row
  from public.school_lexware_invoice_jobs as candidate_job
  where candidate_job.id = p_invoice_job_id
  for share;
  if not found then raise exception 'NATIVE_PDF_DELIVERY_INVOICE_JOB_NOT_FOUND'; end if;
  if invoice_row.request_id is distinct from p_request_id
     or invoice_row.lexware_invoice_job_id is distinct from p_invoice_job_id
     or invoice_job_row.local_invoice_id is distinct from p_invoice_id
     or invoice_job_row.request_id is distinct from p_request_id
     or invoice_row.invoice_provider is distinct from 'lexware'
     or invoice_job_row.trigger_source is distinct from 'checkout_native_lexware'
     or invoice_job_row.status is distinct from 'succeeded'
     or invoice_job_row.creation_state is distinct from 'definitely_created'
     or invoice_row.lexware_finalized_at is null
     or invoice_row.lexware_invoice_id is distinct from p_expected_external_invoice_id
     or invoice_job_row.lexware_invoice_id is distinct from p_expected_external_invoice_id
     or invoice_row.lexware_invoice_number is distinct from invoice_job_row.lexware_invoice_number
     or invoice_job_row.target_organization_id is distinct from p_expected_organization_id
     or invoice_job_row.payload_sha256 is distinct from p_expected_payload_sha256
     or invoice_job_row.payload_hash_version is distinct from p_expected_payload_hash_version then
    raise exception 'NATIVE_PDF_DELIVERY_CLAIM_BINDING_MISMATCH';
  end if;
  if invoice_row.lexware_pdf_fetched_at is not null
     or invoice_row.lexware_pdf_sha256 is not null
     or invoice_row.lexware_pdf_size_bytes is not null
     or invoice_row.lexware_pdf_content_type is not null
     or invoice_row.lexware_pdf_filename is not null
     or invoice_row.lexware_pdf_storage_bucket is not null
     or invoice_row.lexware_pdf_storage_path is not null
     or invoice_row.lexware_pdf_stored_at is not null then
    raise exception 'NATIVE_PDF_DELIVERY_ALREADY_STORED';
  end if;

  update public.school_lexware_invoice_pdf_delivery_jobs as claimed_job set
    status = 'processing',
    attempt_count = claimed_job.attempt_count + 1,
    locked_at = now_value,
    lock_expires_at = now_value + make_interval(secs => p_lock_seconds),
    locked_by = btrim(p_locked_by),
    last_attempt_at = now_value,
    last_error_code = null,
    updated_at = now_value
  where claimed_job.id = p_delivery_job_id
    and claimed_job.local_invoice_id = p_invoice_id
    and claimed_job.request_id = p_request_id
    and claimed_job.invoice_job_id = p_invoice_job_id
    and claimed_job.target_organization_id = p_expected_organization_id
    and claimed_job.external_invoice_id = p_expected_external_invoice_id
    and claimed_job.payload_sha256 = p_expected_payload_sha256
    and claimed_job.payload_hash_version = p_expected_payload_hash_version
    and claimed_job.status in ('pending','retry')
    and claimed_job.attempt_count < claimed_job.max_attempts
    and claimed_job.locked_at is null
    and claimed_job.lock_expires_at is null
    and claimed_job.locked_by is null
    and claimed_job.manual_review_reason is null
  returning claimed_job.* into delivery_job_row;
  if not found then raise exception 'NATIVE_PDF_DELIVERY_CLAIM_BLOCKED'; end if;
  return delivery_job_row;
end;
$$;

create or replace function public.reclaim_native_lexware_invoice_pdf_delivery_job(
  p_delivery_job_id uuid,
  p_invoice_id uuid,
  p_request_id uuid,
  p_invoice_job_id uuid,
  p_expected_attempt_count integer,
  p_expected_locked_by text,
  p_expected_locked_at timestamptz,
  p_expected_lock_expires_at timestamptz,
  p_expected_organization_id text,
  p_expected_external_invoice_id text,
  p_expected_payload_sha256 text,
  p_expected_payload_hash_version text,
  p_new_locked_by text,
  p_lock_seconds integer
)
returns public.school_lexware_invoice_pdf_delivery_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  delivery_job_row public.school_lexware_invoice_pdf_delivery_jobs%rowtype;
  invoice_row public.school_request_invoices%rowtype;
  invoice_job_row public.school_lexware_invoice_jobs%rowtype;
  now_value timestamptz := clock_timestamp();
begin
  if nullif(btrim(p_new_locked_by),'') is null or p_lock_seconds not between 30 and 300 then
    raise exception 'NATIVE_PDF_DELIVERY_RECLAIM_INPUT_INVALID';
  end if;
  select candidate_invoice.* into invoice_row
  from public.school_request_invoices as candidate_invoice
  where candidate_invoice.id = p_invoice_id
  for share;
  if not found then raise exception 'NATIVE_PDF_DELIVERY_INVOICE_NOT_FOUND'; end if;
  select candidate_job.* into invoice_job_row
  from public.school_lexware_invoice_jobs as candidate_job
  where candidate_job.id = p_invoice_job_id
  for share;
  if not found then raise exception 'NATIVE_PDF_DELIVERY_INVOICE_JOB_NOT_FOUND'; end if;
  if invoice_row.request_id is distinct from p_request_id
     or invoice_row.lexware_invoice_job_id is distinct from p_invoice_job_id
     or invoice_job_row.local_invoice_id is distinct from p_invoice_id
     or invoice_job_row.request_id is distinct from p_request_id
     or invoice_row.invoice_provider is distinct from 'lexware'
     or invoice_job_row.trigger_source is distinct from 'checkout_native_lexware'
     or invoice_job_row.status is distinct from 'succeeded'
     or invoice_job_row.creation_state is distinct from 'definitely_created'
     or invoice_row.lexware_finalized_at is null
     or invoice_row.lexware_invoice_id is distinct from p_expected_external_invoice_id
     or invoice_job_row.lexware_invoice_id is distinct from p_expected_external_invoice_id
     or invoice_row.lexware_invoice_number is distinct from invoice_job_row.lexware_invoice_number
     or invoice_job_row.target_organization_id is distinct from p_expected_organization_id
     or invoice_job_row.payload_sha256 is distinct from p_expected_payload_sha256
     or invoice_job_row.payload_hash_version is distinct from p_expected_payload_hash_version then
    raise exception 'NATIVE_PDF_DELIVERY_RECLAIM_BINDING_MISMATCH';
  end if;
  if invoice_row.lexware_pdf_fetched_at is not null
     or invoice_row.lexware_pdf_sha256 is not null
     or invoice_row.lexware_pdf_size_bytes is not null
     or invoice_row.lexware_pdf_content_type is not null
     or invoice_row.lexware_pdf_filename is not null
     or invoice_row.lexware_pdf_storage_bucket is not null
     or invoice_row.lexware_pdf_storage_path is not null
     or invoice_row.lexware_pdf_stored_at is not null then
    raise exception 'NATIVE_PDF_DELIVERY_ALREADY_STORED';
  end if;

  update public.school_lexware_invoice_pdf_delivery_jobs as reclaimed_job set
    attempt_count = reclaimed_job.attempt_count + 1,
    locked_at = now_value,
    lock_expires_at = now_value + make_interval(secs => p_lock_seconds),
    locked_by = btrim(p_new_locked_by),
    last_attempt_at = now_value,
    updated_at = now_value
  where reclaimed_job.id = p_delivery_job_id
    and reclaimed_job.local_invoice_id = p_invoice_id
    and reclaimed_job.request_id = p_request_id
    and reclaimed_job.invoice_job_id = p_invoice_job_id
    and reclaimed_job.attempt_count = p_expected_attempt_count
    and reclaimed_job.locked_by = p_expected_locked_by
    and reclaimed_job.locked_at = p_expected_locked_at
    and reclaimed_job.lock_expires_at = p_expected_lock_expires_at
    and reclaimed_job.lock_expires_at <= now_value
    and reclaimed_job.target_organization_id = p_expected_organization_id
    and reclaimed_job.external_invoice_id = p_expected_external_invoice_id
    and reclaimed_job.payload_sha256 = p_expected_payload_sha256
    and reclaimed_job.payload_hash_version = p_expected_payload_hash_version
    and reclaimed_job.status = 'processing'
    and reclaimed_job.attempt_count < reclaimed_job.max_attempts
    and reclaimed_job.last_error_code is null
    and reclaimed_job.manual_review_reason is null
  returning reclaimed_job.* into delivery_job_row;
  if not found then raise exception 'NATIVE_PDF_DELIVERY_RECLAIM_BLOCKED'; end if;
  return delivery_job_row;
end;
$$;

create or replace function public.complete_native_lexware_invoice_pdf_delivery_job(
  p_delivery_job_id uuid,
  p_invoice_id uuid,
  p_request_id uuid,
  p_invoice_job_id uuid,
  p_attempt_count integer,
  p_locked_by text,
  p_expected_organization_id text,
  p_expected_external_invoice_id text,
  p_expected_payload_sha256 text,
  p_expected_payload_hash_version text
)
returns public.school_lexware_invoice_pdf_delivery_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  delivery_job_row public.school_lexware_invoice_pdf_delivery_jobs%rowtype;
  invoice_row public.school_request_invoices%rowtype;
  invoice_job_row public.school_lexware_invoice_jobs%rowtype;
  now_value timestamptz := clock_timestamp();
begin
  select candidate_invoice.* into invoice_row
  from public.school_request_invoices as candidate_invoice
  where candidate_invoice.id = p_invoice_id
  for share;
  if not found or invoice_row.lexware_pdf_fetched_at is null
     or invoice_row.lexware_pdf_sha256 is null
     or invoice_row.lexware_pdf_size_bytes is null
     or invoice_row.lexware_pdf_content_type is distinct from 'application/pdf'
     or invoice_row.lexware_pdf_filename is null
     or invoice_row.lexware_pdf_storage_bucket is distinct from 'lexware-invoice-pdfs'
     or invoice_row.lexware_pdf_storage_path is null
     or invoice_row.lexware_pdf_stored_at is null then
    raise exception 'NATIVE_PDF_DELIVERY_PDF_NOT_STORED';
  end if;
  select candidate_job.* into invoice_job_row
  from public.school_lexware_invoice_jobs as candidate_job
  where candidate_job.id = p_invoice_job_id
  for share;
  if not found then raise exception 'NATIVE_PDF_DELIVERY_INVOICE_JOB_NOT_FOUND'; end if;
  if invoice_row.request_id is distinct from p_request_id
     or invoice_row.lexware_invoice_job_id is distinct from p_invoice_job_id
     or invoice_job_row.local_invoice_id is distinct from p_invoice_id
     or invoice_job_row.request_id is distinct from p_request_id
     or invoice_row.invoice_provider is distinct from 'lexware'
     or invoice_job_row.trigger_source is distinct from 'checkout_native_lexware'
     or invoice_job_row.status is distinct from 'succeeded'
     or invoice_job_row.creation_state is distinct from 'definitely_created'
     or invoice_row.lexware_finalized_at is null
     or invoice_row.lexware_invoice_id is distinct from p_expected_external_invoice_id
     or invoice_job_row.lexware_invoice_id is distinct from p_expected_external_invoice_id
     or invoice_row.lexware_invoice_number is distinct from invoice_job_row.lexware_invoice_number
     or invoice_job_row.target_organization_id is distinct from p_expected_organization_id
     or invoice_job_row.payload_sha256 is distinct from p_expected_payload_sha256
     or invoice_job_row.payload_hash_version is distinct from p_expected_payload_hash_version then
    raise exception 'NATIVE_PDF_DELIVERY_COMPLETE_BINDING_MISMATCH';
  end if;

  update public.school_lexware_invoice_pdf_delivery_jobs as completed_job set
    status = 'succeeded', completed_at = now_value,
    locked_at = null, lock_expires_at = null, locked_by = null,
    last_error_code = null, updated_at = now_value
  where completed_job.id = p_delivery_job_id
    and completed_job.local_invoice_id = p_invoice_id
    and completed_job.request_id = p_request_id
    and completed_job.invoice_job_id = p_invoice_job_id
    and completed_job.attempt_count = p_attempt_count
    and completed_job.locked_by = p_locked_by
    and completed_job.lock_expires_at > now_value
    and completed_job.target_organization_id = p_expected_organization_id
    and completed_job.external_invoice_id = p_expected_external_invoice_id
    and completed_job.payload_sha256 = p_expected_payload_sha256
    and completed_job.payload_hash_version = p_expected_payload_hash_version
    and completed_job.status = 'processing'
    and completed_job.manual_review_reason is null
  returning completed_job.* into delivery_job_row;
  if not found then raise exception 'NATIVE_PDF_DELIVERY_COMPLETE_BLOCKED'; end if;
  return delivery_job_row;
end;
$$;

create or replace function public.record_native_lexware_invoice_pdf_delivery_failure(
  p_delivery_job_id uuid,
  p_invoice_id uuid,
  p_request_id uuid,
  p_invoice_job_id uuid,
  p_attempt_count integer,
  p_locked_by text,
  p_error_code text,
  p_ambiguous boolean
)
returns public.school_lexware_invoice_pdf_delivery_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  delivery_job_row public.school_lexware_invoice_pdf_delivery_jobs%rowtype;
  now_value timestamptz := clock_timestamp();
begin
  if nullif(btrim(p_error_code),'') is null or length(p_error_code) > 120 then
    raise exception 'NATIVE_PDF_DELIVERY_FAILURE_INPUT_INVALID';
  end if;
  update public.school_lexware_invoice_pdf_delivery_jobs as failed_job set
    status = case
      when p_ambiguous then 'manual_review'
      when failed_job.attempt_count >= failed_job.max_attempts then 'failed'
      else 'retry'
    end,
    last_error_code = btrim(p_error_code),
    manual_review_reason = case when p_ambiguous then btrim(p_error_code) else null end,
    failed_at = case when not p_ambiguous and failed_job.attempt_count >= failed_job.max_attempts then now_value else null end,
    locked_at = null, lock_expires_at = null, locked_by = null,
    updated_at = now_value
  where failed_job.id = p_delivery_job_id
    and failed_job.local_invoice_id = p_invoice_id
    and failed_job.request_id = p_request_id
    and failed_job.invoice_job_id = p_invoice_job_id
    and failed_job.status = 'processing'
    and failed_job.attempt_count = p_attempt_count
    and failed_job.locked_by = p_locked_by
    and failed_job.lock_expires_at > now_value
  returning failed_job.* into delivery_job_row;
  if not found then raise exception 'NATIVE_PDF_DELIVERY_FAILURE_BLOCKED'; end if;
  return delivery_job_row;
end;
$$;

alter table public.school_lexware_invoice_pdf_delivery_jobs enable row level security;
revoke all on table public.school_lexware_invoice_pdf_delivery_jobs from public, anon, authenticated;
revoke all on table public.school_lexware_invoice_pdf_delivery_jobs from service_role;
grant select, insert, update on table public.school_lexware_invoice_pdf_delivery_jobs to service_role;

revoke all on function public.enqueue_native_lexware_invoice_pdf_delivery_job(uuid,uuid,uuid,text,text,text,text,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.enqueue_native_lexware_invoice_pdf_delivery_job(uuid,uuid,uuid,text,text,text,text,integer)
  to service_role;
revoke all on function public.claim_native_lexware_invoice_pdf_delivery_job(uuid,uuid,uuid,uuid,text,text,text,text,text,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_native_lexware_invoice_pdf_delivery_job(uuid,uuid,uuid,uuid,text,text,text,text,text,integer)
  to service_role;
revoke all on function public.reclaim_native_lexware_invoice_pdf_delivery_job(uuid,uuid,uuid,uuid,integer,text,timestamptz,timestamptz,text,text,text,text,text,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.reclaim_native_lexware_invoice_pdf_delivery_job(uuid,uuid,uuid,uuid,integer,text,timestamptz,timestamptz,text,text,text,text,text,integer)
  to service_role;
revoke all on function public.complete_native_lexware_invoice_pdf_delivery_job(uuid,uuid,uuid,uuid,integer,text,text,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_native_lexware_invoice_pdf_delivery_job(uuid,uuid,uuid,uuid,integer,text,text,text,text,text)
  to service_role;
revoke all on function public.record_native_lexware_invoice_pdf_delivery_failure(uuid,uuid,uuid,uuid,integer,text,text,boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.record_native_lexware_invoice_pdf_delivery_failure(uuid,uuid,uuid,uuid,integer,text,text,boolean)
  to service_role;

commit;
