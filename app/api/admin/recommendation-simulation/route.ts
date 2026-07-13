import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import {
  readRecommendationJson,
  recommendationApiErrorResponse,
} from "@/app/api/admin/recommendationsApiResponse";
import { simulateRecommendations } from "@/app/lib/recommendations/recommendationSimulationService";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const simulation = await simulateRecommendations(body);
    return NextResponse.json({ ok: true, simulation });
  } catch (error) {
    return recommendationApiErrorResponse(error);
  }
}
