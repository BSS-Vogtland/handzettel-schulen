import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ProcessorDependencies } from "../app/lib/lexware/lexwareProductionInvoiceProcessorCore";

const moduleUrl = (path: string) => new URL(path, import.meta.url).href;
const organizationModule: typeof import("../app/lib/lexware/lexwareProductionOrganizationCore") =
  await import(moduleUrl("../app/lib/lexware/lexwareProductionOrganizationCore.ts"));
const processorModule = await import(moduleUrl("../app/lib/lexware/lexwareProductionInvoiceProcessorCore.ts"));
const dryRunModule = await import(moduleUrl("../app/lib/lexware/lexwareProductionDryRunCore.ts"));
const transitionModule = await import(moduleUrl("../app/lib/lexware/lexwareProductionTransitionCore.ts"));
const jobModule = await import(moduleUrl("../app/lib/lexware/lexwareProductionInvoiceJob.ts"));
const { validateLexwareProductionOrganization, LexwareProductionOrganizationError } = organizationModule;
const { processLexwareProductionInvoiceCore } = processorModule;
const { evaluateLexwareProductionDryRunDecision } = dryRunModule;
const {
  canOfferLexwareJobForAtomicWriteClaim,
  classifyExistingLexwareIdentityState,
} = transitionModule;
const { canAttemptExternalWrite } = jobModule;

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
type OrganizationFixtureInput = {
  job: string | null | undefined;
  database: string | null | undefined;
  runtime: string | null | undefined;
};
const createOrganizationInput = (
  overrides: Partial<OrganizationFixtureInput> = {},
): OrganizationFixtureInput => ({ job: ORG, database: ORG, runtime: ORG, ...overrides });
const organization = (input: OrganizationFixtureInput = createOrganizationInput()) =>
  validateLexwareProductionOrganization({ jobOrganizationId: input.job, databaseOrganizationId: input.database, runtimeOrganizationId: input.runtime });
const organizationFails = (code: string, overrides: Partial<OrganizationFixtureInput>) =>
  assert.throws(() => organization(createOrganizationInput(overrides)), (error: unknown) => error instanceof LexwareProductionOrganizationError && error.code === code && !error.message.includes(ORG));

assert.equal(organization().organizationId, ORG); console.log("Organization A PASS");
organizationFails("JOB_ORGANIZATION_MISSING", { job: undefined }); console.log("Organization B PASS");
organizationFails("DATABASE_ORGANIZATION_MISSING", { database: undefined }); console.log("Organization C PASS");
organizationFails("RUNTIME_ORGANIZATION_MISSING", { runtime: undefined }); console.log("Organization D PASS");
organizationFails("ORGANIZATION_FORMAT_INVALID", { job: "bad" }); console.log("Organization E PASS");
organizationFails("ORGANIZATION_FORMAT_INVALID", { database: "bad" }); console.log("Organization F PASS");
organizationFails("ORGANIZATION_FORMAT_INVALID", { runtime: "bad" }); console.log("Organization G PASS");
organizationFails("ORGANIZATION_MISMATCH", { job: OTHER }); console.log("Organization H PASS");
organizationFails("ORGANIZATION_MISMATCH", { database: OTHER }); console.log("Organization I PASS");
organizationFails("JOB_ORGANIZATION_MISSING", { job: null }); console.log("Organization J PASS");
organizationFails("DATABASE_ORGANIZATION_MISSING", { database: null }); console.log("Organization K PASS");
organizationFails("RUNTIME_ORGANIZATION_MISSING", { runtime: null }); console.log("Organization L PASS");

