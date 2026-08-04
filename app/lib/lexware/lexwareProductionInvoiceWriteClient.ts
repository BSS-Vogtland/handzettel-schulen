import "server-only";

import {
  getLexwareRuntimeConfigurationSummary,
  requireLexwareConnectionConfiguration,
} from "./lexwareConfig";
import { evaluateLexwareProductionGates } from "./lexwareProductionInvoiceJob";
import {
  executeLexwareProductionInvoiceWrite as executeCoreWrite,
  LEXWARE_PRODUCTION_FINALIZE_CONFIRMATION,
  LexwareProductionInvoiceWriteError,
  type CreateLexwareProductionInvoiceInput,
  type LexwareProductionCreateResult,
  type LexwareProductionWriteDependencies,
} from "./lexwareProductionInvoiceWriteCore";

export {
  LEXWARE_PRODUCTION_FINALIZE_CONFIRMATION,
  LexwareProductionInvoiceWriteError,
};
export type {
  CreateLexwareProductionInvoiceInput,
  LexwareProductionCreateResult,
  LexwareProductionWriteDependencies,
};

export function executeLexwareProductionInvoiceWrite(
  input: CreateLexwareProductionInvoiceInput,
  dependencies: Omit<LexwareProductionWriteDependencies, "evaluateGates">,
) {
  return executeCoreWrite(input, {
    ...dependencies,
    evaluateGates: evaluateLexwareProductionGates,
  });
}

export async function createLexwareProductionFinalInvoice(
  input: CreateLexwareProductionInvoiceInput,
  expectedOrganizationId: string,
): Promise<LexwareProductionCreateResult> {
  const runtimeConfiguration = getLexwareRuntimeConfigurationSummary();
  const connectionConfiguration = requireLexwareConnectionConfiguration("production");
  if (connectionConfiguration.organizationId !== expectedOrganizationId) {
    throw new LexwareProductionInvoiceWriteError(
      "LEXWARE_PRODUCTION_ORGANIZATION_MISMATCH",
      "Die validierte Zielorganisation stimmt nicht mit der Production-Verbindung überein.",
      "definite_not_created",
    );
  }
  return executeCoreWrite(input, {
    fetchImplementation: fetch,
    runtimeConfiguration,
    connectionConfiguration,
    evaluateGates: evaluateLexwareProductionGates,
    currentTime: () => new Date().toISOString(),
  });
}
