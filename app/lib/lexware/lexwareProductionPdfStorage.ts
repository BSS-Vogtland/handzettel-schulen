import "server-only";

import { supabaseServer } from "@/lib/supabase/server";
import { getLexwareInvoicePdf } from "./lexwareInvoiceReadClient";
import {
  buildLexwarePdfStoragePath,
  LEXWARE_PDF_BUCKET,
  sanitizePdfFilename,
  type StoredPdf,
  validateLexwarePdf,
  verifyStoredPdf,
} from "./lexwareProductionDeliveryCore";

type NativePdfRow = {
  id: string; request_id: string; invoice_provider: string; lexware_invoice_job_id: string;
  lexware_invoice_id: string; lexware_invoice_number: string;
  lexware_pdf_fetched_at: string | null; lexware_pdf_sha256: string | null;
  lexware_pdf_size_bytes: number | null; lexware_pdf_content_type: string | null;
  lexware_pdf_filename: string | null; lexware_pdf_storage_bucket: string | null;
  lexware_pdf_storage_path: string | null; lexware_pdf_stored_at: string | null;
};
type NativeJobRow = { id: string; request_id: string; local_invoice_id: string; trigger_source: string; status: string;
  creation_state: string; payload_sha256: string; payload_hash_version: string; target_organization_id: string;
  lexware_invoice_id: string; lexware_invoice_number: string };

const metadataFromRow = (row: NativePdfRow): StoredPdf | null => {
  const values = [row.lexware_pdf_fetched_at,row.lexware_pdf_sha256,row.lexware_pdf_size_bytes,row.lexware_pdf_content_type,
    row.lexware_pdf_filename,row.lexware_pdf_storage_bucket,row.lexware_pdf_storage_path,row.lexware_pdf_stored_at];
  if (values.every((value) => value === null)) return null;
  if (!row.lexware_pdf_fetched_at || !row.lexware_pdf_sha256 || !row.lexware_pdf_size_bytes
      || row.lexware_pdf_content_type !== "application/pdf" || !row.lexware_pdf_filename
      || row.lexware_pdf_storage_bucket !== LEXWARE_PDF_BUCKET || !row.lexware_pdf_storage_path || !row.lexware_pdf_stored_at) {
    throw new Error("NATIVE_PDF_PARTIAL_METADATA");
  }
  return { bucket: LEXWARE_PDF_BUCKET,path: row.lexware_pdf_storage_path,sha256: row.lexware_pdf_sha256,
    sizeBytes: row.lexware_pdf_size_bytes,contentType:"application/pdf",filename:row.lexware_pdf_filename,
    fetchedAt:row.lexware_pdf_fetched_at,storedAt:row.lexware_pdf_stored_at };
};

const download = async (path: string) => {
  const { data, error } = await supabaseServer.storage.from(LEXWARE_PDF_BUCKET).download(path);
  if (error || !data) throw error ?? new Error("LEXWARE_PDF_STORAGE_OBJECT_MISSING");
  return new Uint8Array(await data.arrayBuffer());
};

export async function loadStoredNativeLexwarePdf(invoiceId: string) {
  const { data, error } = await supabaseServer.from("school_request_invoices")
    .select("id,request_id,invoice_provider,lexware_invoice_job_id,lexware_invoice_id,lexware_invoice_number,lexware_pdf_fetched_at,lexware_pdf_sha256,lexware_pdf_size_bytes,lexware_pdf_content_type,lexware_pdf_filename,lexware_pdf_storage_bucket,lexware_pdf_storage_path,lexware_pdf_stored_at")
    .eq("id", invoiceId).single();
  if (error || !data) throw error ?? new Error("NATIVE_INVOICE_NOT_FOUND");
  const row = data as NativePdfRow;
  const metadata = metadataFromRow(row);
  if (row.invoice_provider !== "lexware" || !metadata) throw new Error("NATIVE_PDF_NOT_PREPARED");
  const content = await download(metadata.path);
  verifyStoredPdf(content, metadata);
  return { content, metadata, invoice: row };
}

