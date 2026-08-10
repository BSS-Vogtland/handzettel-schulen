import "server-only";

import { supabaseServer } from "@/lib/supabase/server";
import {
  isTemporaryMailOrchestrationPrecheckReady,
  type TemporaryMailOrchestrationPrecheck,
} from "./lexwareTemporaryMailOrchestrationTriggerCore";

const HASH_VERSION = "lexware-payload-canonical-v2";
const PDF_BUCKET = "lexware-invoice-pdfs";
const CANDIDATE_SCAN_LIMIT = 25;

type InvoiceRow = {
  id: string; request_id: string; lexware_invoice_job_id: string; lexware_invoice_id: string;
  lexware_invoice_number: string; lexware_organization_id: string; lexware_finalized_at: string;
  lexware_pdf_fetched_at: string | null; lexware_pdf_sha256: string | null;
  lexware_pdf_size_bytes: number | null; lexware_pdf_content_type: string | null;
  lexware_pdf_filename: string | null; lexware_pdf_storage_bucket: string | null;
  lexware_pdf_storage_path: string | null; lexware_pdf_stored_at: string | null;
};

type InvoiceJobRow = {
  id: string; request_id: string; local_invoice_id: string; trigger_source: string; status: string;
  creation_state: string; target_organization_id: string; lexware_invoice_id: string;
  lexware_invoice_number: string; payload_sha256: string; payload_hash_version: string;
};

const PDF_FIELDS = "lexware_pdf_fetched_at,lexware_pdf_sha256,lexware_pdf_size_bytes,lexware_pdf_content_type,lexware_pdf_filename,lexware_pdf_storage_bucket,lexware_pdf_storage_path,lexware_pdf_stored_at";

function isReady(invoice: InvoiceRow, job: InvoiceJobRow) {
  const expectedPath = `lexware-invoices/${job.target_organization_id}/${job.lexware_invoice_id}/${invoice.lexware_pdf_sha256}.pdf`;
  return Boolean(invoice.lexware_finalized_at)
    && invoice.lexware_invoice_job_id === job.id && invoice.request_id === job.request_id
    && job.local_invoice_id === invoice.id && job.trigger_source === "checkout_native_lexware"
    && job.status === "succeeded" && job.creation_state === "definitely_created"
    && invoice.lexware_invoice_id === job.lexware_invoice_id
    && invoice.lexware_invoice_number === job.lexware_invoice_number
    && invoice.lexware_organization_id === job.target_organization_id
    && job.payload_hash_version === HASH_VERSION && /^[a-f0-9]{64}$/.test(job.payload_sha256 ?? "")
    && Boolean(invoice.lexware_pdf_fetched_at) && /^[a-f0-9]{64}$/.test(invoice.lexware_pdf_sha256 ?? "")
    && Number(invoice.lexware_pdf_size_bytes) >= 100 && Number(invoice.lexware_pdf_size_bytes) <= 10_485_760
    && invoice.lexware_pdf_content_type === "application/pdf" && Boolean(invoice.lexware_pdf_filename)
    && invoice.lexware_pdf_storage_bucket === PDF_BUCKET && invoice.lexware_pdf_storage_path === expectedPath
    && Boolean(invoice.lexware_pdf_stored_at);
}

export async function countNativeLexwareMailJobs() {
  const { count, error } = await supabaseServer.from("school_lexware_invoice_mail_jobs")
    .select("id", { count: "exact", head: true });
  if (error || count === null) throw new Error("MAIL_ORCHESTRATION_PRECHECK_MAIL_COUNT_FAILED");
  return count;
}

export async function readTemporaryMailOrchestrationPrecheck(): Promise<TemporaryMailOrchestrationPrecheck> {
  const [{ data: settings, error: settingsError }, { count: mutableMailJobCount, error: mutableError }, totalMailJobCount]
    = await Promise.all([
      supabaseServer.from("business_runtime_settings").select("lexware_automatic_mail_enabled")
        .eq("id", "default").single(),
      supabaseServer.from("school_lexware_invoice_mail_jobs").select("id", { count: "exact", head: true })
        .in("status", ["waiting_for_activation", "pending"]),
      countNativeLexwareMailJobs(),
    ]);
  if (settingsError || !settings || mutableError || mutableMailJobCount === null) {
    throw new Error("MAIL_ORCHESTRATION_PRECHECK_STATE_FAILED");
  }

  const { data: invoiceRows, error: invoiceError } = await supabaseServer.from("school_request_invoices")
    .select(`id,request_id,lexware_invoice_job_id,lexware_invoice_id,lexware_invoice_number,lexware_organization_id,lexware_finalized_at,${PDF_FIELDS}`)
    .eq("invoice_provider", "lexware").not("lexware_finalized_at", "is", null)
    .order("created_at", { ascending: true }).limit(CANDIDATE_SCAN_LIMIT);
  if (invoiceError) throw new Error("MAIL_ORCHESTRATION_PRECHECK_INVOICE_FAILED");

  let readyNativeInvoiceCount = 0;
  for (const rawInvoice of invoiceRows ?? []) {
    const invoice = rawInvoice as InvoiceRow;
    const { data: rawJob, error: jobError } = await supabaseServer.from("school_lexware_invoice_jobs")
      .select("id,request_id,local_invoice_id,trigger_source,status,creation_state,target_organization_id,lexware_invoice_id,lexware_invoice_number,payload_sha256,payload_hash_version")
      .eq("id", invoice.lexware_invoice_job_id).maybeSingle();
    if (!jobError && rawJob && isReady(invoice, rawJob as InvoiceJobRow)) readyNativeInvoiceCount += 1;
  }

  return {
    automaticMailDisabled: settings.lexware_automatic_mail_enabled === false,
    readyNativeInvoiceCount,
    mutableMailJobCount,
    totalMailJobCount,
  };
}

export async function temporaryMailOrchestrationPrecheckReady() {
  return isTemporaryMailOrchestrationPrecheckReady(await readTemporaryMailOrchestrationPrecheck());
}
