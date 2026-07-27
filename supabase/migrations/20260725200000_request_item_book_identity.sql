begin;

-- ============================================================
-- 1. Strukturierte Buchidentität auf erkannten Listenpositionen
-- ============================================================

alter table public.school_request_items
  add column if not exists is_book boolean not null default false,
  add column if not exists book_isbn10 text,
  add column if not exists book_isbn13 text;

comment on column public.school_request_items.is_book is
  'Kennzeichnet eine anhand expliziter ISBN erkannte Buchposition.';

comment on column public.school_request_items.book_isbn10 is
  'Normalisierte ISBN-10 ohne Leerzeichen oder Trennzeichen.';

comment on column public.school_request_items.book_isbn13 is
  'Normalisierte ISBN-13 ohne Leerzeichen oder Trennzeichen.';

create index if not exists school_request_items_book_isbn10_idx
  on public.school_request_items (book_isbn10)
  where book_isbn10 is not null;

create index if not exists school_request_items_book_isbn13_idx
  on public.school_request_items (book_isbn13)
  where book_isbn13 is not null;

create index if not exists school_products_ean_idx
  on public.school_products (ean)
  where ean is not null;

create index if not exists school_products_book_isbn10_idx
  on public.school_products (book_isbn10)
  where book_isbn10 is not null;

create index if not exists school_products_book_isbn13_idx
  on public.school_products (book_isbn13)
  where book_isbn13 is not null;

-- ============================================================
-- 2. Gemeinsame ISBN-Normalisierung
-- ============================================================

create or replace function public.hs_normalize_isbn(value text)
returns text
language sql
immutable
parallel safe
as $function$
  select nullif(
    upper(
      regexp_replace(
        coalesce(value, ''),
        '[^0-9Xx]',
        '',
        'g'
      )
    ),
    ''
  );
$function$;

create or replace function public.hs_extract_isbn13(value text)
returns text
language plpgsql
immutable
parallel safe
as $function$
declare
  raw_candidate text;
  normalized_candidate text;
begin
  /*
   * Erkennt zum Beispiel:
   *
   * 9783060805327
   * 978-3-06-080532-7
   * 978 3 06 080532 7
   * 978‑3‑06‑080532‑7
   */
  raw_candidate := substring(
    coalesce(value, '')
    from '(97[89]([[:space:][:punct:]]*[0-9]){10})'
  );

  normalized_candidate :=
    public.hs_normalize_isbn(raw_candidate);

  if normalized_candidate ~ '^[0-9]{13}$' then
    return normalized_candidate;
  end if;

  return null;
end;
$function$;

create or replace function public.hs_extract_isbn10(value text)
returns text
language plpgsql
immutable
parallel safe
as $function$
declare
  raw_candidate text;
  normalized_candidate text;
begin
  raw_candidate := substring(
    coalesce(value, '')
    from '([0-9]([[:space:][:punct:]]*[0-9]){8}[[:space:][:punct:]]*[0-9Xx])'
  );

  normalized_candidate :=
    public.hs_normalize_isbn(raw_candidate);

  if normalized_candidate ~ '^[0-9]{9}[0-9X]$' then
    return normalized_candidate;
  end if;

  return null;
end;
$function$;

-- ============================================================
-- 3. ISBN-Positionen beim Speichern zwingend als Buch schützen
-- ============================================================

create or replace function public.hs_sync_request_item_book_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  source_text text;
  normalized_isbn10 text;
  normalized_isbn13 text;
  title_from_raw_text text;
  identity_note text;
