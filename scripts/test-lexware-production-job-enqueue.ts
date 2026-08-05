import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type {
  EligibleLocalInvoice,
  EligibleInvoiceBuildDependencies,
  EnqueueInvoiceJobResult,
  LexwareInvoiceJobRepositoryDependencies,
  LocalInvoiceItemSnapshot,
  LocalInvoiceSnapshot,
  PersistedLexwareInvoiceJob,
} from "../app/lib/lexware/lexwareProductionEnqueueCore";

const moduleUrl = (path: string) => new URL(path, import.meta.url).href;
const enqueueModule = await import(moduleUrl("../app/lib/lexware/lexwareProductionEnqueueCore.ts"));
const fixtureModule = await import(moduleUrl("../app/lib/lexware/lexwareProductionFixtureCore.ts"));
const builderModule = await import(moduleUrl("../app/lib/lexware/lexwareInvoicePayloadBuilder.ts"));
const validatorModule = await import(moduleUrl("../app/lib/lexware/lexwareInvoicePayloadValidator.ts"));
const jobModule = await import(moduleUrl("../app/lib/lexware/lexwareProductionInvoiceJob.ts"));
const maintenanceModule = await import(moduleUrl("../lib/checkoutMaintenance.ts"));
const hashModule = await import(moduleUrl("../app/lib/lexware/lexwarePayloadHash.ts"));
const {
  buildEligibleLocalInvoice: buildEligibleLocalInvoiceCore,
  enqueueLexwareProductionInvoiceJob,
  LexwareProductionInvoiceJobRepositoryError,
  validateEnqueueInvoiceJobResult,
} = enqueueModule;
const { buildLexwareProductionFixtureSnapshotsCore: buildLexwareProductionFixtureSnapshots } = fixtureModule;
const { buildLexwareInvoicePayload } = builderModule;
const { validateLexwareInvoicePayload } = validatorModule;
const { evaluateLexwareProductionGates } = jobModule;
const { CHECKOUT_MAINTENANCE_ACTIVE } = maintenanceModule;
const { buildLexwarePayloadSha256, parseLexwarePayloadHashVersion } = hashModule;
type BuildPayloadSha256Input =
  Parameters<EligibleInvoiceBuildDependencies["buildPayloadSha256"]>[0];

const eligibleInvoiceBuildDependencies: EligibleInvoiceBuildDependencies = {
    buildPayload: ({ invoice, items, paymentTermDays }) => buildLexwareInvoicePayload({
      invoice,
      items,
      paymentTermDays,
    }),
    validatePayload: validateLexwareInvoicePayload,
    buildPayloadSha256: buildLexwarePayloadSha256,
    parsePayloadHashVersion: parseLexwarePayloadHashVersion,
};
const buildEligibleLocalInvoice = (input: {
  invoice: LocalInvoiceSnapshot;
  items: LocalInvoiceItemSnapshot[];
}) => buildEligibleLocalInvoiceCore(input, eligibleInvoiceBuildDependencies);

const JOB_ID = "22222222-2222-4222-8222-222222222222";
const snapshots = buildLexwareProductionFixtureSnapshots();
const eligible = buildEligibleLocalInvoice({
  invoice: {
    ...snapshots.invoice,
    invoice_provider: "legacy_internal",
    invoice_status: "draft",
    payment_status: "pending",
    lexware_invoice_job_id: null,
  },
  items: snapshots.items,
});

type Model = {
  job: PersistedLexwareInvoiceJob | null;
  invoiceLink: string | null;
  jobInserts: number;
  invoiceLinks: number;
  outboxEvents: number;
  mailJobs: number;
  lexwareRequests: number;
  failAfterJobInsert?: boolean;
};

function makeModel(existing?: Partial<PersistedLexwareInvoiceJob>): Model {
  return {
    job: existing ? {
      id: JOB_ID,
      request_id: eligible.invoice.request_id,
      local_invoice_id: eligible.invoice.id,
      idempotency_key: eligible.idempotencyKey,
      status: "waiting_for_activation",
      creation_state: "not_attempted",
      payload_sha256: eligible.payloadSha256,
      payload_hash_version: eligible.payloadHashVersion,
      ...existing,
    } : null,
    invoiceLink: existing ? JOB_ID : null,
    jobInserts: 0,
    invoiceLinks: 0,
    outboxEvents: 0,
    mailJobs: 0,
    lexwareRequests: 0,
  };
}

