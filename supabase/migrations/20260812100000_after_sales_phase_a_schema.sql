begin;

-- The composite keys below make every later after-sales mutation bind the
-- request, invoice and invoice item as one object instead of trusting UUIDs
-- independently. Reuse an equivalent existing unique constraint if present.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.school_request_invoices'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (id, request_id)'
  ) then
    alter table public.school_request_invoices
      add constraint school_request_invoices_id_request_unique
      unique (id, request_id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.school_request_invoice_items'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) =
        'UNIQUE (id, invoice_id, request_id)'
  ) then
    alter table public.school_request_invoice_items
      add constraint school_request_invoice_items_object_unique
      unique (id, invoice_id, request_id);
  end if;
end;
$$;

create table public.school_request_after_sales_cases (
  id uuid primary key default gen_random_uuid(),
  case_reference text not null unique,
  request_id uuid not null,
  invoice_id uuid not null,
  intake_withdrawal_request_id uuid null,
  case_type text not null,
  case_status text not null default 'received',
  resolution_type text null,
  scope_type text not null,
  payment_state_snapshot text not null,
  payment_method_snapshot text null,
  payment_snapshot_at timestamptz not null,
  fulfillment_state_snapshot text not null,
  fulfillment_snapshot_at timestamptz not null,
  return_state text not null default 'decision_pending',
  adjustment_requirement text not null default 'pending_decision',
  refund_requirement text not null default 'pending_decision',
  manual_review_reason text null,
  manual_review_set_at timestamptz null,
  scope_locked_at timestamptz null,
  scope_locked_revision integer null,
  scope_locked_reason text null,
  scope_locked_by_actor_type text null,
  scope_locked_by_actor_reference text null,
  resolution_approved_at timestamptz null,
  resolution_approved_by_actor_type text null,
  resolution_approved_by_actor_reference text null,
  resolution_approval_reason text null,
  resolution_confirmation text null,
  created_by_actor_type text not null,
  created_by_actor_reference text not null,
  creation_reason text not null,
  creation_confirmation text not null,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  rejected_at timestamptz null,
  cancelled_at timestamptz null,

  constraint school_request_after_sales_cases_request_fk
    foreign key (request_id)
    references public.school_requests(id)
    on delete restrict,
  constraint school_request_after_sales_cases_invoice_request_fk
    foreign key (invoice_id, request_id)
    references public.school_request_invoices(id, request_id)
    on delete restrict,
  constraint school_request_after_sales_cases_intake_fk
    foreign key (intake_withdrawal_request_id)
    references public.customer_withdrawal_requests(id)
    on delete restrict,
  constraint school_request_after_sales_cases_object_unique
    unique (id, invoice_id, request_id),
  constraint school_request_after_sales_cases_reference_nonempty
    check (nullif(btrim(case_reference), '') is not null),
  constraint school_request_after_sales_cases_case_type_check
    check (case_type in ('cancellation', 'withdrawal', 'complaint')),
  constraint school_request_after_sales_cases_status_check
    check (case_status in (
      'received', 'identity_pending', 'scope_pending',
      'eligibility_review', 'hold_pending', 'in_review',
      'awaiting_customer', 'awaiting_return', 'return_in_transit',
      'return_received', 'return_inspection', 'resolution_approved',
      'adjustment_pending', 'adjustment_processing', 'refund_pending',
      'refund_processing', 'replacement_pending',
      'replacement_processing', 'manual_review', 'completed', 'rejected',
      'cancelled'
    )),
  constraint school_request_after_sales_cases_resolution_check
    check (resolution_type is null or resolution_type in (
      'cancel_without_charge', 'full_refund', 'partial_refund',
      'replacement', 'replacement_and_partial_refund', 'price_reduction',
      'return_and_refund', 'return_without_refund', 'no_financial_action',
      'rejected', 'goodwill', 'manual_resolution'
    )),
  constraint school_request_after_sales_cases_scope_check
    check (scope_type in ('full', 'partial')),
  constraint school_request_after_sales_cases_payment_state_check
    check (payment_state_snapshot in (
      'unpaid', 'paid_provider', 'paid_manual', 'cancelled_or_failed',
      'unknown_or_ambiguous'
    )),
  constraint school_request_after_sales_cases_snapshot_text_check
    check (
      nullif(btrim(fulfillment_state_snapshot), '') is not null
      and (
        payment_method_snapshot is null
        or nullif(btrim(payment_method_snapshot), '') is not null
      )
    ),
  constraint school_request_after_sales_cases_return_state_check
    check (return_state in (
      'not_required', 'decision_pending', 'awaiting_customer_dispatch',
      'in_transit', 'received', 'inspection_pending', 'accepted',
      'partially_accepted', 'rejected', 'lost_or_unclear', 'waived', 'closed'
    )),
  constraint school_request_after_sales_cases_adjustment_check
    check (adjustment_requirement in (
      'not_required', 'pending_decision', 'required_full',
      'required_partial', 'blocked_invoice_not_finalized',
      'blocked_provider_contract', 'completed', 'manual_review'
    )),
  constraint school_request_after_sales_cases_refund_check
    check (refund_requirement in (
      'not_required', 'pending_decision', 'required_full',
      'required_partial', 'manual_payment_required',
      'blocked_payment_identity', 'completed', 'manual_review'
    )),
  constraint school_request_after_sales_cases_actor_type_check
    check (created_by_actor_type in (
      'admin', 'service', 'system', 'customer_intake'
    )),
  constraint school_request_after_sales_cases_creation_audit_check
    check (
      nullif(btrim(created_by_actor_reference), '') is not null
      and nullif(btrim(creation_reason), '') is not null
      and nullif(btrim(creation_confirmation), '') is not null
    ),
  constraint school_request_after_sales_cases_revision_check
    check (revision >= 0),
  constraint school_request_after_sales_cases_manual_review_complete
    check (
      (
        case_status = 'manual_review'
        and nullif(btrim(manual_review_reason), '') is not null
        and manual_review_set_at is not null
      )
      or (
        case_status <> 'manual_review'
        and manual_review_reason is null
        and manual_review_set_at is null
      )
    ),
  constraint school_request_after_sales_cases_scope_lock_complete
    check (
      (
        scope_locked_at is null
        and scope_locked_revision is null
        and scope_locked_reason is null
        and scope_locked_by_actor_type is null
        and scope_locked_by_actor_reference is null
      )
      or (
        scope_locked_at is not null
        and scope_locked_revision is not null
        and scope_locked_revision between 0 and revision
        and nullif(btrim(scope_locked_reason), '') is not null
        and scope_locked_by_actor_type in ('admin', 'service', 'system')
        and nullif(btrim(scope_locked_by_actor_reference), '') is not null
      )
    ),
  constraint school_request_after_sales_cases_resolution_approval_complete
    check (
      (
        resolution_approved_at is null
        and resolution_approved_by_actor_type is null
        and resolution_approved_by_actor_reference is null
        and resolution_approval_reason is null
        and resolution_confirmation is null
      )
      or (
        resolution_approved_at is not null
        and resolution_approved_by_actor_type in ('admin', 'service', 'system')
        and nullif(btrim(resolution_approved_by_actor_reference), '') is not null
        and nullif(btrim(resolution_approval_reason), '') is not null
        and nullif(btrim(resolution_confirmation), '') is not null
      )
    ),
  constraint school_request_after_sales_cases_return_without_refund_manual
    check (
      resolution_type is distinct from 'return_without_refund'
      or (
        resolution_approved_at is not null
        and resolution_approved_by_actor_type = 'admin'
        and nullif(btrim(resolution_approved_by_actor_reference), '') is not null
        and nullif(btrim(resolution_approval_reason), '') is not null
        and resolution_confirmation =
          'CONFIRM_MANUAL_RETURN_WITHOUT_REFUND'
      )
    ),
  constraint school_request_after_sales_cases_terminal_timestamps
    check (
      (case_status = 'completed') = (completed_at is not null)
      and (case_status = 'rejected') = (rejected_at is not null)
      and (case_status = 'cancelled') = (cancelled_at is not null)
    ),
  constraint school_request_after_sales_cases_rejected_resolution
    check (
      (case_status = 'rejected') = (resolution_type = 'rejected')
    ),
  constraint school_request_after_sales_cases_completed_contract
    check (
      case_status <> 'completed'
      or (
        resolution_type is not null
        and return_state in ('not_required', 'waived', 'closed')
        and adjustment_requirement in ('not_required', 'completed')
        and refund_requirement in ('not_required', 'completed')
      )
    )
);