type Overrides = {
  hash?: string;
  hashes?: string[];
  organizationError?: boolean;
  differences?: string[];
  transitionBlocked?: boolean;
  claimError?: boolean;
  claim?: Partial<Awaited<ReturnType<ProcessorDependencies["claimForWrite"]>>>;
  job?: Partial<Awaited<ReturnType<ProcessorDependencies["loadOrCreateJob"]>>>;
};
function fixture(overrides: Overrides = {}) {
  const events: string[] = [];
  let claims = 0; let posts = 0; let reads = 0;
  const counts = { persistedLoads: 0, currentBuilds: 0, validations: 0, hashes: 0, organizations: 0, mutations: 0, clients: 0 };
  const invoice = { id: "invoice-1", request_id: "request-1", invoice_provider: "lexware", tax_snapshot_version: "invoice-tax-snapshot-v2", tax_snapshot_status: "complete" };
  const job = {
    id: "job-1", status: "pending" as const, creation_state: "not_attempted" as const,
    payload_sha256: "a".repeat(64), payload_hash_version: "lexware-payload-canonical-v2" as const,
    attempt_count: 0,
    lexware_invoice_id: null, locked_at: null, lock_expires_at: null, local_invoice_id: invoice.id,
    request_id: invoice.request_id, trigger_source: "admin_manual_enqueue", target_organization_id: ORG,
    ...overrides.job,
  };
  const payload = { payload: { lineItems: [{}], paymentConditions: { paymentTermLabel: "7 Tage" } }, expected: { totalGrossAmount: 1, totalNetAmount: 0.84, totalTaxAmount: 0.16, taxRates: [] } };
  const deps: ProcessorDependencies = {
    classifyIdentity: classifyExistingLexwareIdentityState,
    canOfferForAtomicWriteClaim: canOfferLexwareJobForAtomicWriteClaim,
    classifyTransition: () => overrides.transitionBlocked ? "blocked" : "native_lexware_invoice",
    canAttemptExternalWrite,
    isValidJobCreationStateCombination: () => true,
    loadLocalInvoice: async () => invoice,
    loadOrCreateJob: async () => job,
    loadPersistedPayload: async () => { counts.persistedLoads += 1; events.push("persisted"); return payload; },
    buildPayload: async () => { counts.currentBuilds += 1; events.push("build"); return payload; },
    validatePayload: () => { counts.validations += 1; events.push("validate"); return { valid: true }; },
    parsePayloadHashVersion: (value) => {
      if (value === "lexware-payload-json-v1" || value === "lexware-payload-canonical-v2") return value;
      throw new Error("unsupported");
    },
    hashPayload: () => { const index = counts.hashes++; events.push(`hash:${index}`); return overrides.hashes?.[index] ?? overrides.hash ?? "a".repeat(64); },
    validateOrganization: () => { counts.organizations += 1; events.push("organization"); if (overrides.organizationError) throw new Error("ORGANIZATION_MISMATCH"); return ORG; },
    evaluateGates: () => ({ allowed: true, checks: {}, failedChecks: [] }),
    claimForWrite: async (expected) => {
      events.push("claim"); claims += 1;
      if (overrides.claimError) throw new Error("CLAIM_LOST");
      return {
        invoiceJobId: job.id, claimAcquired: true, readBackOnly: false,
        previousStatus: job.status, attemptCount: job.attempt_count + 1,
        localInvoiceId: expected.localInvoiceId, requestId: invoice.request_id,
        payloadSha256: expected.payloadSha256, payloadHashVersion: expected.payloadHashVersion,
        targetOrganizationId: expected.targetOrganizationId, jobStatus: "processing",
        creationState: job.creation_state, lockedAt: "2026-08-04T10:00:00.000Z",
        lockExpiresAt: "2026-08-04T10:02:00.000Z", lexwareInvoiceId: null,
        lexwareInvoiceNumber: null,
        ...overrides.claim,
      };
    },
    persistJobTransition: async () => { counts.mutations += 1; },
    createFinalInvoice: async () => { counts.clients += 1; events.push("client"); posts += 1; events.push("post"); return { id: OTHER, resourceUri: `https://api.lexware.io/v1/invoices/${OTHER}`, createdDate: "2026-08-04T10:00:01.000Z", updatedDate: null, version: 1, requestCount: 1, finalize: true, creationState: "definitely_created" }; },
    persistExternalResult: async () => undefined,
    readInvoice: async () => { reads += 1; return { voucherStatus: "open", voucherNumber: "RE-1", organizationId: ORG, lineItems: [], paymentTermLabel: "7 Tage", totalPrice: { currency: "EUR", totalNetAmount: 0.84, totalGrossAmount: 1, totalTaxAmount: 0.16 }, taxAmounts: [] }; },
    compareReadBack: () => overrides.differences ?? [], currentTime: () => "2026-08-04T10:00:00.000Z",
  };
  return { deps, events, counts, job, get claims() { return claims; }, get posts() { return posts; }, get reads() { return reads; } };
}

