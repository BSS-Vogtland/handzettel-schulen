begin;

create extension if not exists pgcrypto;

create table public.school_checkout_test_permits (
  id uuid primary key default gen_random_uuid(),
  permit_hash text not null unique,
  checkout_type text not null,
  target_reference_hash text not null,
  status text not null default 'available',
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  created_by text null,
  metadata jsonb not null default '{}'::jsonb,
  constraint school_checkout_test_permits_type_check
    check (checkout_type = 'offer'),
  constraint school_checkout_test_permits_status_check
    check (status in ('available', 'consumed', 'expired', 'cancelled')),
  constraint school_checkout_test_permits_expiry_check
    check (expires_at > created_at),
  constraint school_checkout_test_permits_hash_check
    check (permit_hash ~ '^[a-f0-9]{64}$'),
  constraint school_checkout_test_permits_target_hash_check
    check (target_reference_hash ~ '^[a-f0-9]{64}$'),
  constraint school_checkout_test_permits_consumption_check
    check (
      (status = 'consumed' and consumed_at is not null)
      or (status <> 'consumed' and consumed_at is null)
    ),
  constraint school_checkout_test_permits_available_check
    check (status <> 'available' or consumed_at is null),
  constraint school_checkout_test_permits_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

create index school_checkout_test_permits_available_expiry_idx
  on public.school_checkout_test_permits (expires_at)
  where status = 'available';

alter table public.school_checkout_test_permits enable row level security;

revoke all on table public.school_checkout_test_permits
  from public, anon, authenticated;

create or replace function public.create_checkout_test_permit(
  p_permit_hash text,
  p_checkout_type text,
  p_target_reference_hash text,
  p_expires_in_minutes integer default 10
)
returns table (
  permit_id uuid,
  checkout_type text,
  target_reference_hash text,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_permit public.school_checkout_test_permits%rowtype;
  created_now timestamptz := clock_timestamp();
begin
  if p_permit_hash is null or p_permit_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'CHECKOUT_TEST_PERMIT_HASH_INVALID';
  end if;
  if p_checkout_type <> 'offer' then
    raise exception 'CHECKOUT_TEST_PERMIT_TYPE_INVALID';
  end if;
  if p_target_reference_hash is null
     or p_target_reference_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'CHECKOUT_TEST_PERMIT_OFFER_TARGET_REQUIRED';
  end if;
  if p_expires_in_minutes is null
     or p_expires_in_minutes < 1
     or p_expires_in_minutes > 30 then
    raise exception 'CHECKOUT_TEST_PERMIT_EXPIRY_INVALID';
  end if;

  insert into public.school_checkout_test_permits (
    permit_hash,
    checkout_type,
    target_reference_hash,
    status,
    created_at,
    expires_at,
    created_by,
    metadata
  ) values (
    p_permit_hash,
    p_checkout_type,
    p_target_reference_hash,
    'available',
    created_now,
    created_now + make_interval(mins => p_expires_in_minutes),
    'admin',
    jsonb_build_object('actor', 'admin', 'result', 'created')
  )
  returning * into created_permit;

  return query select
    created_permit.id,
    created_permit.checkout_type,
    created_permit.target_reference_hash,
    created_permit.created_at,
    created_permit.expires_at;
end;
$$;

create or replace function public.consume_checkout_test_permit(
  p_permit_hash text,
  p_checkout_type text,
  p_target_reference_hash text
)
returns table (
  permit_id uuid,
  consumed_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  consumed_now timestamptz := clock_timestamp();
begin
  if p_permit_hash is null or p_permit_hash !~ '^[a-f0-9]{64}$' then
    return;
  end if;
  if p_checkout_type <> 'offer' then
    return;
  end if;
  if p_target_reference_hash is null
     or p_target_reference_hash !~ '^[a-f0-9]{64}$' then
    return;
  end if;

  return query
  update public.school_checkout_test_permits permit
  set status = 'consumed',
      consumed_at = consumed_now,
      metadata = permit.metadata || jsonb_build_object(
        'actor', 'admin',
        'result', 'consumed'
      )
  where permit.permit_hash = p_permit_hash
    and permit.status = 'available'
    and permit.expires_at > consumed_now
    and permit.checkout_type = p_checkout_type
    and permit.target_reference_hash = p_target_reference_hash
  returning permit.id, permit.consumed_at;
end;
$$;

revoke all on function public.create_checkout_test_permit(text,text,text,integer)
  from public, anon, authenticated;
revoke all on function public.consume_checkout_test_permit(text,text,text)
  from public, anon, authenticated;

grant execute on function public.create_checkout_test_permit(text,text,text,integer)
  to service_role;
grant execute on function public.consume_checkout_test_permit(text,text,text)
  to service_role;

comment on table public.school_checkout_test_permits is
  'Kurzlebige, atomar einmal konsumierbare Admin-Freigaben für Checkout-Tests während Wartung. Enthält keine Kunden- oder Zahlungsdaten.';

commit;
