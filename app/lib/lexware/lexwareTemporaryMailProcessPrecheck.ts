import "server-only";

import { supabaseServer } from "@/lib/supabase/server";
import { readLexwareMailTransportConfiguration } from "./lexwareAtMostOnceMailTransport";
import {
  isNativeMailProcessingCronCandidate,
  type NativeMailProcessingCronCandidate,
} from "./lexwareNativeMailProcessingCronWorkerCore";
import { loadStoredNativeLexwarePdf } from "./lexwareProductionPdfStorage";
import {
  TEMPORARY_MAIL_PROCESS_TARGET_INVOICE_ID,
  type TemporaryMailProcessPostcheck,
  type TemporaryMailProcessPrecheck,
} from "./lexwareTemporaryMailProcessTriggerCore";

const CANDIDATE_SCAN_LIMIT = 25;
const HASH_VERSION = "lexware-payload-canonical-v2";
const PDF_BUCKET = "lexware-invoice-pdfs";

type MailRow = Record<string, unknown> & {
  local_invoice_id: string; request_id: string; invoice_job_id: string; idempotency_key: string;
  status: string; delivery_state: string; attempt_count: number; max_attempts: number;
  locked_at: string | null; lock_expires_at: string | null; locked_by: string | null;
  transport_message_id: string | null; smtp_attempt_started_at: string | null;
  smtp_attempt_completed_at: string | null; sent_at: string | null; manual_review_reason: string | null;
  last_attempt_at: string | null; last_error_code: string | null;
  recipient_email_snapshot: string; from_email_snapshot: string; subject_snapshot: string;
  text_body_snapshot: string; html_body_snapshot: string; attachment_filename_snapshot: string;
  lexware_organization_id_snapshot: string; lexware_invoice_id_snapshot: string;
  lexware_invoice_number_snapshot: string; lexware_pdf_storage_bucket: string;
  lexware_pdf_storage_path: string; lexware_pdf_stored_at: string; pdf_fetched_at: string;
  pdf_sha256: string; pdf_size_bytes: number; pdf_content_type: string; mail_payload_sha256: string;
};

type InvoiceRow = Record<string, unknown> & {
  id: string; request_id: string; invoice_provider: string; lexware_invoice_job_id: string;
  lexware_invoice_id: string; lexware_invoice_number: string; lexware_organization_id: string;
  lexware_finalized_at: string; lexware_pdf_fetched_at: string; lexware_pdf_sha256: string;
  lexware_pdf_size_bytes: number; lexware_pdf_content_type: string; lexware_pdf_filename: string;
  lexware_pdf_storage_bucket: string; lexware_pdf_storage_path: string; lexware_pdf_stored_at: string;
  invoice_mail_status: string; invoice_mail_attempt_count: number; invoice_mail_last_attempt_at: string | null;
  invoice_mail_sent_at: string | null; invoice_mail_message_id: string | null;
};

