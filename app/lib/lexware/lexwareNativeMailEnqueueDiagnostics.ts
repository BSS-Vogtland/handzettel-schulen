export const NATIVE_MAIL_ENQUEUE_STAGES = [
  "manual_gate",
  "invoice_load",
  "snapshot_build",
  "sender_resolve",
  "rpc_execution",
] as const;

export type NativeMailEnqueueStage = (typeof NATIVE_MAIL_ENQUEUE_STAGES)[number];

export type NativeMailEnqueueReason =
  | "NATIVE_MAIL_SENDER_INVALID"
  | "NATIVE_MAIL_SNAPSHOT_INVALID"
  | "NATIVE_MAIL_PDF_BINDING_MISMATCH"
  | "NATIVE_MAIL_IDEMPOTENCY_CONFLICT"
  | "NATIVE_MAIL_RPC_CAS_MISMATCH"
  | "NATIVE_MAIL_DB_CONSTRAINT_BLOCKED"
  | "NATIVE_MAIL_ALREADY_EXISTS"
  | "NATIVE_MAIL_RUNTIME_GATE_BLOCKED"
  | "NATIVE_MAIL_UNKNOWN_BLOCKER";

export class NativeMailEnqueueStageError extends Error {
  readonly stage: NativeMailEnqueueStage;
  readonly internalError: unknown;

  constructor(stage: NativeMailEnqueueStage, internalError: unknown) {
    super("NATIVE_MAIL_ENQUEUE_STAGE_BLOCKED");
    this.name = "NativeMailEnqueueStageError";
    this.stage = stage;
    this.internalError = internalError;
  }
}

export async function runNativeMailEnqueueStage<T>(
  stage: NativeMailEnqueueStage,
  operation: () => T | Promise<T>,
) {
  try {
    return await operation();
  } catch (error) {
    throw new NativeMailEnqueueStageError(stage, error);
  }
}

const readErrorField = (error: unknown, field: "code" | "message") => {
  if (!error || typeof error !== "object") return "";
  const value = Reflect.get(error, field);
  return typeof value === "string" ? value : "";
};

const includesAny = (value: string, allowedFragments: readonly string[]) =>
  allowedFragments.some((fragment) => value.includes(fragment));

export function classifyNativeMailEnqueueError(error: unknown): {
  reason: NativeMailEnqueueReason;
  stage: NativeMailEnqueueStage;
} {
  const wrapped = error instanceof NativeMailEnqueueStageError ? error : null;
  const stage = wrapped?.stage ?? "rpc_execution";
  const internalError = wrapped?.internalError ?? error;
  const code = readErrorField(internalError, "code").toUpperCase();
  const message = readErrorField(internalError, "message");

  if (stage === "sender_resolve" || includesAny(message, [
    "SMTP_SENDER_CONFIGURATION_INCOMPLETE",
    "SMTP_SENDER_CONFIGURATION_INVALID",
    "Absender-E-Mail ist ung",
    "Reply-To-E-Mail ist ung",
    "Absendername fehlt",
  ])) return { reason: "NATIVE_MAIL_SENDER_INVALID", stage };

  if (stage === "manual_gate" || includesAny(message, [
    "RUNTIME_SETTINGS_NOT_FOUND",
    "AUTOMATIC_MAIL_MUST_REMAIN_DISABLED",
    "business_runtime_settings/default fehlt",
  ])) return { reason: "NATIVE_MAIL_RUNTIME_GATE_BLOCKED", stage };

  if (includesAny(message, ["NATIVE_MAIL_PDF_NOT_READY", "PDF_NOT_READY", "PDF_BINDING_MISMATCH"])) {
    return { reason: "NATIVE_MAIL_PDF_BINDING_MISMATCH", stage };
  }

  if (code === "23505") return { reason: "NATIVE_MAIL_ALREADY_EXISTS", stage };
  if (["23514", "23503", "23502", "42703", "42702"].includes(code)) {
    return { reason: "NATIVE_MAIL_DB_CONSTRAINT_BLOCKED", stage };
  }

  if (includesAny(message, [
    "abweichenden Idempotenzschl",
    "anderen Mail-Snapshot",
    "andere Empf",
    "paralleler Rechnungs-Mailjob",
  ])) return { reason: "NATIVE_MAIL_IDEMPOTENCY_CONFLICT", stage };

  if (includesAny(message, [
    "NATIVE_MAIL_ENQUEUE_PRECONDITION_BLOCKED",
    "Empf\u00e4nger-E-Mail ist ung",
    "E-Mail-Betreff fehlt",
    "Text-E-Mail fehlt",
    "HTML-E-Mail fehlt",
    "PDF-Dateiname ist ung",
    "mail_payload_snapshot muss ein JSON-Objekt sein",
  ])) return { reason: "NATIVE_MAIL_SNAPSHOT_INVALID", stage };

  if (code === "P0001" && includesAny(message, [
    "Status",
    "Rechnungsjob und lokale Rechnung",
    "verweist nicht auf den erwarteten Lexware-Job",
    "Lexware-Identit\u00e4t",
    "bereits versandt",
  ])) return { reason: "NATIVE_MAIL_RPC_CAS_MISMATCH", stage };

  return { reason: "NATIVE_MAIL_UNKNOWN_BLOCKER", stage };
}
