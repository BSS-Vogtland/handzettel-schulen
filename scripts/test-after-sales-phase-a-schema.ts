import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260812100000_after_sales_phase_a_schema.sql"
);
const sql = readFileSync(migrationPath, "utf8");
const normalized = sql.replace(/\s+/g, " ").toLowerCase();

function includes(fragment: string, label: string) {
  assert.ok(
    normalized.includes(fragment.replace(/\s+/g, " ").toLowerCase()),
    label
  );
}

function excludes(pattern: RegExp, label: string) {
  assert.equal(pattern.test(sql), false, label);
}

assert.match(sql, /^begin;[\s\S]*commit;\s*$/i, "migration is transactional");

for (const table of [
  "school_request_after_sales_cases",
  "school_request_after_sales_case_items",
  "school_request_after_sales_case_events",
]) {
  includes(`create table public.${table}`, `${table} is created`);
  includes(`alter table public.${table} enable row level security`, `${table} enables RLS`);
  includes(`revoke all on table public.${table} from public, anon, authenticated, service_role`, `${table} revokes direct access`);
  includes(`grant select on table public.${table} to service_role`, `${table} grants read-only server access`);
}

includes("unique (id, request_id)", "invoice composite key exists");
includes("unique (id, invoice_id, request_id)", "invoice item composite key exists");
includes("foreign key (invoice_id, request_id)", "case binds invoice to request");
includes("foreign key (case_id, invoice_id, request_id)", "case item binds case object");
includes("foreign key (invoice_item_id, invoice_id, request_id)", "case item binds invoice item object");

includes("invoiced_quantity_snapshot numeric(12, 2)", "quantity precision matches invoice items");
includes("requested_quantity numeric(12, 2)", "requested quantity precision matches invoice items");
includes("unit_gross_amount_snapshot numeric(12, 2)", "unit gross precision matches unit_price");
includes("unit_net_amount_snapshot numeric(14, 2)", "unit net uses V2 tax snapshot precision");
includes("line_gross_amount_snapshot numeric(14, 2)", "line gross precision matches V2 snapshot");
includes("line_net_amount_snapshot numeric(14, 2)", "line net precision matches V2 snapshot");
includes("line_tax_amount_snapshot numeric(14, 2)", "line tax precision matches V2 snapshot");
includes("tax_rate_snapshot smallint", "tax rate type matches V2 snapshot");

includes("requested_quantity <= invoiced_quantity_snapshot", "requested quantity is capped");
includes("approved_quantity between 0 and requested_quantity", "approved quantity is capped");
includes("max_adjustable_gross_amount <= line_gross_amount_snapshot", "adjustment is capped");
includes("max_refundable_gross_amount <= line_gross_amount_snapshot", "refund is capped");
includes("not the remaining refundable balance across cases", "cross-case refund remainder is documented");
includes("not the remaining adjustable balance across cases", "cross-case adjustment remainder is documented");

includes("case_status = 'manual_review'", "manual review completeness is constrained");
includes("dedicated resolve-manual-review rpc", "manual review exit is documented as dedicated");
includes("confirm_manual_return_without_refund", "return without refund requires confirmation");
includes("case_status not in ('completed', 'rejected', 'cancelled')", "terminal cases are excluded from active index");

includes("set fulfillment_status = 'unknown' where fulfillment_status = 'not_selected'", "only unknown legacy fulfillment is normalized");
includes("alter column fulfillment_status set default 'not_started'", "future requests default to not_started");
includes("'pickup_requested', 'shipping_requested'", "current checkout fulfillment states remain valid");
includes("add column fulfillment_timeline_contract_version text null", "timeline version is nullable for legacy rows");
includes("fulfillment_timeline_contract_version is null or fulfillment_timeline_contract_version = 'after-sales-fulfillment-v1'", "timeline version has a closed allowlist");
includes("fulfillment_timeline_contract_version is distinct from 'after-sales-fulfillment-v1'", "timeline order is enforced only for explicit V1 rows");
includes("phase a performs no backfill and defines no default", "legacy timeline preservation is documented");
includes("fulfillment_hold_picking_status_snapshot", "hold freezes picking state");
includes("fulfillment_status = fulfillment_hold_status_snapshot", "hold freezes fulfillment status");
includes("picking_status = fulfillment_hold_picking_status_snapshot", "hold freezes picking status");
includes("'unknown', 'shipped', 'delivered', 'picked_up', 'cancelled'", "unstoppable statuses cannot be held");
includes("fulfillment_hold_requires_manual_release", "manual release marker exists");
includes("foreign key (fulfillment_hold_case_id)", "hold is case-bound");

