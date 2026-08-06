import "server-only";

import { CHECKOUT_MAINTENANCE_ACTIVE } from "@/lib/checkoutMaintenance";
import { supabaseServer } from "@/lib/supabase/server";
import { getLexwareRuntimeConfigurationSummary } from "./lexwareConfig";
import { loadEligibleLocalInvoice } from "./lexwareProductionInvoiceJobRepository";
import { buildLexwarePayloadSha256, LEXWARE_PAYLOAD_HASH_V1, parseLexwarePayloadHashVersion } from "./lexwarePayloadHash";
import {
  canAttemptExternalWrite,
  evaluateLexwareProductionGates,
  type LexwareInvoiceCreationState,
  type LexwareInvoiceJobStatus,
} from "./lexwareProductionInvoiceJob";
import { validateLexwareProductionOrganization } from "./lexwareProductionOrganizationCore";
import { evaluateLexwareProductionDryRunDecision } from "./lexwareProductionDryRunCore";
import {
  canOfferLexwareJobForAtomicWriteClaim,
  classifyExistingLexwareIdentityState,
  classifyLexwareInvoiceTransition,
} from "./lexwareProductionTransitionCore";
import { loadLatestExpiredLexwareProductionWritePermit, loadLexwareProductionWritePermit } from "./lexwareProductionWritePermitService";
import { evaluateObjectScopedPermitReadiness } from "./lexwareProductionWritePermitCore";

const isJobStatus = (value: unknown): value is LexwareInvoiceJobStatus => value === "waiting_for_activation"
  || value === "pending" || value === "processing" || value === "retry" || value === "succeeded"
  || value === "failed" || value === "manual_review" || value === "cancelled";
const isCreationState = (value: unknown): value is LexwareInvoiceCreationState => value === "not_attempted"
  || value === "definite_not_created" || value === "definitely_created" || value === "creation_state_unknown";
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const activationBlockReason = (failedCheck: string) => {
  if (failedCheck === "productionWriteEnabled") return "production_write_disabled";
  if (failedCheck === "providerCutoverConfiguredForLexware") {
    return "provider_cutover_not_configured_for_lexware";
  }
  if (failedCheck === "checkoutMaintenanceActive") return "checkout_maintenance_not_active";
  return `activation_gate_failed:${failedCheck}`;
};

