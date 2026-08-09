import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ProcessorDependencies } from "../app/lib/lexware/lexwareProductionInvoiceProcessorCore";

const moduleUrl = (path: string) => new URL(path, import.meta.url).href;
const processorModule = await import(moduleUrl("../app/lib/lexware/lexwareProductionInvoiceProcessorCore.ts"));
const transitionModule = await import(moduleUrl("../app/lib/lexware/lexwareProductionTransitionCore.ts"));
const jobModule = await import(moduleUrl("../app/lib/lexware/lexwareProductionInvoiceJob.ts"));
const { processLexwareProductionInvoiceCore } = processorModule;
const { canOfferLexwareJobForAtomicWriteClaim, classifyExistingLexwareIdentityState } = transitionModule;
const { canAttemptExternalWrite } = jobModule;

const migration = readFileSync(
  "supabase/migrations/20260808105500_mark_native_lexware_external_write_started.sql",
  "utf8",
);
const service = readFileSync("app/lib/lexware/lexwareProductionInvoiceProcessService.ts", "utf8");
const repository = readFileSync("app/lib/lexware/lexwareProductionInvoiceJobRepository.ts", "utf8");
const reclaimMigration = readFileSync(
  "supabase/migrations/20260808101500_native_lexware_stale_lock_reclaim.sql",
  "utf8",
);

assert.equal((migration.match(/^begin;$/gim) ?? []).length, 1);
assert.equal((migration.match(/^commit;$/gim) ?? []).length, 1);
assert.match(migration, /create or replace function public\.mark_native_lexware_external_write_started/);
assert.match(migration, /security definer\s+set search_path = public, pg_temp/);
assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated;/);
assert.match(migration, /grant execute on function[\s\S]*to service_role;/);
assert.doesNotMatch(migration, /\bcascade\b|execute\s+format|https?:\/\/|lexware\.io/i);

