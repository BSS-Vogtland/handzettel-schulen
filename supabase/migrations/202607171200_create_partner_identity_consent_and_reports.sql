create extension if not exists pgcrypto;

-- ============================================================
-- 1. Einwilligung zur Identitätsweitergabe an einen konkreten
--    Empfehlungspartner
--
-- Personenbezogene Daten werden getrennt von den Klickdaten
-- gespeichert und dürfen nur bei nachgewiesener Einwilligung
-- an den Partner ausgegeben oder per Monatsbericht versendet
-- werden.
-- ============================================================

create table if not exists public.recommendation_identity_consents (
  id uuid primary key default gen_random_uuid(),

  project_key text not null default 'handzettel-schulen',

  partner_id uuid not null,
  request_id uuid not null,
  request_item_id uuid,
  click_id uuid,

  status text not null default 'granted',

  customer_name_snapshot text not null,
  customer_email_snapshot text not null,

  partner_name_snapshot text not null,
  partner_code_snapshot text not null,

  consent_text_version text not null,
  consent_text_snapshot text not null,

  granted_at timestamptz not null default now(),
  revoked_at timestamptz,

  first_disclosed_at timestamptz,
  last_disclosed_at timestamptz,
  disclosure_count integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint recommendation_identity_consents_partner_fk
    foreign key (partner_id)
    references public.recommendation_partners (id)
    on delete cascade,

  constraint recommendation_identity_consents_request_fk
    foreign key (request_id)
    references public.school_requests (id)
    on delete cascade,

  constraint recommendation_identity_consents_request_item_fk
    foreign key (request_item_id)
    references public.school_request_items (id)
    on delete set null,

  constraint recommendation_identity_consents_click_fk
    foreign key (click_id)
    references public.recommendation_clicks (id)
    on delete cascade,

  constraint recommendation_identity_consents_click_unique
    unique (click_id),

  constraint recommendation_identity_consents_status_allowed
    check (
      status in (
        'granted',
        'revoked'
      )
    ),

  constraint recommendation_identity_consents_project_key_not_blank
    check (btrim(project_key) <> ''),

  constraint recommendation_identity_consents_customer_name_length
    check (
      char_length(btrim(customer_name_snapshot)) between 1 and 250
    ),

  constraint recommendation_identity_consents_customer_email_length
    check (
      char_length(btrim(customer_email_snapshot)) between 3 and 320
    ),

  constraint recommendation_identity_consents_customer_email_format
    check (
      customer_email_snapshot ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),

  constraint recommendation_identity_consents_partner_name_length
    check (
      char_length(btrim(partner_name_snapshot)) between 1 and 250
    ),

  constraint recommendation_identity_consents_partner_code_length
    check (
      char_length(btrim(partner_code_snapshot)) between 1 and 100
    ),

  constraint recommendation_identity_consents_text_version_length
    check (
      char_length(btrim(consent_text_version)) between 1 and 100
    ),

  constraint recommendation_identity_consents_text_length
    check (
      char_length(btrim(consent_text_snapshot)) between 20 and 5000
    ),

  constraint recommendation_identity_consents_revocation_consistent
    check (
      (
        status = 'granted'
        and revoked_at is null
      )
      or
      (
        status = 'revoked'
        and revoked_at is not null
      )
    ),

  constraint recommendation_identity_consents_granted_before_revoked
    check (
      revoked_at is null
      or revoked_at >= granted_at
    ),

  constraint recommendation_identity_consents_disclosure_count_nonnegative
    check (
      disclosure_count >= 0
    ),

  constraint recommendation_identity_consents_disclosure_times_consistent
    check (
      (
        disclosure_count = 0
        and first_disclosed_at is null
        and last_disclosed_at is null
      )
      or
      (
        disclosure_count > 0
        and first_disclosed_at is not null
        and last_disclosed_at is not null
        and last_disclosed_at >= first_disclosed_at
      )
    )
);

create unique index if not exists
  recommendation_identity_consents_active_context_unique
on public.recommendation_identity_consents (
  project_key,
  partner_id,
  request_id,
  request_item_id
)
where status = 'granted'
  and click_id is null;

create index if not exists
  recommendation_identity_consents_partner_status_idx
on public.recommendation_identity_consents (
  partner_id,
  status,
  granted_at desc
);

create index if not exists
  recommendation_identity_consents_request_idx
