import { NextRequest, NextResponse } from "next/server";
import { styleProductImageById } from "../../../../../lib/productImageStyling";

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

export async function POST(_request: NextRequest, context: Params) {
  try {
    const { id } = await context.params;

    if (!id) {
      return jsonResponse(
        {
          ok: false,
          message: "Keine Produkt-ID übergeben.",
        },
        400
      );
    }

    const result = await styleProductImageById(id);

    return jsonResponse({
      ...result,
      ok: true,
      message:
        "Produkt wurde freigestellt und mit unverändertem Originalprodukt auf den neuen Hintergrund gesetzt.",
    });
  } catch (error) {
    console.error("Admin product style image error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "KI-Hintergrund konnte nicht erzeugt werden.",
      },
      500
    );
  }
}