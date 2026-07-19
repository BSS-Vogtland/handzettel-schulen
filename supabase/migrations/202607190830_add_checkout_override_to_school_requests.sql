alter table public.school_requests
add column if not exists checkout_override_enabled boolean not null default false;

alter table public.school_requests
add column if not exists checkout_override_at timestamptz;

alter table public.school_requests
add column if not exists checkout_override_note text;

alter table public.school_requests
add column if not exists checkout_override_by text;

create index if not exists school_requests_checkout_override_enabled_idx
on public.school_requests (checkout_override_enabled)
where checkout_override_enabled = true;
