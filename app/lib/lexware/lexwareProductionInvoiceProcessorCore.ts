import type {
  ExistingLexwareIdentityClassification,
  TransitionClassification,
} from "./lexwareProductionTransitionCore";

export type LexwareInvoiceJobStatus =
  | "waiting_for_activation" | "pending" | "processing" | "retry"
  | "succeeded" | "failed" | "manual_review" | "cancelled";
export type LexwareInvoiceCreationState =
  | "not_attempted" | "definite_not_created"
  | "definitely_created" | "creation_state_unknown";
export type LexwareProductionGateResult = {
  allowed: boolean;
  checks: Record<string, boolean>;
  failedChecks: string[];
};
export type LexwareInvoiceReadModel = {
  id: string;
  voucherStatus: string | null;
  voucherNumber?: string | null;
  organizationId: string;
  lineItems: unknown[];
  paymentTermLabel: string | null;
  totalPrice: {
    currency: string | null;
    totalNetAmount: number | null;
    totalGrossAmount: number | null;
    totalTaxAmount: number | null;
  };
  taxAmounts: Array<{
    taxRatePercentage: number | null;
    taxAmount: number | null;
    netAmount: number | null;
  }>;
};
export type LexwareInvoicePayloadBuildResult<TLineItem = unknown> = {
  payload: {
    lineItems: TLineItem[];
    paymentConditions: { paymentTermLabel: string };
  };
  expected: {
    totalGrossAmount: number;
    totalNetAmount: number;
    totalTaxAmount: number;
    taxRates: Array<{
      taxRatePercentage: number;
      grossAmount: number;
      netAmount: number;
      taxAmount: number;
    }>;
  };
};
type LexwareInvoicePayloadValidationResult = { valid: boolean };
export type LexwareProductionCreateResult = {
  id: string;
  resourceUri: string;
  createdDate: string;
  updatedDate: string | null;
  version: number | null;
  requestCount: 1;
  finalize: true;
  creationState: "definitely_created";
};

