export const NATIVE_PDF_DELIVERY_STATUSES = [
  "pending",
  "processing",
  "retry",
  "succeeded",
  "failed",
  "manual_review",
] as const;

export type NativePdfDeliveryStatus = typeof NATIVE_PDF_DELIVERY_STATUSES[number];

export type NativePdfDeliveryLeaseState = {
  status: NativePdfDeliveryStatus;
  attemptCount: number;
  maxAttempts: number;
  lockedAt: string | null;
  lockExpiresAt: string | null;
  lockedBy: string | null;
  lastErrorCode: string | null;
  manualReviewReason: string | null;
  pdfStored: boolean;
};

const hasNoLock = (state: NativePdfDeliveryLeaseState) =>
  state.lockedAt === null && state.lockExpiresAt === null && state.lockedBy === null;

const hasCompleteLock = (state: NativePdfDeliveryLeaseState) =>
  state.lockedAt !== null && state.lockExpiresAt !== null && state.lockedBy !== null;

export function canClaimNativePdfDeliveryLease(state: NativePdfDeliveryLeaseState) {
  return (state.status === "pending" || state.status === "retry")
    && state.attemptCount < state.maxAttempts
    && hasNoLock(state)
    && state.manualReviewReason === null
    && !state.pdfStored;
}
export function canReclaimStaleNativePdfDeliveryLease(
  state: NativePdfDeliveryLeaseState,
  now: string,
) {
  return state.status === "processing"
    && state.attemptCount < state.maxAttempts
    && hasCompleteLock(state)
    && Date.parse(state.lockExpiresAt as string) <= Date.parse(now)
    && state.lastErrorCode === null
    && state.manualReviewReason === null
    && !state.pdfStored;
}
