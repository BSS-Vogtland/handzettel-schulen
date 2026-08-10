import "server-only";

import { supabaseServer } from "@/lib/supabase/server";
import { readLexwareMailSenderAddress, readLexwareMailTransportConfiguration, sendLexwareInvoiceMailAtMostOnce } from "./lexwareAtMostOnceMailTransport";
import { buildDeterministicMailMessageId, sendClaimedMailAtMostOnce, type LexwareMailTransportConfiguration, type StoredPdf } from "./lexwareProductionDeliveryCore";
import { runNativeMailEnqueueStage } from "./lexwareNativeMailEnqueueDiagnostics";
import { buildNativeLexwareInvoiceMailTemplate } from "./lexwareInvoiceMailTemplate";
import { loadStoredNativeLexwarePdf } from "./lexwareProductionPdfStorage";

type MailJob = { id:string;local_invoice_id:string;invoice_job_id:string;idempotency_key:string;status:string;attempt_count:number;
  locked_by:string|null;lock_expires_at:string|null;delivery_state:string;recipient_email_snapshot:string;subject_snapshot:string;
  text_body_snapshot:string;html_body_snapshot:string;attachment_filename_snapshot:string;lexware_pdf_storage_bucket:string;
  lexware_pdf_storage_path:string;lexware_pdf_stored_at:string;pdf_fetched_at:string;pdf_sha256:string;pdf_size_bytes:number;
  pdf_content_type:string;transport_message_id:string|null };

const getManualMailGate = async () => {
  const { data, error } = await supabaseServer.from("business_runtime_settings")
    .select("lexware_automatic_mail_enabled").limit(1).single();
  if (error || !data) throw error ?? new Error("RUNTIME_SETTINGS_NOT_FOUND");
  if (data.lexware_automatic_mail_enabled !== false) throw new Error("AUTOMATIC_MAIL_MUST_REMAIN_DISABLED");
};

export async function enqueueNativeLexwareInvoiceMail(invoiceId: string) {
  await runNativeMailEnqueueStage("manual_gate", getManualMailGate);
  const data = await runNativeMailEnqueueStage("invoice_load", async () => {
    const result = await supabaseServer.from("school_request_invoices")
      .select("id,lexware_invoice_job_id,lexware_invoice_number,billing_name_snapshot,billing_email_snapshot,total_amount,currency,selected_payment_method,lexware_pdf_filename,lexware_pdf_sha256")
      .eq("id", invoiceId).single();
    if (result.error || !result.data) throw result.error ?? new Error("NATIVE_INVOICE_NOT_FOUND");
    return result.data;
  });
  await runNativeMailEnqueueStage("snapshot_build", () => {
    if (!data.lexware_invoice_job_id || !data.lexware_invoice_number || !data.billing_email_snapshot || !data.lexware_pdf_sha256) {
      throw new Error("NATIVE_MAIL_ENQUEUE_PRECONDITION_BLOCKED");
    }
  });
  const fromAddress = await runNativeMailEnqueueStage("sender_resolve", readLexwareMailSenderAddress);
  const template = buildNativeLexwareInvoiceMailTemplate({
    invoiceNumber:data.lexware_invoice_number,billingName:data.billing_name_snapshot,totalAmount:data.total_amount,
    currency:data.currency,paymentMethod:data.selected_payment_method,
  });
  const payload = { schemaVersion:"native-lexware-mail-v1",invoiceNumber:data.lexware_invoice_number,
    total:new Intl.NumberFormat("de-DE", { style:"currency",currency:data.currency || "EUR" }).format(Number(data.total_amount)),
    paymentMethod:data.selected_payment_method || null,attachmentSha256:data.lexware_pdf_sha256 };
  return runNativeMailEnqueueStage("rpc_execution", async () => {
    const { data: rpcData, error: rpcError } = await supabaseServer.rpc("enqueue_native_lexware_invoice_mail_job_manual", {
      p_invoice_job_id:data.lexware_invoice_job_id,p_recipient_email:data.billing_email_snapshot,
      p_recipient_name:data.billing_name_snapshot,p_from_name:"BSS Vogtland / Handzettel-Schulen.de",p_from_email:fromAddress,
      p_reply_to_email:fromAddress,p_subject:template.subject,p_text_body:template.text,p_html_body:template.html,
      p_attachment_filename:data.lexware_pdf_filename || `Rechnung_${data.lexware_invoice_number}.pdf`,p_mail_payload_snapshot:payload,
    });
    if (rpcError || !rpcData) throw rpcError ?? new Error("NATIVE_MAIL_ENQUEUE_FAILED");
    return rpcData;
  });
}

