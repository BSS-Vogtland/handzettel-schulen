begin;

-- ============================================================
-- HANDZETTEL-SCHULEN.DE
-- LEXWARE OUTBOX + MAIL IDEMPOTENCY FOUNDATION V1
--
-- Marker:
-- LEXWARE_OUTBOX_MAIL_IDEMPOTENCY_V1
--
-- Diese Migration:
-- - ruft Lexware nicht auf,
-- - versendet keine E-Mail,
-- - speichert keine API-Schlüssel,
-- - aktiviert keine produktiven Schreibzugriffe,
-- - aktiviert keinen automatischen Rechnungsversand,
-- - verändert keine historische Rechnungsnummer,
-- - erzeugt noch keinen Outbox-Job.
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- 1. Harte Voraussetzungen
-- ============================================================

do $$
begin
  if to_regclass(
    'public.business_runtime_settings'
  ) is null then
    raise exception
      'business_runtime_settings fehlt. Zuerst die Cutover-Foundation ausführen.';
  end if;

  if to_regclass(
    'public.school_requests'
  ) is null then
    raise exception
      'school_requests fehlt.';
  end if;

  if to_regclass(
    'public.school_request_invoices'
  ) is null then
    raise exception
      'school_request_invoices fehlt.';
  end if;

  if to_regprocedure(
    'public.assign_school_request_invoice_provider(uuid)'
  ) is null then
    raise exception
      'assign_school_request_invoice_provider(uuid) fehlt.';
  end if;

  if not exists (
    select 1
    from public.business_runtime_settings
    where id = 'default'
  ) then
    raise exception
      'business_runtime_settings/default fehlt.';
  end if;
end
$$;

-- ============================================================
-- 2. Betriebsparameter ohne Secrets
--
-- Die Aliaswerte verweisen später nur auf serverseitige
-- Vercel-Secrets. Es wird kein API-Key in Supabase gespeichert.
-- ============================================================

alter table public.business_runtime_settings
  add column if not exists
    lexware_outbox_schema_version text
    not null
    default 'lexware-outbox-mail-v1',

  add column if not exists
    lexware_production_credential_alias text
    not null
    default 'lexware_production',

  add column if not exists
    lexware_invoice_mail_sender_alias text
    not null
    default 'ionos_invoice_sender',

  add column if not exists
    lexware_invoice_job_max_attempts integer
    not null
    default 8,

  add column if not exists
    lexware_mail_job_max_attempts integer
    not null
    default 8;

update public.business_runtime_settings
set
  lexware_outbox_schema_version =
    'lexware-outbox-mail-v1',

  lexware_production_credential_alias =
    case
      when btrim(
        coalesce(
          lexware_production_credential_alias,
          ''
        )
      ) = ''
        then 'lexware_production'
      else lexware_production_credential_alias
    end,

  lexware_invoice_mail_sender_alias =
    case
      when btrim(
        coalesce(
          lexware_invoice_mail_sender_alias,
          ''
        )
      ) = ''
        then 'ionos_invoice_sender'
      else lexware_invoice_mail_sender_alias
    end,

  lexware_invoice_job_max_attempts =
    case
      when lexware_invoice_job_max_attempts
        between 1 and 50
        then lexware_invoice_job_max_attempts
      else 8
    end,

  lexware_mail_job_max_attempts =
    case
      when lexware_mail_job_max_attempts
        between 1 and 50
        then lexware_mail_job_max_attempts
      else 8
    end

where id = 'default';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid =
      'public.business_runtime_settings'::regclass
      and conname =
        'business_runtime_settings_lexware_schema_version_not_blank'
  ) then
    alter table public.business_runtime_settings
      add constraint
        business_runtime_settings_lexware_schema_version_not_blank
      check (
        btrim(
          lexware_outbox_schema_version
        ) <> ''
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid =
      'public.business_runtime_settings'::regclass
      and conname =
        'business_runtime_settings_lexware_credential_alias_not_blank'
  ) then
    alter table public.business_runtime_settings
      add constraint
        business_runtime_settings_lexware_credential_alias_not_blank
      check (
        btrim(
          lexware_production_credential_alias
        ) <> ''
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid =
      'public.business_runtime_settings'::regclass
      and conname =
        'business_runtime_settings_mail_sender_alias_not_blank'
  ) then
    alter table public.business_runtime_settings
      add constraint
        business_runtime_settings_mail_sender_alias_not_blank
      check (
        btrim(
          lexware_invoice_mail_sender_alias
        ) <> ''
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid =
      'public.business_runtime_settings'::regclass
      and conname =
        'business_runtime_settings_invoice_attempts_range'
  ) then
    alter table public.business_runtime_settings
      add constraint
        business_runtime_settings_invoice_attempts_range
      check (
        lexware_invoice_job_max_attempts
        between 1 and 50
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid =
      'public.business_runtime_settings'::regclass
      and conname =
        'business_runtime_settings_mail_attempts_range'
  ) then
    alter table public.business_runtime_settings
      add constraint
        business_runtime_settings_mail_attempts_range
      check (
        lexware_mail_job_max_attempts
        between 1 and 50
      );
  end if;
end
$$;

-- ============================================================
-- 3. Lexware-Rechnungs-Outbox
--
-- Genau eine Anfrage darf genau einen Rechnungsjob besitzen.
-- Ein fehlgeschlagener Job wird auf demselben Datensatz erneut
-- versucht. Es wird niemals ein zweiter Rechnungsjob angelegt.
-- ============================================================