let f = fixture({ hash: "wrong" }); let result = await processLexwareProductionInvoiceCore(f.deps); assert.equal(result.postCount, 0); assert.equal(f.claims, 0); console.log("Process A PASS");
organizationFails("ORGANIZATION_MISMATCH", { database: OTHER }); assert.equal(f.claims, 0); console.log("Process B PASS");
f = fixture({ transitionBlocked: true }); result = await processLexwareProductionInvoiceCore(f.deps); assert.equal(f.claims, 0); console.log("Process C PASS");
f = fixture({ claimError: true }); await assert.rejects(() => processLexwareProductionInvoiceCore(f.deps), /CLAIM_LOST/); assert.equal(f.posts, 0); console.log("Process D PASS");
for (const [label, claim] of [
  ["E", { payloadSha256: "wrong" }], ["F", { payloadHashVersion: "lexware-payload-json-v1" }],
  ["G", { targetOrganizationId: OTHER }], ["H", { localInvoiceId: "other" }], ["I", { requestId: "other" }],
] as const) { f = fixture({ claim }); result = await processLexwareProductionInvoiceCore(f.deps); assert.equal(f.posts, 0); assert.deepEqual(result.reasons, ["claim_result_mismatch"]); console.log(`Process ${label} PASS`); }
f = fixture(); result = await processLexwareProductionInvoiceCore(f.deps); assert.equal(f.claims, 1); assert.equal(f.posts, 1); assert.equal(f.counts.clients, 1); assert.deepEqual(f.events, ["persisted", "hash:0", "build", "validate", "hash:1", "organization", "claim", "client", "post"]); console.log("Process J-L,Q PASS");
f = fixture({ job: { lexware_invoice_id: OTHER } }); result = await processLexwareProductionInvoiceCore(f.deps); assert.equal(f.posts, 0); assert.equal(f.reads, 1); assert.equal(f.counts.currentBuilds, 0); assert.equal(f.counts.validations, 0); assert.equal(f.counts.hashes, 1); assert.equal(f.claims, 0); assert.equal(f.counts.clients, 0); console.log("Process M PASS");
f = fixture({ job: { creation_state: "creation_state_unknown" } }); result = await processLexwareProductionInvoiceCore(f.deps); assert.equal(f.claims, 0); assert.equal(f.posts, 0); console.log("Process N PASS");
f = fixture({ job: { status: "processing", locked_at: "2026-08-04T09:59:00.000Z", lock_expires_at: "2099-01-01T00:00:00.000Z" } }); result = await processLexwareProductionInvoiceCore(f.deps); assert.equal(f.claims, 0); assert.equal(f.posts, 0); console.log("Process O PASS");
f = fixture({ job: { status: "manual_review", lexware_invoice_id: OTHER } }); result = await processLexwareProductionInvoiceCore(f.deps); assert.equal(f.reads, 0); assert.equal(f.posts, 0); console.log("Process external manual-review PASS");
f = fixture({ job: { lexware_invoice_id: OTHER }, differences: ["read_back_mismatch"] }); result = await processLexwareProductionInvoiceCore(f.deps); assert.equal(result.outcome, "manual_review"); assert.equal(f.posts, 0); assert.equal(f.claims, 0); assert.equal(f.counts.clients, 0); console.log("Process external mismatch no fallback PASS");
const serviceSource = readFileSync("app/lib/lexware/lexwareProductionInvoiceProcessService.ts", "utf8");
assert.match(serviceSource, /attemptCount:\s*claim\.attemptCount/); console.log("Process P PASS");
const processRFixture = fixture({ job: { status: "processing", locked_at: "2026-08-04T09:59:00.000Z", lock_expires_at: "2099-01-01T00:00:00.000Z" } });
const processRResult = await processLexwareProductionInvoiceCore(processRFixture.deps);
assert.equal(processRResult.outcome, "blocked");
assert.equal(processRFixture.events.length, 0); console.log("Process R PASS");

