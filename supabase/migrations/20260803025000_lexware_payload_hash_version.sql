begin;

alter table public.school_lexware_invoice_jobs
  add column payload_hash_version text;

update public.school_lexware_invoice_jobs
set payload_hash_version = 'lexware-payload-json-v1'
where payload_sha256 is not null;

alter table public.school_lexware_invoice_jobs
  add constraint school_lexware_invoice_jobs_payload_hash_pair_check
    check ((payload_sha256 is null) = (payload_hash_version is null)),
  add constraint school_lexware_invoice_jobs_payload_sha256_format_check
    check (payload_sha256 is null or payload_sha256 ~ '^[a-f0-9]{64}$'),
  add constraint school_lexware_invoice_jobs_payload_hash_version_check
    check (payload_hash_version is null or payload_hash_version in (
      'lexware-payload-json-v1',
      'lexware-payload-canonical-v2'
    ));

comment on column public.school_lexware_invoice_jobs.payload_hash_version is
  'Expliziter, unveränderlicher Hashvertrag für payload_snapshot; kein Tabellen-Default und kein automatisches Rehashing.';

commit;
