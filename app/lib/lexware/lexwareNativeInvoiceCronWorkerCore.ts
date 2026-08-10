export const NATIVE_INVOICE_CRON_BATCH_SIZE = 1 as const;

export type NativeInvoiceCronCandidate = {
  local_invoice_id: string;
  status: string;
  creation_state: string;
  attempt_count: number;
  max_attempts: number;
  locked_by: string | null;
  locked_at: string | null;
  lock_expires_at: string | null;
  external_write_started_at: string | null;
  external_write_completed_at: string | null;
  lexware_invoice_id: string | null;
  lexware_invoice_number: string | null;
};

export type NativeInvoiceCronProcessResult = {
  ok: boolean;
  status: number;
  code: string;
  outcome: string | null;
  postCount: number;
  reasons: string[];
};

type WorkerDependencies = {
  now: () => number;
  loadCandidates: () => Promise<NativeInvoiceCronCandidate[]>;
  processInvoice: (invoiceId: string) => Promise<NativeInvoiceCronProcessResult>;
};

export type NativeInvoiceCronWorkerResult = {
  ok: boolean;
  status: number;
  code: "NATIVE_INVOICE_CRON_NOOP" | "NATIVE_INVOICE_CRON_PROCESSED" | "NATIVE_INVOICE_CRON_BLOCKED";
  processedCount: 0 | 1;
  postCount: number;
  processorCode: string | null;
  processorOutcome: string | null;
};

const noLock = (candidate: NativeInvoiceCronCandidate) => candidate.locked_by === null
  && candidate.locked_at === null && candidate.lock_expires_at === null;

export function isNativeInvoiceCronCandidate(candidate: NativeInvoiceCronCandidate, now: number): boolean {
  if (!candidate.local_invoice_id || candidate.attempt_count >= candidate.max_attempts
      || candidate.external_write_started_at !== null || candidate.external_write_completed_at !== null
      || candidate.lexware_invoice_id !== null || candidate.lexware_invoice_number !== null) return false;
  if (candidate.status === "pending") return candidate.creation_state === "not_attempted" && noLock(candidate);
  if (candidate.status === "retry") return candidate.creation_state === "definite_not_created" && noLock(candidate);
  return candidate.status === "processing"
    && (candidate.creation_state === "not_attempted" || candidate.creation_state === "definite_not_created")
    && typeof candidate.locked_by === "string" && candidate.locked_by.length > 0
    && typeof candidate.locked_at === "string" && Number.isFinite(Date.parse(candidate.locked_at))
    && typeof candidate.lock_expires_at === "string" && Date.parse(candidate.lock_expires_at) <= now;
}

export async function runNativeInvoiceCronWorker(deps: WorkerDependencies): Promise<NativeInvoiceCronWorkerResult> {
  const candidate = (await deps.loadCandidates()).find((value) => isNativeInvoiceCronCandidate(value, deps.now()));
  if (!candidate) return {
    ok: true, status: 200, code: "NATIVE_INVOICE_CRON_NOOP", processedCount: 0,
    postCount: 0, processorCode: null, processorOutcome: null,
  };
  const result = await deps.processInvoice(candidate.local_invoice_id);
  return {
    ok: result.ok,
    status: result.status,
    code: result.ok ? "NATIVE_INVOICE_CRON_PROCESSED" : "NATIVE_INVOICE_CRON_BLOCKED",
    processedCount: NATIVE_INVOICE_CRON_BATCH_SIZE,
    postCount: result.postCount,
    processorCode: result.code,
    processorOutcome: result.outcome,
  };
}
