alter table public.recommendation_partners
  add column partner_code text;

with numbered_partners as (
  select
    id,
    project_key,
    row_number() over (
      partition by project_key
      order by created_at, id
    ) as partner_number
  from public.recommendation_partners
)
update public.recommendation_partners as partner
set partner_code = (
  case
    when numbered.project_key = 'handzettel-schulen' then 'HZS'
    else upper(
      rpad(
        left(
          regexp_replace(numbered.project_key, '[^a-zA-Z0-9]', '', 'g'),
          3
        ),
        3,
        'X'
      )
    )
  end
  || '-P-'
  || lpad(numbered.partner_number::text, 6, '0')
)
from numbered_partners as numbered
where partner.id = numbered.id;

alter table public.recommendation_partners
  alter column partner_code set not null,
  add constraint recommendation_partners_partner_code_not_blank
    check (btrim(partner_code) <> '' and partner_code = btrim(partner_code)),
  add constraint recommendation_partners_project_partner_code_unique
    unique (project_key, partner_code);

comment on column public.recommendation_partners.partner_code is
  'Stable internal partner reference. It must not change with name or slug updates.';

alter table public.recommendation_partner_category_links
  add column priority integer not null default 0,
  add column active boolean not null default true,
  add column updated_at timestamptz not null default now(),
  add constraint recommendation_partner_category_links_priority_range
    check (priority between -1000 and 1000);

create trigger trg_recommendation_partner_category_links_updated_at
before update on public.recommendation_partner_category_links
for each row execute function public.set_recommendation_updated_at();

create index if not exists recommendation_partner_category_links_project_category_active_priority_idx
  on public.recommendation_partner_category_links (
    project_key,
    category_id,
    active,
    priority desc
  );
