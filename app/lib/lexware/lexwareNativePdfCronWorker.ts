import "server-only";

import { randomUUID } from "node:crypto";
import { supabaseServer } from "@/lib/supabase/server";
import { fetchAndStoreLexwareProductionPdf } from "./lexwareProductionPdfStorage";
import {
  runNativePdfCronWorker,
  isNativePdfCronCandidate,
  type ClaimedNativePdfCronCandidate,
  type NativePdfCronCandidate,
  type NativePdfCronWorkerResult,
} from "./lexwareNativePdfCronWorkerCore";

const CANDIDATE_SCAN_LIMIT = 25;
const LOCK_SECONDS = 300;
const DEFAULT_MAX_ATTEMPTS = 8;

type InvoiceBindingRow = {
  id: string;
  request_id: string;
  invoice_provider: string;
  lexware_invoice_job_id: string;
  lexware_invoice_id: string;
  lexware_finalized_at: string;
  lexware_pdf_fetched_at: string | null;
  lexware_pdf_sha256: string | null;
  lexware_pdf_size_bytes: number | null;
  lexware_pdf_content_type: string | null;
  lexware_pdf_filename: string | null;
  lexware_pdf_storage_bucket: string | null;
  lexware_pdf_storage_path: string | null;
  lexware_pdf_stored_at: string | null;
};

type InvoiceJobBindingRow = {
  id: string;
  request_id: string;
  local_invoice_id: string;
  trigger_source: string;
  status: string;
  creation_state: string;
  target_organization_id: string;
  lexware_invoice_id: string;
  payload_sha256: string;
  payload_hash_version: string;
};

const PDF_FIELDS = "lexware_pdf_fetched_at,lexware_pdf_sha256,lexware_pdf_size_bytes,lexware_pdf_content_type,lexware_pdf_filename,lexware_pdf_storage_bucket,lexware_pdf_storage_path,lexware_pdf_stored_at";
const pdfStored = (row: InvoiceBindingRow) => [
  row.lexware_pdf_fetched_at, row.lexware_pdf_sha256, row.lexware_pdf_size_bytes,
  row.lexware_pdf_content_type, row.lexware_pdf_filename, row.lexware_pdf_storage_bucket,
  row.lexware_pdf_storage_path, row.lexware_pdf_stored_at,
].some((value) => value !== null);

const toCandidate = (row: Record<string, unknown>, stored: boolean): NativePdfCronCandidate => ({
  ...(row as Omit<NativePdfCronCandidate, "pdf_stored">),
  pdf_stored: stored,
});

async function loadInvoice(invoiceId: string) {
  const { data, error } = await supabaseServer.from("school_request_invoices")
    .select(`id,request_id,invoice_provider,lexware_invoice_job_id,lexware_invoice_id,lexware_finalized_at,${PDF_FIELDS}`)
    .eq("id", invoiceId).single();
  if (error || !data) throw new Error("NATIVE_PDF_CRON_INVOICE_LOAD_FAILED");
  return data as InvoiceBindingRow;
}

async function loadExistingCandidates() {
  const { data, error } = await supabaseServer.from("school_lexware_invoice_pdf_delivery_jobs")
    .select("id,local_invoice_id,request_id,invoice_job_id,target_organization_id,external_invoice_id,payload_sha256,payload_hash_version,status,attempt_count,max_attempts,locked_at,lock_expires_at,locked_by,last_error_code,manual_review_reason")
    .in("status", ["pending", "retry", "processing"])
    .order("created_at", { ascending: true })
    .limit(CANDIDATE_SCAN_LIMIT);
  if (error) throw new Error("NATIVE_PDF_CRON_CANDIDATE_LOAD_FAILED");
  const candidates: NativePdfCronCandidate[] = [];
  for (const row of data ?? []) {
    const invoice = await loadInvoice(String(row.local_invoice_id));
    candidates.push(toCandidate(row as Record<string, unknown>, pdfStored(invoice)));
  }
  return candidates;
}

