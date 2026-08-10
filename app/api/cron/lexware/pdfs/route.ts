import { NextResponse } from "next/server";
import { isLexwareCronRequestAuthorized } from "@/app/lib/cron/cronAuthorization";
import { processNextNativeLexwarePdf } from "@/app/lib/lexware/lexwareNativePdfCronWorker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!isLexwareCronRequestAuthorized(request)) {
    return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401, headers: HEADERS });
  }
  try {
    const result = await processNextNativeLexwarePdf();
    return NextResponse.json(result, { status: result.status, headers: HEADERS });
  } catch {
    return NextResponse.json({ ok: false, code: "NATIVE_PDF_CRON_FAILED" }, { status: 500, headers: HEADERS });
  }
}
