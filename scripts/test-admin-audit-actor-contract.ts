import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.ADMIN_USER = "Phase-A-Admin";
process.env.ADMIN_PASSWORD = "test-only-secret";

const adminAuthModule = "../app/lib/adminAuth.ts";
const {
  createAdminSessionToken,
  getAdminAuditActorForUsername,
  getAdminAuditActorFromSessionToken,
  verifyAdminSessionToken,
} = await import(adminAuthModule);

const token = await createAdminSessionToken("Phase-A-Admin");
const firstActor = await getAdminAuditActorFromSessionToken(token);
const secondActor = await getAdminAuditActorFromSessionToken(token);

assert.deepEqual(firstActor, {
  actorType: "admin",
  actorReference: "admin:phase-a-admin",
});
assert.deepEqual(secondActor, firstActor, "same session is deterministic");
assert.equal(await verifyAdminSessionToken(token), true, "existing auth remains valid");
assert.equal(
  await getAdminAuditActorFromSessionToken(`${token}tampered`),
  null,
  "invalid session yields no actor"
);
assert.equal(
  getAdminAuditActorForUsername("  PHASE-A-ADMIN  ").actorReference,
  "admin:phase-a-admin",
  "canonical reference normalizes case and whitespace"
);
assert.doesNotMatch(firstActor?.actorReference ?? "", /^[0-9a-f-]{36}$/i);

const apiAuth = readFileSync("app/lib/adminApiAuth.ts", "utf8");
assert.match(apiAuth, /getAdminAuditActorFromSessionToken\(sessionToken\)/);
assert.doesNotMatch(
  apiAuth,
  /request\.(json|formData)|body\?\.actor/,
  "client input cannot override the actor"
);

const sql = readFileSync(
  "supabase/migrations/20260812130000_after_sales_phase_a_cas_contracts.sql",
  "utf8"
);
const functionNames = [
  "create_school_request_after_sales_case",
  "replace_school_request_after_sales_case_scope",
  "lock_school_request_after_sales_case_scope",
  "set_after_sales_fulfillment_hold",
  "release_after_sales_fulfillment_hold",
  "transition_school_request_after_sales_case",
  "enter_after_sales_case_manual_review",
  "resolve_after_sales_case_manual_review",
];

for (const functionName of functionNames) {
  const signature = new RegExp(
    `create or replace function public\\.${functionName}\\([\\s\\S]*?\\)\\s*returns`,
    "i"
  ).exec(sql)?.[0];
  assert.ok(signature, `${functionName}: signature exists`);
  assert.match(signature, /p_actor_reference\s+text/i);
  assert.doesNotMatch(signature, /p_actor_reference\s+uuid/i);
}

const schema = readFileSync(
  "supabase/migrations/20260812100000_after_sales_phase_a_schema.sql",
  "utf8"
);
assert.match(schema, /actor_reference\s+text\s+not null/i);
assert.doesNotMatch(schema, /actor_reference[\s\S]{0,120}references\s+/i);
assert.doesNotMatch(schema, /actor_reference[\s\S]{0,120}::uuid/i);

console.log("admin audit actor contract: PASS");
