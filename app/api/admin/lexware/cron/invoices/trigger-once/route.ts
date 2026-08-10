import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import {
  AdminMutationRequestError,
  hasExactConfirmation,
  hasSameRequestOrigin,
  readLimitedJsonBody,
} from "@/app/lib/adminMutationRequestGuard";
import { isNativeInvoiceCronTargetReady } from "@/app/lib/lexware/lexwareNativeInvoiceCronWorker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "no-store" };
const TARGET_INVOICE_ID = "ede1a917-0554-4bcb-8e29-3c9506c1d9f8";
export const TEMPORARY_INVOICE_CRON_CONFIRMATION = "TRIGGER_SINGLE_NATIVE_LEXWARE_INVOICE_CRON_TEST";
const WORKER_CODES = new Set([
  "NATIVE_INVOICE_CRON_NOOP",
  "NATIVE_INVOICE_CRON_PROCESSED",
  "NATIVE_INVOICE_CRON_BLOCKED",
]);
const PROCESSOR_CODES = new Set(["LEXWARE_PROCESS_SUCCEEDED", "LEXWARE_PROCESS_BLOCKED"]);
const PROCESSOR_OUTCOMES = new Set(["succeeded", "blocked", "manual_review"]);

function sanitizeWorkerResponse(value: unknown) {
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  return {
    ok: row.ok === true,
    code: typeof row.code === "string" && WORKER_CODES.has(row.code) ? row.code : "UNKNOWN",
    processedCount: row.processedCount === 0 || row.processedCount === 1 ? row.processedCount : null,
    postCount: row.postCount === 0 || row.postCount === 1 ? row.postCount : null,
    processorCode: typeof row.processorCode === "string" && PROCESSOR_CODES.has(row.processorCode)
      ? row.processorCode : null,
    processorOutcome: typeof row.processorOutcome === "string" && PROCESSOR_OUTCOMES.has(row.processorOutcome)
      ? row.processorOutcome : null,
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
  if (!hasExactConfirmation(body, TEMPORARY_INVOICE_CRON_CONFIRMATION)) {
    return NextResponse.json({ ok: false, code: "CONFIRMATION_INVALID" }, { status: 400, headers: HEADERS });
  }
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, code: "CRON_SECRET_UNAVAILABLE" }, { status: 503, headers: HEADERS });
  }
  let targetReady = false;
  try {
    targetReady = await isNativeInvoiceCronTargetReady(TARGET_INVOICE_ID);
  } catch {
    return NextResponse.json({ ok: false, code: "CRON_PRECHECK_FAILED" }, { status: 500, headers: HEADERS });
  }
  if (!targetReady) {
    return NextResponse.json({ ok: false, code: "CRON_PRECHECK_BLOCKED" }, { status: 409, headers: HEADERS });
  }
  try {
    const cronResponse = await fetch(new URL("/api/cron/lexware/invoices", request.url), {
      method: "GET",
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    const worker = sanitizeWorkerResponse(await cronResponse.json().catch(() => null));
    return NextResponse.json({
      ok: cronResponse.ok && worker.ok,
      code: "TEMPORARY_INVOICE_CRON_TRIGGER_RESULT",
      cronStatus: cronResponse.status,
      worker,
    }, { status: cronResponse.status, headers: HEADERS });
  } catch {
    return NextResponse.json({ ok: false, code: "CRON_REQUEST_FAILED" }, { status: 502, headers: HEADERS });
  }
}
