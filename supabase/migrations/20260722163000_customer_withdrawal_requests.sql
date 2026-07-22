create table if not exists public.customer_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  reference_number text not null unique,
  customer_name text not null,
  contract_reference text not null,
  customer_email text not null,
  withdrawal_scope text null,
  customer_message text null,
  submitted_at timestamptz not null default now(),
  confirmation_sent_at timestamptz null,
  admin_notification_sent_at timestamptz null,
  status text not null default 'received',
  user_agent text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_withdrawal_requests_status_check
    check (status in ('received', 'confirmed', 'processed', 'rejected'))
);

create index if not exists customer_withdrawal_requests_submitted_at_idx
  on public.customer_withdrawal_requests (submitted_at desc);

create index if not exists customer_withdrawal_requests_contract_reference_idx
  on public.customer_withdrawal_requests (contract_reference);

create index if not exists customer_withdrawal_requests_customer_email_idx
  on public.customer_withdrawal_requests (customer_email);

alter table public.customer_withdrawal_requests enable row level security;

revoke all on table public.customer_withdrawal_requests from anon;
revoke all on table public.customer_withdrawal_requests from authenticated;

comment on table public.customer_withdrawal_requests is
  'Zeitgestempelte elektronische Widerrufserklärungen inklusive Versandstatus der Eingangsbestätigung.';

comment on column public.customer_withdrawal_requests.reference_number is
  'Öffentliche Referenz der Widerrufserklärung, z. B. WD-20260722-ABC12345.';
