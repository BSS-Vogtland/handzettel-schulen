begin;

create or replace function public.recover_native_lexware_external_result(
  p_job_id uuid,
  p_local_invoice_id uuid,
  p_expected_request_id uuid,
  p_expected_attempt_count integer,
  p_expected_external_write_started_at timestamptz,
  p_expected_external_write_completed_at timestamptz,
  p_expected_external_invoice_id text,
  p_expected_resource_uri text,
  p_expected_provider_created_at timestamptz,
  p_expected_payload_sha256 text,
  p_expected_payload_hash_version text,
  p_expected_target_organization_id text,
  p_expected_credential_alias text,
  p_expected_idempotency_key text,
  p_read_back_invoice_number text,
  p_read_back_voucher_status text
)
returns table (
  recovery_applied boolean,
  invoice_id uuid,
  job_id uuid,
  job_status text,
  creation_state text,
  external_invoice_id text,
  external_invoice_number text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  settings_row public.business_runtime_settings%rowtype;
  invoice_row public.school_request_invoices%rowtype;
  job_row public.school_lexware_invoice_jobs%rowtype;
  recovered_at timestamptz := clock_timestamp();
  read_back_snapshot jsonb;
begin
  if p_expected_attempt_count < 1 then raise exception 'NATIVE_EXTERNAL_RECOVERY_ATTEMPT_INVALID'; end if;
  if p_expected_external_write_started_at is null or p_expected_external_write_completed_at is null then
    raise exception 'NATIVE_EXTERNAL_RECOVERY_MARKERS_REQUIRED';
  end if;
  if nullif(btrim(p_expected_external_invoice_id), '') is null then raise exception 'NATIVE_EXTERNAL_RECOVERY_EXTERNAL_ID_REQUIRED'; end if;
  if nullif(btrim(p_expected_resource_uri), '') is null then raise exception 'NATIVE_EXTERNAL_RECOVERY_RESOURCE_URI_REQUIRED'; end if;
  if p_expected_provider_created_at is null then raise exception 'NATIVE_EXTERNAL_RECOVERY_CREATED_AT_REQUIRED'; end if;
  if p_expected_payload_hash_version is distinct from 'lexware-payload-canonical-v2' then raise exception 'NATIVE_EXTERNAL_RECOVERY_HASH_VERSION_INVALID'; end if;
  if p_expected_payload_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'NATIVE_EXTERNAL_RECOVERY_HASH_INVALID'; end if;
  if nullif(btrim(p_expected_target_organization_id), '') is null then raise exception 'NATIVE_EXTERNAL_RECOVERY_ORGANIZATION_REQUIRED'; end if;
  if nullif(btrim(p_expected_credential_alias), '') is null then raise exception 'NATIVE_EXTERNAL_RECOVERY_CREDENTIAL_REQUIRED'; end if;
  if nullif(btrim(p_expected_idempotency_key), '') is null then raise exception 'NATIVE_EXTERNAL_RECOVERY_IDEMPOTENCY_REQUIRED'; end if;
  if nullif(btrim(p_read_back_invoice_number), '') is null then raise exception 'NATIVE_EXTERNAL_RECOVERY_NUMBER_REQUIRED'; end if;
  if lower(btrim(p_read_back_voucher_status)) is distinct from 'open' then raise exception 'NATIVE_EXTERNAL_RECOVERY_VOUCHER_STATUS_INVALID'; end if;

  select settings.* into settings_row
  from public.business_runtime_settings as settings
  where settings.id = 'default'
  for share;
  if not found then raise exception 'NATIVE_EXTERNAL_RECOVERY_SETTINGS_MISSING'; end if;
  if settings_row.lexware_production_write_enabled is not true then raise exception 'NATIVE_EXTERNAL_RECOVERY_WRITE_GATE_CLOSED'; end if;
  if settings_row.invoice_provider_after is distinct from 'lexware' then raise exception 'NATIVE_EXTERNAL_RECOVERY_CUTOVER_INACTIVE'; end if;
  if lower(settings_row.lexware_production_organization_id) is distinct from lower(p_expected_target_organization_id)
     or settings_row.lexware_production_credential_alias is distinct from p_expected_credential_alias then
    raise exception 'NATIVE_EXTERNAL_RECOVERY_RUNTIME_BINDING_MISMATCH';
  end if;

  select candidate_invoice.* into invoice_row
  from public.school_request_invoices as candidate_invoice
  where candidate_invoice.id = p_local_invoice_id
  for update;
  if not found then raise exception 'NATIVE_EXTERNAL_RECOVERY_INVOICE_NOT_FOUND'; end if;
  if invoice_row.request_id is distinct from p_expected_request_id
     or invoice_row.lexware_invoice_job_id is distinct from p_job_id then raise exception 'NATIVE_EXTERNAL_RECOVERY_INVOICE_IDENTITY_MISMATCH'; end if;
  if invoice_row.invoice_provider is distinct from 'lexware'
     or invoice_row.tax_snapshot_status is distinct from 'complete'
     or invoice_row.tax_snapshot_version is distinct from 'invoice-tax-snapshot-v2'
     or invoice_row.tax_snapshot_source is distinct from 'product_catalog_at_checkout'
     or invoice_row.tax_snapshot_at is null
     or invoice_row.tax_breakdown_snapshot is null
     or invoice_row.total_net_amount_snapshot is null
     or invoice_row.total_tax_amount_snapshot is null then raise exception 'NATIVE_EXTERNAL_RECOVERY_INVOICE_CONTRACT_INVALID'; end if;
  if invoice_row.lexware_organization_id is not null
     or invoice_row.lexware_invoice_id is not null
     or invoice_row.lexware_invoice_number is not null
     or invoice_row.lexware_resource_uri is not null
     or invoice_row.lexware_created_at is not null
     or invoice_row.lexware_finalized_at is not null then raise exception 'NATIVE_EXTERNAL_RECOVERY_INVOICE_NOT_PREPARED'; end if;

  select candidate_job.* into job_row
  from public.school_lexware_invoice_jobs as candidate_job
  where candidate_job.id = p_job_id
  for update;
  if not found then raise exception 'NATIVE_EXTERNAL_RECOVERY_JOB_NOT_FOUND'; end if;
  if job_row.local_invoice_id is distinct from invoice_row.id
     or job_row.request_id is distinct from invoice_row.request_id
     or job_row.trigger_source is distinct from 'checkout_native_lexware' then raise exception 'NATIVE_EXTERNAL_RECOVERY_JOB_IDENTITY_MISMATCH'; end if;
  if job_row.status is distinct from 'manual_review' or job_row.creation_state is distinct from 'creation_state_unknown' then
    raise exception 'NATIVE_EXTERNAL_RECOVERY_JOB_STATE_BLOCKED';
  end if;
  if job_row.attempt_count is distinct from p_expected_attempt_count then raise exception 'NATIVE_EXTERNAL_RECOVERY_ATTEMPT_MISMATCH'; end if;
  if job_row.external_write_started_at is distinct from p_expected_external_write_started_at
     or job_row.external_write_completed_at is distinct from p_expected_external_write_completed_at then raise exception 'NATIVE_EXTERNAL_RECOVERY_MARKER_MISMATCH'; end if;
  if job_row.lexware_invoice_id is distinct from btrim(p_expected_external_invoice_id)
     or job_row.lexware_resource_uri is distinct from btrim(p_expected_resource_uri)
     or job_row.lexware_created_date is distinct from p_expected_provider_created_at
     or job_row.lexware_invoice_number is not null then raise exception 'NATIVE_EXTERNAL_RECOVERY_PROVIDER_RESULT_MISMATCH'; end if;
  if job_row.payload_sha256 is distinct from p_expected_payload_sha256
     or job_row.payload_hash_version is distinct from p_expected_payload_hash_version then raise exception 'NATIVE_EXTERNAL_RECOVERY_PAYLOAD_MISMATCH'; end if;
  if lower(job_row.target_organization_id) is distinct from lower(p_expected_target_organization_id)
     or job_row.credential_alias_snapshot is distinct from p_expected_credential_alias
     or job_row.idempotency_key is distinct from p_expected_idempotency_key then raise exception 'NATIVE_EXTERNAL_RECOVERY_BINDING_MISMATCH'; end if;
  if job_row.last_error_code is distinct from 'EXTERNAL_RESULT_PERSIST_FAILED' then raise exception 'NATIVE_EXTERNAL_RECOVERY_ERROR_STATE_MISMATCH'; end if;

  read_back_snapshot := jsonb_build_object(
    'id', btrim(p_expected_external_invoice_id),
    'organizationId', lower(btrim(p_expected_target_organization_id)),
    'voucherNumber', btrim(p_read_back_invoice_number),
    'voucherStatus', lower(btrim(p_read_back_voucher_status))
  );

  update public.school_request_invoices as recovered_invoice set
    invoice_number = btrim(p_read_back_invoice_number),
    lexware_organization_id = lower(btrim(p_expected_target_organization_id)),
    lexware_invoice_id = btrim(p_expected_external_invoice_id),
    lexware_invoice_number = btrim(p_read_back_invoice_number),
    lexware_resource_uri = btrim(p_expected_resource_uri),
    lexware_voucher_status = lower(btrim(p_read_back_voucher_status)),
    lexware_created_at = p_expected_provider_created_at,
    lexware_finalized_at = recovered_at,
    lexware_last_synced_at = recovered_at,
    lexware_payload_snapshot = job_row.payload_snapshot,
    lexware_response_snapshot = read_back_snapshot,
    updated_at = recovered_at
  where recovered_invoice.id = invoice_row.id
    and recovered_invoice.request_id = p_expected_request_id
    and recovered_invoice.lexware_invoice_job_id = p_job_id
    and recovered_invoice.invoice_provider = 'lexware'
    and recovered_invoice.lexware_organization_id is null
    and recovered_invoice.lexware_invoice_id is null
    and recovered_invoice.lexware_invoice_number is null
    and recovered_invoice.lexware_resource_uri is null
    and recovered_invoice.lexware_created_at is null
    and recovered_invoice.lexware_finalized_at is null
  returning recovered_invoice.* into invoice_row;
  if not found then raise exception 'NATIVE_EXTERNAL_RECOVERY_INVOICE_CAS_CONFLICT'; end if;

  update public.school_lexware_invoice_jobs as recovered_job set
    status = 'succeeded',
    creation_state = 'definitely_created',
    lexware_invoice_number = btrim(p_read_back_invoice_number),
    lexware_voucher_status = lower(btrim(p_read_back_voucher_status)),
    lexware_response_snapshot = read_back_snapshot,
    completed_at = recovered_at,
    failed_at = null,
    last_error_code = null,
    last_error_message = null,
    locked_at = null,
    lock_expires_at = null,
    locked_by = null,
    updated_at = recovered_at
  where recovered_job.id = job_row.id
    and recovered_job.local_invoice_id = invoice_row.id
    and recovered_job.request_id = invoice_row.request_id
    and recovered_job.trigger_source = 'checkout_native_lexware'
    and recovered_job.status = 'manual_review'
    and recovered_job.creation_state = 'creation_state_unknown'
    and recovered_job.attempt_count = p_expected_attempt_count
    and recovered_job.external_write_started_at = p_expected_external_write_started_at
    and recovered_job.external_write_completed_at = p_expected_external_write_completed_at
    and recovered_job.lexware_invoice_id = btrim(p_expected_external_invoice_id)
    and recovered_job.lexware_invoice_number is null
    and recovered_job.lexware_resource_uri = btrim(p_expected_resource_uri)
    and recovered_job.lexware_created_date = p_expected_provider_created_at
    and recovered_job.payload_sha256 = p_expected_payload_sha256
    and recovered_job.payload_hash_version = p_expected_payload_hash_version
    and lower(recovered_job.target_organization_id) = lower(p_expected_target_organization_id)
    and recovered_job.credential_alias_snapshot = p_expected_credential_alias
    and recovered_job.idempotency_key = p_expected_idempotency_key
    and recovered_job.last_error_code = 'EXTERNAL_RESULT_PERSIST_FAILED'
  returning recovered_job.* into job_row;
  if not found then raise exception 'NATIVE_EXTERNAL_RECOVERY_JOB_CAS_CONFLICT'; end if;

  insert into public.school_lexware_outbox_events (
    request_id, invoice_job_id, mail_job_id, event_type,
    from_status, to_status, attempt_count, metadata, created_at
  ) values (
    job_row.request_id, job_row.id, null, 'native_external_result_recovered',
    'manual_review', 'succeeded', job_row.attempt_count,
    jsonb_build_object(
      'source', 'checkout_native_lexware',
      'external_invoice_id_verified', true,
      'read_back_verified', true,
      'provider_write_performed', false
    ), recovered_at
  );

  return query select
    true, invoice_row.id, job_row.id, job_row.status, job_row.creation_state,
    job_row.lexware_invoice_id, job_row.lexware_invoice_number;
end;
$$;

revoke all on function public.recover_native_lexware_external_result(uuid,uuid,uuid,integer,timestamptz,timestamptz,text,text,timestamptz,text,text,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.recover_native_lexware_external_result(uuid,uuid,uuid,integer,timestamptz,timestamptz,text,text,timestamptz,text,text,text,text,text,text,text)
  to service_role;

commit;
