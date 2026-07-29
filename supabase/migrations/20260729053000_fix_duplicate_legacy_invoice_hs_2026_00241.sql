begin;

-- ============================================================
-- HANDZETTEL-SCHULEN.DE
-- HISTORISCHE DATENKORREKTUR
--
-- Anfrage:
-- HS-2026-00241
--
-- Gültige Rechnung:
-- HSR-2026-00005
-- 9e5d23b4-4d97-46c5-9438-b25375735165
--
-- Technische Dublette:
-- HSR-2026-00006
-- f53495c6-bb4b-4dca-864a-8804e52769f8
--
-- Korrekturprinzip:
-- - keine Rechnung löschen
-- - keine Rechnungsnummer wiederverwenden
-- - gültige PayPal-Rechnung unverändert lassen
-- - unversandten Entwurf nachvollziehbar stornieren
-- - Anfrage wieder mit der versandten und bezahlten Rechnung
--   verknüpfen
-- ============================================================

do $$
declare
  correction_version constant text :=
    'DUPLICATE_LEGACY_INVOICE_HS_2026_00241_V1';

  target_request public.school_requests%rowtype;
  canonical_invoice public.school_request_invoices%rowtype;
  duplicate_invoice public.school_request_invoices%rowtype;

  canonical_item_count integer;
  duplicate_item_count integer;
  duplicate_payment_event_count integer;

  canonical_total numeric;
  duplicate_total numeric;
