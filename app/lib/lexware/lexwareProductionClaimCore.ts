const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const STATUSES = new Set(["waiting_for_activation", "pending", "processing", "retry", "succeeded", "failed", "manual_review", "cancelled"]);
const CREATION_STATES = new Set(["not_attempted", "definite_not_created", "definitely_created", "creation_state_unknown"]);

export type LexwarePayloadHashVersion =
  | "lexware-payload-json-v1"
  | "lexware-payload-canonical-v2";
export type LexwareClaimCreationState =
  | "not_attempted" | "definite_not_created"
  | "definitely_created" | "creation_state_unknown";
export type LexwareClaimJobStatus =
  | "waiting_for_activation" | "pending" | "processing" | "retry"
  | "succeeded" | "failed" | "manual_review" | "cancelled";

export type LexwareProductionClaim = {
  invoiceJobId: string; claimAcquired: true; readBackOnly: boolean;
  previousStatus: LexwareClaimJobStatus; jobStatus: "processing"; creationState: LexwareClaimCreationState;
  attemptCount: number; lockedAt: string; lockExpiresAt: string;
  payloadSha256: string; targetOrganizationId: string; localInvoiceId: string;
  payload_hash_version: LexwarePayloadHashVersion;
  requestId: string; lexwareInvoiceId: string | null; lexwareInvoiceNumber: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isLexwarePayloadHashVersion(value: unknown): value is LexwarePayloadHashVersion {
  return value === "lexware-payload-json-v1"
    || value === "lexware-payload-canonical-v2";
}
function isCreationState(value: unknown): value is LexwareClaimCreationState {
  return typeof value === "string" && CREATION_STATES.has(value);
}
function isJobStatus(value: unknown): value is LexwareClaimJobStatus {
  return typeof value === "string" && STATUSES.has(value);
}
const text = (row: Record<string, unknown>, key: string) => typeof row[key] === "string" ? row[key] : null;

export function parseLexwareProductionClaim(value: unknown): LexwareProductionClaim {
  if (!isRecord(value)) throw new Error("INVOICE_JOB_CLAIM_RESULT_INVALID");
  const invoiceJobId = text(value, "invoice_job_id");
  const claimAcquired = value.claim_acquired;
  const readBackOnly = value.read_back_only;
  const previousStatus = text(value, "previous_status");
  const jobStatus = text(value, "job_status");
  const creationState = text(value, "creation_state");
  const attemptCount = value.attempt_count;
  const lockedAt = text(value, "locked_at");
  const lockExpiresAt = text(value, "lock_expires_at");
  const payloadSha256 = text(value, "payload_sha256");
  const payloadHashVersion = value.payload_hash_version;
  const targetOrganizationId = text(value, "target_organization_id");
  const localInvoiceId = text(value, "local_invoice_id");
  const requestId = text(value, "request_id");
  const lexwareInvoiceId = value.lexware_invoice_id;
  const lexwareInvoiceNumber = value.lexware_invoice_number;
  if (!invoiceJobId || !UUID.test(invoiceJobId) || claimAcquired !== true
    || typeof readBackOnly !== "boolean" || !isJobStatus(previousStatus)
    || jobStatus !== "processing" || !isCreationState(creationState)
    || typeof attemptCount !== "number" || !Number.isInteger(attemptCount) || attemptCount < 1
    || !lockedAt || !Number.isFinite(Date.parse(lockedAt))
    || !lockExpiresAt || !Number.isFinite(Date.parse(lockExpiresAt))
    || !payloadSha256 || !HASH.test(payloadSha256)
    || !isLexwarePayloadHashVersion(payloadHashVersion)
    || !targetOrganizationId || !UUID.test(targetOrganizationId)
    || !localInvoiceId || !UUID.test(localInvoiceId)
    || !requestId || !UUID.test(requestId)
    || (lexwareInvoiceId !== null && typeof lexwareInvoiceId !== "string")
    || (lexwareInvoiceNumber !== null && typeof lexwareInvoiceNumber !== "string")) {
    throw new Error("INVOICE_JOB_CLAIM_RESULT_INVALID");
  }
  return {
    invoiceJobId, claimAcquired, readBackOnly, previousStatus, jobStatus,
    creationState, attemptCount, lockedAt, lockExpiresAt, payloadSha256,
    payload_hash_version: payloadHashVersion,
    targetOrganizationId, localInvoiceId, requestId, lexwareInvoiceId,
    lexwareInvoiceNumber,
  };
}
