create extension if not exists pgcrypto;

create table if not exists public.school_request_children (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.school_requests(id) on delete cascade,

  sort_order integer not null default 1,
  label text not null,
  child_name text,
  school_name text,
  class_name text,

  source text not null default 'manual',
  notes text,

  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists school_request_children_request_idx
  on public.school_request_children(request_id, sort_order, created_at);

alter table public.school_request_files
  add column if not exists child_id uuid references public.school_request_children(id) on delete set null;

alter table public.school_request_items
  add column if not exists child_id uuid references public.school_request_children(id) on delete set null;

alter table public.school_offer_items
  add column if not exists child_id uuid references public.school_request_children(id) on delete set null;

alter table public.school_request_item_questions
  add column if not exists child_id uuid references public.school_request_children(id) on delete set null;

create index if not exists school_request_files_child_idx
  on public.school_request_files(request_id, child_id);

create index if not exists school_request_items_child_idx
  on public.school_request_items(request_id, child_id);

create index if not exists school_offer_items_child_idx
  on public.school_offer_items(request_id, child_id);

create index if not exists school_request_item_questions_child_idx
  on public.school_request_item_questions(request_id, child_id);

insert into public.school_request_children (
  request_id,
  sort_order,
  label,
  child_name,
  school_name,
  class_name,
  source,
  created_at,
  updated_at
)
select
  request.id,
  1,
  case
    when nullif(trim(coalesce(request.child_name, '')), '') is not null
      then trim(request.child_name)
    else 'Kind 1'
  end as label,
  nullif(trim(coalesce(request.child_name, '')), '') as child_name,
  nullif(trim(coalesce(request.school_name, '')), '') as school_name,
  nullif(trim(coalesce(request.class_name, '')), '') as class_name,
  'backfill_from_request',
  now(),
  now()
from public.school_requests request
where not exists (
  select 1
  from public.school_request_children child
  where child.request_id = request.id
);

update public.school_request_files file
set child_id = child.id
from public.school_request_children child
where
  file.request_id = child.request_id
  and file.child_id is null
  and child.sort_order = 1;

update public.school_request_items item
set child_id = child.id
from public.school_request_children child
where
  item.request_id = child.request_id
  and item.child_id is null
  and child.sort_order = 1;

update public.school_offer_items offer_item
set child_id = child.id
from public.school_request_children child
where
  offer_item.request_id = child.request_id
  and offer_item.child_id is null
  and child.sort_order = 1;

update public.school_request_item_questions question
set child_id = child.id
from public.school_request_children child
where
  question.request_id = child.request_id
  and question.child_id is null
  and child.sort_order = 1;