const activeLockFixture = fixture({ job: {
  status: "processing", locked_at: "2026-08-04T09:59:00.000Z",
  lock_expires_at: "2026-08-04T10:01:00.000Z",
} });
result = await processLexwareProductionInvoiceCore(activeLockFixture.deps);
assert.equal(result.outcome, "blocked");
assert.equal(activeLockFixture.claims, 0);
assert.equal(activeLockFixture.counts.clients, 0);
assert.equal(activeLockFixture.posts, 0); console.log("Lock A PASS");

const expiredLockFixture = fixture({ job: {
  status: "processing", locked_at: "2026-08-04T09:58:00.000Z",
  lock_expires_at: "2026-08-04T09:59:00.000Z",
} });
const expiredAttemptCount = expiredLockFixture.job.attempt_count;
const expiredLockedAt = expiredLockFixture.job.locked_at;
const expiredLockExpiresAt = expiredLockFixture.job.lock_expires_at;
result = await processLexwareProductionInvoiceCore(expiredLockFixture.deps);
assert.equal(expiredLockFixture.counts.persistedLoads, 1);
assert.equal(expiredLockFixture.counts.currentBuilds, 1);
assert.equal(expiredLockFixture.counts.validations, 1);
assert.equal(expiredLockFixture.counts.hashes, 2);
assert.equal(expiredLockFixture.counts.organizations, 1);
assert.equal(expiredLockFixture.claims, 1);
assert.equal(expiredLockFixture.counts.clients, 1);
assert.equal(expiredLockFixture.posts, 1); console.log("Lock B PASS");

const lostExpiredLockFixture = fixture({
  job: {
    status: "processing", locked_at: "2026-08-04T09:58:00.000Z",
    lock_expires_at: "2026-08-04T09:59:00.000Z",
  },
  claim: { invoiceJobId: "other-worker-claimed" },
});
result = await processLexwareProductionInvoiceCore(lostExpiredLockFixture.deps);
assert.equal(lostExpiredLockFixture.claims, 1);
assert.equal(lostExpiredLockFixture.counts.clients, 0);
assert.equal(lostExpiredLockFixture.posts, 0); console.log("Lock C PASS");

const unknownExpiredLockFixture = fixture({ job: {
  status: "processing", creation_state: "creation_state_unknown",
  locked_at: "2026-08-04T09:58:00.000Z", lock_expires_at: "2026-08-04T09:59:00.000Z",
} });
result = await processLexwareProductionInvoiceCore(unknownExpiredLockFixture.deps);
assert.equal(unknownExpiredLockFixture.claims, 0);
assert.equal(unknownExpiredLockFixture.posts, 0); console.log("Lock D PASS");

for (const [label, lock] of [
  ["E", { locked_at: "2026-08-04T09:58:00.000Z", lock_expires_at: null }],
  ["F", { locked_at: "2026-08-04T09:58:00.000Z", lock_expires_at: "invalid" }],
] as const) {
  const invalidLockFixture = fixture({ job: { status: "processing", ...lock } });
  result = await processLexwareProductionInvoiceCore(invalidLockFixture.deps);
  assert.equal(result.outcome, "blocked");
  assert.equal(invalidLockFixture.claims, 0);
  assert.equal(invalidLockFixture.posts, 0); console.log(`Lock ${label} PASS`);
}

const externalExpiredLockFixture = fixture({ job: {
  status: "processing", locked_at: "2026-08-04T09:58:00.000Z",
  lock_expires_at: "2026-08-04T09:59:00.000Z", lexware_invoice_id: OTHER,
} });
result = await processLexwareProductionInvoiceCore(externalExpiredLockFixture.deps);
assert.equal(externalExpiredLockFixture.claims, 0);
assert.equal(externalExpiredLockFixture.posts, 0);
assert.equal(externalExpiredLockFixture.reads, 1); console.log("Lock G PASS");

