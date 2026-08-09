import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { NativeExternalRecoveryState } from "../app/lib/lexware/lexwareNativeExternalResultRecoveryCore";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const corePath = resolve(root, "app/lib/lexware/lexwareNativeExternalResultRecoveryCore" + ".ts");
const core = await import(pathToFileURL(corePath).href);
const valid: NativeExternalRecoveryState = {
  invoiceId: "11111111-1111-4111-8111-111111111111",
  requestId: "22222222-2222-4222-8222-222222222222",
  jobId: "33333333-3333-4333-8333-333333333333",
  invoiceProvider: "lexware", triggerSource: "checkout_native_lexware",
  jobStatus: "manual_review", creationState: "creation_state_unknown", attemptCount: 5,
  externalWriteStartedAt: "2026-08-09T10:00:00.000Z", externalWriteCompletedAt: "2026-08-09T10:00:01.000Z",
  externalInvoiceId: "44444444-4444-4444-8444-444444444444", externalResourceUri: "/v1/invoices/4444",
  providerCreatedAt: "2026-08-09T10:00:01.000Z", payloadSha256: "a".repeat(64),
  payloadHashVersion: "lexware-payload-canonical-v2", targetOrganizationId: "55555555-5555-4555-8555-555555555555",
  credentialAlias: "production", idempotencyKey: "lexware:native-checkout-invoice:11111111-1111-4111-8111-111111111111:v1",
  invoiceExternalOrganizationId: null, invoiceExternalId: null, invoiceExternalNumber: null,
  invoiceExternalResourceUri: null, invoiceCreatedAt: null, invoiceFinalizedAt: null,
  snapshotComplete: true, storedPayloadHashMatches: true, currentPayloadHashMatches: true,
  organizationMatches: true, credentialAliasMatches: true, idempotencyKeyMatches: true,
  productionWriteEnabled: true,
};

assert.deepEqual(core.evaluateNativeExternalRecoveryGates(valid), [], "A valid recovery state");
const readBack = {
  id: valid.externalInvoiceId!, organizationId: valid.targetOrganizationId!, voucherStatus: "open", voucherNumber: "LX-1",
  language: "de", archived: false, voucherDate: "2026-08-09", title: "Rechnung", lineItems: [],
  totalPrice: { currency: "EUR", totalNetAmount: 1, totalGrossAmount: 1.19, totalTaxAmount: 0.19 },
  taxAmounts: [], taxType: "net", shippingType: "serviceperiod", shippingDate: "2026-08-09", paymentTermLabel: "7 Tage",
};
let getCount = 0;
let localMutationCount = 0;
const recovered = await core.recoverNativeLexwareExternalResultCore(
  { state: valid, payload: {}, expectedOrganizationId: valid.targetOrganizationId! },
  {
    readInvoice: async () => { getCount += 1; return readBack; },
    compareReadBack: () => [],
    recoverLocal: async () => {
      localMutationCount += 1;
      return { recoveryApplied: true, invoiceId: valid.invoiceId, jobId: valid.jobId, jobStatus: "succeeded", creationState: "definitely_created", externalInvoiceId: valid.externalInvoiceId!, externalInvoiceNumber: "LX-1" };
    },
  },
);
assert.equal(getCount, 1, "B exactly one GET");
assert.equal(localMutationCount, 1, "U one atomic local RPC");
assert.equal(recovered.jobStatus, "succeeded", "X succeeded");
assert.equal(recovered.creationState, "definitely_created", "Y definitely created");

const blockedCases: Array<[string, Partial<NativeExternalRecoveryState>, string]> = [
  ["G", { storedPayloadHashMatches: false }, "stored_payload_hash_mismatch"],
  ["G2", { currentPayloadHashMatches: false }, "current_payload_hash_mismatch"],
  ["I", { snapshotComplete: false }, "invoice_snapshot_incomplete"],
  ["J", { invoiceExternalId: "partial" }, "invoice_partial_external_identity"],
  ["K", { invoiceFinalizedAt: "2026-08-09T11:00:00Z" }, "invoice_already_finalized"],
  ["L", { jobStatus: "pending" }, "job_status_invalid"],
  ["M", { creationState: "not_attempted" }, "creation_state_invalid"],
  ["N", { externalWriteStartedAt: null }, "started_marker_missing"],
  ["O", { externalWriteCompletedAt: null }, "completed_marker_missing"],
  ["P", { externalInvoiceId: null }, "external_invoice_id_missing"],
  ["Q", { invoiceProvider: "legacy_internal" }, "invoice_provider_invalid"],
  ["R", { triggerSource: "admin_manual_enqueue" }, "job_source_invalid"],
  ["F", { organizationMatches: false }, "organization_mismatch"],
  ["F2", { credentialAliasMatches: false }, "credential_alias_mismatch"],
  ["F3", { idempotencyKeyMatches: false }, "idempotency_key_mismatch"],
];
for (const [label, patch, reason] of blockedCases) {
  assert.ok(core.evaluateNativeExternalRecoveryGates({ ...valid, ...patch }).includes(reason), `${label} blocked`);
}

