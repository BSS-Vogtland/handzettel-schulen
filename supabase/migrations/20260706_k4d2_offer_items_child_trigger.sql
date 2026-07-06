create or replace function public.set_school_offer_item_child_id_from_request_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.child_id is null and new.request_item_id is not null then
    select item.child_id
      into new.child_id
      from public.school_request_items item
     where item.id = new.request_item_id
       and (
         new.request_id is null
         or item.request_id = new.request_id
       )
     limit 1;
  end if;

  return new;
end;
$$;

drop trigger if exists school_offer_items_set_child_id_from_request_item
  on public.school_offer_items;

create trigger school_offer_items_set_child_id_from_request_item
before insert or update of request_id, request_item_id, child_id
on public.school_offer_items
for each row
execute function public.set_school_offer_item_child_id_from_request_item();

update public.school_offer_items offer
   set child_id = item.child_id
  from public.school_request_items item
 where offer.request_item_id = item.id
   and offer.request_id = item.request_id
   and offer.child_id is null
   and item.child_id is not null;
