import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { AdminMutationRequestError, hasExactConfirmation, hasSameRequestOrigin, readLimitedJsonBody } from "@/app/lib/adminMutationRequestGuard";
import { processLexwareProductionInvoiceById } from "@/app/lib/lexware/lexwareProductionInvoiceProcessService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "no-store" };
const CONFIRMATION = "FINALIZE_SINGLE_LEXWARE_INVOICE";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;
  if (!hasSameRequestOrigin(request)) return NextResponse.json({ ok: false, code: "SAME_ORIGIN_REQUIRED" }, { status: 403, headers: HEADERS });
  const { invoiceId } = await params;
  if (!UUID.test(invoiceId)) return NextResponse.json({ ok: false, code: "INVOICE_ID_INVALID" }, { status: 400, headers: HEADERS });
  let body: unknown;
  try { body = await readLimitedJsonBody(request, 1_024); }
  catch (error) {
    const tooLarge = error instanceof AdminMutationRequestError && error.code === "BODY_TOO_LARGE";
    return NextResponse.json({ ok: false, code: tooLarge ? "BODY_TOO_LARGE" : "JSON_INVALID" }, { status: tooLarge ? 413 : 400, headers: HEADERS });
  }
  if (!hasExactConfirmation(body, CONFIRMATION)) {
    return NextResponse.json({ ok: false, code: "CONFIRMATION_INVALID" }, { status: 400, headers: HEADERS });
  }
  const result = await processLexwareProductionInvoiceById(invoiceId);
  return NextResponse.json({
    ok: result.ok,
    code: result.code,
    outcome: result.outcome,
    postCount: result.postCount,
    reasons: result.reasons,
  }, { status: result.status, headers: HEADERS });
}
