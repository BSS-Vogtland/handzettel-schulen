import "server-only";

import { supabaseServer } from "@/lib/supabase/server";
import { buildNativeLexwareInvoiceMailTemplate } from "./lexwareInvoiceMailTemplate";
import { classifyNativeMailOrchestrationCandidate, type NativeMailOrchestrationCandidate } from "./lexwareNativeMailOrchestrationCore";
import { resolveLexwareMailSenderAddress } from "./lexwareProductionDeliveryCore";
import {
  TEMPORARY_MAIL_ORCHESTRATION_TARGET_INVOICE_ID,
  type TemporaryMailOrchestrationPostcheck,
  type TemporaryMailOrchestrationPrecheck,
} from "./lexwareTemporaryMailOrchestrationTriggerCore";

const HASH_VERSION = "lexware-payload-canonical-v2";
const PDF_BUCKET = "lexware-invoice-pdfs";
const CANDIDATE_SCAN_LIMIT = 25;
const PDF_FIELDS = "lexware_pdf_fetched_at,lexware_pdf_sha256,lexware_pdf_size_bytes,lexware_pdf_content_type,lexware_pdf_filename,lexware_pdf_storage_bucket,lexware_pdf_storage_path,lexware_pdf_stored_at";

type InvoiceRow = Record<string, unknown> & {
  id: string; request_id: string; invoice_provider: string; lexware_invoice_job_id: string;
  lexware_invoice_id: string; lexware_invoice_number: string; lexware_organization_id: string;
  lexware_finalized_at: string; billing_name_snapshot: string; billing_email_snapshot: string;
  total_amount: number; currency: string; selected_payment_method: string | null;
  lexware_pdf_fetched_at: string | null; lexware_pdf_sha256: string | null;
  lexware_pdf_size_bytes: number | null; lexware_pdf_content_type: string | null;
  lexware_pdf_filename: string | null; lexware_pdf_storage_bucket: string | null;
  lexware_pdf_storage_path: string | null; lexware_pdf_stored_at: string | null;
};
type InvoiceJobRow = Record<string, unknown> & {
  id: string; request_id: string; local_invoice_id: string; trigger_source: string; status: string;
  creation_state: string; target_organization_id: string; lexware_invoice_id: string;
  lexware_invoice_number: string; payload_sha256: string; payload_hash_version: string;
};
type MailJobRow = Record<string, unknown> & {
  id: string; request_id: string; local_invoice_id: string; invoice_job_id: string; idempotency_key: string;
  status: string; delivery_state: string; attempt_count: number; locked_at: string | null;
  lock_expires_at: string | null; locked_by: string | null; transport_message_id: string | null;
  smtp_attempt_started_at: string | null; smtp_attempt_completed_at: string | null; sent_at: string | null;
  last_error_code: string | null; manual_review_reason: string | null;
  lexware_organization_id_snapshot: string; lexware_invoice_id_snapshot: string;
  lexware_invoice_number_snapshot: string; attachment_filename_snapshot: string;
  lexware_pdf_storage_bucket: string | null; lexware_pdf_storage_path: string | null;
  lexware_pdf_stored_at: string | null; pdf_fetched_at: string | null; pdf_sha256: string | null;
  pdf_size_bytes: number | null; pdf_content_type: string | null;
};

const invoiceJobBindingValid = (invoice: InvoiceRow, job: InvoiceJobRow) => invoice.invoice_provider === "lexware"
  && Boolean(invoice.lexware_finalized_at) && job.trigger_source === "checkout_native_lexware"
  && job.status === "succeeded" && job.creation_state === "definitely_created"
  && invoice.lexware_invoice_job_id === job.id && invoice.request_id === job.request_id
  && job.local_invoice_id === invoice.id && invoice.lexware_invoice_id === job.lexware_invoice_id
  && invoice.lexware_invoice_number === job.lexware_invoice_number
  && invoice.lexware_organization_id === job.target_organization_id
  && job.payload_hash_version === HASH_VERSION && /^[a-f0-9]{64}$/.test(job.payload_sha256 ?? "");