for (const mismatch of ["external_invoice_id_mismatch", "voucher_number_missing", "organization_mismatch", "payload_mismatch"]) {
  let mutationCount = 0;
  const variant = mismatch === "external_invoice_id_mismatch" ? { ...readBack, id: "66666666-6666-4666-8666-666666666666" }
    : mismatch === "voucher_number_missing" ? { ...readBack, voucherNumber: null } : readBack;
  await assert.rejects(() => core.recoverNativeLexwareExternalResultCore(
    { state: valid, payload: {}, expectedOrganizationId: valid.targetOrganizationId! },
    { readInvoice: async () => variant, compareReadBack: () => mismatch === "organization_mismatch" || mismatch === "payload_mismatch" ? [mismatch] : [], recoverLocal: async () => { mutationCount += 1; throw new Error("unexpected"); } },
  ));
  assert.equal(mutationCount, 0, `D/E/F/H/T ${mismatch} no mutation`);
}

const service = await readFile(resolve(root, "app/lib/lexware/lexwareNativeExternalResultRecoveryService.ts"), "utf8");
const route = await readFile(resolve(root, "app/api/admin/lexware/invoices/[invoiceId]/recover-external-result/route.ts"), "utf8");
const middleware = await readFile(resolve(root, "middleware.ts"), "utf8");
const migration = await readFile(resolve(root, "supabase/migrations/20260809103000_recover_native_lexware_external_result.sql"), "utf8");
assert.match(service, /getLexwareInvoice\("production", externalId\)/, "B GET client used");
assert.doesNotMatch(service, /createLexwareProductionFinalInvoice|createFinalInvoice|lexwarePost|method:\s*["']POST["']/, "C/Z no provider POST");
assert.doesNotMatch(service, /updateLexware|deleteLexware|method:\s*["'](?:PUT|PATCH|DELETE)["']/, "C no provider mutation");
assert.match(route, /requireAdminApiSession/); assert.match(route, /hasSameRequestOrigin/); assert.match(route, /readLimitedJsonBody\(request, 512\)/);
assert.match(route, /NATIVE_EXTERNAL_RESULT_RECOVERY_CONFIRMATION/); assert.match(route, /Cache-Control.*no-store/);
assert.match(middleware, /recover-external-result/, "unauthenticated response remains no-store");
assert.match(migration, /security definer/i, "AD security definer");
assert.match(migration, /set search_path = public, pg_temp/i, "AD search path");
assert.match(migration, /revoke all on function[\s\S]+from public, anon, authenticated/i, "AD fail-closed ACL");
assert.match(migration, /grant execute on function[\s\S]+to service_role/i, "AD service role ACL");
assert.match(migration, /update public\.school_request_invoices[\s\S]+update public\.school_lexware_invoice_jobs/i, "U atomic invoice and job updates");
assert.match(migration, /invoice_number = btrim\(p_read_back_invoice_number\)[\s\S]+lexware_invoice_number = btrim\(p_read_back_invoice_number\)[\s\S]+lexware_created_at[\s\S]+lexware_finalized_at/i, "V/W finalized constraint in one update");
assert.match(migration, /status = 'succeeded'[\s\S]+creation_state = 'definitely_created'/i, "X/Y final job state");
assert.match(migration, /native_external_result_recovered/g, "AE recovery event");
assert.equal((migration.match(/'native_external_result_recovered'/g) ?? []).length, 1, "AE exactly one explicit recovery event");
assert.match(migration, /'manual_review', 'succeeded'/, "AE transition metadata");
assert.doesNotMatch(migration, /http|net\.|mail_job_id\s*[^,]*[^n]ull|createFinalInvoice/i, "C/AA no external or mail path");
assert.doesNotMatch(migration, /where\s+(?:id|status|local_invoice_id)\s*=/i, "AC qualified CAS columns");
assert.match(migration, /returns table \([\s\S]+recovery_applied boolean[\s\S]+external_invoice_number text/i, "AB exact return types");
assert.equal((migration.match(/^begin;$/gmi) ?? []).length, 1);
assert.equal((migration.match(/^commit;$/gmi) ?? []).length, 1);
console.log("PASS: Lexware native external-result recovery A-AE");