create unique index school_request_after_sales_cases_intake_unique
  on public.school_request_after_sales_cases (intake_withdrawal_request_id)
  where intake_withdrawal_request_id is not null;

create index school_request_after_sales_cases_request_created_idx
  on public.school_request_after_sales_cases (request_id, created_at desc);

create index school_request_after_sales_cases_invoice_created_idx
  on public.school_request_after_sales_cases (invoice_id, created_at desc);

create index school_request_after_sales_cases_status_updated_idx
  on public.school_request_after_sales_cases (case_status, updated_at);

create index school_request_after_sales_cases_type_status_idx
  on public.school_request_after_sales_cases (case_type, case_status);

create index school_request_after_sales_cases_active_idx
  on public.school_request_after_sales_cases (request_id, updated_at)
  where case_status not in ('completed', 'rejected', 'cancelled');

create index school_request_after_sales_cases_manual_review_idx
  on public.school_request_after_sales_cases (updated_at)
  where case_status = 'manual_review';

create index school_request_after_sales_cases_scope_locked_idx
  on public.school_request_after_sales_cases (scope_locked_at)
  where scope_locked_at is not null;

create table public.school_request_after_sales_case_items (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null,
  invoice_item_id uuid not null,
  invoice_id uuid not null,
  request_id uuid not null,
  product_id_snapshot uuid null,
  offer_item_id_snapshot uuid null,
  product_name_snapshot text not null,
  product_sku_snapshot text null,
  invoiced_quantity_snapshot numeric(12, 2) not null,
  requested_quantity numeric(12, 2) not null,
  approved_quantity numeric(12, 2) null,
  unit_snapshot text not null,
  tax_rate_snapshot smallint not null,
  unit_gross_amount_snapshot numeric(12, 2) not null,
  unit_net_amount_snapshot numeric(14, 2) not null,
  line_gross_amount_snapshot numeric(14, 2) not null,
  line_net_amount_snapshot numeric(14, 2) not null,
  line_tax_amount_snapshot numeric(14, 2) not null,
  max_adjustable_gross_amount numeric(14, 2) not null,
  max_refundable_gross_amount numeric(14, 2) not null,
  approved_adjustment_gross_amount numeric(14, 2) null,
  approved_refund_gross_amount numeric(14, 2) null,
  item_resolution_type text null,
  item_resolution_reason text null,
  scope_revision integer not null,
  created_by_actor_type text not null,
  created_by_actor_reference text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint school_request_after_sales_case_items_case_object_fk
    foreign key (case_id, invoice_id, request_id)
    references public.school_request_after_sales_cases(id, invoice_id, request_id)
    on delete restrict,
  constraint school_request_after_sales_case_items_invoice_item_object_fk
    foreign key (invoice_item_id, invoice_id, request_id)
    references public.school_request_invoice_items(id, invoice_id, request_id)
    on delete restrict,
  constraint school_request_after_sales_case_items_case_item_unique
    unique (case_id, invoice_item_id),
  constraint school_request_after_sales_case_items_name_unit_check
    check (
      nullif(btrim(product_name_snapshot), '') is not null
      and nullif(btrim(unit_snapshot), '') is not null
      and (
        product_sku_snapshot is null
        or nullif(btrim(product_sku_snapshot), '') is not null
      )
    ),
  constraint school_request_after_sales_case_items_quantity_check
    check (
      invoiced_quantity_snapshot > 0
      and requested_quantity > 0
      and requested_quantity <= invoiced_quantity_snapshot
      and (
        approved_quantity is null
        or approved_quantity between 0 and requested_quantity
      )
    ),
  constraint school_request_after_sales_case_items_tax_rate_check
    check (tax_rate_snapshot in (7, 19)),
  constraint school_request_after_sales_case_items_amounts_nonnegative
    check (
      unit_gross_amount_snapshot >= 0
      and unit_net_amount_snapshot >= 0
      and line_gross_amount_snapshot >= 0
      and line_net_amount_snapshot >= 0
      and line_tax_amount_snapshot >= 0
      and max_adjustable_gross_amount >= 0
      and max_refundable_gross_amount >= 0
      and (
        approved_adjustment_gross_amount is null
        or approved_adjustment_gross_amount >= 0
      )
      and (
        approved_refund_gross_amount is null
        or approved_refund_gross_amount >= 0
      )
    ),
  constraint school_request_after_sales_case_items_amount_caps
    check (
      max_adjustable_gross_amount <= line_gross_amount_snapshot
      and max_refundable_gross_amount <= line_gross_amount_snapshot
      and (
        approved_adjustment_gross_amount is null
        or approved_adjustment_gross_amount <= max_adjustable_gross_amount
      )
      and (
        approved_refund_gross_amount is null
        or approved_refund_gross_amount <= max_refundable_gross_amount
      )
    ),
  constraint school_request_after_sales_case_items_line_tax_sum
    check (
      abs(
        line_net_amount_snapshot
        + line_tax_amount_snapshot
        - line_gross_amount_snapshot
      ) <= 0.02
    ),
  constraint school_request_after_sales_case_items_resolution_check
    check (
      item_resolution_type is null
      or item_resolution_type in (
        'cancel_without_charge', 'full_refund', 'partial_refund',
        'replacement', 'replacement_and_partial_refund', 'price_reduction',
        'return_and_refund', 'return_without_refund', 'no_financial_action',
        'rejected', 'goodwill', 'manual_resolution'
      )
    ),
  constraint school_request_after_sales_case_items_resolution_reason_complete
    check (
      (item_resolution_type is null and item_resolution_reason is null)
      or (
        item_resolution_type is not null
        and nullif(btrim(item_resolution_reason), '') is not null
      )
    ),
  constraint school_request_after_sales_case_items_scope_revision_check
    check (scope_revision >= 0),
  constraint school_request_after_sales_case_items_actor_check
    check (
      created_by_actor_type in ('admin', 'service', 'system', 'customer_intake')
      and nullif(btrim(created_by_actor_reference), '') is not null
    )
);

