import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { rebuildOfferRecommendations } from "@/app/lib/offerRecommendations";
import { runRequestMatching } from "@/app/lib/requestMatchingService";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string }>;
};

function isSuccessfulStatus(status: number) {
  return status >= 200 && status < 300;
}

function asResponseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {
    data: value,
  };
}

export async function POST(_request: NextRequest, context: Params) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const requestId = String(id || "").trim();

    if (!requestId) {
      return NextResponse.json(
        {
          ok: false,
          message: "Keine Anfrage-ID übergeben.",
        },
        { status: 400 }
      );
    }

    const matchingResult = await runRequestMatching({ requestId });
    const matchingData = asResponseObject(matchingResult.data);

    if (
      !isSuccessfulStatus(matchingResult.status) ||
      matchingData.ok === false
    ) {
      return NextResponse.json(matchingData, {
        status: matchingResult.status,
      });
    }

    try {
      const recommendationResult =
        await rebuildOfferRecommendations(requestId);

      const originalMessage =
        typeof matchingData.message === "string"
          ? matchingData.message
          : "Produktvorschläge wurden neu berechnet.";

      const recommendationMessage =
        recommendationResult.candidateCount > 0
          ? recommendationResult.message
          : "Es wurden keine passenden automatischen Partnerempfehlungen gefunden.";

      return NextResponse.json(
        {
          ...matchingData,
          recommendationOk: true,
          recommendationCount: recommendationResult.candidateCount,
          recommendationResult,
          message: `${originalMessage} ${recommendationMessage}`,
        },
        {
          status: matchingResult.status,
        }
      );
    } catch (recommendationError) {
      console.error(
        "Automatic recommendation rebuild after matching failed:",
        recommendationError
      );

      const originalMessage =
        typeof matchingData.message === "string"
          ? matchingData.message
          : "Produktvorschläge wurden neu berechnet.";

      return NextResponse.json(
        {
          ...matchingData,
          recommendationOk: false,
          recommendationCount: 0,
          recommendationError:
            recommendationError instanceof Error
              ? recommendationError.message
              : "Partnerempfehlungen konnten nicht neu berechnet werden.",
          message:
            `${originalMessage} ` +
            "Die Produktvorschläge wurden gespeichert, die Partnerempfehlungen konnten jedoch nicht aktualisiert werden.",
        },
        {
          status: matchingResult.status,
        }
      );
    }
  } catch (error) {
    console.error("Request matching route error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Produktvorschläge konnten nicht neu berechnet werden.",
      },
      {
        status: 500,
      }
    );
  }
}