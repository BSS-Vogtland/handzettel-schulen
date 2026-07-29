import "server-only";

/*
 * LEXWARE_RUNTIME_CONFIG_V1
 * LEXWARE_NO_CROSS_MODE_CREDENTIAL_FALLBACK_V1
 *
 * Test- und Produktionszugang sind strikt getrennt.
 * Ein fehlender Schlüssel wird niemals durch den Schlüssel
 * des jeweils anderen Modus ersetzt.
 */

export const LEXWARE_RUNTIME_CONFIGURATION_VERSION =
  "lexware-runtime-configuration-v1" as const;

export const DEFAULT_LEXWARE_API_BASE_URL =
  "https://api.lexware.io";

export type LexwareMode =
  | "test"
  | "production";

export type LexwareConnectionConfiguration = {
  mode: LexwareMode;
  apiBaseUrl: string;
  apiKey: string;
  apiKeyEnvironmentVariable:
    | "LEXWARE_TEST_API_KEY"
    | "LEXWARE_PRODUCTION_API_KEY";
  organizationId: string;
  organizationIdEnvironmentVariable:
    | "LEXWARE_TEST_ORGANIZATION_ID"
    | "LEXWARE_PRODUCTION_ORGANIZATION_ID";
};

export type LexwareModeConfigurationSummary = {
  mode: LexwareMode;
  apiKeyEnvironmentVariable: string;
  apiKeyConfigured: boolean;
  organizationIdEnvironmentVariable: string;
  organizationId: string | null;
  organizationIdConfigured: boolean;
  organizationIdValid: boolean;
};

export type LexwareRuntimeConfigurationSummary = {
  version:
    typeof LEXWARE_RUNTIME_CONFIGURATION_VERSION;

  apiBaseUrl: string;
  apiBaseUrlConfigured: boolean;
  apiBaseUrlValid: boolean;

  integrationEnabled: boolean;
  integrationFlagConfigured: boolean;
  integrationFlagValid: boolean;

  activeMode: LexwareMode | null;
  activeModeConfigured: boolean;
  activeModeValid: boolean;

  modes: Record<
    LexwareMode,
    LexwareModeConfigurationSummary
  >;

  credentialSeparation: {
    apiKeysDistinct: boolean | null;
    organizationIdsDistinct:
      | boolean
      | null;
    safe: boolean;
  };
};

type ParsedBooleanFlag = {
  configured: boolean;
  valid: boolean;
  value: boolean;
};

type ParsedMode = {
  configured: boolean;
  valid: boolean;
  value: LexwareMode | null;
};

type ParsedApiBaseUrl = {
  configured: boolean;
  valid: boolean;
  value: string;
};

type ModeEnvironmentDefinition = {
  apiKey:
    | "LEXWARE_TEST_API_KEY"
    | "LEXWARE_PRODUCTION_API_KEY";

  organizationId:
    | "LEXWARE_TEST_ORGANIZATION_ID"
    | "LEXWARE_PRODUCTION_ORGANIZATION_ID";
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MODE_ENVIRONMENT: Record<
  LexwareMode,
  ModeEnvironmentDefinition
> = {
  test: {
    apiKey:
      "LEXWARE_TEST_API_KEY",

    organizationId:
      "LEXWARE_TEST_ORGANIZATION_ID",
  },

  production: {
    apiKey:
      "LEXWARE_PRODUCTION_API_KEY",

    organizationId:
      "LEXWARE_PRODUCTION_ORGANIZATION_ID",
  },
};

export class LexwareConfigurationError extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);

    this.name =
      "LexwareConfigurationError";

    this.code =
      code;
  }
}

function readEnvironmentValue(
  name: string,
) {
  const value =
    process.env[name];

  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    return null;
  }

  return value.trim();
}