includes("jsonb_typeof(metadata) = 'object'", "event metadata is object-only");
includes("school_request_after_sales_case_events_transition_unique", "one transition event per revision is enforced");

excludes(/create\s+(or\s+replace\s+)?function/i, "migration 1 contains no RPCs");
excludes(/\b(http|net\.http|createfinalinvoice|paypal|smtp)\b/i, "migration has no provider or mail path");
excludes(/\bgrant\s+(insert|update|delete|all)\b/i, "new tables expose no mutation grants");
excludes(/\bactive_after_sales_case_id\b/i, "no redundant active case pointer is added");
excludes(/set\s+fulfillment_timeline_contract_version\s*=/i, "timeline version is never backfilled");
excludes(/alter\s+column\s+fulfillment_timeline_contract_version\s+set\s+default/i, "timeline version has no default");
excludes(/set\s+(picked_at|packed_at|shipped_at|delivered_at)\s*=/i, "existing fulfillment timestamps are never rewritten");

type Timeline = {
  version: null | string;
  pickedAt: string | null;
  packedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
};

function timelineContractAllows(row: Timeline) {
  if (
    row.version !== null &&
    row.version !== "after-sales-fulfillment-v1"
  ) {
    return false;
  }

  if (row.version !== "after-sales-fulfillment-v1") return true;

  const time = (value: string | null) =>
    value === null ? null : Date.parse(value);
  const picked = time(row.pickedAt);
  const packed = time(row.packedAt);
  const shipped = time(row.shippedAt);
  const delivered = time(row.deliveredAt);

  return (
    (picked === null || packed === null || packed >= picked) &&
    (packed === null || shipped === null || shipped >= packed) &&
    (shipped === null || delivered === null || delivered >= shipped)
  );
}

const legacyPackedBeforePicked = {
  pickedAt: "2026-07-29T12:36:53.919Z",
  packedAt: "2026-07-29T12:36:48.721Z",
  shippedAt: null,
  deliveredAt: null,
};
const legacyShippedBeforePacked = {
  pickedAt: "2026-07-15T15:41:20.000Z",
  packedAt: "2026-07-15T15:41:41.648Z",
  shippedAt: "2026-07-15T15:41:28.640Z",
  deliveredAt: null,
};

assert.equal(timelineContractAllows({ version: null, ...legacyPackedBeforePicked }), true, "legacy packed-before-picked remains valid with NULL version");
assert.equal(timelineContractAllows({ version: null, ...legacyShippedBeforePacked }), true, "legacy shipped-before-packed remains valid with NULL version");
assert.equal(timelineContractAllows({ version: "after-sales-fulfillment-v1", ...legacyPackedBeforePicked }), false, "V1 blocks packed-before-picked");
assert.equal(timelineContractAllows({ version: "after-sales-fulfillment-v1", ...legacyShippedBeforePacked }), false, "V1 blocks shipped-before-packed");
assert.equal(timelineContractAllows({ version: "after-sales-fulfillment-v1", pickedAt: "2026-08-12T08:00:00Z", packedAt: "2026-08-12T08:10:00Z", shippedAt: "2026-08-12T08:20:00Z", deliveredAt: "2026-08-12T09:00:00Z" }), true, "V1 accepts a monotone timeline");
assert.equal(timelineContractAllows({ version: "after-sales-fulfillment-v1", pickedAt: null, packedAt: null, shippedAt: "2026-08-12T08:20:00Z", deliveredAt: null }), true, "V1 permits missing intermediate timestamps");
assert.equal(timelineContractAllows({ version: "after-sales-fulfillment-v2", pickedAt: null, packedAt: null, shippedAt: null, deliveredAt: null }), false, "unknown timeline versions are blocked");

const createTableCount = (sql.match(/create table public\.school_request_after_sales_/gi) ?? []).length;
assert.equal(createTableCount, 3, "exactly three after-sales tables are created");

console.log("after-sales phase A schema migration: PASS");
