begin;

-- ============================================================
-- HANDZETTEL-SCHULEN.DE
-- RECHNUNGSCUTOVER V1: PROVIDER-ZUORDNUNG UND LEGACY-SNAPSHOTS
--
-- Cutover:
-- 01.08.2026 00:00 Europe/Berlin
-- = 31.07.2026 22:00 UTC
--
-- Diese Migration erzeugt keine Lexware-Rechnung, versendet
-- keine E-Mail und aktiviert keine produktiven Schreibzugriffe.
-- ============================================================

create table if not exists public.business_runtime_settings (
  id text primary key,
  timezone_name text not null,
  invoice_cutover_at timestamptz not null,
  invoice_provider_before text not null,
  invoice_provider_after text not null,
  invoice_cutover_version text not null,

  lexware_production_organization_id text not null,
  lexware_test_organization_id text,

  lexware_production_write_enabled boolean not null default false,
  lexware_production_write_enabled_at timestamptz,
  lexware_automatic_mail_enabled boolean not null default false,
  lexware_automatic_mail_enabled_at timestamptz,
  bank_transfer_qr_enabled boolean not null default true,

  updated_by text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint business_runtime_settings_provider_before_check
    check (invoice_provider_before in ('legacy_internal', 'lexware')),

  constraint business_runtime_settings_provider_after_check
    check (invoice_provider_after in ('legacy_internal', 'lexware')),

  constraint business_runtime_settings_transition_check
    check (
      invoice_provider_before = 'legacy_internal'
      and invoice_provider_after = 'lexware'
    )
);

insert into public.business_runtime_settings (
  id,
  timezone_name,
  invoice_cutover_at,
  invoice_provider_before,
  invoice_provider_after,
  invoice_cutover_version,
  lexware_production_organization_id,
  lexware_test_organization_id,
  lexware_production_write_enabled,
  lexware_automatic_mail_enabled,
  bank_transfer_qr_enabled,
  notes
)
values (
  'default',
  'Europe/Berlin',
  '2026-08-01 00:00:00+02'::timestamptz,
  'legacy_internal',
  'lexware',
  'invoice-cutover-2026-08-01-v1',
  'e2d383dc-a3e7-4561-a94d-79eb344328a5',
  '2b4ee291-2321-4557-b883-9abf3af0282b',
  false,
  false,
  true,
  'Foundation angelegt. Lexware-Produktion und automatischer Lexware-PDF-Mailversand bleiben zunächst deaktiviert.'
)
on conflict (id) do nothing;

create or replace function public.set_business_runtime_settings_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_business_runtime_settings_updated_at
  on public.business_runtime_settings;

create trigger trg_business_runtime_settings_updated_at
before update on public.business_runtime_settings
for each row
execute function public.set_business_runtime_settings_updated_at();

alter table public.business_runtime_settings enable row level security;

revoke all on table public.business_runtime_settings
  from public, anon, authenticated;

grant all on table public.business_runtime_settings
  to service_role;

-- ------------------------------------------------------------
-- 1. Unveränderliche Provider-Zuordnung an der Anfrage
-- ------------------------------------------------------------

alter table public.school_requests
  add column if not exists checkout_committed_at timestamptz,
  add column if not exists invoice_provider text,
  add column if not exists invoice_provider_assigned_at timestamptz,
  add column if not exists invoice_cutover_version text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.school_requests'::regclass
      and conname = 'school_requests_invoice_provider_check'
  ) then
    alter table public.school_requests
      add constraint school_requests_invoice_provider_check
      check (
        invoice_provider is null
        or invoice_provider in ('legacy_internal', 'lexware')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.school_requests'::regclass
      and conname = 'school_requests_provider_assignment_complete_check'
  ) then
    alter table public.school_requests
      add constraint school_requests_provider_assignment_complete_check
      check (
        (
          invoice_provider is null
          and invoice_provider_assigned_at is null
          and invoice_cutover_version is null
        )
        or
        (
          invoice_provider is not null
          and invoice_provider_assigned_at is not null
          and invoice_cutover_version is not null
        )
      );
  end if;
end
$$;

create index if not exists idx_school_requests_invoice_provider
  on public.school_requests (
    invoice_provider,
    invoice_provider_assigned_at
  );

