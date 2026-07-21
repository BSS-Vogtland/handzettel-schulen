create sequence if not exists public.book_supplier_order_number_seq
  start with 1
  increment by 1
  no minvalue
  no maxvalue
  cache 1;

create or replace function public.next_book_supplier_order_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_value bigint;
begin
  next_value := nextval('public.book_supplier_order_number_seq');

  return
    'VB-A-' ||
    to_char(now(), 'YYYY') ||
    '-' ||
    lpad(next_value::text, 5, '0');
end;
$$;

create table if not exists public.book_supplier_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  request_key uuid not null unique default gen_random_uuid(),
  supplier_id uuid not null references public.book_supplier_partners(id) on delete restrict,
  source_inquiry_id uuid not null references public.book_supplier_inquiries(id) on delete restrict,
  status text not null default 'draft'
    check (
      status in (
        'draft',
        'sent',
        'accepted',
        'partially_accepted',
        'unavailable',
        'ready',
        'completed',
        'cancelled'
      )
    ),
  response_token uuid not null unique default gen_random_uuid(),
  customer_reference text,
  fulfillment_method text not null default 'pickup'
    check (
      fulfillment_method in (
        'pickup',
        'delivery'
      )
    ),
  admin_note text,
  supplier_note text,
  payment_confirmed_by_admin boolean not null default false,
  payment_confirmed_at timestamptz,
  sent_to_email text,
  sent_at timestamptz,
  first_answered_at timestamptz,
  answered_at timestamptz,
  ready_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.book_supplier_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.book_supplier_orders(id) on delete cascade,
  inquiry_item_id uuid not null references public.book_supplier_inquiry_items(id) on delete restrict,
  sort_order integer not null default 0,
  isbn text not null,
  title text not null,
  subtitle text,
  authors text[] not null default '{}',
  publisher text,
  cover_url text,
  quantity integer not null
    check (quantity > 0),
  supplier_status text not null default 'pending'
    check (
      supplier_status in (
        'pending',
        'accepted',
        'partially_accepted',
        'unavailable',
        'ready'
      )
    ),
  accepted_quantity integer
    check (accepted_quantity is null or accepted_quantity >= 0),
  supplier_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, inquiry_item_id)
);

create table if not exists public.book_supplier_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.book_supplier_orders(id) on delete cascade,
  event_type text not null,
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists book_supplier_orders_supplier_idx
  on public.book_supplier_orders(supplier_id);

create index if not exists book_supplier_orders_inquiry_idx
  on public.book_supplier_orders(source_inquiry_id);

create index if not exists book_supplier_orders_status_idx
  on public.book_supplier_orders(status);

create index if not exists book_supplier_orders_created_idx
  on public.book_supplier_orders(created_at desc);

create index if not exists book_supplier_order_items_order_idx
  on public.book_supplier_order_items(order_id);

create index if not exists book_supplier_order_items_isbn_idx
  on public.book_supplier_order_items(isbn);

create index if not exists book_supplier_order_events_order_idx
  on public.book_supplier_order_events(order_id, created_at desc);

drop trigger if exists set_book_supplier_orders_updated_at
  on public.book_supplier_orders;

create trigger set_book_supplier_orders_updated_at
before update on public.book_supplier_orders
for each row
execute function public.set_book_supplier_updated_at();

drop trigger if exists set_book_supplier_order_items_updated_at
  on public.book_supplier_order_items;

create trigger set_book_supplier_order_items_updated_at
before update on public.book_supplier_order_items
for each row
execute function public.set_book_supplier_updated_at();

alter table public.book_supplier_orders enable row level security;
alter table public.book_supplier_order_items enable row level security;
alter table public.book_supplier_order_events enable row level security;
