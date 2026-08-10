export const TEMPORARY_MAIL_ORCHESTRATION_CONFIRMATION =
  "TRIGGER_SINGLE_NATIVE_LEXWARE_MAIL_ORCHESTRATION_TEST";

export type TemporaryMailOrchestrationPrecheck = {
  automaticMailDisabled: boolean;
  readyNativeInvoiceCount: number;
  mutableMailJobCount: number;
  totalMailJobCount: number;
};

export function isTemporaryMailOrchestrationPrecheckReady(
  value: TemporaryMailOrchestrationPrecheck,
) {
  return value.automaticMailDisabled
    && value.readyNativeInvoiceCount >= 1
    && value.mutableMailJobCount === 0
    && Number.isInteger(value.totalMailJobCount)
    && value.totalMailJobCount >= 0;
}
