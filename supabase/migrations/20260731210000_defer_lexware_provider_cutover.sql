begin;

-- Keep the existing tax-snapshot deadline while deferring the
-- invoice-provider transition until the complete Lexware workflow exists.
-- This migration creates no jobs and changes no existing invoices.

do $$
declare
  settings_row public.business_runtime_settings%rowtype;
begin
  select *
  into settings_row
  from public.business_runtime_settings
  where id = 'default'
  for update;

  if not found then
    raise exception 'business_runtime_settings/default fehlt.';
  end if;

  if settings_row.timezone_name <> 'Europe/Berlin'
     or settings_row.invoice_cutover_at <>
       '2026-07-31T22:00:00.000Z'::timestamptz
     or settings_row.invoice_provider_before <> 'legacy_internal'
     or settings_row.invoice_provider_after not in (
       'legacy_internal',
       'lexware'
     )
     or settings_row.invoice_cutover_version <>
       'invoice-cutover-2026-08-01-v1' then
    raise exception
      'Die bestehende Cutover-Konfiguration entspricht nicht der erwarteten Ausgangslage.';
  end if;
end
$$;

alter table public.business_runtime_settings
  drop constraint if exists
    business_runtime_settings_transition_check;

alter table public.business_runtime_settings
  add constraint
    business_runtime_settings_transition_check
  check (
    invoice_provider_before = 'legacy_internal'
    and invoice_provider_after in (
      'legacy_internal',
      'lexware'
    )
  );

update public.business_runtime_settings
set
  invoice_provider_after = 'legacy_internal',
  lexware_production_write_enabled = false,
  lexware_production_write_enabled_at = null,
  lexware_automatic_mail_enabled = false,
  lexware_automatic_mail_enabled_at = null,
  notes =
    'Steuer-Snapshot-Cutover bleibt am 01.08.2026 aktiv; der Lexware-Provider-Cutover ist bis zur vollständigen automatischen Rechnungskette verschoben.'
where id = 'default';

commit;
