import "server-only";

import { supabaseServer } from "@/lib/supabase/server";
import { buildNativeLexwareInvoiceMailTemplate } from "./lexwareInvoiceMailTemplate";
import {
  resolveLexwareMailSenderAddress,
} from "./lexwareProductionDeliveryCore";
import {
  runNativeMailOrchestrationWorker,
  type NativeMailOrchestrationCandidate,
} from "./lexwareNativeMailOrchestrationCore";

const CANDIDATE_SCAN_LIMIT = 25;
const HASH_VERSION = "lexware-payload-canonical-v2";
const PDF_BUCKET = "lexware-invoice-pdfs";

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

const PDF_FIELDS = "lexware_pdf_fetched_at,lexware_pdf_sha256,lexware_pdf_size_bytes,lexware_pdf_content_type,lexware_pdf_filename,lexware_pdf_storage_bucket,lexware_pdf_storage_path,lexware_pdf_stored_at";

async function automaticMailEnabled() {
  const { data, error } = await supabaseServer.from("business_runtime_settings")
    .select("lexware_automatic_mail_enabled,invoice_cutover_at").eq("id", "default").single();
  if (error || !data) throw new Error("NATIVE_MAIL_ORCHESTRATION_SETTINGS_FAILED");
  return data.lexware_automatic_mail_enabled === true
    && Number.isFinite(Date.parse(data.invoice_cutover_at)) && Date.parse(data.invoice_cutover_at) <= Date.now();
}

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

const invoiceJobBindingValid = (invoice: InvoiceRow, job: InvoiceJobRow) => invoice.invoice_provider === "lexware"
  && Boolean(invoice.lexware_finalized_at) && job.trigger_source === "checkout_native_lexware"
  && job.status === "succeeded" && job.creation_state === "definitely_created"
  && invoice.lexware_invoice_job_id === job.id && invoice.request_id === job.request_id
  && job.local_invoice_id === invoice.id && invoice.lexware_invoice_id === job.lexware_invoice_id
  && invoice.lexware_invoice_number === job.lexware_invoice_number
  && invoice.lexware_organization_id === job.target_organization_id
  && job.payload_hash_version === HASH_VERSION && /^[a-f0-9]{64}$/.test(job.payload_sha256 ?? "");

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

const pristineMailJob = (mail: MailJobRow) => mail.attempt_count === 0 && mail.locked_at === null
  && mail.lock_expires_at === null && mail.locked_by === null && mail.transport_message_id === null
  && mail.smtp_attempt_started_at === null && mail.smtp_attempt_completed_at === null && mail.sent_at === null
  && mail.last_error_code === null && mail.manual_review_reason === null;

async function loadCandidates(): Promise<NativeMailOrchestrationCandidate[]> {
  const { data, error } = await supabaseServer.from("school_request_invoices")
    .select(`id,request_id,invoice_provider,lexware_invoice_job_id,lexware_invoice_id,lexware_invoice_number,lexware_organization_id,lexware_finalized_at,billing_name_snapshot,billing_email_snapshot,total_amount,currency,selected_payment_method,${PDF_FIELDS}`)
    .eq("invoice_provider", "lexware").not("lexware_finalized_at", "is", null)
    .order("created_at", { ascending: true }).limit(CANDIDATE_SCAN_LIMIT);
  if (error) throw new Error("NATIVE_MAIL_ORCHESTRATION_INVOICE_LOAD_FAILED");
  const candidates: NativeMailOrchestrationCandidate[] = [];
  for (const rawInvoice of data ?? []) {
    const invoice = rawInvoice as InvoiceRow;
    const [{ data: rawJob, error: jobError }, { data: rawMailJobs, error: mailError }] = await Promise.all([
      supabaseServer.from("school_lexware_invoice_jobs").select("*").eq("id", invoice.lexware_invoice_job_id).maybeSingle(),
      supabaseServer.from("school_lexware_invoice_mail_jobs").select("*").eq("invoice_job_id", invoice.lexware_invoice_job_id).limit(2),
    ]);
    if (jobError || !rawJob || mailError) continue;
    const job = rawJob as InvoiceJobRow;
    const mailRows = (rawMailJobs ?? []) as MailJobRow[];
    const mail = mailRows.length === 1 ? mailRows[0] : null;
    let readiness = invoiceJobBindingValid(invoice, job) ? pdfState(invoice, job) : "invalid_binding";
    if (mailRows.length > 1) readiness = "invalid_binding";
    candidates.push({
      invoiceId: invoice.id,
      readiness,
      mailJob: mail ? {
        id: mail.id, status: mail.status, deliveryState: mail.delivery_state, attemptCount: mail.attempt_count,
        bindingValid: mailBindingValid(mail, invoice, job), pristine: pristineMailJob(mail),
      } : null,
    });
  }
  return candidates;
}

