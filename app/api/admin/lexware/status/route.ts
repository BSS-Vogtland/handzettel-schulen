import { NextResponse } from "next/server";

import {
  requireAdminApiSession,
} from "@/app/lib/adminApiAuth";

import {
  LexwareApiError,
  getLexwareProfile,
  type LexwareProfile,
} from "@/app/lib/lexware/lexwareClient";

import {
  LexwareConfigurationError,
  getLexwareRuntimeConfigurationSummary,
  isLexwareMode,
  type LexwareMode,
} from "@/app/lib/lexware/lexwareConfig";

import {
  supabaseServer,
} from "@/lib/supabase/server";

/*
 * LEXWARE_ADMIN_STATUS_READ_ONLY_V1
 *
 * Keine Lexware-Schreiboperation.
 * Keine Supabase-Schreiboperation.
 * Keine Rechnungserzeugung.
 * Kein Mailversand.
 */

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const LEXWARE_READ_ONLY_STATUS_VERSION =
  "lexware-read-only-admin-status-v1";

const NO_STORE_HEADERS = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, max-age=0",
};

type RuntimeSettingsRow = {
  id: string;
  timezone_name: string;
  invoice_cutover_at: string;
  invoice_provider_before: string;
  invoice_provider_after: string;
  invoice_cutover_version: string;

  lexware_production_organization_id:
    | string
    | null;

  lexware_test_organization_id:
    | string
    | null;

  lexware_production_write_enabled:
    boolean;

  lexware_production_write_enabled_at:
    | string
    | null;

  lexware_automatic_mail_enabled:
    boolean;

  lexware_automatic_mail_enabled_at:
    | string
    | null;

  bank_transfer_qr_enabled:
    boolean;

  lexware_outbox_schema_version:
    | string
    | null;

  lexware_production_credential_alias:
    | string
    | null;

  lexware_invoice_mail_sender_alias:
    | string
    | null;

  lexware_invoice_job_max_attempts:
    | number
    | string
    | null;

  lexware_mail_job_max_attempts:
    | number
    | string
    | null;

  updated_at:
    | string
    | null;
};

type RequestedModeResult = {
  mode: LexwareMode | null;
  requestedValue: string;
  explicitlySelected: boolean;
  error: string | null;
};

type ConnectionFailure = {
  kind:
    | "configuration"
    | "api"
    | "unknown";

  code: string;
  message: string;
  httpStatus:
    | number
    | null;

  retryAfterSeconds:
    | number
    | null;
};

function cleanText(
  value: unknown,
) {
  const text =
    String(value ?? "").trim();

  return text.length > 0
    ? text
    : null;
}

function normalizeUuid(
  value: unknown,
) {
  return (
    cleanText(value)
      ?.toLowerCase() ||
    null
  );
}

function toInteger(
  value: unknown,
  fallback = 0,
) {
  const parsed =
    Number(value);

  if (
    !Number.isFinite(parsed)
  ) {
    return fallback;
  }

  return Math.trunc(
    parsed,
  );
}

function resolveRequestedMode(
  request: Request,
  activeMode: LexwareMode | null,
): RequestedModeResult {
  const requestUrl =
    new URL(request.url);

  const rawValue =
    cleanText(
      requestUrl.searchParams.get(
        "mode",
      ),
    )?.toLowerCase() ||
    "active";

  if (rawValue === "active") {
    if (!activeMode) {
      return {
        mode: null,

        requestedValue:
          rawValue,

        explicitlySelected:
          false,

        error:
          "LEXWARE_ACTIVE_MODE ist nicht gültig konfiguriert.",
      };
    }

    return {
      mode:
        activeMode,

      requestedValue:
        rawValue,

      explicitlySelected:
        false,

      error:
        null,
    };
  }

  if (isLexwareMode(rawValue)) {
    return {
      mode:
        rawValue,

      requestedValue:
        rawValue,

      explicitlySelected:
        true,

      error:
        null,
    };
  }

  return {
    mode: null,

    requestedValue:
      rawValue,

    explicitlySelected:
      true,

    error:
      "Der Queryparameter mode muss active, test oder production sein.",
  };
}

