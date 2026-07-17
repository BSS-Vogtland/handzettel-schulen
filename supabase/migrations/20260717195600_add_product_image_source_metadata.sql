-- Bildherkunft und Nutzungsstatus für ISBN- und sonstige Produktbilder.
-- Bestehende Datensätze bleiben unverändert.

alter table public.school_products
  add column if not exists image_source text,
  add column if not exists image_source_url text,
  add column if not exists image_license text,
  add column if not exists image_license_url text,
  add column if not exists image_attribution text,
  add column if not exists image_usage_status text,
  add column if not exists image_checked_at timestamptz;

comment on column public.school_products.image_source is
  'Quelle des Produktbildes, z. B. Google Books oder Wikimedia Commons.';

comment on column public.school_products.image_source_url is
  'Nachweis- oder Detailseite der Bildquelle.';

comment on column public.school_products.image_license is
  'Lizenz- oder Nutzungsbezeichnung der Bildquelle.';

comment on column public.school_products.image_license_url is
  'Link zu Lizenz oder Nutzungsbedingungen.';

comment on column public.school_products.image_attribution is
  'Gespeicherte Urheber- oder Quellenangabe.';

comment on column public.school_products.image_usage_status is
  'Interner Status, z. B. public_domain, cc0 oder api_terms.';

comment on column public.school_products.image_checked_at is
  'Zeitpunkt der letzten Quellen- und Nutzungsprüfung.';
