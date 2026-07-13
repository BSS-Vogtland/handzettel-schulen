import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { analyzeRequestMaterials } from "@/app/lib/requestAnalysisService";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  const { id } = await context.params;
  const requestId = String(id || "").trim();

  if (!requestId) {
    return NextResponse.json(
      { ok: false, message: "Keine Anfrage-ID übergeben." },
      { status: 400 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    analyzeMode?: unknown;
    quality?: unknown;
    modelOverride?: unknown;
  };
  const result = await analyzeRequestMaterials({
    requestId,
    analyzeMode: body.analyzeMode,
    quality: body.quality,
    modelOverride: body.modelOverride,
  });

  return NextResponse.json(result.data, { status: result.status });
}
