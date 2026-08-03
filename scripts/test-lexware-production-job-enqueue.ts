import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildLexwareProductionFixtureSnapshots } from "../app/lib/lexware/lexwareProductionFixtureDryRun";
import {
  buildEligibleLocalInvoice,
  enqueueLexwareProductionInvoiceJob,
  LexwareProductionInvoiceJobRepositoryError,
  validateEnqueueInvoiceJobResult,
  type EligibleLocalInvoice,
  type EnqueueInvoiceJobResult,
  type LexwareInvoiceJobRepositoryDependencies,
  type PersistedLexwareInvoiceJob,
} from "../app/lib/lexware/lexwareProductionInvoiceJobRepository";
import { evaluateLexwareProductionGates } from "../app/lib/lexware/lexwareProductionInvoiceJob";
import { CHECKOUT_MAINTENANCE_ACTIVE } from "../lib/checkoutMaintenance";

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
      if (model.job.payload_sha256 !== eligible.payloadSha256) throw new LexwareProductionInvoiceJobRepositoryError("EXISTING_INVOICE_JOB_PAYLOAD_CONFLICT", "hash");
      return model.job;
    },
    createOrReuseInvoiceJob: async (): Promise<EnqueueInvoiceJobResult> => {
      if (model.job) return {
        invoiceJobId: model.job.id,
        jobStatus: model.job.status,
        creationState: model.job.creation_state,
        payloadSha256: model.job.payload_sha256,
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

  assert.throws(() => buildEligibleLocalInvoice({ invoice: { ...eligible.invoice, tax_snapshot_version: "invoice-tax-snapshot-v1" }, items: eligible.items }), /V2-Rechnungen/, "H V1 blocked");
  assert.throws(() => buildEligibleLocalInvoice({ invoice: { ...eligible.invoice, tax_snapshot_status: "building" }, items: eligible.items }), /nicht vollständig/, "I incomplete blocked");
  assert.throws(() => buildEligibleLocalInvoice({ invoice: eligible.invoice, items: eligible.items.map((item, index) => index ? item : { ...item, tax_snapshot_version: "invoice-tax-snapshot-v1" }) }), "J item mismatch");
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
  assert.equal(CHECKOUT_MAINTENANCE_ACTIVE, true, "Q maintenance active");
  assert.equal(resultA.invoiceJobId, JOB_ID, "Q admin preparation still allowed");

  const migration = readFileSync("supabase/migrations/20260803030000_enqueue_existing_v2_lexware_invoice_job.sql", "utf8");
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
