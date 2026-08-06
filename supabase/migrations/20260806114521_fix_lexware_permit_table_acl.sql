begin;

revoke delete, truncate, references, trigger, maintain
on table public.school_lexware_production_write_permits
from service_role;

revoke all
on table public.school_lexware_production_write_permits
from public, anon, authenticated;

grant select, insert, update
on table public.school_lexware_production_write_permits
to service_role;

commit;