create table if not exists public.school_lexware_invoice_jobs (
  id uuid primary key
    default gen_random_uuid(),

  request_id uuid not null,

  local_invoice_id uuid,

  idempotency_key text not null,
  cutover_version text not null,

  target_organization_id text not null,
  credential_alias_snapshot text not null,

  trigger_source text not null,

  payment_method text,
  payment_provider text,
  provider_payment_id text,
  provider_event_id text,

  status text not null
    default 'waiting_for_activation',

  attempt_count integer not null
    default 0,

  max_attempts integer not null
    default 8,

  next_attempt_at timestamptz not null
    default now(),

  last_attempt_at timestamptz,

  locked_at timestamptz,
  lock_expires_at timestamptz,
  locked_by text,

  completed_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,

  payload_snapshot jsonb not null,
  payload_sha256 text not null,

  lexware_invoice_id text,
  lexware_invoice_number text,
  lexware_resource_uri text,
  lexware_voucher_status text,
  lexware_created_date timestamptz,

  lexware_response_snapshot jsonb,

  last_error_code text,
  last_error_message text,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  constraint
    school_lexware_invoice_jobs_request_fk
    foreign key (request_id)
    references public.school_requests(id)
    on delete restrict,

  constraint
    school_lexware_invoice_jobs_request_unique
    unique (request_id),

  constraint
    school_lexware_invoice_jobs_idempotency_unique
    unique (idempotency_key),

  constraint
    school_lexware_invoice_jobs_idempotency_not_blank
    check (
      btrim(idempotency_key) <> ''
    ),

  constraint
    school_lexware_invoice_jobs_cutover_not_blank
    check (
      btrim(cutover_version) <> ''
    ),

  constraint
    school_lexware_invoice_jobs_org_not_blank
    check (
      btrim(target_organization_id) <> ''
    ),

  constraint
    school_lexware_invoice_jobs_org_uuid_format
    check (
      target_organization_id ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ),

  constraint
    school_lexware_invoice_jobs_credential_alias_not_blank
    check (
      btrim(
        credential_alias_snapshot
      ) <> ''
    ),

  constraint
    school_lexware_invoice_jobs_trigger_not_blank
    check (
      btrim(trigger_source) <> ''
    ),

  constraint
    school_lexware_invoice_jobs_status_check
    check (
      status in (
        'waiting_for_activation',
        'pending',
        'processing',
        'retry',
        'succeeded',
        'failed',
        'manual_review',
        'cancelled'
      )
    ),

  constraint
    school_lexware_invoice_jobs_attempt_count_nonnegative
    check (
      attempt_count >= 0
    ),

  constraint
    school_lexware_invoice_jobs_max_attempts_range
    check (
      max_attempts between 1 and 50
    ),

  constraint
    school_lexware_invoice_jobs_attempts_not_above_max
    check (
      attempt_count <= max_attempts
    ),

  constraint
    school_lexware_invoice_jobs_payload_object
    check (
      jsonb_typeof(
        payload_snapshot
      ) = 'object'
    ),

  constraint
    school_lexware_invoice_jobs_payload_hash_format
    check (
      payload_sha256 ~
        '^[a-f0-9]{64}$'
    ),

  constraint
    school_lexware_invoice_jobs_lock_complete
    check (
      (
        locked_at is null
        and lock_expires_at is null
        and locked_by is null
      )
      or
      (
        locked_at is not null
        and lock_expires_at is not null
        and locked_by is not null
        and btrim(locked_by) <> ''
        and lock_expires_at > locked_at
      )
    ),

  constraint
    school_lexware_invoice_jobs_success_complete
    check (
      status <> 'succeeded'
      or
      (
        nullif(
          btrim(lexware_invoice_id),
          ''
        ) is not null

        and nullif(
          btrim(lexware_invoice_number),
          ''
        ) is not null

        and completed_at is not null
      )
    ),

  constraint
    school_lexware_invoice_jobs_failed_complete
    check (
      status <> 'failed'
      or failed_at is not null
    ),

  constraint
    school_lexware_invoice_jobs_cancelled_complete
    check (
      status <> 'cancelled'
      or cancelled_at is not null
    )
);

comment on table
  public.school_lexware_invoice_jobs
is
  'Produktive Outbox für exakt eine Lexware-Rechnung je Anfrage. Keine Secrets speichern.';

comment on column
  public.school_lexware_invoice_jobs.credential_alias_snapshot
is
  'Nur Alias auf ein serverseitiges Secret-Profil. Kein API-Schlüssel.';

comment on column
  public.school_lexware_invoice_jobs.payload_snapshot
is
  'Unveränderlicher fachlicher Rechnungssnapshot ohne Zugangsdaten oder Secrets.';

create index if not exists
  school_lexware_invoice_jobs_due_idx
on public.school_lexware_invoice_jobs (
  status,
  next_attempt_at,
  created_at
);

create index if not exists
  school_lexware_invoice_jobs_lock_idx
on public.school_lexware_invoice_jobs (
  lock_expires_at
)
where locked_at is not null;

create unique index if not exists
  school_lexware_invoice_jobs_provider_payment_unique
on public.school_lexware_invoice_jobs (
  payment_provider,
  provider_payment_id
)
where
  payment_provider is not null
  and provider_payment_id is not null;

create unique index if not exists
  school_lexware_invoice_jobs_provider_event_unique
on public.school_lexware_invoice_jobs (
  payment_provider,
  provider_event_id
)
where
  payment_provider is not null
  and provider_event_id is not null;

create unique index if not exists
  school_lexware_invoice_jobs_lexware_id_unique
on public.school_lexware_invoice_jobs (
  target_organization_id,
  lexware_invoice_id
)
where lexware_invoice_id is not null;

create unique index if not exists
  school_lexware_invoice_jobs_lexware_number_unique
on public.school_lexware_invoice_jobs (
  target_organization_id,
  lexware_invoice_number
)
where lexware_invoice_number is not null;

-- ============================================================
-- 4. Lexware-Original-PDF-Mail-Outbox
--
-- Genau ein automatischer Rechnungsversand je Rechnungsjob.
-- Rechnungserstellung und Mailversand sind getrennte Jobs.
-- Ein Mailfehler darf niemals eine zweite Rechnung erzeugen.
-- ============================================================

