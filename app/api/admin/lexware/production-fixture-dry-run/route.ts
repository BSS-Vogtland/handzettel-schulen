import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { getLexwareRuntimeConfigurationSummary } from "@/app/lib/lexware/lexwareConfig";
import { runLexwareProductionFixtureDryRun } from "@/app/lib/lexware/lexwareProductionFixtureDryRun";
import { CHECKOUT_MAINTENANCE_ACTIVE } from "@/lib/checkoutMaintenance";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store" };

export async function POST() {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { data: settings, error } = await supabaseServer
      .from("business_runtime_settings")
      .select("invoice_provider_after, lexware_production_write_enabled, lexware_production_organization_id")
      .eq("id", "default")
      .single();

    if (error || !settings) {
      throw new Error("Runtime-Einstellungen nicht gefunden.");
    }

    const environment = getLexwareRuntimeConfigurationSummary();
    const result = runLexwareProductionFixtureDryRun({
      databaseReadsPerformed: 1,
      gates: {
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
      },
    });

    return NextResponse.json(result, { headers: HEADERS });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      dryRun: true,
      fixture: true,
      writeOperationsPerformed: false,
      lexwareReadRequestsPerformed: 0,
      lexwareWriteRequestsPerformed: 0,
      databaseWritesPerformed: 0,
      mailOperationsPerformed: 0,
      message: error instanceof Error ? error.message : "Fixture-Dry-run fehlgeschlagen.",
    }, { status: 422, headers: HEADERS });
  }
}
