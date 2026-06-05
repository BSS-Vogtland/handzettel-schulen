import { NextRequest, NextResponse } from "next/server";
import { styleProductImageById } from "@/app/lib/productImageStyling";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = {
  params: Promise<{
    id: string;
  }>;
};

function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function POST(_request: NextRequest, context: Params) {
  try {
    const { id } = await context.params;
    const productId = String(id || "").trim();

    if (!productId) {
      return jsonResponse(
        {
          ok: false,
          message: "Keine Produkt-ID übergeben.",
        },
        400
      );
    }

    const result = await styleProductImageById(productId);

    return jsonResponse({
      ok: true,
      productId,
      styledImageUrl: result.styledImageUrl,
      storagePath: result.storagePath,
      usedRemoveBg: result.usedRemoveBg,
      profile: result.profile,
      message: result.usedRemoveBg
        ? "Bild wurde freigestellt und mit Handzettel-Hintergrund gespeichert."
        : "Bild wurde ohne Freistellung originalschonend mit Handzettel-Hintergrund gespeichert.",
    });
  } catch (error) {
    console.error("Style image error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Bild konnte nicht freigestellt und neu gesetzt werden.",
      },
      500
    );
  }
}

export async function GET() {
  return jsonResponse(
    {
      ok: false,
      message: "Diese Route kann nur per POST genutzt werden.",
    },
    405
  );
}
