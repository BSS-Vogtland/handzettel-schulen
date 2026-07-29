-- ============================================================
-- HANDZETTEL-SCHULEN.DE
-- INVOICE_TAX_SNAPSHOT_FOUNDATION_V1
--
-- Additive Grundlage für unveränderliche Steuer-Snapshots:
-- - Produktpositionen
-- - optionale Buchhüllen
-- - Versand und Buchversand
-- - Rabatte
-- - Rechnungs-Gesamtsummen
--
-- WICHTIG:
-- - kein historischer Backfill
-- - keine Lexware-Schreiboperation
-- - kein Mailversand
-- - Legacy-Checkout bleibt vorübergehend kompatibel
-- ============================================================

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $prerequisites$
begin
  if to_regclass(
    'public.school_request_invoice_items'
  ) is null then
    raise exception
      'Pflichttabelle public.school_request_invoice_items fehlt.';
  end if;

  if to_regclass(
    'public.school_request_invoices'
  ) is null then
    raise exception
      'Pflichttabelle public.school_request_invoices fehlt.';
  end if;

  if to_regclass(
    'public.school_products'
  ) is null then
    raise exception
      'Pflichttabelle public.school_products fehlt.';
  end if;

  if to_regclass(
    'public.business_runtime_settings'
  ) is null then
    raise exception
      'Pflichttabelle public.business_runtime_settings fehlt.';
  end if;
end
$prerequisites$;

-- ============================================================
-- 1. STEUER-SNAPSHOTS JE RECHNUNGSPOSITION
-- ============================================================

alter table public.school_request_invoice_items
  add column if not exists
    tax_rate_snapshot smallint,

  add column if not exists
    product_gross_amount_snapshot numeric(14, 2),

  add column if not exists
    product_net_amount_snapshot numeric(14, 2),

  add column if not exists
    product_tax_amount_snapshot numeric(14, 2),

  add column if not exists
    tax_snapshot_source text,

  add column if not exists
    tax_snapshot_version text,

  add column if not exists
    tax_snapshot_at timestamptz,

  add column if not exists
    book_cover_tax_rate_snapshot smallint,

  add column if not exists
    book_cover_net_amount_snapshot numeric(14, 2),

  add column if not exists
    book_cover_tax_amount_snapshot numeric(14, 2);

comment on column
  public.school_request_invoice_items.tax_rate_snapshot
is
  'Umsatzsteuersatz der Produktposition zum Rechnungszeitpunkt. Derzeit werden 7 und 19 Prozent unterstützt. Historische Zeilen werden nicht aus aktuellen Produktdaten befüllt.';

comment on column
  public.school_request_invoice_items.product_gross_amount_snapshot
is
  'Brutto-Gesamtbetrag der Produktposition vor einem rechnungsweiten Rabatt.';

comment on column
  public.school_request_invoice_items.product_net_amount_snapshot
is
  'Netto-Gesamtbetrag der Produktposition vor einem rechnungsweiten Rabatt.';

comment on column
  public.school_request_invoice_items.product_tax_amount_snapshot
is
  'Umsatzsteuerbetrag der Produktposition vor einem rechnungsweiten Rabatt.';

comment on column
  public.school_request_invoice_items.tax_snapshot_source
is
  'Technische Quelle des Steuer-Snapshots, beispielsweise product_catalog_at_checkout.';

comment on column
  public.school_request_invoice_items.tax_snapshot_version
is
  'Version der verwendeten Steuerberechnung und Snapshotlogik.';

comment on column
  public.school_request_invoice_items.tax_snapshot_at
is
  'Zeitpunkt, zu dem der Steuer-Snapshot der Rechnungsposition erzeugt wurde.';

comment on column
  public.school_request_invoice_items.book_cover_tax_rate_snapshot
is
  'Umsatzsteuersatz einer optionalen Buchhülle zum Rechnungszeitpunkt.';

comment on column
  public.school_request_invoice_items.book_cover_net_amount_snapshot
is
  'Netto-Gesamtbetrag der Buchhülle oder Buchhüllen dieser Rechnungsposition.';

comment on column
  public.school_request_invoice_items.book_cover_tax_amount_snapshot
is
  'Umsatzsteuerbetrag der Buchhülle oder Buchhüllen dieser Rechnungsposition.';

-- ============================================================
-- 2. STEUERZUSAMMENFASSUNG JE RECHNUNG
-- ============================================================