export type ProductionInvoiceRecord = {
  id: string;
  request_id?: string;
  invoice_provider: string;
  tax_snapshot_version: string;
  tax_snapshot_status: string;
};
export type ProductionInvoiceJob = {
  id: string;
  status: LexwareInvoiceJobStatus;
  creation_state: LexwareInvoiceCreationState;
  payload_sha256: string | null;
  payload_hash_version: "lexware-payload-json-v1" | "lexware-payload-canonical-v2" | null;
  attempt_count: number;
  lexware_invoice_id: string | null;
  locked_at?: string | null;
  locked_by?: string | null;
  lock_expires_at: string | null;
  local_invoice_id?: string | null;
  request_id?: string;
  trigger_source?: string;
  target_organization_id?: string;
  lexware_invoice_number?: string | null;
  completed_at?: string | null;
};
export type JobTransition = Partial<ProductionInvoiceJob> & {
  status: LexwareInvoiceJobStatus;
  creation_state: LexwareInvoiceCreationState;
  external_write_started_at?: string;
  external_write_completed_at?: string;
  completed_at?: string;
  last_error_code?: string;
  lexware_resource_uri?: string;
  lexware_created_date?: string;
  lexware_invoice_number?: string;
  lexware_voucher_status?: string;
  last_external_http_status?: number;
  last_external_retry_after_seconds?: number;
};
export type ProcessorDependencies<TLineItem = unknown> = {
  classifyIdentity(input: {
    status: LexwareInvoiceJobStatus;
    creationState: LexwareInvoiceCreationState;
    lexwareInvoiceId: string | null;
    lexwareInvoiceNumber?: string | null;
    completedAt?: string | null;
    lockedAt: string | null;
    lockExpiresAt: string | null;
    currentTime: string;
  }): ExistingLexwareIdentityClassification;
  canOfferForAtomicWriteClaim(input: {
    identityClassification: ExistingLexwareIdentityClassification;
    status: LexwareInvoiceJobStatus;
    creationState: LexwareInvoiceCreationState;
    canAttemptExternalWrite(
      status: LexwareInvoiceJobStatus,
      creationState: LexwareInvoiceCreationState,
    ): boolean;
  }): boolean;
  classifyTransition(input: {
    invoiceProvider: string;
    taxSnapshotStatus: string;
    taxSnapshotVersion: string;
    invoiceId: string;
    requestId: string;
    job: null | {
      localInvoiceId: string | null;
      requestId: string;
      triggerSource: string;
      targetOrganizationId: string;
      payloadHashMatches: boolean;
    };
  }): TransitionClassification;
  canAttemptExternalWrite(status: LexwareInvoiceJobStatus, creationState: LexwareInvoiceCreationState): boolean;
  isValidJobCreationStateCombination(input: {
    status: LexwareInvoiceJobStatus;
    creationState: LexwareInvoiceCreationState;
    lexwareInvoiceId?: string | null;
    lexwareInvoiceNumber?: string | null;
    completedAt?: string | null;
  }): boolean;
  loadLocalInvoice(): Promise<ProductionInvoiceRecord>;
  loadOrCreateJob(): Promise<ProductionInvoiceJob>;
  loadPreclaimedClaim?(job: ProductionInvoiceJob): Promise<{
    invoiceJobId: string;
    claimAcquired: true;
    readBackOnly: false;
    previousStatus: "pending";
    attemptCount: number;
    localInvoiceId: string;
    requestId: string;
    payloadSha256: string;
    payloadHashVersion: Exclude<ProductionInvoiceJob["payload_hash_version"], null>;
    targetOrganizationId: string;
    jobStatus: "processing";
    creationState: LexwareInvoiceCreationState;
    lockedAt: string;
    lockExpiresAt: string;
    lexwareInvoiceId: null;
    lexwareInvoiceNumber: null;
    lockOwner?: string;
  } | null>;
  loadPersistedPayload(job: ProductionInvoiceJob): Promise<LexwareInvoicePayloadBuildResult<TLineItem>>;
  buildPayload(invoice: ProductionInvoiceRecord): Promise<LexwareInvoicePayloadBuildResult<TLineItem>> | LexwareInvoicePayloadBuildResult<TLineItem>;
  validatePayload(payload: LexwareInvoicePayloadBuildResult<TLineItem>): Promise<LexwareInvoicePayloadValidationResult> | LexwareInvoicePayloadValidationResult;
  parsePayloadHashVersion(value: unknown): Exclude<ProductionInvoiceJob["payload_hash_version"], null>;
  hashPayload(payload: LexwareInvoicePayloadBuildResult<TLineItem>, version: Exclude<ProductionInvoiceJob["payload_hash_version"], null>): Promise<string> | string;
  validateOrganization(): Promise<string> | string;
  evaluateGates(): Promise<LexwareProductionGateResult> | LexwareProductionGateResult;
  claimForWrite(input: {
    localInvoiceId: string;
    payloadSha256: string;
    payloadHashVersion: Exclude<ProductionInvoiceJob["payload_hash_version"], null>;
    targetOrganizationId: string;
  }): Promise<{
    invoiceJobId: string;
    claimAcquired: true;
    readBackOnly: boolean;
    previousStatus: LexwareInvoiceJobStatus;
    attemptCount: number;
    localInvoiceId: string;
    requestId: string;
    payloadSha256: string;
    payloadHashVersion: Exclude<ProductionInvoiceJob["payload_hash_version"], null>;
    targetOrganizationId: string;
    jobStatus: "processing";
    creationState: LexwareInvoiceCreationState;
    lockedAt: string;
    lockExpiresAt: string;
    lexwareInvoiceId: string | null;
    lexwareInvoiceNumber: string | null;
    lockOwner?: string;
  }>;
  externalWriteMarkerRequired?: boolean;
  markExternalWriteStarted?(input: {
    invoiceJobId: string;
    localInvoiceId: string;
    requestId: string;
    attemptCount: number;
    lockOwner: string;
    lockedAt: string;
    lockExpiresAt: string;
    payloadSha256: string;
    payloadHashVersion: Exclude<ProductionInvoiceJob["payload_hash_version"], null>;
    targetOrganizationId: string;
    creationState: LexwareInvoiceCreationState;
  }): Promise<{
    invoiceJobId: string;
    externalWriteStarted: true;
    externalWriteStartedAt: string;
    attemptCount: number;
    jobStatus: "processing";
    creationState: LexwareInvoiceCreationState;
  }>;
  persistJobTransition(transition: JobTransition): Promise<void>;
  createFinalInvoice(payload: LexwareInvoicePayloadBuildResult<TLineItem>, organizationId: string): Promise<LexwareProductionCreateResult>;
  persistExternalResult(result: LexwareProductionCreateResult): Promise<void | { externalWriteCompletedAt: string }>;
  finalizeNativeExternalResult?(input: {
    created: LexwareProductionCreateResult;
    externalWriteCompletedAt: string;
    readBack: LexwareInvoiceReadModel;
    claim: {
      invoiceJobId: string;
      localInvoiceId: string;
      requestId: string;
      attemptCount: number;
      lockedAt: string;
      lockExpiresAt: string;
      lockOwner?: string;
      payloadSha256: string;
      payloadHashVersion: Exclude<ProductionInvoiceJob["payload_hash_version"], null>;
      targetOrganizationId: string;
    };
  }): Promise<void>;
  readInvoice(id: string): Promise<LexwareInvoiceReadModel>;
  compareReadBack(invoice: LexwareInvoiceReadModel, payload: LexwareInvoicePayloadBuildResult<TLineItem>, organizationId: string): string[];
  currentTime(): string;
};
export type ProcessorResult = {
  outcome: "succeeded" | "blocked" | "manual_review" | "read_back";
  postCount: number;
  externalInvoiceId: string | null;
  reasons: string[];
};

