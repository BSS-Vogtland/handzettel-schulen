import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const helperPath = resolve(root, "app/lib/lexware/lexwarePermitClaimError.ts");
const helperUrl = pathToFileURL(helperPath);
const { classifyLexwarePermitClaimError, LEXWARE_PERMIT_CLAIM_BLOCK_REASONS } =
  await import(helperUrl.href);
const route = readFileSync(resolve(root, "app/api/admin/lexware/invoices/[invoiceId]/claim-production-job/route.ts"), "utf8");
const permitMigration = readFileSync(resolve(root, "supabase/migrations/20260806023000_lexware_object_scoped_production_write_permits.sql"), "utf8");
const nestedMigration = readFileSync(resolve(root, "supabase/migrations/20260803080000_claim_school_lexware_invoice_job_for_processing.sql"), "utf8");
const helper = readFileSync(helperPath, "utf8");

assert.equal(classifyLexwarePermitClaimError({ message: "PERMIT_CLAIM_NOT_READY", code: "P0001" }), "PERMIT_CLAIM_NOT_READY"); // A
assert.equal(classifyLexwarePermitClaimError(new Error("PERMIT_CLAIM_RESULT_MISMATCH")), "PERMIT_CLAIM_RESULT_MISMATCH"); // B
assert.ok(LEXWARE_PERMIT_CLAIM_BLOCK_REASONS.includes("INVOICE_JOB_IDENTITY_CONFLICT")); // C
assert.equal(classifyLexwarePermitClaimError({ message: "AUDIT_EVENT_INSERT_FAILED" }), "UNKNOWN"); // D
assert.equal(classifyLexwarePermitClaimError(new Error("unexpected database failure")), "UNKNOWN"); // E
assert.equal(classifyLexwarePermitClaimError({ code: "23514", message: "unknown" }), "UNKNOWN"); // F
assert.equal(classifyLexwarePermitClaimError({ message: "school_lexware_jobs_status_check" }), "UNKNOWN"); // G
assert.equal(classifyLexwarePermitClaimError({ message: "PERMIT_CLAIM_NOT_READY: raw database detail" }), "UNKNOWN"); // H
assert.equal(classifyLexwarePermitClaimError({ message: "unknown", details: "PERMIT_CLAIM_NOT_READY", hint: "PERMIT_CLAIM_RESULT_MISMATCH" }), "UNKNOWN"); // I
assert.equal(classifyLexwarePermitClaimError({ message: "Error: unknown\n at route.ts:1:1", stack: "secret" }), "UNKNOWN"); // J
assert.equal(classifyLexwarePermitClaimError({ message: "PERMIT_CLAIM_NOT_READY 00000000-0000-4000-8000-000000000000 " + "a".repeat(64) }), "UNKNOWN"); // K
assert.match(route, /code:\s*"CLAIM_BLOCKED",\s*claimBlockReason/); // L
assert.match(route, /status:\s*409/); // M
assert.match(route, /claimLexwareProductionJobWithPermit\(invoiceId, body\.permitId\)/); // N
assert.match(permitMigration, /PERMIT_CLAIM_RESULT_MISMATCH/); // O
assert.doesNotMatch(route + helper, /lexware\.io|fetch\(|axios|https?:\/\//i); // P
assert.doesNotMatch(route + helper, /sendMail|invoice_mail_jobs|smtp/i); // Q
assert.doesNotMatch(route + helper, /invoice_provider|productionWriteEnabled|automaticMailEnabled/); // R
assert.match(route, /requireAdminApiSession/); assert.match(route, /Cache-Control":\s*"no-store"/); // S
assert.match(route, /hasSameRequestOrigin\(request\)/); // T
assert.doesNotMatch(route + helper, /@ts-ignore|@ts-expect-error|@ts-nocheck/); // U
assert.doesNotMatch(route + helper, /\bas any\b/); // V
assert.doesNotMatch(route + helper, /\bas unknown as\b/); // W

for (const reason of LEXWARE_PERMIT_CLAIM_BLOCK_REASONS) {
  assert.ok(
    permitMigration.includes(`'${reason}'`)
      || nestedMigration.includes(`'${reason}'`)
      || [
        "LEXWARE_PERMIT_CLAIM_FAILED",
        "LEXWARE_PERMIT_CLAIM_RESULT_INVALID",
        "INVOICE_JOB_CLAIM_RESULT_INVALID",
      ].includes(reason),
    `allowlisted reason is not backed by the claim path: ${reason}`,
  );
}
assert.doesNotMatch(route, /error\.message|error\.details|error\.hint|error\.stack/);
assert.match(route, /route:\s*"\/api\/admin\/lexware\/invoices\/\[invoiceId\]\/claim-production-job"/);
assert.doesNotMatch(route, /console\.warn\([^\n]*(invoiceId|permitId|claimId|payload)/);

console.log("Lexware permit claim diagnostics A-W PASS");
