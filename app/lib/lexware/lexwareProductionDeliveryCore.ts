import { createHash } from "node:crypto";

export const LEXWARE_PDF_BUCKET = "lexware-invoice-pdfs";
export const LEXWARE_PDF_MIN_BYTES = 100;
export const LEXWARE_PDF_MAX_BYTES = 10 * 1024 * 1024;
export const LEXWARE_PDF_PREPARE_CONFIRMATION = "PREPARE_SINGLE_NATIVE_LEXWARE_INVOICE_PDF";
export const LEXWARE_MAIL_ENQUEUE_CONFIRMATION = "ENQUEUE_SINGLE_NATIVE_LEXWARE_INVOICE_MAIL";
export const LEXWARE_MAIL_ACTIVATE_CONFIRMATION = "ACTIVATE_SINGLE_NATIVE_LEXWARE_INVOICE_MAIL";
export const LEXWARE_MAIL_PROCESS_CONFIRMATION = "PROCESS_SINGLE_NATIVE_LEXWARE_INVOICE_MAIL";

export type LexwareMailEnvironment = Readonly<Record<string, string | undefined>>;

export type LexwareMailTransportConfiguration = {
  host: string;
  port: 465 | 587;
  user: string;
  pass: string;
  from: string;
};

const firstConfiguredValue = (environment: LexwareMailEnvironment, names: readonly string[]) => {
  for (const name of names) {
    const value = environment[name]?.trim();
    if (value) return value;
  }
  return null;
};

export function resolveLexwareMailSenderAddress(environment: LexwareMailEnvironment) {
  const from = firstConfiguredValue(environment, [
    "SMTP_FROM", "EMAIL_FROM", "MAIL_FROM", "IONOS_SMTP_FROM", "ADMIN_MAIL_FROM",
  ]);
  if (!from) throw new Error("SMTP_SENDER_CONFIGURATION_INCOMPLETE");
  return from;
}

export function resolveLexwareMailTransportConfiguration(
  environment: LexwareMailEnvironment,
): LexwareMailTransportConfiguration {
  const rawPort = Number(firstConfiguredValue(environment, [
    "SMTP_PORT", "EMAIL_SERVER_PORT", "EMAIL_PORT", "MAIL_PORT", "IONOS_SMTP_PORT",
  ]) ?? 587);
  if (rawPort !== 465 && rawPort !== 587) throw new Error("SMTP_CONFIGURATION_INVALID");
  const user = firstConfiguredValue(environment, [
    "SMTP_USER", "SMTP_USERNAME", "SMTP_AUTH_USER", "EMAIL_SERVER_USER", "EMAIL_USER", "MAIL_USER", "IONOS_SMTP_USER",
  ]);
  const pass = firstConfiguredValue(environment, [
    "SMTP_PASS", "SMTP_PASSWORD", "SMTP_AUTH_PASS", "EMAIL_SERVER_PASSWORD", "EMAIL_PASSWORD", "MAIL_PASSWORD", "IONOS_SMTP_PASSWORD",
  ]);
  if (!user || !pass) throw new Error("SMTP_CONFIGURATION_INCOMPLETE");
  return {
    host: firstConfiguredValue(environment, [
      "SMTP_HOST", "SMTP_SERVER", "EMAIL_SERVER_HOST", "EMAIL_HOST", "MAIL_HOST", "IONOS_SMTP_HOST",
    ]) ?? "smtp.ionos.de",
    port: rawPort,
    user,
    pass,
    from: resolveLexwareMailSenderAddress(environment),
  };
}

export type StoredPdf = {
  bucket: typeof LEXWARE_PDF_BUCKET;
  path: string;
  sha256: string;
  sizeBytes: number;
  contentType: "application/pdf";
  filename: string;
  fetchedAt: string;
  storedAt: string;
};

const safePathPart = (value: string, label: string) => {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("..") || trimmed.includes("\\") || /%2f|%5c/i.test(trimmed)) {
    throw new Error(`${label}_INVALID`);
  }
  const normalized = trimmed.replace(/[^A-Za-z0-9._-]/g, "-");
  if (!normalized || normalized === "." || normalized === "..") throw new Error(`${label}_INVALID`);
  return normalized;
};

