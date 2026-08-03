import "server-only";

import { createHash } from "node:crypto";
import {
  buildLexwareInvoicePayload,
  type LexwareInvoicePayloadBuildResult,
  type LocalLexwareInvoiceItemSnapshot,
  type LocalLexwareInvoiceSnapshot,
} from "@/app/lib/lexware/lexwareInvoicePayloadBuilder";
import { validateLexwareInvoicePayload } from "@/app/lib/lexware/lexwareInvoicePayloadValidator";
import type {
  LexwareInvoiceCreationState,
  LexwareInvoiceJobStatus,
} from "@/app/lib/lexware/lexwareProductionInvoiceJob";

export const LEXWARE_MANUAL_ENQUEUE_CONFIRMATION =
  "ENQUEUE_LEXWARE_INVOICE_JOB" as const;

export type PersistedLexwareInvoiceJob = {
  id: string;
  request_id: string;
  local_invoice_id: string | null;
  idempotency_key: string;
  status: LexwareInvoiceJobStatus;
  creation_state: LexwareInvoiceCreationState;
  payload_sha256: string;
};

export type EligibleLocalInvoice = {
  invoice: LocalLexwareInvoiceSnapshot & {
    invoice_status?: string | null;
    payment_status?: string | null;
    lexware_invoice_job_id?: string | null;
  };
  items: LocalLexwareInvoiceItemSnapshot[];
  built: LexwareInvoicePayloadBuildResult;
  payloadSha256: string;
  idempotencyKey: string;
};

export type EnqueueInvoiceJobResult = {
  invoiceJobId: string;
  jobStatus: LexwareInvoiceJobStatus;
  creationState: LexwareInvoiceCreationState;
  payloadSha256: string;
  idempotencyKey: string;
  createdNewJob: boolean;
  linkedInvoice: boolean;
};

export class LexwareProductionInvoiceJobRepositoryError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "LexwareProductionInvoiceJobRepositoryError";
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

async function getSupabaseServer() {
  const { supabaseServer } = await import("@/lib/supabase/server");
  return supabaseServer;
}

export function buildLexwareInvoiceJobIdempotencyKey(invoiceId: string) {
  return `lexware:local-invoice:${invoiceId}:v1`;
}

export function buildLexwarePayloadSha256(built: LexwareInvoicePayloadBuildResult) {
  return createHash("sha256").update(JSON.stringify(built.payload)).digest("hex");
}

export function buildEligibleLocalInvoice(input: {
  invoice: EligibleLocalInvoice["invoice"];
  items: LocalLexwareInvoiceItemSnapshot[];
}): EligibleLocalInvoice {
  const { invoice, items } = input;
  if (!invoice.id || !invoice.request_id) fail("LOCAL_INVOICE_IDENTITY_INVALID", "Rechnungs- oder Anfrage-ID fehlt.");
  if (invoice.invoice_status && !["draft", "sent"].includes(invoice.invoice_status)) fail("LOCAL_INVOICE_NOT_ELIGIBLE", "Die lokale Rechnung ist storniert oder fachlich ungeeignet.");
  if (invoice.payment_status === "cancelled") fail("LOCAL_INVOICE_NOT_ELIGIBLE", "Die lokale Rechnung ist zahlungsseitig storniert.");
  if (invoice.tax_snapshot_status !== "complete") fail("LOCAL_INVOICE_SNAPSHOT_INCOMPLETE", "Der Steuer-Snapshot ist nicht vollständig.");
  if (invoice.tax_snapshot_version !== "invoice-tax-snapshot-v2") fail("LOCAL_INVOICE_SNAPSHOT_NOT_V2", "Nur vollständige V2-Rechnungen können vorbereitet werden.");
  if (invoice.tax_snapshot_source !== "product_catalog_at_checkout") fail("LOCAL_INVOICE_SNAPSHOT_SOURCE_INVALID", "Die Snapshotquelle ist nicht zulässig.");
  if (!items.length) fail("LOCAL_INVOICE_ITEMS_MISSING", "Die Rechnungspositionen fehlen.");

  const built = buildLexwareInvoicePayload({ invoice, items, paymentTermDays: 7 });
  const validation = validateLexwareInvoicePayload(built);
  if (!validation.valid) fail("LEXWARE_PAYLOAD_INVALID", "Der Lexware-Payload ist nicht valide.");

  return {
    invoice,
    items,
    built,
    payloadSha256: buildLexwarePayloadSha256(built),
    idempotencyKey: buildLexwareInvoiceJobIdempotencyKey(invoice.id),
  };
}

