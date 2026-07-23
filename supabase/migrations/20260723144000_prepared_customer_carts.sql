-- ============================================================================
-- HANDZETTEL-SCHULEN.DE
-- Vorbereitete Bestandskunden-Warenkörbe
--
-- Zweck:
-- - Mitarbeiter stellen einen Warenkorb für einen bestehenden Kunden zusammen.
-- - Der Kunde erhält einen sicheren Link.
-- - Der Warenkorb wird in den normalen Shop-Warenkorb übernommen.
-- - Der bestehende Shop-Checkout bleibt unverändert die einzige Bestellstrecke.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. HAUPTTABELLE
-- ============================================================================

create table if not exists public.school_prepared_carts (
  id uuid primary key default gen_random_uuid(),

  -- Öffentlicher, nicht erratbarer Zugriffs-Token.
  token uuid not null default gen_random_uuid(),

  -- Optionaler Bezug zu einer bestehenden Materiallisten-/Shop-Anfrage.
  -- Die Relation wird bewusst auf null gesetzt, falls der alte Vorgang später
  -- gelöscht wird. Der vorbereitete Warenkorb bleibt dadurch erhalten.
  source_request_id uuid null
    references public.school_requests(id)
    on delete set null,

  -- Nach erfolgreichem Checkout wird hier die neu erzeugte Bestellung verknüpft.
  ordered_request_id uuid null
    references public.school_requests(id)
    on delete set null,

  -- Interner Titel für den Admin.
  title text null,

  -- Lebenszyklus:
  -- draft     = Entwurf
  -- sent      = Link wurde versendet
  -- opened    = Kunde hat den Link geöffnet
  -- edited    = Kunde hat den Warenkorb übernommen/bearbeitet
  -- ordered   = Checkout erfolgreich abgeschlossen
  -- expired   = Link ist abgelaufen
  -- cancelled = Admin hat den Warenkorb zurückgezogen
  status text not null default 'draft',

  -- Kundendaten-Snapshot.
  customer_name text null,
  email text null,
  phone text null,

  -- Rechnungsadresse-Snapshot.
  billing_name text null,
  billing_email text null,
  billing_phone text null,
  billing_street text null,
  billing_postal_code text null,
  billing_city text null,

  -- Lieferadresse-Snapshot.
  shipping_address_differs boolean not null default false,
  shipping_name text null,
  shipping_street text null,
  shipping_postal_code text null,
  shipping_city text null,

  -- Schul-/Kinddaten.
  child_name text null,
  school_name text null,
  class_name text null,

  -- Optionale Checkout-Vorauswahl.
  fulfillment_method text null,
  payment_method text null,

  -- Freie Hinweise.
  customer_message text null,
  admin_note text null,

  -- Kommunikationsstatus.
  sent_at timestamptz null,
  sent_by_email_at timestamptz null,
  sent_by_whatsapp_at timestamptz null,
  opened_at timestamptz null,
  edited_at timestamptz null,
  ordered_at timestamptz null,
  cancelled_at timestamptz null,

  -- Ablaufzeit. Standardmäßig 30 Tage.
  expires_at timestamptz not null default (now() + interval '30 days'),

  -- Erzeugte Bestellung/Rechnung.
  ordered_invoice_id uuid null,
  ordered_invoice_token text null,

  -- Technische Herkunft.
  created_by text null,
  last_sent_channel text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint school_prepared_carts_token_unique
    unique (token),

  constraint school_prepared_carts_status_check
    check (
      status in (
        'draft',
        'sent',
        'opened',
        'edited',
        'ordered',
        'expired',
        'cancelled'
      )
    ),

  constraint school_prepared_carts_fulfillment_method_check
    check (
      fulfillment_method is null
      or fulfillment_method in ('pickup', 'shipping')
    ),

  constraint school_prepared_carts_payment_method_check
    check (
      payment_method is null
      or payment_method in ('paypal', 'bank_transfer')
    ),

  constraint school_prepared_carts_last_sent_channel_check
    check (
      last_sent_channel is null
      or last_sent_channel in ('email', 'whatsapp', 'copy_link')
    ),

  constraint school_prepared_carts_email_length_check
    check (
      email is null
      or char_length(email) <= 320
    ),

  constraint school_prepared_carts_phone_length_check
    check (
      phone is null
      or char_length(phone) <= 80
    )
);

comment on table public.school_prepared_carts is
  'Durch Mitarbeiter vorbereitete Warenkörbe, die Kunden per sicherem Link in den normalen Shop übernehmen.';

comment on column public.school_prepared_carts.source_request_id is
  'Optionaler Bestandskundenvorgang, aus dem die Kundendaten übernommen wurden.';

comment on column public.school_prepared_carts.ordered_request_id is
  'Beim erfolgreichen Shop-Checkout erzeugte school_requests-Bestellung.';

comment on column public.school_prepared_carts.token is
  'Öffentlicher, nicht erratbarer UUID-Token für den Kundenlink.';

-- ============================================================================
-- 2. POSITIONEN
-- ============================================================================

