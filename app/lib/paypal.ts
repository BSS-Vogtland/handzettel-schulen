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
  raw: PayPalCaptureResponse;
};

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Umgebungsvariable fehlt: ${name}`);
  }

  return value;
}

function getPayPalBaseUrl() {
  const env = process.env.PAYPAL_ENV || "sandbox";

  if (env === "live") {
    return "https://api-m.paypal.com";
  }

  return "https://api-m.sandbox.paypal.com";
}

function toMoneyString(value: number) {
  return value.toFixed(2);
}

async function getPayPalAccessToken() {
  const clientId = getRequiredEnv("PAYPAL_CLIENT_ID");
  const clientSecret = getRequiredEnv("PAYPAL_CLIENT_SECRET");
  const baseUrl = getPayPalBaseUrl();

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );

  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as PayPalAccessTokenResponse;

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
}): Promise<PayPalOrderResult> {
  const accessToken = await getPayPalAccessToken();
  const baseUrl = getPayPalBaseUrl();
  const currency = params.currency || "EUR";

  const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      "PayPal-Request-Id": `hs-${params.invoiceToken}-${Date.now()}`,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: params.invoiceToken,
          invoice_id: params.invoiceNumber,
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

  const payload = (await response.json().catch(() => ({}))) as PayPalCreateOrderResponse;

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
}): Promise<PayPalCaptureResult> {
  const accessToken = await getPayPalAccessToken();
  const baseUrl = getPayPalBaseUrl();

  const response = await fetch(
    `${baseUrl}/v2/checkout/orders/${params.orderId}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      cache: "no-store",
    }
  );

  const payload = (await response.json().catch(() => ({}))) as PayPalCaptureResponse;

  if (!response.ok) {
    const detailMessage = payload.details?.[0]?.description || payload.message;

    throw new Error(
      `PayPal Zahlung konnte nicht abgeschlossen werden: ${
        detailMessage || response.statusText
      }`
    );
  }

  const capture = payload.purchase_units?.[0]?.payments?.captures?.[0] || null;

  return {
    orderId: payload.id || params.orderId,
    captureId: capture?.id || null,
    status: capture?.status || payload.status || null,
    payerEmail: payload.payer?.email_address || null,
    amountValue: capture?.amount?.value || null,
    currencyCode: capture?.amount?.currency_code || null,
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

  const payload = (await response.json().catch(() => ({}))) as PayPalVerifyWebhookResponse;

  if (!response.ok) {
    return {
      ok: false,
      status: payload.verification_status || null,
      message:
        payload.message ||
        "PayPal Webhook konnte nicht verifiziert werden.",
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