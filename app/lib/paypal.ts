import { createHash } from "node:crypto";
import { decimalToCents } from "@/app/lib/paypalPaymentValidation";

type PayPalAccessTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type PayPalLink = {
  href?: string;
  rel?: string;
  method?: string;
};

type PayPalCreateOrderResponse = {
  id?: string;
  status?: string;
  links?: PayPalLink[];
  message?: string;
  details?: Array<{
    issue?: string;
    description?: string;
  }>;
};

type PayPalCaptureResponse = {
  id?: string;
  status?: string;
  message?: string;
  details?: Array<{
    issue?: string;
    description?: string;
  }>;
  payer?: {
    email_address?: string;
    payer_id?: string;
    name?: {
      given_name?: string;
      surname?: string;
    };
  };
  purchase_units?: Array<{
    reference_id?: string;
    custom_id?: string;
    invoice_id?: string;
    payments?: {
      captures?: Array<{
        id?: string;
        status?: string;
        amount?: {
          currency_code?: string;
          value?: string;
        };
      }>;
    };
  }>;
};

type PayPalVerifyWebhookResponse = {
  verification_status?: "SUCCESS" | "FAILURE" | string;
  message?: string;
  name?: string;
  debug_id?: string;
};

export type PayPalOrderResult = {
  orderId: string;
  approvalUrl: string;
  raw: PayPalCreateOrderResponse;
};

export type PayPalCaptureResult = {
  orderId: string;
  captureId: string | null;
  status: string | null;
  payerEmail: string | null;
  amountValue: string | null;
  currencyCode: string | null;
  customId: string | null;
  referenceId: string | null;
  invoiceId: string | null;
  raw: PayPalCaptureResponse;
};

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Umgebungsvariable fehlt: ${name}`);
  }

  return value;
}

function getPayPalEnvironment() {
  const rawEnv = getRequiredEnv("PAYPAL_ENV").trim().toLowerCase();

  if (rawEnv !== "sandbox" && rawEnv !== "live") {
    throw new Error("PAYPAL_ENV muss explizit 'sandbox' oder 'live' sein.");
  }

  return rawEnv;
}

function getPayPalBaseUrl() {
  const env = getPayPalEnvironment();

  if (env === "live") {
    return "https://api-m.paypal.com";
  }

  return "https://api-m.sandbox.paypal.com";
}

function toMoneyString(value: number) {
  return value.toFixed(2);
}

function cleanPayPalInvoiceId(value: string) {
  return value
    .replace(/[^a-zA-Z0-9\-_]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 127);
}

export function buildPayPalPaymentFingerprint(params: {
  invoiceToken: string;
  invoiceNumber: string;
  totalAmount: number | string;
  currency: string;
  intent?: "CAPTURE";
}) {
  const cents = decimalToCents(params.totalAmount);
  const currency = params.currency.trim().toUpperCase();
  if (cents === null || currency !== "EUR") {
    throw new Error("Ungültige PayPal-Zahlungsgrundlage.");
  }
  return createHash("sha256")
    .update([
      "paypal-payment-v1",
      params.invoiceToken,
      params.invoiceNumber,
      cents.toString(),
      currency,
      params.intent || "CAPTURE",
    ].join("|"), "utf8")
    .digest("hex");
}

function buildOperationRequestId(operation: "create" | "capture", fingerprint: string, orderId = "") {
  const digest = createHash("sha256")
    .update(`${operation}|${fingerprint}|${orderId}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `hs-${operation}-${digest}`;
}

export function buildPayPalInvoiceId(params: {
  invoiceNumber: string;
  paymentFingerprint: string;
}) {
  return cleanPayPalInvoiceId(`${params.invoiceNumber}-${params.paymentFingerprint.slice(0, 20)}`);
}

export function buildPayPalCreateRequestId(paymentFingerprint: string) {
  return buildOperationRequestId("create", paymentFingerprint);
}

export function buildPayPalCaptureRequestId(params: { orderId: string; paymentFingerprint: string }) {
  return buildOperationRequestId("capture", params.paymentFingerprint, params.orderId);
}

async function getPayPalAccessToken(fetchImpl: typeof fetch = fetch) {
  const clientId = getRequiredEnv("PAYPAL_CLIENT_ID");
  const clientSecret = getRequiredEnv("PAYPAL_CLIENT_SECRET");
  const baseUrl = getPayPalBaseUrl();

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );

  const response = await fetchImpl(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  const payload = (await response
    .json()
    .catch(() => ({}))) as PayPalAccessTokenResponse;

  if (!response.ok || !payload.access_token) {
    throw new Error(
      `PayPal Access Token konnte nicht geladen werden: ${
        payload.error_description || payload.error || response.statusText
      }`
    );
  }

  return payload.access_token;
}

