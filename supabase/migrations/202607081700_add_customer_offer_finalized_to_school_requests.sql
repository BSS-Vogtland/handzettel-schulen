alter table public.school_requests
add column if not exists customer_offer_finalized_at timestamptz;

alter table public.school_requests
add column if not exists customer_offer_finalized_by text;

create index if not exists school_requests_customer_offer_finalized_at_idx
on public.school_requests (customer_offer_finalized_at);
