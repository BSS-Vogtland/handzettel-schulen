import "server-only";

import { getLexwareRuntimeConfigurationSummary } from "./lexwareConfig";
import { getLexwareInvoice } from "./lexwareInvoiceReadClient";
import { buildLexwareInvoicePayload, type LocalLexwareInvoiceItemSnapshot, type LocalLexwareInvoiceSnapshot } from "./lexwareInvoicePayloadBuilder";
import { validateLexwareInvoicePayload } from "./lexwareInvoicePayloadValidator";
import { parseLexwarePayloadLineItem, type LexwareLineItemSignatureInput } from "./lexwareLineItemMultisetCore";
import { buildLexwarePayloadSha256, parseLexwarePayloadHashVersion } from "./lexwarePayloadHash";
import { canAttemptExternalWrite, evaluateLexwareProductionGates, isValidJobCreationStateCombination } from "./lexwareProductionInvoiceJob";
import { claimInvoiceJobForProcessing } from "./lexwareProductionInvoiceJobRepository";
import {
  compareLexwareOpenInvoiceReadBack,
  processLexwareProductionInvoice,
  type JobTransition,
  type ProductionInvoiceJob,
  type ProductionInvoiceRecord,
} from "./lexwareProductionInvoiceProcessor";
import type { LexwareInvoicePayloadBuildResult } from "./lexwareProductionInvoiceProcessorCore";
import {
  canOfferLexwareJobForAtomicWriteClaim,
  classifyExistingLexwareIdentityState,
  classifyLexwareInvoiceTransition,
} from "./lexwareProductionTransitionCore";
import { validateLexwareProductionOrganization } from "./lexwareProductionOrganizationCore";
import { createLexwareProductionFinalInvoice, LEXWARE_PRODUCTION_FINALIZE_CONFIRMATION } from "./lexwareProductionInvoiceWriteClient";
import { CHECKOUT_MAINTENANCE_ACTIVE } from "@/lib/checkoutMaintenance";
import { supabaseServer } from "@/lib/supabase/server";
import {
  completeLexwareProductionWritePermit,
  loadLexwareProductionWritePermit,
} from "./lexwareProductionWritePermitService";

type ProcessServiceResult = {
  ok: boolean;
  status: number;
  code: string;
  outcome: string | null;
  postCount: number;
  reasons: string[];
};

function persistedPayload(value: unknown): LexwareInvoicePayloadBuildResult<LexwareLineItemSignatureInput> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PERSISTED_PAYLOAD_INVALID");
  const row = value as Record<string, unknown>;
  if (!row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)
      || !row.expected || typeof row.expected !== "object" || Array.isArray(row.expected)) {
    throw new Error("PERSISTED_PAYLOAD_INVALID");
  }
  const payload = row.payload as Record<string, unknown>;
  const expected = row.expected as Record<string, unknown>;
  if (!Array.isArray(payload.lineItems)
      || !payload.paymentConditions || typeof payload.paymentConditions !== "object" || Array.isArray(payload.paymentConditions)
      || typeof expected.totalGrossAmount !== "number" || typeof expected.totalNetAmount !== "number"
      || typeof expected.totalTaxAmount !== "number" || !Array.isArray(expected.taxRates)) {
    throw new Error("PERSISTED_PAYLOAD_INVALID");
  }
  const paymentConditions = payload.paymentConditions as Record<string, unknown>;
  if (typeof paymentConditions.paymentTermLabel !== "string") throw new Error("PERSISTED_PAYLOAD_INVALID");
  const parsedLineItems: LexwareLineItemSignatureInput[] = payload.lineItems.map(parseLexwarePayloadLineItem);
  return {
    payload: {
      ...payload,
      lineItems: parsedLineItems,
      paymentConditions: { paymentTermLabel: paymentConditions.paymentTermLabel },
    },
    expected: {
      totalGrossAmount: expected.totalGrossAmount,
      totalNetAmount: expected.totalNetAmount,
      totalTaxAmount: expected.totalTaxAmount,
      taxRates: expected.taxRates.map((bucket) => {
        if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) throw new Error("PERSISTED_PAYLOAD_INVALID");
        const rate = bucket as Record<string, unknown>;
        if (typeof rate.taxRatePercentage !== "number" || typeof rate.grossAmount !== "number"
            || typeof rate.netAmount !== "number" || typeof rate.taxAmount !== "number") throw new Error("PERSISTED_PAYLOAD_INVALID");
        return { taxRatePercentage: rate.taxRatePercentage, grossAmount: rate.grossAmount, netAmount: rate.netAmount, taxAmount: rate.taxAmount };
      }),
    },
  };
}

