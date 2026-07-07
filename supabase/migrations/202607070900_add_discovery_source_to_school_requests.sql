alter table public.school_requests
add column if not exists discovery_source text;

alter table public.school_requests
drop constraint if exists school_requests_discovery_source_check;

alter table public.school_requests
add constraint school_requests_discovery_source_check
check (
  discovery_source is null
  or discovery_source in (
    'instagram',
    'facebook',
    'tiktok',
    'google',
    'flyer_aushang',
    'empfehlung'
  )
);

create index if not exists school_requests_discovery_source_idx
on public.school_requests (discovery_source);
