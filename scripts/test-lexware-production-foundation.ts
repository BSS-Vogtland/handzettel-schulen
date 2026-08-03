import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateLexwareProductionGates, isValidJobCreationStateCombination } from "../app/lib/lexware/lexwareProductionInvoiceJob";
import { processLexwareProductionInvoice } from "../app/lib/lexware/lexwareProductionInvoiceProcessor";
import { executeLexwareProductionInvoiceWrite, LEXWARE_PRODUCTION_FINALIZE_CONFIRMATION, LexwareProductionInvoiceWriteError } from "../app/lib/lexware/lexwareProductionInvoiceWriteClient";
import { buildLexwareInvoicePayload } from "../app/lib/lexware/lexwareInvoicePayloadBuilder";
import { validateLexwareInvoicePayload } from "../app/lib/lexware/lexwareInvoicePayloadValidator";
import { buildLexwareProductionFixtureSnapshots, runLexwareProductionFixtureDryRun } from "../app/lib/lexware/lexwareProductionFixtureDryRun";

const UUID = "11111111-1111-4111-8111-111111111111";
const baseGates = {
  activeMode: "production", integrationEnabled: true, productionApiKeyConfigured: true,
  productionOrganizationIdValid: true, credentialsSeparated: true,
  configuredProductionOrganizationId: UUID, databaseProductionOrganizationId: UUID,
  productionWriteEnabled: true, providerAfterCutover: "lexware", checkoutMaintenanceActive: true,
};
const productionRuntime = {
  activeMode: "production", activeModeValid: true, integrationEnabled: true,
  modes: { production: { apiKeyConfigured: true, organizationIdValid: true, organizationId: UUID }, test: {} },
  credentialSeparation: { safe: true },
};
const productionConnection = {
  mode: "production", apiBaseUrl: "https://api.lexware.io", apiKey: "dummy-production-key",
  apiKeyEnvironmentVariable: "LEXWARE_PRODUCTION_API_KEY", organizationId: UUID,
  organizationIdEnvironmentVariable: "LEXWARE_PRODUCTION_ORGANIZATION_ID",
};
const clientPayload = { archived: false, voucherDate: "2026-08-03T00:00:00.000Z", address: { name: "Test" }, lineItems: [{ type: "custom", name: "Test", quantity: 1, unitName: "Stück", unitPrice: { currency: "EUR", grossAmount: 1, taxRatePercentage: 19 }, discountPercentage: 0 }], totalPrice: {}, taxConditions: { taxType: "gross" }, paymentConditions: { paymentTermLabel: "7 Tage", paymentTermDuration: 7 }, shippingConditions: { shippingDate: "2026-08-03T00:00:00.000Z", shippingType: "delivery" }, title: "Rechnung", introduction: "Test", remark: "Test" } as any;
const successBody = { id: UUID, resourceUri: `https://api.lexware.io/v1/invoices/${UUID}`, createdDate: "2026-08-03T00:00:00.000Z", updatedDate: "2026-08-03T00:00:01.000Z", version: 1 };