export async function createPayPalOrder(params: {
  invoiceToken: string;
  invoiceNumber: string;
  requestNumber?: string | null;
  totalAmount: number;
  currency?: string | null;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  paymentFingerprint: string;
  fetchImpl?: typeof fetch;
}): Promise<PayPalOrderResult> {
  const accessToken = await getPayPalAccessToken(params.fetchImpl);
  const baseUrl = getPayPalBaseUrl();
  const currency = params.currency || "EUR";

  const paypalInvoiceId = buildPayPalInvoiceId({
    invoiceNumber: params.invoiceNumber,
    paymentFingerprint: params.paymentFingerprint,
  });

  const response = await (params.fetchImpl || fetch)(`${baseUrl}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      "PayPal-Request-Id": buildPayPalCreateRequestId(params.paymentFingerprint),
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: params.invoiceToken,
          invoice_id: paypalInvoiceId,
          custom_id: params.invoiceToken,
          description: params.description.slice(0, 127),
          amount: {
            currency_code: currency,
            value: toMoneyString(params.totalAmount),
          },
        },
      ],
      application_context: {
        brand_name: "Handzettel-Schulen.de",
        landing_page: "LOGIN",
        user_action: "PAY_NOW",
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
      },
    }),
    cache: "no-store",
  });

  const payload = (await response
    .json()
    .catch(() => ({}))) as PayPalCreateOrderResponse;

  if (!response.ok || !payload.id) {
    const detailMessage = payload.details?.[0]?.description || payload.message;

    throw new Error(
      `PayPal Order konnte nicht erstellt werden: ${
        detailMessage || response.statusText
      }`
    );
  }

  const approvalUrl = payload.links?.find((link) => link.rel === "approve")?.href;

  if (!approvalUrl) {
    throw new Error("PayPal hat keinen Freigabe-Link zurückgegeben.");
  }

  return {
    orderId: payload.id,
    approvalUrl,
    raw: payload,
  };
}

export async function capturePayPalOrder(params: {
  orderId: string;
  paymentFingerprint: string;
  fetchImpl?: typeof fetch;
}): Promise<PayPalCaptureResult> {
  const accessToken = await getPayPalAccessToken(params.fetchImpl);
  const baseUrl = getPayPalBaseUrl();

  const response = await (params.fetchImpl || fetch)(
    `${baseUrl}/v2/checkout/orders/${params.orderId}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        "PayPal-Request-Id": buildPayPalCaptureRequestId(params),
      },
      cache: "no-store",
    }
  );

  const payload = (await response
    .json()
    .catch(() => ({}))) as PayPalCaptureResponse;

  if (!response.ok) {
    const detailMessage = payload.details?.[0]?.description || payload.message;

    throw new Error(
      `PayPal Zahlung konnte nicht abgeschlossen werden: ${
        detailMessage || response.statusText
      }`
    );
  }

  const purchaseUnit = payload.purchase_units?.[0] || null;
  const capture = purchaseUnit?.payments?.captures?.[0] || null;

  return {
    orderId: payload.id || params.orderId,
    captureId: capture?.id || null,
    status: capture?.status || payload.status || null,
    payerEmail: payload.payer?.email_address || null,
    amountValue: capture?.amount?.value || null,
    currencyCode: capture?.amount?.currency_code || null,
    customId: purchaseUnit?.custom_id || null,
    referenceId: purchaseUnit?.reference_id || null,
    invoiceId: purchaseUnit?.invoice_id || null,
    raw: payload,
  };
}

export async function verifyPayPalWebhookSignature(params: {
  headers: Headers;
  webhookEvent: unknown;
}) {
  const webhookId = getRequiredEnv("PAYPAL_WEBHOOK_ID");
  const accessToken = await getPayPalAccessToken();
  const baseUrl = getPayPalBaseUrl();

  const transmissionId = params.headers.get("paypal-transmission-id");
  const transmissionTime = params.headers.get("paypal-transmission-time");
  const certUrl = params.headers.get("paypal-cert-url");
  const authAlgo = params.headers.get("paypal-auth-algo");
  const transmissionSig = params.headers.get("paypal-transmission-sig");

  if (
    !transmissionId ||
    !transmissionTime ||
    !certUrl ||
    !authAlgo ||
    !transmissionSig
  ) {
    return {
      ok: false,
      status: null,
      message: "PayPal Webhook Header unvollständig.",
    };
  }

  const response = await fetch(
    `${baseUrl}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transmission_id: transmissionId,
        transmission_time: transmissionTime,
        cert_url: certUrl,
        auth_algo: authAlgo,
        transmission_sig: transmissionSig,
        webhook_id: webhookId,
        webhook_event: params.webhookEvent,
      }),
      cache: "no-store",
    }
  );

  const payload = (await response
    .json()
    .catch(() => ({}))) as PayPalVerifyWebhookResponse;

  if (!response.ok) {
    return {
      ok: false,
      status: payload.verification_status || null,
      message:
        payload.message || "PayPal Webhook konnte nicht verifiziert werden.",
    };
  }

  const verificationStatus = payload.verification_status || null;
  const isVerified = verificationStatus === "SUCCESS";

  return {
    ok: isVerified,
    status: verificationStatus,
    message: isVerified
      ? "PayPal Webhook verifiziert."
      : "PayPal Webhook-Verifizierung fehlgeschlagen.",
  };
}
