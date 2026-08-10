import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import {
  AdminMutationRequestError,
  hasExactConfirmation,
  hasSameRequestOrigin,
  readLimitedJsonBody,
} from "@/app/lib/adminMutationRequestGuard";
import {
  TEMPORARY_PDF_CRON_CONFIRMATION,
} from "@/app/lib/lexware/lexwareTemporaryPdfCronTriggerCore";
import { readTemporaryPdfCronPrecheck } from "@/app/lib/lexware/lexwareTemporaryPdfCronTriggerPrecheck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "no-store" };
const WORKER_CODES = new Set(["NATIVE_PDF_CRON_NOOP", "NATIVE_PDF_CRON_PROCESSED", "NATIVE_PDF_CRON_BLOCKED"]);
const WORKER_OUTCOMES = new Set(["succeeded", "retry", "manual_review"]);

function sanitizeWorkerResponse(value: unknown) {
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  return {
    ok: row.ok === true,
    code: typeof row.code === "string" && WORKER_CODES.has(row.code) ? row.code : "UNKNOWN",
    processedCount: row.processedCount === 0 || row.processedCount === 1 ? row.processedCount : null,
    providerGetCount: row.providerGetCount === 0 || row.providerGetCount === 1 ? row.providerGetCount : null,
    outcome: typeof row.outcome === "string" && WORKER_OUTCOMES.has(row.outcome) ? row.outcome : null,
  };
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;
  if (!hasSameRequestOrigin(request)) {
    return NextResponse.json({ ok: false, code: "SAME_ORIGIN_REQUIRED" }, { status: 403, headers: HEADERS });
  }
  let body: unknown;
  try {
    body = await readLimitedJsonBody(request, 512);
  } catch (error) {
    const tooLarge = error instanceof AdminMutationRequestError && error.code === "BODY_TOO_LARGE";
    return NextResponse.json({ ok: false, code: tooLarge ? "BODY_TOO_LARGE" : "JSON_INVALID" },
      { status: tooLarge ? 413 : 400, headers: HEADERS });
  }
  if (!hasExactConfirmation(body, TEMPORARY_PDF_CRON_CONFIRMATION)) {
    return NextResponse.json({ ok: false, code: "CONFIRMATION_INVALID" }, { status: 400, headers: HEADERS });
  }
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, code: "CRON_SECRET_UNAVAILABLE" }, { status: 503, headers: HEADERS });
  }
  try {
    const precheck = await readTemporaryPdfCronPrecheck();
    if (!precheck.ready) {
      return NextResponse.json({ ok: false, code: "PDF_CRON_PRECHECK_BLOCKED" }, { status: 409, headers: HEADERS });
    }
  } catch {
    return NextResponse.json({ ok: false, code: "PDF_CRON_PRECHECK_FAILED" }, { status: 500, headers: HEADERS });
  }
  try {
    const cronResponse = await fetch(new URL("/api/cron/lexware/pdfs", request.url), {
      method: "GET",
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    const worker = sanitizeWorkerResponse(await cronResponse.json().catch(() => null));
    return NextResponse.json({
      ok: cronResponse.ok && worker.ok,
      code: "TEMPORARY_PDF_CRON_TRIGGER_RESULT",
      cronStatus: cronResponse.status,
      worker,
    }, { status: cronResponse.status, headers: HEADERS });
  } catch {
    return NextResponse.json({ ok: false, code: "PDF_CRON_REQUEST_FAILED" }, { status: 502, headers: HEADERS });
  }
}
