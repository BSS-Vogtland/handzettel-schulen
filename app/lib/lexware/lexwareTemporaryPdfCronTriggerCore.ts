export const TEMPORARY_PDF_CRON_TARGET_INVOICE_ID = "620dd116-2d99-4884-9425-6beac914912f";
export const TEMPORARY_PDF_CRON_CONFIRMATION = "TRIGGER_SINGLE_NATIVE_LEXWARE_PDF_CRON_TEST";

export type TemporaryPdfCronPrecheck = {
  selectedInvoiceId: string | null;
  eligibleExistingLeaseInvoiceId: string | null;
  targetInvoiceFinalized: boolean;
  targetJobSucceeded: boolean;
  targetPdfMetadataEmpty: boolean;
  targetStorageObjectCount: number;
  targetLeaseCount: number;
  targetErrorReviewMarkersAbsent: boolean;
};

export function isTemporaryPdfCronTargetReady(
  value: TemporaryPdfCronPrecheck,
  targetInvoiceId = TEMPORARY_PDF_CRON_TARGET_INVOICE_ID,
) {
  return value.selectedInvoiceId === targetInvoiceId
    && value.eligibleExistingLeaseInvoiceId === null
    && value.targetInvoiceFinalized
    && value.targetJobSucceeded
    && value.targetPdfMetadataEmpty
    && value.targetStorageObjectCount === 0
    && value.targetLeaseCount === 0
    && value.targetErrorReviewMarkersAbsent;
}
