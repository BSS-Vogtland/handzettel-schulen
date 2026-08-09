import type { LexwareInvoiceReadModel } from "./lexwareInvoiceReadClient";

export const NATIVE_EXTERNAL_RESULT_RECOVERY_CONFIRMATION =
  "RECOVER_EXISTING_LEXWARE_INVOICE_WITHOUT_CREATE" as const;

export type NativeExternalRecoveryState = {
  invoiceId: string;
  requestId: string;
  jobId: string;
  invoiceProvider: string | null;
  triggerSource: string | null;
  jobStatus: string | null;
  creationState: string | null;
  attemptCount: number;
  externalWriteStartedAt: string | null;
  externalWriteCompletedAt: string | null;
  externalInvoiceId: string | null;
  externalResourceUri: string | null;
  providerCreatedAt: string | null;
  payloadSha256: string | null;
  payloadHashVersion: string | null;
  targetOrganizationId: string | null;
  credentialAlias: string | null;
  idempotencyKey: string | null;
  invoiceExternalOrganizationId: string | null;
  invoiceExternalId: string | null;
  invoiceExternalNumber: string | null;
  invoiceExternalResourceUri: string | null;
  invoiceCreatedAt: string | null;
  invoiceFinalizedAt: string | null;
  snapshotComplete: boolean;
  storedPayloadHashMatches: boolean;
  currentPayloadHashMatches: boolean;
  organizationMatches: boolean;
  credentialAliasMatches: boolean;
  idempotencyKeyMatches: boolean;
  productionWriteEnabled: boolean;
};

export type NativeExternalRecoveryRpcResult = {
  recoveryApplied: true;
  invoiceId: string;
  jobId: string;
  jobStatus: "succeeded";
  creationState: "definitely_created";
  externalInvoiceId: string;
  externalInvoiceNumber: string;
};

export function evaluateNativeExternalRecoveryGates(state: NativeExternalRecoveryState): string[] {
  const reasons: string[] = [];
  if (state.invoiceProvider !== "lexware") reasons.push("invoice_provider_invalid");
  if (state.triggerSource !== "checkout_native_lexware") reasons.push("job_source_invalid");
  if (state.jobStatus !== "manual_review") reasons.push("job_status_invalid");
  if (state.creationState !== "creation_state_unknown") reasons.push("creation_state_invalid");
  if (!state.externalWriteStartedAt) reasons.push("started_marker_missing");
  if (!state.externalWriteCompletedAt) reasons.push("completed_marker_missing");
  if (!state.externalInvoiceId) reasons.push("external_invoice_id_missing");
  if (!state.externalResourceUri) reasons.push("external_resource_uri_missing");
  if (!state.providerCreatedAt) reasons.push("provider_created_at_missing");
  if (!state.snapshotComplete) reasons.push("invoice_snapshot_incomplete");
  if (
    state.invoiceExternalOrganizationId !== null
    || state.invoiceExternalId !== null
    || state.invoiceExternalNumber !== null
    || state.invoiceExternalResourceUri !== null
    || state.invoiceCreatedAt !== null
  ) reasons.push("invoice_partial_external_identity");
  if (state.invoiceFinalizedAt !== null) reasons.push("invoice_already_finalized");
  if (state.payloadHashVersion !== "lexware-payload-canonical-v2") reasons.push("payload_hash_version_invalid");
  if (!state.payloadSha256 || !/^[a-f0-9]{64}$/.test(state.payloadSha256)) reasons.push("payload_hash_invalid");
  if (!state.storedPayloadHashMatches) reasons.push("stored_payload_hash_mismatch");
  if (!state.currentPayloadHashMatches) reasons.push("current_payload_hash_mismatch");
  if (!state.organizationMatches) reasons.push("organization_mismatch");
  if (!state.credentialAliasMatches) reasons.push("credential_alias_mismatch");
  if (!state.idempotencyKeyMatches) reasons.push("idempotency_key_mismatch");
  if (!state.productionWriteEnabled) reasons.push("production_write_disabled");
  return reasons;
}

export async function recoverNativeLexwareExternalResultCore(input: {
  state: NativeExternalRecoveryState;
  payload: unknown;
  expectedOrganizationId: string;
}, dependencies: {
  readInvoice: (externalInvoiceId: string) => Promise<LexwareInvoiceReadModel>;
  compareReadBack: (readBack: LexwareInvoiceReadModel, payload: unknown, organizationId: string) => string[];
  recoverLocal: (readBack: LexwareInvoiceReadModel) => Promise<NativeExternalRecoveryRpcResult>;
}): Promise<NativeExternalRecoveryRpcResult> {
  const gateReasons = evaluateNativeExternalRecoveryGates(input.state);
  if (gateReasons.length) throw new Error(`NATIVE_EXTERNAL_RECOVERY_BLOCKED:${gateReasons.join(",")}`);
  const externalInvoiceId = input.state.externalInvoiceId;
  if (!externalInvoiceId) throw new Error("NATIVE_EXTERNAL_RECOVERY_BLOCKED:external_invoice_id_missing");

  // Der einzige Providerzugriff dieses Recovery-Vertrags ist dieser GET.
  const readBack = await dependencies.readInvoice(externalInvoiceId);
  const differences = dependencies.compareReadBack(readBack, input.payload, input.expectedOrganizationId);
  if (readBack.id !== externalInvoiceId) differences.push("external_invoice_id_mismatch");
  if (!readBack.voucherNumber) differences.push("voucher_number_missing");
  if (differences.length) throw new Error(`NATIVE_EXTERNAL_READ_BACK_MISMATCH:${differences.join(",")}`);

  return dependencies.recoverLocal(readBack);
}
