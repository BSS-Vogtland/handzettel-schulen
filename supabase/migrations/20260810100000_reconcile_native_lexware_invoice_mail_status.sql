begin;

create or replace function public.reconcile_native_lexware_invoice_mail_status(
  p_invoice_id uuid,
  p_request_id uuid,
  p_invoice_job_id uuid,
  p_mail_job_id uuid,
  p_attempt_count integer,
  p_message_id text,
  p_sent_at timestamptz,
  p_pdf_storage_bucket text,
  p_pdf_storage_path text,
  p_pdf_stored_at timestamptz,
  p_pdf_fetched_at timestamptz,
  p_pdf_sha256 text,
  p_pdf_size_bytes bigint,
  p_pdf_content_type text,
  p_attachment_filename text
)
returns public.school_request_invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invoice_row public.school_request_invoices%rowtype;
  invoice_job_row public.school_lexware_invoice_jobs%rowtype;
  mail_job_row public.school_lexware_invoice_mail_jobs%rowtype;
begin
  if p_attempt_count < 1
     or nullif(btrim(p_message_id), '') is null
     or p_sent_at is null
     or p_pdf_storage_bucket <> 'lexware-invoice-pdfs'
     or nullif(btrim(p_pdf_storage_path), '') is null
     or p_pdf_stored_at is null
     or p_pdf_fetched_at is null
     or p_pdf_sha256 !~ '^[a-f0-9]{64}$'
     or p_pdf_size_bytes <= 0
     or p_pdf_content_type <> 'application/pdf'
     or nullif(btrim(p_attachment_filename), '') is null
     or lower(p_attachment_filename) not like '%.pdf' then
    raise exception 'NATIVE_MAIL_STATUS_RECONCILE_INPUT_INVALID';
  end if;

  select *
  into invoice_row
  from public.school_request_invoices invoice
  where invoice.id = p_invoice_id
    and invoice.request_id = p_request_id
    and invoice.lexware_invoice_job_id = p_invoice_job_id
    and invoice.invoice_provider = 'lexware'
  for update;

  if not found then
    raise exception 'NATIVE_MAIL_STATUS_RECONCILE_INVOICE_BINDING_BLOCKED';
  end if;

  select *
  into invoice_job_row
  from public.school_lexware_invoice_jobs invoice_job
  where invoice_job.id = p_invoice_job_id
    and invoice_job.local_invoice_id = p_invoice_id
    and invoice_job.request_id = p_request_id
    and invoice_job.trigger_source = 'checkout_native_lexware'
    and invoice_job.status = 'succeeded'
    and invoice_job.creation_state = 'definitely_created'
  for update;

  if not found
     or invoice_row.lexware_invoice_id is distinct from invoice_job_row.lexware_invoice_id
     or invoice_row.lexware_invoice_number is distinct from invoice_job_row.lexware_invoice_number then
    raise exception 'NATIVE_MAIL_STATUS_RECONCILE_JOB_BINDING_BLOCKED';
  end if;

  select *
  into mail_job_row
  from public.school_lexware_invoice_mail_jobs mail_job
  where mail_job.id = p_mail_job_id
    and mail_job.local_invoice_id = p_invoice_id
    and mail_job.request_id = p_request_id
    and mail_job.invoice_job_id = p_invoice_job_id
  for update;

  if not found
     or mail_job_row.status <> 'sent'
     or mail_job_row.delivery_state <> 'definitely_sent'
     or mail_job_row.attempt_count <> p_attempt_count
     or mail_job_row.transport_message_id is distinct from p_message_id
     or mail_job_row.sent_at is distinct from p_sent_at
     or mail_job_row.smtp_attempt_started_at is null
     or mail_job_row.smtp_attempt_completed_at is null
     or mail_job_row.locked_at is not null
     or mail_job_row.lock_expires_at is not null
     or mail_job_row.locked_by is not null
     or mail_job_row.last_error_code is not null
     or mail_job_row.last_error_message is not null
     or mail_job_row.manual_review_reason is not null
     or mail_job_row.failed_at is not null
     or mail_job_row.cancelled_at is not null then
    raise exception 'NATIVE_MAIL_STATUS_RECONCILE_MAIL_JOB_BLOCKED';
  end if;

  if mail_job_row.lexware_organization_id_snapshot is distinct from invoice_job_row.target_organization_id
     or mail_job_row.lexware_invoice_id_snapshot is distinct from invoice_job_row.lexware_invoice_id
     or mail_job_row.lexware_invoice_number_snapshot is distinct from invoice_job_row.lexware_invoice_number
     or mail_job_row.lexware_pdf_storage_bucket is distinct from p_pdf_storage_bucket
     or mail_job_row.lexware_pdf_storage_path is distinct from p_pdf_storage_path
     or mail_job_row.lexware_pdf_stored_at is distinct from p_pdf_stored_at
     or mail_job_row.pdf_fetched_at is distinct from p_pdf_fetched_at
     or mail_job_row.pdf_sha256 is distinct from p_pdf_sha256
     or mail_job_row.pdf_size_bytes is distinct from p_pdf_size_bytes
     or mail_job_row.pdf_content_type is distinct from p_pdf_content_type
     or mail_job_row.attachment_filename_snapshot is distinct from p_attachment_filename
     or invoice_row.lexware_pdf_storage_bucket is distinct from p_pdf_storage_bucket
     or invoice_row.lexware_pdf_storage_path is distinct from p_pdf_storage_path
     or invoice_row.lexware_pdf_stored_at is distinct from p_pdf_stored_at
     or invoice_row.lexware_pdf_fetched_at is distinct from p_pdf_fetched_at
     or invoice_row.lexware_pdf_sha256 is distinct from p_pdf_sha256
     or invoice_row.lexware_pdf_size_bytes is distinct from p_pdf_size_bytes
     or invoice_row.lexware_pdf_content_type is distinct from p_pdf_content_type
     or invoice_row.lexware_pdf_filename is distinct from p_attachment_filename then
    raise exception 'NATIVE_MAIL_STATUS_RECONCILE_PDF_BINDING_BLOCKED';
  end if;

  if invoice_row.invoice_mail_status = 'sent'
     and invoice_row.invoice_mail_attempt_count = mail_job_row.attempt_count
     and invoice_row.invoice_mail_last_attempt_at is not distinct from mail_job_row.last_attempt_at
     and invoice_row.invoice_mail_sent_at = mail_job_row.sent_at
     and invoice_row.invoice_mail_message_id = mail_job_row.transport_message_id
     and invoice_row.invoice_mail_last_error is null then
    return invoice_row;
  end if;

  if invoice_row.invoice_mail_status <> 'waiting_for_activation'
     or invoice_row.invoice_mail_sent_at is not null then
    raise exception 'NATIVE_MAIL_STATUS_RECONCILE_INVOICE_STATE_BLOCKED';
  end if;

  update public.school_request_invoices invoice
  set invoice_mail_status = 'sent',
      invoice_mail_attempt_count = mail_job_row.attempt_count,
      invoice_mail_last_attempt_at = mail_job_row.last_attempt_at,
      invoice_mail_sent_at = mail_job_row.sent_at,
      invoice_mail_message_id = mail_job_row.transport_message_id,
      invoice_mail_last_error = null
  where invoice.id = p_invoice_id
    and invoice.request_id = p_request_id
    and invoice.lexware_invoice_job_id = p_invoice_job_id
    and invoice.invoice_provider = 'lexware'
    and invoice.invoice_mail_status = 'waiting_for_activation'
    and invoice.invoice_mail_sent_at is null
    and exists (
      select 1
      from public.school_lexware_invoice_mail_jobs unchanged_mail_job
      where unchanged_mail_job.id = p_mail_job_id
        and unchanged_mail_job.local_invoice_id = p_invoice_id
        and unchanged_mail_job.request_id = p_request_id
        and unchanged_mail_job.invoice_job_id = p_invoice_job_id
        and unchanged_mail_job.status = 'sent'
        and unchanged_mail_job.delivery_state = 'definitely_sent'
        and unchanged_mail_job.attempt_count = p_attempt_count
        and unchanged_mail_job.transport_message_id = p_message_id
        and unchanged_mail_job.sent_at = p_sent_at
        and unchanged_mail_job.lexware_pdf_storage_bucket = p_pdf_storage_bucket
        and unchanged_mail_job.lexware_pdf_storage_path = p_pdf_storage_path
        and unchanged_mail_job.lexware_pdf_stored_at = p_pdf_stored_at
        and unchanged_mail_job.pdf_fetched_at = p_pdf_fetched_at
        and unchanged_mail_job.pdf_sha256 = p_pdf_sha256
        and unchanged_mail_job.pdf_size_bytes = p_pdf_size_bytes
        and unchanged_mail_job.pdf_content_type = p_pdf_content_type
        and unchanged_mail_job.attachment_filename_snapshot = p_attachment_filename
    )
  returning * into invoice_row;

  if not found then
    raise exception 'NATIVE_MAIL_STATUS_RECONCILE_CAS_BLOCKED';
  end if;

  return invoice_row;
end;
$$;

revoke all on function public.reconcile_native_lexware_invoice_mail_status(
  uuid, uuid, uuid, uuid, integer, text, timestamptz, text, text,
  timestamptz, timestamptz, text, bigint, text, text
) from public, anon, authenticated;

grant execute on function public.reconcile_native_lexware_invoice_mail_status(
  uuid, uuid, uuid, uuid, integer, text, timestamptz, text, text,
  timestamptz, timestamptz, text, bigint, text, text
) to service_role;

commit;
