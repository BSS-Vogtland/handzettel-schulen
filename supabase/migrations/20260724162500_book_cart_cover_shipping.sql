begin;

-- ============================================================
-- 1. Paketpositionen
-- ============================================================
-- Speichert, ob die Position beim Zusammenstellen des Pakets
-- ein Buch war und ob der Kunde eine passende Buchhülle gewählt hat.

alter table if exists public.school_offer_items
  add column if not exists is_book_snapshot boolean not null default false;

alter table if exists public.school_offer_items
  add column if not exists book_isbn13_snapshot text;

alter table if exists public.school_offer_items
  add column if not exists book_cover_selected boolean not null default false;

alter table if exists public.school_offer_items
  add column if not exists book_cover_unit_price numeric(12,2) not null default 0;


-- ============================================================
-- 2. Rechnungspositionen
-- ============================================================
-- Diese Werte sind unveränderliche Rechnungssnapshots.
-- Auch spätere Preisänderungen wirken nicht auf alte Rechnungen.

alter table if exists public.school_request_invoice_items
  add column if not exists is_book_snapshot boolean not null default false;

alter table if exists public.school_request_invoice_items
  add column if not exists book_isbn13_snapshot text;

alter table if exists public.school_request_invoice_items
  add column if not exists book_cover_selected boolean not null default false;

alter table if exists public.school_request_invoice_items
  add column if not exists book_cover_name_snapshot text;

alter table if exists public.school_request_invoice_items
  add column if not exists book_cover_quantity integer not null default 0;

alter table if exists public.school_request_invoice_items
  add column if not exists book_cover_unit_price numeric(12,2) not null default 0;

alter table if exists public.school_request_invoice_items
  add column if not exists book_cover_total_price numeric(12,2) not null default 0;


-- ============================================================
-- 3. Rechnungssummen
-- ============================================================
-- Buchversand und Buchhüllen werden bewusst getrennt vom normalen
-- Produkt-Zwischenbetrag und vom allgemeinen Versand gespeichert.

alter table if exists public.school_request_invoices
  add column if not exists contains_books boolean not null default false;

alter table if exists public.school_request_invoices
  add column if not exists book_shipping_amount numeric(12,2) not null default 0;

alter table if exists public.school_request_invoices
  add column if not exists book_cover_amount numeric(12,2) not null default 0;


-- ============================================================
-- 4. Anfrage-/Bestellsnapshot
-- ============================================================
-- Vereinfacht später die Anzeige im Adminbereich.

alter table if exists public.school_requests
  add column if not exists contains_books boolean not null default false;

alter table if exists public.school_requests
  add column if not exists book_shipping_amount numeric(12,2) not null default 0;

alter table if exists public.school_requests
  add column if not exists book_cover_amount numeric(12,2) not null default 0;


-- ============================================================
-- 5. Plausibilitätsprüfungen
-- ============================================================

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'school_offer_items_book_cover_unit_price_nonnegative'
  ) then
    alter table public.school_offer_items
      add constraint school_offer_items_book_cover_unit_price_nonnegative
      check (book_cover_unit_price >= 0);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'school_invoice_items_book_cover_quantity_nonnegative'
  ) then
    alter table public.school_request_invoice_items
      add constraint school_invoice_items_book_cover_quantity_nonnegative
      check (book_cover_quantity >= 0);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'school_invoice_items_book_cover_unit_price_nonnegative'
  ) then
    alter table public.school_request_invoice_items
      add constraint school_invoice_items_book_cover_unit_price_nonnegative
      check (book_cover_unit_price >= 0);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'school_invoice_items_book_cover_total_price_nonnegative'
  ) then
    alter table public.school_request_invoice_items
      add constraint school_invoice_items_book_cover_total_price_nonnegative
      check (book_cover_total_price >= 0);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'school_invoices_book_shipping_amount_nonnegative'
  ) then
    alter table public.school_request_invoices
      add constraint school_invoices_book_shipping_amount_nonnegative
      check (book_shipping_amount >= 0);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'school_invoices_book_cover_amount_nonnegative'
  ) then
    alter table public.school_request_invoices
      add constraint school_invoices_book_cover_amount_nonnegative
      check (book_cover_amount >= 0);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'school_requests_book_shipping_amount_nonnegative'
  ) then
    alter table public.school_requests
      add constraint school_requests_book_shipping_amount_nonnegative
      check (book_shipping_amount >= 0);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'school_requests_book_cover_amount_nonnegative'
  ) then
    alter table public.school_requests
      add constraint school_requests_book_cover_amount_nonnegative
      check (book_cover_amount >= 0);
  end if;