assert.equal(expiredLockFixture.job.attempt_count, expiredAttemptCount); console.log("Lock H PASS");
assert.equal(expiredLockFixture.job.locked_at, expiredLockedAt);
assert.equal(expiredLockFixture.job.lock_expires_at, expiredLockExpiresAt); console.log("Lock I PASS");
const claimMigrationSource = readFileSync("supabase/migrations/20260803080000_claim_school_lexware_invoice_job_for_processing.sql", "utf8");
assert.match(claimMigrationSource, /status = 'processing' and job_row\.lock_expires_at > now_value/);
assert.match(claimMigrationSource, /job_row\.locked_at is null/);
assert.match(claimMigrationSource, /job_row\.lock_expires_at is null/);
assert.match(claimMigrationSource, /job_row\.lock_expires_at <= job_row\.locked_at/);
assert.match(claimMigrationSource, /for update/);
assert.match(claimMigrationSource, /attempt_count = school_lexware_invoice_jobs\.attempt_count \+ 1/); console.log("Lock J PASS");

f = fixture({ hash: "b".repeat(64) }); result = await processLexwareProductionInvoiceCore(f.deps);
assert.deepEqual(result.reasons, ["STORED_PAYLOAD_HASH_MISMATCH"]); assert.deepEqual(f.counts, { persistedLoads: 1, currentBuilds: 0, validations: 0, hashes: 1, organizations: 0, mutations: 0, clients: 0 }); console.log("Boundary D PASS");
f = fixture({ hashes: ["a".repeat(64), "b".repeat(64)] }); result = await processLexwareProductionInvoiceCore(f.deps);
assert.deepEqual(result.reasons, ["CURRENT_PAYLOAD_HASH_MISMATCH"]); assert.equal(f.counts.hashes, 2); assert.equal(f.counts.currentBuilds, 1); assert.equal(f.counts.validations, 1); assert.equal(f.counts.organizations, 0); assert.equal(f.counts.mutations, 0); console.log("Boundary E PASS");
f = fixture({ organizationError: true }); await assert.rejects(() => processLexwareProductionInvoiceCore(f.deps), /ORGANIZATION_MISMATCH/);
assert.equal(f.counts.hashes, 2); assert.equal(f.counts.organizations, 1); assert.equal(f.claims, 0); assert.equal(f.counts.clients, 0); console.log("Boundary F,N PASS");
for (const [label, claim] of [["H", { invoiceJobId: "other" }], ["I", { attemptCount: 2 }], ["J", { previousStatus: "retry" as const }]] as const) {
  f = fixture({ claim }); result = await processLexwareProductionInvoiceCore(f.deps); assert.deepEqual(result.reasons, ["claim_result_mismatch"]); assert.equal(f.counts.clients, 0); assert.equal(f.posts, 0); console.log(`Boundary ${label} PASS`);
}
f = fixture({ claim: { readBackOnly: true, lexwareInvoiceId: null } }); result = await processLexwareProductionInvoiceCore(f.deps); assert.equal(f.reads, 0); assert.equal(f.posts, 0); console.log("Boundary K PASS");
f = fixture({ claim: { readBackOnly: true, lexwareInvoiceId: OTHER, lexwareInvoiceNumber: null } }); result = await processLexwareProductionInvoiceCore(f.deps); assert.equal(f.reads, 1); assert.equal(f.counts.clients, 0); assert.equal(f.posts, 0); console.log("Boundary L PASS");
for (const jobOverride of [{ payload_sha256: null }, { payload_hash_version: null }]) {
  f = fixture({ job: jobOverride }); result = await processLexwareProductionInvoiceCore(f.deps); assert.equal(f.counts.mutations, 0); assert.equal(f.claims, 0); assert.equal(f.posts, 0);
}
console.log("Boundary M PASS");

