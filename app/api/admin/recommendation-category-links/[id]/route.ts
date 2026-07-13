import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import {
  removePartnerFromCategory,
  updateCategoryPartnerLink,
} from "@/app/lib/recommendations/categoryLinkService";
import {
  readRecommendationJson,
  recommendationApiErrorResponse,
} from "@/app/api/admin/recommendationsApiResponse";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteParams) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const body = await readRecommendationJson(request);
    if (!body) {
      return NextResponse.json(
        { ok: false, message: "Der Anfrageinhalt ist ungültig." },
        { status: 400 },
      );
    }
    const record = body as Record<string, unknown>;
    const link = await updateCategoryPartnerLink(
      id,
      record,
      typeof record.currentProjectKey === "string"
        ? record.currentProjectKey
        : undefined,
    );
    return NextResponse.json({ ok: true, link });
  } catch (error) {
    return recommendationApiErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteParams) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    await removePartnerFromCategory(
      id,
      request.nextUrl.searchParams.get("project_key") ?? undefined,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return recommendationApiErrorResponse(error);
  }
}
