export type LexwareRuntimeReadinessInput = {
  runtimeSummary: {
    activeModeConfigured: boolean;
    activeModeValid: boolean;
    activeMode: "test" | "production" | null;
    integrationEnabledConfigured: boolean;
    integrationEnabledValid: boolean;
    integrationEnabled: boolean | null;
    productionApiKeyConfigured: boolean;
    productionOrganizationConfigured: boolean;
  };
  databaseSettings: {
    productionWriteEnabled: boolean;
    automaticMailEnabled: boolean;
    targetOrganizationConfigured: boolean;
    credentialAliasConfigured: boolean;
  };
  checkoutMaintenance:
    | { known: true; value: boolean }
    | { known: false };
};

export type LexwareRuntimeReadiness = {
  ok: true;
  runtime: {
    activeModeKnown: boolean;
    activeModeIsProduction: boolean | null;
    integrationEnabledKnown: boolean;
    integrationEnabled: boolean | null;
    productionApiKeyConfigured: boolean;
    productionOrganizationConfigured: boolean;
  };
  database: {
    productionWriteEnabled: boolean;
    automaticMailEnabled: boolean;
    targetOrganizationConfigured: boolean;
    credentialAliasConfigured: boolean;
  };
  safety: {
    checkoutMaintenanceKnown: boolean;
    checkoutMaintenance: boolean | null;
    externalReadsPerformed: 0;
    externalWritesPerformed: 0;
    databaseWritesPerformed: 0;
    jobsCreated: 0;
    claimsPerformed: 0;
    mailsSent: 0;
  };
};

export function buildLexwareRuntimeReadiness(
  input: LexwareRuntimeReadinessInput,
): LexwareRuntimeReadiness {
  const activeModeKnown =
    input.runtimeSummary.activeModeConfigured &&
    input.runtimeSummary.activeModeValid &&
    input.runtimeSummary.activeMode !== null;

  const integrationEnabledKnown =
    input.runtimeSummary.integrationEnabledConfigured &&
    input.runtimeSummary.integrationEnabledValid &&
    typeof input.runtimeSummary.integrationEnabled === "boolean";

  return {
    ok: true,
    runtime: {
      activeModeKnown,
      activeModeIsProduction: activeModeKnown
        ? input.runtimeSummary.activeMode === "production"
        : null,
      integrationEnabledKnown,
      integrationEnabled: integrationEnabledKnown
        ? input.runtimeSummary.integrationEnabled
        : null,
      productionApiKeyConfigured:
        input.runtimeSummary.productionApiKeyConfigured,
      productionOrganizationConfigured:
        input.runtimeSummary.productionOrganizationConfigured,
    },
    database: {
      productionWriteEnabled:
        input.databaseSettings.productionWriteEnabled,
      automaticMailEnabled:
        input.databaseSettings.automaticMailEnabled,
      targetOrganizationConfigured:
        input.databaseSettings.targetOrganizationConfigured,
      credentialAliasConfigured:
        input.databaseSettings.credentialAliasConfigured,
    },
    safety: {
      checkoutMaintenanceKnown: input.checkoutMaintenance.known,
      checkoutMaintenance: input.checkoutMaintenance.known
        ? input.checkoutMaintenance.value
        : null,
      externalReadsPerformed: 0,
      externalWritesPerformed: 0,
      databaseWritesPerformed: 0,
      jobsCreated: 0,
      claimsPerformed: 0,
      mailsSent: 0,
    },
  };
}
