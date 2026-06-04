import { NextRequest, NextResponse } from "next/server";

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

  return jsonResponse(
    {
      ok: false,
      productId: id,
      message:
        "Die Hintergrund-Erzeugung ist vorübergehend deaktiviert. Produktbild, Originalbild und SEO-Daten bleiben erhalten. Die originalschonende Freistellung wird als separates Batch-Script weitergeführt, damit die Website stabil bleibt.",
    },
    503
  );
}