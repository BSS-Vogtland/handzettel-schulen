import "server-only";

import { getLexwareRuntimeConfigurationSummary, requireLexwareConnectionConfiguration, type LexwareConnectionConfiguration, type LexwareRuntimeConfigurationSummary } from "./lexwareConfig";
import { evaluateLexwareProductionGates, type LexwareInvoiceCreationState, type LexwareProductionGateInput } from "./lexwareProductionInvoiceJob";

export const LEXWARE_PRODUCTION_FINALIZE_CONFIRMATION = "LEXWARE_PRODUCTION_FINALIZE_EXACTLY_ONCE_V1" as const;
const RESOURCE_PATH = "/v1/invoices?finalize=true";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class LexwareProductionInvoiceWriteError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly creationState: LexwareInvoiceCreationState,
    readonly httpStatus: number | null = null,
    readonly retryAfterSeconds: number | null = null,
  ) { super(message); this.name = "LexwareProductionInvoiceWriteError"; }
}

export type CreateLexwareProductionInvoiceInput = {
  payload: Record<string, unknown> & { lineItems: unknown[] };
  finalize: true;
  confirmation: typeof LEXWARE_PRODUCTION_FINALIZE_CONFIRMATION;
  gates: LexwareProductionGateInput;
  timeoutMs?: number;
};

export type LexwareProductionWriteDependencies = {
  fetchImplementation: typeof fetch;
  runtimeConfiguration: LexwareRuntimeConfigurationSummary;
  connectionConfiguration: LexwareConnectionConfiguration;
  currentTime: () => string;
  createAbortController?: () => AbortController;
};

export type LexwareProductionCreateResult = {
  id: string; resourceUri: string; createdDate: string;
  updatedDate: string | null; version: number | null;
  requestCount: 1; finalize: true;
  creationState: "definitely_created";
};

function retryAfter(value: string | null) {
  if (!value) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : null;
}

export async function executeLexwareProductionInvoiceWrite(input: CreateLexwareProductionInvoiceInput, dependencies: LexwareProductionWriteDependencies): Promise<LexwareProductionCreateResult> {
  if (input.finalize !== true || input.confirmation !== LEXWARE_PRODUCTION_FINALIZE_CONFIRMATION) {
    throw new LexwareProductionInvoiceWriteError("LEXWARE_PRODUCTION_FINALIZE_REQUIRED", "Der Production-Client erlaubt ausschließlich einen ausdrücklich bestätigten finalize=true-Aufruf.", "definite_not_created");
  }
  if (!input.payload || typeof input.payload !== "object" || !Array.isArray(input.payload.lineItems) || input.payload.lineItems.length === 0) {
    throw new LexwareProductionInvoiceWriteError("LEXWARE_PRODUCTION_PAYLOAD_INVALID", "Der validierte Production-Rechnungspayload fehlt oder besitzt keine Positionen.", "definite_not_created");
  }
  const gateResult = evaluateLexwareProductionGates(input.gates);
  if (!gateResult.allowed) {
    throw new LexwareProductionInvoiceWriteError("LEXWARE_PRODUCTION_GATES_BLOCKED", `Production-Write blockiert: ${gateResult.failedChecks.join(", ")}.`, "definite_not_created");
  }
  const environment = dependencies.runtimeConfiguration;
  if (environment.activeMode !== "production" || !environment.integrationEnabled) {
    throw new LexwareProductionInvoiceWriteError("LEXWARE_PRODUCTION_ENVIRONMENT_BLOCKED", "Die Production-Umgebung ist nicht aktiviert.", "definite_not_created");
  }
  const config = dependencies.connectionConfiguration;
  if (config.mode !== "production" || config.apiKeyEnvironmentVariable !== "LEXWARE_PRODUCTION_API_KEY" || config.organizationIdEnvironmentVariable !== "LEXWARE_PRODUCTION_ORGANIZATION_ID" || !config.apiKey.trim() || config.organizationId.toLowerCase() !== String(input.gates.configuredProductionOrganizationId || "").toLowerCase()) {
    throw new LexwareProductionInvoiceWriteError("LEXWARE_PRODUCTION_CONNECTION_MODE_INVALID", "Der Production-Client akzeptiert ausschließlich eine Production-Verbindung.", "definite_not_created");
  }
  const controller = dependencies.createAbortController?.() ?? new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Math.min(input.timeoutMs ?? 20000, 30000)));
  let response: Response;
  try {
    response = await dependencies.fetchImplementation(`${config.apiBaseUrl}${RESOURCE_PATH}`, {
      method: "POST", headers: { Authorization: `Bearer ${config.apiKey}`, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(input.payload), cache: "no-store", signal: controller.signal,
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    throw new LexwareProductionInvoiceWriteError(timedOut ? "LEXWARE_PRODUCTION_TIMEOUT" : "LEXWARE_PRODUCTION_NETWORK_ERROR", timedOut ? "Zeitüberschreitung nach möglichem Versand." : "Netzwerkabbruch nach möglichem Versand.", "creation_state_unknown");
  } finally { clearTimeout(timeout); }
  const text = await response.text();
  let payload: unknown = null;
  try { payload = text ? JSON.parse(text) : null; } catch { /* classified below */ }
  if (!response.ok) {
    const definite = [400, 401, 403, 404, 422].includes(response.status);
    throw new LexwareProductionInvoiceWriteError("LEXWARE_PRODUCTION_HTTP_ERROR", `Lexware antwortete mit HTTP ${response.status}.`, definite ? "definite_not_created" : "creation_state_unknown", response.status, retryAfter(response.headers.get("retry-after")));
  }
  const record = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
  const id = String(record?.id ?? "").toLowerCase();
  const resourceUri = String(record?.resourceUri ?? "");
  const createdDate = String(record?.createdDate ?? "");
  if (!UUID.test(id) || resourceUri !== `https://api.lexware.io/v1/invoices/${id}` || !Number.isFinite(Date.parse(createdDate))) {
    throw new LexwareProductionInvoiceWriteError("LEXWARE_PRODUCTION_RESPONSE_INVALID", "Lexware lieferte nach möglicher Annahme keine eindeutig verwertbare Erstellungsantwort.", "creation_state_unknown", response.status);
  }
  const updated = String(record?.updatedDate ?? "");
  const version = Number(record?.version);
  dependencies.currentTime();
  return { id, resourceUri, createdDate, updatedDate: Number.isFinite(Date.parse(updated)) ? updated : null, version: Number.isInteger(version) ? version : null, requestCount: 1, finalize: true, creationState: "definitely_created" };
}

export async function createLexwareProductionFinalInvoice(input: CreateLexwareProductionInvoiceInput): Promise<LexwareProductionCreateResult> {
  const runtimeConfiguration = getLexwareRuntimeConfigurationSummary();
  const connectionConfiguration = requireLexwareConnectionConfiguration("production");
  return executeLexwareProductionInvoiceWrite(input, {
    fetchImplementation: fetch,
    runtimeConfiguration,
    connectionConfiguration,
    currentTime: () => new Date().toISOString(),
  });
}
