begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lexware-invoice-pdfs', 'lexware-invoice-pdfs', false, 10485760, array['application/pdf']::text[])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

alter table public.school_request_invoices
  add column if not exists lexware_pdf_storage_bucket text,
  add column if not exists lexware_pdf_storage_path text,
  add column if not exists lexware_pdf_stored_at timestamptz;

alter table public.school_lexware_invoice_mail_jobs
  add column if not exists lexware_pdf_storage_bucket text,
  add column if not exists lexware_pdf_storage_path text,
  add column if not exists lexware_pdf_stored_at timestamptz,
  add column if not exists delivery_state text not null default 'not_attempted',
  add column if not exists smtp_attempt_started_at timestamptz,
  add column if not exists smtp_attempt_completed_at timestamptz,
  add column if not exists manual_review_reason text;

alter table public.school_request_invoices drop constraint if exists school_request_invoices_lexware_pdf_storage_complete;
alter table public.school_request_invoices add constraint school_request_invoices_lexware_pdf_storage_complete check (
  (lexware_pdf_fetched_at is null and lexware_pdf_sha256 is null and lexware_pdf_size_bytes is null
    and lexware_pdf_content_type is null and lexware_pdf_filename is null
    and lexware_pdf_storage_bucket is null and lexware_pdf_storage_path is null and lexware_pdf_stored_at is null)
  or
  (lexware_pdf_fetched_at is not null and lexware_pdf_sha256 ~ '^[a-f0-9]{64}$'
    and lexware_pdf_size_bytes between 100 and 10485760 and lexware_pdf_content_type='application/pdf'
    and nullif(btrim(lexware_pdf_filename),'') is not null
    and lexware_pdf_storage_bucket='lexware-invoice-pdfs'
    and lexware_pdf_storage_path ~ '^lexware-invoices/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+/[a-f0-9]{64}\.pdf$'
    and right(lexware_pdf_storage_path, 68)=lexware_pdf_sha256 || '.pdf'
    and lexware_pdf_stored_at is not null)
);

alter table public.school_lexware_invoice_mail_jobs drop constraint if exists school_lexware_invoice_mail_jobs_status_check;
alter table public.school_lexware_invoice_mail_jobs drop constraint if exists school_lexware_invoice_mail_jobs_delivery_state_check;
alter table public.school_lexware_invoice_mail_jobs drop constraint if exists school_lexware_invoice_mail_jobs_pdf_storage_complete;
alter table public.school_lexware_invoice_mail_jobs drop constraint if exists school_lexware_invoice_mail_jobs_delivery_status_consistent;
alter table public.school_lexware_invoice_mail_jobs add constraint school_lexware_invoice_mail_jobs_status_check check
  (status in ('waiting_for_activation','pending','processing','retry','sent','failed','manual_review','cancelled')),
  add constraint school_lexware_invoice_mail_jobs_delivery_state_check check
  (delivery_state in ('not_attempted','definitely_not_sent','send_started','definitely_sent','ambiguous_send')),
  add constraint school_lexware_invoice_mail_jobs_pdf_storage_complete check (
    (lexware_pdf_storage_bucket is null and lexware_pdf_storage_path is null and lexware_pdf_stored_at is null
      and pdf_fetched_at is null and pdf_sha256 is null and pdf_size_bytes is null and pdf_content_type is null)
    or (lexware_pdf_storage_bucket='lexware-invoice-pdfs' and nullif(btrim(lexware_pdf_storage_path),'') is not null
    and lexware_pdf_stored_at is not null and pdf_fetched_at is not null and pdf_sha256 ~ '^[a-f0-9]{64}$'
    and pdf_size_bytes between 100 and 10485760 and pdf_content_type='application/pdf'
    and right(lexware_pdf_storage_path,68)=pdf_sha256 || '.pdf')),
  add constraint school_lexware_invoice_mail_jobs_delivery_status_consistent check (
    (status='sent' and delivery_state='definitely_sent' and sent_at is not null and smtp_attempt_completed_at is not null and nullif(btrim(transport_message_id),'') is not null)
    or (status='manual_review' and delivery_state='ambiguous_send' and smtp_attempt_started_at is not null and nullif(btrim(manual_review_reason),'') is not null)
    or (status in ('waiting_for_activation','pending','processing','retry','failed','cancelled') and delivery_state in ('not_attempted','definitely_not_sent','send_started')));

create or replace function public.persist_native_lexware_invoice_pdf_storage(
  p_invoice_id uuid, p_job_id uuid, p_request_id uuid, p_expected_payload_sha256 text,
  p_expected_organization_id text, p_expected_external_invoice_id text, p_expected_external_invoice_number text,
  p_pdf_sha256 text, p_pdf_size_bytes bigint, p_pdf_content_type text, p_pdf_filename text,
  p_pdf_fetched_at timestamptz, p_storage_bucket text, p_storage_path text, p_storage_stored_at timestamptz)