begin
  -- ----------------------------------------------------------
  -- A. Zielanfrage exklusiv laden
  -- ----------------------------------------------------------

  select *
  into target_request
  from public.school_requests
  where request_number = 'HS-2026-00241'
  for update;

  if not found then
    raise exception
      'Korrektur abgebrochen: Anfrage HS-2026-00241 wurde nicht gefunden.';
  end if;

  if target_request.invoice_provider
      is distinct from 'legacy_internal' then
    raise exception
      'Korrektur abgebrochen: Anfrage verwendet nicht legacy_internal, sondern %.',
      target_request.invoice_provider;
  end if;

  -- ----------------------------------------------------------
  -- B. Gültige Rechnung prüfen
  -- ----------------------------------------------------------

  select *
  into canonical_invoice
  from public.school_request_invoices
  where id =
    '9e5d23b4-4d97-46c5-9438-b25375735165'::uuid
    and request_id = target_request.id
    and invoice_number = 'HSR-2026-00005'
  for update;

  if not found then
    raise exception
      'Korrektur abgebrochen: gültige Rechnung HSR-2026-00005 fehlt.';
  end if;

  if canonical_invoice.invoice_provider
      is distinct from 'legacy_internal' then
    raise exception
      'Korrektur abgebrochen: HSR-2026-00005 ist nicht legacy_internal.';
  end if;

  if canonical_invoice.invoice_status <> 'sent' then
    raise exception
      'Korrektur abgebrochen: HSR-2026-00005 hat Status % statt sent.',
      canonical_invoice.invoice_status;
  end if;

  if canonical_invoice.payment_status <> 'payment_received' then
    raise exception
      'Korrektur abgebrochen: HSR-2026-00005 hat Zahlungsstatus % statt payment_received.',
      canonical_invoice.payment_status;
  end if;

  if canonical_invoice.selected_payment_method <> 'paypal' then
    raise exception
      'Korrektur abgebrochen: HSR-2026-00005 verwendet nicht PayPal.';
  end if;

  if canonical_invoice.paypal_order_id is null then
    raise exception
      'Korrektur abgebrochen: HSR-2026-00005 besitzt keine PayPal-Order-ID.';
  end if;

  if canonical_invoice.paypal_capture_id is null then
    raise exception
      'Korrektur abgebrochen: HSR-2026-00005 besitzt keine PayPal-Capture-ID.';
  end if;

  if canonical_invoice.sent_at is null then
    raise exception
      'Korrektur abgebrochen: HSR-2026-00005 besitzt keinen Versandzeitpunkt.';
  end if;

  -- ----------------------------------------------------------
  -- C. Dublette prüfen
  -- ----------------------------------------------------------

  select *
  into duplicate_invoice
  from public.school_request_invoices
  where id =
    'f53495c6-bb4b-4dca-864a-8804e52769f8'::uuid
    and request_id = target_request.id
    and invoice_number = 'HSR-2026-00006'
  for update;

  if not found then
    raise exception
      'Korrektur abgebrochen: Dublette HSR-2026-00006 fehlt.';
  end if;

  if duplicate_invoice.invoice_provider
      is distinct from 'legacy_internal' then
    raise exception
      'Korrektur abgebrochen: HSR-2026-00006 ist nicht legacy_internal.';
  end if;

  if not (
    (
      duplicate_invoice.invoice_status = 'draft'
      and duplicate_invoice.payment_status = 'not_selected'
    )
    or
    (
      duplicate_invoice.invoice_status = 'cancelled'
      and duplicate_invoice.payment_status = 'cancelled'
    )
  ) then
    raise exception
      'Korrektur abgebrochen: HSR-2026-00006 besitzt unerwartete Statuswerte % / %.',
      duplicate_invoice.invoice_status,
      duplicate_invoice.payment_status;
  end if;

  if duplicate_invoice.paypal_order_id is not null then
    raise exception
      'Korrektur abgebrochen: HSR-2026-00006 besitzt unerwartet eine PayPal-Order-ID.';
  end if;

  if duplicate_invoice.paypal_capture_id is not null then
    raise exception
      'Korrektur abgebrochen: HSR-2026-00006 besitzt unerwartet eine PayPal-Capture-ID.';
  end if;

  if duplicate_invoice.sent_at is not null then
    raise exception
      'Korrektur abgebrochen: HSR-2026-00006 wurde offenbar versandt.';
  end if;

  if duplicate_invoice.paid_at is not null then
    raise exception
      'Korrektur abgebrochen: HSR-2026-00006 besitzt einen Zahlungszeitpunkt.';
  end if;

  -- ----------------------------------------------------------
  -- D. Positionen, Beträge und Zahlungsereignisse vergleichen
  -- ----------------------------------------------------------

  select count(*)::integer
  into canonical_item_count
  from public.school_request_invoice_items
  where invoice_id = canonical_invoice.id;

  select count(*)::integer
  into duplicate_item_count
  from public.school_request_invoice_items
  where invoice_id = duplicate_invoice.id;

  if canonical_item_count <= 0 then
    raise exception
      'Korrektur abgebrochen: HSR-2026-00005 besitzt keine Rechnungspositionen.';
  end if;

  if canonical_item_count <> duplicate_item_count then
    raise exception
      'Korrektur abgebrochen: Positionszahlen unterscheiden sich: % / %.',
      canonical_item_count,
      duplicate_item_count;
  end if;

  canonical_total :=
    coalesce(canonical_invoice.total_amount, 0);

  duplicate_total :=
    coalesce(duplicate_invoice.total_amount, 0);

  if canonical_total <= 0 then
    raise exception
      'Korrektur abgebrochen: HSR-2026-00005 besitzt keinen gültigen Gesamtbetrag.';
  end if;

  if abs(canonical_total - duplicate_total) > 0.001 then
    raise exception
      'Korrektur abgebrochen: Rechnungsbeträge unterscheiden sich: % / %.',
      canonical_total,
      duplicate_total;
  end if;

  select count(*)::integer
  into duplicate_payment_event_count
  from public.school_request_payment_events
  where invoice_id = duplicate_invoice.id;

  if duplicate_payment_event_count <> 0 then
    raise exception
      'Korrektur abgebrochen: HSR-2026-00006 besitzt % Zahlungsereignis(se).',
      duplicate_payment_event_count;
  end if;

  -- ----------------------------------------------------------
  -- E. Aktuellen Anfragezustand absichern
  -- ----------------------------------------------------------

  if target_request.latest_invoice_id not in (
    canonical_invoice.id,
    duplicate_invoice.id
  ) then
    raise exception
      'Korrektur abgebrochen: latest_invoice_id zeigt auf eine unerwartete Rechnung: %.',
      target_request.latest_invoice_id;
  end if;

  if target_request.latest_invoice_id = duplicate_invoice.id
     and (
       target_request.invoice_status is distinct from 'draft'
       or target_request.payment_status is distinct from 'not_selected'
     ) then
    raise exception
      'Korrektur abgebrochen: Anfrage zeigt zwar auf HSR-2026-00006, besitzt aber unerwartete Statuswerte % / %.',
      target_request.invoice_status,
      target_request.payment_status;
  end if;

  -- ----------------------------------------------------------
  -- F. Dublette nachvollziehbar stornieren
  -- ----------------------------------------------------------

  update public.school_request_invoices
  set
    invoice_status = 'cancelled',
    payment_status = 'cancelled',

    cancelled_at = coalesce(
      cancelled_at,
      clock_timestamp()
    ),

    admin_note = case
      when position(
        correction_version
        in coalesce(admin_note, '')
      ) > 0
        then admin_note

      else concat_ws(
        E'\n',
        nullif(btrim(admin_note), ''),
        correction_version ||
        ': Unversandte technische Dublette von HSR-2026-00005. ' ||
        'Keine PayPal-Order, kein Capture und kein Zahlungsereignis. ' ||
        'Rechnungsnummer und Positionen bleiben zur Nachvollziehbarkeit erhalten.'
      )
    end,

    updated_at = clock_timestamp()

  where id = duplicate_invoice.id;

  -- ----------------------------------------------------------
  -- G. Anfrage wieder auf die gültige Rechnung setzen
  -- ----------------------------------------------------------

  update public.school_requests
  set
    invoice_status =
      canonical_invoice.invoice_status,

    payment_status =
      canonical_invoice.payment_status,

    selected_payment_method =
      canonical_invoice.selected_payment_method,

    latest_invoice_id =
      canonical_invoice.id,

    invoice_sent_at = coalesce(
      canonical_invoice.sent_at,
      invoice_sent_at
    ),

    payment_received_at = coalesce(
      canonical_invoice.paid_at,
      payment_received_at
    ),

    payment_due_at =
      canonical_invoice.payment_due_at,

    cash_pickup_due_at =
      canonical_invoice.cash_pickup_due_at,

    shipping_amount =
      canonical_invoice.shipping_amount,

    invoice_total_amount =
      canonical_invoice.total_amount,

    contains_books =
      canonical_invoice.contains_books,

    book_shipping_amount =
      canonical_invoice.book_shipping_amount,

    book_cover_amount =
      canonical_invoice.book_cover_amount,

    discount_campaign_id =
      canonical_invoice.discount_campaign_id,

    discount_amount =
      canonical_invoice.discount_amount,

    updated_at =
      clock_timestamp()

  where id = target_request.id;

  -- ----------------------------------------------------------
  -- H. Audit-Ereignis einmalig speichern
  -- ----------------------------------------------------------

  insert into public.school_request_events (
    request_id,
    event_type,
    title,
    description,
    metadata,
    created_at
  )
  select
    target_request.id,

    'duplicate_legacy_invoice_cancelled',

    'Doppelte Legacy-Rechnung technisch storniert',

    'Die unversandte Dublette HSR-2026-00006 wurde technisch storniert. ' ||
    'Die Anfrage verweist wieder auf die versandte und bezahlte Rechnung ' ||
    'HSR-2026-00005.',

    jsonb_build_object(
      'correction_version',
        correction_version,

      'canonical_invoice_id',
        canonical_invoice.id,

      'canonical_invoice_number',
        canonical_invoice.invoice_number,

      'cancelled_duplicate_invoice_id',
        duplicate_invoice.id,

      'cancelled_duplicate_invoice_number',
        duplicate_invoice.invoice_number,

      'canonical_item_count',
        canonical_item_count,

      'duplicate_item_count',
        duplicate_item_count,

      'total_amount',
        canonical_total,

      'reason',
        'later_unpaid_unmailed_duplicate_draft'
    ),

    clock_timestamp()

  where not exists (
    select 1
    from public.school_request_events event_row
    where event_row.request_id = target_request.id
      and event_row.event_type =
        'duplicate_legacy_invoice_cancelled'
      and event_row.metadata
        ->> 'correction_version' =
        correction_version
  );
