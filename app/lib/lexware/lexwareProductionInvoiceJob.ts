export type LexwareInvoiceJobStatus =
  | "waiting_for_activation" | "pending" | "processing" | "retry"
  | "succeeded" | "failed" | "manual_review" | "cancelled";

export type LexwareInvoiceCreationState =
  | "not_attempted" | "definite_not_created"
  | "definitely_created" | "creation_state_unknown";

export type LexwareProductionGateInput = {
  activeMode: string | null;
  integrationEnabled: boolean;
  productionApiKeyConfigured: boolean;
  productionOrganizationIdValid: boolean;
  credentialsSeparated: boolean;
  configuredProductionOrganizationId: string | null;
  databaseProductionOrganizationId: string | null;
  productionWriteEnabled: boolean;
  providerAfterCutover: string;
  checkoutMaintenanceActive: boolean;
};

export type LexwareProductionGateResult = {
  allowed: boolean;
  checks: {
    activeModeIsProduction: boolean;
    integrationEnabled: boolean;
    productionApiKeyConfigured: boolean;
    productionOrganizationConfigured: boolean;
    credentialSeparationSafe: boolean;
    environmentAndDatabaseOrganizationMatch: boolean;
    productionWriteEnabled: boolean;
    providerCutoverConfiguredForLexware: boolean;
    checkoutMaintenanceActive: boolean;
  };
  failedChecks: string[];
};

export function evaluateLexwareProductionGates(input: LexwareProductionGateInput): LexwareProductionGateResult {
  const normalize = (value: string | null) => value?.trim().toLowerCase() || null;
  const checks = {
    activeModeIsProduction: input.activeMode === "production",
    integrationEnabled: input.integrationEnabled === true,
    productionApiKeyConfigured: input.productionApiKeyConfigured === true,
    productionOrganizationConfigured: input.productionOrganizationIdValid === true,
    credentialSeparationSafe: input.credentialsSeparated === true,
    environmentAndDatabaseOrganizationMatch:
      normalize(input.configuredProductionOrganizationId) !== null &&
      normalize(input.configuredProductionOrganizationId) === normalize(input.databaseProductionOrganizationId),
    productionWriteEnabled: input.productionWriteEnabled === true,
    providerCutoverConfiguredForLexware: input.providerAfterCutover === "lexware",
    checkoutMaintenanceActive: input.checkoutMaintenanceActive === true,
  };
  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return { allowed: failedChecks.length === 0, checks, failedChecks };
}

export function canAttemptExternalWrite(status: LexwareInvoiceJobStatus, creationState: LexwareInvoiceCreationState) {
  return (status === "pending" && (creationState === "not_attempted" || creationState === "definite_not_created"))
    || (status === "retry" && creationState === "definite_not_created");
}

export type LexwareInvoiceJobSemanticInput = {
  status: LexwareInvoiceJobStatus;
  creationState: LexwareInvoiceCreationState;
  lexwareInvoiceId?: string | null;
  lexwareInvoiceNumber?: string | null;
  completedAt?: string | null;
};

export function isValidJobCreationStateCombination(input: LexwareInvoiceJobSemanticInput) {
  const { status, creationState } = input;
  if (creationState === "creation_state_unknown") return status === "manual_review";
  if (status === "waiting_for_activation") return creationState === "not_attempted";
  if (status === "pending") return creationState === "not_attempted" || creationState === "definite_not_created";
  if (status === "retry") return creationState === "definite_not_created";
  if (status === "succeeded") return creationState === "definitely_created" && Boolean(input.lexwareInvoiceId?.trim()) && Boolean(input.lexwareInvoiceNumber?.trim()) && Boolean(input.completedAt && Number.isFinite(Date.parse(input.completedAt)));
  if (status === "failed") return true;
  return true;
}
