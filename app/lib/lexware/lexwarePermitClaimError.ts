export const LEXWARE_PERMIT_CLAIM_BLOCK_REASONS = [
  "PERMIT_CLAIM_NOT_FOUND",
  "PERMIT_CLAIM_NOT_READY",
  "PERMIT_CLAIM_JOB_STATE_INVALID",
  "PERMIT_CLAIM_RESULT_MISMATCH",
  "LOCAL_INVOICE_ID_REQUIRED",
  "PAYLOAD_SHA256_INVALID",
  "PAYLOAD_HASH_VERSION_INVALID",
  "TARGET_ORGANIZATION_INVALID",
  "LOCKED_BY_REQUIRED",
  "LOCK_DURATION_INVALID",
  "LOCAL_INVOICE_NOT_FOUND",
  "INVOICE_JOB_IDENTITY_CONFLICT",
  "INVOICE_JOB_NOT_FOUND",
  "INVOICE_JOB_LINK_MISMATCH",
  "REQUEST_ID_MISMATCH",
  "PAYLOAD_HASH_VERSION_MISMATCH",
  "PAYLOAD_SHA256_MISMATCH",
  "TARGET_ORGANIZATION_MISMATCH",
  "JOB_STATUS_BLOCKED",
  "CREATION_STATE_UNKNOWN",
  "PROCESSING_LOCK_INVALID",
  "ACTIVE_LOCK",
  "LEXWARE_PERMIT_CLAIM_FAILED",
  "LEXWARE_PERMIT_CLAIM_RESULT_INVALID",
  "INVOICE_JOB_CLAIM_RESULT_INVALID",
] as const;

export type LexwarePermitClaimBlockReason =
  (typeof LEXWARE_PERMIT_CLAIM_BLOCK_REASONS)[number] | "UNKNOWN";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readExactMessage(error: unknown) {
  if (error instanceof Error) return error.message.trim();
  if (!isRecord(error) || typeof error.message !== "string") return null;
  return error.message.trim();
}

export function classifyLexwarePermitClaimError(
  error: unknown,
): LexwarePermitClaimBlockReason {
  const message = readExactMessage(error);
  if (!message) return "UNKNOWN";
  return LEXWARE_PERMIT_CLAIM_BLOCK_REASONS.find((reason) => reason === message)
    ?? "UNKNOWN";
}
