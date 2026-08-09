import { createHash } from "node:crypto";

export const LEXWARE_NATIVE_PDF_AUDIT_VERSION = "lexware-native-pdf-audit-v1" as const;
export const LEXWARE_NATIVE_PDF_MIN_BYTES = 100;
export const LEXWARE_NATIVE_PDF_MAX_BYTES = 10 * 1024 * 1024;

export type NativePdfAuditState = {
  invoiceProvider: unknown;
  taxSnapshotVersion: unknown;
  taxSnapshotStatus: unknown;
  invoiceFinalizedAt: unknown;
  invoiceLexwareId: unknown;
  invoiceLexwareNumber: unknown;
  invoiceOrganizationId: unknown;
  jobSource: unknown;
  jobStatus: unknown;
  creationState: unknown;
  jobLexwareId: unknown;
  jobLexwareNumber: unknown;
  jobOrganizationId: unknown;
  databaseOrganizationId: unknown;
  runtimeOrganizationId: unknown;
};

export type NativePdfDownload = {
  content: Buffer;
  byteLength: number;
  contentType: string | null;
  contentDisposition: string | null;
  downloadedAt: string;
};

export type NativePdfAuditMetadata = {
  byteLength: number;
  contentType: "application/pdf";
  normalizedFilename: string;
  sha256Prefix: string;
  fetchedAt: string;
};

export class NativePdfAuditError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "NativePdfAuditError";
    this.code = code;
  }
}

const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;

export function evaluateNativePdfAuditState(state: NativePdfAuditState): string[] {
  const reasons: string[] = [];
  const invoiceId = text(state.invoiceLexwareId);
  const jobId = text(state.jobLexwareId);
  const invoiceNumber = text(state.invoiceLexwareNumber);
  const jobNumber = text(state.jobLexwareNumber);
  const invoiceOrganization = text(state.invoiceOrganizationId)?.toLowerCase() ?? null;
  const jobOrganization = text(state.jobOrganizationId)?.toLowerCase() ?? null;
  const databaseOrganization = text(state.databaseOrganizationId)?.toLowerCase() ?? null;
  const runtimeOrganization = text(state.runtimeOrganizationId)?.toLowerCase() ?? null;

  if (state.invoiceProvider !== "lexware") reasons.push("invoice_provider_invalid");
  if (state.taxSnapshotVersion !== "invoice-tax-snapshot-v2" || state.taxSnapshotStatus !== "complete") {
    reasons.push("invoice_snapshot_incomplete");
  }
  if (!text(state.invoiceFinalizedAt)) reasons.push("invoice_not_finalized");
  if (!invoiceId) reasons.push("invoice_external_id_missing");
  if (!invoiceNumber) reasons.push("invoice_external_number_missing");
  if (state.jobSource !== "checkout_native_lexware") reasons.push("job_source_invalid");
  if (state.jobStatus !== "succeeded") reasons.push("job_status_invalid");
  if (state.creationState !== "definitely_created") reasons.push("creation_state_invalid");
  if (!jobId || jobId !== invoiceId) reasons.push("external_id_binding_invalid");
  if (!jobNumber || jobNumber !== invoiceNumber) reasons.push("external_number_binding_invalid");
  if (!invoiceOrganization || !jobOrganization || !databaseOrganization || !runtimeOrganization
      || invoiceOrganization !== jobOrganization
      || jobOrganization !== databaseOrganization
      || databaseOrganization !== runtimeOrganization) {
    reasons.push("organization_binding_invalid");
  }
  return reasons;
}

function filenameFromContentDisposition(value: string | null) {
  if (!value) return null;
  const encoded = value.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try { return decodeURIComponent(encoded.replace(/^"|"$/g, "")); } catch { return null; }
  }
  return value.match(/filename\s*=\s*"([^"]+)"/i)?.[1]
    ?? value.match(/filename\s*=\s*([^;\s]+)/i)?.[1]
    ?? null;
}

export function normalizeLexwarePdfFilename(contentDisposition: string | null) {
  const source = filenameFromContentDisposition(contentDisposition) ?? "lexware-rechnung.pdf";
  const leaf = source.replace(/\\/g, "/").split("/").pop() ?? "";
  const normalized = leaf
    .replace(/[\r\n\0]/g, "")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 180);
  const safe = normalized && normalized !== "." && normalized !== ".."
    ? normalized
    : "lexware-rechnung.pdf";
  return safe.toLowerCase().endsWith(".pdf") ? safe : `${safe}.pdf`;
}

export function validateNativeLexwarePdf(download: NativePdfDownload): NativePdfAuditMetadata {
  const contentType = text(download.contentType)?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/pdf") throw new NativePdfAuditError("PDF_CONTENT_TYPE_INVALID");
  if (!Buffer.isBuffer(download.content)) throw new NativePdfAuditError("PDF_BUFFER_INVALID");
  if (download.byteLength !== download.content.byteLength) throw new NativePdfAuditError("PDF_LENGTH_MISMATCH");
  if (download.byteLength < LEXWARE_NATIVE_PDF_MIN_BYTES) throw new NativePdfAuditError("PDF_TOO_SMALL");
  if (download.byteLength > LEXWARE_NATIVE_PDF_MAX_BYTES) throw new NativePdfAuditError("PDF_TOO_LARGE");
  if (download.content.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new NativePdfAuditError("PDF_SIGNATURE_INVALID");
  }
  const sha256 = createHash("sha256").update(download.content).digest("hex");
  return {
    byteLength: download.byteLength,
    contentType: "application/pdf",
    normalizedFilename: normalizeLexwarePdfFilename(download.contentDisposition),
    sha256Prefix: sha256.slice(0, 16),
    fetchedAt: download.downloadedAt,
  };
}

export async function auditNativeLexwarePdfCore(
  state: NativePdfAuditState,
  readPdf: (externalInvoiceId: string) => Promise<NativePdfDownload>,
) {
  const reasons = evaluateNativePdfAuditState(state);
  if (reasons.length > 0) throw new NativePdfAuditError(`STATE_BLOCKED:${reasons[0]}`);
  const externalInvoiceId = text(state.invoiceLexwareId);
  if (!externalInvoiceId) throw new NativePdfAuditError("INVOICE_EXTERNAL_ID_MISSING");
  const download = await readPdf(externalInvoiceId);
  return validateNativeLexwarePdf(download);
}
