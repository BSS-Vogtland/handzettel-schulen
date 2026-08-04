import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { getLexwareRuntimeConfigurationSummary } from "@/app/lib/lexware/lexwareConfig";
import { buildLexwareRuntimeReadiness } from "@/app/lib/lexware/lexwareRuntimeReadinessCore";
import { CHECKOUT_MAINTENANCE_ACTIVE } from "@/lib/checkoutMaintenance";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

function withNoStore(response: Response): Response {
  const headers = new Headers(response.headers);

  for (const [name, value] of Object.entries(NO_STORE_HEADERS)) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

type RuntimeSettingsRow = {
  lexware_production_write_enabled: boolean;
  lexware_automatic_mail_enabled: boolean;
  lexware_production_organization_id: string | null;
  lexware_production_credential_alias: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRuntimeSettings(value: unknown): RuntimeSettingsRow | null {
  if (!isRecord(value)) return null;

  if (
    typeof value.lexware_production_write_enabled !== "boolean" ||
    typeof value.lexware_automatic_mail_enabled !== "boolean" ||
    (
      value.lexware_production_organization_id !== null &&
      typeof value.lexware_production_organization_id !== "string"
    ) ||
    (
      value.lexware_production_credential_alias !== null &&
      typeof value.lexware_production_credential_alias !== "string"
    )
  ) {
    return null;
  }

  return {
    lexware_production_write_enabled:
      value.lexware_production_write_enabled,
    lexware_automatic_mail_enabled:
      value.lexware_automatic_mail_enabled,
    lexware_production_organization_id:
      value.lexware_production_organization_id,
    lexware_production_credential_alias:
      value.lexware_production_credential_alias,
  };
}

export async function GET() {
  const unauthorized = await requireAdminApiSession();

  if (unauthorized) {
    return withNoStore(unauthorized);
  }

  const runtimeConfiguration =
    getLexwareRuntimeConfigurationSummary();

  const { data, error } = await supabaseServer
    .from("business_runtime_settings")
    .select(
      [
        "lexware_production_write_enabled",
        "lexware_automatic_mail_enabled",
        "lexware_production_organization_id",
        "lexware_production_credential_alias",
      ].join(", "),
    )
    .eq("id", "default")
    .single();

  const settings = parseRuntimeSettings(data);

  if (error || !settings) {
    return withNoStore(NextResponse.json(
      { ok: false },
      {
        status: 503,
      },
    ));
  }

  return withNoStore(NextResponse.json(
    buildLexwareRuntimeReadiness({
      runtimeSummary: {
        activeModeConfigured:
          runtimeConfiguration.activeModeConfigured,
        activeModeValid:
          runtimeConfiguration.activeModeValid,
        activeMode:
          runtimeConfiguration.activeMode,
        integrationEnabledConfigured:
          runtimeConfiguration.integrationFlagConfigured,
        integrationEnabledValid:
          runtimeConfiguration.integrationFlagValid,
        integrationEnabled:
          runtimeConfiguration.integrationFlagValid
            ? runtimeConfiguration.integrationEnabled
            : null,
        productionApiKeyConfigured:
          runtimeConfiguration.modes.production.apiKeyConfigured,
        productionOrganizationConfigured:
          runtimeConfiguration.modes.production.organizationIdConfigured,
      },
      databaseSettings: {
        productionWriteEnabled:
          settings.lexware_production_write_enabled,
        automaticMailEnabled:
          settings.lexware_automatic_mail_enabled,
        targetOrganizationConfigured:
          typeof settings.lexware_production_organization_id === "string" &&
          settings.lexware_production_organization_id.trim().length > 0,
        credentialAliasConfigured:
          typeof settings.lexware_production_credential_alias === "string" &&
          settings.lexware_production_credential_alias.trim().length > 0,
      },
      checkoutMaintenance: {
        known: true,
        value: CHECKOUT_MAINTENANCE_ACTIVE,
      },
    }),
  ));
}
