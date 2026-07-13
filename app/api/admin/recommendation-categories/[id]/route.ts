import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import {
  deleteRecommendationCategory,
  getRecommendationCategoryById,
  setRecommendationCategoryActive,
  updateRecommendationCategory,
} from "@/app/lib/recommendations/categoryService";
import {
  readRecommendationJson,
  recommendationApiErrorResponse,
} from "@/app/api/admin/recommendationsApiResponse";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteParams) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const category = await getRecommendationCategoryById(
      id,
      request.nextUrl.searchParams.get("project_key") ?? undefined,
    );
    return NextResponse.json({ ok: true, category });
  } catch (error) {
    return recommendationApiErrorResponse(error);
  }
}

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
    const currentProjectKey =
      typeof record.currentProjectKey === "string"
        ? record.currentProjectKey
        : undefined;
    const keys = Object.keys(record).filter((key) => key !== "currentProjectKey");
    const category =
      keys.length === 1 && keys[0] === "active"
        ? await setRecommendationCategoryActive(
            id,
            record.active as boolean,
            currentProjectKey,
          )
        : await updateRecommendationCategory(id, record, currentProjectKey);
    return NextResponse.json({ ok: true, category });
  } catch (error) {
    return recommendationApiErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteParams) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    await deleteRecommendationCategory(
      id,
      request.nextUrl.searchParams.get("project_key") ?? undefined,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return recommendationApiErrorResponse(error);
  }
}
