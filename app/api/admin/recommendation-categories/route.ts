import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import {
  createRecommendationCategory,
  listRecommendationCategories,
} from "@/app/lib/recommendations/categoryService";
import {
  readRecommendationJson,
  recommendationApiErrorResponse,
} from "@/app/api/admin/recommendationsApiResponse";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const active = request.nextUrl.searchParams.get("active");
    const categories = await listRecommendationCategories({
      projectKey: request.nextUrl.searchParams.get("project_key") ?? undefined,
      search: request.nextUrl.searchParams.get("search") ?? undefined,
      active: active === "true" ? true : active === "false" ? false : null,
    });
    return NextResponse.json({ ok: true, categories });
  } catch (error) {
    return recommendationApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const body = await readRecommendationJson(request);
    if (!body) {
      return NextResponse.json(
        { ok: false, message: "Der Anfrageinhalt ist ungültig." },
        { status: 400 },
      );
    }
    const category = await createRecommendationCategory(body);
    return NextResponse.json({ ok: true, category }, { status: 201 });
  } catch (error) {
    return recommendationApiErrorResponse(error);
  }
}