function isLexwareInvoiceCreationState(
  value: unknown,
): value is LexwareInvoiceCreationState {
  return value === "not_attempted"
    || value === "definite_not_created"
    || value === "definitely_created"
    || value === "creation_state_unknown";
}

export async function processLexwareProductionInvoiceCore<TLineItem = unknown>(
  deps: ProcessorDependencies<TLineItem>,
): Promise<ProcessorResult> {
  const invoice = await deps.loadLocalInvoice();
  const job = await deps.loadOrCreateJob();
  const preclaimedClaim = deps.loadPreclaimedClaim ? await deps.loadPreclaimedClaim(job) : null;
  const verifyExisting = async (
    id: string,
    postCount: number,
    payload: LexwareInvoicePayloadBuildResult<TLineItem>,
    organizationId: string,
    nativeFinalization?: Omit<Parameters<NonNullable<ProcessorDependencies<TLineItem>["finalizeNativeExternalResult"]>>[0], "readBack">,
  ): Promise<ProcessorResult> => {
    let readBack: LexwareInvoiceReadModel;
    try {
      readBack = await deps.readInvoice(id);
    } catch {
      await deps.persistJobTransition({ status: "manual_review", creation_state: "definitely_created", last_error_code: "READ_BACK_FAILED" });
      return { outcome: "manual_review", postCount, externalInvoiceId: id, reasons: ["read_back_failed"] };
    }
    const differences = deps.compareReadBack(readBack, payload, organizationId);
    if (readBack.id !== id) differences.push("external_invoice_id_mismatch");
    const voucherNumber = readBack.voucherNumber || null;
    if (!voucherNumber) differences.push("voucher_number_missing");
    if (differences.length) {
      await deps.persistJobTransition({ status: "manual_review", creation_state: "definitely_created", last_error_code: "READ_BACK_MISMATCH" });
      return { outcome: "manual_review", postCount, externalInvoiceId: id, reasons: differences };
    }
    if (nativeFinalization && deps.finalizeNativeExternalResult) {
      try {
        await deps.finalizeNativeExternalResult({ ...nativeFinalization, readBack });
      } catch {
        await deps.persistJobTransition({ status: "manual_review", creation_state: "definitely_created", last_error_code: "LOCAL_FINALIZE_FAILED" }).catch(() => undefined);
        return { outcome: "manual_review", postCount, externalInvoiceId: id, reasons: ["local_finalize_failed"] };
      }
      return { outcome: "succeeded", postCount, externalInvoiceId: id, reasons: [] };
    }
    await deps.persistJobTransition({ status: "succeeded", creation_state: "definitely_created", completed_at: deps.currentTime(), lexware_invoice_number: voucherNumber ?? undefined, lexware_voucher_status: "open" });
    return { outcome: "succeeded", postCount, externalInvoiceId: id, reasons: [] };
  };
  if (job.local_invoice_id !== invoice.id || job.request_id !== (invoice.request_id ?? "")) {
    return { outcome: "blocked", postCount: 0, externalInvoiceId: job.lexware_invoice_id, reasons: ["invoice_job_identity_mismatch"] };
  }
  const now = deps.currentTime();
  const identityClassification = preclaimedClaim ? "write_candidate" : deps.classifyIdentity({
    status: job.status, creationState: job.creation_state,
    lexwareInvoiceId: job.lexware_invoice_id,
    lexwareInvoiceNumber: job.lexware_invoice_number,
    completedAt: job.completed_at, lockExpiresAt: job.lock_expires_at,
    lockedAt: job.locked_at ?? null,
    currentTime: now,
  });
  if (identityClassification === "block") {
    return { outcome: job.creation_state === "creation_state_unknown" ? "manual_review" : "blocked", postCount: 0,
      externalInvoiceId: job.lexware_invoice_id, reasons: ["job_identity_state_blocked"] };
  }
  if (!preclaimedClaim && (identityClassification === "write_candidate" || identityClassification === "expired_lock_write_candidate")
      && !deps.isValidJobCreationStateCombination({ status: job.status, creationState: job.creation_state, lexwareInvoiceId: job.lexware_invoice_id, lexwareInvoiceNumber: job.lexware_invoice_number, completedAt: job.completed_at })) {
    return { outcome: "blocked", postCount: 0, externalInvoiceId: job.lexware_invoice_id, reasons: ["job_semantics_invalid"] };
  }
  if (!job.payload_hash_version) return { outcome: "blocked", postCount: 0, externalInvoiceId: null, reasons: ["PAYLOAD_HASH_VERSION_MISSING"] };
  let payloadHashVersion: Exclude<ProductionInvoiceJob["payload_hash_version"], null>;
  try { payloadHashVersion = deps.parsePayloadHashVersion(job.payload_hash_version); }
  catch { return { outcome: "blocked", postCount: 0, externalInvoiceId: null, reasons: ["PAYLOAD_HASH_VERSION_UNSUPPORTED"] }; }
  if (!job.payload_sha256) return { outcome: "blocked", postCount: 0, externalInvoiceId: null, reasons: ["PAYLOAD_HASH_MISSING"] };
  if (!/^[a-f0-9]{64}$/.test(job.payload_sha256)) return { outcome: "blocked", postCount: 0, externalInvoiceId: null, reasons: ["PAYLOAD_HASH_INVALID"] };
  const persistedPayload = await deps.loadPersistedPayload(job);
  const storedPayloadHash = await deps.hashPayload(persistedPayload, payloadHashVersion);
  if (storedPayloadHash !== job.payload_sha256) {
    return { outcome: "blocked", postCount: 0, externalInvoiceId: null, reasons: ["STORED_PAYLOAD_HASH_MISMATCH"] };
  }
  if (identityClassification === "read_back_only" || identityClassification === "already_succeeded") {
    if (!job.lexware_invoice_id) return { outcome: "blocked", postCount: 0, externalInvoiceId: null, reasons: ["external_invoice_id_missing"] };
    return verifyExisting(job.lexware_invoice_id, 0, persistedPayload, await deps.validateOrganization());
  }
  const payload = await deps.buildPayload(invoice);
  const validation = await deps.validatePayload(payload);
  if (!validation.valid) return { outcome: "blocked", postCount: 0, externalInvoiceId: job.lexware_invoice_id, reasons: ["payload_invalid"] };
  const currentPayloadHash = await deps.hashPayload(payload, payloadHashVersion);
  if (currentPayloadHash !== job.payload_sha256) {
    return { outcome: "blocked", postCount: 0, externalInvoiceId: null, reasons: ["CURRENT_PAYLOAD_HASH_MISMATCH"] };
  }
  const payloadHashMatches = storedPayloadHash === job.payload_sha256
    && currentPayloadHash === job.payload_sha256;
  const organizationId = await deps.validateOrganization();
  const transitionClassification = deps.classifyTransition({
    invoiceProvider: invoice.invoice_provider,
    taxSnapshotStatus: invoice.tax_snapshot_status,
    taxSnapshotVersion: invoice.tax_snapshot_version,
    invoiceId: invoice.id,
    requestId: invoice.request_id ?? "",
    job: {
      localInvoiceId: job.local_invoice_id ?? null,
      requestId: job.request_id ?? "",
      triggerSource: job.trigger_source ?? "",
      targetOrganizationId: job.target_organization_id ?? "",
      payloadHashMatches,
    },
  });
  if (transitionClassification === "blocked") {
    return { outcome: "blocked", postCount: 0, externalInvoiceId: null, reasons: ["local_invoice_not_production_eligible"] };
  }
  const gates = await deps.evaluateGates();
  if (!gates.allowed) return { outcome: "blocked", postCount: 0, externalInvoiceId: null, reasons: gates.failedChecks };
  const writeClaimEligible = preclaimedClaim ? true : deps.canOfferForAtomicWriteClaim({
    identityClassification,
    status: job.status,
    creationState: job.creation_state,
    canAttemptExternalWrite: deps.canAttemptExternalWrite,
  });
  if (!writeClaimEligible) return { outcome: "blocked", postCount: 0, externalInvoiceId: null, reasons: ["job_state_not_write_eligible"] };
  const claim = preclaimedClaim ?? await deps.claimForWrite({
    localInvoiceId: invoice.id,
    payloadSha256: job.payload_sha256,
    payloadHashVersion,
    targetOrganizationId: organizationId,
  });
  const claimMatches = claim.claimAcquired === true
    && claim.invoiceJobId === job.id
    && claim.localInvoiceId === invoice.id
    && claim.requestId === (invoice.request_id ?? "")
    && claim.payloadSha256 === job.payload_sha256
    && claim.payloadHashVersion === payloadHashVersion
    && claim.targetOrganizationId === organizationId
    && claim.attemptCount === (preclaimedClaim ? job.attempt_count : job.attempt_count + 1)
    && claim.previousStatus === (preclaimedClaim ? "pending" : job.status)
    && claim.jobStatus === "processing"
    && claim.creationState === job.creation_state
    && Number.isFinite(Date.parse(claim.lockedAt))
    && Number.isFinite(Date.parse(claim.lockExpiresAt))
    && Date.parse(claim.lockExpiresAt) > Date.parse(claim.lockedAt)
    && (claim.readBackOnly
      ? Boolean(claim.lexwareInvoiceId)
      : claim.lexwareInvoiceId === null && claim.lexwareInvoiceNumber === null
        && writeClaimEligible);
  if (!claimMatches) {
    return { outcome: "blocked", postCount: 0, externalInvoiceId: null, reasons: ["claim_result_mismatch"] };
  }
  if (claim.readBackOnly) {
    if (!claim.lexwareInvoiceId) return { outcome: "blocked", postCount: 0, externalInvoiceId: null, reasons: ["claim_read_back_id_missing"] };
    return verifyExisting(claim.lexwareInvoiceId, 0, persistedPayload, organizationId);
  }
  if (deps.externalWriteMarkerRequired) {
    if (!deps.markExternalWriteStarted || !claim.lockOwner) {
      return { outcome: "blocked", postCount: 0, externalInvoiceId: null, reasons: ["external_write_marker_unavailable"] };
    }
    try {
      const marker = await deps.markExternalWriteStarted({
        invoiceJobId: claim.invoiceJobId,
        localInvoiceId: claim.localInvoiceId,
        requestId: claim.requestId,
        attemptCount: claim.attemptCount,
        lockOwner: claim.lockOwner,
        lockedAt: claim.lockedAt,
        lockExpiresAt: claim.lockExpiresAt,
        payloadSha256: claim.payloadSha256,
        payloadHashVersion: claim.payloadHashVersion,
        targetOrganizationId: claim.targetOrganizationId,
        creationState: claim.creationState,
      });
      const markerMatches = marker.externalWriteStarted === true
        && marker.invoiceJobId === claim.invoiceJobId
        && marker.attemptCount === claim.attemptCount
        && marker.jobStatus === "processing"
        && marker.creationState === claim.creationState
        && Number.isFinite(Date.parse(marker.externalWriteStartedAt));
      if (!markerMatches) {
        return { outcome: "blocked", postCount: 0, externalInvoiceId: null, reasons: ["external_write_marker_mismatch"] };
      }
    } catch {
      return { outcome: "blocked", postCount: 0, externalInvoiceId: null, reasons: ["external_write_marker_failed"] };
    }
  }
  let created: LexwareProductionCreateResult;
  try {
    created = await deps.createFinalInvoice(payload, organizationId);
  } catch (error) {
    const state = error
      && typeof error === "object"
      && "creationState" in error
      && isLexwareInvoiceCreationState(error.creationState)
      ? error.creationState
      : "creation_state_unknown";
    const diagnostic = error && typeof error === "object" ? error : {};
    const httpStatus = "httpStatus" in diagnostic && typeof diagnostic.httpStatus === "number" ? diagnostic.httpStatus : null;
    const retryAfterSeconds = "retryAfterSeconds" in diagnostic && typeof diagnostic.retryAfterSeconds === "number" ? diagnostic.retryAfterSeconds : null;
    await deps.persistJobTransition({
      status: state === "definite_not_created" ? "retry" : "manual_review",
      creation_state: state,
      last_error_code: error instanceof Error ? error.name : "EXTERNAL_WRITE_FAILED",
      ...(httpStatus === null ? {} : { last_external_http_status: httpStatus }),
      ...(retryAfterSeconds === null ? {} : { last_external_retry_after_seconds: retryAfterSeconds }),
    });
    return { outcome: state === "definite_not_created" ? "blocked" : "manual_review", postCount: 1, externalInvoiceId: null, reasons: [state] };
  }
  let persistedExternalResult: void | { externalWriteCompletedAt: string };
  try {
    persistedExternalResult = await deps.persistExternalResult(created);
    if (!persistedExternalResult) {
      await deps.persistJobTransition({ status: "processing", creation_state: "definitely_created", lexware_invoice_id: created.id, lexware_resource_uri: created.resourceUri, lexware_created_date: created.createdDate, external_write_completed_at: deps.currentTime() });
    }
  } catch {
    await deps.persistJobTransition({ status: "manual_review", creation_state: "creation_state_unknown", last_error_code: "EXTERNAL_RESULT_PERSIST_FAILED" }).catch(() => undefined);
    return { outcome: "manual_review", postCount: 1, externalInvoiceId: created.id, reasons: ["external_result_persist_failed"] };
  }
  return verifyExisting(created.id, 1, payload, organizationId, deps.finalizeNativeExternalResult && persistedExternalResult ? {
    created,
    externalWriteCompletedAt: persistedExternalResult.externalWriteCompletedAt,
    claim,
  } : undefined);
}