const routeSource = readFileSync("app/api/admin/lexware/invoices/[invoiceId]/process/route.ts", "utf8");
assert.match(routeSource, /requireAdminApiSession/);
assert.match(routeSource, /hasSameRequestOrigin/);
assert.match(routeSource, /readLimitedJsonBody\(request, 1_024\)/);
assert.match(routeSource, /FINALIZE_SINGLE_LEXWARE_INVOICE/);
assert.equal((routeSource.match(/processLexwareProductionInvoiceById\(invoiceId\)/g) ?? []).length, 1);
assert.doesNotMatch(routeSource, /claimInvoiceJobForProcessing|createLexwareProductionFinalInvoice|buildLexwarePayloadSha256|organizationId/);
console.log("Route A-I PASS");

const dryRunSource = readFileSync("app/api/admin/lexware/invoices/[invoiceId]/production-dry-run/route.ts", "utf8");
const dryRunServiceSource = readFileSync("app/lib/lexware/lexwareProductionDryRunService.ts", "utf8");
const dryRunResponseSource = dryRunServiceSource.slice(dryRunServiceSource.lastIndexOf("\n  return {"));
assert.equal((dryRunSource.match(/previewLexwareProductionInvoiceById\(invoiceId\)/g) ?? []).length, 1);
assert.doesNotMatch(dryRunSource, /supabaseServer|loadEligibleLocalInvoice|buildLexwarePayloadSha256|validateLexwareProductionOrganization|classifyExistingLexwareIdentityState|classifyLexwareInvoiceTransition|evaluateLexwareProductionDryRunDecision|claimInvoiceJobForProcessing|createLexwareProductionFinalInvoice/);
for (const field of ["jobOrganizationConfigured", "databaseOrganizationConfigured", "runtimeOrganizationConfigured", "targetOrganizationMatches", "technicalPreviewReady", "activationReadyNow", "activationGates", "activationBlockReasons", "checkoutMaintenanceActive", "claimWouldSucceed", "wouldPerformExactlyOnePost", "wouldOnlyReadBack", "databaseWritesPerformed: 0", "lexwareWriteRequestsPerformed: 0", "storageOperationsPerformed: 0", "mailOperationsPerformed: 0"]) assert.ok(dryRunServiceSource.includes(field), field);
for (const forbiddenField of ["invoiceJobId", "expectedTotals", "gates:", "payloadValid,"]) assert.doesNotMatch(dryRunResponseSource, new RegExp(forbiddenField));
console.log("Dry-run A-K PASS");

