-- ============================================================================
-- HANDZETTEL-SCHULEN.DE
-- Einheitliche Kundenkommunikation
--
-- Zunächst verwendet für vorbereitete Bestandskunden-Warenkörbe.
-- Die generische Struktur kann später auch für Anfragen, Rechnungen,
-- Rückfragen und Bestellungen verwendet werden.
-- ============================================================================

create table if not exists public.school_customer_communications (
  id uuid primary key default gen_random_uuid(),

  entity_type text not null,
  entity_id uuid not null,

  channel text not null,
  status text not null default 'sent',

  recipient text null,
  subject text null,
  message_text text not null,

  metadata jsonb not null default '{}'::jsonb,

  sent_at timestamptz null,
  created_by text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint school_customer_communications_entity_type_check
    check (
      entity_type in (
        'prepared_cart',
        'request',
        'invoice',
        'order',
        'general'
      )
    ),

  constraint school_customer_communications_channel_check
    check (
      channel in (
        'email',
        'whatsapp',
        'copy_link',
        'sms',
        'other'
      )
    ),

  constraint school_customer_communications_status_check
    check (
      status in (
        'draft',
        'sent',
        'failed',
        'opened',
        'confirmed'
      )
    )
);

create index if not exists school_customer_communications_entity_idx
  on public.school_customer_communications(
    entity_type,
    entity_id,
    created_at desc
  );

create index if not exists school_customer_communications_channel_idx
  on public.school_customer_communications(channel);

create index if not exists school_customer_communications_sent_at_idx
  on public.school_customer_communications(sent_at desc);

create or replace function public.set_school_customer_communication_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_school_customer_communications_updated_at
  on public.school_customer_communications;

create trigger trg_school_customer_communications_updated_at
before update on public.school_customer_communications
for each row
execute function public.set_school_customer_communication_updated_at();

alter table public.school_customer_communications enable row level security;

drop policy if exists "Public customer communications read"
  on public.school_customer_communications;

drop policy if exists "Public customer communications write"
  on public.school_customer_communications;

grant select, insert, update, delete
  on public.school_customer_communications
  to service_role;