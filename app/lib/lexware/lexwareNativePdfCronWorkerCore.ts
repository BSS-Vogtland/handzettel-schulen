export const NATIVE_PDF_CRON_BATCH_SIZE = 1 as const;

export type NativePdfCronCandidate = {
  id: string;
  local_invoice_id: string;
  request_id: string;
  invoice_job_id: string;
  target_organization_id: string;
  external_invoice_id: string;
  payload_sha256: string;
  payload_hash_version: string;
  status: "pending" | "processing" | "retry" | "succeeded" | "failed" | "manual_review";
  attempt_count: number;
  max_attempts: number;
  locked_at: string | null;
  lock_expires_at: string | null;
  locked_by: string | null;
  last_error_code: string | null;
  manual_review_reason: string | null;
  pdf_stored: boolean;
};

export type ClaimedNativePdfCronCandidate = NativePdfCronCandidate & {
  status: "processing";
  locked_at: string;
  lock_expires_at: string;
  locked_by: string;
};

type WorkerDependencies = {
  now: () => number;
  loadCandidates: () => Promise<NativePdfCronCandidate[]>;
  acquireLease: (candidate: NativePdfCronCandidate) => Promise<ClaimedNativePdfCronCandidate | null>;
  preparePdf: (
    invoiceId: string,
    lifecycle: { onProviderGetStarted: () => void },
  ) => Promise<{ providerGetCount: number }>;
  completeLease: (candidate: ClaimedNativePdfCronCandidate) => Promise<void>;
  recordFailure: (
    candidate: ClaimedNativePdfCronCandidate,
    errorCode: string,
    ambiguous: boolean,
  ) => Promise<void>;
};

export type NativePdfCronWorkerResult = {
  ok: boolean;
  status: number;
  code: "NATIVE_PDF_CRON_NOOP" | "NATIVE_PDF_CRON_PROCESSED" | "NATIVE_PDF_CRON_BLOCKED";
  processedCount: 0 | 1;
  providerGetCount: number;
  outcome: "succeeded" | "retry" | "manual_review" | null;
};

const hasNoLock = (candidate: NativePdfCronCandidate) => candidate.locked_at === null
  && candidate.lock_expires_at === null && candidate.locked_by === null;

const hasCompleteLock = (candidate: NativePdfCronCandidate) => Boolean(candidate.locked_at)
  && Boolean(candidate.lock_expires_at) && Boolean(candidate.locked_by);

export function isNativePdfCronCandidate(candidate: NativePdfCronCandidate, now: number) {
  if (candidate.pdf_stored || candidate.attempt_count >= candidate.max_attempts
      || candidate.manual_review_reason !== null) return false;
  if (candidate.status === "pending" || candidate.status === "retry") return hasNoLock(candidate);
  return candidate.status === "processing" && candidate.last_error_code === null
    && hasCompleteLock(candidate) && Number.isFinite(Date.parse(candidate.lock_expires_at as string))
    && Date.parse(candidate.lock_expires_at as string) <= now;
}

const safeErrorCode = (error: unknown) => {
  const message = error instanceof Error ? error.message : "NATIVE_PDF_CRON_UNKNOWN_FAILURE";
  return /^[A-Z0-9_]{1,120}$/.test(message) ? message : "NATIVE_PDF_CRON_OPERATION_FAILED";
};

export async function runNativePdfCronWorker(deps: WorkerDependencies): Promise<NativePdfCronWorkerResult> {
  const candidate = (await deps.loadCandidates()).find((value) => isNativePdfCronCandidate(value, deps.now()));
  if (!candidate) return {
    ok: true, status: 200, code: "NATIVE_PDF_CRON_NOOP", processedCount: 0,
    providerGetCount: 0, outcome: null,
  };

  const claimed = await deps.acquireLease(candidate);
  if (!claimed) return {
    ok: true, status: 200, code: "NATIVE_PDF_CRON_NOOP", processedCount: 0,
    providerGetCount: 0, outcome: null,
  };

  let providerGetStarted = false;
  try {
    const prepared = await deps.preparePdf(claimed.local_invoice_id, {
      onProviderGetStarted: () => { providerGetStarted = true; },
    });
    await deps.completeLease(claimed);
    return {
      ok: true, status: 200, code: "NATIVE_PDF_CRON_PROCESSED", processedCount: NATIVE_PDF_CRON_BATCH_SIZE,
      providerGetCount: prepared.providerGetCount, outcome: "succeeded",
    };
  } catch (error) {
    const errorCode = safeErrorCode(error);
    try {
      await deps.recordFailure(claimed, errorCode, providerGetStarted);
    } catch {
      return {
        ok: false, status: 409, code: "NATIVE_PDF_CRON_BLOCKED", processedCount: NATIVE_PDF_CRON_BATCH_SIZE,
        providerGetCount: providerGetStarted ? 1 : 0, outcome: providerGetStarted ? "manual_review" : "retry",
      };
    }
    return {
      ok: false, status: 409, code: "NATIVE_PDF_CRON_BLOCKED", processedCount: NATIVE_PDF_CRON_BATCH_SIZE,
      providerGetCount: providerGetStarted ? 1 : 0, outcome: providerGetStarted ? "manual_review" : "retry",
    };
  }
}
