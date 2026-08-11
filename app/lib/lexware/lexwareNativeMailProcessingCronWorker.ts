import "server-only";

import { supabaseServer } from "@/lib/supabase/server";
import { processLexwareProductionMailJobAutomatically } from "./lexwareProductionMailProcessor";
import {
  runNativeMailProcessingCronWorker,
  type NativeMailProcessingCronCandidate,
  type NativeMailProcessingCronResult,
} from "./lexwareNativeMailProcessingCronWorkerCore";

const CANDIDATE_SCAN_LIMIT = 25;
const HASH_VERSION = "lexware-payload-canonical-v2";
const PDF_BUCKET = "lexware-invoice-pdfs";

type MailRow = {
  local_invoice_id: string; request_id: string; invoice_job_id: string; idempotency_key: string;
  status: string; delivery_state: string; attempt_count: number; max_attempts: number;
  locked_at: string | null; lock_expires_at: string | null; locked_by: string | null;
  transport_message_id: string | null; smtp_attempt_started_at: string | null;
  smtp_attempt_completed_at: string | null; sent_at: string | null; manual_review_reason: string | null;
  recipient_email_snapshot: string; from_email_snapshot: string; subject_snapshot: string;
  text_body_snapshot: string; html_body_snapshot: string; attachment_filename_snapshot: string;
  lexware_organization_id_snapshot: string; lexware_invoice_id_snapshot: string;
  lexware_invoice_number_snapshot: string; lexware_pdf_storage_bucket: string;
  lexware_pdf_storage_path: string; lexware_pdf_stored_at: string; pdf_fetched_at: string;
  pdf_sha256: string; pdf_size_bytes: number; pdf_content_type: string; mail_payload_sha256: string;
};

type InvoiceRow = {
  id: string; request_id: string; invoice_provider: string; lexware_invoice_job_id: string;
  lexware_invoice_id: string; lexware_invoice_number: string; lexware_organization_id: string;
  lexware_finalized_at: string; lexware_pdf_fetched_at: string; lexware_pdf_sha256: string;
  lexware_pdf_size_bytes: number; lexware_pdf_content_type: string; lexware_pdf_filename: string;
  lexware_pdf_storage_bucket: string; lexware_pdf_storage_path: string; lexware_pdf_stored_at: string;
};

type InvoiceJobRow = {
  id: string; request_id: string; local_invoice_id: string; trigger_source: string; status: string;
  creation_state: string; target_organization_id: string; lexware_invoice_id: string;
  lexware_invoice_number: string; payload_sha256: string; payload_hash_version: string;
};

const nonBlank = (value: unknown) => typeof value === "string" && value.trim().length > 0;