create table if not exists public.school_prepared_cart_items (
  id uuid primary key default gen_random_uuid(),

  cart_id uuid not null
    references public.school_prepared_carts(id)
    on delete cascade,

  product_id uuid not null
    references public.school_products(id)
    on delete restrict,

  quantity integer not null default 1,

  -- Snapshot-Felder für die Adminanzeige und Historie.
  -- Im endgültigen Checkout werden Preis und Verfügbarkeit erneut serverseitig
  -- aus school_products gelesen. Dadurch kann kein Kunde Preise manipulieren.
  product_name_snapshot text not null,
  product_sku_snapshot text null,
  unit_price_snapshot numeric(12,2) not null,
  image_url_snapshot text null,

  category_snapshot text null,
  format_snapshot text null,
  color_snapshot text null,
  lineature_snapshot text null,

  admin_note text null,
  sort_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint school_prepared_cart_items_quantity_check
    check (quantity between 1 and 99),

  constraint school_prepared_cart_items_unit_price_check
    check (unit_price_snapshot >= 0),

  constraint school_prepared_cart_items_sort_order_check
    check (sort_order >= 0),

  constraint school_prepared_cart_items_cart_product_unique
    unique (cart_id, product_id)
);

comment on table public.school_prepared_cart_items is
  'Produktpositionen eines durch Mitarbeiter vorbereiteten Kundenwarenkorbs.';

comment on column public.school_prepared_cart_items.unit_price_snapshot is
  'Preis zum Zeitpunkt der Vorbereitung; der Checkout prüft den aktuellen Produktpreis erneut.';

-- ============================================================================
-- 3. INDIZES
-- ============================================================================

create index if not exists school_prepared_carts_status_idx
  on public.school_prepared_carts(status);

create index if not exists school_prepared_carts_source_request_idx
  on public.school_prepared_carts(source_request_id);

create index if not exists school_prepared_carts_ordered_request_idx
  on public.school_prepared_carts(ordered_request_id);

create index if not exists school_prepared_carts_email_idx
  on public.school_prepared_carts(lower(email));

create index if not exists school_prepared_carts_created_at_idx
  on public.school_prepared_carts(created_at desc);

create index if not exists school_prepared_carts_expires_at_idx
  on public.school_prepared_carts(expires_at);

create index if not exists school_prepared_cart_items_cart_sort_idx
  on public.school_prepared_cart_items(cart_id, sort_order, created_at);

create index if not exists school_prepared_cart_items_product_idx
  on public.school_prepared_cart_items(product_id);

-- ============================================================================
-- 4. UPDATED-AT-TRIGGER
-- ============================================================================

create or replace function public.set_school_prepared_cart_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_school_prepared_carts_updated_at
  on public.school_prepared_carts;

create trigger trg_school_prepared_carts_updated_at
before update on public.school_prepared_carts
for each row
execute function public.set_school_prepared_cart_updated_at();

drop trigger if exists trg_school_prepared_cart_items_updated_at
  on public.school_prepared_cart_items;

create trigger trg_school_prepared_cart_items_updated_at
before update on public.school_prepared_cart_items
for each row
execute function public.set_school_prepared_cart_updated_at();

-- ============================================================================
-- 5. AUTOMATISCHE STATUS-KONSISTENZ
-- ============================================================================

create or replace function public.normalize_school_prepared_cart_status()
returns trigger
language plpgsql
as $$
begin
  -- Bestellte Warenkörbe dürfen nicht versehentlich zurückgestuft werden.
  if old.status = 'ordered' and new.status <> 'ordered' then
    raise exception
      'Ein bereits bestellter vorbereiteter Warenkorb kann nicht zurückgestuft werden.';
  end if;

  if new.status = 'sent' and new.sent_at is null then
    new.sent_at = now();
  end if;

  if new.status = 'opened' and new.opened_at is null then
    new.opened_at = now();
  end if;

  if new.status = 'edited' and new.edited_at is null then
    new.edited_at = now();
  end if;

  if new.status = 'ordered' and new.ordered_at is null then
    new.ordered_at = now();
  end if;

  if new.status = 'cancelled' and new.cancelled_at is null then
    new.cancelled_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_normalize_school_prepared_cart_status
  on public.school_prepared_carts;

create trigger trg_normalize_school_prepared_cart_status
before update on public.school_prepared_carts
for each row
execute function public.normalize_school_prepared_cart_status();

-- ============================================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================================
--
-- Kein direkter Browserzugriff auf die Tabellen.
-- Admin- und öffentliche Token-Routen arbeiten ausschließlich serverseitig
-- mit dem Supabase-Service-Role-Key.
-- ============================================================================

alter table public.school_prepared_carts enable row level security;
alter table public.school_prepared_cart_items enable row level security;

-- Vorsichtshalber bestehende breit gefasste Policies entfernen, falls die
-- Migration während der Entwicklung mehrfach ausgeführt wurde.

drop policy if exists "Public prepared carts read"
  on public.school_prepared_carts;

drop policy if exists "Public prepared carts write"
  on public.school_prepared_carts;

drop policy if exists "Public prepared cart items read"
  on public.school_prepared_cart_items;

drop policy if exists "Public prepared cart items write"
  on public.school_prepared_cart_items;

-- ============================================================================
-- 7. HILFSFUNKTION FÜR ABGELAUFENE WARENKÖRBE
-- ============================================================================

create or replace function public.expire_school_prepared_carts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_rows integer;
begin
  update public.school_prepared_carts
  set
    status = 'expired',
    updated_at = now()
  where
    expires_at <= now()
    and status in ('draft', 'sent', 'opened', 'edited');

  get diagnostics affected_rows = row_count;

  return affected_rows;
end;
$$;

revoke all on function public.expire_school_prepared_carts() from public;
grant execute on function public.expire_school_prepared_carts() to service_role;

-- ============================================================================
-- 8. SERVICE-ROLE-BERECHTIGUNGEN
-- ============================================================================

grant select, insert, update, delete
  on public.school_prepared_carts
  to service_role;

grant select, insert, update, delete
  on public.school_prepared_cart_items
  to service_role;