async function loadInvoiceForEnqueue(invoiceId: string) {
  const { data, error } = await supabaseServer.from("school_request_invoices")
    .select("id,lexware_invoice_job_id,lexware_invoice_number,billing_name_snapshot,billing_email_snapshot,total_amount,currency,selected_payment_method,lexware_pdf_filename,lexware_pdf_sha256")
    .eq("id", invoiceId).single();
  if (error || !data) throw new Error("NATIVE_MAIL_ORCHESTRATION_INVOICE_RELOAD_FAILED");
  return data;
}

async function enqueueAndActivate(invoiceId: string) {
  if (!await automaticMailEnabled()) throw new Error("NATIVE_MAIL_ORCHESTRATION_GATE_CLOSED");
  const invoice = await loadInvoiceForEnqueue(invoiceId);
  if (!invoice.lexware_invoice_job_id || !invoice.lexware_invoice_number || !invoice.billing_email_snapshot
      || !invoice.lexware_pdf_filename || !invoice.lexware_pdf_sha256) throw new Error("NATIVE_MAIL_ORCHESTRATION_SNAPSHOT_BLOCKED");
  const fromAddress = resolveLexwareMailSenderAddress(process.env);
  const template = buildNativeLexwareInvoiceMailTemplate({
    invoiceNumber: invoice.lexware_invoice_number, billingName: invoice.billing_name_snapshot,
    totalAmount: invoice.total_amount, currency: invoice.currency, paymentMethod: invoice.selected_payment_method,
  });
  const payload = {
    schemaVersion: "native-lexware-mail-v1", invoiceNumber: invoice.lexware_invoice_number,
    total: new Intl.NumberFormat("de-DE", { style: "currency", currency: invoice.currency || "EUR" }).format(Number(invoice.total_amount)),
    paymentMethod: invoice.selected_payment_method || null, attachmentSha256: invoice.lexware_pdf_sha256,
  };
  const { data, error } = await supabaseServer.rpc("enqueue_native_lexware_invoice_mail_job_manual", {
    p_invoice_job_id: invoice.lexware_invoice_job_id, p_recipient_email: invoice.billing_email_snapshot,
    p_recipient_name: invoice.billing_name_snapshot, p_from_name: "BSS Vogtland / Handzettel-Schulen.de",
    p_from_email: fromAddress, p_reply_to_email: fromAddress, p_subject: template.subject,
    p_text_body: template.text, p_html_body: template.html, p_attachment_filename: invoice.lexware_pdf_filename,
    p_mail_payload_snapshot: payload,
  });
  if (error || !data || data.status !== "pending" || data.delivery_state !== "not_attempted"
      || data.attempt_count !== 0) throw new Error("NATIVE_MAIL_ORCHESTRATION_ENQUEUE_BLOCKED");
}

async function activate(invoiceId: string, mailJobId: string) {
  if (!await automaticMailEnabled()) throw new Error("NATIVE_MAIL_ORCHESTRATION_GATE_CLOSED");
  const { data, error } = await supabaseServer.rpc("activate_native_lexware_invoice_mail_job", {
    p_invoice_id: invoiceId, p_mail_job_id: mailJobId,
  });
  if (error || !data || data.status !== "pending" || data.attempt_count !== 0) {
    throw new Error("NATIVE_MAIL_ORCHESTRATION_ACTIVATION_BLOCKED");
  }
}

export function processNextNativeLexwareMailOrchestration() {
  return runNativeMailOrchestrationWorker({ automaticMailEnabled, loadCandidates, enqueueAndActivate, activate });
}
