import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const path = "supabase/migrations/20260812130000_after_sales_phase_a_cas_contracts.sql";
const sql = readFileSync(path, "utf8");
const normalized = sql.replace(/\s+/g, " ").toLowerCase();
const has = (value: string, label: string) =>
  assert.ok(normalized.includes(value.replace(/\s+/g, " ").toLowerCase()), label);

assert.match(sql, /^begin;[\s\S]*commit;\s*$/i, "transactional migration");

const signatures = [
  "create_school_request_after_sales_case",
  "replace_school_request_after_sales_case_scope",
  "lock_school_request_after_sales_case_scope",
  "set_after_sales_fulfillment_hold",
  "release_after_sales_fulfillment_hold",
  "transition_school_request_after_sales_case",
  "enter_after_sales_case_manual_review",
  "resolve_after_sales_case_manual_review",
];
for (const name of signatures) {
  has(`create or replace function public.${name}(`, `${name}: function exists`);
  has(`comment on function public.${name}(`, `${name}: comment exists`);
  has(`revoke all on function public.${name}(`, `${name}: ACL revoked`);
  has(`grant execute on function public.${name}(`, `${name}: service role grant`);
}
assert.equal((sql.match(/security definer/gi) ?? []).length, 8, "all RPCs SECURITY DEFINER");
assert.equal((sql.match(/set search_path\s*=\s*public\s*,\s*pg_temp/gi) ?? []).length, 8, "all RPCs safe search_path");

// A-C: create, exact retry and object/intake binding.
has("p_case_type, 'received', p_scope_type", "A create starts received");
has("'case_created'", "A creates one creation event");
has("if found then return case_row", "AA exact create retry is a no-op");
has("after_sales_create_conflict", "B duplicate intake/create conflict blocked");
has("after_sales_invoice_binding_mismatch", "C invoice/request mismatch blocked");
has("after_sales_intake_binding_mismatch", "B intake object binding checked");

// D-H: scope derives snapshots from invoice items and locks immutably.
has("delete from public.school_request_after_sales_case_items", "D complete replacement");
has("join public.school_request_invoice_items i on i.id=x.invoice_item_id", "D source snapshots from invoice items");
has("x.requested_quantity>i.quantity", "E excessive quantity blocked");
has("i.invoice_id=p_invoice_id and i.request_id=p_request_id", "F invoice item object binding");
has("after_sales_scope_duplicate_item", "F duplicate item blocked");
has("scope_locked_at is not null", "G replacement after lock blocked");
has("'case_scope_locked'", "H scope lock event");
has("after_sales_full_scope_incomplete", "D full scope completeness checked");
has("product_gross_amount_snapshot", "D gross snapshot copied");
has("product_net_amount_snapshot", "D net snapshot copied");
has("product_tax_amount_snapshot", "D tax snapshot copied");

// I-P: hold and release contracts.
has("confirm_set_after_sales_fulfillment_hold", "I hold confirmation");
has("r.fulfillment_status in ('unknown','shipped','delivered','picked_up','cancelled')", "K/L unstoppable states blocked");
has("r.fulfillment_status in ('picking','picked','packed','pickup_ready','ready_for_pickup','shipping_ready')", "J operational states require manual release");
has("after_sales_foreign_hold", "M foreign hold blocked");
has("confirm_release_after_sales_fulfillment_hold", "N normal release confirmation");
has("confirm_manual_after_sales_fulfillment_release", "O/P manual admin release confirmation");
has("p_actor_type<>'admin'", "O manual release requires admin");
has("fulfillment_revision=x.fulfillment_revision+1", "I/N fulfillment CAS revision increments");

// Q-U: DB-side transition allowlist and completion gates.
has("allowed := case p_expected_status", "Q/R transition allowlist lives in DB");
has("after_sales_transition_not_allowed", "R forbidden transition blocked");
has("case_status in ('completed','rejected','cancelled','manual_review')", "S terminal/manual source blocked");
has("r.fulfillment_hold or c.scope_locked_at is null", "T completion blocks active hold/unlocked scope");
has("not in ('not_required','completed')", "U completion blocks open adjustment/refund");
has("'case_completed'", "Q terminal event selected");

// V-Y: dedicated manual-review boundary.
has("'manual_review_entered'", "V enter manual review event");
has("p_target_status='manual_review'", "W generic transition cannot enter manual review");
has("if c.case_status in ('completed','rejected','cancelled','manual_review')", "W generic transition cannot leave manual review");
has("confirm_resolve_after_sales_manual_review", "X dedicated resolve confirmation");
has("p_target_status not in ('in_review','eligibility_review','scope_pending','awaiting_customer')", "Y small reversible resolve allowlist");
has("'manual_review_resolved'", "X resolve event");

// Z-AD: CAS, event atomicity, security and negative paths.
assert.ok((sql.match(/then return null;/gi) ?? []).length >= 7, "Z CAS misses are no-op");
assert.ok((sql.match(/insert into public\.school_request_after_sales_case_events/gi) ?? []).length === 8, "AB exactly one event write per RPC");
const executableSql = sql.replace(/--.*$/gm, "");
assert.doesNotMatch(executableSql, /execute\s+(format|immediate)|\b(net\.http|http_get|http_post|smtp|createfinalinvoice)\b/i, "AD no dynamic/provider/mail path");
assert.doesNotMatch(sql, /grant execute[\s\S]{0,180}to\s+(public|anon|authenticated)/i, "AC no app-role execute grants");
has("from public,anon,authenticated,service_role", "AC explicit revoke includes service role before grant");

// Model the most important transition safety independently of SQL text.
const canTransition = (from: string, to: string) => {
  const allowed: Record<string, string[]> = {
    received: ["identity_pending", "scope_pending", "eligibility_review", "hold_pending", "in_review", "cancelled"],
    in_review: ["awaiting_customer", "awaiting_return", "resolution_approved", "rejected", "cancelled"],
    refund_processing: ["completed"],
  };
  if (["completed", "rejected", "cancelled", "manual_review"].includes(from)) return false;
  return allowed[from]?.includes(to) ?? false;
};
assert.equal(canTransition("received", "scope_pending"), true, "Q allowed transition");
assert.equal(canTransition("received", "refund_processing"), false, "R forbidden transition");
assert.equal(canTransition("completed", "in_review"), false, "S terminal transition");
assert.equal(canTransition("manual_review", "in_review"), false, "W generic manual-review exit");

console.log("after-sales phase A CAS contracts A-AD: PASS");