comment on column
  public.school_request_after_sales_case_items.max_adjustable_gross_amount is
  'Case-bound upper bound from the immutable invoice item snapshot. This is not the remaining adjustable balance across cases; later adjustment jobs must atomically subtract all prior committed adjustments for the same invoice item.';

comment on column
  public.school_request_after_sales_case_items.max_refundable_gross_amount is
  'Case-bound upper bound from the immutable invoice item snapshot. This is not the remaining refundable balance across cases; later refund jobs must atomically subtract all prior committed refunds for the same invoice item.';

create index school_request_after_sales_case_items_case_idx
  on public.school_request_after_sales_case_items (case_id, invoice_item_id);

create index school_request_after_sales_case_items_invoice_idx
  on public.school_request_after_sales_case_items (invoice_id);

create index school_request_after_sales_case_items_request_idx
  on public.school_request_after_sales_case_items (request_id);

create index school_request_after_sales_case_items_unresolved_idx
  on public.school_request_after_sales_case_items (case_id, created_at)
  where item_resolution_type is null;

create table public.school_request_after_sales_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null,
  revision_before integer not null,
  revision_after integer not null,
  event_type text not null,
  previous_status text null,
  next_status text null,
  actor_type text not null,
  actor_reference text not null,
  reason text not null,
  confirmation text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint school_request_after_sales_case_events_case_fk
    foreign key (case_id)
    references public.school_request_after_sales_cases(id)
    on delete restrict,
  constraint school_request_after_sales_case_events_revision_check
    check (
      revision_before >= 0
      and revision_after >= revision_before
    ),
  constraint school_request_after_sales_case_events_type_check
    check (event_type in (
      'case_created', 'case_status_changed', 'case_scope_changed',
      'case_scope_locked', 'fulfillment_hold_set',
      'fulfillment_hold_released', 'manual_review_entered',
      'manual_review_resolved', 'resolution_approved', 'case_completed',
      'case_rejected', 'case_cancelled'
    )),
  constraint school_request_after_sales_case_events_status_check
    check (
      (
        event_type in (
          'case_status_changed', 'manual_review_entered',
          'manual_review_resolved', 'case_completed', 'case_rejected',
          'case_cancelled'
        )
        and previous_status is not null
        and next_status is not null
        and revision_after = revision_before + 1
      )
      or (
        event_type not in (
          'case_status_changed', 'manual_review_entered',
          'manual_review_resolved', 'case_completed', 'case_rejected',
          'case_cancelled'
        )
        and previous_status is null
        and next_status is null
      )
    ),
  constraint school_request_after_sales_case_events_status_values
    check (
      (
        previous_status is null
        or previous_status in (
          'received', 'identity_pending', 'scope_pending',
          'eligibility_review', 'hold_pending', 'in_review',
          'awaiting_customer', 'awaiting_return', 'return_in_transit',
          'return_received', 'return_inspection', 'resolution_approved',
          'adjustment_pending', 'adjustment_processing', 'refund_pending',
          'refund_processing', 'replacement_pending',
          'replacement_processing', 'manual_review', 'completed', 'rejected',
          'cancelled'
        )
      )
      and (
        next_status is null
        or next_status in (
          'received', 'identity_pending', 'scope_pending',
          'eligibility_review', 'hold_pending', 'in_review',
          'awaiting_customer', 'awaiting_return', 'return_in_transit',
          'return_received', 'return_inspection', 'resolution_approved',
          'adjustment_pending', 'adjustment_processing', 'refund_pending',
          'refund_processing', 'replacement_pending',
          'replacement_processing', 'manual_review', 'completed', 'rejected',
          'cancelled'
        )
      )
    ),
  constraint school_request_after_sales_case_events_actor_check
    check (
      actor_type in ('admin', 'service', 'system', 'customer_intake')
      and nullif(btrim(actor_reference), '') is not null
      and nullif(btrim(reason), '') is not null
      and (
        confirmation is null
        or nullif(btrim(confirmation), '') is not null
      )
    ),
  constraint school_request_after_sales_case_events_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create unique index school_request_after_sales_case_events_transition_unique
  on public.school_request_after_sales_case_events (case_id, revision_after)
  where event_type in (
    'case_status_changed', 'manual_review_entered',
    'manual_review_resolved', 'case_completed', 'case_rejected',
    'case_cancelled'
  );

