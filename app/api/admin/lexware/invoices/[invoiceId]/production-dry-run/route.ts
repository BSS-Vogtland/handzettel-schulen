import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { getLexwareRuntimeConfigurationSummary } from "@/app/lib/lexware/lexwareConfig";
import { buildLexwareInvoicePayload, type LocalLexwareInvoiceItemSnapshot, type LocalLexwareInvoiceSnapshot } from "@/app/lib/lexware/lexwareInvoicePayloadBuilder";
import { validateLexwareInvoicePayload } from "@/app/lib/lexware/lexwareInvoicePayloadValidator";
import { canAttemptExternalWrite, evaluateLexwareProductionGates, type LexwareInvoiceCreationState, type LexwareInvoiceJobStatus } from "@/app/lib/lexware/lexwareProductionInvoiceJob";
import { CHECKOUT_MAINTENANCE_ACTIVE } from "@/lib/checkoutMaintenance";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "no-store" };

export async function POST(_request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;
  const { invoiceId } = await params;
  try {
    const { data: invoice, error: invoiceError } = await supabaseServer.from("school_request_invoices").select("*").eq("id", invoiceId).single();
    if (invoiceError || !invoice) throw new Error("Lokale Rechnung nicht gefunden.");
    const { data: items, error: itemError } = await supabaseServer.from("school_request_invoice_items").select("*").eq("invoice_id", invoiceId).order("created_at");
    if (itemError || !items?.length) throw new Error("Rechnungspositionen nicht gefunden.");
    const { data: settings, error: settingsError } = await supabaseServer.from("business_runtime_settings").select("invoice_provider_after, lexware_production_write_enabled, lexware_production_organization_id").eq("id", "default").single();
    if (settingsError || !settings) throw new Error("Runtime-Einstellungen nicht gefunden.");
    const { data: job } = await supabaseServer.from("school_lexware_invoice_jobs").select("id, status, creation_state, payload_sha256, idempotency_key, lexware_invoice_id, lock_expires_at").eq("local_invoice_id", invoiceId).maybeSingle();
    const built = buildLexwareInvoicePayload({ invoice: invoice as unknown as LocalLexwareInvoiceSnapshot, items: items as unknown as LocalLexwareInvoiceItemSnapshot[], paymentTermDays: 7 });
    const validation = validateLexwareInvoicePayload(built);
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
    const payloadHash = createHash("sha256").update(JSON.stringify(built.payload)).digest("hex");
    const status = (job?.status ?? "waiting_for_activation") as LexwareInvoiceJobStatus;
    const creationState = (job?.creation_state ?? "not_attempted") as LexwareInvoiceCreationState;
    const hasExternalId = Boolean(job?.lexware_invoice_id);
    const activeLock = status === "processing" && Boolean(job?.lock_expires_at && Date.parse(job.lock_expires_at) > Date.now());
    const hashMatches = job ? job.payload_sha256 === payloadHash : null;
    const idempotencyDecision = !job ? "no_persisted_job_state" : hasExternalId ? "read_back_existing" : creationState === "creation_state_unknown" ? "manual_review" : activeLock ? "blocked_by_active_lock" : !hashMatches ? "manual_review_payload_changed" : canAttemptExternalWrite(status, creationState) ? "exactly_one_finalize_allowed_if_gates_pass" : "job_state_blocked";
    const wouldFinalizeInvoice = validation.valid && gates.allowed && idempotencyDecision === "exactly_one_finalize_allowed_if_gates_pass";
    return NextResponse.json({
      ok: true, dryRun: true, writeOperationsPerformed: false, wouldFinalizeInvoice, wouldCreateExactlyOneInvoice: wouldFinalizeInvoice,
      wouldBlockReason: wouldFinalizeInvoice ? null : [...gates.failedChecks, ...(validation.valid ? [] : ["payload_invalid"]), idempotencyDecision],
      invoiceJobId: job?.id ?? null, jobStatus: job?.status ?? null,
      creationState: job?.creation_state ?? null, payloadHashMatches: hashMatches,
      creationStateDecision: job ? creationState : null, idempotencyDecision, payloadValid: validation.valid,
      recommendation: job ? null : "Zuerst den lokalen Rechnungsjob über die Admin-Enqueue-Route anlegen.",
      gates: { ...gates.checks, allPassed: gates.allowed, failedChecks: gates.failedChecks },
      expectedTotals: built.expected, lexwareReadRequestsPerformed: 0, lexwareWriteRequestsPerformed: 0,
      databaseWritesPerformed: 0, pdfRequestsPerformed: 0, mailOperationsPerformed: 0,
    }, { headers: HEADERS });
  } catch (error) {
    return NextResponse.json({ ok: false, dryRun: true, writeOperationsPerformed: false, lexwareWriteRequestsPerformed: 0, databaseWritesPerformed: 0, message: error instanceof Error ? error.message : "Dry-run fehlgeschlagen." }, { status: 422, headers: HEADERS });
  }
}