on public.recommendation_identity_consents (
  request_id,
  partner_id,
  status
);

create index if not exists
  recommendation_identity_consents_click_idx
on public.recommendation_identity_consents (
  click_id
)
where click_id is not null;

alter table public.recommendation_identity_consents
  enable row level security;

revoke all
  on table public.recommendation_identity_consents
  from anon, authenticated;

comment on table public.recommendation_identity_consents is
  'Versionierter Nachweis einer freiwilligen Einwilligung zur Übermittlung von Kundenname und E-Mail-Adresse an einen konkret benannten Empfehlungspartner.';

comment on column public.recommendation_identity_consents.consent_text_snapshot is
  'Vollständiger Wortlaut der Einwilligung zum Zeitpunkt der Erteilung.';

comment on column public.recommendation_identity_consents.click_id is
  'Wird nach dem echten Partnerklick mit dem entstandenen Empfehlungsklick verbunden.';

comment on column public.recommendation_identity_consents.disclosure_count is
  'Anzahl protokollierter Offenlegungen im Portal oder in Partnerberichten.';


-- ============================================================
-- 2. Protokoll über jede Offenlegung personenbezogener Daten
--
-- Jeder Abruf oder Versand mit Name/E-Mail wird separat
-- nachvollziehbar gespeichert.
-- ============================================================

create table if not exists public.recommendation_identity_disclosures (
  id uuid primary key default gen_random_uuid(),

  consent_id uuid not null,
  partner_id uuid not null,
  click_id uuid not null,

  disclosure_type text not null,
  disclosed_fields text[] not null,

  recipient_email text,
  report_id uuid,

  disclosed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint recommendation_identity_disclosures_consent_fk
    foreign key (consent_id)
    references public.recommendation_identity_consents (id)
    on delete cascade,

  constraint recommendation_identity_disclosures_partner_fk
    foreign key (partner_id)
    references public.recommendation_partners (id)
    on delete cascade,

  constraint recommendation_identity_disclosures_click_fk
    foreign key (click_id)
    references public.recommendation_clicks (id)
    on delete cascade,

  constraint recommendation_identity_disclosures_type_allowed
    check (
      disclosure_type in (
        'partner_portal',
        'monthly_email',
        'admin_export'
      )
    ),

  constraint recommendation_identity_disclosures_fields_not_empty
    check (
      cardinality(disclosed_fields) > 0
    ),

  constraint recommendation_identity_disclosures_fields_allowed
    check (
      disclosed_fields <@ array[
        'customer_name',
        'customer_email'
      ]::text[]
    ),

  constraint recommendation_identity_disclosures_recipient_email_length
    check (
      recipient_email is null
      or char_length(recipient_email) <= 320
    )
);

create index if not exists
  recommendation_identity_disclosures_consent_idx
on public.recommendation_identity_disclosures (
  consent_id,
  disclosed_at desc
);

create index if not exists
  recommendation_identity_disclosures_partner_idx
on public.recommendation_identity_disclosures (
  partner_id,
  disclosed_at desc
);

create index if not exists
  recommendation_identity_disclosures_report_idx
on public.recommendation_identity_disclosures (
  report_id
)
where report_id is not null;

alter table public.recommendation_identity_disclosures
  enable row level security;

revoke all
  on table public.recommendation_identity_disclosures
  from anon, authenticated;

comment on table public.recommendation_identity_disclosures is
  'Auditprotokoll jeder tatsächlichen Offenlegung freigegebener Kundenidentitätsdaten an einen Empfehlungspartner.';


-- ============================================================
-- 3. Monatsberichte an Empfehlungspartner
--
-- Ein Bericht kann mehrfach versendet werden. Jeder Versuch
-- erhält einen eigenen Datensatz.
-- ============================================================

