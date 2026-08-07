begin;

drop function public.stage_native_lexware_checkout_invoice(jsonb,jsonb,jsonb,text,text);

create function public.stage_native_lexware_checkout_invoice(
  p_invoice jsonb,
  p_items jsonb,
  p_payload_snapshot jsonb,
  p_payload_sha256 text,
  p_payload_hash_version text
)
returns table (
  invoice_id uuid,
  invoice_number text,
  invoice_token text,
  invoice_status text,
  payment_status text,
  invoice_job_id uuid,
  job_status text,
  job_creation_state text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  settings_row public.business_runtime_settings%rowtype;
  invoice_row public.school_request_invoices%rowtype;
  item_value jsonb;
  item_row public.school_request_invoice_items%rowtype;
  job_row public.school_lexware_invoice_jobs%rowtype;
  expected_item_count integer;
  inserted_item_count integer := 0;
  idempotency_value text;
begin
  if p_invoice is null or jsonb_typeof(p_invoice) <> 'object' then raise exception 'NATIVE_INVOICE_PAYLOAD_INVALID'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then raise exception 'NATIVE_INVOICE_ITEMS_INVALID'; end if;
  if p_payload_snapshot is null or jsonb_typeof(p_payload_snapshot) <> 'object' then raise exception 'NATIVE_LEXWARE_PAYLOAD_INVALID'; end if;
  if p_payload_hash_version is distinct from 'lexware-payload-canonical-v2' then raise exception 'NATIVE_PAYLOAD_HASH_VERSION_INVALID'; end if;
  if p_payload_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'NATIVE_PAYLOAD_SHA256_INVALID'; end if;

  select * into settings_row from public.business_runtime_settings where id = 'default' for share;
  if not found then raise exception 'RUNTIME_SETTINGS_MISSING'; end if;
  if settings_row.invoice_provider_after <> 'lexware' then raise exception 'NATIVE_PROVIDER_CUTOVER_INACTIVE'; end if;
  if nullif(btrim(settings_row.lexware_production_organization_id), '') is null
     or nullif(btrim(settings_row.lexware_production_credential_alias), '') is null then
    raise exception 'NATIVE_TARGET_CONFIGURATION_MISSING';
  end if;

  invoice_row := jsonb_populate_record(null::public.school_request_invoices, p_invoice);
  if invoice_row.id is null or invoice_row.request_id is null then raise exception 'NATIVE_INVOICE_IDENTITY_MISSING'; end if;
  if invoice_row.invoice_provider is distinct from 'lexware' then raise exception 'NATIVE_INVOICE_PROVIDER_INVALID'; end if;
  if invoice_row.invoice_cutover_version is distinct from settings_row.invoice_cutover_version then raise exception 'NATIVE_CUTOVER_VERSION_MISMATCH'; end if;
  if invoice_row.tax_snapshot_status is distinct from 'complete'
     or invoice_row.tax_snapshot_version is distinct from 'invoice-tax-snapshot-v2'
     or invoice_row.tax_snapshot_source is distinct from 'product_catalog_at_checkout'
     or invoice_row.tax_snapshot_at is null
     or invoice_row.tax_breakdown_snapshot is null then
    raise exception 'NATIVE_INVOICE_V2_SNAPSHOT_INVALID';
  end if;
  if invoice_row.lexware_invoice_job_id is not null
     or invoice_row.lexware_organization_id is not null
     or invoice_row.lexware_invoice_id is not null
     or invoice_row.lexware_invoice_number is not null
     or invoice_row.lexware_created_at is not null
     or invoice_row.lexware_finalized_at is not null then
    raise exception 'NATIVE_INVOICE_MUST_BE_PREPARED';
  end if;

  insert into public.school_request_invoices (
    id, request_id, invoice_number, invoice_status, payment_status,
    selected_payment_method, payment_provider, subtotal_amount, shipping_amount,
    contains_books, book_shipping_amount, book_cover_amount,
    discount_campaign_id, discount_name, discount_type, discount_value, discount_amount,
    total_amount, currency,
    bank_snapshot_version, bank_account_holder_snapshot, bank_name_snapshot,
    bank_iban_snapshot, bank_bic_snapshot, bank_payment_purpose_snapshot,
    seller_snapshot_version, seller_legal_name_snapshot, seller_trade_name_snapshot,
    seller_owner_name_snapshot, seller_street_snapshot, seller_postal_code_snapshot,
    seller_city_snapshot, seller_country_snapshot, seller_tax_number_snapshot,
    seller_vat_id_snapshot, seller_email_snapshot, seller_phone_snapshot,
    seller_website_snapshot, invoice_provider, invoice_provider_assigned_at,
    invoice_cutover_version, tax_snapshot_status, tax_snapshot_source,
    tax_snapshot_version, tax_snapshot_at, tax_breakdown_snapshot,
    subtotal_net_amount_snapshot, subtotal_tax_amount_snapshot,
    shipping_net_amount_snapshot, shipping_tax_amount_snapshot,
    book_shipping_net_amount_snapshot, book_shipping_tax_amount_snapshot,
    book_cover_net_amount_snapshot, book_cover_tax_amount_snapshot,
    discount_net_amount_snapshot, discount_tax_amount_snapshot,
    total_net_amount_snapshot, total_tax_amount_snapshot,
    customer_name_snapshot, customer_email_snapshot, customer_phone_snapshot,
    billing_name_snapshot, billing_email_snapshot, billing_phone_snapshot,
    billing_street_snapshot, billing_postal_code_snapshot, billing_city_snapshot,
    shipping_address_differs_snapshot, shipping_name_snapshot, shipping_street_snapshot,
    shipping_postal_code_snapshot, shipping_city_snapshot, child_name_snapshot,
    school_name_snapshot, class_name_snapshot, fulfillment_method_snapshot,
    pickup_location_label_snapshot, pickup_address_snapshot, admin_note
  ) values (
    invoice_row.id, invoice_row.request_id, invoice_row.invoice_number,
    invoice_row.invoice_status, invoice_row.payment_status,
    invoice_row.selected_payment_method, invoice_row.payment_provider,
    invoice_row.subtotal_amount, invoice_row.shipping_amount,
    invoice_row.contains_books, invoice_row.book_shipping_amount, invoice_row.book_cover_amount,
    invoice_row.discount_campaign_id, invoice_row.discount_name, invoice_row.discount_type,
    invoice_row.discount_value, invoice_row.discount_amount, invoice_row.total_amount,
    invoice_row.currency, invoice_row.bank_snapshot_version,
    invoice_row.bank_account_holder_snapshot, invoice_row.bank_name_snapshot,
    invoice_row.bank_iban_snapshot, invoice_row.bank_bic_snapshot,
    invoice_row.bank_payment_purpose_snapshot, invoice_row.seller_snapshot_version,
    invoice_row.seller_legal_name_snapshot, invoice_row.seller_trade_name_snapshot,
    invoice_row.seller_owner_name_snapshot, invoice_row.seller_street_snapshot,
    invoice_row.seller_postal_code_snapshot, invoice_row.seller_city_snapshot,
    invoice_row.seller_country_snapshot, invoice_row.seller_tax_number_snapshot,
    invoice_row.seller_vat_id_snapshot, invoice_row.seller_email_snapshot,
    invoice_row.seller_phone_snapshot, invoice_row.seller_website_snapshot,
    invoice_row.invoice_provider, invoice_row.invoice_provider_assigned_at,
    invoice_row.invoice_cutover_version, invoice_row.tax_snapshot_status,
    invoice_row.tax_snapshot_source, invoice_row.tax_snapshot_version,
    invoice_row.tax_snapshot_at, invoice_row.tax_breakdown_snapshot,
    invoice_row.subtotal_net_amount_snapshot, invoice_row.subtotal_tax_amount_snapshot,
    invoice_row.shipping_net_amount_snapshot, invoice_row.shipping_tax_amount_snapshot,
    invoice_row.book_shipping_net_amount_snapshot, invoice_row.book_shipping_tax_amount_snapshot,
    invoice_row.book_cover_net_amount_snapshot, invoice_row.book_cover_tax_amount_snapshot,
    invoice_row.discount_net_amount_snapshot, invoice_row.discount_tax_amount_snapshot,
    invoice_row.total_net_amount_snapshot, invoice_row.total_tax_amount_snapshot,
    invoice_row.customer_name_snapshot, invoice_row.customer_email_snapshot,
    invoice_row.customer_phone_snapshot, invoice_row.billing_name_snapshot,
    invoice_row.billing_email_snapshot, invoice_row.billing_phone_snapshot,
    invoice_row.billing_street_snapshot, invoice_row.billing_postal_code_snapshot,
    invoice_row.billing_city_snapshot, invoice_row.shipping_address_differs_snapshot,
    invoice_row.shipping_name_snapshot, invoice_row.shipping_street_snapshot,
    invoice_row.shipping_postal_code_snapshot, invoice_row.shipping_city_snapshot,
    invoice_row.child_name_snapshot, invoice_row.school_name_snapshot,
    invoice_row.class_name_snapshot, invoice_row.fulfillment_method_snapshot,
    invoice_row.pickup_location_label_snapshot, invoice_row.pickup_address_snapshot,
    invoice_row.admin_note
  ) returning * into invoice_row;

  expected_item_count := jsonb_array_length(p_items);
  for item_value in select value from jsonb_array_elements(p_items) loop
    if item_value->>'invoice_id' is distinct from invoice_row.id::text
       or item_value->>'request_id' is distinct from invoice_row.request_id::text
       or item_value->>'tax_snapshot_version' is distinct from 'invoice-tax-snapshot-v2'
       or item_value->>'tax_snapshot_source' is distinct from 'product_catalog_at_checkout' then
      raise exception 'NATIVE_INVOICE_ITEM_IDENTITY_INVALID';
    end if;
    item_row := jsonb_populate_record(null::public.school_request_invoice_items, item_value);
    insert into public.school_request_invoice_items (
      id, invoice_id, request_id, offer_item_id, product_id, product_name,
      product_sku, quantity, unit, unit_price, total_price,
      tax_rate_snapshot, product_gross_amount_snapshot,
      product_net_amount_snapshot, product_tax_amount_snapshot,
      tax_snapshot_source, tax_snapshot_version, tax_snapshot_at,
      book_cover_tax_rate_snapshot, book_cover_net_amount_snapshot,
      book_cover_tax_amount_snapshot, is_book_snapshot, book_isbn13_snapshot,
      book_cover_selected, book_cover_name_snapshot, book_cover_quantity,
      book_cover_unit_price, book_cover_total_price, source, notes
    ) values (
      item_row.id, item_row.invoice_id, item_row.request_id, item_row.offer_item_id,
      item_row.product_id, item_row.product_name, item_row.product_sku,
      item_row.quantity, item_row.unit, item_row.unit_price, item_row.total_price,
      item_row.tax_rate_snapshot, item_row.product_gross_amount_snapshot,
      item_row.product_net_amount_snapshot, item_row.product_tax_amount_snapshot,
      item_row.tax_snapshot_source, item_row.tax_snapshot_version,
      item_row.tax_snapshot_at, item_row.book_cover_tax_rate_snapshot,
      item_row.book_cover_net_amount_snapshot, item_row.book_cover_tax_amount_snapshot,
      item_row.is_book_snapshot, item_row.book_isbn13_snapshot,
      item_row.book_cover_selected, item_row.book_cover_name_snapshot,
      item_row.book_cover_quantity, item_row.book_cover_unit_price,
      item_row.book_cover_total_price, item_row.source, item_row.notes
    );
    inserted_item_count := inserted_item_count + 1;
  end loop;
  if inserted_item_count <> expected_item_count then raise exception 'NATIVE_INVOICE_ITEM_COUNT_MISMATCH'; end if;

  idempotency_value := 'lexware:native-checkout-invoice:' || invoice_row.id::text || ':v1';
  insert into public.school_lexware_invoice_jobs (
    request_id, local_invoice_id, idempotency_key, cutover_version,
    target_organization_id, credential_alias_snapshot, trigger_source,
    payment_method, payment_provider, status, creation_state, attempt_count,
    max_attempts, next_attempt_at, payload_snapshot, payload_sha256,
    payload_hash_version
  ) values (
    invoice_row.request_id, invoice_row.id, idempotency_value,
    invoice_row.invoice_cutover_version, settings_row.lexware_production_organization_id,
    settings_row.lexware_production_credential_alias, 'checkout_native_lexware',
    invoice_row.selected_payment_method, invoice_row.payment_provider,
    'pending', 'not_attempted', 0, settings_row.lexware_invoice_job_max_attempts,
    clock_timestamp(), p_payload_snapshot, p_payload_sha256,
    p_payload_hash_version
  ) returning * into job_row;

  update public.school_request_invoices
  set lexware_invoice_job_id = job_row.id,
      lexware_payload_snapshot = p_payload_snapshot
  where id = invoice_row.id
    and lexware_invoice_job_id is null;
  if not found then raise exception 'NATIVE_INVOICE_JOB_LINK_FAILED'; end if;

  return query select invoice_row.id, invoice_row.invoice_number,
    invoice_row.invoice_token, invoice_row.invoice_status, invoice_row.payment_status,
    job_row.id, job_row.status, job_row.creation_state;
end;
$$;

revoke all on function public.stage_native_lexware_checkout_invoice(jsonb,jsonb,jsonb,text,text)
  from public, anon, authenticated;
grant execute on function public.stage_native_lexware_checkout_invoice(jsonb,jsonb,jsonb,text,text)
  to service_role;

commit;