async function runClientTests() {
  const execute = async (fetchImplementation: typeof fetch, input: Record<string, unknown> = {}, dependencyOverrides: Record<string, unknown> = {}) => executeLexwareProductionInvoiceWrite({ payload: clientPayload, finalize: true, confirmation: LEXWARE_PRODUCTION_FINALIZE_CONFIRMATION, gates: baseGates, ...input } as any, { fetchImplementation, runtimeConfiguration: productionRuntime as any, connectionConfiguration: productionConnection as any, currentTime: () => "2026-08-03T00:00:02.000Z", ...dependencyOverrides } as any);
  let calls: Array<{ url: string; init?: RequestInit }> = [];
  const successFetch = async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify(successBody), { status: 200, headers: { "content-type": "application/json" } }); };
  const result = await execute(successFetch as typeof fetch);
  assert.equal(calls.length, 1, "A exactly one request"); assert.equal(calls[0].url, "https://api.lexware.io/v1/invoices?finalize=true", "A URL"); assert.equal(calls[0].init?.method, "POST", "A POST");
  const headers = new Headers(calls[0].init?.headers); assert.equal(headers.get("authorization"), "Bearer dummy-production-key", "B production key"); assert.equal(headers.get("content-type"), "application/json", "B content type"); assert.equal(JSON.stringify(result).includes("dummy-production-key"), false, "B no secret result");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), clientPayload, "C exact body"); assert.equal("finalize" in JSON.parse(String(calls[0].init?.body)), false, "C finalize only query");
  assert.equal(result.id, UUID, "D id"); assert.equal(result.finalize, true, "D finalized"); assert.equal(result.requestCount, 1, "D one request");
  assert.equal(result.creationState, "definitely_created", "D creation state");
  const expectError = async (fetchImplementation: typeof fetch, state: string, input: Record<string, unknown> = {}, dependencies: Record<string, unknown> = {}) => {
    let error: unknown; try { await execute(fetchImplementation, input, dependencies); } catch (caught) { error = caught; }
    assert.ok(error instanceof LexwareProductionInvoiceWriteError); assert.equal((error as LexwareProductionInvoiceWriteError).creationState, state); assert.equal(String((error as Error).message).includes("dummy-production-key"), false); return error as LexwareProductionInvoiceWriteError;
  };
  calls = []; await expectError((async () => { calls.push({ url: "invalid" }); return new Response("{}", { status: 200 }); }) as typeof fetch, "creation_state_unknown"); assert.equal(calls.length, 1, "E no retry");
  for (const status of [400, 401, 403, 404, 422]) { calls = []; await expectError((async () => { calls.push({ url: String(status) }); return new Response("{}", { status }); }) as typeof fetch, "definite_not_created"); assert.equal(calls.length, 1, `F-J ${status}`); }
  for (const retryValue of ["17", "invalid"]) { const error = await expectError((async () => new Response("{}", { status: 429, headers: { "retry-after": retryValue } })) as typeof fetch, "creation_state_unknown"); assert.equal(error.retryAfterSeconds, retryValue === "17" ? 17 : null, "K retry-after"); }
  for (const status of [500, 503]) await expectError((async () => new Response("{}", { status })) as typeof fetch, "creation_state_unknown");
  const abort = Object.assign(new Error("abort"), { name: "AbortError" }); await expectError((async () => { throw abort; }) as typeof fetch, "creation_state_unknown");
  await expectError((async () => { throw new Error("network"); }) as typeof fetch, "creation_state_unknown");
  await expectError((async () => new Response("not-json", { status: 200 })) as typeof fetch, "creation_state_unknown");
  for (const override of [{ activeMode: "test" }, { integrationEnabled: false }, { productionWriteEnabled: false }, { providerAfterCutover: "legacy_internal" }, { checkoutMaintenanceActive: false }, { productionApiKeyConfigured: false }, { databaseProductionOrganizationId: "22222222-2222-4222-8222-222222222222" }, { credentialsSeparated: false }]) {
    calls = []; await expectError(successFetch as typeof fetch, "definite_not_created", { gates: { ...baseGates, ...override } }); assert.equal(calls.length, 0, "P gate before fetch");
  }
  calls = []; await expectError(successFetch as typeof fetch, "definite_not_created", { confirmation: "wrong" }); assert.equal(calls.length, 0, "Q confirmation");
  calls = []; await expectError(successFetch as typeof fetch, "definite_not_created", { finalize: false }); assert.equal(calls.length, 0, "R finalize false");
}
const gateCases = [
  ["A", { productionApiKeyConfigured: false }, "productionApiKeyConfigured"],
  ["B", { activeMode: "test" }, "activeModeIsProduction"],
  ["C", { integrationEnabled: false }, "integrationEnabled"],
  ["D", { productionWriteEnabled: false }, "productionWriteEnabled"],
  ["E", { providerAfterCutover: "legacy_internal" }, "providerCutoverConfiguredForLexware"],
  ["F", { checkoutMaintenanceActive: false }, "checkoutMaintenanceActive"],
] as const;
for (const [label, override, failure] of gateCases) {
  const result = evaluateLexwareProductionGates({ ...baseGates, ...override });
  assert.equal(result.allowed, false, `${label} must block`);
  assert.ok(result.failedChecks.includes(failure), `${label} failure`);
}