end
$$;

-- ============================================================
-- Datenbankschutz:
-- Pro Anfrage darf höchstens eine nicht stornierte interne
-- Rechnung existieren.
--
-- Eine stornierte Rechnung bleibt historisch erhalten.
-- Danach kann kontrolliert eine neue Rechnung entstehen.
-- ============================================================

create unique index if not exists
  school_request_invoices_one_active_per_request_idx
on public.school_request_invoices (
  request_id
)
where invoice_status in (
  'draft',
  'sent'
);

comment on index
  public.school_request_invoices_one_active_per_request_idx
is
  'Verhindert mehrere gleichzeitig aktive Rechnungen je Anfrage. Stornierte Rechnungen bleiben historisch erhalten.';

-- ============================================================
-- Selbstprüfung
-- ============================================================

do $$
declare
  target_request_id uuid;
  canonical_invoice_id uuid :=
    '9e5d23b4-4d97-46c5-9438-b25375735165'::uuid;

  duplicate_invoice_id uuid :=
    'f53495c6-bb4b-4dca-864a-8804e52769f8'::uuid;

  request_row public.school_requests%rowtype;
  canonical_row public.school_request_invoices%rowtype;
  duplicate_row public.school_request_invoices%rowtype;

  active_invoice_count integer;
  invalid_active_request_count integer;
  duplicate_payment_event_count integer;
  correction_event_count integer;
