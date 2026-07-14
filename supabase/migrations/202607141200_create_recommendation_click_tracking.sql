create table public.recommendation_clicks (
  id uuid primary key default gen_random_uuid(),
  click_token text not null,
  project_key text not null default 'handzettel-schulen',
  partner_id uuid,
  category_id uuid,
  rule_id uuid,
  request_id uuid,
  child_id uuid,
  request_item_id uuid,
  partner_code_snapshot text not null,
  partner_name_snapshot text not null,
  category_name_snapshot text not null,
  matched_term text,
  target_url_snapshot text not null,
  clicked_at timestamptz not null default now(),
  attribution_expires_at timestamptz not null,
  referrer_origin text,
  user_agent text,
  is_probable_bot boolean not null default false,
  created_at timestamptz not null default now(),
  constraint recommendation_clicks_click_token_unique unique (click_token),
  constraint recommendation_clicks_click_token_not_blank check (btrim(click_token) <> ''),
  constraint recommendation_clicks_project_key_not_blank check (btrim(project_key) <> ''),
  constraint recommendation_clicks_partner_code_not_blank check (btrim(partner_code_snapshot) <> ''),
  constraint recommendation_clicks_partner_name_not_blank check (btrim(partner_name_snapshot) <> ''),
  constraint recommendation_clicks_category_name_not_blank check (btrim(category_name_snapshot) <> ''),
  constraint recommendation_clicks_target_url_http check (
    btrim(target_url_snapshot) = target_url_snapshot
    and target_url_snapshot ~* '^https?://'
  ),
  constraint recommendation_clicks_attribution_after_click check (
    attribution_expires_at > clicked_at
  ),
  constraint recommendation_clicks_referrer_origin_length check (
    referrer_origin is null or char_length(referrer_origin) <= 500
  ),
  constraint recommendation_clicks_user_agent_length check (
    user_agent is null or char_length(user_agent) <= 512
  ),
  constraint recommendation_clicks_partner_fk foreign key (partner_id)
    references public.recommendation_partners (id) on delete set null,
  constraint recommendation_clicks_category_fk foreign key (category_id)
    references public.recommendation_partner_categories (id) on delete set null,
  constraint recommendation_clicks_rule_fk foreign key (rule_id)
    references public.recommendation_rules (id) on delete set null,
  constraint recommendation_clicks_request_fk foreign key (request_id)
    references public.school_requests (id) on delete set null,
  constraint recommendation_clicks_child_fk foreign key (child_id)
    references public.school_request_children (id) on delete set null,
  constraint recommendation_clicks_request_item_fk foreign key (request_item_id)
    references public.school_request_items (id) on delete set null
);

create index recommendation_clicks_project_clicked_idx
  on public.recommendation_clicks (project_key, clicked_at desc);

create index recommendation_clicks_partner_clicked_idx
  on public.recommendation_clicks (partner_id, clicked_at desc);

create index recommendation_clicks_category_clicked_idx
  on public.recommendation_clicks (category_id, clicked_at desc);

create index recommendation_clicks_request_idx
  on public.recommendation_clicks (request_id, request_item_id);

alter table public.recommendation_clicks enable row level security;

revoke all on table public.recommendation_clicks from anon, authenticated;

comment on table public.recommendation_clicks is
  'Datensparsame First-Party-Klickattribution für Partnerempfehlungen. Keine IP-Adresse und keine Conversiondaten.';

comment on column public.recommendation_clicks.click_token is
  'Zufälliger, nicht sprechender First-Party-Attributionstoken.';

comment on column public.recommendation_clicks.target_url_snapshot is
  'Service-role-only Ziel-Snapshot zum Klickzeitpunkt. Nie an Kunden ausgeben.';