function fixture(overrides: Record<string, unknown> = {}) {
  let posts = 0;
  let builds = 0; let validations = 0; let hashes = 0; let reads = 0;
  const transitions: Record<string, unknown>[] = [];
  const job = { id: "job", status: "pending", creation_state: "not_attempted", payload_sha256: "same", lexware_invoice_id: null, lock_expires_at: null, ...(overrides.job as object || {}) };
  const readBack = { voucherStatus: "open", voucherNumber: "RE-1", organizationId: UUID, totalPrice: { currency: "EUR" } };
  return {
    get posts() { return posts; }, get builds() { return builds; }, get validations() { return validations; }, get hashes() { return hashes; }, get reads() { return reads; }, transitions,
    deps: {
      loadLocalInvoice: async () => ({ id: "invoice", invoice_provider: "lexware", tax_snapshot_version: "invoice-tax-snapshot-v2", tax_snapshot_status: "complete", ...(overrides.invoice as object || {}) }),
      loadOrCreateJob: async () => job,
      loadPersistedPayload: async () => ({ payload: { lineItems: [{}], paymentConditions: { paymentTermLabel: "7 Tage" } }, expected: { totalGrossAmount: 1, totalNetAmount: 0.84, totalTaxAmount: 0.16, taxRates: [] } }),
      buildPayload: async () => { builds += 1; return { payload: { lineItems: [{}] }, expected: {} }; },
      validatePayload: async () => { validations += 1; return { valid: overrides.payloadValid !== false }; },
      hashPayload: async () => { hashes += 1; return String(overrides.hash ?? "same"); },
      evaluateGates: async () => ({ allowed: true, checks: {}, failedChecks: [] }),
      persistJobTransition: async (transition: Record<string, unknown>) => { transitions.push(transition); if (overrides.persistTransitionFails) throw new Error("persist"); },
      createFinalInvoice: async () => { posts += 1; if (overrides.createError) throw overrides.createError; return { id: UUID, resourceUri: `https://api.lexware.io/v1/invoices/${UUID}`, createdDate: "2026-08-03T00:00:00.000Z", updatedDate: null, version: 1, requestCount: 1, finalize: true, creationState: "definitely_created" }; },
      persistExternalResult: async () => { if (overrides.persistExternalFails) throw new Error("persist external"); },
      readInvoice: async () => { reads += 1; return { ...readBack, ...(overrides.readBack as object || {}) }; },
      compareReadBack: () => (overrides.differences as string[] || []),
      currentTime: () => "2026-08-03T00:00:00.000Z",
    } as any,
  };
}

