import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(
  "app/api/admin/after-sales/test/transition-once/route.ts",
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
assert.match(route, /TRIGGER_SINGLE_AFTER_SALES_CASE_TRANSITION_TEST/);
assert.equal((route.match(/\.rpc\(/g) ?? []).length, 1);
assert.match(route, /"transition_school_request_after_sales_case"/);
assert.match(route, /p_expected_status: "received"/);
assert.match(route, /p_expected_revision: 3/);
assert.match(route, /p_target_status: "in_review"/);
assert.match(route, /p_resolution_type: null/);
assert.match(route, /p_return_state: null/);
assert.match(route, /p_adjustment_requirement: null/);
assert.match(route, /p_refund_requirement: null/);
assert.match(route, /p_actor_reference: actor\.actorReference/);
assert.doesNotMatch(route, /body\s*(?:\.|\?\.)\s*(actor|case|request|invoice)/i);
assert.doesNotMatch(route, /retry|for\s*\(|while\s*\(/i);
assert.match(
  sql,
  /when 'received' then p_target_status in \([^)]*'in_review'/i,
);
assert.match(sql, /'case_status_changed'/i);
assert.doesNotMatch(
  sql,
  /execute\s+(format|immediate)|\b(net\.http|http_get|http_post|smtp|createfinalinvoice)\b/i,
);

console.log("after-sales transition-once harness: PASS");
