create extension if not exists pgcrypto;

create table if not exists public.school_product_categories (
  id uuid primary key default gen_random_uuid(),
  value text not null unique,
  label text not null unique,
  keywords text[] not null default '{}',
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_school_product_categories_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_school_product_categories_updated_at
on public.school_product_categories;

create trigger trg_school_product_categories_updated_at
before update on public.school_product_categories
for each row
execute function public.set_school_product_categories_updated_at();

create index if not exists school_product_categories_active_sort_idx
on public.school_product_categories (is_active, sort_order, label);