export async function fetchAndStoreLexwareProductionPdf(
  invoiceId: string,
  lifecycle: { onProviderGetStarted?: () => void } = {},
) {
  const { data: invoiceData, error: invoiceError } = await supabaseServer.from("school_request_invoices")
    .select("id,request_id,invoice_provider,lexware_invoice_job_id,lexware_invoice_id,lexware_invoice_number,lexware_pdf_fetched_at,lexware_pdf_sha256,lexware_pdf_size_bytes,lexware_pdf_content_type,lexware_pdf_filename,lexware_pdf_storage_bucket,lexware_pdf_storage_path,lexware_pdf_stored_at")
    .eq("id", invoiceId).single();
  if (invoiceError || !invoiceData) throw invoiceError ?? new Error("NATIVE_INVOICE_NOT_FOUND");
  const invoice = invoiceData as NativePdfRow;
  const { data: jobData, error: jobError } = await supabaseServer.from("school_lexware_invoice_jobs")
    .select("id,request_id,local_invoice_id,trigger_source,status,creation_state,payload_sha256,payload_hash_version,target_organization_id,lexware_invoice_id,lexware_invoice_number")
    .eq("id", invoice.lexware_invoice_job_id).single();
  if (jobError || !jobData) throw jobError ?? new Error("NATIVE_JOB_NOT_FOUND");
  const job = jobData as NativeJobRow;
  if (invoice.invoice_provider !== "lexware" || job.trigger_source !== "checkout_native_lexware"
      || job.status !== "succeeded" || job.creation_state !== "definitely_created"
      || job.payload_hash_version !== "lexware-payload-canonical-v2"
      || !invoice.lexware_invoice_id || !invoice.lexware_invoice_number
      || invoice.lexware_invoice_id !== job.lexware_invoice_id || invoice.lexware_invoice_number !== job.lexware_invoice_number) {
    throw new Error("NATIVE_PDF_PRECONDITION_BLOCKED");
  }
  const existing = metadataFromRow(invoice);
  if (existing) {
    const content = await download(existing.path);
    verifyStoredPdf(content, existing);
    return { outcome: "already_prepared" as const, providerGetCount: 0, metadata: existing };
  }
  lifecycle.onProviderGetStarted?.();
  const response = await getLexwareInvoicePdf("production", invoice.lexware_invoice_id, { maxBytes: 10 * 1024 * 1024 });
  const verified = validateLexwarePdf(response.content, response.contentType ?? "");
  const path = buildLexwarePdfStoragePath({ organizationId: job.target_organization_id,
    lexwareInvoiceId: invoice.lexware_invoice_id, sha256: verified.sha256 });
  const filenameMatch = /filename\*?=(?:UTF-8''|\")?([^";]+)/i.exec(response.contentDisposition ?? "");
  const filename = sanitizePdfFilename(filenameMatch ? decodeURIComponent(filenameMatch[1]) : `Rechnung_${invoice.lexware_invoice_number}.pdf`);
  const { error: uploadError } = await supabaseServer.storage.from(LEXWARE_PDF_BUCKET).upload(path, response.content,
    { contentType: "application/pdf", upsert: false });
  if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) throw uploadError;
  const storedObject = await download(path);
  const storedAt = new Date().toISOString();
  const metadata: StoredPdf = { bucket:LEXWARE_PDF_BUCKET,path,sha256:verified.sha256,sizeBytes:verified.sizeBytes,
    contentType:"application/pdf",filename,fetchedAt:response.downloadedAt,storedAt };
  verifyStoredPdf(storedObject, metadata);
  const { error: rpcError } = await supabaseServer.rpc("persist_native_lexware_invoice_pdf_storage", {
    p_invoice_id:invoice.id,p_job_id:job.id,p_request_id:invoice.request_id,p_expected_payload_sha256:job.payload_sha256,
    p_expected_organization_id:job.target_organization_id,p_expected_external_invoice_id:invoice.lexware_invoice_id,
    p_expected_external_invoice_number:invoice.lexware_invoice_number,p_pdf_sha256:metadata.sha256,
    p_pdf_size_bytes:metadata.sizeBytes,p_pdf_content_type:metadata.contentType,p_pdf_filename:metadata.filename,
    p_pdf_fetched_at:metadata.fetchedAt,p_storage_bucket:metadata.bucket,p_storage_path:metadata.path,p_storage_stored_at:metadata.storedAt,
  });
  if (rpcError) throw rpcError;
  return { outcome:"prepared" as const,providerGetCount:1,metadata };
}