const pdfState = (invoice: InvoiceRow, job: InvoiceJobRow): NativeMailOrchestrationCandidate["readiness"] => {
  const values = [invoice.lexware_pdf_fetched_at, invoice.lexware_pdf_sha256, invoice.lexware_pdf_size_bytes,
    invoice.lexware_pdf_content_type, invoice.lexware_pdf_filename, invoice.lexware_pdf_storage_bucket,
    invoice.lexware_pdf_storage_path, invoice.lexware_pdf_stored_at];
  if (values.every((value) => value === null)) return "missing_pdf";
  const expectedPath = `lexware-invoices/${job.target_organization_id}/${job.lexware_invoice_id}/${invoice.lexware_pdf_sha256}.pdf`;
  return values.every((value) => value !== null)
    && /^[a-f0-9]{64}$/.test(invoice.lexware_pdf_sha256 ?? "")
    && Number(invoice.lexware_pdf_size_bytes) >= 100 && Number(invoice.lexware_pdf_size_bytes) <= 10_485_760
    && invoice.lexware_pdf_content_type === "application/pdf" && invoice.lexware_pdf_storage_bucket === PDF_BUCKET
    && invoice.lexware_pdf_storage_path === expectedPath ? "ready" : "invalid_binding";
};

const mailBindingValid = (mail: MailJobRow, invoice: InvoiceRow, job: InvoiceJobRow) =>
  mail.request_id === invoice.request_id && mail.local_invoice_id === invoice.id && mail.invoice_job_id === job.id
  && mail.idempotency_key === `lexware-invoice-mail-v1:${job.id}`
  && mail.lexware_organization_id_snapshot === job.target_organization_id
  && mail.lexware_invoice_id_snapshot === job.lexware_invoice_id
  && mail.lexware_invoice_number_snapshot === job.lexware_invoice_number
  && mail.attachment_filename_snapshot === invoice.lexware_pdf_filename
  && mail.lexware_pdf_storage_bucket === invoice.lexware_pdf_storage_bucket
  && mail.lexware_pdf_storage_path === invoice.lexware_pdf_storage_path
  && mail.lexware_pdf_stored_at === invoice.lexware_pdf_stored_at
  && mail.pdf_fetched_at === invoice.lexware_pdf_fetched_at && mail.pdf_sha256 === invoice.lexware_pdf_sha256
  && Number(mail.pdf_size_bytes) === Number(invoice.lexware_pdf_size_bytes)
  && mail.pdf_content_type === invoice.lexware_pdf_content_type;

const pristine = (mail: MailJobRow) => mail.attempt_count === 0 && mail.locked_at === null
  && mail.lock_expires_at === null && mail.locked_by === null && mail.transport_message_id === null
  && mail.smtp_attempt_started_at === null && mail.smtp_attempt_completed_at === null && mail.sent_at === null
  && mail.last_error_code === null && mail.manual_review_reason === null;

export async function countNativeLexwareMailJobs() {
  const { count, error } = await supabaseServer.from("school_lexware_invoice_mail_jobs")
    .select("id", { count: "exact", head: true });
  if (error || count === null) throw new Error("MAIL_ORCHESTRATION_PRECHECK_MAIL_COUNT_FAILED");
  return count;
}