begin
  select id
  into target_request_id
  from public.school_requests
  where request_number = 'HS-2026-00241';

  if target_request_id is null then
    raise exception
      'Selbstprüfung: Anfrage HS-2026-00241 fehlt.';
  end if;

  select *
  into request_row
  from public.school_requests
  where id = target_request_id;

  select *
  into canonical_row
  from public.school_request_invoices
  where id = canonical_invoice_id;

  select *
  into duplicate_row
  from public.school_request_invoices
  where id = duplicate_invoice_id;

  if request_row.latest_invoice_id <> canonical_invoice_id then
    raise exception
      'Selbstprüfung: Anfrage zeigt nicht auf HSR-2026-00005.';
  end if;

  if request_row.invoice_status <> 'sent' then
    raise exception
      'Selbstprüfung: Anfrage besitzt Rechnungsstatus % statt sent.',
      request_row.invoice_status;
  end if;

  if request_row.payment_status <> 'payment_received' then
    raise exception
      'Selbstprüfung: Anfrage besitzt Zahlungsstatus % statt payment_received.',
      request_row.payment_status;
  end if;

  if request_row.selected_payment_method <> 'paypal' then
    raise exception
      'Selbstprüfung: Anfrage besitzt nicht die Zahlungsart PayPal.';
  end if;

  if canonical_row.invoice_status <> 'sent'
     or canonical_row.payment_status <> 'payment_received' then
    raise exception
      'Selbstprüfung: HSR-2026-00005 wurde unerwartet verändert.';
  end if;

  if canonical_row.paypal_order_id is null
     or canonical_row.paypal_capture_id is null then
    raise exception
      'Selbstprüfung: PayPal-Identität von HSR-2026-00005 fehlt.';
  end if;

  if duplicate_row.invoice_status <> 'cancelled'
     or duplicate_row.payment_status <> 'cancelled'
     or duplicate_row.cancelled_at is null then
    raise exception
      'Selbstprüfung: HSR-2026-00006 wurde nicht vollständig storniert.';
  end if;

  select count(*)::integer
  into active_invoice_count
  from public.school_request_invoices
  where request_id = target_request_id
    and invoice_status in ('draft', 'sent');

  if active_invoice_count <> 1 then
    raise exception
      'Selbstprüfung: Anfrage besitzt % aktive Rechnungen statt 1.',
      active_invoice_count;
  end if;

  select count(*)::integer
  into invalid_active_request_count
  from (
    select request_id
    from public.school_request_invoices
    where invoice_status in ('draft', 'sent')
    group by request_id
    having count(*) > 1
  ) invalid_requests;

  if invalid_active_request_count <> 0 then
    raise exception
      'Selbstprüfung: % Anfrage(n) besitzen weiterhin mehrere aktive Rechnungen.',
      invalid_active_request_count;
  end if;

  select count(*)::integer
  into duplicate_payment_event_count
  from public.school_request_payment_events
  where invoice_id = duplicate_invoice_id;

  if duplicate_payment_event_count <> 0 then
    raise exception
      'Selbstprüfung: Dublette besitzt unerwartete Zahlungsereignisse.';
  end if;

  select count(*)::integer
  into correction_event_count
  from public.school_request_events
  where request_id = target_request_id
    and event_type =
      'duplicate_legacy_invoice_cancelled'
    and metadata
      ->> 'correction_version' =
      'DUPLICATE_LEGACY_INVOICE_HS_2026_00241_V1';

  if correction_event_count <> 1 then
    raise exception
      'Selbstprüfung: Erwartet wurde exakt ein Korrekturereignis, gefunden wurden %.',
      correction_event_count;
  end if;

  if to_regclass(
    'public.school_request_invoices_one_active_per_request_idx'
  ) is null then
    raise exception
      'Selbstprüfung: Schutzindex fehlt.';
  end if;
