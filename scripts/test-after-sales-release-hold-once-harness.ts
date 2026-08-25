import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(
  "app/api/admin/after-sales/test/release-hold-once/route.ts",
  "utf8",
);
const sql = readFileSync(
  "supabase/migrations/20260812130000_after_sales_phase_a_cas_contracts.sql",
  "utf8",
);

assert.match(route, /requireAdminApiSession\(\)/);
assert.match(route, /getAdminAuditActor\(\)/);
assert.match(route, /hasSameRequestOrigin\(request\)/);
assert.match(route, /hasExactConfirmation\(body, TRIGGER_CONFIRMATION\)/);
assert.match(route, /"Cache-Control": "no-store"/);
assert.match(
  route,
  /TRIGGER_SINGLE_AFTER_SALES_FULFILLMENT_HOLD_RELEASE_TEST/,
);
assert.equal((route.match(/\.rpc\(/g) ?? []).length, 1);
assert.match(route, /"release_after_sales_fulfillment_hold"/);
assert.match(route, /p_expected_case_status: "in_review"/);
assert.match(route, /p_expected_case_revision: 4/);
assert.match(route, /p_expected_fulfillment_revision: 1/);
assert.match(route, /2026-08-25T04:52:26\.375303\+00:00/);
assert.match(route, /CONFIRM_RELEASE_AFTER_SALES_FULFILLMENT_HOLD/);
assert.doesNotMatch(route, /CONFIRM_MANUAL_AFTER_SALES_FULFILLMENT_RELEASE/);
assert.match(route, /p_actor_reference: actor\.actorReference/);
assert.doesNotMatch(route, /body\s*(?:\.|\?\.)\s*(actor|case|request|invoice)/i);
assert.doesNotMatch(route, /retry|for\s*\(|while\s*\(/i);
assert.match(sql, /fulfillment_hold=false/i);
assert.match(sql, /fulfillment_hold_reason=null/i);
assert.match(sql, /fulfillment_hold_set_at=null/i);
assert.match(sql, /fulfillment_hold_case_id=null/i);
assert.match(sql, /fulfillment_hold_requires_manual_release=false/i);
assert.match(sql, /'fulfillment_hold_released'/i);
assert.doesNotMatch(
  sql,
  /execute\s+(format|immediate)|\b(net\.http|http_get|http_post|smtp|createfinalinvoice)\b/i,
);

console.log("after-sales release-hold-once harness: PASS");