returns public.school_request_invoices language plpgsql security definer set search_path=public,pg_temp as $$
declare i public.school_request_invoices%rowtype; j public.school_lexware_invoice_jobs%rowtype;
begin
  select * into i from public.school_request_invoices where id=p_invoice_id and request_id=p_request_id for update;
  select * into j from public.school_lexware_invoice_jobs where id=p_job_id and local_invoice_id=p_invoice_id and request_id=p_request_id for update;
  if not found or i.invoice_provider<>'lexware' or j.trigger_source<>'checkout_native_lexware'
    or j.status<>'succeeded' or j.creation_state<>'definitely_created' then raise exception 'NATIVE_PDF_STATE_BLOCKED'; end if;
  if j.payload_hash_version<>'lexware-payload-canonical-v2' or j.payload_sha256<>p_expected_payload_sha256
    or lower(j.target_organization_id)<>lower(p_expected_organization_id)
    or j.lexware_invoice_id<>p_expected_external_invoice_id or j.lexware_invoice_number<>p_expected_external_invoice_number
    or i.lexware_invoice_id<>j.lexware_invoice_id or i.lexware_invoice_number<>j.lexware_invoice_number then raise exception 'NATIVE_PDF_BINDING_MISMATCH'; end if;
  if p_pdf_sha256 !~ '^[a-f0-9]{64}$' or p_pdf_size_bytes not between 100 and 10485760
    or p_pdf_content_type<>'application/pdf' or p_storage_bucket<>'lexware-invoice-pdfs'
    or right(p_storage_path,68)<>p_pdf_sha256||'.pdf' then raise exception 'NATIVE_PDF_METADATA_INVALID'; end if;
  if i.lexware_pdf_sha256 is not null then
    if i.lexware_pdf_sha256<>p_pdf_sha256 or i.lexware_pdf_size_bytes<>p_pdf_size_bytes or i.lexware_pdf_storage_path<>p_storage_path then raise exception 'NATIVE_PDF_ALREADY_BOUND_MISMATCH'; end if;
    return i;
  end if;
  update public.school_request_invoices set lexware_pdf_fetched_at=p_pdf_fetched_at, lexware_pdf_sha256=p_pdf_sha256,
    lexware_pdf_size_bytes=p_pdf_size_bytes, lexware_pdf_content_type=p_pdf_content_type, lexware_pdf_filename=p_pdf_filename,
    lexware_pdf_storage_bucket=p_storage_bucket, lexware_pdf_storage_path=p_storage_path, lexware_pdf_stored_at=p_storage_stored_at
  where id=p_invoice_id returning * into i;
  return i;
end $$;

create or replace function public.enqueue_native_lexware_invoice_mail_job_manual(
 p_invoice_job_id uuid,p_recipient_email text,p_recipient_name text,p_from_name text,p_from_email text,p_reply_to_email text,
 p_subject text,p_text_body text,p_html_body text,p_attachment_filename text,p_mail_payload_snapshot jsonb)
returns public.school_lexware_invoice_mail_jobs language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.school_lexware_invoice_mail_jobs%rowtype; i public.school_request_invoices%rowtype;
begin
 select * into i from public.school_request_invoices where lexware_invoice_job_id=p_invoice_job_id for update;
 if not found or i.invoice_provider<>'lexware' or i.lexware_pdf_sha256 is null or i.lexware_pdf_storage_path is null then
   raise exception 'NATIVE_MAIL_PDF_NOT_READY'; end if;
 m:=public.enqueue_school_lexware_invoice_mail_job(p_invoice_job_id,p_recipient_email,p_recipient_name,p_from_name,p_from_email,
   p_reply_to_email,p_subject,p_text_body,p_html_body,p_attachment_filename,p_mail_payload_snapshot);
 update public.school_lexware_invoice_mail_jobs set lexware_pdf_storage_bucket=i.lexware_pdf_storage_bucket,
   lexware_pdf_storage_path=i.lexware_pdf_storage_path,lexware_pdf_stored_at=i.lexware_pdf_stored_at,
   pdf_fetched_at=i.lexware_pdf_fetched_at,pdf_sha256=i.lexware_pdf_sha256,pdf_size_bytes=i.lexware_pdf_size_bytes,
   pdf_content_type=i.lexware_pdf_content_type where id=m.id returning * into m;
 return m;
end $$;

create or replace function public.activate_native_lexware_invoice_mail_job(p_invoice_id uuid, p_mail_job_id uuid)
returns public.school_lexware_invoice_mail_jobs language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.school_lexware_invoice_mail_jobs%rowtype;
begin
 update public.school_lexware_invoice_mail_jobs set status='pending',next_attempt_at=clock_timestamp()
 where id=p_mail_job_id and local_invoice_id=p_invoice_id and status='waiting_for_activation' and attempt_count=0
 returning * into m; if not found then raise exception 'NATIVE_MAIL_ACTIVATION_BLOCKED'; end if; return m;
end $$;

