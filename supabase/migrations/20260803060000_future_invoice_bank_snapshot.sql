-- Replaces the existing insert-trigger function. The existing trigger remains in use.
-- Existing invoice rows are intentionally untouched.
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
  bank_snapshot_field_count integer;
  seller_snapshot_field_count integer;
begin
  if new.invoice_provider is null then
    select invoice_provider, invoice_provider_assigned_at, invoice_cutover_version
    into request_provider, request_assigned_at, request_cutover_version
    from public.school_requests where id = new.request_id;

    if request_provider is null then
      perform public.assign_school_request_invoice_provider(new.request_id);
      select invoice_provider, invoice_provider_assigned_at, invoice_cutover_version
      into request_provider, request_assigned_at, request_cutover_version
      from public.school_requests where id = new.request_id;
    end if;

    new.invoice_provider := request_provider;
    new.invoice_provider_assigned_at := request_assigned_at;
    new.invoice_cutover_version := request_cutover_version;
  end if;

  if provider_was_missing and new.invoice_provider = 'lexware' then
    raise exception 'Der Lexware-Cutover ist aktiv. Der alte interne Rechnungs-Erzeugungspfad ist ab diesem Zeitpunkt gesperrt.';
  end if;

  bank_snapshot_field_count :=
    (case when nullif(btrim(new.bank_account_holder_snapshot), '') is not null then 1 else 0 end) +
    (case when nullif(btrim(new.bank_name_snapshot), '') is not null then 1 else 0 end) +
    (case when nullif(btrim(new.bank_iban_snapshot), '') is not null then 1 else 0 end) +
    (case when nullif(btrim(new.bank_bic_snapshot), '') is not null then 1 else 0 end);

  if bank_snapshot_field_count = 0 then
    new.bank_snapshot_version := 'bank-profile-2026-08-v1';
    new.bank_account_holder_snapshot := 'Röthig, Marius';
    new.bank_name_snapshot := 'Sparkasse Vogtland';
    new.bank_iban_snapshot := 'DE52870580000101072104';
    new.bank_bic_snapshot := 'WELADED1PLX';
  elsif bank_snapshot_field_count <> 4 then
    raise exception 'BANK_TRANSFER_SNAPSHOT_INCOMPLETE';
  end if;
  new.bank_payment_purpose_snapshot := coalesce(new.bank_payment_purpose_snapshot, new.invoice_number);

  seller_snapshot_field_count :=
    (case when nullif(btrim(new.seller_snapshot_version), '') is not null then 1 else 0 end) +
    (case when nullif(btrim(new.seller_legal_name_snapshot), '') is not null then 1 else 0 end) +
    (case when nullif(btrim(new.seller_trade_name_snapshot), '') is not null then 1 else 0 end) +
    (case when nullif(btrim(new.seller_owner_name_snapshot), '') is not null then 1 else 0 end) +
    (case when nullif(btrim(new.seller_street_snapshot), '') is not null then 1 else 0 end) +
    (case when nullif(btrim(new.seller_postal_code_snapshot), '') is not null then 1 else 0 end) +
    (case when nullif(btrim(new.seller_city_snapshot), '') is not null then 1 else 0 end) +
    (case when nullif(btrim(new.seller_country_snapshot), '') is not null then 1 else 0 end) +
    (case when nullif(btrim(new.seller_tax_number_snapshot), '') is not null then 1 else 0 end) +
    (case when nullif(btrim(new.seller_vat_id_snapshot), '') is not null then 1 else 0 end) +
    (case when nullif(btrim(new.seller_email_snapshot), '') is not null then 1 else 0 end) +
    (case when nullif(btrim(new.seller_phone_snapshot), '') is not null then 1 else 0 end) +
    (case when nullif(btrim(new.seller_website_snapshot), '') is not null then 1 else 0 end);

  if seller_snapshot_field_count = 0 then
    new.seller_snapshot_version := 'business-profile-2026-08-v1';
    new.seller_legal_name_snapshot := 'BSS Vogtland';
    new.seller_trade_name_snapshot := 'Handzettel-Schulen.de';
    new.seller_owner_name_snapshot := 'Marius Röthig';
    new.seller_street_snapshot := 'Heinrich-Heine-Str. 2';
    new.seller_postal_code_snapshot := '08547';
    new.seller_city_snapshot := 'Jößnitz';
    new.seller_country_snapshot := 'Deutschland';
    new.seller_tax_number_snapshot := '223/263/09459';
    new.seller_vat_id_snapshot := 'DE346183832';
    new.seller_email_snapshot := 'kontakt@bss-vogtland.de';
    new.seller_phone_snapshot := '03765 16175';
    new.seller_website_snapshot := 'www.handzettel-schulen.de';
  elsif seller_snapshot_field_count <> 13 then
    raise exception 'SELLER_SNAPSHOT_INCOMPLETE';
  end if;

  if new.invoice_provider = 'legacy_internal' then

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
        'version', 'legacy-payment-profile-v1',
        'selected_payment_method', new.selected_payment_method,
        'payment_provider', new.payment_provider
      )
    );
  end if;

  return new;
end;
$$;

comment on function public.set_school_request_invoice_provider_on_insert() is
  'Assigns the invoice provider and immutable seller/payment snapshots. Bank and seller fallbacks apply only when their complete snapshot is missing; partial snapshots are rejected.';
