import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260808101500_native_lexware_stale_lock_reclaim.sql",
  "utf8",
);
const service = readFileSync(
  "app/lib/lexware/lexwareProductionInvoiceProcessService.ts",
  "utf8",
);
const repository = readFileSync(
  "app/lib/lexware/lexwareProductionInvoiceJobRepository.ts",
  "utf8",
);
const permitMigration = readFileSync(
  "supabase/migrations/20260806023000_lexware_object_scoped_production_write_permits.sql",
  "utf8",
);

assert.equal((migration.match(/^begin;$/gim) ?? []).length, 1);
assert.equal((migration.match(/^commit;$/gim) ?? []).length, 1);
assert.match(migration, /create or replace function public\.reclaim_native_lexware_invoice_job_for_processing/);
assert.match(migration, /security definer\s+set search_path = public, pg_temp/);
assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated;/);
assert.match(migration, /grant execute on function[\s\S]*to service_role;/);
assert.doesNotMatch(migration, /\bcascade\b|execute\s+format|lexware\.io|https?:\/\/|\bmail\b/i);

// A-D: exact stale native recovery and atomic attempt/lock mutation.
assert.match(migration, /job_row\.status is distinct from 'processing'/);
assert.match(migration, /job_row\.creation_state not in \('not_attempted', 'definite_not_created'\)/);
assert.match(migration, /job_row\.lock_expires_at > now_value/);
assert.match(migration, /attempt_count = reclaimed_job\.attempt_count \+ 1/);
assert.doesNotMatch(migration, /status\s*=\s*'(pending|retry)'/);

// E-I: active/non-processing/legacy sources fail closed.
assert.match(migration, /NATIVE_RECLAIM_ACTIVE_LOCK/);
assert.match(migration, /NATIVE_RECLAIM_STATUS_BLOCKED/);
assert.match(migration, /invoice_row\.invoice_provider is distinct from 'lexware'/);
assert.match(migration, /job_row\.trigger_source is distinct from 'checkout_native_lexware'/);

// J-S: binding, external-write, exhaustion, and global database gates.
assert.match(migration, /job_row\.payload_sha256 <> p_expected_payload_sha256/);
assert.match(migration, /NATIVE_RECLAIM_ORGANIZATION_MISMATCH/);
assert.match(migration, /job_row\.lexware_invoice_id is not null/);
assert.match(migration, /job_row\.lexware_invoice_number is not null/);
assert.match(migration, /job_row\.external_write_started_at is not null/);
assert.match(migration, /job_row\.external_write_completed_at is not null/);
assert.match(migration, /job_row\.last_error_code is not null/);
assert.match(migration, /job_row\.last_external_http_status is not null/);
assert.match(migration, /job_row\.last_external_retry_after_seconds is not null/);
assert.match(migration, /invoice_row\.lexware_finalized_at is not null/);
assert.match(migration, /job_row\.attempt_count >= job_row\.max_attempts/);
assert.match(migration, /lexware_production_write_enabled is not true/);
assert.match(migration, /invoice_provider_after <> 'lexware'/);
assert.match(service, /evaluateLexwareProductionGates/);
assert.match(service, /activeMode: runtime\.activeMode/);
assert.match(service, /integrationEnabled: runtime\.integrationEnabled/);

// T-X: return shape, qualification, exactly one sanitized event, no side effects.
assert.match(migration, /returns table \([\s\S]*invoice_job_id uuid[\s\S]*claim_acquired boolean[\s\S]*attempt_count integer[\s\S]*lock_owner text[\s\S]*\)/);
assert.doesNotMatch(migration, /where\s+(id|local_invoice_id|request_id)\s*=/i);
assert.equal((migration.match(/'native_invoice_job_reclaimed'/g) ?? []).length, 1);
assert.match(migration, /'previous_attempt_count'[\s\S]*'new_attempt_count'[\s\S]*'previous_lock_expired'[\s\S]*'source'/);

// Y-AA: processor routes stale native jobs only to reclaim; normal work stays on claim.
assert.match(service, /safeNativeReclaimState[\s\S]*reclaimNativeInvoiceJobForProcessing/);
assert.match(service, /:\s*await claimInvoiceJobForProcessing/);
assert.match(service, /job\.status === "processing" && !safeNativeReclaimState/);
assert.match(repository, /rpc\(\s*"reclaim_native_lexware_invoice_job_for_processing"/);
assert.match(repository, /rpc\("claim_native_lexware_invoice_job_for_processing"/);

// AB: legacy permit contract remains separate and unchanged.
assert.match(permitMigration, /claim_school_lexware_invoice_job_with_permit/);
assert.doesNotMatch(permitMigration, /reclaim_native_lexware_invoice_job_for_processing/);

type ReclaimCandidate = {
  provider: string;
  source: string;
  status: string;
  creationState: string;
  attemptCount: number;
  maxAttempts: number;
  lockExpiresAt: number;
  now: number;
  externalWriteStarted: boolean;
  externalWriteCompleted: boolean;
  externalIdentity: boolean;
  finalized: boolean;
  hashMatches: boolean;
  organizationMatches: boolean;
  writeEnabled: boolean;
  providerCutover: string;
};
function reclaimable(c: ReclaimCandidate) {
  return c.provider === "lexware" && c.source === "checkout_native_lexware"
    && c.status === "processing"
    && ["not_attempted", "definite_not_created"].includes(c.creationState)
    && c.attemptCount < c.maxAttempts && c.lockExpiresAt <= c.now
    && !c.externalWriteStarted && !c.externalWriteCompleted
    && !c.externalIdentity && !c.finalized && c.hashMatches
    && c.organizationMatches && c.writeEnabled && c.providerCutover === "lexware";
}
const valid: ReclaimCandidate = {
  provider: "lexware", source: "checkout_native_lexware", status: "processing",
  creationState: "not_attempted", attemptCount: 1, maxAttempts: 8,
  lockExpiresAt: 1, now: 2, externalWriteStarted: false,
  externalWriteCompleted: false, externalIdentity: false, finalized: false,
  hashMatches: true, organizationMatches: true, writeEnabled: true,
  providerCutover: "lexware",
};
assert.equal(reclaimable(valid), true);
assert.equal(valid.attemptCount + 1, 2);
for (const override of [
  { lockExpiresAt: 3 }, { status: "pending" }, { status: "retry" },
  { provider: "legacy_internal" }, { source: "admin_manual_enqueue" },
  { hashMatches: false }, { organizationMatches: false },
  { externalIdentity: true }, { externalWriteStarted: true },
  { externalWriteCompleted: true }, { finalized: true },
  { attemptCount: 8 }, { writeEnabled: false },
  { providerCutover: "legacy_internal" },
]) assert.equal(reclaimable({ ...valid, ...override }), false);

console.log("Lexware native stale lock reclaim A-AB PASS");
