begin;

alter table public.business_runtime_settings
  add column if not exists paypal_payments_enabled boolean not null default false;

comment on column public.business_runtime_settings.paypal_payments_enabled is
  'Reversible business kill switch for new PayPal selections and order creation. Existing captures and webhooks remain available.';

update public.business_runtime_settings
set paypal_payments_enabled = false
where id = 'default';

commit;
