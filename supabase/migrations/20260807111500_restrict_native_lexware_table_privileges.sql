begin;

revoke all privileges
on table public.school_request_invoices
from anon, authenticated;

revoke delete, truncate, references, trigger, maintain
on table public.school_request_invoices
from service_role;

grant select, insert, update
on table public.school_request_invoices
to service_role;

revoke all privileges
on table public.school_request_invoice_items
from anon, authenticated;

revoke update, delete, truncate, references, trigger, maintain
on table public.school_request_invoice_items
from service_role;

grant select, insert
on table public.school_request_invoice_items
to service_role;

revoke all privileges
on table public.school_lexware_invoice_jobs
from public, anon, authenticated;

revoke delete, truncate, references, trigger, maintain
on table public.school_lexware_invoice_jobs
from service_role;

grant select, insert, update
on table public.school_lexware_invoice_jobs
to service_role;

commit;
