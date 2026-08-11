export const TEMPORARY_MAIL_PROCESS_TARGET_INVOICE_ID =
  "620dd116-2d99-4884-9425-6beac914912f";
export const TEMPORARY_MAIL_PROCESS_CONFIRMATION =
  "TRIGGER_SINGLE_NATIVE_LEXWARE_MAIL_PROCESS_TEST";

export type TemporaryMailProcessPrecheck = {
  automaticMailEnabled: boolean;
  targetMailJobCount: number;
  targetCandidateReady: boolean;
  selectedInvoiceId: string | null;
  privatePdfReady: boolean;
  smtpConfigurationReady: boolean;
};

export function isTemporaryMailProcessPrecheckReady(value: TemporaryMailProcessPrecheck) {
  return value.automaticMailEnabled
    && value.targetMailJobCount === 1
    && value.targetCandidateReady
    && value.selectedInvoiceId === TEMPORARY_MAIL_PROCESS_TARGET_INVOICE_ID
    && value.privatePdfReady
    && value.smtpConfigurationReady;
}

export type TemporaryMailProcessPostcheck = {
  targetMailJobCount: number;
  successConfirmed: boolean;
  ambiguousConfirmed: boolean;
};

export function isTemporaryMailProcessSuccessPostcheck(value: TemporaryMailProcessPostcheck) {
  return value.targetMailJobCount === 1 && value.successConfirmed && !value.ambiguousConfirmed;
}

export function isTemporaryMailProcessAmbiguousPostcheck(value: TemporaryMailProcessPostcheck) {
  return value.targetMailJobCount === 1 && !value.successConfirmed && value.ambiguousConfirmed;
}
