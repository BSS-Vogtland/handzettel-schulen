import "server-only";

import { supabaseServer } from "@/lib/supabase/server";
import { getLexwareRuntimeConfigurationSummary } from "./lexwareConfig";
import { getLexwareInvoice } from "./lexwareInvoiceReadClient";
import { buildLexwareInvoicePayload } from "./lexwareInvoicePayloadBuilder";
import { parseLexwarePayloadLineItem } from "./lexwareLineItemMultisetCore";
import { parsePersistedLexwareInvoicePayload } from "./lexwarePersistedInvoicePayloadCore";
import { buildLexwarePayloadSha256, parseLexwarePayloadHashVersion } from "./lexwarePayloadHash";
import { compareLexwareOpenInvoiceReadBack } from "./lexwareProductionInvoiceProcessor";
import { validateLexwareProductionOrganization } from "./lexwareProductionOrganizationCore";
import {
  recoverNativeLexwareExternalResultCore,
  type NativeExternalRecoveryRpcResult,
  type NativeExternalRecoveryState,
} from "./lexwareNativeExternalResultRecoveryCore";

type RecoveryServiceResult = {
  ok: boolean;
  status: number;
  code: string;
  recovered: boolean;
};

const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;

export async function recoverNativeLexwareExternalResult(invoiceId: string): Promise<RecoveryServiceResult> {
  const { data: invoice, error: invoiceError } = await supabaseServer
    .from("school_request_invoices").select("*").eq("id", invoiceId).single();
  if (invoiceError || !invoice) return { ok: false, status: 404, code: "INVOICE_NOT_FOUND", recovered: false };
  const { data: job, error: jobError } = await supabaseServer
    .from("school_lexware_invoice_jobs").select("*").eq("local_invoice_id", invoiceId).single();
  if (jobError || !job) return { ok: false, status: 409, code: "RECOVERY_JOB_REQUIRED", recovered: false };
  const { data: items, error: itemsError } = await supabaseServer
    .from("school_request_invoice_items").select("*").eq("invoice_id", invoiceId).order("created_at");
  if (itemsError || !items?.length) return { ok: false, status: 409, code: "RECOVERY_ITEMS_REQUIRED", recovered: false };
  const { data: settings, error: settingsError } = await supabaseServer
    .from("business_runtime_settings")
    .select("invoice_provider_after,lexware_production_write_enabled,lexware_production_organization_id,lexware_production_credential_alias")
    .eq("id", "default").single();
  if (settingsError || !settings) return { ok: false, status: 409, code: "RECOVERY_RUNTIME_SETTINGS_REQUIRED", recovered: false };

  try {
    const hashVersion = parseLexwarePayloadHashVersion(job.payload_hash_version);
    const persistedPayload = parsePersistedLexwareInvoicePayload(job.payload_snapshot, parseLexwarePayloadLineItem);
    const currentPayload = buildLexwareInvoicePayload({ invoice, items, paymentTermDays: 7 });
    const storedPayloadHash = await buildLexwarePayloadSha256({ payload: persistedPayload.payload, version: hashVersion });
    const currentPayloadHash = await buildLexwarePayloadSha256({ payload: currentPayload.payload, version: hashVersion });
    const runtime = getLexwareRuntimeConfigurationSummary();
    const organization = validateLexwareProductionOrganization({
      jobOrganizationId: job.target_organization_id,
      databaseOrganizationId: settings.lexware_production_organization_id,
      runtimeOrganizationId: runtime.modes.production.organizationId,
    });
    const state: NativeExternalRecoveryState = {
      invoiceId: invoice.id,
      requestId: invoice.request_id,
      jobId: job.id,
      invoiceProvider: invoice.invoice_provider,
      triggerSource: job.trigger_source,
      jobStatus: job.status,
      creationState: job.creation_state,
      attemptCount: job.attempt_count,
      externalWriteStartedAt: job.external_write_started_at,
      externalWriteCompletedAt: job.external_write_completed_at,
      externalInvoiceId: text(job.lexware_invoice_id),
      externalResourceUri: text(job.lexware_resource_uri),
      providerCreatedAt: job.lexware_created_date,
      payloadSha256: job.payload_sha256,
      payloadHashVersion: job.payload_hash_version,
      targetOrganizationId: job.target_organization_id,
      credentialAlias: job.credential_alias_snapshot,
      idempotencyKey: job.idempotency_key,
      invoiceExternalOrganizationId: invoice.lexware_organization_id,
      invoiceExternalId: invoice.lexware_invoice_id,
      invoiceExternalNumber: invoice.lexware_invoice_number,
      invoiceExternalResourceUri: invoice.lexware_resource_uri,
      invoiceCreatedAt: invoice.lexware_created_at,
      invoiceFinalizedAt: invoice.lexware_finalized_at,
      snapshotComplete: invoice.tax_snapshot_status === "complete" && invoice.tax_snapshot_version === "invoice-tax-snapshot-v2",
      storedPayloadHashMatches: storedPayloadHash === job.payload_sha256,
      currentPayloadHashMatches: currentPayloadHash === job.payload_sha256,
      organizationMatches: organization.organizationId.toLowerCase() === String(job.target_organization_id).toLowerCase(),
      credentialAliasMatches: text(settings.lexware_production_credential_alias) === text(job.credential_alias_snapshot),
      idempotencyKeyMatches: job.idempotency_key === `lexware:native-checkout-invoice:${invoice.id}:v1`,
      productionWriteEnabled: settings.lexware_production_write_enabled === true,
    };
    const result = await recoverNativeLexwareExternalResultCore({
      state,
      payload: persistedPayload,
      expectedOrganizationId: organization.organizationId,
    }, {
      readInvoice: (externalId) => getLexwareInvoice("production", externalId),
      compareReadBack: (readBack, payload, organizationId) =>
        compareLexwareOpenInvoiceReadBack(readBack, payload as typeof persistedPayload, organizationId),
      recoverLocal: async (readBack): Promise<NativeExternalRecoveryRpcResult> => {
        const { data, error } = await supabaseServer.rpc("recover_native_lexware_external_result", {
          p_job_id: state.jobId,
          p_local_invoice_id: state.invoiceId,
          p_expected_request_id: state.requestId,
          p_expected_attempt_count: state.attemptCount,
          p_expected_external_write_started_at: state.externalWriteStartedAt,
          p_expected_external_write_completed_at: state.externalWriteCompletedAt,
          p_expected_external_invoice_id: state.externalInvoiceId,
          p_expected_resource_uri: state.externalResourceUri,
          p_expected_provider_created_at: state.providerCreatedAt,
          p_expected_payload_sha256: state.payloadSha256,
          p_expected_payload_hash_version: state.payloadHashVersion,
          p_expected_target_organization_id: state.targetOrganizationId,
          p_expected_credential_alias: state.credentialAlias,
          p_expected_idempotency_key: state.idempotencyKey,
          p_read_back_invoice_number: readBack.voucherNumber,
          p_read_back_voucher_status: readBack.voucherStatus,
        });
        if (error) throw new Error("NATIVE_EXTERNAL_RECOVERY_RPC_FAILED");
        const row = Array.isArray(data) ? data[0] : data;
        if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("NATIVE_EXTERNAL_RECOVERY_RESULT_INVALID");
        const value = row as Record<string, unknown>;
        if (value.recovery_applied !== true || value.invoice_id !== state.invoiceId || value.job_id !== state.jobId
          || value.job_status !== "succeeded" || value.creation_state !== "definitely_created"
          || value.external_invoice_id !== state.externalInvoiceId || value.external_invoice_number !== readBack.voucherNumber) {
          throw new Error("NATIVE_EXTERNAL_RECOVERY_RESULT_INVALID");
        }
        return {
          recoveryApplied: true,
          invoiceId: value.invoice_id as string,
          jobId: value.job_id as string,
          jobStatus: "succeeded",
          creationState: "definitely_created",
          externalInvoiceId: value.external_invoice_id as string,
          externalInvoiceNumber: value.external_invoice_number as string,
        };
      },
    });
    return { ok: result.recoveryApplied, status: 200, code: "NATIVE_EXTERNAL_RESULT_RECOVERED", recovered: true };
  } catch {
    return { ok: false, status: 409, code: "NATIVE_EXTERNAL_RESULT_RECOVERY_BLOCKED", recovered: false };
  }
}
