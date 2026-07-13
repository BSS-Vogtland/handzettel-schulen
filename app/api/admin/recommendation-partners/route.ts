import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import {
  createRecommendationPartner,
  listRecommendationPartners,
  RecommendationPartnerServiceError,
} from "@/app/lib/recommendations/partnerService";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function parsePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const activeParam = request.nextUrl.searchParams.get("active");
    const result = await listRecommendationPartners({
      projectKey:
        request.nextUrl.searchParams.get("project_key") ??
        "handzettel-schulen",
      search: request.nextUrl.searchParams.get("search") ?? "",
      active:
        activeParam === "true" ? true : activeParam === "false" ? false : null,
      sort:
        request.nextUrl.searchParams.get("sort") === "name_asc"
          ? "name_asc"
          : request.nextUrl.searchParams.get("sort") === "created_desc"
            ? "created_desc"
            : "updated_desc",
      page: parsePositiveInteger(request.nextUrl.searchParams.get("page"), 1),
      limit: parsePositiveInteger(request.nextUrl.searchParams.get("limit"), 50),
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, message: "Der Anfrageinhalt ist ungültig." },
        { status: 400 },
      );
    }

    const partner = await createRecommendationPartner(body);
    return NextResponse.json({ ok: true, partner }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