export function sanitizePdfFilename(value: string) {
  const base = value.trim().split(/[\\/]/).at(-1)?.replace(/[\r\n";]/g, "-") ?? "";
  const normalized = base.replace(/[^A-Za-z0-9._ -]/g, "-").replace(/\s+/g, " ").trim();
  if (!normalized || !normalized.toLowerCase().endsWith(".pdf")) return "Lexware-Rechnung.pdf";
  return normalized.slice(0, 180);
}

export function buildLexwarePdfStoragePath(input: {
  organizationId: string;
  lexwareInvoiceId: string;
  sha256: string;
}) {
  if (!/^[a-f0-9]{64}$/.test(input.sha256)) throw new Error("LEXWARE_PDF_HASH_INVALID");
  return [
    "lexware-invoices",
    safePathPart(input.organizationId, "ORGANIZATION"),
    safePathPart(input.lexwareInvoiceId, "EXTERNAL_INVOICE"),
    `${input.sha256}.pdf`,
  ].join("/");
}

export function validateLexwarePdf(content: Uint8Array, contentType: string) {
  if (contentType.split(";", 1)[0].trim().toLowerCase() !== "application/pdf") {
    throw new Error("LEXWARE_PDF_CONTENT_TYPE_INVALID");
  }
  if (content.byteLength < LEXWARE_PDF_MIN_BYTES) throw new Error("LEXWARE_PDF_TOO_SMALL");
  if (content.byteLength > LEXWARE_PDF_MAX_BYTES) throw new Error("LEXWARE_PDF_TOO_LARGE");
  if (new TextDecoder().decode(content.slice(0, 5)) !== "%PDF-") throw new Error("LEXWARE_PDF_SIGNATURE_INVALID");
  return {
    sha256: createHash("sha256").update(content).digest("hex"),
    sizeBytes: content.byteLength,
    contentType: "application/pdf" as const,
  };
}

export function verifyStoredPdf(content: Uint8Array, metadata: StoredPdf) {
  const actual = validateLexwarePdf(content, metadata.contentType);
  if (actual.sha256 !== metadata.sha256 || actual.sizeBytes !== metadata.sizeBytes) {
    throw new Error("LEXWARE_PDF_STORAGE_MISMATCH");
  }
  if (metadata.bucket !== LEXWARE_PDF_BUCKET
      || metadata.path !== buildLexwarePdfStoragePath({
        organizationId: metadata.path.split("/")[1] ?? "",
        lexwareInvoiceId: metadata.path.split("/")[2] ?? "",
        sha256: metadata.sha256,
      })) throw new Error("LEXWARE_PDF_PATH_MISMATCH");
  return actual;
}

export function buildDeterministicMailMessageId(input: {
  mailJobId: string;
  idempotencyKey: string;
  pdfSha256: string;
}) {
  const digest = createHash("sha256")
    .update(`${input.mailJobId}:${input.idempotencyKey}:${input.pdfSha256}`, "utf8")
    .digest("hex");
  return `<lexware-invoice-${digest}@handzettel-schulen.de>`;
}

export type MailProcessOutcome = "sent" | "definite_not_sent" | "ambiguous_send";

export async function sendClaimedMailAtMostOnce(input: {
  pdf: Uint8Array;
  metadata: StoredPdf;
  validateTransport(): void;
  markSendStarted(messageId: string): Promise<void>;
  send(messageId: string): Promise<{ messageId: string }>;
  complete(messageId: string): Promise<void>;
  recordDefiniteFailure(code: string): Promise<void>;
  recordAmbiguous(reason: string): Promise<void>;
  messageId: string;
}) {
  verifyStoredPdf(input.pdf, input.metadata);
  try {
    input.validateTransport();
  } catch (error) {
    await input.recordDefiniteFailure(error instanceof Error ? error.message : "SMTP_CONFIGURATION_INVALID");
    return { outcome: "definite_not_sent", smtpCalls: 0 } as const;
  }
  await input.markSendStarted(input.messageId);
  try {
    const result = await input.send(input.messageId);
    if (result.messageId !== input.messageId) throw new Error("SMTP_MESSAGE_ID_MISMATCH");
    await input.complete(input.messageId);
    return { outcome: "sent", smtpCalls: 1 } as const;
  } catch (error) {
    await input.recordAmbiguous(error instanceof Error ? error.message : "SMTP_RESULT_AMBIGUOUS");
    return { outcome: "ambiguous_send", smtpCalls: 1 } as const;
  }
}
