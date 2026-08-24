import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const path = "app/api/admin/after-sales/test/hold-once/route.ts";
const route = readFileSync(path, "utf8");
const sql = readFileSync(
  "supabase/migrations/20260812130000_after_sales_phase_a_cas_contracts.sql",
  "utf8",
);
const schema = readFileSync(
  "supabase/migrations/20260812100000_after_sales_phase_a_schema.sql",
  "utf8",
);

assert.match(route, /requireAdminApiSession\(\)/);
assert.match(route, /getAdminAuditActor\(\)/);
assert.match(route, /hasSameRequestOrigin\(request\)/);
assert.match(route, /hasExactConfirmation\(body, TRIGGER_CONFIRMATION\)/);
assert.match(route, /"Cache-Control": "no-store"/);
assert.match(route, /TRIGGER_SINGLE_AFTER_SALES_FULFILLMENT_HOLD_TEST/);
assert.match(route, /CONFIRM_SET_AFTER_SALES_FULFILLMENT_HOLD/);
assert.equal((route.match(/\.rpc\(/g) ?? []).length, 1, "exactly one RPC call");
assert.match(route, /"set_after_sales_fulfillment_hold"/);
assert.match(route, /p_actor_type: actor\.actorType/);
assert.match(route, /p_actor_reference: actor\.actorReference/);
assert.doesNotMatch(
  route,
  /body\s*(?:\.|\?\.)\s*(actor|case|request|invoice)/i,
  "request body cannot supply actor or object bindings",
);
assert.doesNotMatch(route, /retry|for\s*\(|while\s*\(/i);
assert.match(route, /c1bc4f52-f6e2-48fb-aa3a-f6aebcc84953/);
assert.match(route, /0e7544a4-69e9-4813-a93b-47ac34307ccb/);
assert.match(route, /p_expected_case_revision: 2/);
assert.match(route, /p_expected_fulfillment_revision: 0/);

assert.match(schema, /school_requests_fulfillment_hold_freezes_state/);
assert.match(schema, /fulfillment_status = fulfillment_hold_status_snapshot/);
assert.match(schema, /picking_status = fulfillment_hold_picking_status_snapshot/);
assert.match(sql, /raise exception 'AFTER_SALES_FOREIGN_HOLD'/i);

console.log("after-sales hold-once harness: PASS");