const bindingValid = (mail: MailRow, invoice: InvoiceRow, job: InvoiceJobRow) => {
  const expectedPath = `lexware-invoices/${job.target_organization_id}/${job.lexware_invoice_id}/${invoice.lexware_pdf_sha256}.pdf`;
  return invoice.invoice_provider === "lexware" && nonBlank(invoice.lexware_finalized_at)
    && job.trigger_source === "checkout_native_lexware" && job.status === "succeeded"
    && job.creation_state === "definitely_created" && job.payload_hash_version === HASH_VERSION
    && /^[a-f0-9]{64}$/.test(job.payload_sha256 ?? "")
    && invoice.lexware_invoice_job_id === job.id && invoice.request_id === job.request_id
    && job.local_invoice_id === invoice.id && invoice.lexware_invoice_id === job.lexware_invoice_id
    && invoice.lexware_invoice_number === job.lexware_invoice_number
    && invoice.lexware_organization_id === job.target_organization_id
    && invoice.lexware_pdf_storage_bucket === PDF_BUCKET && invoice.lexware_pdf_storage_path === expectedPath
    && invoice.lexware_pdf_content_type === "application/pdf" && Number(invoice.lexware_pdf_size_bytes) >= 100
    && /^[a-f0-9]{64}$/.test(invoice.lexware_pdf_sha256 ?? "")
    && nonBlank(invoice.lexware_pdf_filename) && nonBlank(invoice.lexware_pdf_fetched_at)
    && nonBlank(invoice.lexware_pdf_stored_at)
    && mail.request_id === invoice.request_id && mail.local_invoice_id === invoice.id
    && mail.invoice_job_id === job.id && mail.idempotency_key === `lexware-invoice-mail-v1:${job.id}`
    && mail.lexware_organization_id_snapshot === job.target_organization_id
    && mail.lexware_invoice_id_snapshot === job.lexware_invoice_id
    && mail.lexware_invoice_number_snapshot === job.lexware_invoice_number
    && mail.attachment_filename_snapshot === invoice.lexware_pdf_filename
    && mail.lexware_pdf_storage_bucket === invoice.lexware_pdf_storage_bucket
    && mail.lexware_pdf_storage_path === invoice.lexware_pdf_storage_path
    && mail.lexware_pdf_stored_at === invoice.lexware_pdf_stored_at
    && mail.pdf_fetched_at === invoice.lexware_pdf_fetched_at && mail.pdf_sha256 === invoice.lexware_pdf_sha256
    && Number(mail.pdf_size_bytes) === Number(invoice.lexware_pdf_size_bytes)
    && mail.pdf_content_type === invoice.lexware_pdf_content_type
    && nonBlank(mail.recipient_email_snapshot) && nonBlank(mail.from_email_snapshot)
    && nonBlank(mail.subject_snapshot) && nonBlank(mail.text_body_snapshot) && nonBlank(mail.html_body_snapshot)
    && /^[a-f0-9]{64}$/.test(mail.mail_payload_sha256 ?? "");
};

async function automaticMailEnabled() {
  const { data, error } = await supabaseServer.from("business_runtime_settings")
    .select("lexware_automatic_mail_enabled").eq("id", "default").single();
  if (error || !data) throw new Error("NATIVE_MAIL_PROCESS_CRON_SETTINGS_FAILED");
  return data.lexware_automatic_mail_enabled === true;
}

async function loadCandidates(): Promise<NativeMailProcessingCronCandidate[]> {
  const { data, error } = await supabaseServer.from("school_lexware_invoice_mail_jobs")
    .select("*").in("status", ["pending", "retry"]).order("created_at", { ascending: true })
    .limit(CANDIDATE_SCAN_LIMIT);
  if (error) throw new Error("NATIVE_MAIL_PROCESS_CRON_CANDIDATE_LOAD_FAILED");
  const candidates: NativeMailProcessingCronCandidate[] = [];
  for (const rawMail of data ?? []) {
    const mail = rawMail as MailRow;
    const [{ data: rawInvoice, error: invoiceError }, { data: rawJob, error: jobError }] = await Promise.all([
      supabaseServer.from("school_request_invoices").select("*").eq("id", mail.local_invoice_id).maybeSingle(),
      supabaseServer.from("school_lexware_invoice_jobs").select("*").eq("id", mail.invoice_job_id).maybeSingle(),
    ]);
    const valid = !invoiceError && !jobError && Boolean(rawInvoice) && Boolean(rawJob)
      && bindingValid(mail, rawInvoice as InvoiceRow, rawJob as InvoiceJobRow);
    candidates.push({
      localInvoiceId: mail.local_invoice_id, status: mail.status, deliveryState: mail.delivery_state,
      attemptCount: mail.attempt_count, maxAttempts: mail.max_attempts,
      lockedAt: mail.locked_at, lockExpiresAt: mail.lock_expires_at, lockedBy: mail.locked_by,
      transportMessageId: mail.transport_message_id, smtpAttemptStartedAt: mail.smtp_attempt_started_at,
      smtpAttemptCompletedAt: mail.smtp_attempt_completed_at, sentAt: mail.sent_at,
      manualReviewReason: mail.manual_review_reason, bindingValid: valid,
    });
  }
  return candidates;
}

export function processNextNativeLexwareMail(): Promise<NativeMailProcessingCronResult> {
  return runNativeMailProcessingCronWorker({
    automaticMailEnabled,
    loadCandidates,
    processMail: processLexwareProductionMailJobAutomatically,
  });
}
