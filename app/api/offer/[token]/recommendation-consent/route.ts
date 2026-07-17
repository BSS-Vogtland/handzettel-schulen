import {
  getRecommendationIdentityConsentState,
  grantRecommendationIdentityConsent,
  RecommendationIdentityConsentServiceError,
  revokeRecommendationIdentityConsent,
} from "@/app/lib/recommendations/recommendationIdentityConsentService";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control":
        "no-store, max-age=0",
    },
  });
}

async function readBody(
  request: NextRequest,
) {
  try {
    const value: unknown =
      await request.json();

    return value !== null &&
      typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    throw new RecommendationIdentityConsentServiceError(
      "VALIDATION",
      "Die übermittelten Daten sind ungültig.",
      400,
    );
  }
}

function errorResponse(error: unknown) {
  if (
    error instanceof
    RecommendationIdentityConsentServiceError
  ) {
    return jsonResponse(
      {
        ok: false,
        message: error.message,
      },
      error.status,
    );
  }

  console.error(
    "[Recommendation consent API] Aktion fehlgeschlagen",
    {
      errorName:
        error instanceof Error
          ? error.name
          : "UnknownError",
      errorMessage:
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler",
    },
  );

  return jsonResponse(
    {
      ok: false,
      message:
        "Die Einwilligung konnte nicht verarbeitet werden.",
    },
    500,
  );
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { token } =
      await context.params;

    const partnerId =
      request.nextUrl.searchParams.get(
        "partner_id",
      );

    const requestItemId =
      request.nextUrl.searchParams.get(
        "request_item_id",
      );

    const state =
      await getRecommendationIdentityConsentState(
        {
          offerToken: token,
          partnerId,
          requestItemId,
        },
      );

    return jsonResponse(
      {
        ok: true,
        state,
      },
      200,
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { token } =
      await context.params;

    const body = await readBody(request);

    const granted =
      body.granted === true;

    const input = {
      offerToken: token,
      partnerId: body.partnerId,
      requestItemId:
        body.requestItemId,
    };

    const state = granted
      ? await grantRecommendationIdentityConsent(
          input,
        )
      : await revokeRecommendationIdentityConsent(
          input,
        );

    return jsonResponse(
      {
        ok: true,
        message: granted
          ? "Die freiwillige Identitätsfreigabe wurde gespeichert."
          : "Die Identitätsfreigabe wurde widerrufen.",
        state,
      },
      200,
    );
  } catch (error) {
    return errorResponse(error);
  }
}