type InvoiceJobRow = Record<string, unknown> & {
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

const toCandidate = (mail: MailRow, valid: boolean): NativeMailProcessingCronCandidate => ({
  localInvoiceId: mail.local_invoice_id, status: mail.status, deliveryState: mail.delivery_state,
  attemptCount: mail.attempt_count, maxAttempts: mail.max_attempts,
  lockedAt: mail.locked_at, lockExpiresAt: mail.lock_expires_at, lockedBy: mail.locked_by,
  transportMessageId: mail.transport_message_id, smtpAttemptStartedAt: mail.smtp_attempt_started_at,
  smtpAttemptCompletedAt: mail.smtp_attempt_completed_at, sentAt: mail.sent_at,
  manualReviewReason: mail.manual_review_reason, bindingValid: valid,
});

async function loadBoundCandidate(mail: MailRow) {
  const [{ data: invoice, error: invoiceError }, { data: job, error: jobError }] = await Promise.all([
    supabaseServer.from("school_request_invoices").select("*").eq("id", mail.local_invoice_id).maybeSingle(),
    supabaseServer.from("school_lexware_invoice_jobs").select("*").eq("id", mail.invoice_job_id).maybeSingle(),
  ]);
  const valid = !invoiceError && !jobError && Boolean(invoice) && Boolean(job)
    && bindingValid(mail, invoice as InvoiceRow, job as InvoiceJobRow);
  return { candidate: toCandidate(mail, valid), invoice: invoice as InvoiceRow | null };
}

export async function readTemporaryMailProcessPrecheck(): Promise<TemporaryMailProcessPrecheck> {
  const [{ data: settings, error: settingsError }, { data: targetRows, error: targetError },
    { data: candidateRows, error: candidateError }] = await Promise.all([
    supabaseServer.from("business_runtime_settings").select("lexware_automatic_mail_enabled")
      .eq("id", "default").single(),
    supabaseServer.from("school_lexware_invoice_mail_jobs").select("*")
      .eq("local_invoice_id", TEMPORARY_MAIL_PROCESS_TARGET_INVOICE_ID).limit(2),
    supabaseServer.from("school_lexware_invoice_mail_jobs").select("*")
      .in("status", ["pending", "retry"]).order("created_at", { ascending: true })
      .limit(CANDIDATE_SCAN_LIMIT),
  ]);
  if (settingsError || !settings || targetError || candidateError) {
    throw new Error("MAIL_PROCESS_PRECHECK_STATE_FAILED");
  }
  const targetMails = (targetRows ?? []) as MailRow[];
  const candidates: NativeMailProcessingCronCandidate[] = [];
  for (const row of (candidateRows ?? []) as MailRow[]) {
    candidates.push((await loadBoundCandidate(row)).candidate);
  }
  const selected = candidates.find(isNativeMailProcessingCronCandidate) ?? null;
  const targetCandidate = candidates.find((candidate) =>
    candidate.localInvoiceId === TEMPORARY_MAIL_PROCESS_TARGET_INVOICE_ID) ?? null;
  let privatePdfReady = false;
  let smtpConfigurationReady = false;
  if (targetMails.length === 1 && targetCandidate && isNativeMailProcessingCronCandidate(targetCandidate)) {
    try {
      await loadStoredNativeLexwarePdf(TEMPORARY_MAIL_PROCESS_TARGET_INVOICE_ID);
      privatePdfReady = true;
    } catch {
      privatePdfReady = false;
    }
    try {
      readLexwareMailTransportConfiguration();
      smtpConfigurationReady = true;
    } catch {
      smtpConfigurationReady = false;
    }
  }
  return {
    automaticMailEnabled: settings.lexware_automatic_mail_enabled === true,
    targetMailJobCount: targetMails.length,
    targetCandidateReady: Boolean(targetCandidate && isNativeMailProcessingCronCandidate(targetCandidate)),
    selectedInvoiceId: selected?.localInvoiceId ?? null,
    privatePdfReady,
    smtpConfigurationReady,
  };
}

export async function readTemporaryMailProcessPostcheck(): Promise<TemporaryMailProcessPostcheck> {
  const [{ data: mailRows, error: mailError }, { data: invoice, error: invoiceError }] = await Promise.all([
    supabaseServer.from("school_lexware_invoice_mail_jobs").select("*")
      .eq("local_invoice_id", TEMPORARY_MAIL_PROCESS_TARGET_INVOICE_ID).limit(2),
    supabaseServer.from("school_request_invoices").select("*")
      .eq("id", TEMPORARY_MAIL_PROCESS_TARGET_INVOICE_ID).single(),
  ]);
  if (mailError || invoiceError || !invoice) throw new Error("MAIL_PROCESS_POSTCHECK_FAILED");
  const mails = (mailRows ?? []) as MailRow[];
  const mail = mails.length === 1 ? mails[0] : null;
  const invoiceRow = invoice as InvoiceRow;
  const successConfirmed = Boolean(mail && mail.status === "sent" && mail.delivery_state === "definitely_sent"
    && mail.attempt_count === 1 && mail.locked_at === null && mail.lock_expires_at === null && mail.locked_by === null
    && nonBlank(mail.transport_message_id) && nonBlank(mail.smtp_attempt_started_at)
    && nonBlank(mail.smtp_attempt_completed_at) && nonBlank(mail.sent_at) && mail.manual_review_reason === null
    && mail.last_error_code === null
    && invoiceRow.invoice_mail_status === "sent" && invoiceRow.invoice_mail_attempt_count === mail.attempt_count
    && invoiceRow.invoice_mail_last_attempt_at === mail.last_attempt_at
    && invoiceRow.invoice_mail_sent_at === mail.sent_at
    && invoiceRow.invoice_mail_message_id === mail.transport_message_id);
  const ambiguousConfirmed = Boolean(mail && mail.status === "manual_review" && mail.delivery_state === "ambiguous_send"
    && mail.attempt_count === 1 && mail.locked_at === null && mail.lock_expires_at === null && mail.locked_by === null
    && nonBlank(mail.transport_message_id) && nonBlank(mail.smtp_attempt_started_at)
    && mail.smtp_attempt_completed_at === null && mail.sent_at === null && nonBlank(mail.manual_review_reason)
    && nonBlank(mail.last_error_code));
  return { targetMailJobCount: mails.length, successConfirmed, ambiguousConfirmed };
}
