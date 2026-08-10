export const TEMPORARY_MAIL_ORCHESTRATION_TARGET_INVOICE_ID =
  "620dd116-2d99-4884-9425-6beac914912f";
export const TEMPORARY_MAIL_ORCHESTRATION_CONFIRMATION =
  "TRIGGER_SINGLE_NATIVE_LEXWARE_MAIL_ORCHESTRATION_TEST";

export type TemporaryMailOrchestrationPrecheck = {
  automaticMailEnabled: boolean;
  selectedInvoiceId: string | null;
  selectedInvoiceJobId: string | null;
  targetSnapshotReady: boolean;
  targetMailJobCount: number;
  openMailJobCount: number;
  totalMailJobCount: number;
};

export function isTemporaryMailOrchestrationPrecheckReady(
  value: TemporaryMailOrchestrationPrecheck,
) {
  return value.automaticMailEnabled
    && value.selectedInvoiceId === TEMPORARY_MAIL_ORCHESTRATION_TARGET_INVOICE_ID
    && typeof value.selectedInvoiceJobId === "string"
    && value.selectedInvoiceJobId.length > 0
    && value.targetSnapshotReady
    && value.targetMailJobCount === 0
    && value.openMailJobCount === 0
    && Number.isInteger(value.totalMailJobCount)
    && value.totalMailJobCount >= 0;
}

export type TemporaryMailOrchestrationPostcheck = {
  targetMailJobCount: number;
  totalMailJobCount: number;
  targetPendingPristine: boolean;
};

export function isTemporaryMailOrchestrationPostcheckReady(
  value: TemporaryMailOrchestrationPostcheck,
  previousTotalMailJobCount: number,
) {
  return value.targetMailJobCount === 1
    && value.totalMailJobCount === previousTotalMailJobCount + 1
    && value.targetPendingPristine;
}