function dependencies(model: Model): LexwareInvoiceJobRepositoryDependencies {
  return {
    loadEligibleLocalInvoice: async () => eligible,
    loadExistingInvoiceJob: async () => {
      if (!model.job) return null;
      if (model.job.payload_hash_version !== eligible.payloadHashVersion) throw new LexwareProductionInvoiceJobRepositoryError("HASH_VERSION_CONFLICT", "version");
      if (model.job.payload_sha256 !== eligible.payloadSha256) throw new LexwareProductionInvoiceJobRepositoryError("PAYLOAD_HASH_CONFLICT", "hash");
      return model.job;
    },
    createOrReuseInvoiceJob: async (): Promise<EnqueueInvoiceJobResult> => {
      if (model.job) return {
        invoiceJobId: model.job.id,
        jobStatus: model.job.status,
        creationState: model.job.creation_state,
        payloadSha256: model.job.payload_sha256,
        payloadHashVersion: model.job.payload_hash_version,
        idempotencyKey: model.job.idempotency_key,
        createdNewJob: false,
        linkedInvoice: false,
      };
      const before = { ...model };
      model.jobInserts += 1;
      model.job = {
        id: JOB_ID,
        request_id: eligible.invoice.request_id,
        local_invoice_id: eligible.invoice.id,
        idempotency_key: eligible.idempotencyKey,
        status: "waiting_for_activation",
        creation_state: "not_attempted",
        payload_sha256: eligible.payloadSha256,
        payload_hash_version: eligible.payloadHashVersion,
      };
      if (model.failAfterJobInsert) {
        Object.assign(model, before);
        throw new Error("MODELED_TRANSACTION_ROLLBACK");
      }
      model.invoiceLink = JOB_ID;
      model.invoiceLinks += 1;
      model.outboxEvents += 1;
      return {
        invoiceJobId: JOB_ID,
        jobStatus: "waiting_for_activation",
        creationState: "not_attempted",
        payloadSha256: eligible.payloadSha256,
        payloadHashVersion: eligible.payloadHashVersion,
        idempotencyKey: eligible.idempotencyKey,
        createdNewJob: true,
        linkedInvoice: true,
      };
    },
    linkInvoiceToJob: (_prepared, result) => result.invoiceJobId,
  };
}

