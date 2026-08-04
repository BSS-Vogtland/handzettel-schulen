const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LexwareProductionOrganizationResult = {
  organizationId: string;
  matches: true;
};

export class LexwareProductionOrganizationError extends Error {
  readonly code:
    | "JOB_ORGANIZATION_MISSING"
    | "DATABASE_ORGANIZATION_MISSING"
    | "RUNTIME_ORGANIZATION_MISSING"
    | "ORGANIZATION_FORMAT_INVALID"
    | "ORGANIZATION_MISMATCH";

  constructor(code: LexwareProductionOrganizationError["code"]) {
    super(code);
    this.name = "LexwareProductionOrganizationError";
    this.code = code;
  }
}

export function validateLexwareProductionOrganization(input: {
  jobOrganizationId: unknown;
  databaseOrganizationId: unknown;
  runtimeOrganizationId: unknown;
}): LexwareProductionOrganizationResult {
  const job = typeof input.jobOrganizationId === "string" ? input.jobOrganizationId.trim() : "";
  const database = typeof input.databaseOrganizationId === "string" ? input.databaseOrganizationId.trim() : "";
  const runtime = typeof input.runtimeOrganizationId === "string" ? input.runtimeOrganizationId.trim() : "";
  if (!job) throw new LexwareProductionOrganizationError("JOB_ORGANIZATION_MISSING");
  if (!database) throw new LexwareProductionOrganizationError("DATABASE_ORGANIZATION_MISSING");
  if (!runtime) throw new LexwareProductionOrganizationError("RUNTIME_ORGANIZATION_MISSING");
  if (!UUID.test(job) || !UUID.test(database) || !UUID.test(runtime)) {
    throw new LexwareProductionOrganizationError("ORGANIZATION_FORMAT_INVALID");
  }
  if (job !== database || job !== runtime) {
    throw new LexwareProductionOrganizationError("ORGANIZATION_MISMATCH");
  }
  return { organizationId: job, matches: true };
}
