import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import {
  deleteRecommendationPartner,
  getRecommendationPartnerById,
  RecommendationPartnerServiceError,
  setRecommendationPartnerActive,
  updateRecommendationPartner,
} from "@/app/lib/recommendations/partnerService";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

function errorResponse(error: unknown) {
  if (error instanceof RecommendationPartnerServiceError) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: error.status },
    );
  }

  console.error("Unerwarteter Empfehlungspartner-API-Fehler:", error);
  return NextResponse.json(
    { ok: false, message: "Ein interner Fehler ist aufgetreten." },
    { status: 500 },
  );
}

function getProjectKey(request: NextRequest) {
  return request.nextUrl.searchParams.get("project_key") ?? "handzettel-schulen";
}

export async function GET(request: NextRequest, context: RouteParams) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const partner = await getRecommendationPartnerById(id, getProjectKey(request));
    return NextResponse.json({ ok: true, partner });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteParams) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, message: "Der Anfrageinhalt ist ungültig." },
        { status: 400 },
      );
    }

    const record = body as Record<string, unknown>;
    const currentProjectKey =
      typeof record.currentProjectKey === "string"
        ? record.currentProjectKey
        : "handzettel-schulen";
    const mutationKeys = Object.keys(record).filter(
      (key) => key !== "currentProjectKey",
    );
    const partner =
      mutationKeys.length === 1 && mutationKeys[0] === "active"
        ? await setRecommendationPartnerActive(
            id,
            record.active as boolean,
            currentProjectKey,
          )
        : await updateRecommendationPartner(id, record, currentProjectKey);

    return NextResponse.json({ ok: true, partner });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteParams) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    await deleteRecommendationPartner(id, getProjectKey(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
