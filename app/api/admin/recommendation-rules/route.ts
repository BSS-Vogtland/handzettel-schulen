import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import {
  createRecommendationRule,
  listRecommendationRules,
} from "@/app/lib/recommendations/ruleService";
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
    const rules = await listRecommendationRules({
      projectKey: request.nextUrl.searchParams.get("project_key") ?? undefined,
      search: request.nextUrl.searchParams.get("search") ?? undefined,
      active: active === "true" ? true : active === "false" ? false : null,
      categoryId: request.nextUrl.searchParams.get("category_id") ?? undefined,
    });
    return NextResponse.json({ ok: true, rules });
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
    const rule = await createRecommendationRule(body);
    return NextResponse.json({ ok: true, rule }, { status: 201 });
  } catch (error) {
    return recommendationApiErrorResponse(error);
  }
}
