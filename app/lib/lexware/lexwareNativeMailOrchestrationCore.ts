export const NATIVE_MAIL_ORCHESTRATION_BATCH_SIZE = 1 as const;

export type NativeMailOrchestrationCandidate = {
  invoiceId: string;
  readiness: "ready" | "missing_pdf" | "invalid_binding";
  mailJob: null | {
    id: string;
    status: string;
    deliveryState: string;
    attemptCount: number;
    bindingValid: boolean;
    pristine: boolean;
  };
};

type Dependencies = {
  automaticMailEnabled: () => Promise<boolean>;
  loadCandidates: () => Promise<NativeMailOrchestrationCandidate[]>;
  enqueueAndActivate: (invoiceId: string) => Promise<void>;
  activate: (invoiceId: string, mailJobId: string) => Promise<void>;
};

export type NativeMailOrchestrationResult = {
  ok: boolean;
  status: number;
  code: "NATIVE_MAIL_ORCHESTRATION_NOOP" | "NATIVE_MAIL_ORCHESTRATION_PROCESSED" | "NATIVE_MAIL_ORCHESTRATION_BLOCKED";
  processedCount: 0 | 1;
  enqueueCount: 0 | 1;
  activationCount: 0 | 1;
  outcome: "enqueued_and_activated" | "activated" | "blocked" | null;
};

const ignoredMailStatus = (status: string) => [
  "pending", "processing", "retry", "sent", "failed", "manual_review", "cancelled",
].includes(status);

export function classifyNativeMailOrchestrationCandidate(candidate: NativeMailOrchestrationCandidate) {
  if (candidate.mailJob && ignoredMailStatus(candidate.mailJob.status)) return "ignore" as const;
  if (candidate.readiness === "missing_pdf") return "ignore" as const;
  if (candidate.readiness === "invalid_binding") return "block" as const;
  if (!candidate.mailJob) return "enqueue_and_activate" as const;
  if (candidate.mailJob.status !== "waiting_for_activation"
      || candidate.mailJob.deliveryState !== "not_attempted"
      || candidate.mailJob.attemptCount !== 0
      || !candidate.mailJob.bindingValid || !candidate.mailJob.pristine) return "block" as const;
  return "activate" as const;
}

const noop = (): NativeMailOrchestrationResult => ({
  ok: true, status: 200, code: "NATIVE_MAIL_ORCHESTRATION_NOOP", processedCount: 0,
  enqueueCount: 0, activationCount: 0, outcome: null,
});

export async function runNativeMailOrchestrationWorker(deps: Dependencies): Promise<NativeMailOrchestrationResult> {
  if (!await deps.automaticMailEnabled()) return noop();
  for (const candidate of await deps.loadCandidates()) {
    const action = classifyNativeMailOrchestrationCandidate(candidate);
    if (action === "ignore") continue;
    if (action === "block") return {
      ok: false, status: 409, code: "NATIVE_MAIL_ORCHESTRATION_BLOCKED", processedCount: 0,
      enqueueCount: 0, activationCount: 0, outcome: "blocked",
    };
    try {
      if (action === "enqueue_and_activate") {
        await deps.enqueueAndActivate(candidate.invoiceId);
        return {
          ok: true, status: 200, code: "NATIVE_MAIL_ORCHESTRATION_PROCESSED",
          processedCount: NATIVE_MAIL_ORCHESTRATION_BATCH_SIZE, enqueueCount: 1, activationCount: 1,
          outcome: "enqueued_and_activated",
        };
      }
      await deps.activate(candidate.invoiceId, candidate.mailJob!.id);
      return {
        ok: true, status: 200, code: "NATIVE_MAIL_ORCHESTRATION_PROCESSED",
        processedCount: NATIVE_MAIL_ORCHESTRATION_BATCH_SIZE, enqueueCount: 0, activationCount: 1,
        outcome: "activated",
      };
    } catch {
      return {
        ok: false, status: 409, code: "NATIVE_MAIL_ORCHESTRATION_BLOCKED", processedCount: 0,
        enqueueCount: 0, activationCount: 0, outcome: "blocked",
      };
    }
  }
  return noop();
}
