alter table public.school_requests
add column if not exists whatsapp_updates_enabled boolean not null default true;

alter table public.school_requests
add column if not exists whatsapp_updates_requested_at timestamptz;

alter table public.school_requests
add column if not exists whatsapp_updates_opted_out_at timestamptz;

alter table public.school_requests
add column if not exists whatsapp_updates_last_admin_opened_at timestamptz;

create index if not exists school_requests_whatsapp_updates_enabled_idx
on public.school_requests (whatsapp_updates_enabled);
