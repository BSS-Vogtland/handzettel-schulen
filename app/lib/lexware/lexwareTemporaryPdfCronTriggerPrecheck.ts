import "server-only";

import { supabaseServer } from "@/lib/supabase/server";
import { isNativePdfCronCandidate, type NativePdfCronCandidate } from "./lexwareNativePdfCronWorkerCore";
import {
  isTemporaryPdfCronTargetReady,
  TEMPORARY_PDF_CRON_TARGET_INVOICE_ID,
  type TemporaryPdfCronPrecheck,
} from "./lexwareTemporaryPdfCronTriggerCore";

const CANDIDATE_SCAN_LIMIT = 25;
const PDF_FIELDS = "lexware_pdf_fetched_at,lexware_pdf_sha256,lexware_pdf_size_bytes,lexware_pdf_content_type,lexware_pdf_filename,lexware_pdf_storage_bucket,lexware_pdf_storage_path,lexware_pdf_stored_at";

type InvoiceRow = {
  id: string;
  request_id: string;
  invoice_provider: string;
  lexware_invoice_job_id: string;
  lexware_invoice_id: string;
  lexware_finalized_at: string | null;
  lexware_pdf_fetched_at: string | null;
  lexware_pdf_sha256: string | null;
  lexware_pdf_size_bytes: number | null;
  lexware_pdf_content_type: string | null;
  lexware_pdf_filename: string | null;
  lexware_pdf_storage_bucket: string | null;
  lexware_pdf_storage_path: string | null;
  lexware_pdf_stored_at: string | null;
};

type JobRow = {
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
  last_error_code: string | null;
  last_error_message: string | null;
};

const pdfValues = (invoice: InvoiceRow) => [
  invoice.lexware_pdf_fetched_at, invoice.lexware_pdf_sha256, invoice.lexware_pdf_size_bytes,
  invoice.lexware_pdf_content_type, invoice.lexware_pdf_filename, invoice.lexware_pdf_storage_bucket,
  invoice.lexware_pdf_storage_path, invoice.lexware_pdf_stored_at,
];

async function loadInvoice(invoiceId: string) {
  const { data, error } = await supabaseServer.from("school_request_invoices")
    .select(`id,request_id,invoice_provider,lexware_invoice_job_id,lexware_invoice_id,lexware_finalized_at,${PDF_FIELDS}`)
    .eq("id", invoiceId).single();
  if (error || !data) throw new Error("TEMPORARY_PDF_CRON_INVOICE_LOAD_FAILED");
  return data as InvoiceRow;
}

async function loadJob(jobId: string) {
  const { data, error } = await supabaseServer.from("school_lexware_invoice_jobs")
    .select("id,request_id,local_invoice_id,trigger_source,status,creation_state,target_organization_id,lexware_invoice_id,payload_sha256,payload_hash_version,last_error_code,last_error_message")
    .eq("id", jobId).single();
  if (error || !data) throw new Error("TEMPORARY_PDF_CRON_JOB_LOAD_FAILED");
  return data as JobRow;
}

const jobMatchesInvoice = (job: JobRow, invoice: InvoiceRow) => job.id === invoice.lexware_invoice_job_id
  && job.request_id === invoice.request_id && job.local_invoice_id === invoice.id
  && job.trigger_source === "checkout_native_lexware" && job.status === "succeeded"
  && job.creation_state === "definitely_created" && job.lexware_invoice_id === invoice.lexware_invoice_id
  && job.payload_hash_version === "lexware-payload-canonical-v2"
  && /^[a-f0-9]{64}$/.test(job.payload_sha256 ?? "") && Boolean(job.target_organization_id);

async function firstEligibleExistingLeaseInvoiceId() {
  const { data, error } = await supabaseServer.from("school_lexware_invoice_pdf_delivery_jobs")
    .select("id,local_invoice_id,request_id,invoice_job_id,target_organization_id,external_invoice_id,payload_sha256,payload_hash_version,status,attempt_count,max_attempts,locked_at,lock_expires_at,locked_by,last_error_code,manual_review_reason")
    .in("status", ["pending", "retry", "processing"])
    .order("created_at", { ascending: true })
    .limit(CANDIDATE_SCAN_LIMIT);
  if (error) throw new Error("TEMPORARY_PDF_CRON_LEASE_LOAD_FAILED");
  for (const row of data ?? []) {
    const invoice = await loadInvoice(String(row.local_invoice_id));
    const candidate = {
      ...row,
      pdf_stored: pdfValues(invoice).some((value) => value !== null),
    } as NativePdfCronCandidate;
    if (isNativePdfCronCandidate(candidate, Date.now())) return candidate.local_invoice_id;
  }
  return null;
}

async function firstDiscoverableInvoiceId() {
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
  if (error) throw new Error("TEMPORARY_PDF_CRON_DISCOVERY_FAILED");
  for (const raw of data ?? []) {
    const invoice = raw as InvoiceRow;
    const job = await loadJob(invoice.lexware_invoice_job_id);
    if (jobMatchesInvoice(job, invoice)) return invoice.id;
  }
  return null;
}

export async function readTemporaryPdfCronPrecheck(): Promise<TemporaryPdfCronPrecheck & { ready: boolean }> {
  const target = await loadInvoice(TEMPORARY_PDF_CRON_TARGET_INVOICE_ID);
  const targetJob = await loadJob(target.lexware_invoice_job_id);
  const { data: targetLeases, error: leaseError } = await supabaseServer
    .from("school_lexware_invoice_pdf_delivery_jobs").select("id")
    .eq("local_invoice_id", TEMPORARY_PDF_CRON_TARGET_INVOICE_ID);
  if (leaseError) throw new Error("TEMPORARY_PDF_CRON_TARGET_LEASE_LOAD_FAILED");
  const storagePrefix = `lexware-invoices/${targetJob.target_organization_id}/${target.lexware_invoice_id}`;
  const { data: storageObjects, error: storageError } = await supabaseServer.storage
    .from("lexware-invoice-pdfs").list(storagePrefix, { limit: 2 });
  if (storageError) throw new Error("TEMPORARY_PDF_CRON_STORAGE_LOAD_FAILED");

  const eligibleExistingLeaseInvoiceId = await firstEligibleExistingLeaseInvoiceId();
  const selectedInvoiceId = eligibleExistingLeaseInvoiceId ?? await firstDiscoverableInvoiceId();
  const precheck: TemporaryPdfCronPrecheck = {
    selectedInvoiceId,
    eligibleExistingLeaseInvoiceId,
    targetInvoiceFinalized: target.invoice_provider === "lexware" && Boolean(target.lexware_finalized_at)
      && Boolean(target.lexware_invoice_id),
    targetJobSucceeded: jobMatchesInvoice(targetJob, target),
    targetPdfMetadataEmpty: pdfValues(target).every((value) => value === null),
    targetStorageObjectCount: (storageObjects ?? []).length,
    targetLeaseCount: (targetLeases ?? []).length,
    targetErrorReviewMarkersAbsent: targetJob.status !== "manual_review"
      && targetJob.last_error_code === null && targetJob.last_error_message === null,
  };
  return { ...precheck, ready: isTemporaryPdfCronTargetReady(precheck) };
}