create unique index school_request_after_sales_case_events_revision_type_unique
  on public.school_request_after_sales_case_events (
    case_id,
    revision_after,
    event_type
  );

create index school_request_after_sales_case_events_created_idx
  on public.school_request_after_sales_case_events (case_id, created_at desc);

create index school_request_after_sales_case_events_type_created_idx
  on public.school_request_after_sales_case_events (event_type, created_at desc);

-- fulfillment_status, picked_at, packed_at and shipped_at already exist and are
-- used by the current fulfillment routes. Only unknown historical state is
-- normalized; real progress such as ready_for_pickup/shipped/picked_up remains.
alter table public.school_requests
  add column fulfillment_timeline_contract_version text null,
  add column fulfillment_hold boolean not null default false,
  add column fulfillment_hold_reason text null,
  add column fulfillment_hold_set_at timestamptz null,
  add column fulfillment_hold_case_id uuid null,
  add column fulfillment_hold_status_snapshot text null,
  add column fulfillment_hold_picking_status_snapshot text null,
  add column fulfillment_hold_requires_manual_release boolean not null
    default false,
  add column fulfillment_revision integer not null default 0,
  add column delivered_at timestamptz null;

update public.school_requests
set fulfillment_status = 'unknown'
where fulfillment_status = 'not_selected';

