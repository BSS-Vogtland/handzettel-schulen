-- Production PayPal pre-migration audit. SELECT/WITH only; returns counts and catalog metadata, never IDs or payloads.
with expected_columns(name, data_type, nullable, default_zero) as (
  values
    ('paypal_payment_fingerprint', 'text', true, false),
    ('paypal_create_request_id', 'text', true, false),
    ('paypal_capture_request_id', 'text', true, false),
    ('paypal_webhook_event_id', 'text', true, false),
    ('paypal_captured_amount_cents', 'bigint', true, false),
    ('paypal_captured_currency', 'text', true, false),
    ('paypal_payment_source', 'text', true, false),
    ('paypal_follow_up_state', 'text', true, false),
    ('paypal_follow_up_claimed_at', 'timestamp with time zone', true, false),
    ('paypal_follow_up_claimed_by', 'text', true, false),
    ('paypal_follow_up_completed_at', 'timestamp with time zone', true, false),
    ('paypal_follow_up_last_error_code', 'text', true, false),
    ('paypal_follow_up_last_error_message', 'text', true, false),
    ('paypal_follow_up_attempt_count', 'integer', false, true)
), column_status as (
  select e.name, exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'school_request_invoices'
      and c.column_name = e.name
      and c.data_type = e.data_type
      and (c.is_nullable = 'YES') = e.nullable
      and (
        (not e.default_zero and c.column_default is null)
        or (e.default_zero and regexp_replace(coalesce(c.column_default, ''), '[^0-9-]', '', 'g') = '0')
      )
  ) present
  from expected_columns e
), expected_constraints(name) as (
  values ('school_request_invoices_paypal_follow_up_state_check')
), constraint_status as (
  select e.name, exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.school_request_invoices'::regclass
      and c.conname = e.name
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%paypal_follow_up_state IS NULL%'
      and pg_get_constraintdef(c.oid) like '%pending%'
      and pg_get_constraintdef(c.oid) like '%processing%'
      and pg_get_constraintdef(c.oid) like '%completed%'
      and pg_get_constraintdef(c.oid) like '%failed_retryable%'
      and pg_get_constraintdef(c.oid) like '%failed_terminal%'
  ) present
  from expected_constraints e
), unexpected_constraint_count as (
  select count(*)::integer value
  from pg_constraint c
  where c.conrelid = 'public.school_request_invoices'::regclass
    and c.conname like 'school_request_invoices_paypal_%'
    and not exists (select 1 from expected_constraints e where e.name = c.conname)
), expected_indexes(name, column_name) as (
  values
    ('school_request_invoices_paypal_order_unique', 'paypal_order_id'),
    ('school_request_invoices_paypal_capture_unique', 'paypal_capture_id'),
    ('school_request_invoices_paypal_event_unique', 'paypal_webhook_event_id'),
    ('school_request_invoices_paypal_create_request_unique', 'paypal_create_request_id'),
    ('school_request_invoices_paypal_capture_request_unique', 'paypal_capture_request_id')
), index_status as (
  select e.name, exists (
    select 1
    from pg_class idx
    join pg_namespace n on n.oid = idx.relnamespace
    join pg_index i on i.indexrelid = idx.oid
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
    where n.nspname = 'public'
      and idx.relname = e.name
      and i.indrelid = 'public.school_request_invoices'::regclass
      and i.indisunique
      and i.indnatts = 1
      and a.attname = e.column_name
      and lower(regexp_replace(pg_get_expr(i.indpred, i.indrelid), '[()[:space:]]', '', 'g'))
        = lower(e.column_name || 'isnotnull')
  ) present
  from expected_indexes e
), unexpected_index_count as (
  select count(*)::integer value
  from pg_indexes i
  where i.schemaname = 'public'
    and i.tablename = 'school_request_invoices'
    and i.indexname like 'school_request_invoices_paypal_%'
    and not exists (select 1 from expected_indexes e where e.name = i.indexname)
), expected_new_rpcs(name, argument_types) as (
  values
    ('register_paypal_order', 'uuid, text, text, text, jsonb, timestamp with time zone'),
    ('claim_verified_paypal_payment', 'uuid, text, text, text, text, bigint, text, text, text, timestamp with time zone'),
    ('claim_paypal_payment_follow_up', 'uuid, text, text, bigint, text, text, timestamp with time zone'),
    ('complete_paypal_payment_follow_up', 'uuid, text, text, bigint, text, text, text, text, timestamp with time zone'),
    ('fail_paypal_payment_follow_up', 'uuid, text, text, text, boolean, timestamp with time zone')
), rpc_catalog as (
  select
    p.oid,
    p.proname name,
    oidvectortypes(p.proargtypes) argument_types,
    pg_get_function_result(p.oid) result_type,
    p.prosecdef security_definer,
    coalesce(array_to_string(p.proconfig, ','), '') function_config,
    exists (
      select 1
      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      join pg_roles r on r.oid = acl.grantee
      where r.rolname = 'service_role' and acl.privilege_type = 'EXECUTE'
    ) service_role_execute,
    exists (
      select 1
      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      left join pg_roles r on r.oid = acl.grantee
      where acl.privilege_type = 'EXECUTE'
        and (acl.grantee = 0 or r.rolname in ('anon', 'authenticated'))
    ) forbidden_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (select name from expected_new_rpcs)
), rpc_status as (
  select e.name, e.argument_types, exists (
    select 1
    from rpc_catalog r
    where r.name = e.name
      and r.argument_types = e.argument_types
      and r.result_type = 'jsonb'
      and r.security_definer
      and r.function_config ~ '(^|,)search_path=pg_catalog, public(,|$)'
      and r.service_role_execute
      and not r.forbidden_execute
  ) present
  from expected_new_rpcs e
), forbidden_legacy_rpcs as (
  select count(*)::integer value
  from rpc_catalog r
  where not exists (
    select 1
    from expected_new_rpcs e
    where e.name = r.name and e.argument_types = r.argument_types
  )
), object_counts as (
  select
    (select count(*)::integer from expected_columns) expected_column_count,
    (select count(*)::integer from column_status where present) existing_column_count,
    (select count(*)::integer from expected_constraints) expected_constraint_count,
    (select count(*)::integer from constraint_status where present) existing_constraint_count,
    (select value from unexpected_constraint_count) unexpected_constraint_count,
    (select count(*)::integer from expected_indexes) expected_index_count,
    (select count(*)::integer from index_status where present) existing_index_count,
    (select value from unexpected_index_count) unexpected_index_count,
    (select count(*)::integer from expected_new_rpcs) expected_new_rpc_count,
    (select count(*)::integer from rpc_status where present) existing_new_rpc_count,
    (select value from forbidden_legacy_rpcs) forbidden_legacy_rpc_count
), state_flags as (
  select c.*,
    (
      existing_column_count = 0
      and existing_constraint_count = 0
      and unexpected_constraint_count = 0
      and existing_index_count = 0
      and unexpected_index_count = 0
      and existing_new_rpc_count = 0
      and forbidden_legacy_rpc_count = 0
    ) old_state_valid,
    (
      existing_column_count = expected_column_count
      and existing_constraint_count = expected_constraint_count
      and unexpected_constraint_count = 0
      and existing_index_count = expected_index_count
      and unexpected_index_count = 0
      and existing_new_rpc_count = expected_new_rpc_count
      and forbidden_legacy_rpc_count = 0
    ) new_state_valid
  from object_counts c
), state_contract as (
  select f.*,
    not old_state_valid and not new_state_valid partial_state_detected,
    case
      when old_state_valid then 'OLD_CLEAN'
      when new_state_valid then 'NEW_COMPLETE'
      else 'PARTIAL_BLOCKED'
    end paypal_schema_state
  from state_flags f
), invoice_facts as (
  select
    count(*) filter (where nullif(to_jsonb(i)->>'paypal_order_id', '') is not null) paypal_order_count,
    count(*) filter (where nullif(to_jsonb(i)->>'paypal_capture_id', '') is not null) paypal_capture_count,
    count(*) filter (where nullif(to_jsonb(i)->>'paypal_webhook_event_id', '') is not null) paypal_event_id_count,
    count(*) filter (where to_jsonb(i)->>'paypal_follow_up_state' = 'pending') pending_count,
    count(*) filter (where to_jsonb(i)->>'paypal_follow_up_state' = 'processing') processing_count,
    count(*) filter (where to_jsonb(i)->>'paypal_follow_up_state' = 'completed') completed_count,
    count(*) filter (where to_jsonb(i)->>'paypal_follow_up_state' = 'failed_retryable') retryable_count,
    count(*) filter (where to_jsonb(i)->>'paypal_follow_up_state' = 'failed_terminal') terminal_count
  from public.school_request_invoices i
), payment_event_facts as (
  select count(*) filter (where to_jsonb(e)->>'payment_provider' = 'paypal') paypal_payment_event_count
  from public.school_request_payment_events e
), link_facts as (
  select
    count(*) filter (where nullif(to_jsonb(i)->>'lexware_invoice_job_id', '') is not null) invoice_lexware_job_link_count,
    count(*) filter (where nullif(to_jsonb(i)->>'mail_job_id', '') is not null) invoice_mail_job_link_count
  from public.school_request_invoices i
)
select
  (select jsonb_object_agg(name, present order by name) from column_status) expected_columns,
  (select jsonb_object_agg(name, present order by name) from constraint_status) expected_constraints,
  (select jsonb_object_agg(name, present order by name) from index_status) expected_indexes,
  (select jsonb_object_agg(name, jsonb_build_object('argument_types', argument_types, 'present_and_secure', present) order by name) from rpc_status) expected_new_rpcs,
  state_contract.*,
  old_state_valid as migration_safe_to_apply,
  new_state_valid as migration_already_fully_applied,
  invoice_facts.*,
  payment_event_facts.*,
  link_facts.*
from state_contract
cross join invoice_facts
cross join payment_event_facts
cross join link_facts;