function parseBooleanFlag(
  name: string,
  defaultValue = false,
): ParsedBooleanFlag {
  const rawValue =
    readEnvironmentValue(name);

  if (!rawValue) {
    return {
      configured: false,
      valid: true,
      value: defaultValue,
    };
  }

  const normalized =
    rawValue.toLowerCase();

  if (normalized === "true") {
    return {
      configured: true,
      valid: true,
      value: true,
    };
  }

  if (normalized === "false") {
    return {
      configured: true,
      valid: true,
      value: false,
    };
  }

  return {
    configured: true,
    valid: false,
    value: defaultValue,
  };
}

function parseMode(): ParsedMode {
  const rawValue =
    readEnvironmentValue(
      "LEXWARE_ACTIVE_MODE",
    );

  if (!rawValue) {
    return {
      configured: false,
      valid: false,
      value: null,
    };
  }

  const normalized =
    rawValue.toLowerCase();

  if (
    normalized === "test" ||
    normalized === "production"
  ) {
    return {
      configured: true,
      valid: true,
      value: normalized,
    };
  }

  return {
    configured: true,
    valid: false,
    value: null,
  };
}

function parseApiBaseUrl(): ParsedApiBaseUrl {
  const rawValue =
    readEnvironmentValue(
      "LEXWARE_API_BASE_URL",
    );

  const candidate =
    rawValue ||
    DEFAULT_LEXWARE_API_BASE_URL;

  try {
    const url =
      new URL(candidate);

    const pathIsRoot =
      url.pathname === "" ||
      url.pathname === "/";

    const valid =
      url.protocol === "https:" &&
      url.hostname.toLowerCase() ===
        "api.lexware.io" &&
      pathIsRoot &&
      url.search === "" &&
      url.hash === "" &&
      url.username === "" &&
      url.password === "";

    return {
      configured:
        Boolean(rawValue),

      valid,

      value:
        valid
          ? url.origin
          : candidate,
    };
  } catch {
    return {
      configured:
        Boolean(rawValue),

      valid: false,
      value: candidate,
    };
  }
}

function normalizeOrganizationId(
  value: string | null,
) {
  if (!value) {
    return null;
  }

  return value.toLowerCase();
}

function getModeSummary(
  mode: LexwareMode,
): LexwareModeConfigurationSummary {
  const definition =
    MODE_ENVIRONMENT[mode];

  const apiKey =
    readEnvironmentValue(
      definition.apiKey,
    );

  const organizationId =
    normalizeOrganizationId(
      readEnvironmentValue(
        definition.organizationId,
      ),
    );

  return {
    mode,

    apiKeyEnvironmentVariable:
      definition.apiKey,

    apiKeyConfigured:
      Boolean(apiKey),

    organizationIdEnvironmentVariable:
      definition.organizationId,

    organizationId,

    organizationIdConfigured:
      Boolean(organizationId),

    organizationIdValid:
      Boolean(
        organizationId &&
        UUID_PATTERN.test(
          organizationId,
        ),
      ),
  };
}

export function isLexwareMode(
  value: unknown,
): value is LexwareMode {
  return (
    value === "test" ||
    value === "production"
  );
}

export function getLexwareRuntimeConfigurationSummary(): LexwareRuntimeConfigurationSummary {
  const apiBaseUrl =
    parseApiBaseUrl();

  const integrationFlag =
    parseBooleanFlag(
      "LEXWARE_INTEGRATION_ENABLED",
      false,
    );

  const activeMode =
    parseMode();

  const testMode =
    getModeSummary("test");

  const productionMode =
    getModeSummary(
      "production",
    );

  const testApiKey =
    readEnvironmentValue(
      "LEXWARE_TEST_API_KEY",
    );

  const productionApiKey =
    readEnvironmentValue(
      "LEXWARE_PRODUCTION_API_KEY",
    );

  const apiKeysDistinct =
    testApiKey &&
    productionApiKey
      ? testApiKey !==
        productionApiKey
      : null;

  const organizationIdsDistinct =
    testMode.organizationId &&
    productionMode.organizationId
      ? testMode.organizationId !==
        productionMode.organizationId
      : null;

  return {
    version:
      LEXWARE_RUNTIME_CONFIGURATION_VERSION,

    apiBaseUrl:
      apiBaseUrl.value,

    apiBaseUrlConfigured:
      apiBaseUrl.configured,

    apiBaseUrlValid:
      apiBaseUrl.valid,

    integrationEnabled:
      integrationFlag.value,

    integrationFlagConfigured:
      integrationFlag.configured,

    integrationFlagValid:
      integrationFlag.valid,

    activeMode:
      activeMode.value,

    activeModeConfigured:
      activeMode.configured,

    activeModeValid:
      activeMode.valid,

    modes: {
      test:
        testMode,

      production:
        productionMode,
    },

    credentialSeparation: {
      apiKeysDistinct,

      organizationIdsDistinct,

      safe:
        apiKeysDistinct !== false &&
        organizationIdsDistinct !==
          false,
    },
  };
}

