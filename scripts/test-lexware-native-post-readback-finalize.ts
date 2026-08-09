import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ProcessorDependencies } from "../app/lib/lexware/lexwareProductionInvoiceProcessorCore";

const moduleUrl = (path: string) => new URL(path, import.meta.url).href;
const { processLexwareProductionInvoiceCore } = await import(moduleUrl("../app/lib/lexware/lexwareProductionInvoiceProcessorCore.ts"));
const migration = readFileSync("supabase/migrations/20260809150000_atomically_finalize_native_lexware_invoice_after_readback.sql", "utf8");
const service = readFileSync("app/lib/lexware/lexwareProductionInvoiceProcessService.ts", "utf8");
const repository = readFileSync("app/lib/lexware/lexwareProductionInvoiceJobRepository.ts", "utf8");
const recoveryMigration = readFileSync("supabase/migrations/20260809103000_recover_native_lexware_external_result.sql", "utf8");

const ORG = "11111111-1111-4111-8111-111111111111";
const EXTERNAL = "22222222-2222-4222-8222-222222222222";
const LOCKED_AT = "2099-01-01T10:00:00.000Z";
const LOCK_EXPIRES = "2099-01-01T10:05:00.000Z";
const COMPLETED_AT = "2099-01-01T10:00:02.000Z";
const payload = { payload: { lineItems: [{}], paymentConditions: { paymentTermLabel: "7 Tage" } }, expected: { totalGrossAmount: 1, totalNetAmount: 0.84, totalTaxAmount: 0.16, taxRates: [] } };

function fixture(options: { readError?: boolean; differences?: string[]; finalizeError?: boolean } = {}) {
  let posts = 0; let reads = 0; let finalizes = 0;
  const transitions: Array<Record<string, unknown>> = [];
  const invoice = { id: "11111111-1111-4111-8111-111111111112", request_id: "11111111-1111-4111-8111-111111111113", invoice_provider: "lexware", tax_snapshot_version: "invoice-tax-snapshot-v2", tax_snapshot_status: "complete" };
  const job = { id: "11111111-1111-4111-8111-111111111114", status: "pending" as const, creation_state: "not_attempted" as const, payload_sha256: "a".repeat(64), payload_hash_version: "lexware-payload-canonical-v2" as const, attempt_count: 0, lexware_invoice_id: null, locked_at: null, lock_expires_at: null, local_invoice_id: invoice.id, request_id: invoice.request_id, trigger_source: "checkout_native_lexware", target_organization_id: ORG };
  const deps: ProcessorDependencies = {
    classifyIdentity: () => "write_candidate",
    canOfferForAtomicWriteClaim: () => true,
    classifyTransition: () => "native_lexware_invoice",
    canAttemptExternalWrite: () => true,
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
    claimForWrite: async () => ({ invoiceJobId: job.id, claimAcquired: true, readBackOnly: false, previousStatus: "pending", attemptCount: 1, localInvoiceId: invoice.id, requestId: invoice.request_id, payloadSha256: job.payload_sha256, payloadHashVersion: job.payload_hash_version, targetOrganizationId: ORG, jobStatus: "processing", creationState: "not_attempted", lockedAt: LOCKED_AT, lockExpiresAt: LOCK_EXPIRES, lexwareInvoiceId: null, lexwareInvoiceNumber: null, lockOwner: "processor:test" }),
    persistJobTransition: async (transition) => { transitions.push(transition); },
    createFinalInvoice: async () => { posts += 1; return { id: EXTERNAL, resourceUri: `/invoices/${EXTERNAL}`, createdDate: "2099-01-01T10:00:01.000Z", updatedDate: null, version: 1, requestCount: 1, finalize: true, creationState: "definitely_created" }; },
    persistExternalResult: async () => ({ externalWriteCompletedAt: COMPLETED_AT }),
    finalizeNativeExternalResult: async (input) => { finalizes += 1; assert.equal(input.externalWriteCompletedAt, COMPLETED_AT); assert.equal(input.claim.lockOwner, "processor:test"); assert.equal(input.readBack.voucherNumber, "RE-1"); if (options.finalizeError) throw new Error("CAS"); },
    readInvoice: async () => { reads += 1; if (options.readError) throw new Error("GET"); return { id: EXTERNAL, voucherStatus: "open", voucherNumber: "RE-1", organizationId: ORG, lineItems: [], paymentTermLabel: "7 Tage", totalPrice: { currency: "EUR", totalNetAmount: 0.84, totalGrossAmount: 1, totalTaxAmount: 0.16 }, taxAmounts: [] }; },
    compareReadBack: () => options.differences ?? [],
    currentTime: () => "2099-01-01T10:00:03.000Z",
  };
  return { deps, transitions, get posts() { return posts; }, get reads() { return reads; }, get finalizes() { return finalizes; } };
}