create table if not exists
  public.school_lexware_invoice_mail_jobs (
    id uuid primary key
      default gen_random_uuid(),

    invoice_job_id uuid not null,
    request_id uuid not null,
    local_invoice_id uuid not null,

    idempotency_key text not null,

    sender_alias_snapshot text not null,

    from_name_snapshot text not null,
    from_email_snapshot text not null,
    reply_to_email_snapshot text,

    recipient_name_snapshot text,
    recipient_email_snapshot text not null,

    subject_snapshot text not null,
    text_body_snapshot text not null,
    html_body_snapshot text not null,

    attachment_filename_snapshot text not null,

    lexware_organization_id_snapshot text not null,
    lexware_invoice_id_snapshot text not null,
    lexware_invoice_number_snapshot text not null,

    status text not null
      default 'waiting_for_activation',

    attempt_count integer not null
      default 0,

    max_attempts integer not null
      default 8,

    next_attempt_at timestamptz not null
      default now(),

    last_attempt_at timestamptz,

    locked_at timestamptz,
    lock_expires_at timestamptz,
    locked_by text,

    pdf_fetched_at timestamptz,
    pdf_sha256 text,
    pdf_size_bytes bigint,
    pdf_content_type text,

    transport_message_id text,
    transport_response_snapshot jsonb,

    sent_at timestamptz,
    failed_at timestamptz,
    cancelled_at timestamptz,

    last_error_code text,
    last_error_message text,

    mail_payload_snapshot jsonb not null,
    mail_payload_sha256 text not null,

    created_at timestamptz not null
      default now(),

    updated_at timestamptz not null
      default now(),

    constraint
      school_lexware_invoice_mail_jobs_invoice_job_fk
      foreign key (invoice_job_id)
      references public.school_lexware_invoice_jobs(id)
      on delete restrict,

    constraint
      school_lexware_invoice_mail_jobs_request_fk
      foreign key (request_id)
      references public.school_requests(id)
      on delete restrict,

    constraint
      school_lexware_invoice_mail_jobs_local_invoice_fk
      foreign key (local_invoice_id)
      references public.school_request_invoices(id)
      on delete restrict,

    constraint
      school_lexware_invoice_mail_jobs_invoice_job_unique
      unique (invoice_job_id),

    constraint
      school_lexware_invoice_mail_jobs_idempotency_unique
      unique (idempotency_key),

    constraint
      school_lexware_invoice_mail_jobs_idempotency_not_blank
      check (
        btrim(idempotency_key) <> ''
      ),

    constraint
      school_lexware_invoice_mail_jobs_sender_alias_not_blank
      check (
        btrim(sender_alias_snapshot) <> ''
      ),

    constraint
      school_lexware_invoice_mail_jobs_from_name_not_blank
      check (
        btrim(from_name_snapshot) <> ''
      ),

    constraint
      school_lexware_invoice_mail_jobs_from_email_format
      check (
        from_email_snapshot ~*
          '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      ),

    constraint
      school_lexware_invoice_mail_jobs_reply_to_format
      check (
        reply_to_email_snapshot is null
        or reply_to_email_snapshot ~*
          '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      ),

    constraint
      school_lexware_invoice_mail_jobs_recipient_email_format
      check (
        recipient_email_snapshot ~*
          '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      ),

    constraint
      school_lexware_invoice_mail_jobs_subject_not_blank
      check (
        btrim(subject_snapshot) <> ''
      ),

    constraint
      school_lexware_invoice_mail_jobs_text_not_blank
      check (
        btrim(text_body_snapshot) <> ''
      ),

    constraint
      school_lexware_invoice_mail_jobs_html_not_blank
      check (
        btrim(html_body_snapshot) <> ''
      ),

    constraint
      school_lexware_invoice_mail_jobs_attachment_pdf
      check (
        btrim(
          attachment_filename_snapshot
        ) <> ''

        and lower(
          attachment_filename_snapshot
        ) like '%.pdf'
      ),

    constraint
      school_lexware_invoice_mail_jobs_org_not_blank
      check (
        btrim(
          lexware_organization_id_snapshot
        ) <> ''
      ),

    constraint
      school_lexware_invoice_mail_jobs_invoice_id_not_blank
      check (
        btrim(
          lexware_invoice_id_snapshot
        ) <> ''
      ),

    constraint
      school_lexware_invoice_mail_jobs_number_not_blank
      check (
        btrim(
          lexware_invoice_number_snapshot
        ) <> ''
      ),

    constraint
      school_lexware_invoice_mail_jobs_status_check
      check (
        status in (
          'waiting_for_activation',
          'pending',
          'processing',
          'retry',
          'sent',
          'failed',
          'cancelled'
        )
      ),

    constraint
      school_lexware_invoice_mail_jobs_attempt_count_nonnegative
      check (
        attempt_count >= 0
      ),

    constraint
      school_lexware_invoice_mail_jobs_max_attempts_range
      check (
        max_attempts between 1 and 50
      ),

    constraint
      school_lexware_invoice_mail_jobs_attempts_not_above_max
      check (
        attempt_count <= max_attempts
      ),

    constraint
      school_lexware_invoice_mail_jobs_lock_complete
      check (
        (
          locked_at is null
          and lock_expires_at is null
          and locked_by is null
        )
        or
        (
          locked_at is not null
          and lock_expires_at is not null
          and locked_by is not null
          and btrim(locked_by) <> ''
          and lock_expires_at > locked_at
        )
      ),

    constraint
      school_lexware_invoice_mail_jobs_payload_object
      check (
        jsonb_typeof(
          mail_payload_snapshot
        ) = 'object'
      ),

    constraint
      school_lexware_invoice_mail_jobs_payload_hash_format
      check (
        mail_payload_sha256 ~
          '^[a-f0-9]{64}$'
      ),

    constraint
      school_lexware_invoice_mail_jobs_pdf_hash_format
      check (
        pdf_sha256 is null
        or pdf_sha256 ~
          '^[a-f0-9]{64}$'
      ),

    constraint
      school_lexware_invoice_mail_jobs_pdf_size_nonnegative
      check (
        pdf_size_bytes is null
        or pdf_size_bytes >= 0
      ),

    constraint
      school_lexware_invoice_mail_jobs_sent_complete
      check (
        status <> 'sent'
        or
        (
          sent_at is not null

          and nullif(
            btrim(transport_message_id),
            ''
          ) is not null

          and pdf_fetched_at is not null

          and nullif(
            btrim(pdf_sha256),
            ''
          ) is not null

          and pdf_size_bytes is not null
          and pdf_size_bytes > 0
        )
      ),

    constraint
      school_lexware_invoice_mail_jobs_failed_complete
      check (
        status <> 'failed'
        or failed_at is not null
      ),

    constraint
      school_lexware_invoice_mail_jobs_cancelled_complete
      check (
        status <> 'cancelled'
        or cancelled_at is not null
      )
  );

comment on table
  public.school_lexware_invoice_mail_jobs
is
  'Idempotente Mail-Outbox für das unveränderte Original-PDF aus Lexware.';

comment on column
  public.school_lexware_invoice_mail_jobs.sender_alias_snapshot
is
  'Nur Alias auf serverseitige SMTP-Credentials. Kein Passwort.';

create index if not exists
  school_lexware_invoice_mail_jobs_due_idx
on public.school_lexware_invoice_mail_jobs (
  status,
  next_attempt_at,
  created_at
);

create index if not exists
  school_lexware_invoice_mail_jobs_lock_idx
on public.school_lexware_invoice_mail_jobs (
  lock_expires_at
)
where locked_at is not null;

create unique index if not exists
  school_lexware_invoice_mail_jobs_message_id_unique
on public.school_lexware_invoice_mail_jobs (
  transport_message_id
)
where transport_message_id is not null;

-- ============================================================
-- 5. Lokale Rechnungsbrücke erweitern
--
-- Die rechtliche Rechnungsnummer stammt bei Lexware-Rechnungen
-- ausschließlich aus Lexware.
--
-- invoice_status:
-- draft = Lexware-Rechnung vorhanden, Mail noch nicht versandt
-- sent  = Lexware-PDF automatisch versandt
-- ============================================================

alter table public.school_request_invoices
  add column if not exists
    lexware_invoice_job_id uuid,

  add column if not exists
    lexware_organization_id text,

  add column if not exists
    lexware_invoice_id text,

  add column if not exists
    lexware_invoice_number text,

  add column if not exists
    lexware_resource_uri text,

  add column if not exists
    lexware_voucher_status text,

  add column if not exists
    lexware_created_at timestamptz,

  add column if not exists
    lexware_finalized_at timestamptz,

  add column if not exists
    lexware_last_synced_at timestamptz,

  add column if not exists
    lexware_payload_snapshot jsonb,

  add column if not exists
    lexware_response_snapshot jsonb,

  add column if not exists
    lexware_pdf_fetched_at timestamptz,

  add column if not exists
    lexware_pdf_sha256 text,

  add column if not exists
    lexware_pdf_size_bytes bigint,

  add column if not exists
    lexware_pdf_content_type text,

  add column if not exists
    lexware_pdf_filename text,

  add column if not exists
    invoice_mail_status text
    not null
    default 'not_queued',

  add column if not exists
    invoice_mail_attempt_count integer
    not null
    default 0,

  add column if not exists
    invoice_mail_queued_at timestamptz,

  add column if not exists
    invoice_mail_last_attempt_at timestamptz,

  add column if not exists
    invoice_mail_sent_at timestamptz,

  add column if not exists
    invoice_mail_message_id text,

  add column if not exists
    invoice_mail_last_error text,

  add column if not exists
    invoice_mail_transport_response jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid =
      'public.school_request_invoices'::regclass
      and conname =
        'school_request_invoices_lexware_job_fk'
  ) then
    alter table public.school_request_invoices
      add constraint
        school_request_invoices_lexware_job_fk
      foreign key (
        lexware_invoice_job_id
      )
      references
        public.school_lexware_invoice_jobs(id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid =
      'public.school_request_invoices'::regclass
      and conname =
        'school_request_invoices_mail_status_check'
  ) then
    alter table public.school_request_invoices
      add constraint
        school_request_invoices_mail_status_check
      check (
        invoice_mail_status in (
          'not_queued',
          'waiting_for_activation',
          'pending',
          'processing',
          'retry',
          'sent',
          'failed',
          'cancelled'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid =
      'public.school_request_invoices'::regclass
      and conname =
        'school_request_invoices_mail_attempt_nonnegative'
  ) then
    alter table public.school_request_invoices
      add constraint
        school_request_invoices_mail_attempt_nonnegative
      check (
        invoice_mail_attempt_count >= 0
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid =
      'public.school_request_invoices'::regclass
      and conname =
        'school_request_invoices_lexware_pdf_size_nonnegative'
  ) then
    alter table public.school_request_invoices
      add constraint
        school_request_invoices_lexware_pdf_size_nonnegative
      check (
        lexware_pdf_size_bytes is null
        or lexware_pdf_size_bytes >= 0
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid =
      'public.school_request_invoices'::regclass
      and conname =
        'school_request_invoices_lexware_pdf_hash_format'
  ) then
    alter table public.school_request_invoices
      add constraint
        school_request_invoices_lexware_pdf_hash_format
      check (
        lexware_pdf_sha256 is null
        or lexware_pdf_sha256 ~
          '^[a-f0-9]{64}$'
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid =
      'public.school_request_invoices'::regclass
      and conname =
        'school_request_invoices_lexware_complete'
  ) then
    alter table public.school_request_invoices
      add constraint
        school_request_invoices_lexware_complete
      check (
        invoice_provider is distinct from
          'lexware'

        or
        (
          lexware_invoice_job_id
            is not null

          and nullif(
            btrim(
              lexware_organization_id
            ),
            ''
          ) is not null

          and nullif(
            btrim(
              lexware_invoice_id
            ),
            ''
          ) is not null

          and nullif(
            btrim(
              lexware_invoice_number
            ),
            ''
          ) is not null

          and invoice_number
            is not distinct from
              lexware_invoice_number

          and lexware_created_at
            is not null

          and lexware_finalized_at
            is not null
        )
      );
  end if;
end
$$;

create unique index if not exists
  school_request_invoices_lexware_job_unique
on public.school_request_invoices (
  lexware_invoice_job_id
)
where lexware_invoice_job_id is not null;

create unique index if not exists
  school_request_invoices_lexware_id_unique
on public.school_request_invoices (
  lexware_organization_id,
  lexware_invoice_id
)
where lexware_invoice_id is not null;

create unique index if not exists
  school_request_invoices_lexware_number_unique
on public.school_request_invoices (
  lexware_organization_id,
  lexware_invoice_number
)
where lexware_invoice_number is not null;

create index if not exists
  school_request_invoices_mail_status_idx
on public.school_request_invoices (
  invoice_mail_status,
  invoice_mail_queued_at
);

-- Rückverknüpfung Job → lokale Rechnung.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid =
      'public.school_lexware_invoice_jobs'::regclass
      and conname =
        'school_lexware_invoice_jobs_local_invoice_fk'
  ) then
    alter table
      public.school_lexware_invoice_jobs
    add constraint
      school_lexware_invoice_jobs_local_invoice_fk
    foreign key (
      local_invoice_id
    )
    references
      public.school_request_invoices(id)
    on delete restrict;
  end if;
end
$$;

create unique index if not exists
  school_lexware_invoice_jobs_local_invoice_unique
on public.school_lexware_invoice_jobs (
  local_invoice_id
)
where local_invoice_id is not null;

-- ============================================================
-- 6. Unveränderliches Outbox-Audit
-- ============================================================

create table if not exists
  public.school_lexware_outbox_events (
    id uuid primary key
      default gen_random_uuid(),

    request_id uuid not null,
    invoice_job_id uuid not null,
    mail_job_id uuid,

    event_type text not null,
    from_status text,
    to_status text,

    attempt_count integer,

    metadata jsonb not null
      default '{}'::jsonb,

    created_at timestamptz not null
      default now(),

    constraint
      school_lexware_outbox_events_request_fk
      foreign key (request_id)
      references public.school_requests(id)
      on delete restrict,

    constraint
      school_lexware_outbox_events_invoice_job_fk
      foreign key (invoice_job_id)
      references public.school_lexware_invoice_jobs(id)
      on delete restrict,

    constraint
      school_lexware_outbox_events_mail_job_fk
      foreign key (mail_job_id)
      references public.school_lexware_invoice_mail_jobs(id)
      on delete restrict,

    constraint
      school_lexware_outbox_events_type_not_blank
      check (
        btrim(event_type) <> ''
      ),

    constraint
      school_lexware_outbox_events_attempt_nonnegative
      check (
        attempt_count is null
        or attempt_count >= 0
      ),

    constraint
      school_lexware_outbox_events_metadata_object
      check (
        jsonb_typeof(metadata) =
          'object'
      )
  );

create index if not exists
  school_lexware_outbox_events_invoice_job_idx
on public.school_lexware_outbox_events (
  invoice_job_id,
  created_at
);

create index if not exists
  school_lexware_outbox_events_mail_job_idx
on public.school_lexware_outbox_events (
  mail_job_id,
  created_at
)
where mail_job_id is not null;

create index if not exists
  school_lexware_outbox_events_request_idx
on public.school_lexware_outbox_events (
  request_id,
  created_at
);

-- ============================================================
-- 7. updated_at- und Audit-Trigger
-- ============================================================

create or replace function
  public.set_school_lexware_outbox_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at :=
    clock_timestamp();

  return new;
end;
$$;

drop trigger if exists
  trg_school_lexware_invoice_jobs_updated_at
on public.school_lexware_invoice_jobs;

create trigger
  trg_school_lexware_invoice_jobs_updated_at
before update
on public.school_lexware_invoice_jobs
for each row
execute function
  public.set_school_lexware_outbox_updated_at();

drop trigger if exists
  trg_school_lexware_invoice_mail_jobs_updated_at
on public.school_lexware_invoice_mail_jobs;

create trigger
  trg_school_lexware_invoice_mail_jobs_updated_at
before update
on public.school_lexware_invoice_mail_jobs
for each row
execute function
  public.set_school_lexware_outbox_updated_at();

create or replace function
  public.audit_school_lexware_invoice_job_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into
      public.school_lexware_outbox_events (
        request_id,
        invoice_job_id,
        mail_job_id,
        event_type,
        from_status,
        to_status,
        attempt_count,
        metadata,
        created_at
      )
    values (
      new.request_id,
      new.id,
      null,
      'invoice_job_enqueued',
      null,
      new.status,
      new.attempt_count,
      jsonb_build_object(
        'idempotency_key',
          new.idempotency_key,

        'trigger_source',
          new.trigger_source,

        'target_organization_id',
          new.target_organization_id,

        'payment_method',
          new.payment_method,

        'payment_provider',
          new.payment_provider
      ),
      clock_timestamp()
    );

    return new;
  end if;

  if old.status is distinct from
      new.status then
    insert into
      public.school_lexware_outbox_events (
        request_id,
        invoice_job_id,
        mail_job_id,
        event_type,
        from_status,
        to_status,
        attempt_count,
        metadata,
        created_at
      )
    values (
      new.request_id,
      new.id,
      null,
      'invoice_job_status_changed',
      old.status,
      new.status,
      new.attempt_count,
      jsonb_strip_nulls(
        jsonb_build_object(
          'lexware_invoice_id',
            new.lexware_invoice_id,

          'lexware_invoice_number',
            new.lexware_invoice_number,

          'last_error_code',
            new.last_error_code
        )
      ),
      clock_timestamp()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists
  trg_audit_school_lexware_invoice_job_status
on public.school_lexware_invoice_jobs;

create trigger
  trg_audit_school_lexware_invoice_job_status
after insert or update of status
on public.school_lexware_invoice_jobs
for each row
execute function
  public.audit_school_lexware_invoice_job_status();

create or replace function
  public.audit_school_lexware_mail_job_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into
      public.school_lexware_outbox_events (
        request_id,
        invoice_job_id,
        mail_job_id,
        event_type,
        from_status,
        to_status,
        attempt_count,
        metadata,
        created_at
      )
    values (
      new.request_id,
      new.invoice_job_id,
      new.id,
      'invoice_mail_job_enqueued',
      null,
      new.status,
      new.attempt_count,
      jsonb_build_object(
        'idempotency_key',
          new.idempotency_key,

        'recipient_email',
          new.recipient_email_snapshot,

        'lexware_invoice_id',
          new.lexware_invoice_id_snapshot,

        'lexware_invoice_number',
          new.lexware_invoice_number_snapshot,

        'sender_alias',
          new.sender_alias_snapshot
      ),
      clock_timestamp()
    );

    return new;
  end if;

  if old.status is distinct from
      new.status then
    insert into
      public.school_lexware_outbox_events (
        request_id,
        invoice_job_id,
        mail_job_id,
        event_type,
        from_status,
        to_status,
        attempt_count,
        metadata,
        created_at
      )
    values (
      new.request_id,
      new.invoice_job_id,
      new.id,
      'invoice_mail_job_status_changed',
      old.status,
      new.status,
      new.attempt_count,
      jsonb_strip_nulls(
        jsonb_build_object(
          'transport_message_id',
            new.transport_message_id,

          'pdf_sha256',
            new.pdf_sha256,

          'last_error_code',
            new.last_error_code
        )
      ),
      clock_timestamp()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists
  trg_audit_school_lexware_mail_job_status
on public.school_lexware_invoice_mail_jobs;

create trigger
  trg_audit_school_lexware_mail_job_status
after insert or update of status
on public.school_lexware_invoice_mail_jobs
for each row
execute function
  public.audit_school_lexware_mail_job_status();

-- ============================================================
-- 8. Serverseitige Sicherheit / RLS
-- ============================================================

alter table
  public.school_lexware_invoice_jobs
enable row level security;

alter table
  public.school_lexware_invoice_mail_jobs
enable row level security;

alter table
  public.school_lexware_outbox_events
enable row level security;

revoke all
on table
  public.school_lexware_invoice_jobs,
  public.school_lexware_invoice_mail_jobs,
  public.school_lexware_outbox_events
from
  public,
  anon,
  authenticated;

grant all
on table
  public.school_lexware_invoice_jobs,
  public.school_lexware_invoice_mail_jobs,
  public.school_lexware_outbox_events
to service_role;

-- ============================================================
-- 9. Idempotente Rechnung in die Outbox einreihen
--
-- Wichtig:
-- Der Rechnungsprovider muss bereits beim verbindlichen Checkout
-- zugeordnet worden sein.
--
-- Diese Funktion vergibt NICHT stillschweigend nachträglich den
-- Provider. Dadurch wird ein alter Auftrag nicht anhand eines
-- späteren Zahlungsdatums versehentlich Lexware zugeordnet.
--
-- Auch bei deaktiviertem Produktionsschalter wird der Job
-- sicher als waiting_for_activation gespeichert.
-- ============================================================

create or replace function
  public.enqueue_school_lexware_invoice_job(
    p_request_id uuid,
    p_trigger_source text,
    p_payment_method text,
    p_payment_provider text,
    p_provider_payment_id text,
    p_provider_event_id text,
    p_payload_snapshot jsonb
  )
returns public.school_lexware_invoice_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  settings_row
    public.business_runtime_settings%rowtype;

  request_row
    public.school_requests%rowtype;

  job_row
    public.school_lexware_invoice_jobs%rowtype;

  desired_status text;
  generated_idempotency_key text;
  generated_payload_hash text;
begin
  if p_request_id is null then
    raise exception
      'Keine Anfrage-ID übergeben.';
  end if;

  if btrim(
    coalesce(
      p_trigger_source,
      ''
    )
  ) = '' then
    raise exception
      'trigger_source fehlt.';
  end if;

  if p_payload_snapshot is null
     or jsonb_typeof(
       p_payload_snapshot
     ) <> 'object' then
    raise exception
      'payload_snapshot muss ein JSON-Objekt sein.';
  end if;

  select *
  into settings_row
  from public.business_runtime_settings
  where id = 'default';

  if not found then
    raise exception
      'business_runtime_settings/default fehlt.';
  end if;

  select *
  into request_row
  from public.school_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception
      'Anfrage % wurde nicht gefunden.',
      p_request_id;
  end if;

  if request_row.invoice_provider
      is null then
    raise exception
      'Die Rechnungsprovider-Zuordnung fehlt. Der verbindliche Checkout muss zuerst assign_school_request_invoice_provider aufrufen.';
  end if;

  if request_row.invoice_provider
      <> 'lexware' then
    raise exception
      'Anfrage % ist dem Provider % und nicht Lexware zugeordnet.',
      p_request_id,
      request_row.invoice_provider;
  end if;

  if request_row.checkout_committed_at
      is null then
    raise exception
      'checkout_committed_at fehlt für die Lexware-Anfrage %. Verwaltungsjob wird nicht angelegt.',
      p_request_id;
  end if;

  if request_row.checkout_committed_at
      < settings_row.invoice_cutover_at then
    raise exception
      'Anfrage % wurde vor dem Lexware-Cutover verbindlich abgeschlossen.',
      p_request_id;
  end if;

  if clock_timestamp()
      < settings_row.invoice_cutover_at then
    raise exception
      'Lexware-Produktion ist bis zum Cutover-Zeitpunkt gesperrt.';
  end if;

  if request_row.invoice_cutover_version
      is null then
    raise exception
      'invoice_cutover_version fehlt für Anfrage %.',
      p_request_id;
  end if;

  generated_idempotency_key :=
    'lexware-invoice-v1:' ||
    request_row.id::text ||
    ':' ||
    request_row.invoice_cutover_version;

  generated_payload_hash :=
    encode(
      digest(
        p_payload_snapshot::text,
        'sha256'
      ),
      'hex'
    );

  select *
  into job_row
  from public.school_lexware_invoice_jobs
  where request_id =
    request_row.id
  for update;

  if found then
    if job_row.idempotency_key
        <> generated_idempotency_key then
      raise exception
        'Bestehender Lexware-Job besitzt einen abweichenden Idempotenzschlüssel.';
    end if;

    if job_row.payload_sha256
        <> generated_payload_hash then
      raise exception
        'Für diese Anfrage existiert bereits ein Lexware-Job mit einem anderen Rechnungssnapshot. Der bestehende Job wurde nicht überschrieben.';
    end if;

    return job_row;
  end if;

  if exists (
    select 1
    from public.school_request_invoices invoice
    where invoice.request_id =
      request_row.id

      and invoice.invoice_status in (
        'draft',
        'sent'
      )
  ) then
    raise exception
      'Für Anfrage % existiert bereits eine aktive lokale Rechnung.',
      request_row.id;
  end if;

  desired_status :=
    case
      when
        settings_row
          .lexware_production_write_enabled
        and clock_timestamp() >=
          settings_row.invoice_cutover_at
        then 'pending'
      else 'waiting_for_activation'
    end;

  insert into
    public.school_lexware_invoice_jobs (
      request_id,
      idempotency_key,
      cutover_version,
      target_organization_id,
      credential_alias_snapshot,
      trigger_source,
      payment_method,
      payment_provider,
      provider_payment_id,
      provider_event_id,
      status,
      attempt_count,
      max_attempts,
      next_attempt_at,
      payload_snapshot,
      payload_sha256,
      created_at,
      updated_at
    )
  values (
    request_row.id,
    generated_idempotency_key,
    request_row.invoice_cutover_version,
    settings_row
      .lexware_production_organization_id,
    settings_row
      .lexware_production_credential_alias,
    btrim(p_trigger_source),
    nullif(
      btrim(
        coalesce(
          p_payment_method,
          ''
        )
      ),
      ''
    ),
    nullif(
      btrim(
        coalesce(
          p_payment_provider,
          ''
        )
      ),
      ''
    ),
    nullif(
      btrim(
        coalesce(
          p_provider_payment_id,
          ''
        )
      ),
      ''
    ),
    nullif(
      btrim(
        coalesce(
          p_provider_event_id,
          ''
        )
      ),
      ''
    ),
    desired_status,
    0,
    settings_row
      .lexware_invoice_job_max_attempts,
    clock_timestamp(),
    p_payload_snapshot,
    generated_payload_hash,
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict (
    request_id
  )
  do nothing
  returning *
  into job_row;

  if not found then
    select *
    into job_row
    from public.school_lexware_invoice_jobs
    where request_id =
      request_row.id
    for update;

    if not found then
      raise exception
        'Lexware-Job konnte weder angelegt noch erneut geladen werden.';
    end if;

    if job_row.idempotency_key
        <> generated_idempotency_key
       or job_row.payload_sha256
        <> generated_payload_hash then
      raise exception
        'Ein paralleler Lexware-Job besitzt abweichende Identitätsdaten.';
    end if;
  end if;

  return job_row;
end;
$$;

revoke all
on function
  public.enqueue_school_lexware_invoice_job(
    uuid,
    text,
    text,
    text,
    text,
    text,
    jsonb
  )
from
  public,
  anon,
  authenticated;

grant execute
on function
  public.enqueue_school_lexware_invoice_job(
    uuid,
    text,
    text,
    text,
    text,
    text,
    jsonb
  )
to service_role;

comment on function
  public.enqueue_school_lexware_invoice_job(
    uuid,
    text,
    text,
    text,
    text,
    text,
    jsonb
  )
is
  'Legt je Anfrage höchstens einen Lexware-Rechnungsjob an. Kein externer API-Aufruf. Kein Legacy-Fallback.';

-- ============================================================
-- 10. Idempotente automatische Rechnungs-Mail einreihen
--
-- Voraussetzung:
-- - Lexware-Rechnungsjob ist succeeded
-- - lokale Rechnungsbrücke existiert
-- - lokale Rechnung und Job besitzen dieselbe Lexware-ID
--
-- Bei deaktiviertem Mail-Schalter bleibt der Job sicher auf
-- waiting_for_activation.
-- ============================================================

create or replace function
  public.enqueue_school_lexware_invoice_mail_job(
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
  settings_row
    public.business_runtime_settings%rowtype;

  invoice_job_row
    public.school_lexware_invoice_jobs%rowtype;

  invoice_row
    public.school_request_invoices%rowtype;

  mail_job_row
    public.school_lexware_invoice_mail_jobs%rowtype;

  desired_status text;
  generated_idempotency_key text;
  generated_payload_hash text;
begin
  if p_invoice_job_id is null then
    raise exception
      'Keine Lexware-Rechnungsjob-ID übergeben.';
  end if;

  if p_mail_payload_snapshot is null
     or jsonb_typeof(
       p_mail_payload_snapshot
     ) <> 'object' then
    raise exception
      'mail_payload_snapshot muss ein JSON-Objekt sein.';
  end if;

  if coalesce(
    p_recipient_email,
    ''
  ) !~*
    '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception
      'Empfänger-E-Mail ist ungültig.';
  end if;

  if coalesce(
    p_from_email,
    ''
  ) !~*
    '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception
      'Absender-E-Mail ist ungültig.';
  end if;

  if p_reply_to_email is not null
     and btrim(p_reply_to_email) <> ''
     and p_reply_to_email !~*
       '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception
      'Reply-To-E-Mail ist ungültig.';
  end if;

  if btrim(
    coalesce(
      p_from_name,
      ''
    )
  ) = '' then
    raise exception
      'Absendername fehlt.';
  end if;

  if btrim(
    coalesce(
      p_subject,
      ''
    )
  ) = '' then
    raise exception
      'E-Mail-Betreff fehlt.';
  end if;

  if btrim(
    coalesce(
      p_text_body,
      ''
    )
  ) = '' then
    raise exception
      'Text-E-Mail fehlt.';
  end if;

  if btrim(
    coalesce(
      p_html_body,
      ''
    )
  ) = '' then
    raise exception
      'HTML-E-Mail fehlt.';
  end if;

  if btrim(
    coalesce(
      p_attachment_filename,
      ''
    )
  ) = ''
  or lower(
    p_attachment_filename
  ) not like '%.pdf' then
    raise exception
      'Der PDF-Dateiname ist ungültig.';
  end if;

  select *
  into settings_row
  from public.business_runtime_settings
  where id = 'default';

  if not found then
    raise exception
      'business_runtime_settings/default fehlt.';
  end if;

  select *
  into invoice_job_row
  from public.school_lexware_invoice_jobs
  where id = p_invoice_job_id
  for update;

  if not found then
    raise exception
      'Lexware-Rechnungsjob % wurde nicht gefunden.',
      p_invoice_job_id;
  end if;

  if invoice_job_row.status
      <> 'succeeded' then
    raise exception
      'Lexware-Rechnungsjob % besitzt Status % statt succeeded.',
      p_invoice_job_id,
      invoice_job_row.status;
  end if;

  if invoice_job_row.local_invoice_id
      is null then
    raise exception
      'Der Lexware-Rechnungsjob ist noch nicht mit einer lokalen Rechnungsbrücke verknüpft.';
  end if;

  if invoice_job_row.lexware_invoice_id
      is null
     or invoice_job_row.lexware_invoice_number
      is null then
    raise exception
      'Lexware-Rechnungs-ID oder Rechnungsnummer fehlt.';
  end if;

  select *
  into invoice_row
  from public.school_request_invoices
  where id =
    invoice_job_row.local_invoice_id
  for update;

  if not found then
    raise exception
      'Lokale Rechnungsbrücke % fehlt.',
      invoice_job_row.local_invoice_id;
  end if;

  if invoice_row.request_id
      <> invoice_job_row.request_id then
    raise exception
      'Rechnungsjob und lokale Rechnung gehören zu unterschiedlichen Anfragen.';
  end if;

  if invoice_row.invoice_provider
      <> 'lexware' then
    raise exception
      'Lokale Rechnung verwendet nicht den Provider Lexware.';
  end if;

  if invoice_row.lexware_invoice_job_id
      <> invoice_job_row.id then
    raise exception
      'Lokale Rechnung verweist nicht auf den erwarteten Lexware-Job.';
  end if;

  if invoice_row.lexware_invoice_id
      <> invoice_job_row.lexware_invoice_id
     or invoice_row.lexware_invoice_number
      <> invoice_job_row.lexware_invoice_number then
    raise exception
      'Lexware-Identität von Job und lokaler Rechnung stimmt nicht überein.';
  end if;

  generated_idempotency_key :=
    'lexware-invoice-mail-v1:' ||
    invoice_job_row.id::text;

  generated_payload_hash :=
    encode(
      digest(
        p_mail_payload_snapshot::text,
        'sha256'
      ),
      'hex'
    );

  select *
  into mail_job_row
  from public.school_lexware_invoice_mail_jobs
  where invoice_job_id =
    invoice_job_row.id
  for update;

  if found then
    if mail_job_row.idempotency_key
        <> generated_idempotency_key then
      raise exception
        'Bestehender Rechnungs-Mailjob besitzt einen abweichenden Idempotenzschlüssel.';
    end if;

    if lower(
      mail_job_row.recipient_email_snapshot
    ) <> lower(
      btrim(p_recipient_email)
    ) then
      raise exception
        'Für diese Rechnung existiert bereits ein Mailjob für eine andere Empfängeradresse.';
    end if;

    if mail_job_row.mail_payload_sha256
        <> generated_payload_hash then
      raise exception
        'Für diese Rechnung existiert bereits ein Mailjob mit einem anderen Mail-Snapshot.';
    end if;

    return mail_job_row;
  end if;

  if invoice_row.invoice_mail_status
      = 'sent'
     or invoice_row.invoice_mail_sent_at
      is not null then
    raise exception
      'Die Lexware-Rechnung wurde laut lokaler Rechnungsbrücke bereits versandt.';
  end if;

  desired_status :=
    case
      when
        settings_row
          .lexware_automatic_mail_enabled
        and clock_timestamp() >=
          settings_row.invoice_cutover_at
        then 'pending'
      else 'waiting_for_activation'
    end;

  insert into
    public.school_lexware_invoice_mail_jobs (
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
    settings_row
      .lexware_invoice_mail_sender_alias,
    btrim(p_from_name),
    lower(
      btrim(p_from_email)
    ),
    nullif(
      lower(
        btrim(
          coalesce(
            p_reply_to_email,
            ''
          )
        )
      ),
      ''
    ),
    nullif(
      btrim(
        coalesce(
          p_recipient_name,
          ''
        )
      ),
      ''
    ),
    lower(
      btrim(p_recipient_email)
    ),
    btrim(p_subject),
    p_text_body,
    p_html_body,
    btrim(p_attachment_filename),
    invoice_job_row
      .target_organization_id,
    invoice_job_row
      .lexware_invoice_id,
    invoice_job_row
      .lexware_invoice_number,
    desired_status,
    0,
    settings_row
      .lexware_mail_job_max_attempts,
    clock_timestamp(),
    p_mail_payload_snapshot,
    generated_payload_hash,
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict (
    invoice_job_id
  )
  do nothing
  returning *
  into mail_job_row;

  if not found then
    select *
    into mail_job_row
    from public.school_lexware_invoice_mail_jobs
    where invoice_job_id =
      invoice_job_row.id
    for update;

    if not found then
      raise exception
        'Rechnungs-Mailjob konnte weder angelegt noch erneut geladen werden.';
    end if;

    if mail_job_row.idempotency_key
        <> generated_idempotency_key
       or mail_job_row.mail_payload_sha256
        <> generated_payload_hash
       or lower(
         mail_job_row.recipient_email_snapshot
       ) <> lower(
         btrim(p_recipient_email)
       ) then
      raise exception
        'Ein paralleler Rechnungs-Mailjob besitzt abweichende Identitätsdaten.';
    end if;
  end if;

  update public.school_request_invoices
  set
    invoice_mail_status =
      mail_job_row.status,

    invoice_mail_queued_at =
      coalesce(
        invoice_mail_queued_at,
        mail_job_row.created_at
      ),

    invoice_mail_last_error =
      null

  where id = invoice_row.id;

  return mail_job_row;
end;
$$;

revoke all
on function
  public.enqueue_school_lexware_invoice_mail_job(
    uuid,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    jsonb
  )
from
  public,
  anon,
  authenticated;

grant execute
on function
  public.enqueue_school_lexware_invoice_mail_job(
    uuid,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    jsonb
  )
to service_role;

comment on function
  public.enqueue_school_lexware_invoice_mail_job(
    uuid,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    jsonb
  )
is
  'Legt je Lexware-Rechnung höchstens einen automatischen Mailjob an. Kein SMTP-Versand in dieser Funktion.';

-- ============================================================
-- 11. Selbstprüfung
-- ============================================================

do $$
declare
  settings_row
    public.business_runtime_settings%rowtype;

  invoice_job_count integer;
  mail_job_count integer;
  outbox_event_count integer;

  invalid_legacy_link_count integer;
  invalid_legacy_mail_status_count integer;
begin
  select *
  into settings_row
  from public.business_runtime_settings
  where id = 'default';

  if not found then
    raise exception
      'Selbstprüfung: business_runtime_settings/default fehlt.';
  end if;

  if settings_row
      .lexware_outbox_schema_version
      <> 'lexware-outbox-mail-v1' then
    raise exception
      'Selbstprüfung: falsche Outbox-Schemaversion.';
  end if;

  if settings_row
      .lexware_production_write_enabled then
    raise exception
      'Selbstprüfung: Lexware-Produktivschreiben darf noch nicht aktiviert sein.';
  end if;

  if settings_row
      .lexware_automatic_mail_enabled then
    raise exception
      'Selbstprüfung: Automatischer Lexware-Mailversand darf noch nicht aktiviert sein.';
  end if;

  select count(*)::integer
  into invoice_job_count
  from public.school_lexware_invoice_jobs;

  if invoice_job_count <> 0 then
    raise exception
      'Selbstprüfung: Unerwartet existieren bereits % Lexware-Rechnungsjobs.',
      invoice_job_count;
  end if;

  select count(*)::integer
  into mail_job_count
  from public.school_lexware_invoice_mail_jobs;

  if mail_job_count <> 0 then
    raise exception
      'Selbstprüfung: Unerwartet existieren bereits % Lexware-Mailjobs.',
      mail_job_count;
  end if;

  select count(*)::integer
  into outbox_event_count
  from public.school_lexware_outbox_events;

  if outbox_event_count <> 0 then
    raise exception
      'Selbstprüfung: Unerwartet existieren bereits % Lexware-Outbox-Ereignisse.',
      outbox_event_count;
  end if;

  select count(*)::integer
  into invalid_legacy_link_count
  from public.school_request_invoices
  where invoice_provider =
    'legacy_internal'

    and (
      lexware_invoice_job_id
        is not null

      or lexware_invoice_id
        is not null

      or lexware_invoice_number
        is not null
    );

  if invalid_legacy_link_count <> 0 then
    raise exception
      'Selbstprüfung: % Legacy-Rechnung(en) besitzen unerwartete Lexware-Verknüpfungen.',
      invalid_legacy_link_count;
  end if;

  select count(*)::integer
  into invalid_legacy_mail_status_count
  from public.school_request_invoices
  where invoice_provider =
    'legacy_internal'

    and invoice_mail_status
      <> 'not_queued';

  if invalid_legacy_mail_status_count <> 0 then
    raise exception
      'Selbstprüfung: % Legacy-Rechnung(en) besitzen einen unerwarteten neuen Mailstatus.',
      invalid_legacy_mail_status_count;
  end if;

  if to_regclass(
    'public.school_lexware_invoice_jobs'
  ) is null then
    raise exception
      'Selbstprüfung: Rechnungsjobtabelle fehlt.';
  end if;

  if to_regclass(
    'public.school_lexware_invoice_mail_jobs'
  ) is null then
    raise exception
      'Selbstprüfung: Mailjobtabelle fehlt.';
  end if;

  if to_regclass(
    'public.school_lexware_outbox_events'
  ) is null then
    raise exception
      'Selbstprüfung: Outbox-Ereignistabelle fehlt.';
  end if;

  if to_regprocedure(
    'public.enqueue_school_lexware_invoice_job(uuid,text,text,text,text,text,jsonb)'
  ) is null then
    raise exception
      'Selbstprüfung: Rechnungs-Enqueue-Funktion fehlt.';
  end if;

  if to_regprocedure(
    'public.enqueue_school_lexware_invoice_mail_job(uuid,text,text,text,text,text,text,text,text,text,jsonb)'
  ) is null then
    raise exception
      'Selbstprüfung: Mail-Enqueue-Funktion fehlt.';
  end if;
end
$$;

commit;

-- ============================================================
-- 12. Kompaktes Endergebnis
-- ============================================================

with checks as (
  select
    to_regclass(
      'public.school_lexware_invoice_jobs'
    ) is not null
      as invoice_job_table_exists,

    to_regclass(
      'public.school_lexware_invoice_mail_jobs'
    ) is not null
      as mail_job_table_exists,

    to_regclass(
      'public.school_lexware_outbox_events'
    ) is not null
      as outbox_event_table_exists,

    to_regprocedure(
      'public.enqueue_school_lexware_invoice_job(uuid,text,text,text,text,text,jsonb)'
    ) is not null
      as invoice_enqueue_function_exists,

    to_regprocedure(
      'public.enqueue_school_lexware_invoice_mail_job(uuid,text,text,text,text,text,text,text,text,text,jsonb)'
    ) is not null
      as mail_enqueue_function_exists,

    (
      select cls.relrowsecurity
      from pg_class cls
      where cls.oid =
        'public.school_lexware_invoice_jobs'::regclass
    ) = true
      as invoice_job_rls_enabled,

    (
      select cls.relrowsecurity
      from pg_class cls
      where cls.oid =
        'public.school_lexware_invoice_mail_jobs'::regclass
    ) = true
      as mail_job_rls_enabled,

    (
      select cls.relrowsecurity
      from pg_class cls
      where cls.oid =
        'public.school_lexware_outbox_events'::regclass
    ) = true
      as outbox_event_rls_enabled,

    to_regclass(
      'public.school_lexware_invoice_jobs_provider_payment_unique'
    ) is not null
      as provider_payment_unique_exists,

    to_regclass(
      'public.school_lexware_invoice_jobs_lexware_id_unique'
    ) is not null
      as lexware_invoice_id_unique_exists,

    to_regclass(
      'public.school_request_invoices_lexware_job_unique'
    ) is not null
      as local_invoice_job_unique_exists,

    to_regclass(
      'public.school_lexware_invoice_mail_jobs_message_id_unique'
    ) is not null
      as mail_message_id_unique_exists,

    (
      select count(*) = 24

      from information_schema.columns

      where table_schema = 'public'
        and table_name =
          'school_request_invoices'

        and column_name in (
          'lexware_invoice_job_id',
          'lexware_organization_id',
          'lexware_invoice_id',
          'lexware_invoice_number',
          'lexware_resource_uri',
          'lexware_voucher_status',
          'lexware_created_at',
          'lexware_finalized_at',
          'lexware_last_synced_at',
          'lexware_payload_snapshot',
          'lexware_response_snapshot',
          'lexware_pdf_fetched_at',
          'lexware_pdf_sha256',
          'lexware_pdf_size_bytes',
          'lexware_pdf_content_type',
          'lexware_pdf_filename',
          'invoice_mail_status',
          'invoice_mail_attempt_count',
          'invoice_mail_queued_at',
          'invoice_mail_last_attempt_at',
          'invoice_mail_sent_at',
          'invoice_mail_message_id',
          'invoice_mail_last_error',
          'invoice_mail_transport_response'
        )
    ) as all_invoice_bridge_columns_exist,

    not exists (
      select 1
      from public.school_lexware_invoice_jobs
    ) as no_invoice_jobs_created,

    not exists (
      select 1
      from public.school_lexware_invoice_mail_jobs
    ) as no_mail_jobs_created,

    not exists (
      select 1
      from public.school_lexware_outbox_events
    ) as no_outbox_events_created,

    not exists (
      select 1
      from public.school_request_invoices
      where invoice_provider =
        'legacy_internal'

        and (
          lexware_invoice_job_id
            is not null

          or lexware_invoice_id
            is not null

          or lexware_invoice_number
            is not null
        )
    ) as legacy_invoices_have_no_lexware_links,

    not exists (
      select 1
      from public.school_request_invoices
      where invoice_provider =
        'legacy_internal'

        and invoice_mail_status
          <> 'not_queued'
    ) as legacy_mail_status_unchanged,

    exists (
      select 1
      from public.business_runtime_settings
      where id = 'default'

        and lexware_outbox_schema_version =
          'lexware-outbox-mail-v1'

        and lexware_production_write_enabled =
          false

        and lexware_automatic_mail_enabled =
          false

        and btrim(
          lexware_production_credential_alias
        ) <> ''

        and btrim(
          lexware_invoice_mail_sender_alias
        ) <> ''
    ) as settings_safe_and_disabled
)

select jsonb_pretty(
  jsonb_build_object(
    'foundation_version',
      'LEXWARE_OUTBOX_MAIL_IDEMPOTENCY_V1',

    'checked_at',
      now(),

    'cutover_at',
      (
        select invoice_cutover_at
        from public.business_runtime_settings
        where id = 'default'
      ),

    'settings',
      (
        select jsonb_build_object(
          'outbox_schema_version',
            lexware_outbox_schema_version,

          'production_organization_id',
            lexware_production_organization_id,

          'production_credential_alias',
            lexware_production_credential_alias,

          'mail_sender_alias',
            lexware_invoice_mail_sender_alias,

          'invoice_job_max_attempts',
            lexware_invoice_job_max_attempts,

          'mail_job_max_attempts',
            lexware_mail_job_max_attempts,

          'production_write_enabled',
            lexware_production_write_enabled,

          'automatic_mail_enabled',
            lexware_automatic_mail_enabled
        )

        from public.business_runtime_settings
        where id = 'default'
      ),

    'counts',
      jsonb_build_object(
        'invoice_jobs',
          (
            select count(*)::integer
            from public.school_lexware_invoice_jobs
          ),

        'mail_jobs',
          (
            select count(*)::integer
            from public.school_lexware_invoice_mail_jobs
          ),

        'outbox_events',
          (
            select count(*)::integer
            from public.school_lexware_outbox_events
          ),

        'legacy_invoices',
          (
            select count(*)::integer
            from public.school_request_invoices
            where invoice_provider =
              'legacy_internal'
          ),

        'lexware_invoices',
          (
            select count(*)::integer
            from public.school_request_invoices
            where invoice_provider =
              'lexware'
          )
      ),

    'checks',
      (
        select to_jsonb(checks)
        from checks
      ),

    'all_checks_passed',
      (
        select
          invoice_job_table_exists
          and mail_job_table_exists
          and outbox_event_table_exists
          and invoice_enqueue_function_exists
          and mail_enqueue_function_exists
          and invoice_job_rls_enabled
          and mail_job_rls_enabled
          and outbox_event_rls_enabled
          and provider_payment_unique_exists
          and lexware_invoice_id_unique_exists
          and local_invoice_job_unique_exists
          and mail_message_id_unique_exists
          and all_invoice_bridge_columns_exist
          and no_invoice_jobs_created
          and no_mail_jobs_created
          and no_outbox_events_created
          and legacy_invoices_have_no_lexware_links
          and legacy_mail_status_unchanged
          and settings_safe_and_disabled

        from checks
      )
  )
) as lexware_outbox_mail_foundation_result;