export async function activateNativeLexwareInvoiceMail(invoiceId: string) {
  await getManualMailGate();
  const job = await loadMailJob(invoiceId);
  const { data, error } = await supabaseServer.rpc("activate_native_lexware_invoice_mail_job", { p_invoice_id:invoiceId,p_mail_job_id:job.id });
  if (error || !data) throw error ?? new Error("NATIVE_MAIL_ACTIVATION_FAILED");
  return data;
}

const loadMailJob = async (invoiceId: string) => {
  const { data, error } = await supabaseServer.from("school_lexware_invoice_mail_jobs").select("*").eq("local_invoice_id",invoiceId).single();
  if (error || !data) throw error ?? new Error("NATIVE_MAIL_JOB_NOT_FOUND");
  return data as MailJob;
};

export async function processLexwareProductionMailJob(invoiceId: string) {
  await getManualMailGate();
  const before = await loadMailJob(invoiceId);
  if (before.status === "sent" || before.delivery_state === "definitely_sent") return { outcome:"already_sent" as const,smtpCalls:0 };
  if (before.status === "manual_review" || before.delivery_state === "ambiguous_send") return { outcome:"manual_review" as const,smtpCalls:0 };
  const lockedBy = `native-mail:${crypto.randomUUID()}`;
  const { data: claimData, error: claimError } = await supabaseServer.rpc("claim_native_lexware_invoice_mail_job", {
    p_invoice_id:invoiceId,p_mail_job_id:before.id,p_locked_by:lockedBy,p_lock_seconds:300 });
  if (claimError || !claimData) throw claimError ?? new Error("NATIVE_MAIL_CLAIM_FAILED");
  const claimed = claimData as MailJob;
  const loaded = await loadStoredNativeLexwarePdf(invoiceId);
  const metadata: StoredPdf = { ...loaded.metadata,filename:claimed.attachment_filename_snapshot };
  if (claimed.pdf_sha256 !== metadata.sha256 || claimed.pdf_size_bytes !== metadata.sizeBytes
      || claimed.lexware_pdf_storage_path !== metadata.path) throw new Error("NATIVE_MAIL_PDF_SNAPSHOT_MISMATCH");
  const messageId = buildDeterministicMailMessageId({ mailJobId:claimed.id,idempotencyKey:claimed.idempotency_key,pdfSha256:metadata.sha256 });
  let transportConfiguration: LexwareMailTransportConfiguration | null = null;
  return sendClaimedMailAtMostOnce({ pdf:loaded.content,metadata,messageId,
    validateTransport:()=>{ transportConfiguration = readLexwareMailTransportConfiguration(); },
    markSendStarted:async (id)=>{ const { error }=await supabaseServer.rpc("mark_native_lexware_invoice_mail_send_started",{p_invoice_id:invoiceId,p_mail_job_id:claimed.id,p_attempt_count:claimed.attempt_count,p_locked_by:lockedBy,p_message_id:id}); if(error) throw error; },
    send:async (id)=>{ if (!transportConfiguration) throw new Error("SMTP_CONFIGURATION_NOT_VALIDATED");
      return sendLexwareInvoiceMailAtMostOnce({to:claimed.recipient_email_snapshot,subject:claimed.subject_snapshot,text:claimed.text_body_snapshot,
        html:claimed.html_body_snapshot,messageId:id,attachments:[{filename:claimed.attachment_filename_snapshot,content:Buffer.from(loaded.content),contentType:"application/pdf"}]},transportConfiguration); },
    complete:async (id)=>{ const { error }=await supabaseServer.rpc("complete_native_lexware_invoice_mail_send",{p_invoice_id:invoiceId,p_mail_job_id:claimed.id,p_attempt_count:claimed.attempt_count,p_locked_by:lockedBy,p_message_id:id}); if(error) throw error; },
    recordDefiniteFailure:async (code)=>{ const { error }=await supabaseServer.rpc("record_native_lexware_invoice_mail_failure",{p_invoice_id:invoiceId,p_mail_job_id:claimed.id,p_attempt_count:claimed.attempt_count,p_locked_by:lockedBy,p_error_code:code,p_ambiguous:false}); if(error) throw error; },
    recordAmbiguous:async (reason)=>{ const { error }=await supabaseServer.rpc("record_native_lexware_invoice_mail_failure",{p_invoice_id:invoiceId,p_mail_job_id:claimed.id,p_attempt_count:claimed.attempt_count,p_locked_by:lockedBy,p_error_code:reason,p_ambiguous:true}); if(error) throw error; },
  });
}
