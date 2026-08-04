import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type {
  LocalLexwareInvoiceItemSnapshot,
} from "../app/lib/lexware/lexwareInvoicePayloadBuilder";
import type {
  CreateLexwareProductionInvoiceInput,
  LexwareProductionCreateResult,
  LexwareProductionWriteDependencies,
} from "../app/lib/lexware/lexwareProductionInvoiceWriteCore";
import type {
  LexwareInvoicePayloadBuildResult,
  LexwareInvoiceReadModel,
  ProcessorDependencies,
  ProductionInvoiceJob,
  ProductionInvoiceRecord,
} from "../app/lib/lexware/lexwareProductionInvoiceProcessorCore";

const moduleUrl = (path: string) => new URL(path, import.meta.url).href;
const jobModule = await import(moduleUrl("../app/lib/lexware/lexwareProductionInvoiceJob.ts"));
const processorCoreModule = await import(moduleUrl("../app/lib/lexware/lexwareProductionInvoiceProcessorCore.ts"));
const writeModule: typeof import("../app/lib/lexware/lexwareProductionInvoiceWriteCore") =
  await import(moduleUrl("../app/lib/lexware/lexwareProductionInvoiceWriteCore.ts"));
const builderModule = await import(moduleUrl("../app/lib/lexware/lexwareInvoicePayloadBuilder.ts"));
const validatorModule = await import(moduleUrl("../app/lib/lexware/lexwareInvoicePayloadValidator.ts"));
const fixtureModule = await import(moduleUrl("../app/lib/lexware/lexwareProductionFixtureCore.ts"));
const transitionModule = await import(moduleUrl("../app/lib/lexware/lexwareProductionTransitionCore.ts"));
const hashModule = await import(moduleUrl("../app/lib/lexware/lexwarePayloadHash.ts"));
const { evaluateLexwareProductionGates, isValidJobCreationStateCombination, canAttemptExternalWrite } = jobModule;
const { processLexwareProductionInvoiceCore: processLexwareProductionInvoice } = processorCoreModule;
const { executeLexwareProductionInvoiceWrite, LEXWARE_PRODUCTION_FINALIZE_CONFIRMATION, LexwareProductionInvoiceWriteError } = writeModule;
type LexwareProductionInvoiceWriteErrorInstance =
  InstanceType<typeof LexwareProductionInvoiceWriteError>;
const { buildLexwareInvoicePayload } = builderModule;
const { validateLexwareInvoicePayload } = validatorModule;
const { buildLexwareProductionFixtureSnapshotsCore: buildLexwareProductionFixtureSnapshots } = fixtureModule;
const {
  canOfferLexwareJobForAtomicWriteClaim,
  classifyExistingLexwareIdentityState,
  classifyLexwareInvoiceTransition,
} = transitionModule;
const { parseLexwarePayloadHashVersion } = hashModule;

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
const clientPayload: CreateLexwareProductionInvoiceInput["payload"] = { archived: false, voucherDate: "2026-08-03T00:00:00.000Z", address: { name: "Test" }, lineItems: [{ type: "custom", name: "Test", quantity: 1, unitName: "Stück", unitPrice: { currency: "EUR", grossAmount: 1, taxRatePercentage: 19 }, discountPercentage: 0 }], totalPrice: {}, taxConditions: { taxType: "gross" }, paymentConditions: { paymentTermLabel: "7 Tage", paymentTermDuration: 7 }, shippingConditions: { shippingDate: "2026-08-03T00:00:00.000Z", shippingType: "delivery" }, title: "Rechnung", introduction: "Test", remark: "Test" };
const successBody = { id: UUID, resourceUri: `https://api.lexware.io/v1/invoices/${UUID}`, createdDate: "2026-08-03T00:00:00.000Z", updatedDate: "2026-08-03T00:00:01.000Z", version: 1 };

