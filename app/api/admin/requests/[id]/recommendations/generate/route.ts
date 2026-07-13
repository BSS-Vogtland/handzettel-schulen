import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { NextResponse } from "next/server";
import { rebuildOfferRecommendations } from "@/app/lib/offerRecommendations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function POST(_request: Request, context: Params) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const requestId = String(id || "").trim();

    if (!requestId) {
      return jsonResponse(
        {
          ok: false,
          message: "Keine Anfrage-ID übergeben.",
        },
        400
      );
    }

    const result = await rebuildOfferRecommendations(requestId);

    return jsonResponse({
      ...result,
      message:
        result.candidateCount > 0
          ? result.message
          : "Es wurden keine sinnvollen automatischen Empfehlungen gefunden. Du kannst Empfehlungen weiterhin manuell hinzufügen.",
    });
  } catch (error) {
    console.error("Generate offer recommendations error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Automatische Empfehlungen konnten nicht erzeugt werden.",
      },
      500
    );
  }
}