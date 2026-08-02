import { canAttemptExternalWrite, isValidJobCreationStateCombination, type LexwareInvoiceCreationState, type LexwareInvoiceJobStatus, type LexwareProductionGateResult } from "./lexwareProductionInvoiceJob";

type LexwareInvoiceReadModel = {
  voucherStatus: string | null; voucherNumber?: string | null; organizationId: string; lineItems: unknown[]; paymentTermLabel: string | null;
  totalPrice: { currency: string | null; totalNetAmount: number | null; totalGrossAmount: number | null; totalTaxAmount: number | null };
  taxAmounts: Array<{ taxRatePercentage: number | null; taxAmount: number | null; netAmount: number | null }>;
};
type LexwareInvoicePayloadBuildResult = {
  payload: { lineItems: unknown[]; paymentConditions: { paymentTermLabel: string } };
  expected: { totalGrossAmount: number; totalNetAmount: number; totalTaxAmount: number; taxRates: Array<{ taxRatePercentage: number; netAmount: number; taxAmount: number }> };
};
type LexwareInvoicePayloadValidationResult = { valid: boolean };
type LexwareProductionCreateResult = { id: string; resourceUri: string; createdDate: string; updatedDate: string | null; version: number | null; requestCount: 1; finalize: true; creationState: "definitely_created" };

export type ProductionInvoiceRecord = {
  id: string; invoice_provider: string; tax_snapshot_version: string; tax_snapshot_status: string;
};
export type ProductionInvoiceJob = {
  id: string; status: LexwareInvoiceJobStatus; creation_state: LexwareInvoiceCreationState;
  payload_sha256: string; lexware_invoice_id: string | null; lock_expires_at: string | null;
  lexware_invoice_number?: string | null; completed_at?: string | null;
};
export type JobTransition = Partial<ProductionInvoiceJob> & {
  status: LexwareInvoiceJobStatus; creation_state: LexwareInvoiceCreationState;
  external_write_started_at?: string; external_write_completed_at?: string;
  completed_at?: string; last_error_code?: string;
  lexware_resource_uri?: string; lexware_created_date?: string;
  lexware_invoice_number?: string; lexware_voucher_status?: string;
  last_external_http_status?: number; last_external_retry_after_seconds?: number;
};
export type ProcessorDependencies = {
  loadLocalInvoice(): Promise<ProductionInvoiceRecord>;
  loadOrCreateJob(): Promise<ProductionInvoiceJob>;
  loadPersistedPayload(job: ProductionInvoiceJob): Promise<LexwareInvoicePayloadBuildResult>;
  buildPayload(invoice: ProductionInvoiceRecord): Promise<LexwareInvoicePayloadBuildResult> | LexwareInvoicePayloadBuildResult;
  validatePayload(payload: LexwareInvoicePayloadBuildResult): Promise<LexwareInvoicePayloadValidationResult> | LexwareInvoicePayloadValidationResult;
  hashPayload(payload: LexwareInvoicePayloadBuildResult): Promise<string> | string;
  evaluateGates(): Promise<LexwareProductionGateResult> | LexwareProductionGateResult;
  persistJobTransition(transition: JobTransition): Promise<void>;
  createFinalInvoice(payload: LexwareInvoicePayloadBuildResult): Promise<LexwareProductionCreateResult>;
  persistExternalResult(result: LexwareProductionCreateResult): Promise<void>;
  readInvoice(id: string): Promise<LexwareInvoiceReadModel>;
  compareReadBack(invoice: LexwareInvoiceReadModel, payload: LexwareInvoicePayloadBuildResult): string[];
  currentTime(): string;
};
export type ProcessorResult = { outcome: "succeeded" | "blocked" | "manual_review" | "read_back"; postCount: number; externalInvoiceId: string | null; reasons: string[] };

const cents = (value: number | null) => value === null ? null : Math.round(value * 100);
export function compareLexwareOpenInvoiceReadBack(invoice: LexwareInvoiceReadModel, payload: LexwareInvoicePayloadBuildResult, organizationId: string): string[] {
  const differences: string[] = [];
  if (invoice.voucherStatus !== "open") differences.push("voucher_status_not_open");
  if (invoice.organizationId !== organizationId.toLowerCase()) differences.push("organization_mismatch");
  if (invoice.totalPrice.currency !== "EUR") differences.push("currency_not_eur");
  if (invoice.lineItems.length !== payload.payload.lineItems.length) differences.push("line_item_count_mismatch");
  if (cents(invoice.totalPrice.totalGrossAmount) !== cents(payload.expected.totalGrossAmount)) differences.push("total_gross_mismatch");
  if (cents(invoice.totalPrice.totalNetAmount) !== cents(payload.expected.totalNetAmount)) differences.push("total_net_mismatch");
  if (cents(invoice.totalPrice.totalTaxAmount) !== cents(payload.expected.totalTaxAmount)) differences.push("total_tax_mismatch");
  for (const rate of [7, 19]) {
    const expected = payload.expected.taxRates.find(entry => entry.taxRatePercentage === rate);
    const actual = invoice.taxAmounts.find(entry => entry.taxRatePercentage === rate);
    if (Boolean(expected) !== Boolean(actual) || (expected && actual && (cents(expected.netAmount) !== cents(actual.netAmount) || cents(expected.taxAmount) !== cents(actual.taxAmount)))) differences.push(`tax_bucket_${rate}_mismatch`);
  }
  if (invoice.paymentTermLabel !== payload.payload.paymentConditions.paymentTermLabel) differences.push("payment_terms_mismatch");
  return differences;
}

