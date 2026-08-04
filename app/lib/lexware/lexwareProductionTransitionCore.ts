export type LexwareTransitionJobStatus =
  | "waiting_for_activation" | "pending" | "processing" | "retry"
  | "succeeded" | "failed" | "manual_review" | "cancelled";

export type LexwareTransitionCreationState =
  | "not_attempted" | "definite_not_created"
  | "definitely_created" | "creation_state_unknown";

export type ExistingLexwareIdentityClassification =
  | "block"
  | "read_back_only"
  | "write_candidate"
  | "expired_lock_write_candidate"
  | "already_succeeded";

export type TransitionClassification =
  | "native_lexware_invoice"
  | "approved_legacy_v2_transition"
  | "blocked";

const EXTERNAL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const validTime = (value: string | null) => value !== null && Number.isFinite(Date.parse(value));

export function classifyExistingLexwareIdentityState(input: {
  status: LexwareTransitionJobStatus;
  creationState: LexwareTransitionCreationState;
  lexwareInvoiceId: string | null;
  lexwareInvoiceNumber?: string | null;
  completedAt?: string | null;
  lockedAt: string | null;
  lockExpiresAt: string | null;
  currentTime: string;
}): ExistingLexwareIdentityClassification {
  if (input.creationState === "creation_state_unknown"
      || input.status === "manual_review"
      || input.status === "cancelled") return "block";

  let expiredProcessingLock = false;
  if (input.status === "processing") {
    if (!validTime(input.lockedAt) || !validTime(input.lockExpiresAt)
        || !Number.isFinite(Date.parse(input.currentTime))
        || Date.parse(input.lockExpiresAt!) <= Date.parse(input.lockedAt!)) return "block";
    if (Date.parse(input.lockExpiresAt!) > Date.parse(input.currentTime)) return "block";
    expiredProcessingLock = true;
  }

  const externalId = input.lexwareInvoiceId?.trim() || null;
  const externalNumber = input.lexwareInvoiceNumber?.trim() || null;
  if (externalNumber && !externalId) return "block";
  if (externalId && !EXTERNAL_ID.test(externalId)) return "block";
  if (input.status === "succeeded") {
    return input.creationState === "definitely_created" && Boolean(externalId) && Boolean(externalNumber)
      && Boolean(input.completedAt && Number.isFinite(Date.parse(input.completedAt)))
      ? "already_succeeded"
      : "block";
  }
  if (externalId) return "read_back_only";
  if (expiredProcessingLock) {
    return input.creationState === "not_attempted" || input.creationState === "definite_not_created"
      ? "expired_lock_write_candidate"
      : "block";
  }
  return "write_candidate";
}

export function canOfferLexwareJobForAtomicWriteClaim(input: {
  identityClassification: ExistingLexwareIdentityClassification;
  status: LexwareTransitionJobStatus;
  creationState: LexwareTransitionCreationState;
  canAttemptExternalWrite(
    status: LexwareTransitionJobStatus,
    creationState: LexwareTransitionCreationState,
  ): boolean;
}) {
  if (input.identityClassification === "expired_lock_write_candidate") return true;
  return input.identityClassification === "write_candidate"
    && input.canAttemptExternalWrite(input.status, input.creationState);
}

export function classifyLexwareInvoiceTransition(input: {
  invoiceProvider: string | null;
  taxSnapshotStatus: string | null;
  taxSnapshotVersion: string | null;
  invoiceId: string;
  requestId: string;
  job?: {
    localInvoiceId: string | null;
    requestId: string;
    triggerSource: string;
    targetOrganizationId: string;
    payloadHashMatches: boolean;
  } | null;
}): TransitionClassification {
  const snapshotComplete = input.taxSnapshotStatus === "complete"
    && input.taxSnapshotVersion === "invoice-tax-snapshot-v2";
  if (!snapshotComplete) return "blocked";
  if (input.invoiceProvider === "lexware") return "native_lexware_invoice";
  const job = input.job;
  if (input.invoiceProvider === "legacy_internal"
      && job?.triggerSource === "admin_manual_enqueue"
      && job.localInvoiceId === input.invoiceId
      && job.requestId === input.requestId
      && Boolean(job.targetOrganizationId)
      && job.payloadHashMatches) {
    return "approved_legacy_v2_transition";
  }
  return "blocked";
}
