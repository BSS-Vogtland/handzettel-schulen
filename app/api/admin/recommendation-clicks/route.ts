import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import {
  listRecommendationClicks,
  RecommendationClickServiceError,
} from "@/app/lib/recommendations/recommendationClickService";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const params = request.nextUrl.searchParams;
    const bot = params.get("bot");
    const result = await listRecommendationClicks({
      projectKey: params.get("project_key") ?? undefined,
      search: params.get("search") ?? undefined,
      partnerId: params.get("partner_id") ?? undefined,
      categoryId: params.get("category_id") ?? undefined,
      bot: bot === "bot" || bot === "human" ? bot : "all",
      dateFrom: params.get("date_from") ?? undefined,
      dateTo: params.get("date_to") ?? undefined,
      page: positiveInteger(params.get("page"), 1),
      limit: positiveInteger(params.get("limit"), 50),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof RecommendationClickServiceError
      ? error.message
      : "Klickdaten konnten nicht geladen werden.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
