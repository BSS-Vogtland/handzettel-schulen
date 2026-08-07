import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260807183000_qualify_native_claim_job_selection.sql",
  "utf8",
);

assert.equal((migration.match(/^begin;$/gim) ?? []).length, 1);
assert.equal((migration.match(/^commit;$/gim) ?? []).length, 1);

// A-C: the known OUT-parameter collision and all job-field reads are qualified.
assert.match(
  migration,
  /from public\.school_lexware_invoice_jobs as candidate_job\s+where candidate_job\.local_invoice_id = invoice_row\.id for update;/,
);
assert.doesNotMatch(migration, /where\s+local_invoice_id\s*=/i);
for (const column of [
  "id", "request_id", "trigger_source", "status", "creation_state",
  "payload_sha256", "payload_hash_version", "target_organization_id",
  "lexware_invoice_id", "lexware_invoice_number", "locked_at",
  "lock_expires_at", "locked_by", "attempt_count",
]) {
  assert.match(migration, new RegExp(`job_row\\.${column}\\b`));
}

// D-H: signature, result, security, search_path, and ACL remain exact.
assert.match(migration, /create or replace function public\.claim_native_lexware_invoice_job_for_processing\(\s*p_local_invoice_id uuid,\s*p_expected_payload_sha256 text,\s*p_expected_payload_hash_version text,\s*p_expected_target_organization_id text,\s*p_locked_by text,\s*p_lock_duration_seconds integer\s*\)/);
assert.match(migration, /returns table \(\s*invoice_job_id uuid, claim_acquired boolean, read_back_only boolean,\s*previous_status text, job_status text, creation_state text, attempt_count integer,\s*locked_at timestamptz, lock_expires_at timestamptz, payload_sha256 text,\s*payload_hash_version text, target_organization_id text, local_invoice_id uuid,\s*request_id uuid, lexware_invoice_id text, lexware_invoice_number text\s*\)/);
assert.match(migration, /security definer\s+set search_path = public, pg_temp/);
assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated;/);
assert.match(migration, /grant execute on function[\s\S]*to service_role;/);

// I-O: every existing native claim gate and mutation remains intact.
assert.match(migration, /invoice_row\.invoice_provider is distinct from 'lexware'/);
assert.match(migration, /job_row\.trigger_source is distinct from 'checkout_native_lexware'/);
assert.match(migration, /settings_row\.lexware_production_write_enabled is not true/);
assert.match(migration, /job_row\.payload_sha256 <> p_expected_payload_sha256/);
assert.match(migration, /lower\(job_row\.target_organization_id\) <> lower\(p_expected_target_organization_id\)/);
assert.match(migration, /job_row\.status not in \('pending', 'retry'\)/);
assert.match(migration, /job_row\.creation_state not in \('not_attempted', 'definite_not_created'\)/);
assert.match(migration, /attempt_count = school_lexware_invoice_jobs\.attempt_count \+ 1/);
assert.match(migration, /status = 'processing', locked_at = now_value, locked_by = btrim\(p_locked_by\)/);
assert.match(migration, /lock_expires_at = now_value \+ make_interval\(secs => p_lock_duration_seconds\)/);

// P-Q and migration safety.
assert.doesNotMatch(migration, /lexware\.io|https?:\/\/|\bfetch\s*\(|net\.http/i);
assert.doesNotMatch(migration, /mail|email|smtp/i);
assert.doesNotMatch(migration, /\bcascade\b/i);
assert.doesNotMatch(migration, /\bdrop\s+function\b/i);

type Candidate = {
  invoiceProvider: string;
  source: string;
  status: string;
  creationState: string;
  attemptCount: number;
  hashMatches: boolean;
  organizationMatches: boolean;
  locked: boolean;
  externalIdentityPresent: boolean;
  productionWriteEnabled: boolean;
};

function claimable(candidate: Candidate) {
  return candidate.invoiceProvider === "lexware"
    && candidate.source === "checkout_native_lexware"
    && ["pending", "retry"].includes(candidate.status)
    && ["not_attempted", "definite_not_created"].includes(candidate.creationState)
    && candidate.attemptCount === 0
    && candidate.hashMatches
    && candidate.organizationMatches
    && !candidate.locked
    && !candidate.externalIdentityPresent
    && candidate.productionWriteEnabled;
}

const valid: Candidate = {
  invoiceProvider: "lexware",
  source: "checkout_native_lexware",
  status: "pending",
  creationState: "not_attempted",
  attemptCount: 0,
  hashMatches: true,
  organizationMatches: true,
  locked: false,
  externalIdentityPresent: false,
  productionWriteEnabled: true,
};
assert.equal(claimable(valid), true);
assert.equal(claimable({ ...valid, invoiceProvider: "legacy_internal" }), false);
assert.equal(claimable({ ...valid, source: "admin_manual_enqueue" }), false);
assert.equal(claimable({ ...valid, hashMatches: false }), false);
assert.equal(claimable({ ...valid, organizationMatches: false }), false);
assert.equal(claimable({ ...valid, locked: true }), false);
assert.equal(claimable({ ...valid, externalIdentityPresent: true }), false);
assert.equal(claimable({ ...valid, productionWriteEnabled: false }), false);

console.log("Lexware native claim column qualification A-Q PASS");