// A-L: exact CAS prerequisites and one started marker.
assert.match(migration, /job_row\.status is distinct from 'processing'/);
assert.match(migration, /job_row\.lock_expires_at <= now_value/); // B
assert.match(migration, /job_row\.locked_by is distinct from btrim\(p_expected_locked_by\)/); // C
assert.match(migration, /job_row\.attempt_count is distinct from p_expected_attempt_count/); // D
assert.match(migration, /invoice_row\.invoice_provider is distinct from 'lexware'/); // E
assert.match(migration, /job_row\.trigger_source is distinct from 'checkout_native_lexware'/); // F
assert.match(migration, /job_row\.payload_sha256 is distinct from p_expected_payload_sha256/); // G
assert.match(migration, /NATIVE_WRITE_MARKER_ORGANIZATION_MISMATCH/); // H
assert.match(migration, /invoice_row\.lexware_invoice_id is not null/); // I
assert.match(migration, /job_row\.external_write_started_at is not null/); // J
assert.match(migration, /job_row\.external_write_completed_at is not null/); // K
assert.equal((migration.match(/external_write_started_at = now_value/g) ?? []).length, 1); // L
assert.match(migration, /marked_job\.lock_expires_at > now_value[\s\S]*marked_job\.external_write_started_at is null/);
assert.match(repository, /rpc\(\s*"mark_native_lexware_external_write_started"/);

const ORG = "11111111-1111-4111-8111-111111111111";
const EXTERNAL_ID = "22222222-2222-4222-8222-222222222222";
type FixtureOptions = {
  markerFails?: boolean;
  markerMismatch?: boolean;
  createFails?: boolean;
  markerRequired?: boolean;
};
function fixture(options: FixtureOptions = {}) {
  const events: string[] = [];
  const transitions: Array<Record<string, unknown>> = [];
  let markers = 0;
  let posts = 0;
  const invoice = {
    id: "invoice-1", request_id: "request-1", invoice_provider: "lexware",
    tax_snapshot_version: "invoice-tax-snapshot-v2", tax_snapshot_status: "complete",
  };
  const job = {
    id: "job-1", status: "pending" as const, creation_state: "not_attempted" as const,
    payload_sha256: "a".repeat(64), payload_hash_version: "lexware-payload-canonical-v2" as const,
    attempt_count: 0, lexware_invoice_id: null, locked_at: null, locked_by: null,
    lock_expires_at: null, local_invoice_id: invoice.id, request_id: invoice.request_id,
    trigger_source: "checkout_native_lexware", target_organization_id: ORG,
  };
  const payload = {
    payload: { lineItems: [{}], paymentConditions: { paymentTermLabel: "7 Tage" } },
    expected: { totalGrossAmount: 1, totalNetAmount: 0.84, totalTaxAmount: 0.16, taxRates: [] },
  };
  const deps: ProcessorDependencies = {
    classifyIdentity: classifyExistingLexwareIdentityState,
    canOfferForAtomicWriteClaim: canOfferLexwareJobForAtomicWriteClaim,
    classifyTransition: () => "native_lexware_invoice",
    canAttemptExternalWrite,
    isValidJobCreationStateCombination: () => true,
    loadLocalInvoice: async () => invoice,
    loadOrCreateJob: async () => job,
    loadPersistedPayload: async () => payload,
    buildPayload: async () => payload,
    validatePayload: () => ({ valid: true }),
    parsePayloadHashVersion: () => "lexware-payload-canonical-v2",
    hashPayload: () => "a".repeat(64),
    validateOrganization: () => ORG,
    evaluateGates: () => ({ allowed: true, checks: {}, failedChecks: [] }),
    claimForWrite: async () => ({
      invoiceJobId: job.id, claimAcquired: true, readBackOnly: false,
      previousStatus: "pending", attemptCount: 1, localInvoiceId: invoice.id,
      requestId: invoice.request_id, payloadSha256: job.payload_sha256,
      payloadHashVersion: job.payload_hash_version, targetOrganizationId: ORG,
      jobStatus: "processing", creationState: job.creation_state,
      lockedAt: "2026-08-08T10:00:00.000Z", lockExpiresAt: "2026-08-08T10:05:00.000Z",
      lexwareInvoiceId: null, lexwareInvoiceNumber: null, lockOwner: "native-process:test",
    }),
    externalWriteMarkerRequired: options.markerRequired ?? true,
    markExternalWriteStarted: async (input) => {
      events.push("marker"); markers += 1;
      if (options.markerFails) throw new Error("MARKER_FAILED");
      return {
        invoiceJobId: options.markerMismatch ? "other-job" : input.invoiceJobId,
        externalWriteStarted: true, externalWriteStartedAt: "2026-08-08T10:00:01.000Z",
        attemptCount: input.attemptCount, jobStatus: "processing", creationState: input.creationState,
      };
    },
    persistJobTransition: async (transition) => { transitions.push(transition); },
    createFinalInvoice: async () => {
      events.push("post"); posts += 1;
      if (options.createFails) {
        throw Object.assign(new Error("TIMEOUT"), { creationState: "creation_state_unknown" });
      }
      return {
        id: EXTERNAL_ID, resourceUri: `https://api.lexware.io/v1/invoices/${EXTERNAL_ID}`,
        createdDate: "2026-08-08T10:00:02.000Z", updatedDate: null,
        version: 1, requestCount: 1, finalize: true, creationState: "definitely_created",
      };
    },
    persistExternalResult: async () => undefined,
    readInvoice: async () => ({
      id: EXTERNAL_ID, voucherStatus: "open", voucherNumber: "RE-1", organizationId: ORG,
      lineItems: [], paymentTermLabel: "7 Tage",
      totalPrice: { currency: "EUR", totalNetAmount: 0.84, totalGrossAmount: 1, totalTaxAmount: 0.16 },
      taxAmounts: [],
    }),
    compareReadBack: () => [],
    currentTime: () => "2026-08-08T10:00:00.000Z",
  };
  return { deps, events, transitions, get markers() { return markers; }, get posts() { return posts; } };
}

// M: the provider client is called only after the marker succeeds.
let test = fixture();
let result = await processLexwareProductionInvoiceCore(test.deps);
assert.deepEqual(test.events, ["marker", "post"]);
assert.equal(test.markers, 1);
assert.equal(test.posts, 1);
assert.equal(result.outcome, "succeeded");

// N: marker failure or a mismatched CAS result performs no POST.
for (const options of [{ markerFails: true }, { markerMismatch: true }]) {
  test = fixture(options);
  result = await processLexwareProductionInvoiceCore(test.deps);
  assert.equal(test.markers, 1);
  assert.equal(test.posts, 0);
  assert.equal(result.postCount, 0);
}

// O/Q: an ambiguous provider outcome is manual review, never retried; success reaches read-back/finalize.
test = fixture({ createFails: true });
result = await processLexwareProductionInvoiceCore(test.deps);
assert.equal(test.markers, 1);
assert.equal(test.posts, 1);
assert.equal(result.outcome, "manual_review");
assert.equal(test.transitions.at(-1)?.status, "manual_review");
assert.equal(test.transitions.at(-1)?.creation_state, "creation_state_unknown");

// P: every stale native reclaim remains blocked after the marker is present.
assert.match(reclaimMigration, /job_row\.external_write_started_at is not null[\s\S]*NATIVE_RECLAIM_EXTERNAL_WRITE_STATE_BLOCKED/);

// R/S: no mail path; legacy/permit processing remains possible without the native marker contract.
assert.doesNotMatch(migration, /insert\s+into\s+public\.[a-z0-9_]*mail|smtp|automatic_mail/i);
test = fixture({ markerRequired: false });
delete test.deps.markExternalWriteStarted;
result = await processLexwareProductionInvoiceCore(test.deps);
assert.deepEqual(test.events, ["post"]);
assert.equal(result.outcome, "succeeded");
assert.match(service, /externalWriteMarkerRequired: nativeProductionJob/);
assert.match(service, /markExternalWriteStarted:[\s\S]*markNativeLexwareExternalWriteStarted[\s\S]*createFinalInvoice/);
assert.match(service, /persistExternalResult:[\s\S]*external_write_completed_at: timestamp/);

console.log("Lexware native external write marker A-S PASS");