export function requireLexwareActiveMode(): LexwareMode {
  const mode =
    parseMode();

  if (
    !mode.valid ||
    !mode.value
  ) {
    throw new LexwareConfigurationError(
      "LEXWARE_ACTIVE_MODE_INVALID",
      "LEXWARE_ACTIVE_MODE muss exakt test oder production sein.",
    );
  }

  return mode.value;
}

export function requireLexwareConnectionConfiguration(
  mode: LexwareMode,
): LexwareConnectionConfiguration {
  const summary =
    getLexwareRuntimeConfigurationSummary();

  if (
    !summary.integrationFlagValid
  ) {
    throw new LexwareConfigurationError(
      "LEXWARE_INTEGRATION_FLAG_INVALID",
      "LEXWARE_INTEGRATION_ENABLED muss exakt true oder false sein.",
    );
  }

  if (!summary.apiBaseUrlValid) {
    throw new LexwareConfigurationError(
      "LEXWARE_API_BASE_URL_INVALID",
      "LEXWARE_API_BASE_URL muss auf https://api.lexware.io ohne Pfad oder Queryparameter zeigen.",
    );
  }

  if (
    !summary
      .credentialSeparation
      .safe
  ) {
    throw new LexwareConfigurationError(
      "LEXWARE_CREDENTIAL_SEPARATION_INVALID",
      "Test- und Produktionsmandant dürfen weder denselben API-Schlüssel noch dieselbe Organization-ID verwenden.",
    );
  }

  const definition =
    MODE_ENVIRONMENT[mode];

  /*
   * LEXWARE_NO_CROSS_MODE_CREDENTIAL_FALLBACK_V1
   *
   * Ausschließlich die Variable des ausgewählten Modus wird
   * gelesen. Es gibt keinen Fallback auf den anderen Modus.
   */
  const apiKey =
    readEnvironmentValue(
      definition.apiKey,
    );

  if (!apiKey) {
    throw new LexwareConfigurationError(
      "LEXWARE_API_KEY_MISSING",
      `${definition.apiKey} fehlt. Für den Modus ${mode} wird kein Schlüssel eines anderen Modus verwendet.`,
    );
  }

  const organizationId =
    normalizeOrganizationId(
      readEnvironmentValue(
        definition.organizationId,
      ),
    );

  if (!organizationId) {
    throw new LexwareConfigurationError(
      "LEXWARE_ORGANIZATION_ID_MISSING",
      `${definition.organizationId} fehlt.`,
    );
  }

  if (
    !UUID_PATTERN.test(
      organizationId,
    )
  ) {
    throw new LexwareConfigurationError(
      "LEXWARE_ORGANIZATION_ID_INVALID",
      `${definition.organizationId} besitzt kein gültiges UUID-Format.`,
    );
  }

  return {
    mode,

    apiBaseUrl:
      summary.apiBaseUrl,

    apiKey,

    apiKeyEnvironmentVariable:
      definition.apiKey,

    organizationId,

    organizationIdEnvironmentVariable:
      definition.organizationId,
  };
}