async function runClientTests() {
  type WriteInputOverrides = Omit<Partial<CreateLexwareProductionInvoiceInput>, "finalize" | "confirmation"> & {
    finalize?: boolean;
    confirmation?: string;
  };
  const execute = async (
    fetchImplementation: typeof fetch,
    input: WriteInputOverrides = {},
    dependencyOverrides: Partial<LexwareProductionWriteDependencies> = {},
  ): Promise<LexwareProductionCreateResult> => Reflect.apply(
    executeLexwareProductionInvoiceWrite,
    undefined,
    [
      { payload: clientPayload, finalize: true, confirmation: LEXWARE_PRODUCTION_FINALIZE_CONFIRMATION, gates: baseGates, ...input },
      { fetchImplementation, runtimeConfiguration: productionRuntime, connectionConfiguration: productionConnection, evaluateGates: evaluateLexwareProductionGates, currentTime: () => "2026-08-03T00:00:02.000Z", ...dependencyOverrides },
    ],
  );
  let calls: Array<{ url: string; init?: RequestInit }> = [];
  const successFetch = async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify(successBody), { status: 200, headers: { "content-type": "application/json" } }); };
  const result = await execute(successFetch as typeof fetch);
  assert.equal(calls.length, 1, "A exactly one request"); assert.equal(calls[0].url, "https://api.lexware.io/v1/invoices?finalize=true", "A URL"); assert.equal(calls[0].init?.method, "POST", "A POST");
  const headers = new Headers(calls[0].init?.headers); assert.equal(headers.get("authorization"), "Bearer dummy-production-key", "B production key"); assert.equal(headers.get("content-type"), "application/json", "B content type"); assert.equal(JSON.stringify(result).includes("dummy-production-key"), false, "B no secret result");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), clientPayload, "C exact body"); assert.equal("finalize" in JSON.parse(String(calls[0].init?.body)), false, "C finalize only query");
  assert.equal(result.id, UUID, "D id"); assert.equal(result.finalize, true, "D finalized"); assert.equal(result.requestCount, 1, "D one request");
  assert.equal(result.creationState, "definitely_created", "D creation state");
  const expectError = async (fetchImplementation: typeof fetch, state: string, input: Record<string, unknown> = {}, dependencies: Record<string, unknown> = {}): Promise<LexwareProductionInvoiceWriteErrorInstance> => {
    let error: unknown; try { await execute(fetchImplementation, input, dependencies); } catch (caught) { error = caught; }
    assert.ok(error instanceof LexwareProductionInvoiceWriteError); assert.equal(error.creationState, state); assert.equal(error.message.includes("dummy-production-key"), false); return error;
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

type FoundationFixtureOverrides = {
  job?: Partial<ProductionInvoiceJob>;
  invoice?: Partial<ProductionInvoiceRecord>;
  payloadValid?: boolean;
  hash?: string;
  persistTransitionFails?: boolean;
  createError?: unknown;
  persistExternalFails?: boolean;
  readBack?: Partial<LexwareInvoiceReadModel>;
  differences?: string[];
};

function fixture(overrides: FoundationFixtureOverrides = {}) {
  let posts = 0;
  let storedPayloadLoads = 0; let storedPayloadHashes = 0; let currentPayloadHashes = 0;
  let builds = 0; let validations = 0; let reads = 0; let claims = 0; let clients = 0; let organizations = 0;
  const events: string[] = [];
  const transitions: Record<string, unknown>[] = [];
  const payloadHash = "a".repeat(64);
  const job: ProductionInvoiceJob = { id: "job", status: "pending", creation_state: "not_attempted", payload_sha256: payloadHash,
    payload_hash_version: "lexware-payload-canonical-v2", attempt_count: 0,
    lexware_invoice_id: null, lexware_invoice_number: null, completed_at: null,
    lock_expires_at: null, local_invoice_id: "invoice", request_id: "", trigger_source: "admin_manual_enqueue",
    target_organization_id: UUID, ...overrides.job };
  const readBack: LexwareInvoiceReadModel = { voucherStatus: "open", voucherNumber: "RE-1", organizationId: UUID, lineItems: [], paymentTermLabel: "7 Tage", totalPrice: { currency: "EUR", totalNetAmount: 0.84, totalGrossAmount: 1, totalTaxAmount: 0.16 }, taxAmounts: [] };
  const storedPayload: LexwareInvoicePayloadBuildResult<Record<string, unknown>> = { payload: { lineItems: [{}], paymentConditions: { paymentTermLabel: "7 Tage" } }, expected: { totalGrossAmount: 1, totalNetAmount: 0.84, totalTaxAmount: 0.16, taxRates: [] } };
  const currentPayload: LexwareInvoicePayloadBuildResult<Record<string, unknown>> = { payload: { lineItems: [{}], paymentConditions: { paymentTermLabel: "7 Tage" } }, expected: { totalGrossAmount: 1, totalNetAmount: 0.84, totalTaxAmount: 0.16, taxRates: [] } };
  const deps: ProcessorDependencies<Record<string, unknown>> = {
      classifyIdentity: classifyExistingLexwareIdentityState,
      canOfferForAtomicWriteClaim: canOfferLexwareJobForAtomicWriteClaim,
      classifyTransition: classifyLexwareInvoiceTransition,
      canAttemptExternalWrite,
      isValidJobCreationStateCombination,
      loadLocalInvoice: async () => ({ id: "invoice", invoice_provider: "lexware", tax_snapshot_version: "invoice-tax-snapshot-v2", tax_snapshot_status: "complete", ...overrides.invoice }),
      loadOrCreateJob: async () => job,
      loadPersistedPayload: async () => { storedPayloadLoads += 1; events.push("persisted"); return storedPayload; },
      buildPayload: async () => { builds += 1; events.push("build"); return currentPayload; },
      validatePayload: async () => { validations += 1; return { valid: overrides.payloadValid !== false }; },
      parsePayloadHashVersion: parseLexwarePayloadHashVersion,
      hashPayload: async (payload: LexwareInvoicePayloadBuildResult<Record<string, unknown>>) => {
        if (payload === storedPayload) { storedPayloadHashes += 1; events.push("hash:stored"); }
        else if (payload === currentPayload) { currentPayloadHashes += 1; events.push("hash:current"); }
        else throw new Error("UNEXPECTED_PAYLOAD_IDENTITY");
        return overrides.hash ?? payloadHash;
      },
      validateOrganization: () => { organizations += 1; return UUID; },
      evaluateGates: async () => ({ allowed: true, checks: {}, failedChecks: [] }),
      claimForWrite: async (input) => {
        claims += 1;
        return {
          invoiceJobId: job.id, claimAcquired: true, readBackOnly: false,
          previousStatus: job.status, attemptCount: job.attempt_count + 1,
          localInvoiceId: input.localInvoiceId, requestId: "",
          payloadSha256: input.payloadSha256, payloadHashVersion: input.payloadHashVersion,
          targetOrganizationId: input.targetOrganizationId, jobStatus: "processing",
          creationState: "not_attempted",
          lockedAt: "2026-08-03T00:00:00.000Z", lockExpiresAt: "2026-08-03T00:02:00.000Z",
          lexwareInvoiceId: null, lexwareInvoiceNumber: null,
        };
      },
      persistJobTransition: async (transition) => { transitions.push(transition); if (overrides.persistTransitionFails) throw new Error("persist"); },
      createFinalInvoice: async () => { clients += 1; posts += 1; if (overrides.createError) throw overrides.createError; return { id: UUID, resourceUri: `https://api.lexware.io/v1/invoices/${UUID}`, createdDate: "2026-08-03T00:00:00.000Z", updatedDate: null, version: 1, requestCount: 1, finalize: true, creationState: "definitely_created" }; },
      persistExternalResult: async () => { if (overrides.persistExternalFails) throw new Error("persist external"); },
      readInvoice: async () => { reads += 1; events.push("read"); return { ...readBack, ...overrides.readBack }; },
      compareReadBack: () => overrides.differences ?? [],
      currentTime: () => "2026-08-03T00:00:00.000Z",
  };
  return {
    get posts() { return posts; }, get builds() { return builds; }, get validations() { return validations; },
    get storedPayloadLoads() { return storedPayloadLoads; }, get storedPayloadHashes() { return storedPayloadHashes; },
    get currentPayloadHashes() { return currentPayloadHashes; }, get hashes() { return storedPayloadHashes + currentPayloadHashes; },
    get reads() { return reads; }, get claims() { return claims; }, get clients() { return clients; },
    get organizations() { return organizations; }, events, transitions,
    deps,
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
  const v1Items = fixtureSnapshots.items.map((item: LocalLexwareInvoiceItemSnapshot) => ({ ...item, tax_snapshot_version: "invoice-tax-snapshot-v1" }));
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
  const fixtureGates = evaluateLexwareProductionGates({
    ...baseGates,
    activeMode: "test",
    integrationEnabled: false,
    productionWriteEnabled: false,
    providerAfterCutover: "legacy_internal",
  });
  const fixtureDryRun = {
    payloadValid: validateLexwareInvoicePayload(v2Built).valid,
    wouldFinalizeInvoice: validateLexwareInvoicePayload(v2Built).valid,
    wouldCreateExactlyOneInvoice: false,
    expected: v2Built.expected,
    gates: {
      ...fixtureGates.checks,
      allPassed: fixtureGates.allowed,
      failedChecks: fixtureGates.failedChecks,
    },
    wouldBlockReason: fixtureGates.failedChecks,
    lexwareWriteRequestsPerformed: 0,
    databaseWritesPerformed: 0,
    mailOperationsPerformed: 0,
    fixtureCustomerIsSynthetic: true,
    fixtureContainsRealCustomerData: false,
    checkoutMaintenanceActive: true,
  };
  assert.equal(fixtureDryRun.payloadValid, true, "Fixture A payload valid");
  assert.equal(fixtureDryRun.wouldFinalizeInvoice, true, "Fixture A finalize payload");
  assert.equal(fixtureDryRun.wouldCreateExactlyOneInvoice, false, "Fixture E no creation without gates and job");
  assert.deepEqual(fixtureDryRun.expected.taxRates.map((rate: { taxRatePercentage: number }) => rate.taxRatePercentage), [7, 19], "Fixture B tax buckets");
  assert.deepEqual(fixtureDryRun.expected.taxRates.map((rate: { taxRatePercentage: number; grossAmount: number }) => [rate.taxRatePercentage, Math.round(rate.grossAmount * 100)]), [[7, 4584], [19, 1249]], "Fixture B tax bucket cents");
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
  f = fixture({ job: { lexware_invoice_id: UUID } }); r = await processLexwareProductionInvoice(f.deps); assert.equal(f.posts, 0, "H"); assert.equal(f.storedPayloadLoads, 1); assert.equal(f.storedPayloadHashes, 1); assert.equal(f.builds, 0); assert.equal(f.validations, 0); assert.equal(f.currentPayloadHashes, 0); assert.equal(f.claims, 0); assert.equal(f.clients, 0); assert.equal(f.reads, 1); assert.deepEqual(f.events, ["persisted", "hash:stored", "read"]);
  f = fixture({ job: { status: "succeeded", creation_state: "definitely_created", lexware_invoice_id: UUID, lexware_invoice_number: "RE-1", completed_at: "2026-08-03T00:00:00.000Z" } }); r = await processLexwareProductionInvoice(f.deps); assert.equal(f.posts, 0, "I");
  f = fixture({ job: { status: "succeeded", creation_state: "definitely_created", lexware_invoice_id: null, lexware_invoice_number: "RE-1", completed_at: "2026-08-03T00:00:00.000Z" } }); r = await processLexwareProductionInvoice(f.deps); assert.equal(r.outcome, "blocked", "I inconsistent succeeded");
  f = fixture({ job: { status: "processing", lock_expires_at: "2026-08-03T01:00:00.000Z" } }); r = await processLexwareProductionInvoice(f.deps); assert.equal(r.outcome, "blocked", "J");
  f = fixture({ job: { creation_state: "creation_state_unknown" } }); r = await processLexwareProductionInvoice(f.deps); assert.equal(f.posts, 0, "K"); assert.equal(r.outcome, "manual_review");
  f = fixture({ hash: "b".repeat(64) }); r = await processLexwareProductionInvoice(f.deps); assert.equal(r.outcome, "blocked", "L");
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
  const dryRunServiceSource = readFileSync("app/lib/lexware/lexwareProductionDryRunService.ts", "utf8");
  assert.equal(/\.(insert|upsert|update|delete|rpc)\s*\(/.test(`${dryRunSource}\n${dryRunServiceSource}`), false, "W database writes");
  const processRouteSource = readFileSync("app/api/admin/lexware/invoices/[invoiceId]/process/route.ts", "utf8");
  const processServiceSource = readFileSync("app/lib/lexware/lexwareProductionInvoiceProcessService.ts", "utf8");
  const processCoreSource = readFileSync("app/lib/lexware/lexwareProductionInvoiceProcessorCore.ts", "utf8");
  const writeCoreSource = readFileSync("app/lib/lexware/lexwareProductionInvoiceWriteCore.ts", "utf8");
  const payloadHashSource = readFileSync("app/lib/lexware/lexwarePayloadHash.ts", "utf8");
  const productionHashConsumers = `${dryRunSource}\n${dryRunServiceSource}\n${processRouteSource}\n${processServiceSource}\n${processCoreSource}`;
  assert.ok(dryRunServiceSource.includes("buildLexwarePayloadSha256"), "W central payload hash wiring");
  assert.match(dryRunServiceSource, /buildLexwarePayloadSha256\(\{\s*payload:[^}]+version:\s*payloadHashVersion\s*\}\)/, "W explicit dry-run hash version");
  assert.equal((processRouteSource.match(/processLexwareProductionInvoiceById\(invoiceId\)/g) ?? []).length, 1, "W route delegates once");
  assert.doesNotMatch(processRouteSource, /buildLexwarePayloadSha256|createHash\s*\(|JSON\.stringify\s*\(\s*payload\s*\)|claimForWrite\s*\(|createLexwareProductionFinalInvoice|finalize=true/, "W thin process route");
  assert.match(processServiceSource, /buildLexwarePayloadSha256/, "W central process hash wiring");
  assert.match(processServiceSource, /from\s+["']\.\/lexwarePayloadHash["']/, "W central hash module");
  assert.match(processServiceSource, /payload_hash_version/, "W stored hash version");
  assert.match(processServiceSource, /hashPayload\s*:\s*\([^)]*version[^)]*\)\s*=>\s*buildLexwarePayloadSha256\(\{\s*payload:\s*payload\.payload,\s*version\s*\}\)/, "W explicit process hash version");
  assert.match(processCoreSource, /hashPayload\(persistedPayload,\s*payloadHashVersion\)/, "W persisted snapshot hash");
  assert.match(processCoreSource, /hashPayload\(payload,\s*payloadHashVersion\)/, "W current payload hash");
  assert.match(processCoreSource, /storedPayloadHash\s*===\s*job\.payload_sha256/, "W stored hash comparison");
  assert.match(processCoreSource, /currentPayloadHash\s*===\s*job\.payload_sha256/, "W current hash comparison");
  const persistedLoadIndex = processCoreSource.indexOf("deps.loadPersistedPayload(job)");
  const storedHashIndex = processCoreSource.indexOf("deps.hashPayload(persistedPayload, payloadHashVersion)");
  const storedHashGuardIndex = processCoreSource.indexOf("storedPayloadHash !== job.payload_sha256");
  const storedHashErrorIndex = processCoreSource.indexOf('"STORED_PAYLOAD_HASH_MISMATCH"');
  const buildIndex = processCoreSource.indexOf("deps.buildPayload(invoice)");
  const validateIndex = processCoreSource.indexOf("deps.validatePayload(payload)");
  const currentHashIndex = processCoreSource.indexOf("deps.hashPayload(payload, payloadHashVersion)");
  const currentHashGuardIndex = processCoreSource.indexOf("currentPayloadHash !== job.payload_sha256");
  const currentHashErrorIndex = processCoreSource.indexOf('"CURRENT_PAYLOAD_HASH_MISMATCH"');
  const organizationIndex = processCoreSource.indexOf("deps.validateOrganization()", currentHashGuardIndex);
  const claimInvocations = [...processCoreSource.matchAll(/deps\.claimForWrite\s*\(/g)];
  const claimIndex = claimInvocations[0]?.index ?? -1;
  const clientInvocations = [...processCoreSource.matchAll(/deps\.createFinalInvoice\s*\(/g)];
  const clientIndex = clientInvocations[0]?.index ?? -1;
  assert.ok(persistedLoadIndex >= 0 && persistedLoadIndex < storedHashIndex && storedHashIndex < storedHashGuardIndex && storedHashGuardIndex < storedHashErrorIndex, "W stored hash guard order");
  assert.ok(storedHashErrorIndex < buildIndex && buildIndex < validateIndex && validateIndex < currentHashIndex && currentHashIndex < currentHashGuardIndex && currentHashGuardIndex < currentHashErrorIndex, "W current hash guard order");
  assert.ok(currentHashErrorIndex < organizationIndex && organizationIndex < claimIndex && claimIndex < clientIndex, "W hash, organization, claim and client order");
  assert.equal(claimInvocations.length, 1, "W expected exactly one executing claim call");
  assert.equal(clientInvocations.length, 1, "W expected exactly one client invocation");
  assert.equal((writeCoreSource.match(/\/v1\/invoices\?finalize=true/g) ?? []).length, 1, "W expected exactly one production POST resource path");
  const storedHashBranch = processCoreSource.slice(storedHashGuardIndex, buildIndex);
  const currentHashBranch = processCoreSource.slice(currentHashGuardIndex, organizationIndex);
  for (const branch of [storedHashBranch, currentHashBranch]) {
    assert.doesNotMatch(branch, /persistJobTransition|claimForWrite|createFinalInvoice|persistExternalResult/, "W hash mismatch branch mutates or writes");
  }
  console.log("W separate blocking hash guards precede organization and claim PASS");
  assert.doesNotMatch(productionHashConsumers, /createHash\s*\(\s*["']sha256["']\s*\)/, "W no local crypto hashing");
  assert.doesNotMatch(productionHashConsumers, /JSON\.stringify\s*\(\s*payload\s*\)/, "W no local payload serialization");
  assert.doesNotMatch(productionHashConsumers, /payloadHashMatches:\s*true/, "W no fixed hash truth");
  assert.doesNotMatch(productionHashConsumers, /function\s+(?:canonicalJson|buildLexwarePayloadSha256)\s*\(/, "W no duplicated hash implementation");
  assert.ok(payloadHashSource.includes("lexware-payload-json-v1") && payloadHashSource.includes("lexware-payload-canonical-v2") && payloadHashSource.includes("canonicalJson") && payloadHashSource.includes("buildLexwarePayloadSha256"), "W V1 and V2 contracts remain central");
  assert.match(dryRunServiceSource, /lexwareWriteRequestsPerformed:\s*0/, "W Lexware writes");
  assert.match(dryRunServiceSource, /writeOperationsPerformed:\s*false/, "W write operations");
  assert.match(dryRunServiceSource, /evaluateLexwareProductionGates\s*\(/, "W complete gates evaluated");
  assert.doesNotMatch(dryRunServiceSource.slice(dryRunServiceSource.lastIndexOf("\n  return {")), /gates:\s*/, "W gates not exposed");
  const processorAdapterSource = readFileSync("app/lib/lexware/lexwareProductionInvoiceProcessor.ts", "utf8");
  assert.match(processorAdapterSource, /from "\.\/lexwareProductionInvoiceProcessorCore"/, "processor adapter imports core");
  assert.match(processorAdapterSource, /return processLexwareProductionInvoiceCore\(deps\)/, "processor adapter delegates once");
  assert.equal((processorAdapterSource.match(/function processLexwareProductionInvoice\s*\(/g) || []).length, 1, "processor adapter has one public delegate");
  assert.doesNotMatch(processorAdapterSource, /createFinalInvoice\s*\(/, "processor adapter has no POST decision");
  assert.doesNotMatch(processorAdapterSource, /readInvoice\s*\(/, "processor adapter has no read-back path");
  assert.doesNotMatch(processorAdapterSource, /HSTEST-LINE|description.*(?:marker|technical)|name.*(?:marker|technical)/i, "processor adapter has no marker path");
  assert.doesNotMatch(processorAdapterSource, /new Map\s*</, "processor adapter has no multiset implementation");
  console.log("PASS A-W: isolated assertions; no network, database, PDF or mail operations.");
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
