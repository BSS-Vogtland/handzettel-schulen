import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import {
  buildPayPalRuntimeReadiness,
  type PayPalRuntimeEnvironment,
} from "@/app/lib/paypalRuntimeReadinessCore";
import { CHECKOUT_MAINTENANCE_ACTIVE } from "@/lib/checkoutMaintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

function withNoStore(response: Response): Response {
  const headers = new Headers(response.headers);

  for (const [name, value] of Object.entries(NO_STORE_HEADERS)) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function configured(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function parseEnvironment(value: string | undefined): PayPalRuntimeEnvironment {
  if (value === "live" || value === "sandbox") return value;
  return null;
}

export async function GET() {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return withNoStore(unauthorized);

  const readiness = buildPayPalRuntimeReadiness({
    environment: parseEnvironment(process.env.PAYPAL_ENV),
    clientIdConfigured: configured(process.env.PAYPAL_CLIENT_ID),
    clientSecretConfigured: configured(process.env.PAYPAL_CLIENT_SECRET),
    webhookIdConfigured: configured(process.env.PAYPAL_WEBHOOK_ID),
    productionSiteUrlConfigured:
      process.env.NEXT_PUBLIC_SITE_URL ===
      "https://www.handzettel-schulen.de",
    checkoutMaintenance: {
      known: true,
      value: CHECKOUT_MAINTENANCE_ACTIVE,
    },
  });

  return withNoStore(
    NextResponse.json(readiness, { status: readiness.ok ? 200 : 503 }),
  );
}
