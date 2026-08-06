begin;

alter table public.school_lexware_production_write_permits
  drop constraint school_lexware_write_permits_expected_state;

alter table public.school_lexware_production_write_permits
  add constraint school_lexware_write_permits_expected_state check (
    expected_job_status in ('waiting_for_activation', 'pending')
    and expected_attempt_count = 0
  );

create or replace function public.expire_school_lexware_production_write_permit(
  p_invoice_id uuid,
  p_permit_id uuid
)
returns table (permit_id uuid, permit_state text, expired_at timestamptz)
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
  if not found then raise exception 'PERMIT_EXPIRY_INVOICE_NOT_FOUND'; end if;
  select * into job_row from public.school_lexware_invoice_jobs where id = invoice_row.lexware_invoice_job_id for update;
  if not found then raise exception 'PERMIT_EXPIRY_JOB_NOT_FOUND'; end if;
  select * into permit_row from public.school_lexware_production_write_permits where id = p_permit_id for update;
  if not found then raise exception 'PERMIT_EXPIRY_PERMIT_NOT_FOUND'; end if;
  if permit_row.invoice_id <> invoice_row.id or permit_row.request_id <> invoice_row.request_id or permit_row.job_id <> job_row.id then raise exception 'PERMIT_EXPIRY_IDENTITY_MISMATCH'; end if;
  if lower(permit_row.target_organization_id) <> lower(job_row.target_organization_id)
     or permit_row.payload_hash_version is distinct from job_row.payload_hash_version
     or permit_row.payload_sha256 <> job_row.payload_sha256 then raise exception 'PERMIT_EXPIRY_BINDING_MISMATCH'; end if;
  if permit_row.permit_state <> 'activated' or permit_row.expires_at > now_value
     or permit_row.claimed_at is not null or permit_row.claim_id is not null
     or permit_row.consumed_at is not null or permit_row.cancelled_at is not null then raise exception 'PERMIT_EXPIRY_STATE_INVALID'; end if;
  if job_row.status <> 'pending' or job_row.creation_state <> 'not_attempted' or job_row.attempt_count <> 0
     or job_row.locked_at is not null or job_row.lock_expires_at is not null or job_row.locked_by is not null
     or job_row.lexware_invoice_id is not null or job_row.lexware_invoice_number is not null
     or invoice_row.lexware_invoice_id is not null or invoice_row.lexware_invoice_number is not null then raise exception 'PERMIT_EXPIRY_JOB_STATE_INVALID'; end if;
  if exists (select 1 from public.school_lexware_outbox_events e where e.invoice_job_id = job_row.id and (e.event_type in ('production_write_permit_claimed','production_write_permit_completed') or e.to_status in ('processing','succeeded','manual_review'))) then raise exception 'PERMIT_EXPIRY_FOLLOW_UP_PRESENT'; end if;

  update public.school_lexware_production_write_permits
    set permit_state = 'expired', cancelled_at = now_value, updated_at = now_value
    where id = permit_row.id returning * into permit_row;
  insert into public.school_lexware_outbox_events (request_id, invoice_job_id, mail_job_id, event_type, from_status, to_status, attempt_count, metadata, created_at)
  values (permit_row.request_id, permit_row.job_id, null, 'production_write_permit_expired', 'activated', 'expired', 0,
    jsonb_build_object('permit_id', permit_row.id, 'invoice_id', permit_row.invoice_id, 'job_id', permit_row.job_id, 'reason', 'expired_before_claim'), now_value);
  return query select permit_row.id, permit_row.permit_state, permit_row.cancelled_at;
end;
$$;

