create extension if not exists pgcrypto;

create sequence if not exists public.book_supplier_inquiry_number_seq
  start with 1
  increment by 1
  no minvalue
  no maxvalue
  cache 1;

create or replace function public.next_book_supplier_inquiry_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_value bigint;
begin
  next_value := nextval('public.book_supplier_inquiry_number_seq');

  return
    'VB-' ||
    to_char(now(), 'YYYY') ||
    '-' ||
    lpad(next_value::text, 5, '0');
end;
$$;

create table if not exists public.book_supplier_partners (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  email text,
  contact_person text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.book_supplier_inquiries (
  id uuid primary key default gen_random_uuid(),
  inquiry_number text not null unique,
  supplier_id uuid not null references public.book_supplier_partners(id) on delete restrict,
  status text not null default 'draft'
    check (
      status in (
        'draft',
        'sent',
        'partially_answered',
        'answered',
        'closed'
      )
    ),
  response_token uuid not null unique default gen_random_uuid(),
  admin_note text,
  supplier_note text,
  sent_to_email text,
  sent_at timestamptz,
  first_answered_at timestamptz,
  answered_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.book_supplier_inquiry_items (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.book_supplier_inquiries(id) on delete cascade,
  sort_order integer not null default 0,
  isbn text not null,
  title text not null,
  subtitle text,
  authors text[] not null default '{}',
  publisher text,
  published_date text,
  cover_url text,
  requested_quantity integer not null default 1
    check (requested_quantity > 0),
  availability_status text not null default 'pending'
    check (
      availability_status in (
        'pending',
        'in_store',
        'orderable',
        'partially_available',
        'unavailable',
        'checking'
      )
    ),
  available_quantity integer
    check (available_quantity is null or available_quantity >= 0),
  lead_time_days integer
    check (lead_time_days is null or lead_time_days >= 0),
  available_from date,
  reservation_until date,
  supplier_note text,
  linked_product_id uuid references public.school_products(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inquiry_id, isbn)
);

create table if not exists public.book_supplier_events (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.book_supplier_inquiries(id) on delete cascade,
  event_type text not null,
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists book_supplier_inquiries_supplier_idx
  on public.book_supplier_inquiries(supplier_id);

create index if not exists book_supplier_inquiries_status_idx
  on public.book_supplier_inquiries(status);

create index if not exists book_supplier_inquiries_created_idx
  on public.book_supplier_inquiries(created_at desc);

create index if not exists book_supplier_inquiry_items_inquiry_idx
  on public.book_supplier_inquiry_items(inquiry_id);

create index if not exists book_supplier_inquiry_items_isbn_idx
  on public.book_supplier_inquiry_items(isbn);

create index if not exists book_supplier_events_inquiry_idx
  on public.book_supplier_events(inquiry_id, created_at desc);

create or replace function public.set_book_supplier_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_book_supplier_partners_updated_at
  on public.book_supplier_partners;

create trigger set_book_supplier_partners_updated_at
before update on public.book_supplier_partners
for each row
execute function public.set_book_supplier_updated_at();

drop trigger if exists set_book_supplier_inquiries_updated_at
  on public.book_supplier_inquiries;

create trigger set_book_supplier_inquiries_updated_at
before update on public.book_supplier_inquiries
for each row
execute function public.set_book_supplier_updated_at();

drop trigger if exists set_book_supplier_inquiry_items_updated_at
  on public.book_supplier_inquiry_items;

create trigger set_book_supplier_inquiry_items_updated_at
before update on public.book_supplier_inquiry_items
for each row
execute function public.set_book_supplier_updated_at();

insert into public.book_supplier_partners (
  slug,
  name,
  is_active
)
values (
  'vogtlaendische-buchhandlung',
  'Vogtländische Buchhandlung',
  true
)
on conflict (slug)
do update set
  name = excluded.name,
  is_active = true,
  updated_at = now();

alter table public.book_supplier_partners enable row level security;
alter table public.book_supplier_inquiries enable row level security;
alter table public.book_supplier_inquiry_items enable row level security;
alter table public.book_supplier_events enable row level security;
