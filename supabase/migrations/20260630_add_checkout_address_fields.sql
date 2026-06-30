-- Handzettel-Schulen.de
-- Checkout-Adressfelder für Rechnungsadresse und abweichende Lieferadresse.
-- Bereits live in Supabase ausgeführt am 2026-06-30.
-- Idempotent: kann mehrfach ausgeführt werden.

ALTER TABLE public.school_requests
  ADD COLUMN IF NOT EXISTS billing_name text,
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS billing_phone text,
  ADD COLUMN IF NOT EXISTS billing_street text,
  ADD COLUMN IF NOT EXISTS billing_postal_code text,
  ADD COLUMN IF NOT EXISTS billing_city text,
  ADD COLUMN IF NOT EXISTS shipping_address_differs boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shipping_name text,
  ADD COLUMN IF NOT EXISTS shipping_street text,
  ADD COLUMN IF NOT EXISTS shipping_postal_code text,
  ADD COLUMN IF NOT EXISTS shipping_city text;

ALTER TABLE public.school_request_invoices
  ADD COLUMN IF NOT EXISTS billing_name_snapshot text,
  ADD COLUMN IF NOT EXISTS billing_email_snapshot text,
  ADD COLUMN IF NOT EXISTS billing_phone_snapshot text,
  ADD COLUMN IF NOT EXISTS billing_street_snapshot text,
  ADD COLUMN IF NOT EXISTS billing_postal_code_snapshot text,
  ADD COLUMN IF NOT EXISTS billing_city_snapshot text,
  ADD COLUMN IF NOT EXISTS shipping_address_differs_snapshot boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shipping_name_snapshot text,
  ADD COLUMN IF NOT EXISTS shipping_street_snapshot text,
  ADD COLUMN IF NOT EXISTS shipping_postal_code_snapshot text,
  ADD COLUMN IF NOT EXISTS shipping_city_snapshot text;