export async function processLexwareProductionInvoice(deps: ProcessorDependencies): Promise<ProcessorResult> {
  const invoice = await deps.loadLocalInvoice();
  if (invoice.tax_snapshot_version !== "invoice-tax-snapshot-v2" || invoice.tax_snapshot_status !== "complete" || invoice.invoice_provider !== "lexware") {
    return { outcome: "blocked", postCount: 0, externalInvoiceId: null, reasons: ["local_invoice_not_production_eligible"] };
  }
  const job = await deps.loadOrCreateJob();
  if (job.creation_state === "creation_state_unknown") {
    if (job.status !== "manual_review") await deps.persistJobTransition({ status: "manual_review", creation_state: "creation_state_unknown", last_error_code: "CREATION_STATE_UNKNOWN" });
    return { outcome: "manual_review", postCount: 0, externalInvoiceId: job.lexware_invoice_id, reasons: ["creation_state_unknown"] };
  }
  if (!isValidJobCreationStateCombination({ status: job.status, creationState: job.creation_state, lexwareInvoiceId: job.lexware_invoice_id, lexwareInvoiceNumber: job.lexware_invoice_number, completedAt: job.completed_at })) {
    return { outcome: "blocked", postCount: 0, externalInvoiceId: job.lexware_invoice_id, reasons: ["job_semantics_invalid"] };
  }
  const now = deps.currentTime();
  if (job.status === "processing" && job.lock_expires_at && Date.parse(job.lock_expires_at) > Date.parse(now)) return { outcome: "blocked", postCount: 0, externalInvoiceId: job.lexware_invoice_id, reasons: ["active_lock"] };
  const verifyExisting = async (id: string, postCount: number, payload: LexwareInvoicePayloadBuildResult): Promise<ProcessorResult> => {
    const readBack = await deps.readInvoice(id);
    const differences = deps.compareReadBack(readBack, payload);
    const voucherNumber = readBack.voucherNumber || null;
    if (!voucherNumber) differences.push("voucher_number_missing");
    if (differences.length) {
      await deps.persistJobTransition({ status: "manual_review", creation_state: "definitely_created", last_error_code: "READ_BACK_MISMATCH" });
      return { outcome: "manual_review", postCount, externalInvoiceId: id, reasons: differences };
    }
    await deps.persistJobTransition({ status: "succeeded", creation_state: "definitely_created", completed_at: deps.currentTime(), lexware_invoice_number: voucherNumber!, lexware_voucher_status: "open" });
    return { outcome: "succeeded", postCount, externalInvoiceId: id, reasons: [] };
  };
  if (job.lexware_invoice_id) {
    const persistedPayload = await deps.loadPersistedPayload(job);
    return verifyExisting(job.lexware_invoice_id, 0, persistedPayload);
  }
  const payload = await deps.buildPayload(invoice);
  const validation = await deps.validatePayload(payload);
  if (!validation.valid) return { outcome: "blocked", postCount: 0, externalInvoiceId: job.lexware_invoice_id, reasons: ["payload_invalid"] };
  const hash = await deps.hashPayload(payload);
  if (hash !== job.payload_sha256) {
    await deps.persistJobTransition({ status: "manual_review", creation_state: job.creation_state, last_error_code: "PAYLOAD_HASH_MISMATCH" });
    return { outcome: "manual_review", postCount: 0, externalInvoiceId: job.lexware_invoice_id, reasons: ["payload_hash_mismatch"] };
  }
  const gates = await deps.evaluateGates();
  if (!gates.allowed) return { outcome: "blocked", postCount: 0, externalInvoiceId: null, reasons: gates.failedChecks };
  if (!canAttemptExternalWrite(job.status, job.creation_state)) return { outcome: "blocked", postCount: 0, externalInvoiceId: null, reasons: ["job_state_not_write_eligible"] };
  await deps.persistJobTransition({ status: "processing", creation_state: job.creation_state, external_write_started_at: now });
  let created: LexwareProductionCreateResult;
  try { created = await deps.createFinalInvoice(payload); }
  catch (error) {
    const state = error && typeof error === "object" && "creationState" in error ? (error as { creationState: LexwareInvoiceCreationState }).creationState : "creation_state_unknown";
    const diagnostic = error as { httpStatus?: number | null; retryAfterSeconds?: number | null };
    await deps.persistJobTransition({ status: state === "definite_not_created" ? "retry" : "manual_review", creation_state: state, last_error_code: error instanceof Error ? error.name : "EXTERNAL_WRITE_FAILED", ...(diagnostic.httpStatus == null ? {} : { last_external_http_status: diagnostic.httpStatus }), ...(diagnostic.retryAfterSeconds == null ? {} : { last_external_retry_after_seconds: diagnostic.retryAfterSeconds }) });
    return { outcome: state === "definite_not_created" ? "blocked" : "manual_review", postCount: 1, externalInvoiceId: null, reasons: [state] };
  }
  try {
    await deps.persistExternalResult(created);
    await deps.persistJobTransition({ status: "processing", creation_state: "definitely_created", lexware_invoice_id: created.id, lexware_resource_uri: created.resourceUri, lexware_created_date: created.createdDate, external_write_completed_at: deps.currentTime() });
  } catch {
    await deps.persistJobTransition({ status: "manual_review", creation_state: "creation_state_unknown", last_error_code: "EXTERNAL_RESULT_PERSIST_FAILED" }).catch(() => undefined);
    return { outcome: "manual_review", postCount: 1, externalInvoiceId: created.id, reasons: ["external_result_persist_failed"] };
  }
  return verifyExisting(created.id, 1, payload);
}