export async function readTemporaryMailOrchestrationPrecheck(): Promise<TemporaryMailOrchestrationPrecheck> {
  const [{ data: settings, error: settingsError }, { count: openMailJobCount, error: openError }, totalMailJobCount]
    = await Promise.all([
      supabaseServer.from("business_runtime_settings").select("lexware_automatic_mail_enabled,invoice_cutover_at")
        .eq("id", "default").single(),
      supabaseServer.from("school_lexware_invoice_mail_jobs").select("id", { count: "exact", head: true })
        .in("status", ["waiting_for_activation", "pending", "processing", "retry"]),
      countNativeLexwareMailJobs(),
    ]);
  if (settingsError || !settings || openError || openMailJobCount === null) {
    throw new Error("MAIL_ORCHESTRATION_PRECHECK_STATE_FAILED");
  }
  const { data: invoiceRows, error: invoiceError } = await supabaseServer.from("school_request_invoices")
    .select(`id,request_id,invoice_provider,lexware_invoice_job_id,lexware_invoice_id,lexware_invoice_number,lexware_organization_id,lexware_finalized_at,billing_name_snapshot,billing_email_snapshot,total_amount,currency,selected_payment_method,${PDF_FIELDS}`)
    .eq("invoice_provider", "lexware").not("lexware_finalized_at", "is", null)
    .order("created_at", { ascending: true }).limit(CANDIDATE_SCAN_LIMIT);
  if (invoiceError) throw new Error("MAIL_ORCHESTRATION_PRECHECK_INVOICE_FAILED");

  let selectedInvoiceId: string | null = null;
  let selectedInvoiceJobId: string | null = null;
  let targetMailJobCount = -1;
  let targetSnapshotReady = false;
  for (const rawInvoice of invoiceRows ?? []) {
    const invoice = rawInvoice as InvoiceRow;
    const [{ data: rawJob, error: jobError }, { data: rawMails, error: mailError }] = await Promise.all([
      supabaseServer.from("school_lexware_invoice_jobs").select("*").eq("id", invoice.lexware_invoice_job_id).maybeSingle(),
      supabaseServer.from("school_lexware_invoice_mail_jobs").select("*").eq("invoice_job_id", invoice.lexware_invoice_job_id).limit(2),
    ]);
    if (jobError || !rawJob || mailError) continue;
    const job = rawJob as InvoiceJobRow;
    const mails = (rawMails ?? []) as MailJobRow[];
    const mail = mails.length === 1 ? mails[0] : null;
    let readiness = invoiceJobBindingValid(invoice, job) ? pdfState(invoice, job) : "invalid_binding";
    if (mails.length > 1) readiness = "invalid_binding";
    const candidate: NativeMailOrchestrationCandidate = {
      invoiceId: invoice.id,
      readiness,
      mailJob: mail ? { id: mail.id, status: mail.status, deliveryState: mail.delivery_state,
        attemptCount: mail.attempt_count, bindingValid: mailBindingValid(mail, invoice, job), pristine: pristine(mail) } : null,
    };
    if (invoice.id === TEMPORARY_MAIL_ORCHESTRATION_TARGET_INVOICE_ID) {
      targetMailJobCount = mails.length;
      try {
        resolveLexwareMailSenderAddress(process.env);
        const template = buildNativeLexwareInvoiceMailTemplate({ invoiceNumber: invoice.lexware_invoice_number,
          billingName: invoice.billing_name_snapshot, totalAmount: invoice.total_amount, currency: invoice.currency,
          paymentMethod: invoice.selected_payment_method });
        targetSnapshotReady = Boolean(invoice.billing_email_snapshot && invoice.lexware_pdf_filename
          && template.subject && template.text && template.html);
      } catch {
        targetSnapshotReady = false;
      }
    }
    const action = classifyNativeMailOrchestrationCandidate(candidate);
    if (action === "ignore") continue;
    if (action === "enqueue_and_activate") {
      selectedInvoiceId = invoice.id;
      selectedInvoiceJobId = job.id;
    }
    break;
  }
  return {
    automaticMailEnabled: settings.lexware_automatic_mail_enabled === true
      && Number.isFinite(Date.parse(settings.invoice_cutover_at)) && Date.parse(settings.invoice_cutover_at) <= Date.now(),
    selectedInvoiceId, selectedInvoiceJobId, targetSnapshotReady, targetMailJobCount,
    openMailJobCount, totalMailJobCount,
  };
}

export async function readTemporaryMailOrchestrationPostcheck(
  invoiceJobId: string,
): Promise<TemporaryMailOrchestrationPostcheck> {
  const [{ data, error }, totalMailJobCount] = await Promise.all([
    supabaseServer.from("school_lexware_invoice_mail_jobs").select("*").eq("invoice_job_id", invoiceJobId).limit(2),
    countNativeLexwareMailJobs(),
  ]);
  if (error) throw new Error("MAIL_ORCHESTRATION_POSTCHECK_FAILED");
  const rows = (data ?? []) as MailJobRow[];
  const mail = rows.length === 1 ? rows[0] : null;
  return {
    targetMailJobCount: rows.length,
    totalMailJobCount,
    targetPendingPristine: Boolean(mail && mail.status === "pending" && mail.delivery_state === "not_attempted"
      && pristine(mail)),
  };
}