begin
  source_text := concat_ws(
    ' ',
    new.raw_text,
    new.normalized_name,
    new.notes,
    new.book_isbn10,
    new.book_isbn13
  );

  normalized_isbn13 :=
    public.hs_normalize_isbn(new.book_isbn13);

  if normalized_isbn13 is null
     or normalized_isbn13 !~ '^[0-9]{13}$' then
    normalized_isbn13 :=
      public.hs_extract_isbn13(source_text);
  end if;

  normalized_isbn10 :=
    public.hs_normalize_isbn(new.book_isbn10);

  if normalized_isbn10 is null
     or normalized_isbn10 !~ '^[0-9]{9}[0-9X]$' then
    /*
     * ISBN-10 nur dann aus dem Freitext ableiten, wenn keine
     * ISBN-13 vorhanden ist. So wird nicht versehentlich ein
     * Teil einer ISBN-13 als ISBN-10 gespeichert.
     */
    if normalized_isbn13 is null then
      normalized_isbn10 :=
        public.hs_extract_isbn10(source_text);
    else
      normalized_isbn10 := null;
    end if;
  end if;

  if normalized_isbn13 is not null
     or normalized_isbn10 is not null then
    new.is_book := true;
    new.book_isbn10 := normalized_isbn10;
    new.book_isbn13 := normalized_isbn13;

    /*
     * Der eigentliche Titel steht bei Materiallisten regelmäßig
     * vor der sichtbaren ISBN. Er darf nicht zu einem generischen
     * Schreibheft umklassifiziert werden.
     */
    title_from_raw_text := btrim(
      regexp_replace(
        coalesce(new.raw_text, ''),
        '[[:space:]]*ISBN(-1[03])?[[:space:]]*:?[[:space:]]*.*$',
        '',
        'i'
      )
    );

    if length(title_from_raw_text) >= 2 then
      new.normalized_name := title_from_raw_text;
    end if;

    new.category := 'Bücher & Arbeitshefte';
    new.product_type := 'Schulbuch';

    /*
     * Heft-Lineaturen und Farben sind für eine eindeutige
     * Buchposition keine Variantenidentität.
     */
    new.color := null;
    new.lineature := null;

    if new.confidence is null then
      new.confidence := 0.98;
    else
      new.confidence := greatest(new.confidence, 0.98);
    end if;

    if coalesce(new.status, '') in (
      '',
      'detected',
      'needs_review'
    ) then
      new.status := 'detected';
    end if;

    identity_note :=
      'Buchidentität geschützt: ISBN ' ||
      coalesce(
        normalized_isbn13,
        normalized_isbn10
      );

    if position(
      identity_note
      in coalesce(new.notes, '')
    ) = 0 then
      new.notes := concat_ws(
        ' | ',
        nullif(btrim(coalesce(new.notes, '')), ''),
        identity_note
      );
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists
  school_request_items_book_identity_trg
  on public.school_request_items;

create trigger school_request_items_book_identity_trg
before insert or update of
  raw_text,
  normalized_name,
  notes,
  is_book,
  book_isbn10,
  book_isbn13
on public.school_request_items
for each row
execute function public.hs_sync_request_item_book_identity();

-- ============================================================
-- 4. Buch-Snapshots zentral auf Paketpositionen setzen
-- ============================================================

create or replace function public.hs_sync_offer_item_book_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  product_is_book boolean;
  product_book_isbn13 text;
  product_ean text;
begin
  if new.product_id is null then
    return new;
  end if;

  select
    coalesce(product.is_book, false),
    public.hs_normalize_isbn(product.book_isbn13),
    public.hs_normalize_isbn(product.ean)
  into
    product_is_book,
    product_book_isbn13,
    product_ean
  from public.school_products as product
  where product.id = new.product_id;

  if not found then
    return new;
  end if;

  new.is_book_snapshot := product_is_book;

  if product_is_book then
    if product_book_isbn13 ~ '^[0-9]{13}$' then
      new.book_isbn13_snapshot :=
        product_book_isbn13;
    elsif product_ean ~ '^[0-9]{13}$' then
      new.book_isbn13_snapshot :=
        product_ean;
    else
      new.book_isbn13_snapshot := null;
    end if;

    new.book_cover_selected :=
      coalesce(new.book_cover_selected, false);

    new.book_cover_unit_price :=
      coalesce(new.book_cover_unit_price, 0);
  else
    new.book_isbn13_snapshot := null;
    new.book_cover_selected := false;
    new.book_cover_unit_price := 0;
  end if;

  return new;
end;
$function$;

drop trigger if exists
  school_offer_items_book_snapshot_trg
  on public.school_offer_items;

create trigger school_offer_items_book_snapshot_trg
before insert or update of product_id
on public.school_offer_items
for each row
execute function public.hs_sync_offer_item_book_snapshot();

-- ============================================================
-- 5. Bestehende ISBN-Positionen und Paketpositionen nachziehen
-- ============================================================

update public.school_request_items
set raw_text = raw_text
where
  book_isbn10 is not null
  or book_isbn13 is not null
  or concat_ws(
    ' ',
    raw_text,
    normalized_name,
    notes
  ) ~* 'ISBN';

update public.school_offer_items
set product_id = product_id
where product_id is not null;

commit;