alter table public.school_requests
  alter column fulfillment_status set default 'not_started';

alter table public.school_requests
  add constraint school_requests_fulfillment_status_phase_a_check
    check (fulfillment_status in (
      'unknown', 'not_started', 'picking', 'picked', 'packed',
      'pickup_requested', 'shipping_requested',
      'ready_for_pickup', 'pickup_ready', 'shipping_ready', 'shipped',
      'delivered', 'picked_up', 'cancelled'
    )),
  add constraint school_requests_fulfillment_timeline_version_check
    check (
      fulfillment_timeline_contract_version is null
      or fulfillment_timeline_contract_version =
        'after-sales-fulfillment-v1'
    ),
  add constraint school_requests_fulfillment_revision_check
    check (fulfillment_revision >= 0),
  add constraint school_requests_fulfillment_hold_case_fk
    foreign key (fulfillment_hold_case_id)
    references public.school_request_after_sales_cases(id)
    on delete restrict,
  add constraint school_requests_fulfillment_hold_complete
    check (
      (
        fulfillment_hold
        and nullif(btrim(fulfillment_hold_reason), '') is not null
        and fulfillment_hold_set_at is not null
        and fulfillment_hold_case_id is not null
        and fulfillment_hold_status_snapshot is not null
        and fulfillment_hold_picking_status_snapshot is not null
      )
      or (
        not fulfillment_hold
        and fulfillment_hold_reason is null
        and fulfillment_hold_set_at is null
        and fulfillment_hold_case_id is null
        and fulfillment_hold_status_snapshot is null
        and fulfillment_hold_picking_status_snapshot is null
        and not fulfillment_hold_requires_manual_release
      )
    ),
  add constraint school_requests_fulfillment_hold_freezes_state
    check (
      not fulfillment_hold
      or (
        fulfillment_status = fulfillment_hold_status_snapshot
        and picking_status = fulfillment_hold_picking_status_snapshot
      )
    ),
  add constraint school_requests_fulfillment_hold_stoppable
    check (
      not fulfillment_hold
      or fulfillment_status not in (
        'unknown', 'shipped', 'delivered', 'picked_up', 'cancelled'
      )
    ),
  add constraint school_requests_fulfillment_hold_manual_release
    check (
      not fulfillment_hold
      or fulfillment_hold_requires_manual_release = (
        fulfillment_hold_status_snapshot in (
          'picking', 'picked', 'packed', 'ready_for_pickup',
          'pickup_ready', 'shipping_ready'
        )
        or fulfillment_hold_picking_status_snapshot in (
          'picking', 'picked', 'packed'
        )
      )
    ),
  add constraint school_requests_fulfillment_timestamps_order
    check (
      fulfillment_timeline_contract_version is distinct from
        'after-sales-fulfillment-v1'
      or (
        (picked_at is null or packed_at is null or packed_at >= picked_at)
        and (
          packed_at is null
          or shipped_at is null
          or shipped_at >= packed_at
        )
        and (
          shipped_at is null
          or delivered_at is null
          or delivered_at >= shipped_at
        )
      )
    );