export async function previewLexwareProductionInvoiceById(invoiceId: string) {
  const { data: invoice, error: invoiceError } = await supabaseServer.from("school_request_invoices")
    .select("id,request_id,invoice_provider,tax_snapshot_status,tax_snapshot_version").eq("id", invoiceId).single();
  if (invoiceError || !invoice) throw new Error("Lokale Rechnung nicht gefunden.");
  const { data: settings, error: settingsError } = await supabaseServer.from("business_runtime_settings")
    .select("invoice_provider_after,lexware_production_write_enabled,lexware_production_organization_id").eq("id", "default").single();
  if (settingsError || !settings) throw new Error("Runtime-Einstellungen nicht gefunden.");
  const { data: job } = await supabaseServer.from("school_lexware_invoice_jobs")
    .select("id,local_invoice_id,request_id,trigger_source,status,creation_state,attempt_count,payload_snapshot,payload_sha256,payload_hash_version,lexware_invoice_id,lexware_invoice_number,completed_at,locked_at,lock_expires_at,target_organization_id")
    .eq("local_invoice_id", invoiceId).maybeSingle();

  const environment = getLexwareRuntimeConfigurationSummary();
  const gates = evaluateLexwareProductionGates({
    activeMode: environment.activeMode,
    integrationEnabled: environment.integrationEnabled,
    productionApiKeyConfigured: environment.modes.production.apiKeyConfigured,
    productionOrganizationIdValid: environment.modes.production.organizationIdValid,
    credentialsSeparated: environment.credentialSeparation.safe,
    configuredProductionOrganizationId: environment.modes.production.organizationId,
    databaseProductionOrganizationId: settings.lexware_production_organization_id,
    productionWriteEnabled: settings.lexware_production_write_enabled,
    providerAfterCutover: settings.invoice_provider_after,
    checkoutMaintenanceActive: CHECKOUT_MAINTENANCE_ACTIVE,
  });
  const jobOrganizationConfigured = typeof job?.target_organization_id === "string" && job.target_organization_id.trim().length > 0;
  const databaseOrganizationConfigured = typeof settings.lexware_production_organization_id === "string" && settings.lexware_production_organization_id.trim().length > 0;
  const runtimeOrganizationConfigured = typeof environment.modes.production.organizationId === "string" && environment.modes.production.organizationId.trim().length > 0;
  const status = isJobStatus(job?.status) ? job.status : null;
  const creationState = isCreationState(job?.creation_state) ? job.creation_state : null;
  const invoiceJobLinkMatches = Boolean(job && job.local_invoice_id === invoice.id);
  const requestIdMatches = Boolean(job && job.request_id === invoice.request_id);
  const now = Date.now();
  const activeLock = Boolean(status === "processing" && job?.lock_expires_at && Date.parse(job.lock_expires_at) > now);
  const lockExpired = Boolean(job?.lock_expires_at && Date.parse(job.lock_expires_at) <= now);
  const identityClassification = status && creationState ? classifyExistingLexwareIdentityState({
    status,
    creationState,
    lexwareInvoiceId: job?.lexware_invoice_id ?? null,
    lexwareInvoiceNumber: job?.lexware_invoice_number,
    completedAt: job?.completed_at,
    lockedAt: job?.locked_at ?? null,
    lockExpiresAt: job?.lock_expires_at ?? null,
    currentTime: new Date(now).toISOString(),
  }) : "block";
  const readBackOnly = identityClassification === "read_back_only" || identityClassification === "already_succeeded";

  let payloadHashVersion: ReturnType<typeof parseLexwarePayloadHashVersion> | null = null;
  let payloadHashVersionSupported = false;
  if (job?.payload_hash_version) {
    try {
      payloadHashVersion = parseLexwarePayloadHashVersion(job.payload_hash_version);
      payloadHashVersionSupported = true;
    } catch {
      payloadHashVersion = null;
    }
  }
  const storedEnvelope = isRecord(job?.payload_snapshot) ? job.payload_snapshot : null;
  const storedPayload = storedEnvelope && isRecord(storedEnvelope.payload) ? storedEnvelope.payload : null;
  const identityCanProceed = Boolean(job && invoiceJobLinkMatches && requestIdMatches && identityClassification !== "block");
  const storedPayloadHash = identityCanProceed && payloadHashVersion && storedPayload
    ? buildLexwarePayloadSha256({ payload: storedPayload, version: payloadHashVersion }) : null;
  const storedPayloadHashValid = job && storedPayloadHash !== null ? storedPayloadHash === job.payload_sha256 : null;

  let payloadValid = false;
  let currentPayloadHash: string | null = null;
  if (identityCanProceed && identityClassification === "write_candidate" && storedPayloadHashValid && payloadHashVersion) {
    const prepared = await loadEligibleLocalInvoice(invoiceId);
    payloadValid = true;
    currentPayloadHash = buildLexwarePayloadSha256({ payload: prepared.built.payload, version: payloadHashVersion });
  }
  const currentPayloadHashMatches = job && currentPayloadHash !== null ? currentPayloadHash === job.payload_sha256 : null;
  const hashMatches = storedPayloadHashValid === true && currentPayloadHashMatches === true;

  let targetOrganizationMatches = false;
  if (storedPayloadHashValid === true && (currentPayloadHashMatches === true || readBackOnly)) {
    try {
      targetOrganizationMatches = validateLexwareProductionOrganization({
        jobOrganizationId: job?.target_organization_id,
        databaseOrganizationId: settings.lexware_production_organization_id,
        runtimeOrganizationId: environment.modes.production.organizationId,
      }).matches;
    } catch {
      targetOrganizationMatches = false;
    }
  }
  const writeStateAllowed = Boolean(status && creationState && canOfferLexwareJobForAtomicWriteClaim({
    identityClassification,
    status,
    creationState,
    canAttemptExternalWrite,
  }));
  const transitionClassification = classifyLexwareInvoiceTransition({
    invoiceProvider: invoice.invoice_provider,
    taxSnapshotStatus: invoice.tax_snapshot_status,
    taxSnapshotVersion: invoice.tax_snapshot_version,
    invoiceId: invoice.id,
    requestId: invoice.request_id ?? "",
    job: job ? {
      localInvoiceId: job.local_invoice_id,
      requestId: job.request_id ?? "",
      triggerSource: job.trigger_source ?? "",
      targetOrganizationId: job.target_organization_id ?? "",
      payloadHashMatches: hashMatches,
    } : null,
  });
  const decision = evaluateLexwareProductionDryRunDecision({
    jobExists: Boolean(job),
    invoiceJobLinkMatches,
    requestIdMatches,
    identityClassification,
    payloadHashVersionSupported,
    storedPayloadHashMatches: storedPayloadHashValid === true,
    currentPayloadHashMatches,
    payloadValid,
    targetOrganizationMatches,
    transitionClassification,
    writeStateAllowed,
    gatesAllowed: gates.allowed,
  });
  const {
    technicalPreviewReady,
    activationReadyNow: globalActivationReady,
    claimWouldSucceed: globalClaimWouldSucceed,
    wouldPerformExactlyOnePost,
    wouldOnlyReadBack,
    wouldCreateExactlyOneInvoice,
  } = decision;
  const permit = await loadLexwareProductionWritePermit(invoiceId);
  const expiredPermit = await loadLatestExpiredLexwareProductionWritePermit(invoiceId);
  const permitReadiness = evaluateObjectScopedPermitReadiness({
    permit,
    expiredPermit,
    invoiceId: invoice.id,
    requestId: invoice.request_id ?? "",
    jobId: job?.id ?? "",
    targetOrganizationId: job?.target_organization_id ?? "",
    payloadHashVersion: job?.payload_hash_version ?? "",
    payloadSha256: job?.payload_sha256 ?? "",
    jobStatus: status ?? "",
    attemptCount: job?.attempt_count ?? -1,
    technicalPreviewReady,
    now: new Date(now).toISOString(),
  });
  const activationReadyNow = globalActivationReady || permitReadiness.objectScopedClaimReady;
  const claimWouldSucceed = globalClaimWouldSucceed || permitReadiness.objectScopedClaimReady;
  const idempotencyDecision = !job ? "no_persisted_job_state"
    : wouldOnlyReadBack ? "read_back_existing"
      : activationReadyNow ? "exactly_one_finalize_allowed_if_claim_matches"
        : technicalPreviewReady ? "activation_gates_closed"
          : activeLock ? "blocked_by_active_lock"
            : "job_state_blocked";
  const technicalBlockers = [
    ...(!invoiceJobLinkMatches ? ["invoice_job_link_mismatch"] : []),
    ...(!requestIdMatches ? ["request_id_mismatch"] : []),
    ...(identityClassification === "block" ? ["job_identity_state_blocked"] : []),
    ...(!payloadHashVersionSupported && !readBackOnly ? ["payload_hash_version_invalid"] : []),
    ...(storedPayloadHashValid === false ? ["stored_payload_hash_mismatch"] : []),
    ...(currentPayloadHashMatches === false ? ["current_payload_hash_mismatch"] : []),
    ...(!targetOrganizationMatches ? ["organization_mismatch"] : []),
    ...(transitionClassification === "blocked" ? ["transition_blocked"] : []),
  ];
  const activationBlockReasons = [
    ...(!technicalPreviewReady && !wouldOnlyReadBack ? ["technical_preview_not_ready"] : []),
    ...gates.failedChecks.map(activationBlockReason),
    ...(
      technicalPreviewReady && !writeStateAllowed
        ? [activeLock ? "active_lock" : "job_state_not_claimable"]
        : []
    ),
  ];

  return {
    ok: true,
    dryRun: true,
    writeOperationsPerformed: false,
    technicalPreviewReady,
    activationReadyNow,
    globalActivationReady,
    ...permitReadiness,
    activationGates: gates.checks,
    activationBlockReasons,
    checkoutMaintenanceActive: CHECKOUT_MAINTENANCE_ACTIVE,
    wouldFinalizeInvoice: wouldPerformExactlyOnePost,
    wouldCreateExactlyOneInvoice,
    wouldBlockReason: technicalPreviewReady || wouldOnlyReadBack ? null : technicalBlockers,
    jobStatus: status,
    creationState,
    attemptCount: job?.attempt_count ?? null,
    payloadHashVersion,
    payloadHashVersionSupported,
    legacyHashContract: payloadHashVersion === LEXWARE_PAYLOAD_HASH_V1,
    storedPayloadSnapshotHashMatches: storedPayloadHashValid,
    currentPayloadHashMatches,
    payloadHashMatches: hashMatches,
    invoiceJobLinkMatches,
    requestIdMatches,
    jobOrganizationConfigured,
    databaseOrganizationConfigured,
    runtimeOrganizationConfigured,
    targetOrganizationMatches,
    transitionClassification,
    triggerSourcePresent: Boolean(job?.trigger_source),
    externalIdentityPresent: Boolean(job?.lexware_invoice_id),
    lockActive: activeLock,
    lockExpired,
    claimWouldSucceed,
    readBackOnly,
    wouldPerformExactlyOnePost,
    wouldOnlyReadBack,
    wouldRequireHashMigration: false,
    jobExists: Boolean(job),
    creationStateDecision: creationState,
    idempotencyDecision,
    recommendation: job ? null : "Zuerst den lokalen Rechnungsjob über die Admin-Enqueue-Route anlegen.",
    lexwareReadRequestsPerformed: 0,
    lexwareWriteRequestsPerformed: 0,
    databaseWritesPerformed: 0,
    storageOperationsPerformed: 0,
    pdfRequestsPerformed: 0,
    mailOperationsPerformed: 0,
  };
}
