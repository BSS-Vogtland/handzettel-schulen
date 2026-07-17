create extension if not exists pgcrypto;

-- ============================================================
-- 1. Kurzer Vermittlungscode je Partnerklick
-- Beispiel: HZS-R-K7M4-Q2PX
-- ============================================================

alter table public.recommendation_clicks
  add column if not exists referral_code text;

create or replace function public.generate_recommendation_referral_code()
returns text
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  first_block text := '';
  second_block text := '';
  candidate text;
  index_value integer;
begin
  loop
    first_block := '';
    second_block := '';

    for position_index in 1..4 loop
      index_value := 1 + floor(random() * length(alphabet))::integer;
      first_block := first_block || substr(alphabet, index_value, 1);
    end loop;

    for position_index in 1..4 loop
      index_value := 1 + floor(random() * length(alphabet))::integer;
      second_block := second_block || substr(alphabet, index_value, 1);
    end loop;

    candidate := 'HZS-R-' || first_block || '-' || second_block;

    exit when not exists (
      select 1
      from public.recommendation_clicks
      where referral_code = candidate
    );
  end loop;

  return candidate;
end;
$$;

update public.recommendation_clicks
set referral_code = public.generate_recommendation_referral_code()
where referral_code is null
   or btrim(referral_code) = '';

alter table public.recommendation_clicks
  alter column referral_code set default public.generate_recommendation_referral_code();

alter table public.recommendation_clicks
  alter column referral_code set not null;

alter table public.recommendation_clicks
  drop constraint if exists recommendation_clicks_referral_code_format;

alter table public.recommendation_clicks
  add constraint recommendation_clicks_referral_code_format
  check (
    referral_code ~ '^HZS-R-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$'
  );

alter table public.recommendation_clicks
  drop constraint if exists recommendation_clicks_referral_code_unique;

alter table public.recommendation_clicks
  add constraint recommendation_clicks_referral_code_unique
  unique (referral_code);

create index if not exists recommendation_clicks_referral_code_idx
  on public.recommendation_clicks (referral_code);

comment on column public.recommendation_clicks.referral_code is
  'Kurzer, nicht erratbarer Vermittlungscode für die manuelle Zuordnung einer Partnerbestellung.';


-- ============================================================
-- 2. Schlanke Rückmeldung des Partners
-- ============================================================

create table if not exists public.recommendation_referral_feedback (
  id uuid primary key default gen_random_uuid(),

  click_id uuid not null,
  partner_id uuid not null,

  status text not null default 'open',

  external_order_reference text,
  order_date date,
  gross_revenue numeric(12, 2),
  currency text not null default 'EUR',
  partner_note text,

  submitted_by text,
  submitted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint recommendation_referral_feedback_click_unique
    unique (click_id),

  constraint recommendation_referral_feedback_click_fk
    foreign key (click_id)
    references public.recommendation_clicks (id)
    on delete cascade,

  constraint recommendation_referral_feedback_partner_fk
    foreign key (partner_id)
    references public.recommendation_partners (id)
    on delete cascade,

  constraint recommendation_referral_feedback_status_allowed
    check (
      status in (
        'open',
        'ordered',
        'not_ordered',
        'cancelled'
      )
    ),

  constraint recommendation_referral_feedback_currency_format
    check (currency ~ '^[A-Z]{3}$'),

  constraint recommendation_referral_feedback_order_reference_length
    check (
      external_order_reference is null
      or char_length(external_order_reference) <= 250
    ),

  constraint recommendation_referral_feedback_note_length
    check (
      partner_note is null
      or char_length(partner_note) <= 2000
    ),

  constraint recommendation_referral_feedback_revenue_nonnegative
    check (
      gross_revenue is null
      or gross_revenue >= 0
    ),

  constraint recommendation_referral_feedback_submitted_by_allowed
    check (
      submitted_by is null
      or submitted_by in ('partner', 'admin', 'system')
    ),

  constraint recommendation_referral_feedback_ordered_fields
    check (
      status <> 'ordered'
      or (
        order_date is not null
        and gross_revenue is not null
        and gross_revenue >= 0
      )
    ),

  constraint recommendation_referral_feedback_non_ordered_revenue
    check (
      status = 'ordered'
      or gross_revenue is null
    )
);

create index if not exists recommendation_referral_feedback_partner_status_idx
  on public.recommendation_referral_feedback (
    partner_id,
    status,
    updated_at desc
  );

create index if not exists recommendation_referral_feedback_status_updated_idx
  on public.recommendation_referral_feedback (
    status,
    updated_at desc
  );

alter table public.recommendation_referral_feedback
  enable row level security;

