export const PAYPAL_EXPECTED_CURRENCY = "EUR";

export type PayPalPaymentErrorCode =
  | "ORDER_NOT_FOUND"
  | "ORDER_MISMATCH"
  | "CAPTURE_AMOUNT_MISMATCH"
  | "CAPTURE_CURRENCY_MISMATCH"
  | "WEBHOOK_ALREADY_PROCESSED"
  | "INVALID_CAPTURE_STATUS"
  | "PAYMENT_FINGERPRINT_MISMATCH"
  | "CAPTURE_ID_CONFLICT"
  | "PAYPAL_EVENT_ID_CONFLICT"
  | "PAYPAL_ORDER_ALREADY_EXISTS"
  | "PAYMENT_ALREADY_CLAIMED";

export class PayPalPaymentValidationError extends Error {
  readonly code: PayPalPaymentErrorCode;

  constructor(code: PayPalPaymentErrorCode, message: string) {
    super(message);
    this.name = "PayPalPaymentValidationError";
    this.code = code;
  }
}

export type PayPalOrderIdentity = {
  orderId: string;
  customId: string;
  referenceId: string;
  invoiceId: string;
};

type StoredPayPalOrderPayload = {
  id?: unknown;
  purchase_units?: Array<{
    custom_id?: unknown;
    reference_id?: unknown;
    invoice_id?: unknown;
  }>;
};

export function getStoredPayPalOrderIdentity(input: {
  paypalOrderId: string | null;
  paymentProviderPayload: unknown;
}): PayPalOrderIdentity {
  const payload =
    input.paymentProviderPayload &&
    typeof input.paymentProviderPayload === "object" &&
    !Array.isArray(input.paymentProviderPayload)
      ? (input.paymentProviderPayload as StoredPayPalOrderPayload)
      : null;
  const purchaseUnit = payload?.purchase_units?.[0];
  const orderId = String(input.paypalOrderId || "").trim();
  const payloadOrderId = String(payload?.id || "").trim();
  const customId = String(purchaseUnit?.custom_id || "").trim();
  const referenceId = String(purchaseUnit?.reference_id || "").trim();
  const invoiceId = String(purchaseUnit?.invoice_id || "").trim();

  if (!orderId || !payloadOrderId || !customId || !referenceId || !invoiceId) {
    throw new PayPalPaymentValidationError(
      "ORDER_NOT_FOUND",
      "Die gespeicherte PayPal-Order ist unvollständig.",
    );
  }
  if (payloadOrderId !== orderId) {
    throw new PayPalPaymentValidationError(
      "ORDER_MISMATCH",
      "Gespeicherte PayPal-Order und Provider-Payload stimmen nicht überein.",
    );
  }

  return { orderId, customId, referenceId, invoiceId };
}

export function decimalToCents(value: number | string | null | undefined): bigint | null {
  if (value === null || value === "") return null;
  const raw = typeof value === "number" ? String(value) : String(value).trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) return null;
  const fractional = (match[2] || "").padEnd(2, "0");
  return BigInt(match[1]) * 100n + BigInt(fractional || "0");
}

export type PayPalCaptureStatusDisposition = "completed" | "pending" | "error";

// PayPal intermediate states remain retryable; terminal/unknown states use the error path.
export function classifyPayPalCaptureStatus(
  status: string | null | undefined,
): PayPalCaptureStatusDisposition {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "COMPLETED") return "completed";
  if (normalized === "PENDING" || normalized === "APPROVED" || normalized === "CREATED") {
    return "pending";
  }
  return "error";
}

export function validatePayPalCompletedPayment(input: {
  expectedOrder: PayPalOrderIdentity;
  invoiceToken: string;
  invoiceTotalAmount: number | string | null;
  orderId: string | null;
  customId: string | null;
  referenceId: string | null;
  invoiceId: string | null;
  captureStatus: string | null;
  captureAmount: string | null;
  captureCurrency: string | null;
}) {
  if (!input.orderId) {
    throw new PayPalPaymentValidationError("ORDER_NOT_FOUND", "PayPal-Order fehlt.");
  }
  if (
    input.orderId !== input.expectedOrder.orderId ||
    input.customId !== input.expectedOrder.customId ||
    input.customId !== input.invoiceToken ||
    input.referenceId !== input.expectedOrder.referenceId ||
    input.referenceId !== input.invoiceToken ||
    input.invoiceId !== input.expectedOrder.invoiceId
  ) {
    throw new PayPalPaymentValidationError(
      "ORDER_MISMATCH",
      "PayPal-Order gehört nicht zu dieser Rechnung.",
    );
  }
  if (classifyPayPalCaptureStatus(input.captureStatus) !== "completed") {
    throw new PayPalPaymentValidationError(
      "INVALID_CAPTURE_STATUS",
      "PayPal-Capture ist nicht abgeschlossen.",
    );
  }
  if (String(input.captureCurrency || "").toUpperCase() !== PAYPAL_EXPECTED_CURRENCY) {
    throw new PayPalPaymentValidationError(
      "CAPTURE_CURRENCY_MISMATCH",
      "PayPal-Capture verwendet nicht EUR.",
    );
  }

  const expectedCents = decimalToCents(input.invoiceTotalAmount);
  const capturedCents = decimalToCents(input.captureAmount);
  if (expectedCents === null || capturedCents === null || expectedCents !== capturedCents) {
    throw new PayPalPaymentValidationError(
      "CAPTURE_AMOUNT_MISMATCH",
      "PayPal-Capture-Betrag stimmt nicht exakt mit der Rechnung überein.",
    );
  }
}