-- ------------------------------------------------------------
-- 2. Provider- und Legacy-Snapshots an Rechnungen
-- ------------------------------------------------------------

alter table public.school_request_invoices
  add column if not exists invoice_provider text,
  add column if not exists invoice_provider_assigned_at timestamptz,
  add column if not exists invoice_cutover_version text,

  add column if not exists seller_snapshot_version text,
  add column if not exists seller_legal_name_snapshot text,
  add column if not exists seller_trade_name_snapshot text,
  add column if not exists seller_owner_name_snapshot text,
  add column if not exists seller_street_snapshot text,
  add column if not exists seller_postal_code_snapshot text,
  add column if not exists seller_city_snapshot text,
  add column if not exists seller_country_snapshot text,
  add column if not exists seller_tax_number_snapshot text,
  add column if not exists seller_vat_id_snapshot text,
  add column if not exists seller_email_snapshot text,
  add column if not exists seller_phone_snapshot text,
  add column if not exists seller_website_snapshot text,

  add column if not exists bank_snapshot_version text,
  add column if not exists bank_account_holder_snapshot text,
  add column if not exists bank_name_snapshot text,
  add column if not exists bank_iban_snapshot text,
  add column if not exists bank_bic_snapshot text,
  add column if not exists bank_payment_purpose_snapshot text,

  add column if not exists payment_credential_alias_snapshot text,
  add column if not exists payment_profile_snapshot jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.school_request_invoices'::regclass
      and conname = 'school_request_invoices_provider_check'
  ) then
    alter table public.school_request_invoices
      add constraint school_request_invoices_provider_check
      check (
        invoice_provider is null
        or invoice_provider in ('legacy_internal', 'lexware')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.school_request_invoices'::regclass
      and conname = 'school_request_invoices_provider_assignment_complete_check'
  ) then
    alter table public.school_request_invoices
      add constraint school_request_invoices_provider_assignment_complete_check
      check (
        (
          invoice_provider is null
          and invoice_provider_assigned_at is null
          and invoice_cutover_version is null
        )
        or
        (
          invoice_provider is not null
          and invoice_provider_assigned_at is not null
          and invoice_cutover_version is not null
        )
      );
  end if;
end
$$;

create index if not exists idx_school_request_invoices_provider
  on public.school_request_invoices (
    invoice_provider,
    invoice_provider_assigned_at
  );

-- ------------------------------------------------------------
-- 3. Bestehende Rechnungen und zugehörige Anfragen einfrieren
-- ------------------------------------------------------------

update public.school_request_invoices
set
  invoice_provider = 'legacy_internal',
  invoice_provider_assigned_at = coalesce(
    invoice_provider_assigned_at,
    created_at
  ),
  invoice_cutover_version = coalesce(
    invoice_cutover_version,
    'legacy-before-2026-08-01-v1'
  ),

  seller_snapshot_version = coalesce(
    seller_snapshot_version,
    'legacy-business-profile-v1'
  ),
  seller_legal_name_snapshot = coalesce(
    seller_legal_name_snapshot,
    'Bürotechnik Schwalm & Staffe'
  ),
  seller_trade_name_snapshot = coalesce(
    seller_trade_name_snapshot,
    'Handzettel-Schulen.de'
  ),
  seller_owner_name_snapshot = coalesce(
    seller_owner_name_snapshot,
    'Heike Leopold'
  ),
  seller_street_snapshot = coalesce(
    seller_street_snapshot,
    'Zwickauer Str. 167'
  ),
  seller_postal_code_snapshot = coalesce(
    seller_postal_code_snapshot,
    '08468'
  ),
  seller_city_snapshot = coalesce(
    seller_city_snapshot,
    'Reichenbach'
  ),
  seller_country_snapshot = coalesce(
    seller_country_snapshot,
    'Deutschland'
  ),
  seller_tax_number_snapshot = coalesce(
    seller_tax_number_snapshot,
    '223/244/09843'
  ),
  seller_vat_id_snapshot = coalesce(
    seller_vat_id_snapshot,
    'DE257963936'
  ),
  seller_email_snapshot = coalesce(
    seller_email_snapshot,
    'kontakt@bss-vogtland.de'
  ),
  seller_phone_snapshot = coalesce(
    seller_phone_snapshot,
    '03765 / 16175 · 03765 / 69808'
  ),
  seller_website_snapshot = coalesce(
    seller_website_snapshot,
    'www.handzettel-schulen.de'
  ),

  bank_snapshot_version = coalesce(
    bank_snapshot_version,
    'legacy-bank-profile-v1'
  ),
  bank_account_holder_snapshot = coalesce(
    bank_account_holder_snapshot,
    'Bürotechnik Schwalm & Staffe'
  ),
  bank_name_snapshot = coalesce(
    bank_name_snapshot,
    'Sparkasse Vogtland'
  ),
  bank_iban_snapshot = coalesce(
    bank_iban_snapshot,
    'DE56870580003812005882'
  ),
  bank_bic_snapshot = coalesce(
    bank_bic_snapshot,
    'WELADED1PLX'
  ),
  bank_payment_purpose_snapshot = coalesce(
    bank_payment_purpose_snapshot,
    invoice_number
  ),

  payment_credential_alias_snapshot = coalesce(
    payment_credential_alias_snapshot,
    case selected_payment_method
      when 'paypal' then 'paypal_legacy'
      when 'bank_transfer' then 'bank_transfer_legacy'
      when 'cash_on_pickup' then 'cash_on_pickup_legacy'
      else 'legacy_unassigned'
    end
  ),
  payment_profile_snapshot = coalesce(
    payment_profile_snapshot,
    jsonb_build_object(
      'version',
        'legacy-payment-profile-v1',
      'selected_payment_method',
        selected_payment_method,
      'payment_provider',
        payment_provider
    )
  )
