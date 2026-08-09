import "server-only";

import { supabaseServer } from "@/lib/supabase/server";
import { getLexwareRuntimeConfigurationSummary } from "./lexwareConfig";
import { getLexwareInvoicePdf } from "./lexwareInvoiceReadClient";
import {
  auditNativeLexwarePdfCore,
  NativePdfAuditError,
  type NativePdfAuditState,
} from "./lexwareNativePdfAuditCore";

export type NativePdfAuditServiceResult = {
  ok: boolean;
  status: number;
  code: string;
  byteLength?: number;
  contentType?: "application/pdf";
  normalizedFilename?: string;
  sha256Prefix?: string;
  fetchedAt?: string;
};

export async function auditNativeLexwareInvoicePdf(invoiceId: string): Promise<NativePdfAuditServiceResult> {
  const { data: invoice, error: invoiceError } = await supabaseServer
    .from("school_request_invoices")
    .select("id,invoice_provider,tax_snapshot_version,tax_snapshot_status,lexware_finalized_at,lexware_invoice_id,lexware_invoice_number,lexware_organization_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invoiceError || !invoice) return { ok: false, status: 404, code: "INVOICE_NOT_FOUND" };

  const { data: job, error: jobError } = await supabaseServer
    .from("school_lexware_invoice_jobs")
    .select("local_invoice_id,trigger_source,status,creation_state,lexware_invoice_id,lexware_invoice_number,target_organization_id")
    .eq("local_invoice_id", invoiceId)
    .maybeSingle();
  if (jobError || !job) return { ok: false, status: 409, code: "NATIVE_JOB_REQUIRED" };

  const { data: settings, error: settingsError } = await supabaseServer
    .from("business_runtime_settings")
    .select("lexware_production_organization_id")
    .eq("id", "default")
    .maybeSingle();
  if (settingsError || !settings) return { ok: false, status: 409, code: "RUNTIME_SETTINGS_REQUIRED" };

  const runtime = getLexwareRuntimeConfigurationSummary();
  const state: NativePdfAuditState = {
    invoiceProvider: invoice.invoice_provider,
    taxSnapshotVersion: invoice.tax_snapshot_version,
    taxSnapshotStatus: invoice.tax_snapshot_status,
    invoiceFinalizedAt: invoice.lexware_finalized_at,
    invoiceLexwareId: invoice.lexware_invoice_id,
    invoiceLexwareNumber: invoice.lexware_invoice_number,
    invoiceOrganizationId: invoice.lexware_organization_id,
    jobSource: job.trigger_source,
    jobStatus: job.status,
    creationState: job.creation_state,
    jobLexwareId: job.lexware_invoice_id,
    jobLexwareNumber: job.lexware_invoice_number,
    jobOrganizationId: job.target_organization_id,
    databaseOrganizationId: settings.lexware_production_organization_id,
    runtimeOrganizationId: runtime.modes.production.organizationId,
  };

  try {
    const metadata = await auditNativeLexwarePdfCore(
      state,
      (externalInvoiceId) => getLexwareInvoicePdf("production", externalInvoiceId, {
        maxBytes: 10 * 1024 * 1024,
      }),
    );
    return { ok: true, status: 200, code: "LEXWARE_PDF_AUDIT_OK", ...metadata };
  } catch (error) {
    if (error instanceof NativePdfAuditError) {
      const stateBlocked = error.code.startsWith("STATE_BLOCKED:");
      return { ok: false, status: stateBlocked ? 409 : 502, code: stateBlocked ? "LEXWARE_PDF_AUDIT_BLOCKED" : error.code };
    }
    return { ok: false, status: 502, code: "LEXWARE_PDF_READ_FAILED" };
  }
}