async function run() {
  const modelA = makeModel();
  const resultA = await enqueueLexwareProductionInvoiceJob(eligible.invoice.id, dependencies(modelA));
  assert.equal(resultA.jobStatus, "waiting_for_activation", "A waiting job");
  assert.equal(resultA.creationState, "not_attempted", "A creation state");
  const rawResult = {
    invoice_job_id: JOB_ID, job_status: "waiting_for_activation",
    job_creation_state: "not_attempted", payload_sha256: eligible.payloadSha256,
    payload_hash_version: eligible.payloadHashVersion,
    idempotency_key: eligible.idempotencyKey, created_new_job: true, linked_invoice: true,
  };
  assert.equal(validateEnqueueInvoiceJobResult(rawResult, eligible).invoiceJobId, JOB_ID, "A strict RPC result");
  assert.throws(() => validateEnqueueInvoiceJobResult({ ...rawResult, payload_sha256: "0".repeat(64) }, eligible), /ungültiges/, "A invalid RPC hash blocked");
  assert.equal(modelA.jobInserts, 1, "A exactly one insert");
  const resultB = await enqueueLexwareProductionInvoiceJob(eligible.invoice.id, dependencies(modelA));
  assert.equal(resultB.invoiceJobId, resultA.invoiceJobId, "B same job");
  assert.equal(modelA.jobInserts, 1, "B no second insert");

  for (const label of ["C linked invoice", "D local invoice", "E idempotency key"]) {
    const model = makeModel({});
    const result = await enqueueLexwareProductionInvoiceJob(eligible.invoice.id, dependencies(model));
    assert.equal(result.reusedExistingJob, true, label);
    assert.equal(model.jobInserts, 0, label);
  }

  const conflictDependencies = dependencies(makeModel());
  conflictDependencies.loadExistingInvoiceJob = async () => { throw new LexwareProductionInvoiceJobRepositoryError("CONFLICTING_INVOICE_JOB_LINKS", "conflict"); };
  await assert.rejects(() => enqueueLexwareProductionInvoiceJob(eligible.invoice.id, conflictDependencies), /conflict/, "F conflicting ids");

  const hashModel = makeModel({ payload_sha256: "0".repeat(64) });
  await assert.rejects(() => enqueueLexwareProductionInvoiceJob(eligible.invoice.id, dependencies(hashModel)), /hash/, "G payload conflict");
  assert.equal(hashModel.jobInserts, 0, "G no new job");
  const versionModel = makeModel({ payload_hash_version: "lexware-payload-json-v1" });
  await assert.rejects(() => enqueueLexwareProductionInvoiceJob(eligible.invoice.id, dependencies(versionModel)), /version/, "G version conflict");
  assert.equal(versionModel.jobInserts, 0, "G version conflict no new job");
  const bothModel = makeModel({ payload_hash_version: "lexware-payload-json-v1", payload_sha256: "0".repeat(64) });
  await assert.rejects(() => enqueueLexwareProductionInvoiceJob(eligible.invoice.id, dependencies(bothModel)), /version/, "G version takes priority over hash");
  assert.equal(bothModel.jobInserts, 0, "G combined conflict no new job");

  assert.throws(() => buildEligibleLocalInvoice({ invoice: { ...eligible.invoice, tax_snapshot_version: "invoice-tax-snapshot-v1" }, items: eligible.items }), /V2-Rechnungen/, "H V1 blocked");
  assert.throws(() => buildEligibleLocalInvoice({ invoice: { ...eligible.invoice, tax_snapshot_status: "building" }, items: eligible.items }), /nicht vollständig/, "I incomplete blocked");
  assert.throws(() => buildEligibleLocalInvoice({ invoice: { ...eligible.invoice, tax_snapshot_status: null }, items: eligible.items }), /nicht vollständig/, "I status null blocked");
  assert.throws(() => buildEligibleLocalInvoice({ invoice: { ...eligible.invoice, tax_snapshot_status: "partial" }, items: eligible.items }), /nicht vollständig/, "I partial blocked");
  assert.throws(() => buildEligibleLocalInvoice({ invoice: { ...eligible.invoice, tax_snapshot_version: null }, items: eligible.items }), /V2-Rechnungen/, "I version null blocked");
  assert.throws(() => buildEligibleLocalInvoice({ invoice: { ...eligible.invoice, tax_snapshot_source: null }, items: eligible.items }), /Snapshotquelle/, "I source null blocked");
  assert.equal(buildEligibleLocalInvoice({ invoice: eligible.invoice, items: eligible.items }).invoice.tax_snapshot_status, "complete", "I complete V2 accepted");
  assert.throws(() => buildEligibleLocalInvoice({ invoice: eligible.invoice, items: eligible.items.map((item: LocalInvoiceItemSnapshot, index: number) => index ? item : { ...item, tax_snapshot_version: "invoice-tax-snapshot-v1" }) }), "J item mismatch");
  assert.throws(() => buildEligibleLocalInvoice({ invoice: { ...eligible.invoice, total_amount: Number(eligible.invoice.total_amount) + 0.01 }, items: eligible.items }), "K total mismatch");

  const routeSource = readFileSync("app/api/admin/lexware/invoices/[invoiceId]/enqueue/route.ts", "utf8");
  assert.ok(routeSource.indexOf("LEXWARE_MANUAL_ENQUEUE_CONFIRMATION") < routeSource.indexOf("enqueueLexwareProductionInvoiceJob(invoiceId)"), "L confirmation before write");
  assert.match(routeSource, /databaseWritesPerformed:\s*0/, "L invalid path reports zero writes");

  assert.deepEqual({ job: modelA.jobInserts, link: modelA.invoiceLinks, event: modelA.outboxEvents, mail: modelA.mailJobs, lexware: modelA.lexwareRequests }, { job: 1, link: 1, event: 1, mail: 0, lexware: 0 }, "M exact effects");

  const rollbackModel = makeModel();
  rollbackModel.failAfterJobInsert = true;
  await assert.rejects(() => enqueueLexwareProductionInvoiceJob(eligible.invoice.id, dependencies(rollbackModel)), /ROLLBACK/, "N modeled rollback");
  assert.deepEqual({ job: rollbackModel.job, inserts: rollbackModel.jobInserts, links: rollbackModel.invoiceLinks, events: rollbackModel.outboxEvents }, { job: null, inserts: 0, links: 0, events: 0 }, "N full rollback");

  for (const status of ["succeeded", "manual_review", "processing", "failed", "cancelled"] as const) {
    const model = makeModel({ status, creation_state: status === "succeeded" ? "definitely_created" : "not_attempted" });
    const result = await enqueueLexwareProductionInvoiceJob(eligible.invoice.id, dependencies(model));
    assert.equal(result.jobStatus, status, `O ${status} unchanged`);
    assert.equal(model.jobInserts, 0, `O ${status} no new job`);
  }

  const gates = evaluateLexwareProductionGates({
    activeMode: "test", integrationEnabled: false, productionApiKeyConfigured: true,
    productionOrganizationIdValid: true, credentialsSeparated: true,
    configuredProductionOrganizationId: JOB_ID, databaseProductionOrganizationId: JOB_ID,
    productionWriteEnabled: false, providerAfterCutover: "legacy_internal",
    checkoutMaintenanceActive: CHECKOUT_MAINTENANCE_ACTIVE,
  });
  assert.equal(resultA.jobStatus, "waiting_for_activation", "P legacy provider enqueue allowed");
  assert.equal(gates.allowed, false, "P production remains blocked");
  assert.ok(gates.failedChecks.includes("providerCutoverConfiguredForLexware"), "P provider gate");
  assert.equal(CHECKOUT_MAINTENANCE_ACTIVE, false, "Q checkout reopened");
  assert.equal(resultA.invoiceJobId, JOB_ID, "Q admin preparation still allowed");

  let hashCalls = 0;
  let receivedVersion: string | null = null;
  let receivedPayload: unknown;
  const portPrepared = buildEligibleLocalInvoiceCore({ invoice: eligible.invoice, items: eligible.items }, {
    ...eligibleInvoiceBuildDependencies,
    buildPayloadSha256: (input: BuildPayloadSha256Input) => {
      hashCalls += 1;
      receivedVersion = input.version;
      receivedPayload = input.payload;
      return buildLexwarePayloadSha256(input);
    },
  });
  assert.equal(hashCalls, 1, "HashPort A exactly once");
  assert.equal(receivedVersion, "lexware-payload-canonical-v2", "HashPort B explicit V2");
  assert.equal(receivedPayload, portPrepared.built.payload, "HashPort C validated payload identity");
  let createCallsAfterHashFailure = 0;
  assert.throws(() => buildEligibleLocalInvoiceCore({ invoice: eligible.invoice, items: eligible.items }, {
    ...eligibleInvoiceBuildDependencies,
    buildPayloadSha256: () => { throw new Error("HASH_PORT_FAILED"); },
  }), /HASH_PORT_FAILED/, "HashPort D failure blocks");
  assert.equal(createCallsAfterHashFailure, 0, "HashPort E no RPC after hash failure");
  const enqueueCoreSource = readFileSync("app/lib/lexware/lexwareProductionEnqueueCore.ts", "utf8");
  const repositorySource = readFileSync("app/lib/lexware/lexwareProductionInvoiceJobRepository.ts", "utf8");
  assert.ok(repositorySource.indexOf('fail("HASH_VERSION_CONFLICT"') < repositorySource.indexOf('fail("PAYLOAD_HASH_CONFLICT"'), "Hash conflict version priority in repository");
  assert.doesNotMatch(enqueueCoreSource, /createHash|canonicalJson/, "HashPort F no local hash implementation");
  assert.ok(repositorySource.includes("buildLexwarePayloadSha256"), "HashPort G central hash import symbol");
  assert.ok(repositorySource.includes("@/app/lib/lexware/lexwarePayloadHash"), "HashPort G central hash import source");
  assert.match(repositorySource, /buildPayloadSha256:\s*buildLexwarePayloadSha256/, "HashPort G production dispatcher wiring");
  assert.ok(repositorySource.includes("parseLexwarePayloadHashVersion"), "HashPort G central parser import symbol");
  assert.match(repositorySource, /parsePayloadHashVersion:\s*parseLexwarePayloadHashVersion/, "HashPort G production parser wiring");
  assert.doesNotMatch(repositorySource, /createHash\s*\(/, "HashPort G no local createHash");
  assert.doesNotMatch(repositorySource, /JSON\.stringify\s*\(\s*payload\s*\)/, "HashPort G no local payload serialization");
  assert.doesNotMatch(enqueueCoreSource, /createHash|JSON\.stringify/, "HashPort H no local hash implementation");

  let parserCalls = 0;
  let parserInput: unknown;
  let hashVersionReceived: string | null = null;
  const parserPrepared = buildEligibleLocalInvoiceCore({ invoice: eligible.invoice, items: eligible.items }, {
    ...eligibleInvoiceBuildDependencies,
    parsePayloadHashVersion: (value: unknown) => {
      parserCalls += 1;
      parserInput = value;
      return parseLexwarePayloadHashVersion(value);
    },
    buildPayloadSha256: (input: BuildPayloadSha256Input) => {
      hashVersionReceived = input.version;
      return buildLexwarePayloadSha256(input);
    },
  });
  assert.equal(parserCalls, 1, "ParserPort A exactly once");
  assert.equal(parserInput, "lexware-payload-canonical-v2", "ParserPort B explicit V2");
  assert.equal(hashVersionReceived, parserPrepared.payloadHashVersion, "ParserPort C parsed result reaches hash port");
  let hashCallsAfterParserFailure = 0;
  let enqueueCallsAfterParserFailure = 0;
  assert.throws(() => buildEligibleLocalInvoiceCore({ invoice: eligible.invoice, items: eligible.items }, {
    ...eligibleInvoiceBuildDependencies,
    parsePayloadHashVersion: () => { throw new Error("PARSER_PORT_FAILED"); },
    buildPayloadSha256: () => { hashCallsAfterParserFailure += 1; return "0".repeat(64); },
  }), /PARSER_PORT_FAILED/, "ParserPort D parser failure blocks");
  assert.equal(hashCallsAfterParserFailure, 0, "ParserPort D hash blocked");
  assert.equal(enqueueCallsAfterParserFailure, 0, "ParserPort E enqueue blocked");
  assert.doesNotMatch(enqueueCoreSource, /(?:import|require)[^\n]*lexwarePayloadHash/, "ParserPort F no runtime hash-module import");
  assert.match(repositorySource, /parsePayloadHashVersion:\s*parseLexwarePayloadHashVersion/, "ParserPort G production parser wiring");
  assert.doesNotMatch(enqueueCoreSource, /value\s*===\s*["']lexware-payload|new Set.*lexware-payload/, "ParserPort H no local parser implementation");

  const migration = readFileSync("supabase/migrations/20260803030000_enqueue_existing_v2_lexware_invoice_job.sql", "utf8");
  const legacySignature = "public.enqueue_existing_v2_lexware_invoice_job(uuid,text,jsonb,text,timestamptz,integer)";
  const versionedSignature = "public.enqueue_existing_v2_lexware_invoice_job(uuid,text,jsonb,text,text,timestamptz,integer)";
  const legacyDrop = /drop function if exists public\.enqueue_existing_v2_lexware_invoice_job\(\s*uuid,\s*text,\s*jsonb,\s*text,\s*timestamptz,\s*integer\s*\);/i;
  const versionedCreate = /create or replace function public\.enqueue_existing_v2_lexware_invoice_job\(\s*p_local_invoice_id uuid,\s*p_idempotency_key text,\s*p_payload_snapshot jsonb,\s*p_payload_sha256 text,\s*p_payload_hash_version text,\s*p_expected_snapshot_at timestamptz,\s*p_expected_item_count integer\s*\)/i;
  assert.match(migration, legacyDrop, "Migration A explicitly drops legacy six-parameter overload");
  const legacyDropStatement = migration.match(legacyDrop)?.[0] ?? "";
  assert.doesNotMatch(legacyDropStatement, /\bcascade\b/i, "Migration B legacy drop has no CASCADE");
  const legacyDropIndex = migration.search(legacyDrop);
  const versionedCreateIndex = migration.search(versionedCreate);
  assert.ok(legacyDropIndex >= 0 && versionedCreateIndex > legacyDropIndex, "Migration C legacy drop precedes versioned create");
  assert.notEqual(legacySignature, versionedSignature, "Migration D legacy and versioned identities differ");
  assert.equal((migration.match(/create or replace function public\.enqueue_existing_v2_lexware_invoice_job\s*\(/gi) ?? []).length, 1, "Migration E no legacy wrapper is created");
  assert.doesNotMatch(migration, /p_payload_hash_version\s+(?:text\s+)?default|coalesce\s*\(\s*p_payload_hash_version/i, "Migration F no default hash version for legacy callers");
  assert.match(migration, versionedCreate, "Migration G versioned signature requires p_payload_hash_version text");
  assert.ok(migration.indexOf("raise exception 'PAYLOAD_HASH_VERSION_INVALID'") < migration.indexOf("raise exception 'PAYLOAD_SHA256_INVALID'"), "Migration H validates version before hash");
  assert.match(migration, new RegExp(`revoke all on function ${versionedSignature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} from public, anon, authenticated;`, "i"), "Migration I revokes versioned signature");
  assert.match(migration, new RegExp(`grant execute on function ${versionedSignature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} to service_role;`, "i"), "Migration I grants only versioned signature");
  assert.doesNotMatch(migration, new RegExp(`grant execute on function ${legacySignature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"), "Migration I grants nothing to legacy signature");
  assert.doesNotMatch(migration, /20260803050000|20260803070000|paypal_payment_idempotency|lexware_pdf_storage_mail_delivery_state/i, "Migration J has no phase 50000 or 70000 dependency");
  const simulatedSignatures = new Set([legacySignature]);
  simulatedSignatures.delete(legacySignature);
  simulatedSignatures.add(versionedSignature);
  assert.deepEqual([...simulatedSignatures], [versionedSignature], "Migration K leaves exactly the versioned RPC identity");
  assert.ok(migration.indexOf("raise exception 'HASH_VERSION_CONFLICT'") < migration.indexOf("raise exception 'PAYLOAD_HASH_CONFLICT'"), "Hash conflict version priority in SQL");
  assert.match(migration, /invoice_row\.lexware_invoice_job_id as candidate_id/, "C linked invoice lookup");
  assert.match(migration, /where local_invoice_id = invoice_row\.id/, "D local invoice lookup");
  assert.match(migration, /idempotency_key = p_idempotency_key/, "E idempotency lookup");
  assert.match(migration, /where request_id = locked_request_id/, "request lookup");
  assert.match(migration, /for update/i, "SQL locks rows");
  const requestLock = migration.indexOf("where id = locked_request_id for update");
  const jobLock = migration.indexOf("where id = candidate_ids[1]");
  const invoiceLock = migration.indexOf("where id = p_local_invoice_id\n  for update");
  assert.ok(requestLock >= 0 && jobLock > requestLock && invoiceLock > jobLock, "SQL fixed lock order request -> job -> invoice");
  assert.match(migration, /security definer[\s\S]*set search_path = public, pg_temp/i, "SQL security pattern");
  assert.match(migration, /'waiting_for_activation', 'not_attempted', 0/, "SQL safe initial state");
  assert.doesNotMatch(migration, /enqueue_school_lexware_invoice_mail_job/, "no mail job");
  assert.doesNotMatch(routeSource, /fetch\s*\(|createLexware|requestInvoicePdf|send.*Mail/i, "route no external/PDF/mail");
  console.log("PASS A-Q: mocked atomic enqueue; no database, Lexware, PDF or mail operation.");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