where created_at < '2026-08-01 00:00:00+02'::timestamptz
  and (
    invoice_provider is null
    or invoice_provider = 'legacy_internal'
  );

with legacy_request_assignment as (
  select
    request_id,
    min(created_at) as first_invoice_created_at
  from public.school_request_invoices
  where invoice_provider = 'legacy_internal'
  group by request_id
)
update public.school_requests request_row
set
  checkout_committed_at = coalesce(
    request_row.checkout_committed_at,
    assignment.first_invoice_created_at
  ),
  invoice_provider = 'legacy_internal',
  invoice_provider_assigned_at = coalesce(
    request_row.invoice_provider_assigned_at,
    assignment.first_invoice_created_at
  ),
  invoice_cutover_version = coalesce(
    request_row.invoice_cutover_version,
    'legacy-before-2026-08-01-v1'
  )
from legacy_request_assignment assignment
where request_row.id = assignment.request_id
  and (
    request_row.invoice_provider is null
    or request_row.invoice_provider = 'legacy_internal'
  );

-- ------------------------------------------------------------
-- 4. Nach Vergabe nicht mehr umschaltbar
-- ------------------------------------------------------------

create or replace function public.protect_school_request_invoice_provider_assignment()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.invoice_provider is not null and (
    new.invoice_provider is distinct from old.invoice_provider
    or new.invoice_provider_assigned_at
      is distinct from old.invoice_provider_assigned_at
    or new.invoice_cutover_version
      is distinct from old.invoice_cutover_version
    or new.checkout_committed_at
      is distinct from old.checkout_committed_at
  ) then
    raise exception
      'Die Rechnungsprovider-Zuordnung der Anfrage % ist unveränderlich.',
      old.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_school_request_invoice_provider_assignment
  on public.school_requests;

create trigger trg_protect_school_request_invoice_provider_assignment
before update on public.school_requests
for each row
execute function public.protect_school_request_invoice_provider_assignment();

create or replace function public.protect_school_request_invoice_provider_snapshot()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.invoice_provider is not null and (
    new.invoice_provider is distinct from old.invoice_provider
    or new.invoice_provider_assigned_at
      is distinct from old.invoice_provider_assigned_at
    or new.invoice_cutover_version
      is distinct from old.invoice_cutover_version
  ) then
    raise exception
      'Die Rechnungsprovider-Zuordnung der Rechnung % ist unveränderlich.',
      old.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_school_request_invoice_provider_snapshot
  on public.school_request_invoices;

create trigger trg_protect_school_request_invoice_provider_snapshot
before update on public.school_request_invoices
for each row
execute function public.protect_school_request_invoice_provider_snapshot();

-- ------------------------------------------------------------
-- 5. Atomare Zuordnung anhand der Datenbank-Serverzeit
-- ------------------------------------------------------------

