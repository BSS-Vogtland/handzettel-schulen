export type LexwarePayloadHashVersion =
  | "lexware-payload-json-v1"
  | "lexware-payload-canonical-v2";
const LEXWARE_PAYLOAD_HASH_V2: LexwarePayloadHashVersion =
  "lexware-payload-canonical-v2";

export const LEXWARE_MANUAL_ENQUEUE_CONFIRMATION =
  "ENQUEUE_LEXWARE_INVOICE_JOB" as const;

export type LexwareInvoiceJobStatus =
  | "waiting_for_activation" | "pending" | "processing" | "retry"
  | "succeeded" | "failed" | "manual_review" | "cancelled";
export type LexwareInvoiceCreationState =
  | "not_attempted" | "definite_not_created"
  | "definitely_created" | "creation_state_unknown";

export type LocalInvoiceSnapshot = {
  id: string;
  request_id: string;
  invoice_status?: string | null;
  payment_status?: string | null;
  lexware_invoice_job_id?: string | null;
  tax_snapshot_status: string | null;
  tax_snapshot_version: string | null;
  tax_snapshot_source: string | null;
  tax_snapshot_at: string | null;
  [key: string]: unknown;
};

export type LocalInvoiceItemSnapshot = {
  [key: string]: unknown;
};

export type PayloadBuildResult = {
  payload: Record<string, unknown> & { lineItems: unknown[] };
  [key: string]: unknown;
};

export type PersistedLexwareInvoiceJob = {
  id: string;
  request_id: string;
  local_invoice_id: string | null;
  idempotency_key: string;
  status: LexwareInvoiceJobStatus;
  creation_state: LexwareInvoiceCreationState;
  payload_sha256: string;
  payload_hash_version: LexwarePayloadHashVersion;
};

export type EligibleLocalInvoice = {
  invoice: LocalInvoiceSnapshot;
  items: LocalInvoiceItemSnapshot[];
  built: PayloadBuildResult;
  payloadSha256: string;
  payloadHashVersion: LexwarePayloadHashVersion;
  idempotencyKey: string;
};

export type EnqueueInvoiceJobResult = {
  invoiceJobId: string;
  jobStatus: LexwareInvoiceJobStatus;
  creationState: LexwareInvoiceCreationState;
  payloadSha256: string;
  payloadHashVersion: LexwarePayloadHashVersion;
  idempotencyKey: string;
  createdNewJob: boolean;
  linkedInvoice: boolean;
};

export class LexwareProductionInvoiceJobRepositoryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "LexwareProductionInvoiceJobRepositoryError";
    this.code = code;
  }
}