alter table public.school_request_invoices
  add column if not exists
    tax_snapshot_status text,

  add column if not exists
    tax_snapshot_source text,

  add column if not exists
    tax_snapshot_version text,

  add column if not exists
    tax_snapshot_at timestamptz,

  add column if not exists
    tax_breakdown_snapshot jsonb,

  add column if not exists
    subtotal_net_amount_snapshot numeric(14, 2),

  add column if not exists
    subtotal_tax_amount_snapshot numeric(14, 2),

  add column if not exists
    shipping_net_amount_snapshot numeric(14, 2),

  add column if not exists
    shipping_tax_amount_snapshot numeric(14, 2),

  add column if not exists
    book_shipping_net_amount_snapshot numeric(14, 2),

  add column if not exists
    book_shipping_tax_amount_snapshot numeric(14, 2),

  add column if not exists
    book_cover_net_amount_snapshot numeric(14, 2),

  add column if not exists
    book_cover_tax_amount_snapshot numeric(14, 2),

  add column if not exists
    discount_net_amount_snapshot numeric(14, 2),

  add column if not exists
    discount_tax_amount_snapshot numeric(14, 2),

  add column if not exists
    total_net_amount_snapshot numeric(14, 2),

  add column if not exists
    total_tax_amount_snapshot numeric(14, 2);

comment on column
  public.school_request_invoices.tax_snapshot_status
is
  'Status des Rechnungs-Steuersnapshots: building, complete, blocked oder legacy_unavailable. NULL kennzeichnet historische beziehungsweise noch nicht verarbeitete Rechnungen.';

comment on column
  public.school_request_invoices.tax_snapshot_source
is
  'Technische Quelle der Rechnungssteuerberechnung.';

comment on column
  public.school_request_invoices.tax_snapshot_version
is
  'Version der Rechnungssteuer-, Versand- und Rabattverteilung.';

comment on column
  public.school_request_invoices.tax_snapshot_at
is
  'Zeitpunkt der Rechnungssteuerberechnung.';

comment on column
  public.school_request_invoices.tax_breakdown_snapshot
is
  'Kanonische JSON-Aufteilung nach Steuersatz und Komponenten wie Produkte, Buchhüllen, Versand, Buchversand und Rabatt.';

comment on column
  public.school_request_invoices.subtotal_net_amount_snapshot
is
  'Netto-Warenwert ohne Buchhüllen, Versand und Rechnungsrabatt.';

comment on column
  public.school_request_invoices.subtotal_tax_amount_snapshot
is
  'Umsatzsteuer des Warenwerts ohne Buchhüllen, Versand und Rechnungsrabatt.';

comment on column
  public.school_request_invoices.shipping_net_amount_snapshot
is
  'Nettoanteil der regulären Versandkosten.';

comment on column
  public.school_request_invoices.shipping_tax_amount_snapshot
is
  'Umsatzsteueranteil der regulären Versandkosten.';

comment on column
  public.school_request_invoices.book_shipping_net_amount_snapshot
is
  'Nettoanteil der separaten Buchversandkosten.';

comment on column
  public.school_request_invoices.book_shipping_tax_amount_snapshot
is
  'Umsatzsteueranteil der separaten Buchversandkosten.';

comment on column
  public.school_request_invoices.book_cover_net_amount_snapshot
is
  'Nettoanteil aller Buchhüllen der Rechnung.';

comment on column
  public.school_request_invoices.book_cover_tax_amount_snapshot
is
  'Umsatzsteueranteil aller Buchhüllen der Rechnung.';

comment on column
  public.school_request_invoices.discount_net_amount_snapshot
is
  'Nettoanteil der positiven Rabattminderung. Dieser Wert wird bei der Gesamtsumme abgezogen.';

comment on column
  public.school_request_invoices.discount_tax_amount_snapshot
is
  'Umsatzsteueranteil der positiven Rabattminderung. Dieser Wert wird von der Gesamtsteuer abgezogen.';

comment on column
  public.school_request_invoices.total_net_amount_snapshot
is
  'Gesamtnettobetrag nach Versand, Buchhüllen und Rabatt.';

comment on column
  public.school_request_invoices.total_tax_amount_snapshot
is
  'Gesamter Umsatzsteuerbetrag nach Versand, Buchhüllen und Rabatt.';

-- ============================================================
-- 3. CONSTRAINTS FÜR RECHNUNGSPOSITIONEN
-- ============================================================