async function run() {
  await runClientTests();
  const fixtureSnapshots = buildLexwareProductionFixtureSnapshots();
  const buildFixture = (invoice: any = fixtureSnapshots.invoice, items: any = fixtureSnapshots.items) =>
    buildLexwareInvoicePayload({ invoice, items, paymentTermDays: 7 });
  const expectBuilderError = (code: string, invoice: any, items: any = fixtureSnapshots.items) => {
    assert.throws(() => buildFixture(invoice, items), (error: any) => error?.code === code, code);
  };
  const v2Built = buildFixture();
  assert.equal(validateLexwareInvoicePayload(v2Built).valid, true, "V2 positive");
  assert.equal(v2Built.metadata.taxSnapshotVersion, "invoice-tax-snapshot-v2", "V2 metadata");
  const v1Invoice = {
    ...fixtureSnapshots.invoice,
    tax_snapshot_version: "invoice-tax-snapshot-v1",
    tax_breakdown_snapshot: {
      ...fixtureSnapshots.invoice.tax_breakdown_snapshot,
      version: "invoice-tax-snapshot-v1",
      rounding_method: "integer_cent_half_up_with_scoped_reduction_balance_v1",
      allocation_methods: {
        regular_shipping: "net_value_all_goods_v1",
        book_shipping: "net_value_book_products_only_v1",
        discount: "gross_value_products_only_v1",
      },
    },
  };
  const v1Items = fixtureSnapshots.items.map((item) => ({ ...item, tax_snapshot_version: "invoice-tax-snapshot-v1" }));
  const v1Built = buildFixture(v1Invoice, v1Items);
  assert.equal(validateLexwareInvoicePayload(v1Built).valid, true, "V1 regression positive");
  assert.equal(v1Built.metadata.taxSnapshotVersion, "invoice-tax-snapshot-v1", "V1 metadata");
  expectBuilderError("TAX_BREAKDOWN_V2_METADATA_INVALID", {
    ...fixtureSnapshots.invoice,
    tax_breakdown_snapshot: { ...fixtureSnapshots.invoice.tax_breakdown_snapshot, rounding_method: undefined },
  });
  expectBuilderError("TAX_BREAKDOWN_V2_METADATA_INVALID", {
    ...fixtureSnapshots.invoice,
    tax_breakdown_snapshot: {
      ...fixtureSnapshots.invoice.tax_breakdown_snapshot,
      allocation_methods: { ...fixtureSnapshots.invoice.tax_breakdown_snapshot?.allocation_methods, discount: "wrong" },
    },
  });
  expectBuilderError("TAX_SNAPSHOT_VERSION_INVALID", { ...fixtureSnapshots.invoice, tax_snapshot_version: "invoice-tax-snapshot-v3" });
  expectBuilderError("INVOICE_ITEM_SNAPSHOT_MISMATCH", fixtureSnapshots.invoice, v1Items);
  expectBuilderError("INVOICE_ITEM_SNAPSHOT_MISMATCH", v1Invoice, fixtureSnapshots.items);
  const fixtureDryRun = runLexwareProductionFixtureDryRun({
    databaseReadsPerformed: 1,
    gates: {
      ...baseGates,
      activeMode: "test",
      integrationEnabled: false,
      productionWriteEnabled: false,
      providerAfterCutover: "legacy_internal",
    },
  });
  assert.equal(fixtureDryRun.payloadValid, true, "Fixture A payload valid");
  assert.equal(fixtureDryRun.wouldFinalizeInvoice, true, "Fixture A finalize payload");
  assert.equal(fixtureDryRun.wouldCreateExactlyOneInvoice, false, "Fixture E no creation without gates and job");
  assert.deepEqual(fixtureDryRun.expected.taxRates.map((rate) => rate.taxRatePercentage), [7, 19], "Fixture B tax buckets");
  assert.deepEqual(fixtureDryRun.expected.taxRates.map((rate) => [rate.taxRatePercentage, Math.round(rate.grossAmount * 100)]), [[7, 4584], [19, 1249]], "Fixture B tax bucket cents");
  assert.equal(Math.round(fixtureDryRun.expected.totalGrossAmount * 100), 5833, "Fixture B total gross cents");
  assert.equal(Math.round(fixtureDryRun.expected.totalNetAmount * 100), 5334, "Fixture B total net cents");
  assert.equal(Math.round(fixtureDryRun.expected.totalTaxAmount * 100), 499, "Fixture B total tax cents");
  assert.equal(Math.round((fixtureDryRun.expected.totalNetAmount + fixtureDryRun.expected.totalTaxAmount) * 100), Math.round(fixtureDryRun.expected.totalGrossAmount * 100), "Fixture C money identity");
  assert.equal(Object.keys(fixtureDryRun.gates).length, 11, "Fixture D complete gates");
  assert.equal(fixtureDryRun.gates.allPassed, false, "Fixture E blocked");
  for (const reason of ["activeModeIsProduction", "integrationEnabled", "productionWriteEnabled", "providerCutoverConfiguredForLexware"]) assert.ok(fixtureDryRun.wouldBlockReason?.includes(reason), `Fixture E ${reason}`);
  assert.equal(fixtureDryRun.lexwareWriteRequestsPerformed, 0, "Fixture F no Lexware writes");
  assert.equal(fixtureDryRun.databaseWritesPerformed, 0, "Fixture G no database writes");
  assert.equal(fixtureDryRun.mailOperationsPerformed, 0, "Fixture H no mail");
  assert.equal(fixtureDryRun.fixtureCustomerIsSynthetic, true, "Fixture I synthetic customer");
  assert.equal(fixtureDryRun.fixtureContainsRealCustomerData, false, "Fixture I no real customer data");
  assert.equal(fixtureDryRun.checkoutMaintenanceActive, true, "Fixture maintenance active");
  const fixtureRouteSource = readFileSync("app/api/admin/lexware/production-fixture-dry-run/route.ts", "utf8");
  const fixtureHelperSource = readFileSync("app/lib/lexware/lexwareProductionFixtureDryRun.ts", "utf8");
  for (const source of [fixtureRouteSource, fixtureHelperSource]) {
    assert.doesNotMatch(source, /createLexwareProductionFinalInvoice|executeLexwareProductionInvoiceWrite/, "Fixture J no production write function");
    assert.doesNotMatch(source, /\.(insert|update|upsert|delete|rpc)\s*\(/, "Fixture no database mutation");
  }
  assert.doesNotMatch(fixtureRouteSource, /requestInvoicePdf|MailService|send.*Mail/i, "Fixture no PDF or mail module");
  const succeeded = { status: "succeeded", creationState: "definitely_created", lexwareInvoiceId: UUID, lexwareInvoiceNumber: "RE-1", completedAt: "2026-08-03T00:00:00.000Z" } as const;
  assert.equal(isValidJobCreationStateCombination(succeeded), true, "succeeded complete");
  assert.equal(isValidJobCreationStateCombination({ ...succeeded, lexwareInvoiceId: null }), false, "succeeded missing id");
  assert.equal(isValidJobCreationStateCombination({ ...succeeded, lexwareInvoiceNumber: null }), false, "succeeded missing number");
  assert.equal(isValidJobCreationStateCombination({ ...succeeded, completedAt: null }), false, "succeeded missing completion");
  let f = fixture({ payloadValid: false }); let r = await processLexwareProductionInvoice(f.deps); assert.equal(f.posts, 0, "G");
  f = fixture({ job: { lexware_invoice_id: UUID } }); r = await processLexwareProductionInvoice(f.deps); assert.equal(f.posts, 0, "H"); assert.equal(f.builds, 0); assert.equal(f.validations, 0); assert.equal(f.hashes, 0); assert.equal(f.reads, 1);
  f = fixture({ job: { status: "succeeded", creation_state: "definitely_created", lexware_invoice_id: UUID, lexware_invoice_number: "RE-1", completed_at: "2026-08-03T00:00:00.000Z" } }); r = await processLexwareProductionInvoice(f.deps); assert.equal(f.posts, 0, "I");
  f = fixture({ job: { status: "succeeded", creation_state: "definitely_created", lexware_invoice_id: null, lexware_invoice_number: "RE-1", completed_at: "2026-08-03T00:00:00.000Z" } }); r = await processLexwareProductionInvoice(f.deps); assert.equal(r.outcome, "blocked", "I inconsistent succeeded");
  f = fixture({ job: { status: "processing", lock_expires_at: "2026-08-03T01:00:00.000Z" } }); r = await processLexwareProductionInvoice(f.deps); assert.equal(r.outcome, "blocked", "J");
  f = fixture({ job: { creation_state: "creation_state_unknown" } }); r = await processLexwareProductionInvoice(f.deps); assert.equal(f.posts, 0, "K"); assert.equal(r.outcome, "manual_review");
  f = fixture({ hash: "changed" }); r = await processLexwareProductionInvoice(f.deps); assert.equal(r.outcome, "manual_review", "L");
  f = fixture(); r = await processLexwareProductionInvoice(f.deps); assert.equal(f.posts, 1, "M"); assert.ok(f.transitions.some(t => t.lexware_invoice_id === UUID), "N"); assert.equal(r.outcome, "succeeded", "O");
  f = fixture({ differences: ["voucher_status_not_open"] }); r = await processLexwareProductionInvoice(f.deps); assert.equal(r.outcome, "manual_review", "P");
  f = fixture({ differences: ["gross_diff_0_01"] }); r = await processLexwareProductionInvoice(f.deps); assert.equal(r.outcome, "manual_review", "Q");
  for (const [label, state] of [["R", "creation_state_unknown"], ["S", "creation_state_unknown"], ["T", "definite_not_created"], ["U", "creation_state_unknown"]] as const) {
    const error = Object.assign(new Error(label), { creationState: state }); f = fixture({ createError: error }); r = await processLexwareProductionInvoice(f.deps); assert.equal(f.posts, 1, label); assert.equal(r.outcome, state === "definite_not_created" ? "blocked" : "manual_review", label);
  }
  f = fixture({ persistExternalFails: true }); r = await processLexwareProductionInvoice(f.deps); assert.equal(r.outcome, "manual_review", "V"); assert.equal(f.posts, 1);
  const invalidMix = evaluateLexwareProductionGates({ ...baseGates, credentialsSeparated: false }); assert.equal(invalidMix.allowed, false, "credential mixing");
  assert.equal(evaluateLexwareProductionGates(baseGates).allowed, true, "all gates");
  const dryRunSource = readFileSync("app/api/admin/lexware/invoices/[invoiceId]/production-dry-run/route.ts", "utf8");
  assert.equal(/\.(insert|upsert|delete)\s*\(/.test(dryRunSource), false, "W database writes");
  assert.equal((dryRunSource.match(/\.update\s*\(/g) || []).length, 1, "W only crypto hash update");
  assert.match(dryRunSource, /lexwareWriteRequestsPerformed:\s*0/, "W Lexware writes");
  assert.match(dryRunSource, /writeOperationsPerformed:\s*false/, "W write operations");
  assert.match(dryRunSource, /gates:\s*\{\s*\.\.\.gates\.checks/, "W complete gates");
  console.log("PASS A-W: isolated assertions; no network, database, PDF or mail operations.");
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
