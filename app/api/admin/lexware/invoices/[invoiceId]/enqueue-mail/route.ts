import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { hasExactConfirmation, hasSameRequestOrigin, readLimitedJsonBody } from "@/app/lib/adminMutationRequestGuard";
import { classifyNativeMailEnqueueError } from "@/app/lib/lexware/lexwareNativeMailEnqueueDiagnostics";
import { LEXWARE_MAIL_ENQUEUE_CONFIRMATION } from "@/app/lib/lexware/lexwareProductionDeliveryCore";
import { enqueueNativeLexwareInvoiceMail } from "@/app/lib/lexware/lexwareProductionMailProcessor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store" };
const UUID_PATTERN = /^[0-9a-f-]{36}$/i;

export async function POST(request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  const authenticationResponse = await requireAdminApiSession();
  if (authenticationResponse) return authenticationResponse;
  if (!hasSameRequestOrigin(request)) {
    return NextResponse.json({ ok: false, code: "SAME_ORIGIN_REQUIRED" }, { status: 403, headers: HEADERS });
  }
  const { invoiceId } = await params;
  if (!UUID_PATTERN.test(invoiceId)) {
    return NextResponse.json({ ok: false, code: "INVOICE_ID_INVALID" }, { status: 400, headers: HEADERS });
  }
  let body: unknown;
  try {
    body = await readLimitedJsonBody(request, 512);
  } catch {
    return NextResponse.json({ ok: false, code: "JSON_INVALID" }, { status: 400, headers: HEADERS });
  }
  if (!hasExactConfirmation(body, LEXWARE_MAIL_ENQUEUE_CONFIRMATION)) {
    return NextResponse.json({ ok: false, code: "CONFIRMATION_INVALID" }, { status: 400, headers: HEADERS });
  }
  try {
    await enqueueNativeLexwareInvoiceMail(invoiceId);
    return NextResponse.json({ ok: true, code: "NATIVE_MAIL_ENQUEUED" }, { headers: HEADERS });
  } catch (error) {
    const diagnosis = classifyNativeMailEnqueueError(error);
    return NextResponse.json(
      { ok: false, code: "NATIVE_MAIL_ENQUEUE_BLOCKED", reason: diagnosis.reason, stage: diagnosis.stage },
      { status: 409, headers: HEADERS },
    );
  }
}