async function loadRuntimeSettings() {
  const {
    data,
    error,
  } =
    await supabaseServer
      .from(
        "business_runtime_settings",
      )
      .select(
        [
          "id",
          "timezone_name",
          "invoice_cutover_at",
          "invoice_provider_before",
          "invoice_provider_after",
          "invoice_cutover_version",
          "lexware_production_organization_id",
          "lexware_test_organization_id",
          "lexware_production_write_enabled",
          "lexware_production_write_enabled_at",
          "lexware_automatic_mail_enabled",
          "lexware_automatic_mail_enabled_at",
          "bank_transfer_qr_enabled",
          "lexware_outbox_schema_version",
          "lexware_production_credential_alias",
          "lexware_invoice_mail_sender_alias",
          "lexware_invoice_job_max_attempts",
          "lexware_mail_job_max_attempts",
          "updated_at",
        ].join(", "),
      )
      .eq(
        "id",
        "default",
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      "Lexware-Laufzeiteinstellungen konnten nicht geladen werden: " +
        error.message,
    );
  }

  if (!data) {
    throw new Error(
      "business_runtime_settings/default fehlt.",
    );
  }

  return data as unknown as RuntimeSettingsRow;
}

async function countRows(
  tableName: string,
  invoiceProvider?:
    | "legacy_internal"
    | "lexware",
) {
  const query =
    supabaseServer
      .from(tableName)
      .select(
        "id",
        {
          count:
            "exact",

          head:
            true,
        },
      );

  const result =
    invoiceProvider
      ? await query.eq(
          "invoice_provider",
          invoiceProvider,
        )
      : await query;

  if (result.error) {
    throw new Error(
      `${tableName} konnte nicht gezählt werden: ${result.error.message}`,
    );
  }

  return result.count || 0;
}

async function loadOutboxCounts() {
  const [
    invoiceJobs,
    mailJobs,
    outboxEvents,
    legacyInvoices,
    lexwareInvoices,
  ] =
    await Promise.all([
      countRows(
        "school_lexware_invoice_jobs",
      ),

      countRows(
        "school_lexware_invoice_mail_jobs",
      ),

      countRows(
        "school_lexware_outbox_events",
      ),

      countRows(
        "school_request_invoices",
        "legacy_internal",
      ),

      countRows(
        "school_request_invoices",
        "lexware",
      ),
    ]);

  return {
    invoiceJobs,
    mailJobs,
    outboxEvents,
    legacyInvoices,
    lexwareInvoices,
  };
}

function toConnectionFailure(
  error: unknown,
): ConnectionFailure {
  if (
    error instanceof
    LexwareConfigurationError
  ) {
    return {
      kind:
        "configuration",

      code:
        error.code,

      message:
        error.message,

      httpStatus:
        null,

      retryAfterSeconds:
        null,
    };
  }

  if (
    error instanceof
    LexwareApiError
  ) {
    return {
      kind:
        "api",

      code:
        error.code,

      message:
        error.message,

      httpStatus:
        error.httpStatus,

      retryAfterSeconds:
        error.retryAfterSeconds,
    };
  }

  return {
    kind:
      "unknown",

    code:
      "LEXWARE_UNKNOWN_ERROR",

    message:
      error instanceof Error
        ? error.message
        : "Unbekannter Lexware-Fehler.",

    httpStatus:
      null,

    retryAfterSeconds:
      null,
  };
}

function getDatabaseOrganizationId(
  settings: RuntimeSettingsRow,
  mode: LexwareMode,
) {
  return normalizeUuid(
    mode === "production"
      ? settings
          .lexware_production_organization_id
      : settings
          .lexware_test_organization_id,
  );
}

