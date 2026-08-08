import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260808123000_native_lexware_pre_dispatch_marker_recovery.sql",
  "utf8",
);
const reclaimMigration = readFileSync(
  "supabase/migrations/20260808101500_native_lexware_stale_lock_reclaim.sql",
  "utf8",
);
const markerMigration = readFileSync(
  "supabase/migrations/20260808105500_mark_native_lexware_external_write_started.sql",
  "utf8",
);
const repository = readFileSync(
  "app/lib/lexware/lexwareProductionInvoiceJobRepository.ts",
  "utf8",
);
const processor = readFileSync(
  "app/lib/lexware/lexwareProductionInvoiceProcessorCore.ts",
  "utf8",
);

assert.equal((migration.match(/^begin;$/gim) ?? []).length, 1);
assert.equal((migration.match(/^commit;$/gim) ?? []).length, 1);
assert.match(migration, /create or replace function public\.recover_native_lexware_pre_dispatch_marker/);
assert.match(migration, /security definer\s+set search_path = public, pg_temp/);
assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated;/);
assert.match(migration, /grant execute on function[\s\S]*to service_role;/);
assert.doesNotMatch(migration, /\bcascade\b|execute\s+format|https?:\/\/|lexware\.io|smtp|automatic_mail/i);

// A-F: exact exceptional transition changes only the marker (plus technical updated_at).
assert.match(migration, /p_confirmation is distinct from 'CONFIRM_NO_PROVIDER_DISPATCH_PRE_MARKER_RECOVERY'/);
assert.match(migration, /external_write_started_at = null,\s+updated_at = now_value/);
const updateAssignments = migration.match(
  /update public\.school_lexware_invoice_jobs as recovered_job set([\s\S]*?)where recovered_job\.id/,
)?.[1] ?? "";
assert.doesNotMatch(updateAssignments, /\b(status|attempt_count|creation_state|locked_at|locked_by|lock_expires_at)\s*=/i);

// G-J: expired exact lock, attempt, marker, and all three object identities are CAS-bound.
assert.match(migration, /job_row\.lock_expires_at > now_value[\s\S]*NATIVE_PRE_DISPATCH_RECOVERY_ACTIVE_LOCK/);
assert.match(migration, /job_row\.attempt_count is distinct from p_expected_attempt_count/);
assert.match(migration, /job_row\.attempt_count >= job_row\.max_attempts/);
assert.match(migration, /job_row\.external_write_started_at is distinct from p_expected_external_write_started_at/);
assert.match(migration, /candidate_job\.id = p_job_id/);
assert.match(migration, /candidate_invoice\.id = p_local_invoice_id/);
assert.match(migration, /invoice_row\.request_id is distinct from p_expected_request_id/);

// K-N: payload, organization, credential, and idempotency are checked and repeated in CAS.
assert.match(migration, /NATIVE_PRE_DISPATCH_RECOVERY_PAYLOAD_MISMATCH/);
assert.match(migration, /NATIVE_PRE_DISPATCH_RECOVERY_ORGANIZATION_MISMATCH/);
assert.match(migration, /NATIVE_PRE_DISPATCH_RECOVERY_CREDENTIAL_ALIAS_MISMATCH/);
assert.match(migration, /NATIVE_PRE_DISPATCH_RECOVERY_IDEMPOTENCY_KEY_MISMATCH/);
assert.match(migration, /recovered_job\.payload_sha256 = p_expected_payload_sha256/);
assert.match(migration, /lower\(recovered_job\.target_organization_id\) = lower\(p_expected_target_organization_id\)/);

// O-U: every provider/result/finalization signal and non-pre-dispatch creation state blocks.
for (const field of [
  "lexware_invoice_id", "lexware_invoice_number", "external_write_completed_at",
  "last_external_http_status", "last_error_code", "last_error_message",
  "last_external_retry_after_seconds", "lexware_resource_uri", "lexware_voucher_status",
  "lexware_created_date", "lexware_response_snapshot",
]) {
  assert.match(migration, new RegExp(`job_row\\.${field} is not null`));
}
assert.match(migration, /invoice_row\.lexware_finalized_at is not null/);
assert.match(migration, /job_row\.creation_state is distinct from 'not_attempted'/);

// V-W: fixed confirmation and one sanitized immutable audit event.
assert.equal((migration.match(/'native_pre_dispatch_marker_recovered'/g) ?? []).length, 1);
assert.match(migration, /'previous_started_marker_present', true/);
assert.match(migration, /'provider_dispatch_confirmed_absent', true/);
assert.match(migration, /'recovery_reason', 'controlled_pre_dispatch_stop'/);
assert.doesNotMatch(migration, /payload_snapshot|payload_sha256'|idempotency_key'|credential_alias_snapshot'/);

// X-Z: no provider/mail path, and ambiguous results are never recoverable.
assert.doesNotMatch(migration, /createFinalInvoice|readInvoice|fetch\s*\(|insert\s+into\s+public\.[a-z0-9_]*mail/i);
assert.match(migration, /job_row\.external_write_completed_at is not null[\s\S]*NATIVE_PRE_DISPATCH_RECOVERY_EXTERNAL_STATE_BLOCKED/);
assert.match(migration, /job_row\.last_external_http_status is not null[\s\S]*NATIVE_PRE_DISPATCH_RECOVERY_EXTERNAL_STATE_BLOCKED/);

// AA: once the marker is null, the existing stale-lock contract no longer blocks on it.
assert.match(reclaimMigration, /job_row\.external_write_started_at is not null[\s\S]*NATIVE_RECLAIM_EXTERNAL_WRITE_STATE_BLOCKED/);
assert.match(reclaimMigration, /attempt_count = reclaimed_job\.attempt_count \+ 1/);

// AB-AC: exact return types and fully qualified column references avoid RETURNS TABLE collisions.
assert.match(migration, /returns table \(\s*recovery_applied boolean,\s*job_id uuid,\s*local_invoice_id uuid,\s*status text,\s*attempt_count integer,\s*external_write_started_at timestamptz,\s*creation_state text\s*\)/);
assert.doesNotMatch(migration, /where\s+(id|local_invoice_id|request_id|status|attempt_count|external_write_started_at)\s*=/i);

// The exceptional RPC is deliberately absent from normal application/processor integration.
assert.doesNotMatch(repository, /recover_native_lexware_pre_dispatch_marker/);
assert.doesNotMatch(processor, /recover_native_lexware_pre_dispatch_marker/);
assert.match(markerMigration, /mark_native_lexware_external_write_started/);
assert.match(processor, /markExternalWriteStarted[\s\S]*createFinalInvoice/);

console.log("Lexware native pre-dispatch marker recovery A-AC PASS");