export async function loadEligibleLocalInvoice(invoiceId: string): Promise<EligibleLocalInvoice> {
  const supabaseServer = await getSupabaseServer();
  const { data: invoice, error: invoiceError } = await supabaseServer
    .from("school_request_invoices").select("*").eq("id", invoiceId).single();
  if (invoiceError || !invoice) fail("LOCAL_INVOICE_NOT_FOUND", "Lokale Rechnung nicht gefunden.");
  const { data: items, error: itemsError } = await supabaseServer
    .from("school_request_invoice_items").select("*").eq("invoice_id", invoiceId).order("created_at");
  if (itemsError) fail("LOCAL_INVOICE_ITEMS_LOAD_FAILED", "Rechnungspositionen konnten nicht geladen werden.");
  return buildEligibleLocalInvoice({
    invoice: invoice as unknown as EligibleLocalInvoice["invoice"],
    items: (items ?? []) as unknown as LocalLexwareInvoiceItemSnapshot[],
  });
}

async function loadJobBy(column: string, value: string | null | undefined) {
  if (!value) return null;
  const supabaseServer = await getSupabaseServer();
  const { data, error } = await supabaseServer.from("school_lexware_invoice_jobs")
    .select("id,request_id,local_invoice_id,idempotency_key,status,creation_state,payload_sha256")
    .eq(column, value).maybeSingle();
  if (error) fail("INVOICE_JOB_LOAD_FAILED", "Lexware-Rechnungsjob konnte nicht geladen werden.");
  return data as PersistedLexwareInvoiceJob | null;
}

export async function loadExistingInvoiceJob(prepared: EligibleLocalInvoice) {
  const candidates = await Promise.all([
    loadJobBy("id", prepared.invoice.lexware_invoice_job_id),
    loadJobBy("local_invoice_id", prepared.invoice.id),
    loadJobBy("idempotency_key", prepared.idempotencyKey),
    loadJobBy("request_id", prepared.invoice.request_id),
  ]);
  const distinct = new Map(candidates.filter(Boolean).map((job) => [job!.id, job!]));
  if (distinct.size > 1) fail("CONFLICTING_INVOICE_JOB_LINKS", "Widersprüchliche Lexware-Jobverknüpfungen gefunden.");
  const job = distinct.values().next().value as PersistedLexwareInvoiceJob | undefined;
  if (!job) return null;
  if (job.request_id !== prepared.invoice.request_id || job.local_invoice_id !== prepared.invoice.id || job.idempotency_key !== prepared.idempotencyKey) {
    fail("EXISTING_INVOICE_JOB_IDENTITY_CONFLICT", "Der vorhandene Job gehört nicht eindeutig zu dieser Rechnung.");
  }
  if (job.payload_sha256 !== prepared.payloadSha256) fail("EXISTING_INVOICE_JOB_PAYLOAD_CONFLICT", "Der vorhandene Job besitzt einen abweichenden Payload-Hash.");
  return job;
}

