import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { sendRequestInvoiceMail } from "@/app/lib/requestInvoiceMailService";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  const { id } = await context.params;
  const requestId = String(id || "").trim();

  if (!requestId) {
    return NextResponse.json(
      { ok: false, message: "Ungültige Anfrage-ID." },
      { status: 400 }
    );
  }

  const result = await sendRequestInvoiceMail({ requestId });
  return NextResponse.json(result.data, { status: result.status });
}

export async function GET() {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  return NextResponse.json(
    {
      ok: false,
      message: "Diese Route kann nur per POST genutzt werden.",
    },
    { status: 405 }
  );
}