do $invoice_item_constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname =
      'school_invoice_items_tax_rate_snapshot_check'
      and conrelid =
        'public.school_request_invoice_items'::regclass
  ) then
    alter table public.school_request_invoice_items
      add constraint
        school_invoice_items_tax_rate_snapshot_check
      check (
        tax_rate_snapshot is null
        or tax_rate_snapshot in (
          7,
          19
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname =
      'school_invoice_items_product_tax_nonnegative_check'
      and conrelid =
        'public.school_request_invoice_items'::regclass
  ) then
    alter table public.school_request_invoice_items
      add constraint
        school_invoice_items_product_tax_nonnegative_check
      check (
        (
          product_gross_amount_snapshot is null
          or product_gross_amount_snapshot >= 0
        )
        and
        (
          product_net_amount_snapshot is null
          or product_net_amount_snapshot >= 0
        )
        and
        (
          product_tax_amount_snapshot is null
          or product_tax_amount_snapshot >= 0
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname =
      'school_invoice_items_tax_snapshot_complete_check'
      and conrelid =
        'public.school_request_invoice_items'::regclass
  ) then
    alter table public.school_request_invoice_items
      add constraint
        school_invoice_items_tax_snapshot_complete_check
      check (
        (
          tax_rate_snapshot is null
          and product_gross_amount_snapshot is null
          and product_net_amount_snapshot is null
          and product_tax_amount_snapshot is null
          and tax_snapshot_source is null
          and tax_snapshot_version is null
          and tax_snapshot_at is null
        )
        or
        (
          tax_rate_snapshot is not null
          and product_gross_amount_snapshot is not null
          and product_net_amount_snapshot is not null
          and product_tax_amount_snapshot is not null
          and nullif(
            btrim(tax_snapshot_source),
            ''
          ) is not null
          and nullif(
            btrim(tax_snapshot_version),
            ''
          ) is not null
          and tax_snapshot_at is not null
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname =
      'school_invoice_items_product_tax_sum_check'
      and conrelid =
        'public.school_request_invoice_items'::regclass
  ) then
    alter table public.school_request_invoice_items
      add constraint
        school_invoice_items_product_tax_sum_check
      check (
        product_gross_amount_snapshot is null
        or
        (
          total_price is not null
          and abs(
            product_net_amount_snapshot
            + product_tax_amount_snapshot
            - product_gross_amount_snapshot
          ) <= 0.02
          and abs(
            product_gross_amount_snapshot
            - total_price
          ) <= 0.02
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname =
      'school_invoice_items_cover_tax_rate_check'
      and conrelid =
        'public.school_request_invoice_items'::regclass
  ) then
    alter table public.school_request_invoice_items
      add constraint
        school_invoice_items_cover_tax_rate_check
      check (
        book_cover_tax_rate_snapshot is null
        or book_cover_tax_rate_snapshot in (
          7,
          19
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname =
      'school_invoice_items_cover_tax_nonnegative_check'
      and conrelid =
        'public.school_request_invoice_items'::regclass
  ) then
    alter table public.school_request_invoice_items
      add constraint
        school_invoice_items_cover_tax_nonnegative_check
      check (
        (
          book_cover_net_amount_snapshot is null
          or book_cover_net_amount_snapshot >= 0
        )
        and
        (
          book_cover_tax_amount_snapshot is null
          or book_cover_tax_amount_snapshot >= 0
        )
      );
  end if;
end
$invoice_item_constraints$;

-- Der finale Buchhüllen-Constraint wird bewusst immer ersetzt.
-- Dadurch wird auch eine eventuell zuvor installierte, zu strenge
-- Zwischenversion zuverlässig korrigiert.

alter table public.school_request_invoice_items
  drop constraint if exists
    school_invoice_items_cover_tax_snapshot_check;

alter table public.school_request_invoice_items
  add constraint
    school_invoice_items_cover_tax_snapshot_check
  check (
    (
      coalesce(
        book_cover_total_price,
        0
      ) = 0

      and book_cover_tax_rate_snapshot is null
      and book_cover_net_amount_snapshot is null
      and book_cover_tax_amount_snapshot is null
    )

    or

    (
      coalesce(
        book_cover_total_price,
        0
      ) > 0

      and
      (
        -- Legacy-Checkout:
        -- Buchhüllenbetrag vorhanden, aber noch keinerlei
        -- Produkt- oder Buchhüllen-Steuersnapshot erzeugt.
        (
          tax_snapshot_at is null

          and book_cover_tax_rate_snapshot is null
          and book_cover_net_amount_snapshot is null
          and book_cover_tax_amount_snapshot is null
        )

        or

        -- Neuer Checkout:
        -- Sobald die Produktposition einen Steuersnapshot besitzt,
        -- muss auch eine positive Buchhülle vollständig aufgeteilt sein.
        (
          tax_snapshot_at is not null

          and book_cover_selected = true
          and book_cover_quantity > 0

          and book_cover_tax_rate_snapshot in (
            7,
            19
          )

          and book_cover_net_amount_snapshot is not null
          and book_cover_tax_amount_snapshot is not null

          and book_cover_net_amount_snapshot >= 0
          and book_cover_tax_amount_snapshot >= 0

          and abs(
            book_cover_net_amount_snapshot
            + book_cover_tax_amount_snapshot
            - book_cover_total_price
          ) <= 0.02
        )
      )
    )
  );

comment on constraint
  school_invoice_items_cover_tax_snapshot_check
  on public.school_request_invoice_items
is
  'Erlaubt vorübergehend alte Buchhüllenpositionen ohne Steuer-Snapshot. Sobald tax_snapshot_at gesetzt ist, muss eine positive Buchhüllenposition vollständig mit Steuersatz, Netto und Steuerbetrag gespeichert sein.';

-- ============================================================
-- 4. CONSTRAINTS FÜR RECHNUNGEN
-- ============================================================

do $invoice_constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname =
      'school_invoices_tax_snapshot_status_check'
      and conrelid =
        'public.school_request_invoices'::regclass
  ) then
    alter table public.school_request_invoices
      add constraint
        school_invoices_tax_snapshot_status_check
      check (
        tax_snapshot_status is null
        or tax_snapshot_status in (
          'building',
          'complete',
          'blocked',
          'legacy_unavailable'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname =
      'school_invoices_tax_breakdown_object_check'
      and conrelid =
        'public.school_request_invoices'::regclass
  ) then
    alter table public.school_request_invoices
      add constraint
        school_invoices_tax_breakdown_object_check
      check (
        tax_breakdown_snapshot is null
        or jsonb_typeof(
          tax_breakdown_snapshot
        ) = 'object'
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname =
      'school_invoices_tax_amounts_nonnegative_check'
      and conrelid =
        'public.school_request_invoices'::regclass
  ) then
    alter table public.school_request_invoices
      add constraint
        school_invoices_tax_amounts_nonnegative_check
      check (
        (
          subtotal_net_amount_snapshot is null
          or subtotal_net_amount_snapshot >= 0
        )
        and
        (
          subtotal_tax_amount_snapshot is null
          or subtotal_tax_amount_snapshot >= 0
        )
        and
        (
          shipping_net_amount_snapshot is null
          or shipping_net_amount_snapshot >= 0
        )
        and
        (
          shipping_tax_amount_snapshot is null
          or shipping_tax_amount_snapshot >= 0
        )
        and
        (
          book_shipping_net_amount_snapshot is null
          or book_shipping_net_amount_snapshot >= 0
        )
        and
        (
          book_shipping_tax_amount_snapshot is null
          or book_shipping_tax_amount_snapshot >= 0
        )
        and
        (
          book_cover_net_amount_snapshot is null
          or book_cover_net_amount_snapshot >= 0
        )
        and
        (
          book_cover_tax_amount_snapshot is null
          or book_cover_tax_amount_snapshot >= 0
        )
        and
        (
          discount_net_amount_snapshot is null
          or discount_net_amount_snapshot >= 0
        )
        and
        (
          discount_tax_amount_snapshot is null
          or discount_tax_amount_snapshot >= 0
        )
        and
        (
          total_net_amount_snapshot is null
          or total_net_amount_snapshot >= 0
        )
        and
        (
          total_tax_amount_snapshot is null
          or total_tax_amount_snapshot >= 0
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname =
      'school_invoices_tax_snapshot_metadata_check'
      and conrelid =
        'public.school_request_invoices'::regclass
  ) then
    alter table public.school_request_invoices
      add constraint
        school_invoices_tax_snapshot_metadata_check
      check (
        (
          tax_snapshot_status is null
          and tax_snapshot_source is null
          and tax_snapshot_version is null
          and tax_snapshot_at is null
          and tax_breakdown_snapshot is null
          and subtotal_net_amount_snapshot is null
          and subtotal_tax_amount_snapshot is null
          and shipping_net_amount_snapshot is null
          and shipping_tax_amount_snapshot is null
          and book_shipping_net_amount_snapshot is null
          and book_shipping_tax_amount_snapshot is null
          and book_cover_net_amount_snapshot is null
          and book_cover_tax_amount_snapshot is null
          and discount_net_amount_snapshot is null
          and discount_tax_amount_snapshot is null
          and total_net_amount_snapshot is null
          and total_tax_amount_snapshot is null
        )
        or
        (
          tax_snapshot_status is not null
          and nullif(
            btrim(tax_snapshot_source),
            ''
          ) is not null
          and nullif(
            btrim(tax_snapshot_version),
            ''
          ) is not null
          and tax_snapshot_at is not null
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname =
      'school_invoices_tax_snapshot_complete_check'
      and conrelid =
        'public.school_request_invoices'::regclass
  ) then
    alter table public.school_request_invoices
      add constraint
        school_invoices_tax_snapshot_complete_check
      check (
        tax_snapshot_status is distinct from
          'complete'
        or
        (
          tax_breakdown_snapshot is not null
          and subtotal_net_amount_snapshot is not null
          and subtotal_tax_amount_snapshot is not null
          and shipping_net_amount_snapshot is not null
          and shipping_tax_amount_snapshot is not null
          and book_shipping_net_amount_snapshot is not null
          and book_shipping_tax_amount_snapshot is not null
          and book_cover_net_amount_snapshot is not null
          and book_cover_tax_amount_snapshot is not null
          and discount_net_amount_snapshot is not null
          and discount_tax_amount_snapshot is not null
          and total_net_amount_snapshot is not null
          and total_tax_amount_snapshot is not null
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname =
      'school_invoices_tax_component_sums_check'
      and conrelid =
        'public.school_request_invoices'::regclass
  ) then
    alter table public.school_request_invoices
      add constraint
        school_invoices_tax_component_sums_check
      check (
        tax_snapshot_status is distinct from
          'complete'
        or
        (
          abs(
            subtotal_net_amount_snapshot
            + subtotal_tax_amount_snapshot
            - subtotal_amount
          ) <= 0.02

          and abs(
            shipping_net_amount_snapshot
            + shipping_tax_amount_snapshot
            - shipping_amount
          ) <= 0.02

          and abs(
            book_shipping_net_amount_snapshot
            + book_shipping_tax_amount_snapshot
            - book_shipping_amount
          ) <= 0.02

          and abs(
            book_cover_net_amount_snapshot
            + book_cover_tax_amount_snapshot
            - book_cover_amount
          ) <= 0.02

          and abs(
            discount_net_amount_snapshot
            + discount_tax_amount_snapshot
            - discount_amount
          ) <= 0.02

          and abs(
            total_net_amount_snapshot
            + total_tax_amount_snapshot
            - total_amount
          ) <= 0.02
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname =
      'school_invoices_tax_total_composition_check'
      and conrelid =
        'public.school_request_invoices'::regclass
  ) then
    alter table public.school_request_invoices
      add constraint
        school_invoices_tax_total_composition_check
      check (
        tax_snapshot_status is distinct from
          'complete'
        or
        (
          abs(
            (
              subtotal_net_amount_snapshot
              + shipping_net_amount_snapshot
              + book_shipping_net_amount_snapshot
              + book_cover_net_amount_snapshot
              - discount_net_amount_snapshot
            )
            - total_net_amount_snapshot
          ) <= 0.05

          and abs(
            (
              subtotal_tax_amount_snapshot
              + shipping_tax_amount_snapshot
              + book_shipping_tax_amount_snapshot
              + book_cover_tax_amount_snapshot
              - discount_tax_amount_snapshot
            )
            - total_tax_amount_snapshot
          ) <= 0.05

          and abs(
            (
              subtotal_amount
              + shipping_amount
              + book_shipping_amount
              + book_cover_amount
              - discount_amount
            )
            - total_amount
          ) <= 0.05
        )
      );
  end if;
end
$invoice_constraints$;

-- ============================================================
-- 5. DIAGNOSEINDIZES
-- ============================================================

create index if not exists
  school_invoice_items_tax_snapshot_missing_idx
on public.school_request_invoice_items (
  invoice_id
)
where tax_snapshot_at is null;

create index if not exists
  school_invoices_tax_snapshot_status_idx
on public.school_request_invoices (
  tax_snapshot_status,
  created_at
);

commit;