import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { AdminMutationRequestError, hasExactConfirmation, hasSameRequestOrigin, readLimitedJsonBody } from "@/app/lib/adminMutationRequestGuard";
import { issueLexwareProductionWritePermit } from "@/app/lib/lexware/lexwareProductionWritePermitService";
import { LEXWARE_ISSUE_PERMIT_CONFIRMATION } from "@/app/lib/lexware/lexwareProductionWritePermitCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "no-store" };
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
    const large = error instanceof AdminMutationRequestError && error.code === "BODY_TOO_LARGE";
    return NextResponse.json({ ok: false, code: large ? "BODY_TOO_LARGE" : "JSON_INVALID" }, { status: large ? 413 : 400, headers: HEADERS });
  }
  if (!hasExactConfirmation(body, LEXWARE_ISSUE_PERMIT_CONFIRMATION)) return NextResponse.json({ ok: false, code: "CONFIRMATION_INVALID" }, { status: 400, headers: HEADERS });
  try {
    const result = await issueLexwareProductionWritePermit(invoiceId);
    return NextResponse.json({ ok: true, ...result, databaseWritesPerformed: 2, lexwareRequestsPerformed: 0, mailOperationsPerformed: 0 }, { headers: HEADERS });
  } catch { return NextResponse.json({ ok: false, code: "PERMIT_ISSUE_BLOCKED" }, { status: 409, headers: HEADERS }); }
}
