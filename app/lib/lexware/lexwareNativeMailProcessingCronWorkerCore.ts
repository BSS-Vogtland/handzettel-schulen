export const NATIVE_MAIL_PROCESSING_CRON_BATCH_SIZE = 1 as const;

export type NativeMailProcessingCronCandidate = {
  localInvoiceId: string;
  status: string;
  deliveryState: string;
  attemptCount: number;
  maxAttempts: number;
  lockedAt: string | null;
  lockExpiresAt: string | null;
  lockedBy: string | null;
  transportMessageId: string | null;
  smtpAttemptStartedAt: string | null;
  smtpAttemptCompletedAt: string | null;
  sentAt: string | null;
  manualReviewReason: string | null;
  bindingValid: boolean;
};

export type NativeMailProcessingResult = {
  outcome: "sent" | "definite_not_sent" | "ambiguous_send" | "already_sent" | "manual_review";
  smtpCalls: number;
};

type Dependencies = {
  automaticMailEnabled: () => Promise<boolean>;
  loadCandidates: () => Promise<NativeMailProcessingCronCandidate[]>;
  processMail: (invoiceId: string) => Promise<NativeMailProcessingResult>;
};

export type NativeMailProcessingCronResult = {
  ok: boolean;
  status: number;
  code: "NATIVE_MAIL_PROCESS_CRON_NOOP" | "NATIVE_MAIL_PROCESS_CRON_PROCESSED" | "NATIVE_MAIL_PROCESS_CRON_BLOCKED";
  processedCount: 0 | 1;
  smtpAttemptCount: number;
  outcome: "sent" | "retry" | "manual_review" | "blocked" | null;
};

const hasNoLock = (candidate: NativeMailProcessingCronCandidate) => candidate.lockedAt === null
  && candidate.lockExpiresAt === null && candidate.lockedBy === null;

const hasNoDispatchMarker = (candidate: NativeMailProcessingCronCandidate) => candidate.transportMessageId === null
  && candidate.smtpAttemptStartedAt === null && candidate.smtpAttemptCompletedAt === null
  && candidate.sentAt === null;

export function isNativeMailProcessingCronCandidate(candidate: NativeMailProcessingCronCandidate) {
  if (!candidate.localInvoiceId || !candidate.bindingValid || candidate.attemptCount >= candidate.maxAttempts
      || candidate.manualReviewReason !== null || !hasNoLock(candidate) || !hasNoDispatchMarker(candidate)) return false;
  if (candidate.status === "pending") return candidate.deliveryState === "not_attempted";
  return candidate.status === "retry" && candidate.deliveryState === "definitely_not_sent";
}

const noop = (): NativeMailProcessingCronResult => ({
  ok: true, status: 200, code: "NATIVE_MAIL_PROCESS_CRON_NOOP", processedCount: 0,
  smtpAttemptCount: 0, outcome: null,
});

export async function runNativeMailProcessingCronWorker(
  deps: Dependencies,
): Promise<NativeMailProcessingCronResult> {
  if (!await deps.automaticMailEnabled()) return noop();
  const candidate = (await deps.loadCandidates()).find(isNativeMailProcessingCronCandidate);
  if (!candidate) return noop();
  try {
    const result = await deps.processMail(candidate.localInvoiceId);
    if (result.outcome === "sent") return {
      ok: true, status: 200, code: "NATIVE_MAIL_PROCESS_CRON_PROCESSED",
      processedCount: NATIVE_MAIL_PROCESSING_CRON_BATCH_SIZE,
      smtpAttemptCount: result.smtpCalls, outcome: "sent",
    };
    if (result.outcome === "definite_not_sent") return {
      ok: false, status: 409, code: "NATIVE_MAIL_PROCESS_CRON_BLOCKED",
      processedCount: NATIVE_MAIL_PROCESSING_CRON_BATCH_SIZE,
      smtpAttemptCount: 0, outcome: "retry",
    };
    if (result.outcome === "ambiguous_send") return {
      ok: false, status: 409, code: "NATIVE_MAIL_PROCESS_CRON_BLOCKED",
      processedCount: NATIVE_MAIL_PROCESSING_CRON_BATCH_SIZE,
      smtpAttemptCount: result.smtpCalls, outcome: "manual_review",
    };
    return {
      ok: false, status: 409, code: "NATIVE_MAIL_PROCESS_CRON_BLOCKED",
      processedCount: 0, smtpAttemptCount: 0, outcome: "blocked",
    };
  } catch {
    return {
      ok: false, status: 409, code: "NATIVE_MAIL_PROCESS_CRON_BLOCKED",
      processedCount: 0, smtpAttemptCount: 0, outcome: "blocked",
    };
  }
}