export async function processLexwareProductionInvoiceById(
  invoiceId: string,
  permitContext?: { permitId: string; claimId: string },
): Promise<ProcessServiceResult> {
  const { data: invoice, error: invoiceError } = await supabaseServer.from("school_request_invoices").select("*").eq("id", invoiceId).single();
  if (invoiceError || !invoice) return { ok: false, status: 404, code: "INVOICE_NOT_FOUND", outcome: null, postCount: 0, reasons: [] };
  const { data: job, error: jobError } = await supabaseServer.from("school_lexware_invoice_jobs").select("*").eq("local_invoice_id", invoiceId).single();
  if (jobError || !job) return { ok: false, status: 409, code: "INVOICE_JOB_REQUIRED", outcome: null, postCount: 0, reasons: [] };
  const permit = permitContext ? await loadLexwareProductionWritePermit(invoiceId) : null;
  const objectScopedPermitValid = Boolean(permitContext && permit
    && permit.id === permitContext.permitId && permit.claimId === permitContext.claimId
    && permit.state === "claimed" && Date.parse(permit.expiresAt) > Date.now()
    && permit.invoiceId === invoice.id && permit.requestId === invoice.request_id
    && permit.jobId === job.id && permit.payloadSha256 === job.payload_sha256
    && permit.payloadHashVersion === job.payload_hash_version
    && permit.targetOrganizationId.toLowerCase() === String(job.target_organization_id).toLowerCase()
    && job.status === "processing" && job.creation_state === "not_attempted" && job.attempt_count === 1
    && job.lexware_invoice_id === null && job.lexware_invoice_number === null
    && typeof job.locked_at === "string" && typeof job.lock_expires_at === "string"
    && Date.parse(job.lock_expires_at) > Date.now()
    && String(job.locked_by || "").includes(permitContext.claimId));
  if (permitContext && !objectScopedPermitValid) {
    return { ok: false, status: 409, code: "OBJECT_SCOPED_PERMIT_INVALID", outcome: "blocked", postCount: 0, reasons: ["object_scoped_permit_invalid"] };
  }
  type RuntimeSettings = {
    invoice_provider_after: string;
    lexware_production_write_enabled: boolean;
    lexware_production_organization_id: string | null;
  };
  let settingsPromise: Promise<RuntimeSettings> | null = null;
  const loadSettings = () => {
    settingsPromise ??= (async () => {
      const { data: settings, error: settingsError } = await supabaseServer.from("business_runtime_settings")
        .select("invoice_provider_after,lexware_production_write_enabled,lexware_production_organization_id").eq("id", "default").single();
      if (settingsError || !settings) throw new Error("RUNTIME_SETTINGS_MISSING");
      return settings;
    })();
    return settingsPromise;
  };
  let organizationId: string | null = null;
  const loadOrganizationId = async () => {
    if (organizationId) return organizationId;
    const settings = await loadSettings();
    const runtime = getLexwareRuntimeConfigurationSummary();
    organizationId = validateLexwareProductionOrganization({
      jobOrganizationId: job.target_organization_id,
      databaseOrganizationId: settings.lexware_production_organization_id,
      runtimeOrganizationId: runtime.modes.production.organizationId,
    }).organizationId;
    return organizationId;
  };
  const persistTransition = async (transition: JobTransition) => {
    const { data, error } = await supabaseServer.from("school_lexware_invoice_jobs")
      .update({ ...transition, updated_at: new Date().toISOString() }).eq("id", job.id).select("id").maybeSingle();
    if (error || !data) throw error ?? new Error("INVOICE_JOB_TRANSITION_CONFLICT");
  };
  const result = await processLexwareProductionInvoice({
    classifyIdentity: classifyExistingLexwareIdentityState,
    canOfferForAtomicWriteClaim: canOfferLexwareJobForAtomicWriteClaim,
    classifyTransition: classifyLexwareInvoiceTransition,
    canAttemptExternalWrite,
    isValidJobCreationStateCombination,
    loadLocalInvoice: async () => invoice as ProductionInvoiceRecord,
    loadOrCreateJob: async () => job as ProductionInvoiceJob,
    loadPreclaimedClaim: objectScopedPermitValid && permit ? async () => ({
      invoiceJobId: job.id,
      claimAcquired: true as const,
      readBackOnly: false as const,
      previousStatus: "pending" as const,
      attemptCount: job.attempt_count,
      localInvoiceId: job.local_invoice_id,
      requestId: job.request_id,
      payloadSha256: job.payload_sha256,
      payloadHashVersion: parseLexwarePayloadHashVersion(job.payload_hash_version),
      targetOrganizationId: job.target_organization_id,
      jobStatus: "processing" as const,
      creationState: job.creation_state,
      lockedAt: job.locked_at,
      lockExpiresAt: job.lock_expires_at,
      lexwareInvoiceId: null,
      lexwareInvoiceNumber: null,
    }) : undefined,
    loadPersistedPayload: async () => persistedPayload(job.payload_snapshot),
    buildPayload: async () => {
      const { data: items, error: itemsError } = await supabaseServer.from("school_request_invoice_items").select("*").eq("invoice_id", invoiceId).order("created_at");
      if (itemsError || !items?.length) throw new Error("INVOICE_ITEMS_REQUIRED");
      return buildLexwareInvoicePayload({
        invoice: invoice as LocalLexwareInvoiceSnapshot,
        items: items as LocalLexwareInvoiceItemSnapshot[],
        paymentTermDays: 7,
      });
    },
    validatePayload: validateLexwareInvoicePayload,
    parsePayloadHashVersion: parseLexwarePayloadHashVersion,
    hashPayload: (payload, version) => buildLexwarePayloadSha256({ payload: payload.payload, version }),
    validateOrganization: loadOrganizationId,
    evaluateGates: async () => {
      const settings = await loadSettings();
      const runtime = getLexwareRuntimeConfigurationSummary();
      return evaluateLexwareProductionGates({
        activeMode: runtime.activeMode,
        integrationEnabled: runtime.integrationEnabled,
        productionApiKeyConfigured: runtime.modes.production.apiKeyConfigured,
        productionOrganizationIdValid: runtime.modes.production.organizationIdValid,
        credentialsSeparated: runtime.credentialSeparation.safe,
        configuredProductionOrganizationId: runtime.modes.production.organizationId,
        databaseProductionOrganizationId: settings.lexware_production_organization_id,
        productionWriteEnabled: settings.lexware_production_write_enabled,
        providerAfterCutover: settings.invoice_provider_after,
        checkoutMaintenanceActive: CHECKOUT_MAINTENANCE_ACTIVE,
        objectScopedProductionPermitValid: objectScopedPermitValid,
      });
    },
    claimForWrite: async (expected) => {
      const claim = await claimInvoiceJobForProcessing({
        localInvoiceId: expected.localInvoiceId,
        expectedPayloadSha256: expected.payloadSha256,
        expectedPayloadHashVersion: expected.payloadHashVersion,
        expectedTargetOrganizationId: expected.targetOrganizationId,
        lockedBy: `admin-process:${invoiceId}`,
        lockDurationSeconds: 120,
      });
      return {
        invoiceJobId: claim.invoiceJobId,
        claimAcquired: claim.claimAcquired,
        readBackOnly: claim.readBackOnly,
        previousStatus: claim.previousStatus,
        attemptCount: claim.attemptCount,
        localInvoiceId: claim.localInvoiceId,
        requestId: claim.requestId,
        payloadSha256: claim.payloadSha256,
        payloadHashVersion: claim.payload_hash_version,
        targetOrganizationId: claim.targetOrganizationId,
        jobStatus: claim.jobStatus,
        creationState: claim.creationState,
        lockedAt: claim.lockedAt,
        lockExpiresAt: claim.lockExpiresAt,
        lexwareInvoiceId: claim.lexwareInvoiceId,
        lexwareInvoiceNumber: claim.lexwareInvoiceNumber,
      };
    },
    persistJobTransition: persistTransition,
    createFinalInvoice: async (payload, validatedOrganizationId) => {
      const settings = await loadSettings();
      const runtime = getLexwareRuntimeConfigurationSummary();
      return createLexwareProductionFinalInvoice({
        payload: payload.payload,
        finalize: true,
        confirmation: LEXWARE_PRODUCTION_FINALIZE_CONFIRMATION,
        gates: {
          activeMode: runtime.activeMode,
          integrationEnabled: runtime.integrationEnabled,
          productionApiKeyConfigured: runtime.modes.production.apiKeyConfigured,
          productionOrganizationIdValid: runtime.modes.production.organizationIdValid,
          credentialsSeparated: runtime.credentialSeparation.safe,
          configuredProductionOrganizationId: runtime.modes.production.organizationId,
          databaseProductionOrganizationId: settings.lexware_production_organization_id,
          productionWriteEnabled: settings.lexware_production_write_enabled,
          providerAfterCutover: settings.invoice_provider_after,
          checkoutMaintenanceActive: CHECKOUT_MAINTENANCE_ACTIVE,
          objectScopedProductionPermitValid: objectScopedPermitValid,
        },
      }, validatedOrganizationId);
    },
    persistExternalResult: async (created) => {
      const timestamp = new Date().toISOString();
      const { error } = await supabaseServer.from("school_lexware_invoice_jobs").update({
        lexware_invoice_id: created.id, lexware_resource_uri: created.resourceUri,
        lexware_created_date: created.createdDate, creation_state: "definitely_created",
        external_write_completed_at: timestamp,
      }).eq("id", job.id);
      if (error) throw error;
      const { error: invoiceUpdateError } = await supabaseServer.from("school_request_invoices")
        .update({ lexware_invoice_id: created.id, lexware_organization_id: await loadOrganizationId() }).eq("id", invoiceId);
      if (invoiceUpdateError) throw invoiceUpdateError;
    },
    readInvoice: (id) => getLexwareInvoice("production", id),
    compareReadBack: (readBack, payload, validatedOrganizationId) => compareLexwareOpenInvoiceReadBack(readBack, payload, validatedOrganizationId),
    currentTime: () => new Date().toISOString(),
  });
  if (permitContext && (result.outcome === "succeeded" || result.outcome === "manual_review")) {
    await completeLexwareProductionWritePermit(invoiceId, permitContext.permitId, permitContext.claimId);
  }
  return {
    ok: result.outcome === "succeeded",
    status: result.outcome === "succeeded" ? 200 : 409,
    code: result.outcome === "succeeded" ? "LEXWARE_PROCESS_SUCCEEDED" : "LEXWARE_PROCESS_BLOCKED",
    outcome: result.outcome,
    postCount: result.postCount,
    reasons: result.reasons,
  };
}