const fail = (code: string, message: string): never => {
  throw new LexwareProductionInvoiceJobRepositoryError(code, message);
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JOB_STATUSES = new Set<LexwareInvoiceJobStatus>([
  "waiting_for_activation", "pending", "processing", "retry", "succeeded",
  "failed", "manual_review", "cancelled",
]);
const CREATION_STATES = new Set<LexwareInvoiceCreationState>([
  "not_attempted", "definite_not_created", "definitely_created", "creation_state_unknown",
]);

export function buildLexwareInvoiceJobIdempotencyKey(invoiceId: string) {
  return `lexware:local-invoice:${invoiceId}:v1`;
}

export type EligibleInvoiceBuildDependencies = {
  buildPayload(input: {
    invoice: LocalInvoiceSnapshot;
    items: LocalInvoiceItemSnapshot[];
    paymentTermDays: number;
  }): PayloadBuildResult;
  validatePayload(built: PayloadBuildResult): { valid: boolean };
  buildPayloadSha256(input: {
    payload: unknown;
    version: LexwarePayloadHashVersion;
  }): string;
  parsePayloadHashVersion(value: unknown): LexwarePayloadHashVersion;
};

export function buildEligibleLocalInvoice(
  input: { invoice: LocalInvoiceSnapshot; items: LocalInvoiceItemSnapshot[] },
  dependencies: EligibleInvoiceBuildDependencies,
): EligibleLocalInvoice {
  const { invoice, items } = input;
  if (!invoice.id || !invoice.request_id) fail("LOCAL_INVOICE_IDENTITY_INVALID", "Rechnungs- oder Anfrage-ID fehlt.");
  if (invoice.invoice_status && !["draft", "sent"].includes(invoice.invoice_status)) fail("LOCAL_INVOICE_NOT_ELIGIBLE", "Die lokale Rechnung ist storniert oder fachlich ungeeignet.");
  if (invoice.payment_status === "cancelled") fail("LOCAL_INVOICE_NOT_ELIGIBLE", "Die lokale Rechnung ist zahlungsseitig storniert.");
  if (invoice.tax_snapshot_status !== "complete") fail("LOCAL_INVOICE_SNAPSHOT_INCOMPLETE", "Der Steuer-Snapshot ist nicht vollständig.");
  if (invoice.tax_snapshot_version !== "invoice-tax-snapshot-v2") fail("LOCAL_INVOICE_SNAPSHOT_NOT_V2", "Nur vollständige V2-Rechnungen können vorbereitet werden.");
  if (invoice.tax_snapshot_source !== "product_catalog_at_checkout") fail("LOCAL_INVOICE_SNAPSHOT_SOURCE_INVALID", "Die Snapshotquelle ist nicht zulässig.");
  if (!items.length) fail("LOCAL_INVOICE_ITEMS_MISSING", "Die Rechnungspositionen fehlen.");

  const built = dependencies.buildPayload({ invoice, items, paymentTermDays: 7 });
  const validation = dependencies.validatePayload(built);
  if (!validation.valid) fail("LEXWARE_PAYLOAD_INVALID", "Der Lexware-Payload ist nicht valide.");

  const payloadHashVersion = dependencies.parsePayloadHashVersion(LEXWARE_PAYLOAD_HASH_V2);
  return {
    invoice,
    items,
    built,
    payloadSha256: dependencies.buildPayloadSha256({ payload: built.payload, version: payloadHashVersion }),
    payloadHashVersion,
    idempotencyKey: buildLexwareInvoiceJobIdempotencyKey(invoice.id),
  };
}

export function validateEnqueueInvoiceJobResult(
  raw: unknown,
  prepared: EligibleLocalInvoice,
): EnqueueInvoiceJobResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    fail("INVOICE_JOB_RPC_RESULT_INVALID", "Die atomare Jobanlage lieferte kein gültiges Objekt.");
  }
  const row = raw as Record<string, unknown>;
  if (row.payload_hash_version !== prepared.payloadHashVersion) {
    return fail("INVOICE_JOB_RPC_RESULT_INVALID", "Die atomare Jobanlage lieferte eine abweichende Payload-Hashversion.");
  }
  const result = {
    invoiceJobId: row.invoice_job_id as string,
    jobStatus: row.job_status as LexwareInvoiceJobStatus,
    creationState: row.job_creation_state as LexwareInvoiceCreationState,
    payloadSha256: row.payload_sha256 as string,
    payloadHashVersion: prepared.payloadHashVersion,
    idempotencyKey: row.idempotency_key as string,
    createdNewJob: row.created_new_job as boolean,
    linkedInvoice: row.linked_invoice as boolean,
  };
  if (!UUID_PATTERN.test(String(result.invoiceJobId ?? ""))
      || !JOB_STATUSES.has(result.jobStatus)
      || !CREATION_STATES.has(result.creationState)
      || result.payloadSha256 !== prepared.payloadSha256
      || result.payloadHashVersion !== prepared.payloadHashVersion
      || result.idempotencyKey !== prepared.idempotencyKey
      || typeof result.createdNewJob !== "boolean"
      || typeof result.linkedInvoice !== "boolean") {
    fail("INVOICE_JOB_RPC_RESULT_INVALID", "Die atomare Jobanlage lieferte ein ungültiges oder widersprüchliches Ergebnis.");
  }
  if (result.createdNewJob
      && (result.jobStatus !== "waiting_for_activation" || result.creationState !== "not_attempted" || !result.linkedInvoice)) {
    fail("INVOICE_JOB_RPC_NEW_STATE_INVALID", "Ein neuer Rechnungsjob besitzt nicht den sicheren Initialzustand.");
  }
  return result;
}

export type LexwareInvoiceJobRepositoryDependencies = {
  loadEligibleLocalInvoice(invoiceId: string): Promise<EligibleLocalInvoice>;
  loadExistingInvoiceJob(prepared: EligibleLocalInvoice): Promise<PersistedLexwareInvoiceJob | null>;
  createOrReuseInvoiceJob(prepared: EligibleLocalInvoice): Promise<EnqueueInvoiceJobResult>;
  linkInvoiceToJob(prepared: EligibleLocalInvoice, result: EnqueueInvoiceJobResult): string;
};

export async function enqueueLexwareProductionInvoiceJob(
  invoiceId: string,
  dependencies: LexwareInvoiceJobRepositoryDependencies,
) {
  const prepared = await dependencies.loadEligibleLocalInvoice(invoiceId);
  const existing = await dependencies.loadExistingInvoiceJob(prepared);
  const result = await dependencies.createOrReuseInvoiceJob(prepared);
  dependencies.linkInvoiceToJob(prepared, result);
  return {
    ...result,
    reusedExistingJob: !result.createdNewJob,
    existingJobStatusBeforeEnqueue: existing?.status ?? null,
  };
}
