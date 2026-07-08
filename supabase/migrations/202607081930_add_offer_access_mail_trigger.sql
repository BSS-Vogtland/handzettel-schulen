alter table public.school_requests
add column if not exists offer_access_mail_trigger text;

create index if not exists school_requests_offer_access_mail_trigger_idx
on public.school_requests (offer_access_mail_trigger);