end
$$;

commit;

-- ============================================================
-- Kompaktes Endergebnis
-- ============================================================

with target_request as (
  select *
  from public.school_requests
  where request_number = 'HS-2026-00241'
),

target_invoices as (
  select invoice.*
  from public.school_request_invoices invoice
  inner join target_request request_row
    on request_row.id = invoice.request_id
),

result_data as (
  select
    request_row.id as request_id,

    request_row.request_number,

    request_row.latest_invoice_id,

    request_row.invoice_status as request_invoice_status,

    request_row.payment_status as request_payment_status,

    request_row.selected_payment_method,

    (
      select invoice.invoice_number
      from target_invoices invoice
      where invoice.id =
        request_row.latest_invoice_id
      limit 1
    ) as latest_invoice_number,

    (
      select count(*)::integer
      from target_invoices invoice
      where invoice.invoice_status in (
        'draft',
        'sent'
      )
    ) as active_invoice_count,

    (
      select count(*)::integer
      from public.school_request_events event_row
      where event_row.request_id =
        request_row.id
        and event_row.event_type =
          'duplicate_legacy_invoice_cancelled'
        and event_row.metadata
          ->> 'correction_version' =
          'DUPLICATE_LEGACY_INVOICE_HS_2026_00241_V1'
    ) as correction_event_count

  from target_request request_row
)

select jsonb_pretty(
  jsonb_build_object(
    'correction_version',
      'DUPLICATE_LEGACY_INVOICE_HS_2026_00241_V1',

    'checked_at',
      now(),

    'request',
      (
        select jsonb_build_object(
          'request_number',
            result.request_number,

          'latest_invoice_id',
            result.latest_invoice_id,

          'latest_invoice_number',
            result.latest_invoice_number,

          'invoice_status',
            result.request_invoice_status,

          'payment_status',
            result.request_payment_status,

          'selected_payment_method',
            result.selected_payment_method,

          'active_invoice_count',
            result.active_invoice_count
        )
        from result_data result
      ),

    'invoices',
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',
              invoice.id,

            'invoice_number',
              invoice.invoice_number,

            'invoice_status',
              invoice.invoice_status,

            'payment_status',
              invoice.payment_status,

            'selected_payment_method',
              invoice.selected_payment_method,

            'sent_at',
              invoice.sent_at,

            'paid_at',
              invoice.paid_at,

            'cancelled_at',
              invoice.cancelled_at,

            'paypal_order_id_present',
              invoice.paypal_order_id is not null,

            'paypal_capture_id_present',
              invoice.paypal_capture_id is not null,

            'is_latest_invoice',
              invoice.id = (
                select latest_invoice_id
                from target_request
              )
          )
          order by
            invoice.created_at,
            invoice.invoice_number
        )
        from target_invoices invoice
      ),

    'protection',
      jsonb_build_object(
        'unique_active_invoice_index_exists',
          to_regclass(
            'public.school_request_invoices_one_active_per_request_idx'
          ) is not null,

        'requests_with_multiple_active_invoices',
          (
            select count(*)::integer
            from (
              select request_id
              from public.school_request_invoices
              where invoice_status in (
                'draft',
                'sent'
              )
              group by request_id
              having count(*) > 1
            ) invalid_requests
          ),

        'correction_event_count',
          (
            select correction_event_count
            from result_data
          )
      ),

    'all_checks_passed',
      (
        select
          result.latest_invoice_number =
            'HSR-2026-00005'

          and result.request_invoice_status =
            'sent'

          and result.request_payment_status =
            'payment_received'

          and result.selected_payment_method =
            'paypal'

          and result.active_invoice_count =
            1

          and result.correction_event_count =
            1

          and to_regclass(
            'public.school_request_invoices_one_active_per_request_idx'
          ) is not null

          and (
            select invoice.invoice_status
            from target_invoices invoice
            where invoice.invoice_number =
              'HSR-2026-00006'
          ) = 'cancelled'

          and (
            select invoice.payment_status
            from target_invoices invoice
            where invoice.invoice_number =
              'HSR-2026-00006'
          ) = 'cancelled'

        from result_data result
      )
  )
) as duplicate_legacy_invoice_correction_result;