end;
$$;


-- ============================================================
-- 6. Bestehende Produktverknüpfungen nachziehen
-- ============================================================
-- Historische Rechnungsbeträge werden ausdrücklich nicht verändert.
-- Es werden nur Buchkennzeichen und ISBN-Snapshots ergänzt.

update public.school_offer_items as offer_item
set
  is_book_snapshot = coalesce(product.is_book, false),
  book_isbn13_snapshot = product.book_isbn13
from public.school_products as product
where
  offer_item.product_id = product.id
  and (
    offer_item.is_book_snapshot is distinct from coalesce(product.is_book, false)
    or offer_item.book_isbn13_snapshot is distinct from product.book_isbn13
  );

update public.school_request_invoice_items as invoice_item
set
  is_book_snapshot = coalesce(product.is_book, false),
  book_isbn13_snapshot = product.book_isbn13
from public.school_products as product
where
  invoice_item.product_id = product.id
  and (
    invoice_item.is_book_snapshot is distinct from coalesce(product.is_book, false)
    or invoice_item.book_isbn13_snapshot is distinct from product.book_isbn13
  );


-- ============================================================
-- 7. Buchkennzeichen bestehender Rechnungen nachziehen
-- ============================================================
-- Buchversand und Buchhüllen bleiben bei historischen Rechnungen
-- auf 0, damit alte Gesamtbeträge unverändert bleiben.

update public.school_request_invoices as invoice
set contains_books = exists (
  select 1
  from public.school_request_invoice_items as invoice_item
  where
    invoice_item.invoice_id = invoice.id
    and invoice_item.is_book_snapshot = true
)
where invoice.contains_books is distinct from exists (
  select 1
  from public.school_request_invoice_items as invoice_item
  where
    invoice_item.invoice_id = invoice.id
    and invoice_item.is_book_snapshot = true
);

update public.school_requests as request_row
set contains_books = exists (
  select 1
  from public.school_request_invoices as invoice
  where
    invoice.request_id = request_row.id
    and invoice.contains_books = true
)
where request_row.contains_books is distinct from exists (
  select 1
  from public.school_request_invoices as invoice
  where
    invoice.request_id = request_row.id
    and invoice.contains_books = true
);


-- ============================================================
-- 8. Dokumentation
-- ============================================================

comment on column public.school_offer_items.is_book_snapshot is
  'Kennzeichnet die Paketposition als Buch. Wird aus school_products.is_book übernommen.';

comment on column public.school_offer_items.book_cover_selected is
  'Vom Kunden gewählte passende Buchhülle. Standardmäßig nicht ausgewählt.';

comment on column public.school_offer_items.book_cover_unit_price is
  'Preis einer passenden Buchhülle zum Zeitpunkt der Auswahl.';

comment on column public.school_request_invoice_items.is_book_snapshot is
  'Unveränderlicher Buchstatus der Rechnungsposition.';

comment on column public.school_request_invoice_items.book_cover_quantity is
  'Anzahl der zu dieser Buchposition bestellten Buchhüllen.';

comment on column public.school_request_invoice_items.book_cover_total_price is
  'Gesamtpreis der Buchhüllen für diese Rechnungsposition.';

comment on column public.school_request_invoices.book_shipping_amount is
  'Einmaliger Buchversand der Bestellung, aktuell 1,00 EUR bei mindestens einem Buch.';

comment on column public.school_request_invoices.book_cover_amount is
  'Gesamtsumme aller optional bestellten Buchhüllen.';

commit;