create or replace function public.assign_school_request_invoice_provider(
  p_request_id uuid
)
returns table (
  request_id uuid,
  invoice_provider text,
  assigned_at timestamptz,
  cutover_version text,
  cutover_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  settings_row public.business_runtime_settings%rowtype;
  request_row public.school_requests%rowtype;
  decision_at timestamptz;
  selected_provider text;
begin
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

  decision_at := coalesce(
    request_row.checkout_committed_at,
    clock_timestamp()
  );

  if request_row.invoice_provider is null then
    selected_provider := case
      when decision_at < settings_row.invoice_cutover_at
        then settings_row.invoice_provider_before
      else settings_row.invoice_provider_after
    end;

    update public.school_requests
    set
      checkout_committed_at = decision_at,
      invoice_provider = selected_provider,
      invoice_provider_assigned_at = decision_at,
      invoice_cutover_version = settings_row.invoice_cutover_version
    where id = p_request_id
    returning *
    into request_row;
  end if;

  return query
  select
    request_row.id,
    request_row.invoice_provider,
    request_row.invoice_provider_assigned_at,
    request_row.invoice_cutover_version,
    settings_row.invoice_cutover_at;
end;
$$;

revoke all on function public.assign_school_request_invoice_provider(uuid)
  from public, anon, authenticated;

grant execute on function public.assign_school_request_invoice_provider(uuid)
  to service_role;

comment on function public.assign_school_request_invoice_provider(uuid) is
  'Vergibt den Rechnungsprovider einmalig nach Datenbank-Serverzeit. Nach dem Cutover gibt es keinen Legacy-Fallback.';

-- Neue lokale Rechnungszeilen erhalten automatisch dieselbe
-- unveränderliche Provider-Zuordnung wie ihre Anfrage.
create or replace function public.set_school_request_invoice_provider_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request_provider text;
  request_assigned_at timestamptz;
  request_cutover_version text;
  provider_was_missing boolean := new.invoice_provider is null;
begin
  if new.invoice_provider is null then
    select
      invoice_provider,
      invoice_provider_assigned_at,
      invoice_cutover_version
    into
      request_provider,
      request_assigned_at,
      request_cutover_version
    from public.school_requests
    where id = new.request_id;

    if request_provider is null then
      perform public.assign_school_request_invoice_provider(
        new.request_id
      );

      select
        invoice_provider,
        invoice_provider_assigned_at,
        invoice_cutover_version
      into
        request_provider,
        request_assigned_at,
        request_cutover_version
      from public.school_requests
      where id = new.request_id;
    end if;

    new.invoice_provider := request_provider;
    new.invoice_provider_assigned_at := request_assigned_at;
    new.invoice_cutover_version := request_cutover_version;
  end if;

  if provider_was_missing and new.invoice_provider = 'lexware' then
    raise exception
      'Der Lexware-Cutover ist aktiv. Der alte interne Rechnungs-Erzeugungspfad ist ab diesem Zeitpunkt gesperrt.';
  end if;

  if new.invoice_provider = 'legacy_internal' then
    new.seller_snapshot_version := coalesce(
      new.seller_snapshot_version,
      'legacy-business-profile-v1'
    );
    new.seller_legal_name_snapshot := coalesce(
      new.seller_legal_name_snapshot,
      'Bürotechnik Schwalm & Staffe'
    );
    new.seller_trade_name_snapshot := coalesce(
      new.seller_trade_name_snapshot,
      'Handzettel-Schulen.de'
    );
    new.seller_owner_name_snapshot := coalesce(
      new.seller_owner_name_snapshot,
      'Heike Leopold'
    );
    new.seller_street_snapshot := coalesce(
      new.seller_street_snapshot,
      'Zwickauer Str. 167'
    );
    new.seller_postal_code_snapshot := coalesce(
      new.seller_postal_code_snapshot,
      '08468'
    );
    new.seller_city_snapshot := coalesce(
      new.seller_city_snapshot,
      'Reichenbach'
    );
    new.seller_country_snapshot := coalesce(
      new.seller_country_snapshot,
      'Deutschland'
    );
    new.seller_tax_number_snapshot := coalesce(
      new.seller_tax_number_snapshot,
      '223/244/09843'
    );
    new.seller_vat_id_snapshot := coalesce(
      new.seller_vat_id_snapshot,
      'DE257963936'
    );
    new.seller_email_snapshot := coalesce(
      new.seller_email_snapshot,
      'kontakt@bss-vogtland.de'
    );
    new.seller_phone_snapshot := coalesce(
      new.seller_phone_snapshot,
      '03765 / 16175 · 03765 / 69808'
    );
    new.seller_website_snapshot := coalesce(
      new.seller_website_snapshot,
      'www.handzettel-schulen.de'
    );

    new.bank_snapshot_version := coalesce(
      new.bank_snapshot_version,
      'legacy-bank-profile-v1'
    );
    new.bank_account_holder_snapshot := coalesce(
      new.bank_account_holder_snapshot,
      'Bürotechnik Schwalm & Staffe'
    );
    new.bank_name_snapshot := coalesce(
      new.bank_name_snapshot,
      'Sparkasse Vogtland'
    );
    new.bank_iban_snapshot := coalesce(
      new.bank_iban_snapshot,
      'DE56870580003812005882'
    );
    new.bank_bic_snapshot := coalesce(
      new.bank_bic_snapshot,
      'WELADED1PLX'
    );
    new.bank_payment_purpose_snapshot := coalesce(
      new.bank_payment_purpose_snapshot,
      new.invoice_number
    );

    new.payment_credential_alias_snapshot := coalesce(
      new.payment_credential_alias_snapshot,
      case new.selected_payment_method
        when 'paypal' then 'paypal_legacy'
        when 'bank_transfer' then 'bank_transfer_legacy'
        when 'cash_on_pickup' then 'cash_on_pickup_legacy'
        else 'legacy_unassigned'
      end
    );
    new.payment_profile_snapshot := coalesce(
      new.payment_profile_snapshot,
      jsonb_build_object(
        'version',
          'legacy-payment-profile-v1',
        'selected_payment_method',
          new.selected_payment_method,
        'payment_provider',
          new.payment_provider
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_school_request_invoice_provider_on_insert
  on public.school_request_invoices;

create trigger trg_set_school_request_invoice_provider_on_insert
before insert on public.school_request_invoices
for each row
execute function public.set_school_request_invoice_provider_on_insert();

-- ------------------------------------------------------------
-- 6. Selbstprüfung
-- ------------------------------------------------------------

do $$
declare
  settings_row public.business_runtime_settings%rowtype;
  invalid_legacy_invoice_count integer;
  incomplete_invoice_assignment_count integer;
  incomplete_request_assignment_count integer;
  incomplete_legacy_snapshot_count integer;
begin
  select *
  into settings_row
  from public.business_runtime_settings
  where id = 'default';

  if not found then
    raise exception
      'Foundation-Prüfung: business_runtime_settings/default fehlt.';
  end if;

  if settings_row.timezone_name <> 'Europe/Berlin' then
    raise exception
      'Foundation-Prüfung: falsche Zeitzone %.',
      settings_row.timezone_name;
  end if;

  if settings_row.invoice_cutover_at
      <> '2026-08-01 00:00:00+02'::timestamptz then
    raise exception
      'Foundation-Prüfung: falscher Cutover-Zeitpunkt %.',
      settings_row.invoice_cutover_at;
  end if;

  if settings_row.lexware_production_write_enabled then
    raise exception
      'Foundation-Prüfung: Lexware-Produktion darf noch nicht aktiv sein.';
  end if;

  if settings_row.lexware_automatic_mail_enabled then
    raise exception
      'Foundation-Prüfung: Automatischer Lexware-Mailversand darf noch nicht aktiv sein.';
  end if;

  select count(*)
  into invalid_legacy_invoice_count
  from public.school_request_invoices
  where created_at < settings_row.invoice_cutover_at
    and invoice_provider is distinct from 'legacy_internal';

  if invalid_legacy_invoice_count > 0 then
    raise exception
      'Foundation-Prüfung: % alte Rechnung(en) sind nicht legacy_internal.',
      invalid_legacy_invoice_count;
  end if;

  select count(*)
  into incomplete_invoice_assignment_count
  from public.school_request_invoices
  where invoice_provider is not null
    and (
      invoice_provider_assigned_at is null
      or invoice_cutover_version is null
    );

  if incomplete_invoice_assignment_count > 0 then
    raise exception
      'Foundation-Prüfung: % Rechnung(en) haben eine unvollständige Provider-Zuordnung.',
      incomplete_invoice_assignment_count;
  end if;

  select count(*)
  into incomplete_request_assignment_count
  from public.school_requests
  where invoice_provider is not null
    and (
      invoice_provider_assigned_at is null
      or invoice_cutover_version is null
      or checkout_committed_at is null
    );

  if incomplete_request_assignment_count > 0 then
    raise exception
      'Foundation-Prüfung: % Anfrage(n) haben eine unvollständige Provider-Zuordnung.',
      incomplete_request_assignment_count;
  end if;

  select count(*)
  into incomplete_legacy_snapshot_count
  from public.school_request_invoices
  where invoice_provider = 'legacy_internal'
    and (
      seller_legal_name_snapshot is null
      or seller_owner_name_snapshot is null
      or seller_street_snapshot is null
      or seller_postal_code_snapshot is null
      or seller_city_snapshot is null
      or seller_tax_number_snapshot is null
      or seller_vat_id_snapshot is null
      or bank_account_holder_snapshot is null
      or bank_name_snapshot is null
      or bank_iban_snapshot is null
      or bank_bic_snapshot is null
    );

  if incomplete_legacy_snapshot_count > 0 then
    raise exception
      'Foundation-Prüfung: % Legacy-Rechnung(en) haben unvollständige Verkäufer- oder Banksnapshots.',
      incomplete_legacy_snapshot_count;
  end if;
end
$$;

commit;

select jsonb_pretty(
  jsonb_build_object(
    'foundation_version',
      'invoice-provider-cutover-foundation-v1',

    'checked_at',
      now(),

    'database_timezone',
      current_setting('TimeZone'),

    'settings',
      (
        select jsonb_build_object(
          'timezone_name',
            timezone_name,
          'invoice_cutover_at',
            invoice_cutover_at,
          'invoice_provider_before',
            invoice_provider_before,
          'invoice_provider_after',
            invoice_provider_after,
          'invoice_cutover_version',
            invoice_cutover_version,
          'lexware_production_organization_id',
            lexware_production_organization_id,
          'lexware_test_organization_id',
            lexware_test_organization_id,
          'lexware_production_write_enabled',
            lexware_production_write_enabled,
          'lexware_automatic_mail_enabled',
            lexware_automatic_mail_enabled,
          'bank_transfer_qr_enabled',
            bank_transfer_qr_enabled
        )
        from public.business_runtime_settings
        where id = 'default'
      ),

    'invoice_provider_counts',
      (
        select coalesce(
          jsonb_object_agg(provider_key, provider_count),
          '{}'::jsonb
        )
        from (
          select
            coalesce(invoice_provider, '(null)') as provider_key,
            count(*)::integer as provider_count
          from public.school_request_invoices
          group by coalesce(invoice_provider, '(null)')
        ) grouped
      ),

    'request_provider_counts',
      (
        select coalesce(
          jsonb_object_agg(provider_key, provider_count),
          '{}'::jsonb
        )
        from (
          select
            coalesce(invoice_provider, '(null)') as provider_key,
            count(*)::integer as provider_count
          from public.school_requests
          group by coalesce(invoice_provider, '(null)')
        ) grouped
      ),

    'unassigned_invoice_count',
      (
        select count(*)::integer
        from public.school_request_invoices
        where invoice_provider is null
      ),

    'legacy_snapshot_complete_count',
      (
        select count(*)::integer
        from public.school_request_invoices
        where invoice_provider = 'legacy_internal'
          and seller_legal_name_snapshot is not null
          and seller_tax_number_snapshot is not null
          and seller_vat_id_snapshot is not null
          and bank_iban_snapshot is not null
          and bank_bic_snapshot is not null
      ),

    'provider_assignment_rpc_exists',
      to_regprocedure(
        'public.assign_school_request_invoice_provider(uuid)'
      ) is not null,

    'production_writes_active',
      (
        select lexware_production_write_enabled
        from public.business_runtime_settings
        where id = 'default'
      ),

    'automatic_invoice_mail_active',
      (
        select lexware_automatic_mail_enabled
        from public.business_runtime_settings
        where id = 'default'
      )
  )
) as invoice_provider_cutover_foundation_result;