const validDryRun = {
  jobExists: true, invoiceJobLinkMatches: true, requestIdMatches: true,
  identityClassification: "write_candidate" as const,
  payloadHashVersionSupported: true, storedPayloadHashMatches: true,
  currentPayloadHashMatches: true, payloadValid: true,
  targetOrganizationMatches: true, transitionClassification: "native_lexware_invoice" as const,
  writeStateAllowed: true, gatesAllowed: true,
};
for (const [label, change] of [
  ["A", { invoiceJobLinkMatches: false }],
  ["B", { requestIdMatches: false }],
  ["C", { identityClassification: "block" as const }],
  ["D", { identityClassification: "block" as const }],
  ["E", { identityClassification: "block" as const }],
  ["F", { storedPayloadHashMatches: false, currentPayloadHashMatches: null }],
  ["G", { currentPayloadHashMatches: false }],
  ["H", { targetOrganizationMatches: false }],
  ["I", { transitionClassification: "blocked" as const }],
] as const) {
  const decision = evaluateLexwareProductionDryRunDecision({ ...validDryRun, ...change });
  assert.equal(decision.claimWouldSucceed, false, `Dry-run scenario ${label} claim`);
  assert.equal(decision.wouldPerformExactlyOnePost, false, `Dry-run scenario ${label} post`);
}
const writeDecision = evaluateLexwareProductionDryRunDecision(validDryRun);
assert.deepEqual(writeDecision, { technicalPreviewReady: true, activationReadyNow: true, claimWouldSucceed: true, wouldOnlyReadBack: false, wouldPerformExactlyOnePost: true, wouldCreateExactlyOneInvoice: true });
const closedWriteGateDecision = evaluateLexwareProductionDryRunDecision({ ...validDryRun, gatesAllowed: false });
assert.deepEqual(closedWriteGateDecision, { technicalPreviewReady: true, activationReadyNow: false, claimWouldSucceed: false, wouldOnlyReadBack: false, wouldPerformExactlyOnePost: true, wouldCreateExactlyOneInvoice: true });
const waitingForActivationDecision = evaluateLexwareProductionDryRunDecision({ ...validDryRun, writeStateAllowed: false, gatesAllowed: false });
assert.equal(waitingForActivationDecision.wouldPerformExactlyOnePost, true);
assert.equal(waitingForActivationDecision.activationReadyNow, false);
assert.equal(waitingForActivationDecision.claimWouldSucceed, false);
const readBackDecision = evaluateLexwareProductionDryRunDecision({ ...validDryRun, identityClassification: "read_back_only", currentPayloadHashMatches: null, payloadValid: false, writeStateAllowed: false });
assert.deepEqual(readBackDecision, { technicalPreviewReady: false, activationReadyNow: false, claimWouldSucceed: false, wouldOnlyReadBack: true, wouldPerformExactlyOnePost: false, wouldCreateExactlyOneInvoice: false });
const succeededDecision = evaluateLexwareProductionDryRunDecision({ ...validDryRun, identityClassification: "already_succeeded", currentPayloadHashMatches: null, payloadValid: false, writeStateAllowed: false });
assert.deepEqual(succeededDecision, { technicalPreviewReady: false, activationReadyNow: false, claimWouldSucceed: false, wouldOnlyReadBack: false, wouldPerformExactlyOnePost: false, wouldCreateExactlyOneInvoice: false });
const missingExternalIdClassification = classifyExistingLexwareIdentityState({ status: "pending", creationState: "not_attempted", lexwareInvoiceId: null, lockedAt: null, lockExpiresAt: null, currentTime: "2026-08-04T10:00:00.000Z" });
assert.equal(missingExternalIdClassification, "write_candidate", "Dry-run scenario L no read-back without external ID");
for (const token of ["hasSameRequestOrigin", "readLimitedJsonBody(request, 1_024)", "hasExactConfirmation", "PREVIEW_SINGLE_LEXWARE_INVOICE_PRODUCTION", "UUID.test(invoiceId)"]) assert.ok(dryRunSource.includes(token), `Dry-run guard ${token}`);
assert.doesNotMatch(dryRunSource, /request\.json\(|claimInvoiceJobForProcessing|createLexwareProductionFinalInvoice|\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
assert.doesNotMatch(dryRunServiceSource, /claimInvoiceJobForProcessing|createLexwareProductionFinalInvoice|\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
assert.match(dryRunServiceSource, /checkoutMaintenanceActive:\s*CHECKOUT_MAINTENANCE_ACTIVE/);
assert.match(dryRunServiceSource, /activationReadyNow/);
assert.match(dryRunServiceSource, /technicalPreviewReady/);
assert.match(dryRunServiceSource, /gates\.failedChecks\.map\(activationBlockReason\)/);
for (const activationReason of [
  "production_write_disabled",
  "provider_cutover_not_configured_for_lexware",
  "checkout_maintenance_not_active",
]) assert.ok(dryRunServiceSource.includes(activationReason));
assert.match(dryRunServiceSource, /job_state_not_claimable/);
const readinessRouteSource = readFileSync("app/api/admin/lexware/runtime-readiness/route.ts", "utf8");
const maintenanceSource = readFileSync("lib/checkoutMaintenance.ts", "utf8");
assert.match(maintenanceSource, /export const CHECKOUT_MAINTENANCE_ACTIVE = false/);
assert.match(readinessRouteSource, /value:\s*CHECKOUT_MAINTENANCE_ACTIVE/);
assert.equal((readinessRouteSource.match(/CHECKOUT_MAINTENANCE_ACTIVE/g) ?? []).length >= 2, true);
assert.equal((dryRunServiceSource.match(/CHECKOUT_MAINTENANCE_ACTIVE/g) ?? []).length >= 2, true);
console.log("Dry-run scenarios A-P PASS");
