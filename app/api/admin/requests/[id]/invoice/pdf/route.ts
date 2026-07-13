import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { generateRequestInvoicePdf } from "@/app/lib/requestInvoicePdfService";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const requestId = String(id || "").trim();

    if (!requestId) {
      return NextResponse.json(
        { ok: false, message: "Ungültige Anfrage-ID." },
        { status: 400 }
      );
    }

    const pdf = await generateRequestInvoicePdf({ requestId });

    return new NextResponse(new Uint8Array(pdf.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${pdf.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Invoice PDF error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die Rechnungs-PDF konnte nicht erzeugt werden.",
      },
      { status: 500 }
    );
  }
}