create or replace function public.reissue_school_lexware_production_write_permit(
  p_invoice_id uuid,
  p_expired_permit_id uuid,
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
  old_permit public.school_lexware_production_write_permits%rowtype;
  new_permit public.school_lexware_production_write_permits%rowtype;
  settings_row public.business_runtime_settings%rowtype;
  now_value timestamptz := clock_timestamp();
  candidate_count integer;
begin
  if p_expires_in_minutes <> 30 then raise exception 'PERMIT_REISSUE_EXPIRY_INVALID'; end if;
  if nullif(btrim(p_created_by_admin_id), '') is null then raise exception 'PERMIT_REISSUE_ADMIN_REQUIRED'; end if;
  select * into invoice_row from public.school_request_invoices where id = p_invoice_id for update;
  if not found then raise exception 'PERMIT_REISSUE_INVOICE_NOT_FOUND'; end if;
  select * into job_row from public.school_lexware_invoice_jobs where id = invoice_row.lexware_invoice_job_id for update;
  if not found then raise exception 'PERMIT_REISSUE_JOB_NOT_FOUND'; end if;
  select * into old_permit from public.school_lexware_production_write_permits where id = p_expired_permit_id for update;
  if not found then raise exception 'PERMIT_REISSUE_OLD_PERMIT_NOT_FOUND'; end if;
  if old_permit.permit_state <> 'expired' or old_permit.cancelled_at is null
     or old_permit.invoice_id <> invoice_row.id or old_permit.request_id <> invoice_row.request_id or old_permit.job_id <> job_row.id then raise exception 'PERMIT_REISSUE_OLD_PERMIT_INVALID'; end if;
  if exists (select 1 from public.school_lexware_production_write_permits p where p.job_id = job_row.id and p.permit_state in ('issued','activated','claimed')) then raise exception 'PERMIT_REISSUE_ACTIVE_PERMIT_PRESENT'; end if;
  select count(*) into candidate_count from public.school_lexware_invoice_jobs where request_id = invoice_row.request_id or local_invoice_id = invoice_row.id;
  if candidate_count <> 1 then raise exception 'PERMIT_REISSUE_JOB_IDENTITY_CONFLICT'; end if;
  if job_row.status <> 'pending' or job_row.creation_state <> 'not_attempted' or job_row.attempt_count <> 0
     or job_row.locked_at is not null or job_row.lock_expires_at is not null or job_row.locked_by is not null
     or job_row.lexware_invoice_id is not null or job_row.lexware_invoice_number is not null
     or invoice_row.lexware_invoice_id is not null or invoice_row.lexware_invoice_number is not null then raise exception 'PERMIT_REISSUE_JOB_STATE_INVALID'; end if;
  if job_row.trigger_source <> 'admin_manual_enqueue' or invoice_row.invoice_provider <> 'legacy_internal'
     or invoice_row.tax_snapshot_status <> 'complete' or invoice_row.tax_snapshot_version <> 'invoice-tax-snapshot-v2' then raise exception 'PERMIT_REISSUE_TRANSITION_INVALID'; end if;
  if job_row.payload_hash_version <> 'lexware-payload-canonical-v2'
     or old_permit.payload_hash_version is distinct from job_row.payload_hash_version or old_permit.payload_sha256 <> job_row.payload_sha256
     or lower(old_permit.target_organization_id) <> lower(job_row.target_organization_id) then raise exception 'PERMIT_REISSUE_BINDING_MISMATCH'; end if;
  select * into settings_row from public.business_runtime_settings where id = 'default';
  if not found or lower(settings_row.lexware_production_organization_id) <> lower(job_row.target_organization_id) then raise exception 'PERMIT_REISSUE_ORGANIZATION_MISMATCH'; end if;
  if exists (select 1 from public.school_lexware_outbox_events e where e.invoice_job_id = job_row.id and (e.event_type in ('production_write_permit_claimed','production_write_permit_completed') or e.to_status in ('processing','succeeded','manual_review'))) then raise exception 'PERMIT_REISSUE_FOLLOW_UP_PRESENT'; end if;
  if exists (select 1 from public.school_lexware_invoice_mail_jobs m where m.invoice_job_id = job_row.id) then raise exception 'PERMIT_REISSUE_MAIL_PRESENT'; end if;

  insert into public.school_lexware_production_write_permits (
    invoice_id, request_id, job_id, target_organization_id, payload_hash_version, payload_sha256,
    expected_job_status, expected_attempt_count, permit_state, expires_at, activated_at,
    created_by_admin_id, audit_metadata
  ) values (
    invoice_row.id, invoice_row.request_id, job_row.id, lower(job_row.target_organization_id),
    job_row.payload_hash_version, job_row.payload_sha256, 'pending', 0, 'activated',
    now_value + make_interval(mins => p_expires_in_minutes), now_value, btrim(p_created_by_admin_id),
    jsonb_build_object('source','admin_object_scoped_production_permit_reissue','expired_permit_id',old_permit.id,'provider_snapshot',invoice_row.invoice_provider)
  ) returning * into new_permit;
  insert into public.school_lexware_outbox_events (request_id, invoice_job_id, mail_job_id, event_type, from_status, to_status, attempt_count, metadata, created_at)
  values (new_permit.request_id, new_permit.job_id, null, 'production_write_permit_reissued', 'expired', 'activated', 0,
    jsonb_build_object('permit_id',new_permit.id,'expired_permit_id',old_permit.id,'invoice_id',new_permit.invoice_id,'job_id',new_permit.job_id,'expires_at',new_permit.expires_at), now_value);
  return query select new_permit.id, new_permit.permit_state, new_permit.expires_at;
end;
$$;

revoke all on function public.expire_school_lexware_production_write_permit(uuid,uuid) from public, anon, authenticated;
revoke all on function public.reissue_school_lexware_production_write_permit(uuid,uuid,integer,text) from public, anon, authenticated;
grant execute on function public.expire_school_lexware_production_write_permit(uuid,uuid) to service_role;
grant execute on function public.reissue_school_lexware_production_write_permit(uuid,uuid,integer,text) to service_role;

commit;
