import "server-only";

import {
  buildLexwareInvoicePayload,
  type LocalLexwareInvoiceItemSnapshot,
  type LocalLexwareInvoiceSnapshot,
} from "@/app/lib/lexware/lexwareInvoicePayloadBuilder";
import { validateLexwareInvoicePayload } from "@/app/lib/lexware/lexwareInvoicePayloadValidator";
import { buildLexwarePayloadSha256, parseLexwarePayloadHashVersion } from "@/app/lib/lexware/lexwarePayloadHash";
import { parseLexwareProductionClaim } from "@/app/lib/lexware/lexwareProductionClaimCore";
import {
  buildEligibleLocalInvoice as buildEligibleCore,
  buildLexwareInvoiceJobIdempotencyKey,
  enqueueLexwareProductionInvoiceJob as enqueueCore,
  LEXWARE_MANUAL_ENQUEUE_CONFIRMATION,
  LexwareProductionInvoiceJobRepositoryError,
  validateEnqueueInvoiceJobResult,
  type EligibleLocalInvoice,
  type EnqueueInvoiceJobResult,
  type LexwareInvoiceJobRepositoryDependencies,
  type PersistedLexwareInvoiceJob,
} from "@/app/lib/lexware/lexwareProductionEnqueueCore";

export {
  buildLexwareInvoiceJobIdempotencyKey,
  LEXWARE_MANUAL_ENQUEUE_CONFIRMATION,
  LexwareProductionInvoiceJobRepositoryError,
  validateEnqueueInvoiceJobResult,
};
export type {
  EligibleLocalInvoice,
  EnqueueInvoiceJobResult,
  LexwareInvoiceJobRepositoryDependencies,
  PersistedLexwareInvoiceJob,
};

const fail = (code: string, message: string): never => {
  throw new LexwareProductionInvoiceJobRepositoryError(code, message);
};

async function getSupabaseServer() {
  const { supabaseServer } = await import("@/lib/supabase/server");
  return supabaseServer;
}

const payloadDependencies = {
  buildPayload: ({ invoice, items, paymentTermDays }: {
    invoice: Record<string, unknown>;
    items: Array<Record<string, unknown>>;
    paymentTermDays: number;
  }) => buildLexwareInvoicePayload({
    invoice: invoice as LocalLexwareInvoiceSnapshot,
    items: items as LocalLexwareInvoiceItemSnapshot[],
    paymentTermDays,
  }),
  validatePayload: validateLexwareInvoicePayload,
  buildPayloadSha256: buildLexwarePayloadSha256,
  parsePayloadHashVersion: parseLexwarePayloadHashVersion,
};

export function buildEligibleLocalInvoice(input: {
  invoice: LocalLexwareInvoiceSnapshot & {
    invoice_status?: string | null;
    payment_status?: string | null;
    lexware_invoice_job_id?: string | null;
  };
  items: LocalLexwareInvoiceItemSnapshot[];
}): EligibleLocalInvoice {
  return buildEligibleCore(
    {
      invoice: input.invoice,
      items: input.items,
    },
    payloadDependencies,
  );
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
    invoice: invoice as unknown as LocalLexwareInvoiceSnapshot & {
      invoice_status?: string | null;
      payment_status?: string | null;
      lexware_invoice_job_id?: string | null;
    },
    items: (items ?? []) as unknown as LocalLexwareInvoiceItemSnapshot[],
  });
}

async function loadJobBy(column: string, value: string | null | undefined) {
  if (!value) return null;
  const supabaseServer = await getSupabaseServer();
  const { data, error } = await supabaseServer.from("school_lexware_invoice_jobs")
    .select("id,request_id,local_invoice_id,idempotency_key,status,creation_state,payload_sha256,payload_hash_version")
    .eq(column, value).maybeSingle();
  if (error) fail("INVOICE_JOB_LOAD_FAILED", "Lexware-Rechnungsjob konnte nicht geladen werden.");
  return data as PersistedLexwareInvoiceJob | null;
}

export async function loadExistingInvoiceJob(prepared: EligibleLocalInvoice) {
  const candidates = await Promise.all([
    loadJobBy("id", String(prepared.invoice.lexware_invoice_job_id ?? "") || null),
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
  if (job.payload_hash_version !== prepared.payloadHashVersion) fail("HASH_VERSION_CONFLICT", "Der vorhandene Job besitzt eine abweichende Payload-Hashversion.");
  if (job.payload_sha256 !== prepared.payloadSha256) fail("PAYLOAD_HASH_CONFLICT", "Der vorhandene Job besitzt einen abweichenden Payload-Hash.");
  return job;
}

export async function createOrReuseInvoiceJob(prepared: EligibleLocalInvoice): Promise<EnqueueInvoiceJobResult> {
  const supabaseServer = await getSupabaseServer();
  const { data, error } = await supabaseServer.rpc("enqueue_existing_v2_lexware_invoice_job", {
    p_local_invoice_id: prepared.invoice.id,
    p_idempotency_key: prepared.idempotencyKey,
    p_payload_snapshot: prepared.built,
    p_payload_sha256: prepared.payloadSha256,
    p_payload_hash_version: prepared.payloadHashVersion,
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

const defaultDependencies: LexwareInvoiceJobRepositoryDependencies = {
  loadEligibleLocalInvoice,
  loadExistingInvoiceJob,
  createOrReuseInvoiceJob,
  linkInvoiceToJob,
};

export function enqueueLexwareProductionInvoiceJob(
  invoiceId: string,
  dependencies: LexwareInvoiceJobRepositoryDependencies = defaultDependencies,
) {
  return enqueueCore(invoiceId, dependencies);
}

export async function claimInvoiceJobForProcessing(input: {
  localInvoiceId: string;
  expectedPayloadSha256: string;
  expectedPayloadHashVersion: EligibleLocalInvoice["payloadHashVersion"];
  expectedTargetOrganizationId: string;
  lockedBy: string;
  lockDurationSeconds: number;
}) {
  const supabaseServer = await getSupabaseServer();
  const { data, error } = await supabaseServer.rpc("claim_native_lexware_invoice_job_for_processing", {
    p_local_invoice_id: input.localInvoiceId,
    p_expected_payload_sha256: input.expectedPayloadSha256,
    p_expected_payload_hash_version: input.expectedPayloadHashVersion,
    p_expected_target_organization_id: input.expectedTargetOrganizationId,
    p_locked_by: input.lockedBy,
    p_lock_duration_seconds: input.lockDurationSeconds,
  });
  if (error) fail("INVOICE_JOB_CLAIM_FAILED", error.message || "Lexware-Rechnungsjob konnte nicht beansprucht werden.");
  const row = Array.isArray(data) ? data[0] : data;
  try { return parseLexwareProductionClaim(row); }
  catch { return fail("INVOICE_JOB_CLAIM_RESULT_INVALID", "Die Claim-RPC lieferte kein gültiges Ergebnis."); }
}