export function validateEnqueueInvoiceJobResult(
  raw: unknown,
  prepared: EligibleLocalInvoice,
): EnqueueInvoiceJobResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    fail("INVOICE_JOB_RPC_RESULT_INVALID", "Die atomare Jobanlage lieferte kein gültiges Objekt.");
  }
  const row = raw as Record<string, unknown>;
  const result = {
    invoiceJobId: row.invoice_job_id as string,
    jobStatus: row.job_status as LexwareInvoiceJobStatus,
    creationState: row.job_creation_state as LexwareInvoiceCreationState,
    payloadSha256: row.payload_sha256 as string,
    idempotencyKey: row.idempotency_key as string,
    createdNewJob: row.created_new_job as boolean,
    linkedInvoice: row.linked_invoice as boolean,
  };
  if (!UUID_PATTERN.test(String(result.invoiceJobId ?? ""))
      || !JOB_STATUSES.has(result.jobStatus)
      || !CREATION_STATES.has(result.creationState)
      || result.payloadSha256 !== prepared.payloadSha256
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

export async function createOrReuseInvoiceJob(prepared: EligibleLocalInvoice): Promise<EnqueueInvoiceJobResult> {
  const supabaseServer = await getSupabaseServer();
  const { data, error } = await supabaseServer.rpc("enqueue_existing_v2_lexware_invoice_job", {
    p_local_invoice_id: prepared.invoice.id,
    p_idempotency_key: prepared.idempotencyKey,
    p_payload_snapshot: prepared.built,
    p_payload_sha256: prepared.payloadSha256,
    p_expected_snapshot_at: prepared.invoice.tax_snapshot_at,
    p_expected_item_count: prepared.items.length,
  });
  if (error) fail("INVOICE_JOB_ENQUEUE_FAILED", error.message || "Lexware-Rechnungsjob konnte nicht angelegt werden.");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) fail("INVOICE_JOB_ENQUEUE_EMPTY", "Die atomare Jobanlage lieferte kein Ergebnis.");
  return validateEnqueueInvoiceJobResult(row, prepared);
}

export function linkInvoiceToJob(prepared: EligibleLocalInvoice, result: EnqueueInvoiceJobResult) {
  if (result.payloadSha256 !== prepared.payloadSha256 || result.idempotencyKey !== prepared.idempotencyKey) {
    fail("INVOICE_JOB_RPC_RESULT_CONFLICT", "Das atomare RPC-Ergebnis stimmt nicht mit der vorbereiteten Rechnung überein.");
  }
  return result.invoiceJobId;
}

export async function loadInvoiceJob(invoiceJobId: string) {
  return loadJobBy("id", invoiceJobId);
}

export function buildJobPreview(prepared: EligibleLocalInvoice, existingJob: PersistedLexwareInvoiceJob | null) {
  return {
    invoiceId: prepared.invoice.id,
    requestId: prepared.invoice.request_id,
    payloadSha256: prepared.payloadSha256,
    idempotencyKey: prepared.idempotencyKey,
    existingInvoiceJobId: existingJob?.id ?? null,
    reusedExistingJob: Boolean(existingJob),
    targetStatus: existingJob?.status ?? "waiting_for_activation",
    targetCreationState: existingJob?.creation_state ?? "not_attempted",
  };
}

export type LexwareInvoiceJobRepositoryDependencies = {
  loadEligibleLocalInvoice(invoiceId: string): Promise<EligibleLocalInvoice>;
  loadExistingInvoiceJob(prepared: EligibleLocalInvoice): Promise<PersistedLexwareInvoiceJob | null>;
  createOrReuseInvoiceJob(prepared: EligibleLocalInvoice): Promise<EnqueueInvoiceJobResult>;
  linkInvoiceToJob(prepared: EligibleLocalInvoice, result: EnqueueInvoiceJobResult): string;
};

const defaultDependencies: LexwareInvoiceJobRepositoryDependencies = {
  loadEligibleLocalInvoice,
  loadExistingInvoiceJob,
  createOrReuseInvoiceJob,
  linkInvoiceToJob,
};

export async function enqueueLexwareProductionInvoiceJob(
  invoiceId: string,
  dependencies: LexwareInvoiceJobRepositoryDependencies = defaultDependencies,
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