create table if not exists public.recommendation_partner_reports (
  id uuid primary key default gen_random_uuid(),

  project_key text not null default 'handzettel-schulen',
  partner_id uuid not null,

  period_start date not null,
  period_end date not null,

  recipient_email text not null,

  status text not null default 'pending',

  referral_count integer not null default 0,
  open_count integer not null default 0,
  ordered_count integer not null default 0,
  not_ordered_count integer not null default 0,
  cancelled_count integer not null default 0,

  identity_authorized_count integer not null default 0,
  identity_included_count integer not null default 0,

  gross_revenue numeric(12, 2) not null default 0,
  currency text not null default 'EUR',

  portal_url text,

  subject_snapshot text,
  message_id text,
  error_message text,

  requested_by text not null default 'admin',
  requested_at timestamptz not null default now(),

  sent_at timestamptz,
  failed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint recommendation_partner_reports_partner_fk
    foreign key (partner_id)
    references public.recommendation_partners (id)
    on delete cascade,

  constraint recommendation_partner_reports_project_key_not_blank
    check (btrim(project_key) <> ''),

  constraint recommendation_partner_reports_period_valid
    check (
      period_end >= period_start
    ),

  constraint recommendation_partner_reports_recipient_email_length
    check (
      char_length(btrim(recipient_email)) between 3 and 320
    ),

  constraint recommendation_partner_reports_recipient_email_format
    check (
      recipient_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),

  constraint recommendation_partner_reports_status_allowed
    check (
      status in (
        'pending',
        'sending',
        'sent',
        'failed'
      )
    ),

  constraint recommendation_partner_reports_counts_nonnegative
    check (
      referral_count >= 0
      and open_count >= 0
      and ordered_count >= 0
      and not_ordered_count >= 0
      and cancelled_count >= 0
      and identity_authorized_count >= 0
      and identity_included_count >= 0
    ),

  constraint recommendation_partner_reports_identity_count_valid
    check (
      identity_included_count <= identity_authorized_count
      and identity_authorized_count <= referral_count
    ),

  constraint recommendation_partner_reports_revenue_nonnegative
    check (
      gross_revenue >= 0
    ),

  constraint recommendation_partner_reports_currency_format
    check (
      currency ~ '^[A-Z]{3}$'
    ),

  constraint recommendation_partner_reports_portal_url_http
    check (
      portal_url is null
      or portal_url ~* '^https?://'
    ),

  constraint recommendation_partner_reports_requested_by_allowed
    check (
      requested_by in (
        'admin',
        'cron',
        'system'
      )
    ),

  constraint recommendation_partner_reports_status_times
    check (
      (
        status = 'pending'
        and sent_at is null
        and failed_at is null
      )
      or
      (
        status = 'sending'
        and sent_at is null
        and failed_at is null
      )
      or
      (
        status = 'sent'
        and sent_at is not null
        and failed_at is null
      )
      or
      (
        status = 'failed'
        and sent_at is null
        and failed_at is not null
      )
    ),

  constraint recommendation_partner_reports_error_length
    check (
      error_message is null
      or char_length(error_message) <= 5000
    )
);

create index if not exists
  recommendation_partner_reports_partner_period_idx
on public.recommendation_partner_reports (
  partner_id,
  period_start desc,
  created_at desc
);

create index if not exists
  recommendation_partner_reports_status_idx
on public.recommendation_partner_reports (
  status,
  created_at desc
);

alter table public.recommendation_partner_reports
  enable row level security;

revoke all
  on table public.recommendation_partner_reports
  from anon, authenticated;

comment on table public.recommendation_partner_reports is
  'Versand- und Inhaltsprotokoll manueller oder automatischer Monatsberichte an Empfehlungspartner.';


-- ============================================================
-- 4. Fremdschlüssel des Offenlegungsprotokolls zum Bericht
-- ============================================================

alter table public.recommendation_identity_disclosures
  drop constraint if exists
    recommendation_identity_disclosures_report_fk;

alter table public.recommendation_identity_disclosures
  add constraint recommendation_identity_disclosures_report_fk
  foreign key (report_id)
  references public.recommendation_partner_reports (id)
  on delete set null;


-- ============================================================
-- 5. Funktion zur revisionssicheren Offenlegungszählung
-- ============================================================

create or replace function public.register_recommendation_identity_disclosure()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.recommendation_identity_consents
  set
    first_disclosed_at = coalesce(
      first_disclosed_at,
      new.disclosed_at
    ),
    last_disclosed_at = new.disclosed_at,
    disclosure_count = disclosure_count + 1,
    updated_at = now()
  where id = new.consent_id
    and status = 'granted';

  return new;
end;
$$;

drop trigger if exists
  recommendation_identity_disclosure_registered
on public.recommendation_identity_disclosures;

create trigger
  recommendation_identity_disclosure_registered
after insert
on public.recommendation_identity_disclosures
for each row
execute function
  public.register_recommendation_identity_disclosure();