begin;

create or replace function public.complete_native_lexware_invoice_mail_send(
  p_invoice_id uuid,
  p_mail_job_id uuid,
  p_attempt_count integer,
  p_locked_by text,
  p_message_id text
)
returns public.school_lexware_invoice_mail_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  mail_job_row public.school_lexware_invoice_mail_jobs%rowtype;
  invoice_row public.school_request_invoices%rowtype;
  invoice_job_row public.school_lexware_invoice_jobs%rowtype;
  completed_at timestamptz;
begin
  select *
  into mail_job_row
  from public.school_lexware_invoice_mail_jobs mail_job
  where mail_job.id = p_mail_job_id
    and mail_job.local_invoice_id = p_invoice_id
  for update;

  if not found then
    raise exception 'NATIVE_MAIL_SEND_COMPLETE_BLOCKED';
  end if;

  select *
  into invoice_row
  from public.school_request_invoices invoice
  where invoice.id = p_invoice_id
    and invoice.request_id = mail_job_row.request_id
    and invoice.lexware_invoice_job_id = mail_job_row.invoice_job_id
  for update;

  if not found then
    raise exception 'NATIVE_MAIL_SEND_COMPLETE_INVOICE_BINDING_BLOCKED';
  end if;

  if mail_job_row.status = 'sent'
     and mail_job_row.delivery_state = 'definitely_sent'
     and mail_job_row.attempt_count = p_attempt_count
     and mail_job_row.transport_message_id = p_message_id
     and mail_job_row.sent_at is not null
     and mail_job_row.smtp_attempt_completed_at is not null then
    if invoice_row.invoice_mail_status = 'sent'
       and invoice_row.invoice_mail_sent_at = mail_job_row.sent_at
       and invoice_row.invoice_mail_message_id = mail_job_row.transport_message_id then
      return mail_job_row;
    end if;

    raise exception 'NATIVE_MAIL_COMPLETION_ALREADY_SENT_INVOICE_STALE';
  end if;

  if mail_job_row.status <> 'processing'
     or mail_job_row.attempt_count <> p_attempt_count
     or mail_job_row.locked_by <> p_locked_by
     or mail_job_row.locked_at is null
     or mail_job_row.lock_expires_at is null
     or mail_job_row.lock_expires_at <= clock_timestamp()
     or mail_job_row.delivery_state <> 'send_started'
     or mail_job_row.smtp_attempt_started_at is null
     or mail_job_row.smtp_attempt_completed_at is not null
     or mail_job_row.transport_message_id <> p_message_id
     or mail_job_row.sent_at is not null then
    raise exception 'NATIVE_MAIL_SEND_COMPLETE_BLOCKED';
  end if;

  select *
  into invoice_job_row
  from public.school_lexware_invoice_jobs invoice_job
  where invoice_job.id = mail_job_row.invoice_job_id
    and invoice_job.local_invoice_id = invoice_row.id
    and invoice_job.request_id = invoice_row.request_id
  for update;

  if not found
     or invoice_row.invoice_provider <> 'lexware'
     or invoice_job_row.trigger_source <> 'checkout_native_lexware'
     or invoice_job_row.status <> 'succeeded'
     or invoice_job_row.creation_state <> 'definitely_created'
     or invoice_row.lexware_invoice_id is distinct from invoice_job_row.lexware_invoice_id
     or invoice_row.lexware_invoice_number is distinct from invoice_job_row.lexware_invoice_number
     or mail_job_row.lexware_invoice_id_snapshot is distinct from invoice_job_row.lexware_invoice_id
     or mail_job_row.lexware_invoice_number_snapshot is distinct from invoice_job_row.lexware_invoice_number
     or mail_job_row.lexware_organization_id_snapshot is distinct from invoice_job_row.target_organization_id then
    raise exception 'NATIVE_MAIL_SEND_COMPLETE_JOB_BINDING_BLOCKED';
  end if;

  if mail_job_row.lexware_pdf_storage_bucket is distinct from invoice_row.lexware_pdf_storage_bucket
     or mail_job_row.lexware_pdf_storage_path is distinct from invoice_row.lexware_pdf_storage_path
     or mail_job_row.lexware_pdf_stored_at is distinct from invoice_row.lexware_pdf_stored_at
     or mail_job_row.pdf_fetched_at is distinct from invoice_row.lexware_pdf_fetched_at
     or mail_job_row.pdf_sha256 is distinct from invoice_row.lexware_pdf_sha256
     or mail_job_row.pdf_size_bytes is distinct from invoice_row.lexware_pdf_size_bytes
     or mail_job_row.pdf_content_type is distinct from invoice_row.lexware_pdf_content_type
     or mail_job_row.attachment_filename_snapshot is distinct from invoice_row.lexware_pdf_filename then
    raise exception 'NATIVE_MAIL_SEND_COMPLETE_PDF_BINDING_BLOCKED';
  end if;

  completed_at := clock_timestamp();

  update public.school_lexware_invoice_mail_jobs mail_job
  set status = 'sent',
      delivery_state = 'definitely_sent',
      sent_at = completed_at,
      smtp_attempt_completed_at = completed_at,
      locked_at = null,
      lock_expires_at = null,
      locked_by = null
  where mail_job.id = mail_job_row.id
    and mail_job.local_invoice_id = invoice_row.id
    and mail_job.invoice_job_id = invoice_job_row.id
    and mail_job.request_id = invoice_row.request_id
    and mail_job.status = 'processing'
    and mail_job.attempt_count = p_attempt_count
    and mail_job.locked_by = p_locked_by
    and mail_job.delivery_state = 'send_started'
    and mail_job.smtp_attempt_started_at is not null
    and mail_job.smtp_attempt_completed_at is null
    and mail_job.transport_message_id = p_message_id
    and mail_job.sent_at is null
  returning * into mail_job_row;

  if not found then
    raise exception 'NATIVE_MAIL_SEND_COMPLETE_BLOCKED';
  end if;

  update public.school_request_invoices invoice
  set invoice_mail_status = 'sent',
      invoice_mail_attempt_count = mail_job_row.attempt_count,
      invoice_mail_last_attempt_at = mail_job_row.last_attempt_at,
      invoice_mail_sent_at = completed_at,
      invoice_mail_message_id = mail_job_row.transport_message_id,
      invoice_mail_last_error = null
  where invoice.id = invoice_row.id
    and invoice.request_id = mail_job_row.request_id
    and invoice.lexware_invoice_job_id = mail_job_row.invoice_job_id
    and invoice.invoice_provider = 'lexware'
    and invoice.invoice_mail_status <> 'sent'
    and invoice.invoice_mail_sent_at is null
  returning * into invoice_row;

  if not found then
    raise exception 'NATIVE_MAIL_SEND_COMPLETE_INVOICE_UPDATE_BLOCKED';
  end if;

  return mail_job_row;
end;
$$;

revoke all on function public.complete_native_lexware_invoice_mail_send(
  uuid, uuid, integer, text, text
) from public, anon, authenticated;

grant execute on function public.complete_native_lexware_invoice_mail_send(
  uuid, uuid, integer, text, text
) to service_role;

commit;
