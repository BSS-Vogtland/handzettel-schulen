export const LEXWARE_ISSUE_PERMIT_CONFIRMATION = "ISSUE_SINGLE_LEXWARE_PRODUCTION_PERMIT" as const;
export const LEXWARE_ACTIVATE_JOB_CONFIRMATION = "ACTIVATE_SINGLE_LEXWARE_JOB" as const;
export const LEXWARE_CLAIM_JOB_CONFIRMATION = "CLAIM_SINGLE_LEXWARE_JOB" as const;
export const LEXWARE_EXPIRE_PERMIT_CONFIRMATION = "EXPIRE_SINGLE_LEXWARE_PRODUCTION_PERMIT" as const;
export const LEXWARE_REISSUE_PERMIT_CONFIRMATION = "REISSUE_SINGLE_LEXWARE_PRODUCTION_PERMIT" as const;

export type LexwareProductionWritePermitState =
  | "issued" | "activated" | "claimed" | "consumed"
  | "cancelled" | "expired" | "manual_review";

export type LexwareProductionWritePermitSnapshot = {
  id: string;
  invoiceId: string;
  requestId: string;
  jobId: string;
  targetOrganizationId: string;
  payloadHashVersion: string;
  payloadSha256: string;
  state: LexwareProductionWritePermitState;
  expiresAt: string;
  claimId: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const STATES = new Set<LexwareProductionWritePermitState>([
  "issued", "activated", "claimed", "consumed", "cancelled", "expired", "manual_review",
]);
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: Record<string, unknown>, key: string) => typeof value[key] === "string" ? value[key] as string : null;

export function parseLexwareProductionWritePermit(value: unknown): LexwareProductionWritePermitSnapshot {
  const row = record(value);
  if (!row) throw new Error("LEXWARE_PRODUCTION_PERMIT_RESULT_INVALID");
  const id = text(row, "id") ?? text(row, "permit_id");
  const invoiceId = text(row, "invoice_id");
  const requestId = text(row, "request_id");
  const jobId = text(row, "job_id");
  const targetOrganizationId = text(row, "target_organization_id");
  const payloadHashVersion = text(row, "payload_hash_version");
  const payloadSha256 = text(row, "payload_sha256");
  const state = text(row, "permit_state");
  const expiresAt = text(row, "expires_at");
  const claimId = row.claim_id === null ? null : text(row, "claim_id");
  if (!id || !UUID.test(id) || !invoiceId || !UUID.test(invoiceId)
      || !requestId || !UUID.test(requestId) || !jobId || !UUID.test(jobId)
      || !targetOrganizationId || !UUID.test(targetOrganizationId)
      || payloadHashVersion !== "lexware-payload-canonical-v2"
      || !payloadSha256 || !HASH.test(payloadSha256)
      || !state || !STATES.has(state as LexwareProductionWritePermitState)
      || !expiresAt || !Number.isFinite(Date.parse(expiresAt))
      || (claimId !== null && !UUID.test(claimId))) {
    throw new Error("LEXWARE_PRODUCTION_PERMIT_RESULT_INVALID");
  }
  return {
    id, invoiceId, requestId, jobId, targetOrganizationId, payloadHashVersion,
    payloadSha256, state: state as LexwareProductionWritePermitState, expiresAt, claimId,
  };
}
export function evaluateObjectScopedPermitReadiness(input: {
  permit: LexwareProductionWritePermitSnapshot | null;
  expiredPermit?: LexwareProductionWritePermitSnapshot | null;
  invoiceId: string;
  requestId: string;
  jobId: string;
  targetOrganizationId: string;
  payloadHashVersion: string;
  payloadSha256: string;
  jobStatus: string;
  attemptCount: number;
  technicalPreviewReady: boolean;
  now: string;
}) {
  const permitExists = input.permit !== null;
  const activePermitExists = permitExists;
  const permitNotExpired = Boolean(input.permit && Date.parse(input.permit.expiresAt) > Date.parse(input.now));
  const permitIdentityMatches = Boolean(input.permit
    && input.permit.invoiceId === input.invoiceId
    && input.permit.requestId === input.requestId
    && input.permit.jobId === input.jobId);
  const permitHashMatches = Boolean(input.permit
    && input.permit.payloadHashVersion === input.payloadHashVersion
    && input.permit.payloadSha256 === input.payloadSha256);
  const permitOrganizationMatches = Boolean(input.permit
    && input.permit.targetOrganizationId.toLowerCase() === input.targetOrganizationId.toLowerCase());
  const common = permitExists && permitNotExpired && permitIdentityMatches
    && permitHashMatches && permitOrganizationMatches;
  const expiredPermitExists = Boolean(input.expiredPermit);
  const expiredPermitIdentityMatches = Boolean(input.expiredPermit
    && input.expiredPermit.invoiceId === input.invoiceId
    && input.expiredPermit.requestId === input.requestId
    && input.expiredPermit.jobId === input.jobId
    && input.expiredPermit.payloadHashVersion === input.payloadHashVersion
    && input.expiredPermit.payloadSha256 === input.payloadSha256
    && input.expiredPermit.targetOrganizationId.toLowerCase() === input.targetOrganizationId.toLowerCase());
  const permitReissueReady = !activePermitExists && expiredPermitExists && expiredPermitIdentityMatches
    && input.technicalPreviewReady && input.jobStatus === "pending" && input.attemptCount === 0;
  return {
    permitExists,
    activePermitExists,
    currentPermitState: input.permit?.state ?? input.expiredPermit?.state ?? null,
    permitState: input.permit?.state ?? null,
    expiredPermitExists,
    expiredPermitIdentityMatches,
    permitReissueReady,
    permitNotExpired,
    permitIdentityMatches,
    permitHashMatches,
    permitOrganizationMatches,
    objectScopedActivationReady: input.technicalPreviewReady && (
      !permitExists || (common && input.permit?.state === "issued")
    ) && input.jobStatus === "waiting_for_activation" && input.attemptCount === 0,
    objectScopedClaimReady: common && input.permit?.state === "activated"
      && input.jobStatus === "pending" && input.attemptCount === 0,
  };
}
