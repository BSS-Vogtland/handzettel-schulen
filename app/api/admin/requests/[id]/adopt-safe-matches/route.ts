import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { adoptSafeRequestMatches } from "@/app/lib/requestSafeMatchAdoptionService";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: Params) {
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

  const result = await adoptSafeRequestMatches({ requestId });
  return NextResponse.json(result.data, { status: result.status });
}
