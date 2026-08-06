begin;

create table public.school_lexware_production_write_permits (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.school_request_invoices(id) on delete restrict,
  request_id uuid not null references public.school_requests(id) on delete restrict,
  job_id uuid not null references public.school_lexware_invoice_jobs(id) on delete restrict,
  target_organization_id text not null,
  payload_hash_version text not null,
  payload_sha256 text not null,
  expected_job_status text not null,
  expected_attempt_count integer not null,
  permit_state text not null default 'issued',
  expires_at timestamptz not null,
  activated_at timestamptz,
  claimed_at timestamptz,
  claim_id uuid,
  consumed_at timestamptz,
  cancelled_at timestamptz,
  created_by_admin_id text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  audit_metadata jsonb not null default '{}'::jsonb,
  constraint school_lexware_write_permits_org_uuid check (
    target_organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  constraint school_lexware_write_permits_hash_version check (
    payload_hash_version = 'lexware-payload-canonical-v2'
  ),
  constraint school_lexware_write_permits_hash check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  constraint school_lexware_write_permits_expected_state check (
    expected_job_status = 'waiting_for_activation' and expected_attempt_count = 0
  ),
  constraint school_lexware_write_permits_state check (
    permit_state in ('issued','activated','claimed','consumed','cancelled','expired','manual_review')
  ),
  constraint school_lexware_write_permits_expiry check (expires_at > created_at),
  constraint school_lexware_write_permits_audit_object check (jsonb_typeof(audit_metadata) = 'object'),
  constraint school_lexware_write_permits_lifecycle check (
    (permit_state = 'issued' and activated_at is null and claimed_at is null and claim_id is null and consumed_at is null and cancelled_at is null)
    or (permit_state = 'activated' and activated_at is not null and claimed_at is null and claim_id is null and consumed_at is null and cancelled_at is null)
    or (permit_state = 'claimed' and activated_at is not null and claimed_at is not null and claim_id is not null and consumed_at is null and cancelled_at is null)
    or (permit_state = 'consumed' and activated_at is not null and claimed_at is not null and claim_id is not null and consumed_at is not null and cancelled_at is null)
    or (permit_state in ('cancelled','expired') and consumed_at is null and cancelled_at is not null)
    or (permit_state = 'manual_review' and activated_at is not null and claimed_at is not null and claim_id is not null and consumed_at is null)
  )
);

create unique index school_lexware_write_permits_one_active_per_job
  on public.school_lexware_production_write_permits(job_id)
  where permit_state in ('issued','activated','claimed');

create index school_lexware_write_permits_invoice_created
  on public.school_lexware_production_write_permits(invoice_id, created_at desc);

alter table public.school_lexware_production_write_permits enable row level security;
revoke all on table public.school_lexware_production_write_permits from public, anon, authenticated;
grant select, insert, update on table public.school_lexware_production_write_permits to service_role;

create or replace function public.issue_school_lexware_production_write_permit(
  p_invoice_id uuid,
  p_request_id uuid,
  p_job_id uuid,
  p_target_organization_id text,
  p_payload_hash_version text,
  p_payload_sha256 text,
  p_expires_in_minutes integer,
  p_created_by_admin_id text
)
returns table (permit_id uuid, permit_state text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invoice_row public.school_request_invoices%rowtype;
  job_row public.school_lexware_invoice_jobs%rowtype;
  settings_row public.business_runtime_settings%rowtype;
  permit_row public.school_lexware_production_write_permits%rowtype;
  now_value timestamptz := clock_timestamp();
  candidate_count integer;
begin
  if p_invoice_id is null or p_request_id is null or p_job_id is null then raise exception 'PERMIT_IDENTITY_REQUIRED'; end if;
  if p_target_organization_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'PERMIT_ORGANIZATION_INVALID'; end if;
  if p_payload_hash_version is distinct from 'lexware-payload-canonical-v2' then raise exception 'PERMIT_HASH_VERSION_INVALID'; end if;
  if p_payload_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'PERMIT_HASH_INVALID'; end if;
  if p_expires_in_minutes not between 1 and 30 then raise exception 'PERMIT_EXPIRY_INVALID'; end if;
  if nullif(btrim(p_created_by_admin_id), '') is null then raise exception 'PERMIT_ADMIN_ID_REQUIRED'; end if;

  select * into invoice_row from public.school_request_invoices where id = p_invoice_id for update;
  if not found then raise exception 'PERMIT_INVOICE_NOT_FOUND'; end if;
  if invoice_row.request_id is distinct from p_request_id then raise exception 'PERMIT_REQUEST_MISMATCH'; end if;
  select count(*) into candidate_count from public.school_request_invoices where request_id = p_request_id;
  if candidate_count <> 1 then raise exception 'PERMIT_DUPLICATE_INVOICE'; end if;

  select * into job_row from public.school_lexware_invoice_jobs where id = p_job_id for update;
  if not found then raise exception 'PERMIT_JOB_NOT_FOUND'; end if;
  select count(*) into candidate_count from public.school_lexware_invoice_jobs where local_invoice_id = p_invoice_id or id = invoice_row.lexware_invoice_job_id;
  if candidate_count <> 1 then raise exception 'PERMIT_JOB_IDENTITY_CONFLICT'; end if;
  if invoice_row.lexware_invoice_job_id is distinct from job_row.id or job_row.local_invoice_id is distinct from invoice_row.id or job_row.request_id is distinct from invoice_row.request_id then raise exception 'PERMIT_JOB_LINK_MISMATCH'; end if;
  if job_row.status <> 'waiting_for_activation' or job_row.creation_state <> 'not_attempted' or job_row.attempt_count <> 0 then raise exception 'PERMIT_JOB_STATE_INVALID'; end if;
  if job_row.locked_at is not null or job_row.lock_expires_at is not null or job_row.locked_by is not null then raise exception 'PERMIT_JOB_LOCKED'; end if;
  if job_row.lexware_invoice_id is not null or job_row.lexware_invoice_number is not null or invoice_row.lexware_invoice_id is not null or invoice_row.lexware_invoice_number is not null then raise exception 'PERMIT_EXTERNAL_IDENTITY_PRESENT'; end if;
  if job_row.trigger_source <> 'admin_manual_enqueue' then raise exception 'PERMIT_TRIGGER_SOURCE_INVALID'; end if;
  if job_row.target_organization_id <> p_target_organization_id then raise exception 'PERMIT_ORGANIZATION_MISMATCH'; end if;
  if job_row.payload_hash_version is distinct from p_payload_hash_version or job_row.payload_sha256 <> p_payload_sha256 then raise exception 'PERMIT_PAYLOAD_MISMATCH'; end if;
  if invoice_row.tax_snapshot_status is distinct from 'complete' or invoice_row.tax_snapshot_version is distinct from 'invoice-tax-snapshot-v2' then raise exception 'PERMIT_V2_SNAPSHOT_REQUIRED'; end if;
  if invoice_row.invoice_provider not in ('legacy_internal','lexware') then raise exception 'PERMIT_PROVIDER_INVALID'; end if;

  select * into settings_row from public.business_runtime_settings where id = 'default';
  if not found or lower(settings_row.lexware_production_organization_id) <> lower(p_target_organization_id) then raise exception 'PERMIT_RUNTIME_ORGANIZATION_MISMATCH'; end if;
  if exists (select 1 from public.school_lexware_production_write_permits active_permit where active_permit.job_id = p_job_id and active_permit.permit_state in ('issued','activated','claimed')) then raise exception 'PERMIT_ALREADY_ACTIVE'; end if;

  insert into public.school_lexware_production_write_permits (
    invoice_id, request_id, job_id, target_organization_id, payload_hash_version, payload_sha256,
    expected_job_status, expected_attempt_count, permit_state, expires_at, created_by_admin_id,
    audit_metadata
  ) values (
    p_invoice_id, p_request_id, p_job_id, lower(p_target_organization_id), p_payload_hash_version, p_payload_sha256,
    'waiting_for_activation', 0, 'issued', now_value + make_interval(mins => p_expires_in_minutes),
    btrim(p_created_by_admin_id), jsonb_build_object('source','admin_object_scoped_production_permit','provider_snapshot',invoice_row.invoice_provider)
  ) returning * into permit_row;

  insert into public.school_lexware_outbox_events (request_id, invoice_job_id, mail_job_id, event_type, from_status, to_status, attempt_count, metadata, created_at)
  values (p_request_id, p_job_id, null, 'production_write_permit_issued', null, 'issued', 0,
    jsonb_build_object('permit_id',permit_row.id,'invoice_id',p_invoice_id,'job_id',p_job_id,'expires_at',permit_row.expires_at), now_value);
  return query select permit_row.id, permit_row.permit_state, permit_row.expires_at;
end;
$$;

create or replace function public.activate_school_lexware_production_write_permit(
  p_invoice_id uuid, p_permit_id uuid
)
returns table (permit_id uuid, permit_state text, job_id uuid, job_status text, attempt_count integer, activated_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invoice_row public.school_request_invoices%rowtype;
  job_row public.school_lexware_invoice_jobs%rowtype;
  permit_row public.school_lexware_production_write_permits%rowtype;
  now_value timestamptz := clock_timestamp();
begin
  select * into invoice_row from public.school_request_invoices where id = p_invoice_id for update;
  if not found then raise exception 'ACTIVATION_INVOICE_NOT_FOUND'; end if;
  select * into job_row from public.school_lexware_invoice_jobs where id = invoice_row.lexware_invoice_job_id for update;
  if not found then raise exception 'ACTIVATION_JOB_NOT_FOUND'; end if;
  select * into permit_row from public.school_lexware_production_write_permits where id = p_permit_id for update;
  if not found then raise exception 'ACTIVATION_PERMIT_NOT_FOUND'; end if;
  if permit_row.permit_state <> 'issued' then raise exception 'ACTIVATION_PERMIT_STATE_INVALID'; end if;
  if permit_row.expires_at <= now_value then
    update public.school_lexware_production_write_permits set permit_state='expired', cancelled_at=now_value, updated_at=now_value where id=permit_row.id;
    raise exception 'ACTIVATION_PERMIT_EXPIRED';
  end if;
  if permit_row.invoice_id <> invoice_row.id or permit_row.request_id <> invoice_row.request_id or permit_row.job_id <> job_row.id
     or lower(permit_row.target_organization_id) <> lower(job_row.target_organization_id)
     or permit_row.payload_hash_version is distinct from job_row.payload_hash_version or permit_row.payload_sha256 <> job_row.payload_sha256 then raise exception 'ACTIVATION_IDENTITY_MISMATCH'; end if;
  if job_row.status <> 'waiting_for_activation' or job_row.creation_state <> 'not_attempted' or job_row.attempt_count <> 0
     or job_row.locked_at is not null or job_row.lock_expires_at is not null or job_row.locked_by is not null
     or job_row.lexware_invoice_id is not null or job_row.lexware_invoice_number is not null then raise exception 'ACTIVATION_JOB_STATE_INVALID'; end if;

  update public.school_lexware_invoice_jobs set status='pending', updated_at=now_value where id=job_row.id returning * into job_row;
  update public.school_lexware_production_write_permits set permit_state='activated', activated_at=now_value, updated_at=now_value where id=permit_row.id returning * into permit_row;
  insert into public.school_lexware_outbox_events (request_id, invoice_job_id, mail_job_id, event_type, from_status, to_status, attempt_count, metadata, created_at)
  values (job_row.request_id, job_row.id, null, 'production_write_permit_activated', 'issued', 'activated', 0, jsonb_build_object('permit_id',permit_row.id,'invoice_id',invoice_row.id,'job_id',job_row.id), now_value);
  return query select permit_row.id, permit_row.permit_state, job_row.id, job_row.status, job_row.attempt_count, permit_row.activated_at;
end;
$$;

create or replace function public.claim_school_lexware_invoice_job_with_permit(
  p_invoice_id uuid, p_permit_id uuid, p_locked_by text, p_lock_duration_seconds integer
)
returns table (
  permit_id uuid, permit_state text, claim_id uuid,
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
  permit_row public.school_lexware_production_write_permits%rowtype;
  claim_row record;
  generated_claim_id uuid := gen_random_uuid();
  now_value timestamptz := clock_timestamp();
begin
  select * into permit_row from public.school_lexware_production_write_permits where id=p_permit_id and invoice_id=p_invoice_id for update;
  if not found then raise exception 'PERMIT_CLAIM_NOT_FOUND'; end if;
  if permit_row.permit_state <> 'activated' or permit_row.expires_at <= now_value then raise exception 'PERMIT_CLAIM_NOT_READY'; end if;
  if exists (select 1 from public.school_lexware_invoice_jobs where id=permit_row.job_id and (status<>'pending' or creation_state<>'not_attempted' or attempt_count<>0 or locked_at is not null or lexware_invoice_id is not null or lexware_invoice_number is not null)) then raise exception 'PERMIT_CLAIM_JOB_STATE_INVALID'; end if;

  select * into claim_row from public.claim_school_lexware_invoice_job_for_processing(
    permit_row.invoice_id, permit_row.payload_sha256, permit_row.payload_hash_version,
    permit_row.target_organization_id, 'permit-claim:' || generated_claim_id::text || ':' || btrim(p_locked_by), p_lock_duration_seconds
  );
  if claim_row.claim_acquired is distinct from true or claim_row.invoice_job_id <> permit_row.job_id
     or claim_row.previous_status <> 'pending' or claim_row.attempt_count <> 1 then raise exception 'PERMIT_CLAIM_RESULT_MISMATCH'; end if;
  update public.school_lexware_production_write_permits set permit_state='claimed', claimed_at=now_value,
    claim_id=generated_claim_id, updated_at=now_value where id=permit_row.id returning * into permit_row;
  insert into public.school_lexware_outbox_events (request_id, invoice_job_id, mail_job_id, event_type, from_status, to_status, attempt_count, metadata, created_at)
  values (permit_row.request_id, permit_row.job_id, null, 'production_write_permit_claimed', 'activated', 'claimed', 1,
    jsonb_build_object('permit_id',permit_row.id,'claim_id',generated_claim_id,'invoice_id',permit_row.invoice_id,'job_id',permit_row.job_id), now_value);
  return query select permit_row.id, permit_row.permit_state, generated_claim_id,
    claim_row.invoice_job_id, claim_row.claim_acquired, claim_row.read_back_only,
    claim_row.previous_status, claim_row.job_status, claim_row.creation_state, claim_row.attempt_count,
    claim_row.locked_at, claim_row.lock_expires_at, claim_row.payload_sha256,
    claim_row.payload_hash_version, claim_row.target_organization_id, claim_row.local_invoice_id,
    claim_row.request_id, claim_row.lexware_invoice_id, claim_row.lexware_invoice_number;
end;
$$;

create or replace function public.complete_school_lexware_production_write_permit(
  p_invoice_id uuid, p_permit_id uuid, p_claim_id uuid
)
returns table (permit_id uuid, permit_state text, consumed_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  permit_row public.school_lexware_production_write_permits%rowtype;
  job_row public.school_lexware_invoice_jobs%rowtype;
  invoice_row public.school_request_invoices%rowtype;
  now_value timestamptz := clock_timestamp();
  target_state text;
begin
  select * into invoice_row from public.school_request_invoices where id=p_invoice_id for update;
  if not found then raise exception 'PERMIT_COMPLETION_INVOICE_NOT_FOUND'; end if;
  select * into job_row from public.school_lexware_invoice_jobs where id=invoice_row.lexware_invoice_job_id for update;
  select * into permit_row from public.school_lexware_production_write_permits where id=p_permit_id for update;
  if permit_row.invoice_id<>invoice_row.id or permit_row.job_id<>job_row.id or permit_row.claim_id is distinct from p_claim_id or permit_row.permit_state<>'claimed' then raise exception 'PERMIT_COMPLETION_IDENTITY_MISMATCH'; end if;
  if job_row.status='succeeded' and job_row.creation_state='definitely_created' and job_row.lexware_invoice_id is not null and job_row.lexware_invoice_number is not null and invoice_row.lexware_invoice_id=job_row.lexware_invoice_id then
    target_state := 'consumed';
    update public.school_lexware_production_write_permits set permit_state=target_state, consumed_at=now_value, updated_at=now_value where id=permit_row.id returning * into permit_row;
  elsif job_row.status='manual_review' or job_row.creation_state='creation_state_unknown' then
    target_state := 'manual_review';
    update public.school_lexware_production_write_permits set permit_state=target_state, updated_at=now_value where id=permit_row.id returning * into permit_row;
  else raise exception 'PERMIT_COMPLETION_JOB_NOT_FINAL';
  end if;
  insert into public.school_lexware_outbox_events (request_id, invoice_job_id, mail_job_id, event_type, from_status, to_status, attempt_count, metadata, created_at)
  values (permit_row.request_id, permit_row.job_id, null, 'production_write_permit_completed', 'claimed', target_state, job_row.attempt_count,
    jsonb_build_object('permit_id',permit_row.id,'claim_id',permit_row.claim_id,'invoice_id',permit_row.invoice_id,'job_id',permit_row.job_id), now_value);
  return query select permit_row.id, permit_row.permit_state, permit_row.consumed_at;
end;
$$;

revoke all on function public.issue_school_lexware_production_write_permit(uuid,uuid,uuid,text,text,text,integer,text) from public, anon, authenticated;
revoke all on function public.activate_school_lexware_production_write_permit(uuid,uuid) from public, anon, authenticated;
revoke all on function public.claim_school_lexware_invoice_job_with_permit(uuid,uuid,text,integer) from public, anon, authenticated;
revoke all on function public.complete_school_lexware_production_write_permit(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.issue_school_lexware_production_write_permit(uuid,uuid,uuid,text,text,text,integer,text) to service_role;
grant execute on function public.activate_school_lexware_production_write_permit(uuid,uuid) to service_role;
grant execute on function public.claim_school_lexware_invoice_job_with_permit(uuid,uuid,text,integer) to service_role;
grant execute on function public.complete_school_lexware_production_write_permit(uuid,uuid,uuid) to service_role;

commit;
