create extension if not exists pgcrypto;

create or replace function public.recommendation_text_array_has_no_blank_values(input_values text[])
returns boolean
language sql
immutable
as $$
  select coalesce(bool_and(value is not null and btrim(value) <> ''), true)
  from unnest(input_values) as value;
$$;

create table public.recommendation_partners (
  id uuid primary key default gen_random_uuid(),
  project_key text not null default 'handzettel-schulen',
  name text not null,
  slug text not null,
  description text,
  target_url text not null,
  logo_url text,
  active boolean not null default true,
  attribution_days integer not null default 30,
  commission_type text,
  commission_value numeric(12, 2),
  currency text not null default 'EUR',
  disclosure_text text,
  internal_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recommendation_partners_project_key_not_blank check (btrim(project_key) <> ''),
  constraint recommendation_partners_name_not_blank check (btrim(name) <> ''),
  constraint recommendation_partners_slug_format check (
    slug = lower(slug)
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint recommendation_partners_target_url_http check (
    btrim(target_url) = target_url
    and target_url ~* '^https?://'
  ),
  constraint recommendation_partners_attribution_days_range check (
    attribution_days between 1 and 365
  ),
  constraint recommendation_partners_commission_type_allowed check (
    commission_type is null or commission_type in ('percentage', 'fixed')
  ),
  constraint recommendation_partners_commission_value_valid check (
    commission_value is null
    or (
      commission_value >= 0
      and (commission_type <> 'percentage' or commission_value <= 100)
    )
  ),
  constraint recommendation_partners_commission_fields_consistent check (
    (commission_type is null) = (commission_value is null)
  ),
  constraint recommendation_partners_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint recommendation_partners_project_slug_unique unique (project_key, slug),
  constraint recommendation_partners_project_id_unique unique (project_key, id)
);

create table public.recommendation_partner_categories (
  id uuid primary key default gen_random_uuid(),
  project_key text not null default 'handzettel-schulen',
  name text not null,
  slug text not null,
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recommendation_partner_categories_project_key_not_blank check (btrim(project_key) <> ''),
  constraint recommendation_partner_categories_name_not_blank check (btrim(name) <> ''),
  constraint recommendation_partner_categories_slug_format check (
    slug = lower(slug)
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint recommendation_partner_categories_sort_order_nonnegative check (sort_order >= 0),
  constraint recommendation_partner_categories_project_slug_unique unique (project_key, slug),
  constraint recommendation_partner_categories_project_id_unique unique (project_key, id)
);

create table public.recommendation_partner_category_links (
  id uuid primary key default gen_random_uuid(),
  project_key text not null default 'handzettel-schulen',
  partner_id uuid not null,
  category_id uuid not null,
  created_at timestamptz not null default now(),
  constraint recommendation_partner_category_links_project_key_not_blank check (btrim(project_key) <> ''),
  constraint recommendation_partner_category_links_pair_unique unique (partner_id, category_id),
  constraint recommendation_partner_category_links_partner_fk foreign key (project_key, partner_id)
    references public.recommendation_partners (project_key, id)
    on delete cascade,
  constraint recommendation_partner_category_links_category_fk foreign key (project_key, category_id)
    references public.recommendation_partner_categories (project_key, id)
    on delete cascade
);

create table public.recommendation_rules (
  id uuid primary key default gen_random_uuid(),
  project_key text not null default 'handzettel-schulen',
  category_id uuid not null,
  name text not null,
  pattern_type text not null,
  terms text[] not null,
  excluded_terms text[] not null default '{}',
  match_fields text[] not null default array[
    'raw_text',
    'normalized_name',
    'category',
    'product_type',
    'notes'
  ]::text[],
  priority integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recommendation_rules_project_key_not_blank check (btrim(project_key) <> ''),
  constraint recommendation_rules_name_not_blank check (btrim(name) <> ''),
  constraint recommendation_rules_pattern_type_allowed check (pattern_type in ('term', 'phrase')),
  constraint recommendation_rules_terms_not_empty check (cardinality(terms) > 0),
  constraint recommendation_rules_terms_no_blanks check (
    public.recommendation_text_array_has_no_blank_values(terms)
  ),
  constraint recommendation_rules_excluded_terms_no_blanks check (
    public.recommendation_text_array_has_no_blank_values(excluded_terms)
  ),
  constraint recommendation_rules_match_fields_not_empty check (cardinality(match_fields) > 0),
  constraint recommendation_rules_match_fields_no_blanks check (
    public.recommendation_text_array_has_no_blank_values(match_fields)
  ),
  constraint recommendation_rules_match_fields_allowed check (
    match_fields <@ array[
      'raw_text',
      'normalized_name',
      'category',
      'product_type',
      'notes'
    ]::text[]
  ),
  constraint recommendation_rules_priority_range check (priority between -1000 and 1000),
  constraint recommendation_rules_category_fk foreign key (project_key, category_id)
    references public.recommendation_partner_categories (project_key, id)
    on delete cascade
);

create index if not exists recommendation_partners_project_active_idx
  on public.recommendation_partners (project_key, active);

create index if not exists recommendation_partner_categories_project_active_sort_idx
  on public.recommendation_partner_categories (project_key, active, sort_order);

create index if not exists recommendation_partner_category_links_category_idx
  on public.recommendation_partner_category_links (category_id);

create index if not exists recommendation_rules_project_category_active_priority_idx
  on public.recommendation_rules (project_key, category_id, active, priority desc);

create or replace function public.set_recommendation_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_recommendation_partners_updated_at
before update on public.recommendation_partners
for each row execute function public.set_recommendation_updated_at();

create trigger trg_recommendation_partner_categories_updated_at
before update on public.recommendation_partner_categories
for each row execute function public.set_recommendation_updated_at();

create trigger trg_recommendation_rules_updated_at
before update on public.recommendation_rules
for each row execute function public.set_recommendation_updated_at();

alter table public.recommendation_partners enable row level security;
alter table public.recommendation_partner_categories enable row level security;
alter table public.recommendation_partner_category_links enable row level security;
alter table public.recommendation_rules enable row level security;

-- No public policies are created. These tables are service-role-only foundations.
revoke all on table public.recommendation_partners from anon, authenticated;
revoke all on table public.recommendation_partner_categories from anon, authenticated;
revoke all on table public.recommendation_partner_category_links from anon, authenticated;
revoke all on table public.recommendation_rules from anon, authenticated;

comment on column public.recommendation_partners.target_url is
  'Browser redirect destination only. Never fetch this URL from the server.';

comment on column public.recommendation_partners.internal_note is
  'Internal service-role-only note. Never expose through public responses.';