async function enqueueNextCandidate(): Promise<NativePdfCronCandidate | null> {
  const { data, error } = await supabaseServer.from("school_request_invoices")
    .select(`id,request_id,invoice_provider,lexware_invoice_job_id,lexware_invoice_id,lexware_finalized_at,${PDF_FIELDS}`)
    .eq("invoice_provider", "lexware")
    .not("lexware_finalized_at", "is", null)
    .is("lexware_pdf_fetched_at", null)
    .is("lexware_pdf_sha256", null)
    .is("lexware_pdf_size_bytes", null)
    .is("lexware_pdf_content_type", null)
    .is("lexware_pdf_filename", null)
    .is("lexware_pdf_storage_bucket", null)
    .is("lexware_pdf_storage_path", null)
    .is("lexware_pdf_stored_at", null)
    .order("created_at", { ascending: true })
    .limit(CANDIDATE_SCAN_LIMIT);
  if (error) throw new Error("NATIVE_PDF_CRON_INVOICE_LOAD_FAILED");
  for (const rawInvoice of data ?? []) {
    const invoice = rawInvoice as InvoiceBindingRow;
    const { data: jobData, error: jobError } = await supabaseServer.from("school_lexware_invoice_jobs")
      .select("id,request_id,local_invoice_id,trigger_source,status,creation_state,target_organization_id,lexware_invoice_id,payload_sha256,payload_hash_version")
      .eq("id", invoice.lexware_invoice_job_id).single();
    if (jobError || !jobData) continue;
    const job = jobData as InvoiceJobBindingRow;
    if (job.trigger_source !== "checkout_native_lexware" || job.status !== "succeeded"
        || job.creation_state !== "definitely_created" || invoice.request_id !== job.request_id
        || job.local_invoice_id !== invoice.id || invoice.lexware_invoice_job_id !== job.id
        || invoice.lexware_invoice_id !== job.lexware_invoice_id
        || job.payload_hash_version !== "lexware-payload-canonical-v2") continue;
    const { data: enqueued, error: enqueueError } = await supabaseServer.rpc(
      "enqueue_native_lexware_invoice_pdf_delivery_job",
      {
        p_invoice_id: invoice.id,
        p_request_id: invoice.request_id,
        p_invoice_job_id: job.id,
        p_expected_organization_id: job.target_organization_id,
        p_expected_external_invoice_id: job.lexware_invoice_id,
        p_expected_payload_sha256: job.payload_sha256,
        p_expected_payload_hash_version: job.payload_hash_version,
        p_max_attempts: DEFAULT_MAX_ATTEMPTS,
      },
    );
    if (enqueueError || !enqueued) throw new Error("NATIVE_PDF_CRON_ENQUEUE_FAILED");
    return toCandidate(enqueued as Record<string, unknown>, false);
  }
  return null;
}

const rpcCandidate = (data: unknown) => data as ClaimedNativePdfCronCandidate;

async function acquireLease(candidate: NativePdfCronCandidate, workerId: string) {
  const binding = {
    p_delivery_job_id: candidate.id,
    p_invoice_id: candidate.local_invoice_id,
    p_request_id: candidate.request_id,
    p_invoice_job_id: candidate.invoice_job_id,
    p_expected_organization_id: candidate.target_organization_id,
    p_expected_external_invoice_id: candidate.external_invoice_id,
    p_expected_payload_sha256: candidate.payload_sha256,
    p_expected_payload_hash_version: candidate.payload_hash_version,
  };
  const rpc = candidate.status === "processing"
    ? supabaseServer.rpc("reclaim_native_lexware_invoice_pdf_delivery_job", {
      ...binding,
      p_expected_attempt_count: candidate.attempt_count,
      p_expected_locked_by: candidate.locked_by,
      p_expected_locked_at: candidate.locked_at,
      p_expected_lock_expires_at: candidate.lock_expires_at,
      p_new_locked_by: workerId,
      p_lock_seconds: LOCK_SECONDS,
    })
    : supabaseServer.rpc("claim_native_lexware_invoice_pdf_delivery_job", {
      ...binding,
      p_locked_by: workerId,
      p_lock_seconds: LOCK_SECONDS,
    });
  const { data, error } = await rpc;
  if (error || !data) return null;
  return rpcCandidate(data);
}

const completionBinding = (candidate: ClaimedNativePdfCronCandidate) => ({
  p_delivery_job_id: candidate.id,
  p_invoice_id: candidate.local_invoice_id,
  p_request_id: candidate.request_id,
  p_invoice_job_id: candidate.invoice_job_id,
  p_attempt_count: candidate.attempt_count,
  p_locked_by: candidate.locked_by,
});

export async function processNextNativeLexwarePdf(): Promise<NativePdfCronWorkerResult> {
  const workerId = `native-pdf-cron:${randomUUID()}`;
  return runNativePdfCronWorker({
    now: Date.now,
    loadCandidates: async () => {
      const existing = await loadExistingCandidates();
      if (existing.some((candidate) => isNativePdfCronCandidate(candidate, Date.now()))) return existing;
      const enqueued = await enqueueNextCandidate();
      return enqueued ? [...existing, enqueued] : existing;
    },
    acquireLease: (candidate) => acquireLease(candidate, workerId),
    preparePdf: (invoiceId, lifecycle) => fetchAndStoreLexwareProductionPdf(invoiceId, lifecycle),
    completeLease: async (candidate) => {
      const { error } = await supabaseServer.rpc("complete_native_lexware_invoice_pdf_delivery_job", {
        ...completionBinding(candidate),
        p_expected_organization_id: candidate.target_organization_id,
        p_expected_external_invoice_id: candidate.external_invoice_id,
        p_expected_payload_sha256: candidate.payload_sha256,
        p_expected_payload_hash_version: candidate.payload_hash_version,
      });
      if (error) throw new Error("NATIVE_PDF_CRON_COMPLETE_FAILED");
    },
    recordFailure: async (candidate, errorCode, ambiguous) => {
      const { error } = await supabaseServer.rpc("record_native_lexware_invoice_pdf_delivery_failure", {
        ...completionBinding(candidate),
        p_error_code: errorCode,
        p_ambiguous: ambiguous,
      });
      if (error) throw new Error("NATIVE_PDF_CRON_FAILURE_PERSIST_FAILED");
    },
  });
}
