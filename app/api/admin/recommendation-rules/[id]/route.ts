import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import {
  deleteRecommendationRule,
  getRecommendationRuleById,
  setRecommendationRuleActive,
  updateRecommendationRule,
} from "@/app/lib/recommendations/ruleService";
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
    const rule = await getRecommendationRuleById(
      id,
      request.nextUrl.searchParams.get("project_key") ?? undefined,
    );
    return NextResponse.json({ ok: true, rule });
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
    const rule =
      keys.length === 1 && keys[0] === "active"
        ? await setRecommendationRuleActive(
            id,
            record.active as boolean,
            currentProjectKey,
          )
        : await updateRecommendationRule(id, record, currentProjectKey);
    return NextResponse.json({ ok: true, rule });
  } catch (error) {
    return recommendationApiErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteParams) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    await deleteRecommendationRule(
      id,
      request.nextUrl.searchParams.get("project_key") ?? undefined,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return recommendationApiErrorResponse(error);
  }
}
