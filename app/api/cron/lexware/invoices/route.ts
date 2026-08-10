import { NextResponse } from "next/server";
import { isLexwareCronRequestAuthorized } from "@/app/lib/cron/cronAuthorization";
import { processNextNativeLexwareInvoice } from "@/app/lib/lexware/lexwareNativeInvoiceCronWorker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!isLexwareCronRequestAuthorized(request)) {
    return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401, headers: HEADERS });
  }
  try {
    const result = await processNextNativeLexwareInvoice();
    return NextResponse.json(result, { status: result.status, headers: HEADERS });
  } catch {
    return NextResponse.json({ ok: false, code: "NATIVE_INVOICE_CRON_FAILED" }, { status: 500, headers: HEADERS });
  }
}
