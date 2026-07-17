-- ============================================================
-- Handzettel-Schulen.de
-- Offene Identitätsfreigabe nach einem echten Empfehlungsklick
-- automatisch mit dem entstandenen Klick verbinden.
-- ============================================================

create or replace function public.link_recommendation_identity_consent_to_click()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  consent_id_value uuid;
begin
  if new.is_probable_bot = true then
    return new;
  end if;

  if new.partner_id is null
    or new.request_id is null
    or new.request_item_id is null
  then
    return new;
  end if;

  select consent.id
  into consent_id_value
  from public.recommendation_identity_consents as consent
  where consent.project_key = new.project_key
    and consent.partner_id = new.partner_id
    and consent.request_id = new.request_id
    and consent.request_item_id = new.request_item_id
    and consent.status = 'granted'
    and consent.revoked_at is null
    and consent.click_id is null
  order by consent.granted_at desc
  limit 1;

  if consent_id_value is null then
    return new;
  end if;

  update public.recommendation_identity_consents
  set
    click_id = new.id,
    partner_name_snapshot = new.partner_name_snapshot,
    partner_code_snapshot = new.partner_code_snapshot,
    updated_at = now()
  where id = consent_id_value
    and click_id is null
    and status = 'granted'
    and revoked_at is null;

  return new;
end;
$$;

drop trigger if exists
  recommendation_clicks_link_identity_consent
on public.recommendation_clicks;

create trigger
  recommendation_clicks_link_identity_consent
after insert
on public.recommendation_clicks
for each row
execute function
  public.link_recommendation_identity_consent_to_click();