import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const moduleUrl = new URL(
  "../app/lib/lexware/lexwareProductionClaimCore.ts",
  import.meta.url,
).href;
const claimCore = await import(moduleUrl);
const { parseLexwareProductionClaim } = claimCore;

const JOB_ID = "00000000-0000-4000-8000-000000000001";
const INVOICE_ID = "00000000-0000-4000-8000-000000000002";
const REQUEST_ID = "00000000-0000-4000-8000-000000000003";
const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000004";
const LEXWARE_ID = "00000000-0000-4000-8000-000000000005";

const validClaim = {
  invoice_job_id: JOB_ID,
  claim_acquired: true,
  read_back_only: false,
  previous_status: "pending",
  job_status: "processing",
  creation_state: "not_attempted",
  attempt_count: 1,
  locked_at: "2026-08-03T10:00:00.000Z",
  lock_expires_at: "2026-08-03T10:01:00.000Z",
  payload_sha256: "a".repeat(64),
  payload_hash_version: "lexware-payload-canonical-v2",
  target_organization_id: ORGANIZATION_ID,
  local_invoice_id: INVOICE_ID,
  request_id: REQUEST_ID,
  lexware_invoice_id: null,
  lexware_invoice_number: null,
};

const blocked = (value: unknown) =>
  assert.throws(
    () => parseLexwareProductionClaim(value),
    (error: unknown) => error instanceof Error && error.message === "INVOICE_JOB_CLAIM_RESULT_INVALID",
  );

assert.equal(parseLexwareProductionClaim(validClaim).invoiceJobId, JOB_ID); console.log("A PASS");
blocked(null); console.log("B PASS");
blocked([]); console.log("C PASS");
blocked({ ...validClaim, invoice_job_id: undefined }); console.log("D PASS");
blocked({ ...validClaim, invoice_job_id: "invalid" }); console.log("E PASS");
blocked({ ...validClaim, payload_sha256: undefined }); console.log("F PASS");
blocked({ ...validClaim, payload_sha256: "A".repeat(64) }); console.log("G PASS");
blocked({ ...validClaim, attempt_count: "1" }); console.log("H PASS");
blocked({ ...validClaim, attempt_count: -1 }); console.log("I PASS");
blocked({ ...validClaim, claim_acquired: "true" }); console.log("J PASS");
blocked({ ...validClaim, target_organization_id: undefined }); console.log("K PASS");
blocked({ ...validClaim, job_status: "pending" }); console.log("L PASS");
assert.equal(parseLexwareProductionClaim(validClaim).lexwareInvoiceId, null); console.log("M PASS");
assert.equal(parseLexwareProductionClaim({ ...validClaim, read_back_only: true, creation_state: "definitely_created", lexware_invoice_id: LEXWARE_ID, lexware_invoice_number: "RE-1" }).lexwareInvoiceId, LEXWARE_ID); console.log("N PASS");
blocked({ ...validClaim, read_back_only: "false" }); console.log("O PASS");
assert.equal(parseLexwareProductionClaim({ ...validClaim, payload_hash_version: "lexware-payload-json-v1" }).payload_hash_version, "lexware-payload-json-v1"); console.log("P PASS");
assert.equal(parseLexwareProductionClaim(validClaim).payload_hash_version, "lexware-payload-canonical-v2"); console.log("Q PASS");
blocked({ ...validClaim, payload_hash_version: undefined }); console.log("R PASS");
blocked({ ...validClaim, payload_hash_version: "unknown" }); console.log("S PASS");
blocked({ ...validClaim, payload_hash_version: 2 }); console.log("T PASS");
assert.equal(parseLexwareProductionClaim(validClaim).payload_hash_version, validClaim.payload_hash_version); console.log("U PASS");
blocked(({ ...validClaim, payload_hash_version: undefined })); console.log("V PASS");

const claimCoreSource = readFileSync("app/lib/lexware/lexwareProductionClaimCore.ts", "utf8");
assert.doesNotMatch(claimCoreSource, /(?:import|require)[^\n]*lexwarePayloadHash/); console.log("W PASS");
const claimMigration = readFileSync("supabase/migrations/20260803080000_claim_school_lexware_invoice_job_for_processing.sql", "utf8");
const versionCheck = claimMigration.indexOf("job_row.payload_hash_version is distinct from p_expected_payload_hash_version");
const hashCheck = claimMigration.indexOf("job_row.payload_sha256 <> p_expected_payload_sha256");
const stateUpdate = claimMigration.indexOf("update public.school_lexware_invoice_jobs set");
assert.match(claimMigration, /p_expected_payload_hash_version text/); console.log("X PASS");
assert.ok(versionCheck >= 0 && stateUpdate > versionCheck); console.log("Y PASS");
assert.match(claimMigration, /returns table[\s\S]*payload_hash_version text[\s\S]*return query[\s\S]*job_row\.payload_hash_version/i); console.log("Z PASS");

const evaluateStoredPayloadConflict = (versionMatches: boolean, hashMatches: boolean) => {
  const conflicts = [
    { position: versionCheck, active: !versionMatches, code: "PAYLOAD_HASH_VERSION_MISMATCH" },
    { position: hashCheck, active: !hashMatches, code: "PAYLOAD_SHA256_MISMATCH" },
  ].filter((candidate) => candidate.active).sort((left, right) => left.position - right.position);
  return conflicts[0]?.code ?? null;
};

assert.equal(evaluateStoredPayloadConflict(false, true), "PAYLOAD_HASH_VERSION_MISMATCH"); console.log("AA PASS");
assert.equal(evaluateStoredPayloadConflict(false, false), "PAYLOAD_HASH_VERSION_MISMATCH"); console.log("AB PASS");
assert.equal(evaluateStoredPayloadConflict(true, false), "PAYLOAD_SHA256_MISMATCH"); console.log("AC PASS");
assert.equal(evaluateStoredPayloadConflict(true, true), null); console.log("AD PASS");
assert.ok(versionCheck >= 0 && hashCheck > versionCheck); console.log("AE PASS");
for (const mutation of ["status = 'processing'", "locked_at = now_value", "locked_by = btrim(p_locked_by)", "lock_expires_at = now_value", "attempt_count = school_lexware_invoice_jobs.attempt_count + 1", "updated_at = now_value"]) {
  const mutationPosition = claimMigration.indexOf(mutation);
  assert.ok(mutationPosition > hashCheck && mutationPosition > versionCheck, `${mutation} must follow both conflict checks`);
}
console.log("AF PASS");
assert.ok(versionCheck < stateUpdate && evaluateStoredPayloadConflict(false, true) !== null); console.log("AG PASS");
assert.ok(hashCheck < stateUpdate && evaluateStoredPayloadConflict(true, false) !== null); console.log("AH PASS");

console.log("PASS A-AH: strict versioned claim parsing and conflict priority; no database or external operations.");