function getProfileChecks(
  profile: LexwareProfile | null,
) {
  const businessFeatures =
    new Set(
      profile?.businessFeatures ||
      [],
    );

  const normalizedSubscription =
    cleanText(
      profile?.subscriptionStatus,
    )?.toLowerCase() ||
    null;

  const knownInactiveStates =
    new Set([
      "inactive",
      "cancelled",
      "canceled",
      "expired",
      "blocked",
    ]);

  const subscriptionIsKnownInactive =
    normalizedSubscription !==
      null &&
    knownInactiveStates.has(
      normalizedSubscription,
    );

  return {
    profileLoaded:
      Boolean(profile),

    hasInvoicingFeature:
      businessFeatures.has(
        "INVOICING",
      ) ||
      businessFeatures.has(
        "INVOICING_PRO",
      ),

    hasInvoicingProFeature:
      businessFeatures.has(
        "INVOICING_PRO",
      ),

    hasBookkeepingFeature:
      businessFeatures.has(
        "BOOKKEEPING",
      ),

    subscriptionNotKnownInactive:
      !subscriptionIsKnownInactive,

    smallBusinessIsFalse:
      profile?.smallBusiness ===
      false,

    taxTypeSupportsVat:
      profile?.taxType ===
        "net" ||
      profile?.taxType ===
        "gross",
  };
}