let f = fixture(); let result = await processLexwareProductionInvoiceCore(f.deps);
assert.equal(result.outcome, "succeeded"); assert.equal(f.posts, 1); assert.equal(f.reads, 1); assert.equal(f.finalizes, 1); console.log("A-D PASS: one POST, one read-back, one atomic finalize");
assert.doesNotMatch(service.match(/persistExternalResult:[\s\S]*?readInvoice:/)?.[0] ?? "", /school_request_invoices/); console.log("E PASS: no partial invoice update");
assert.match(service, /finalizeNativeExternalResult:[\s\S]*finalizeNativeLexwareInvoiceAfterReadBack/); console.log("F PASS: normal path uses atomic finalizer");
assert.match(repository, /rpc\("finalize_native_lexware_invoice_after_readback"/); console.log("G PASS: repository binds atomic RPC");
assert.match(migration, /update public\.school_request_invoices[\s\S]*update public\.school_lexware_invoice_jobs/); console.log("H-J PASS: invoice and job finalize in one transaction");
for (const marker of ["invoice_number =", "lexware_organization_id =", "lexware_invoice_id =", "lexware_invoice_number =", "lexware_created_at =", "lexware_finalized_at ="]) assert.match(migration, new RegExp(marker));
console.log("K PASS: complete FINALIZED invoice identity");
assert.match(migration, /status = 'succeeded'[\s\S]*creation_state = 'definitely_created'[\s\S]*completed_at = finalized_at/); console.log("L-M PASS: succeeded job and final timestamps");

f = fixture({ readError: true }); result = await processLexwareProductionInvoiceCore(f.deps);
assert.equal(result.outcome, "manual_review"); assert.equal(f.posts, 1); assert.equal(f.reads, 1); assert.equal(f.finalizes, 0); assert.equal(f.transitions.at(-1)?.last_error_code, "READ_BACK_FAILED"); console.log("N-P PASS: read error fail-closed without second POST");
f = fixture({ differences: ["organization_mismatch"] }); result = await processLexwareProductionInvoiceCore(f.deps);
assert.equal(result.outcome, "manual_review"); assert.equal(f.posts, 1); assert.equal(f.finalizes, 0); assert.equal(f.transitions.at(-1)?.last_error_code, "READ_BACK_MISMATCH"); console.log("Q PASS: mismatch blocks finalization");
f = fixture({ finalizeError: true }); result = await processLexwareProductionInvoiceCore(f.deps);
assert.equal(result.outcome, "manual_review"); assert.equal(f.posts, 1); assert.equal(f.finalizes, 1); assert.equal(f.transitions.at(-1)?.last_error_code, "LOCAL_FINALIZE_FAILED"); console.log("R-S PASS: CAS failure goes to manual review without retry");

assert.match(migration, /security definer[\s\S]*set search_path = public, pg_temp/); assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated;[\s\S]*grant execute[\s\S]*to service_role/); console.log("T-U PASS: fail-closed RPC security");
for (const gate of ["checkout_native_lexware", "lexware-payload-canonical-v2", "lexware_production_write_enabled", "invoice_provider_after", "attempt_count", "locked_by", "lock_expires_at", "idempotency_key"]) assert.match(migration, new RegExp(gate));
console.log("V PASS: state, hash, organization, credential and lock CAS gates");
assert.doesNotMatch(migration, /http|createFinalInvoice|getLexwareInvoice|mail/i); console.log("W PASS: no provider or mail path in RPC");
assert.match(recoveryMigration, /status is distinct from 'manual_review'[\s\S]*creation_state is distinct from 'creation_state_unknown'/); assert.match(recoveryMigration, /native_external_result_recovered/); console.log("X PASS: recovery contract remains intact");
assert.equal((migration.match(/create or replace function/g) ?? []).length, 1); assert.equal((migration.match(/\bbegin;/g) ?? []).length, 1); assert.equal((migration.match(/\bcommit;/g) ?? []).length, 1); console.log("Y PASS: one additive transactional RPC migration");
const addedRepositoryContract = repository.match(/export async function finalizeNativeLexwareInvoiceAfterReadBack[\s\S]*$/)?.[0] ?? "";
assert.doesNotMatch([addedRepositoryContract, migration].join("\n"), /as any|as unknown as|TODO|FIXME/); console.log("Z PASS: no new suppression or unfinished marker");
