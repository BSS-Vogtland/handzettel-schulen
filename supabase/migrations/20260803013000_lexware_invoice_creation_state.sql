begin;

alter table public.school_lexware_invoice_jobs
  add column if not exists creation_state text not null default 'not_attempted',
  add column if not exists external_write_started_at timestamptz,
  add column if not exists external_write_completed_at timestamptz,
  add column if not exists last_external_http_status integer,
  add column if not exists last_external_retry_after_seconds integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.school_lexware_invoice_jobs'::regclass
      and conname = 'school_lexware_invoice_jobs_creation_state_check'
  ) then
    alter table public.school_lexware_invoice_jobs
      add constraint school_lexware_invoice_jobs_creation_state_check
      check (creation_state in (
        'not_attempted',
        'definite_not_created',
        'definitely_created',
        'creation_state_unknown'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.school_lexware_invoice_jobs'::regclass
      and conname = 'school_lexware_invoice_jobs_external_write_timestamps'
  ) then
    alter table public.school_lexware_invoice_jobs
      add constraint school_lexware_invoice_jobs_external_write_timestamps
      check (
        external_write_completed_at is null
        or (external_write_started_at is not null and external_write_completed_at >= external_write_started_at)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.school_lexware_invoice_jobs'::regclass
      and conname = 'school_lexware_invoice_jobs_external_http_status_range'
  ) then
    alter table public.school_lexware_invoice_jobs
      add constraint school_lexware_invoice_jobs_external_http_status_range
      check (last_external_http_status is null or last_external_http_status between 100 and 599);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.school_lexware_invoice_jobs'::regclass
      and conname = 'school_lexware_invoice_jobs_retry_after_nonnegative'
  ) then
    alter table public.school_lexware_invoice_jobs
      add constraint school_lexware_invoice_jobs_retry_after_nonnegative
      check (last_external_retry_after_seconds is null or last_external_retry_after_seconds >= 0);
  end if;
end
$$;

comment on column public.school_lexware_invoice_jobs.creation_state is
  'Persistente Klassifikation, ob der einmalige externe Lexware-Write sicher nicht, sicher oder möglicherweise erfolgt ist.';

commit;