create or replace function public.claim_native_lexware_invoice_mail_job(p_invoice_id uuid,p_mail_job_id uuid,p_locked_by text,p_lock_seconds integer)
returns public.school_lexware_invoice_mail_jobs language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.school_lexware_invoice_mail_jobs%rowtype;
begin
 if p_lock_seconds not between 30 and 300 or nullif(btrim(p_locked_by),'') is null then raise exception 'NATIVE_MAIL_CLAIM_INPUT_INVALID'; end if;
 update public.school_lexware_invoice_mail_jobs set status='processing',attempt_count=attempt_count+1,last_attempt_at=clock_timestamp(),
  locked_at=clock_timestamp(),lock_expires_at=clock_timestamp()+make_interval(secs=>p_lock_seconds),locked_by=p_locked_by
 where id=p_mail_job_id and local_invoice_id=p_invoice_id and status in ('pending','retry') and delivery_state in ('not_attempted','definitely_not_sent')
  and attempt_count<max_attempts and locked_at is null returning * into m;
 if not found then raise exception 'NATIVE_MAIL_CLAIM_BLOCKED'; end if; return m;
end $$;

create or replace function public.mark_native_lexware_invoice_mail_send_started(p_invoice_id uuid,p_mail_job_id uuid,p_attempt_count integer,p_locked_by text,p_message_id text)
returns public.school_lexware_invoice_mail_jobs language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.school_lexware_invoice_mail_jobs%rowtype;
begin
 update public.school_lexware_invoice_mail_jobs set delivery_state='send_started',smtp_attempt_started_at=clock_timestamp(),transport_message_id=p_message_id
 where id=p_mail_job_id and local_invoice_id=p_invoice_id and status='processing' and attempt_count=p_attempt_count
  and locked_by=p_locked_by and lock_expires_at>clock_timestamp() and delivery_state in ('not_attempted','definitely_not_sent')
  and transport_message_id is null returning * into m;
 if not found then raise exception 'NATIVE_MAIL_SEND_MARKER_BLOCKED'; end if; return m;
end $$;

create or replace function public.complete_native_lexware_invoice_mail_send(p_invoice_id uuid,p_mail_job_id uuid,p_attempt_count integer,p_locked_by text,p_message_id text)
returns public.school_lexware_invoice_mail_jobs language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.school_lexware_invoice_mail_jobs%rowtype;
begin
 update public.school_lexware_invoice_mail_jobs set status='sent',delivery_state='definitely_sent',sent_at=clock_timestamp(),smtp_attempt_completed_at=clock_timestamp(),locked_at=null,lock_expires_at=null,locked_by=null
 where id=p_mail_job_id and local_invoice_id=p_invoice_id and status='processing' and attempt_count=p_attempt_count and locked_by=p_locked_by
  and delivery_state='send_started' and transport_message_id=p_message_id returning * into m;
 if not found then raise exception 'NATIVE_MAIL_SEND_COMPLETE_BLOCKED'; end if; return m;
end $$;

create or replace function public.record_native_lexware_invoice_mail_failure(p_invoice_id uuid,p_mail_job_id uuid,p_attempt_count integer,p_locked_by text,p_error_code text,p_ambiguous boolean)
returns public.school_lexware_invoice_mail_jobs language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.school_lexware_invoice_mail_jobs%rowtype;
begin
 update public.school_lexware_invoice_mail_jobs set status=case when p_ambiguous then 'manual_review' when attempt_count>=max_attempts then 'failed' else 'retry' end,
  delivery_state=case when p_ambiguous then 'ambiguous_send' else 'definitely_not_sent' end,
  manual_review_reason=case when p_ambiguous then p_error_code else null end,last_error_code=p_error_code,
  failed_at=case when not p_ambiguous and attempt_count>=max_attempts then clock_timestamp() else null end,
  locked_at=null,lock_expires_at=null,locked_by=null
 where id=p_mail_job_id and local_invoice_id=p_invoice_id and status='processing' and attempt_count=p_attempt_count and locked_by=p_locked_by
  and ((p_ambiguous and delivery_state='send_started') or (not p_ambiguous and delivery_state in ('not_attempted','definitely_not_sent')))
 returning * into m; if not found then raise exception 'NATIVE_MAIL_FAILURE_RECORD_BLOCKED'; end if; return m;
end $$;

alter table public.school_request_invoices enable row level security;
alter table public.school_lexware_invoice_mail_jobs enable row level security;
revoke all on table public.school_lexware_invoice_mail_jobs from public,anon,authenticated;
grant select,insert,update on table public.school_lexware_invoice_mail_jobs to service_role;

do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('persist_native_lexware_invoice_pdf_storage','enqueue_native_lexware_invoice_mail_job_manual','activate_native_lexware_invoice_mail_job','claim_native_lexware_invoice_mail_job','mark_native_lexware_invoice_mail_send_started','complete_native_lexware_invoice_mail_send','record_native_lexware_invoice_mail_failure')
 loop execute format('revoke all on function %s from public, anon, authenticated',f); execute format('grant execute on function %s to service_role',f); end loop;
end $$;

commit;
