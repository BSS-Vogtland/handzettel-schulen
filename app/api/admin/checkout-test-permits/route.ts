import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import {
  CHECKOUT_TEST_PERMIT_CREATE_CONFIRMATION,
  createCheckoutTestPermit,
  isValidCheckoutTestOfferToken,
  isCheckoutTestRequestSameOrigin,
} from "@/lib/checkoutTestPermits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 1_024;

type CreatePermitBody = {
  checkoutType?: unknown;
  targetReference?: unknown;
  expiresInMinutes?: unknown;
  confirmation?: unknown;
};

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { ok: false, message },
    { status, headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) {
    unauthorized.headers.set("Cache-Control", "no-store");
    return unauthorized;
  }

  if (!isCheckoutTestRequestSameOrigin(request)) {
    return errorResponse("Anfrage wurde abgelehnt.", 403);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return errorResponse("Requestbody ist zu groß.", 413);
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return errorResponse("Ungültiger Requestbody.", 400);
  }
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return errorResponse("Requestbody ist zu groß.", 413);
  }

  let body: CreatePermitBody;
  try {
    body = JSON.parse(rawBody) as CreatePermitBody;
  } catch {
    return errorResponse("Ungültiger JSON-Requestbody.", 400);
  }

  const allowedKeys = new Set([
    "checkoutType",
    "targetReference",
    "expiresInMinutes",
    "confirmation",
  ]);
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !allowedKeys.has(key)) ||
    body.confirmation !== CHECKOUT_TEST_PERMIT_CREATE_CONFIRMATION
  ) {
    return errorResponse("Freigabeanforderung ist ungültig.", 400);
  }

  const checkoutType = body.checkoutType;
  if (checkoutType !== "offer") {
    return errorResponse("Checkout-Typ ist ungültig.", 400);
  }

  const targetReference =
    typeof body.targetReference === "string"
      ? body.targetReference || null
      : null;
  if (!targetReference) {
    return errorResponse("Für einen Angebots-Test ist eine Zielreferenz erforderlich.", 400);
  }
  if (!isValidCheckoutTestOfferToken(targetReference)) {
    return errorResponse("Zielreferenz ist ungültig.", 400);
  }

  const expiresInMinutes =
    body.expiresInMinutes === undefined ? 10 : Number(body.expiresInMinutes);
  if (
    !Number.isInteger(expiresInMinutes) ||
    expiresInMinutes < 1 ||
    expiresInMinutes > 30
  ) {
    return errorResponse("Gültigkeitsdauer muss zwischen 1 und 30 Minuten liegen.", 400);
  }

  try {
    const permit = await createCheckoutTestPermit({
      checkoutType: "offer",
      targetReference,
      expiresInMinutes,
    });

    return NextResponse.json(
      {
        ok: true,
        permitToken: permit.permitToken,
        permitId: permit.permitId,
        checkoutType: permit.checkoutType,
        targetBound: true,
        expiresAt: permit.expiresAt,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch {
    return errorResponse(
      "Checkout-Testfreigabe konnte nicht erstellt werden.",
      422,
    );
  }
}
