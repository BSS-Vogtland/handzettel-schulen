import { RecommendationServiceError } from "@/app/lib/recommendations/serviceSupport";
import { NextResponse } from "next/server";

export function recommendationApiErrorResponse(error: unknown) {
  if (error instanceof RecommendationServiceError) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: error.status },
    );
  }

  console.error("Unerwarteter Empfehlungs-API-Fehler:", error);
  return NextResponse.json(
    { ok: false, message: "Ein interner Fehler ist aufgetreten." },
    { status: 500 },
  );
}

export async function readRecommendationJson(request: Request) {
  const value: unknown = await request.json().catch(() => null);
  return value !== null && typeof value === "object" ? value : null;
}
