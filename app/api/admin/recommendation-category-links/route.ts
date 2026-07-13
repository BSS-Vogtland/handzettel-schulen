import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import {
  assignPartnerToCategory,
  listCategoryPartnerLinks,
} from "@/app/lib/recommendations/categoryLinkService";
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
    const links = await listCategoryPartnerLinks({
      projectKey: request.nextUrl.searchParams.get("project_key") ?? undefined,
      partnerId: request.nextUrl.searchParams.get("partner_id") ?? undefined,
      categoryId: request.nextUrl.searchParams.get("category_id") ?? undefined,
    });
    return NextResponse.json({ ok: true, links });
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
    const link = await assignPartnerToCategory(body);
    return NextResponse.json({ ok: true, link }, { status: 201 });
  } catch (error) {
    return recommendationApiErrorResponse(error);
  }
}