create index school_requests_fulfillment_hold_case_idx
  on public.school_requests (fulfillment_hold_case_id)
  where fulfillment_hold;

create index school_requests_fulfillment_hold_updated_idx
  on public.school_requests (updated_at)
  where fulfillment_hold;

create index school_requests_fulfillment_status_updated_idx
  on public.school_requests (fulfillment_status, updated_at);

comment on column public.school_requests.fulfillment_hold is
  'Fail-closed operational stop owned by exactly one after-sales case.';

comment on column public.school_requests.fulfillment_timeline_contract_version is
  'NULL preserves unverified legacy timelines. after-sales-fulfillment-v1 may only be set later by an atomic fulfillment contract after validating the existing timeline; Phase A performs no backfill and defines no default.';

comment on column public.school_requests.fulfillment_hold_picking_status_snapshot is
  'Freezes the existing picking_status together with fulfillment_status while an after-sales hold is active.';

comment on table public.school_request_after_sales_cases is
  'Object-bound Phase A after-sales cases. manual_review may later be left only through a dedicated resolve-manual-review RPC, never through the generic transition RPC.';

alter table public.school_request_after_sales_cases enable row level security;
alter table public.school_request_after_sales_case_items enable row level security;
alter table public.school_request_after_sales_case_events enable row level security;

revoke all on table public.school_request_after_sales_cases
  from public, anon, authenticated, service_role;
revoke all on table public.school_request_after_sales_case_items
  from public, anon, authenticated, service_role;
revoke all on table public.school_request_after_sales_case_events
  from public, anon, authenticated, service_role;

-- Existing server repositories use service_role SELECT for operational reads.
-- All Phase A writes remain unavailable until the object-bound mutation RPCs
-- are installed by a later migration.
grant select on table public.school_request_after_sales_cases to service_role;
grant select on table public.school_request_after_sales_case_items to service_role;
grant select on table public.school_request_after_sales_case_events to service_role;

commit;
