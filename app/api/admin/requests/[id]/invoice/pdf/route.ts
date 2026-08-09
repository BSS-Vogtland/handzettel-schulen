import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { generateRequestInvoicePdf } from "@/app/lib/requestInvoicePdfService";
import { loadStoredNativeLexwarePdf } from "@/app/lib/lexware/lexwareProductionPdfStorage";
import { supabaseServer } from "@/lib/supabase/server";
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

    const { data: invoice, error: invoiceError } = await supabaseServer
      .from("school_request_invoices")
      .select("id,invoice_provider")
      .eq("request_id", requestId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (invoiceError || !invoice) throw invoiceError ?? new Error("Rechnung nicht gefunden.");

    if (invoice.invoice_provider === "lexware") {
      const nativePdf = await loadStoredNativeLexwarePdf(invoice.id);
      return new NextResponse(nativePdf.content, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${nativePdf.metadata.filename}"`,
          "Cache-Control": "no-store",
        },
      });
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
    console.error("Invoice PDF error:", error instanceof Error ? error.message : "INVOICE_PDF_FAILED");

    return NextResponse.json(
      {
        ok: false,
        message: "Die Rechnungs-PDF ist nicht verfügbar.",
      },
      { status: 500 }
    );
  }
}
