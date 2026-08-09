begin;

create or replace function public.enqueue_school_lexware_invoice_mail_job(
  p_invoice_job_id uuid,
  p_recipient_email text,
  p_recipient_name text,
  p_from_name text,
  p_from_email text,
  p_reply_to_email text,
  p_subject text,
  p_text_body text,
  p_html_body text,
  p_attachment_filename text,
  p_mail_payload_snapshot jsonb
)
returns public.school_lexware_invoice_mail_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  settings_row public.business_runtime_settings%rowtype;
  invoice_job_row public.school_lexware_invoice_jobs%rowtype;
  invoice_row public.school_request_invoices%rowtype;
  mail_job_row public.school_lexware_invoice_mail_jobs%rowtype;
  desired_status text;
  generated_idempotency_key text;
  generated_payload_hash text;
begin
  if p_invoice_job_id is null then
    raise exception 'Keine Lexware-Rechnungsjob-ID übergeben.';
  end if;

  if p_mail_payload_snapshot is null
     or jsonb_typeof(p_mail_payload_snapshot) <> 'object' then
    raise exception 'mail_payload_snapshot muss ein JSON-Objekt sein.';
  end if;

  if coalesce(p_recipient_email, '') !~*
     '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Empfänger-E-Mail ist ungültig.';
  end if;

  if coalesce(p_from_email, '') !~*
     '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Absender-E-Mail ist ungültig.';
  end if;

  if p_reply_to_email is not null
     and btrim(p_reply_to_email) <> ''
     and p_reply_to_email !~*
       '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Reply-To-E-Mail ist ungültig.';
  end if;

  if btrim(coalesce(p_from_name, '')) = '' then
    raise exception 'Absendername fehlt.';
  end if;

  if btrim(coalesce(p_subject, '')) = '' then
    raise exception 'E-Mail-Betreff fehlt.';
  end if;

  if btrim(coalesce(p_text_body, '')) = '' then
    raise exception 'Text-E-Mail fehlt.';
  end if;

  if btrim(coalesce(p_html_body, '')) = '' then
    raise exception 'HTML-E-Mail fehlt.';
  end if;

  if btrim(coalesce(p_attachment_filename, '')) = ''
     or lower(p_attachment_filename) not like '%.pdf' then
    raise exception 'Der PDF-Dateiname ist ungültig.';
  end if;

  select *
  into settings_row
  from public.business_runtime_settings
  where id = 'default';

  if not found then
    raise exception 'business_runtime_settings/default fehlt.';
  end if;

  select *
  into invoice_job_row
  from public.school_lexware_invoice_jobs
  where id = p_invoice_job_id
  for update;

  if not found then
    raise exception 'Lexware-Rechnungsjob % wurde nicht gefunden.', p_invoice_job_id;
  end if;

  if invoice_job_row.status <> 'succeeded' then
    raise exception 'Lexware-Rechnungsjob % besitzt Status % statt succeeded.',
      p_invoice_job_id, invoice_job_row.status;
  end if;

  if invoice_job_row.local_invoice_id is null then
    raise exception 'Der Lexware-Rechnungsjob ist noch nicht mit einer lokalen Rechnungsbrücke verknüpft.';
  end if;

  if invoice_job_row.lexware_invoice_id is null
     or invoice_job_row.lexware_invoice_number is null then
    raise exception 'Lexware-Rechnungs-ID oder Rechnungsnummer fehlt.';
  end if;

  select *
  into invoice_row
  from public.school_request_invoices
  where id = invoice_job_row.local_invoice_id
  for update;

  if not found then
    raise exception 'Lokale Rechnungsbrücke % fehlt.', invoice_job_row.local_invoice_id;
  end if;

  if invoice_row.request_id <> invoice_job_row.request_id then
    raise exception 'Rechnungsjob und lokale Rechnung gehören zu unterschiedlichen Anfragen.';
  end if;

  if invoice_row.invoice_provider <> 'lexware' then
    raise exception 'Lokale Rechnung verwendet nicht den Provider Lexware.';
  end if;

  if invoice_row.lexware_invoice_job_id <> invoice_job_row.id then
    raise exception 'Lokale Rechnung verweist nicht auf den erwarteten Lexware-Job.';
  end if;

  if invoice_row.lexware_invoice_id <> invoice_job_row.lexware_invoice_id
     or invoice_row.lexware_invoice_number <> invoice_job_row.lexware_invoice_number then
    raise exception 'Lexware-Identität von Job und lokaler Rechnung stimmt nicht überein.';
  end if;

  generated_idempotency_key :=
    'lexware-invoice-mail-v1:' || invoice_job_row.id::text;

  generated_payload_hash :=
    encode(
      extensions.digest(
        p_mail_payload_snapshot::text,
        'sha256'
      ),
      'hex'
    );

  select *
  into mail_job_row
  from public.school_lexware_invoice_mail_jobs
  where invoice_job_id = invoice_job_row.id
  for update;

  if found then
    if mail_job_row.idempotency_key <> generated_idempotency_key then
      raise exception 'Bestehender Rechnungs-Mailjob besitzt einen abweichenden Idempotenzschlüssel.';
    end if;

    if lower(mail_job_row.recipient_email_snapshot)
       <> lower(btrim(p_recipient_email)) then
      raise exception 'Für diese Rechnung existiert bereits ein Mailjob für eine andere Empfängeradresse.';
    end if;

    if mail_job_row.mail_payload_sha256 <> generated_payload_hash then
      raise exception 'Für diese Rechnung existiert bereits ein Mailjob mit einem anderen Mail-Snapshot.';
    end if;

    return mail_job_row;
  end if;

  if invoice_row.invoice_mail_status = 'sent'
     or invoice_row.invoice_mail_sent_at is not null then
    raise exception 'Die Lexware-Rechnung wurde laut lokaler Rechnungsbrücke bereits versandt.';
  end if;

  desired_status := case
    when settings_row.lexware_automatic_mail_enabled
      and clock_timestamp() >= settings_row.invoice_cutover_at
      then 'pending'
    else 'waiting_for_activation'
  end;

  insert into public.school_lexware_invoice_mail_jobs (
    invoice_job_id,
    request_id,
    local_invoice_id,
    idempotency_key,
    sender_alias_snapshot,
    from_name_snapshot,
    from_email_snapshot,
    reply_to_email_snapshot,
    recipient_name_snapshot,
    recipient_email_snapshot,
    subject_snapshot,
    text_body_snapshot,
    html_body_snapshot,
    attachment_filename_snapshot,
    lexware_organization_id_snapshot,
    lexware_invoice_id_snapshot,
    lexware_invoice_number_snapshot,
    status,
    attempt_count,
    max_attempts,
    next_attempt_at,
    mail_payload_snapshot,
    mail_payload_sha256,
    created_at,
    updated_at
  )
  values (
    invoice_job_row.id,
    invoice_job_row.request_id,
    invoice_row.id,
    generated_idempotency_key,
    settings_row.lexware_invoice_mail_sender_alias,
    btrim(p_from_name),
    lower(btrim(p_from_email)),
    nullif(lower(btrim(coalesce(p_reply_to_email, ''))), ''),
    nullif(btrim(coalesce(p_recipient_name, '')), ''),
    lower(btrim(p_recipient_email)),
    btrim(p_subject),
    p_text_body,
    p_html_body,
    btrim(p_attachment_filename),
    invoice_job_row.target_organization_id,
    invoice_job_row.lexware_invoice_id,
    invoice_job_row.lexware_invoice_number,
    desired_status,
    0,
    settings_row.lexware_mail_job_max_attempts,
    clock_timestamp(),
    p_mail_payload_snapshot,
    generated_payload_hash,
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict (invoice_job_id) do nothing
  returning * into mail_job_row;

  if not found then
    select *
    into mail_job_row
    from public.school_lexware_invoice_mail_jobs
    where invoice_job_id = invoice_job_row.id
    for update;

    if not found then
      raise exception 'Rechnungs-Mailjob konnte weder angelegt noch erneut geladen werden.';
    end if;

    if mail_job_row.idempotency_key <> generated_idempotency_key
       or mail_job_row.mail_payload_sha256 <> generated_payload_hash
       or lower(mail_job_row.recipient_email_snapshot)
          <> lower(btrim(p_recipient_email)) then
      raise exception 'Ein paralleler Rechnungs-Mailjob besitzt abweichende Identitätsdaten.';
    end if;
  end if;

  update public.school_request_invoices
  set invoice_mail_status = mail_job_row.status,
      invoice_mail_queued_at = coalesce(invoice_mail_queued_at, mail_job_row.created_at),
      invoice_mail_last_error = null
  where id = invoice_row.id;

  return mail_job_row;
end;
$$;

revoke all on function public.enqueue_school_lexware_invoice_mail_job(
  uuid, text, text, text, text, text, text, text, text, text, jsonb
) from public, anon, authenticated;

grant execute on function public.enqueue_school_lexware_invoice_mail_job(
  uuid, text, text, text, text, text, text, text, text, text, jsonb
) to service_role;

commit;
