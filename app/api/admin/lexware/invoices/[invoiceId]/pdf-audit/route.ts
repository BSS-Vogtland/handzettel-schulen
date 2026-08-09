import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { auditNativeLexwareInvoicePdf } from "@/app/lib/lexware/lexwareNativePdfAuditService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;
  if (request.body !== null || Number(request.headers.get("content-length") ?? 0) > 0) {
    return NextResponse.json({ ok: false, code: "BODY_NOT_ALLOWED" }, { status: 400, headers: HEADERS });
  }
  const { invoiceId } = await params;
  if (!UUID.test(invoiceId)) {
    return NextResponse.json({ ok: false, code: "INVOICE_ID_INVALID" }, { status: 400, headers: HEADERS });
  }
  const result = await auditNativeLexwareInvoicePdf(invoiceId);
  const { status, ...body } = result;
  return NextResponse.json(body, { status, headers: HEADERS });
}