revoke all
  on table public.recommendation_referral_feedback
  from anon, authenticated;

comment on table public.recommendation_referral_feedback is
  'Schlanke Rückmeldung eines Empfehlungspartners: offen, bestellt, nicht bestellt oder storniert.';

comment on column public.recommendation_referral_feedback.gross_revenue is
  'Vom Partner gemeldeter Bruttoumsatz der Bestellung.';

comment on column public.recommendation_referral_feedback.external_order_reference is
  'Interne Bestellnummer oder Referenz des Partners.';


-- ============================================================
-- 3. Automatisch eine offene Rückmeldung für jeden echten Klick
-- Bots werden bewusst nicht übernommen.
-- ============================================================

create or replace function public.create_recommendation_referral_feedback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.partner_id is null or new.is_probable_bot = true then
    return new;
  end if;

  insert into public.recommendation_referral_feedback (
    click_id,
    partner_id,
    status,
    currency,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.partner_id,
    'open',
    'EUR',
    now(),
    now()
  )
  on conflict (click_id) do nothing;

  return new;
end;
$$;

drop trigger if exists recommendation_clicks_create_feedback
  on public.recommendation_clicks;

create trigger recommendation_clicks_create_feedback
after insert on public.recommendation_clicks
for each row
execute function public.create_recommendation_referral_feedback();


-- ============================================================
-- 4. Bestehende menschliche Klicks nachziehen
-- ============================================================

insert into public.recommendation_referral_feedback (
  click_id,
  partner_id,
  status,
  currency,
  created_at,
  updated_at
)
select
  clicks.id,
  clicks.partner_id,
  'open',
  'EUR',
  clicks.clicked_at,
  now()
from public.recommendation_clicks as clicks
where clicks.partner_id is not null
  and clicks.is_probable_bot = false
on conflict (click_id) do nothing;


-- ============================================================
-- 5. Partnerzugang vorbereiten
-- Es wird nur ein Hash gespeichert, niemals der Klartext-Token.
-- ============================================================

create table if not exists public.recommendation_partner_access (
  id uuid primary key default gen_random_uuid(),

  partner_id uuid not null,
  project_key text not null default 'handzettel-schulen',

  token_hash text not null,
  label text,
  active boolean not null default true,

  expires_at timestamptz,
  last_used_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint recommendation_partner_access_partner_fk
    foreign key (partner_id)
    references public.recommendation_partners (id)
    on delete cascade,

  constraint recommendation_partner_access_token_hash_unique
    unique (token_hash),

  constraint recommendation_partner_access_token_hash_format
    check (token_hash ~ '^[a-f0-9]{64}$'),

  constraint recommendation_partner_access_project_key_not_blank
    check (btrim(project_key) <> ''),

  constraint recommendation_partner_access_label_length
    check (
      label is null
      or char_length(label) <= 250
    ),

  constraint recommendation_partner_access_expiry_valid
    check (
      expires_at is null
      or expires_at > created_at
    )
);

create index if not exists recommendation_partner_access_partner_idx
  on public.recommendation_partner_access (
    partner_id,
    active
  );

alter table public.recommendation_partner_access
  enable row level security;

revoke all
  on table public.recommendation_partner_access
  from anon, authenticated;

comment on table public.recommendation_partner_access is
  'Gehaschte Zugangstoken für den schlanken Partnerbereich. Klartext-Token werden nicht gespeichert.';


-- ============================================================
-- 6. Partner-Kontaktdaten und Berichtsoption
-- ============================================================

alter table public.recommendation_partners
  add column if not exists contact_name text;

alter table public.recommendation_partners
  add column if not exists contact_email text;

alter table public.recommendation_partners
  add column if not exists partner_portal_enabled boolean not null default false;

alter table public.recommendation_partners
  add column if not exists report_frequency text not null default 'monthly';

alter table public.recommendation_partners
  drop constraint if exists recommendation_partners_contact_name_length;

alter table public.recommendation_partners
  add constraint recommendation_partners_contact_name_length
  check (
    contact_name is null
    or char_length(contact_name) <= 250
  );

alter table public.recommendation_partners
  drop constraint if exists recommendation_partners_contact_email_length;

alter table public.recommendation_partners
  add constraint recommendation_partners_contact_email_length
  check (
    contact_email is null
    or char_length(contact_email) <= 320
  );

alter table public.recommendation_partners
  drop constraint if exists recommendation_partners_report_frequency_allowed;

alter table public.recommendation_partners
  add constraint recommendation_partners_report_frequency_allowed
  check (
    report_frequency in (
      'disabled',
      'weekly',
      'monthly'
    )
  );