export async function GET(
  request: Request,
) {
  const unauthorized =
    await requireAdminApiSession();

  if (unauthorized) {
    return unauthorized;
  }

  try {
    /*
     * LEXWARE_ADMIN_STATUS_READ_ONLY_V1
     *
     * Genau ein externer Lexware-Aufruf:
     * GET /v1/profile
     */
    const environment =
      getLexwareRuntimeConfigurationSummary();

    const requestedMode =
      resolveRequestedMode(
        request,
        environment.activeMode,
      );

    if (
      requestedMode.error ||
      !requestedMode.mode
    ) {
      return NextResponse.json(
        {
          ok: false,
          readOnly: true,

          writeOperationsPerformed:
            false,

          version:
            LEXWARE_READ_ONLY_STATUS_VERSION,

          message:
            requestedMode.error,

          environment,
        },
        {
          status: 400,
          headers:
            NO_STORE_HEADERS,
        },
      );
    }

    const selectedMode =
      requestedMode.mode;

    const [
      settings,
      counts,
    ] =
      await Promise.all([
        loadRuntimeSettings(),
        loadOutboxCounts(),
      ]);

    let profile:
      | LexwareProfile
      | null =
        null;

    let connectionError:
      | ConnectionFailure
      | null =
        null;

    try {
      profile =
        await getLexwareProfile(
          selectedMode,
        );
    } catch (error) {
      connectionError =
        toConnectionFailure(
          error,
        );
    }

    const environmentMode =
      environment.modes[
        selectedMode
      ];

    const databaseOrganizationId =
      getDatabaseOrganizationId(
        settings,
        selectedMode,
      );

    const profileOrganizationId =
      normalizeUuid(
        profile?.organizationId,
      );

    const profileChecks =
      getProfileChecks(
        profile,
      );

    const cutoverTimestamp =
      Date.parse(
        settings
          .invoice_cutover_at,
      );

    const cutoverTimestampValid =
      Number.isFinite(
        cutoverTimestamp,
      );

    const cutoverReached =
      cutoverTimestampValid &&
      Date.now() >=
        cutoverTimestamp;

    const checks = {
      apiBaseUrlValid:
        environment
          .apiBaseUrlValid,

      integrationFlagValid:
        environment
          .integrationFlagValid,

      activeModeValid:
        environment
          .activeModeValid,

      credentialSeparationSafe:
        environment
          .credentialSeparation
          .safe,

      selectedModeApiKeyConfigured:
        environmentMode
          .apiKeyConfigured,

      selectedModeEnvironmentOrganizationValid:
        environmentMode
          .organizationIdValid,

      databaseOrganizationConfigured:
        Boolean(
          databaseOrganizationId,
        ),

      environmentAndDatabaseOrganizationMatch:
        Boolean(
          environmentMode
            .organizationId &&
          databaseOrganizationId &&
          environmentMode
            .organizationId ===
            databaseOrganizationId,
        ),

      profileLoaded:
        profileChecks
          .profileLoaded,

      profileOrganizationMatchesEnvironment:
        Boolean(
          profileOrganizationId &&
          environmentMode
            .organizationId &&
          profileOrganizationId ===
            environmentMode
              .organizationId,
        ),

      profileOrganizationMatchesDatabase:
        Boolean(
          profileOrganizationId &&
          databaseOrganizationId &&
          profileOrganizationId ===
            databaseOrganizationId,
        ),

      profileHasInvoicingFeature:
        profileChecks
          .hasInvoicingFeature,

      profileHasInvoicingProFeature:
        profileChecks
          .hasInvoicingProFeature,

      profileHasBookkeepingFeature:
        profileChecks
          .hasBookkeepingFeature,

      profileSubscriptionNotKnownInactive:
        profileChecks
          .subscriptionNotKnownInactive,

      profileSmallBusinessIsFalse:
        profileChecks
          .smallBusinessIsFalse,

      profileTaxTypeSupportsVat:
        profileChecks
          .taxTypeSupportsVat,

      cutoverTimestampValid,

      providerTransitionIsCorrect:
        settings
          .invoice_provider_before ===
          "legacy_internal" &&
        settings
          .invoice_provider_after ===
          "lexware",

      outboxSchemaVersionIsCorrect:
        settings
          .lexware_outbox_schema_version ===
          "lexware-outbox-mail-v1",

      productionCredentialAliasPresent:
        Boolean(
          cleanText(
            settings
              .lexware_production_credential_alias,
          ),
        ),

      mailSenderAliasPresent:
        Boolean(
          cleanText(
            settings
              .lexware_invoice_mail_sender_alias,
          ),
        ),
    };

    const allReadOnlyChecksPassed =
      checks.apiBaseUrlValid &&
      checks.integrationFlagValid &&
      checks.activeModeValid &&
      checks
        .credentialSeparationSafe &&
      checks
        .selectedModeApiKeyConfigured &&
      checks
        .selectedModeEnvironmentOrganizationValid &&
      checks
        .databaseOrganizationConfigured &&
      checks
        .environmentAndDatabaseOrganizationMatch &&
      checks.profileLoaded &&
      checks
        .profileOrganizationMatchesEnvironment &&
      checks
        .profileOrganizationMatchesDatabase &&
      checks
        .profileHasInvoicingFeature &&
      checks
        .profileSubscriptionNotKnownInactive &&
      checks
        .profileSmallBusinessIsFalse &&
      checks
        .profileTaxTypeSupportsVat &&
      checks
        .cutoverTimestampValid &&
      checks
        .providerTransitionIsCorrect &&
      checks
        .outboxSchemaVersionIsCorrect &&
      checks
        .productionCredentialAliasPresent &&
      checks
        .mailSenderAliasPresent;

    const currentStageSafelyDisabled =
      settings
        .lexware_production_write_enabled ===
        false &&
      settings
        .lexware_automatic_mail_enabled ===
        false &&
      counts.invoiceJobs === 0 &&
      counts.mailJobs === 0 &&
      counts.outboxEvents === 0 &&
      counts.lexwareInvoices === 0;

    const selectedModeIsActive =
      environment.activeMode ===
      selectedMode;

    const productionWriteCurrentlyPossible =
      allReadOnlyChecksPassed &&
      selectedMode ===
        "production" &&
      selectedModeIsActive &&
      environment
        .integrationEnabled &&
      cutoverReached &&
      settings
        .lexware_production_write_enabled;

    const automaticMailCurrentlyPossible =
      productionWriteCurrentlyPossible &&
      settings
        .lexware_automatic_mail_enabled;

    const responseStatus =
      allReadOnlyChecksPassed
        ? 200
        : connectionError?.kind ===
            "configuration"
          ? 503
          : 502;

    return NextResponse.json(
      {
        ok:
          allReadOnlyChecksPassed,

        readOnly:
          true,

        writeOperationsPerformed:
          false,

        version:
          LEXWARE_READ_ONLY_STATUS_VERSION,

        checkedAt:
          new Date().toISOString(),

        requestedMode: {
          value:
            requestedMode
              .requestedValue,

          selectedMode,

          explicitlySelected:
            requestedMode
              .explicitlySelected,

          selectedModeIsActive,
        },

        environment,

        database: {
          settings: {
            timezoneName:
              settings.timezone_name,

            invoiceCutoverAt:
              settings
                .invoice_cutover_at,

            invoiceProviderBefore:
              settings
                .invoice_provider_before,

            invoiceProviderAfter:
              settings
                .invoice_provider_after,

            invoiceCutoverVersion:
              settings
                .invoice_cutover_version,

            productionOrganizationId:
              normalizeUuid(
                settings
                  .lexware_production_organization_id,
              ),

            testOrganizationId:
              normalizeUuid(
                settings
                  .lexware_test_organization_id,
              ),

            productionWriteEnabled:
              settings
                .lexware_production_write_enabled,

            productionWriteEnabledAt:
              settings
                .lexware_production_write_enabled_at,

            automaticMailEnabled:
              settings
                .lexware_automatic_mail_enabled,

            automaticMailEnabledAt:
              settings
                .lexware_automatic_mail_enabled_at,

            bankTransferQrEnabled:
              settings
                .bank_transfer_qr_enabled,

            outboxSchemaVersion:
              settings
                .lexware_outbox_schema_version,

            productionCredentialAlias:
              cleanText(
                settings
                  .lexware_production_credential_alias,
              ),

            mailSenderAlias:
              cleanText(
                settings
                  .lexware_invoice_mail_sender_alias,
              ),

            invoiceJobMaxAttempts:
              toInteger(
                settings
                  .lexware_invoice_job_max_attempts,
              ),

            mailJobMaxAttempts:
              toInteger(
                settings
                  .lexware_mail_job_max_attempts,
              ),

            updatedAt:
              settings.updated_at,
          },

          counts,
        },

        lexware: {
          profile,
          error:
            connectionError,
        },

        checks,

        gates: {
          cutoverReached,

          currentStageSafelyDisabled,

          integrationEnabledByEnvironment:
            environment
              .integrationEnabled,

          productionWriteEnabledInDatabase:
            settings
              .lexware_production_write_enabled,

          automaticMailEnabledInDatabase:
            settings
              .lexware_automatic_mail_enabled,

          productionWriteCurrentlyPossible,

          automaticMailCurrentlyPossible,
        },

        allReadOnlyChecksPassed,
      },
      {
        status:
          responseStatus,

        headers:
          NO_STORE_HEADERS,
      },
    );
  } catch (error) {
    console.error(
      "lexware_read_only_status_failed",
      {
        message:
          error instanceof Error
            ? error.message
            : String(error),
      },
    );

    return NextResponse.json(
      {
        ok: false,
        readOnly: true,

        writeOperationsPerformed:
          false,

        version:
          LEXWARE_READ_ONLY_STATUS_VERSION,

        message:
          error instanceof Error
            ? error.message
            : "Der Lexware-Status konnte nicht geladen werden.",
      },
      {
        status: 500,

        headers:
          NO_STORE_HEADERS,
      },
    );
  }
}

export async function POST() {
  const unauthorized =
    await requireAdminApiSession();

  if (unauthorized) {
    return unauthorized;
  }

  return NextResponse.json(
    {
      ok: false,
      readOnly: true,

      writeOperationsPerformed:
        false,

      message:
        "Dieser Endpunkt ist ausschließlich read-only und kann nur per GET verwendet werden.",
    },
    {
      status: 405,

      headers: {
        ...NO_STORE_HEADERS,
        Allow: "GET",
      },
    },
  );
}
