import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import {
  AdminMutationRequestError,
  hasExactConfirmation,
  hasSameRequestOrigin,
  readLimitedJsonBody,
} from "@/app/lib/adminMutationRequestGuard";
import {
  readTemporaryMailOrchestrationPostcheck,
  readTemporaryMailOrchestrationPrecheck,
} from "@/app/lib/lexware/lexwareTemporaryMailOrchestrationPrecheck";
import {
  isTemporaryMailOrchestrationPostcheckReady,
  isTemporaryMailOrchestrationPrecheckReady,
  TEMPORARY_MAIL_ORCHESTRATION_CONFIRMATION,
} from "@/app/lib/lexware/lexwareTemporaryMailOrchestrationTriggerCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "no-store" };

function isExactProcessedResult(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return row.ok === true && row.code === "NATIVE_MAIL_ORCHESTRATION_PROCESSED"
    && row.processedCount === 1 && row.enqueueCount === 1 && row.activationCount === 1
    && row.outcome === "enqueued_and_activated";
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
  if (!hasExactConfirmation(body, TEMPORARY_MAIL_ORCHESTRATION_CONFIRMATION)) {
    return NextResponse.json({ ok: false, code: "CONFIRMATION_INVALID" }, { status: 400, headers: HEADERS });
  }
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, code: "CRON_SECRET_UNAVAILABLE" }, { status: 503, headers: HEADERS });
  }

  let invoiceJobId: string;
  let mailJobCountBefore: number;
  try {
    const precheck = await readTemporaryMailOrchestrationPrecheck();
    if (!isTemporaryMailOrchestrationPrecheckReady(precheck) || !precheck.selectedInvoiceJobId) {
      return NextResponse.json({ ok: false, code: "MAIL_ORCHESTRATION_PRECHECK_BLOCKED" },
        { status: 409, headers: HEADERS });
    }
    invoiceJobId = precheck.selectedInvoiceJobId;
    mailJobCountBefore = precheck.totalMailJobCount;
  } catch {
    return NextResponse.json({ ok: false, code: "MAIL_ORCHESTRATION_PRECHECK_FAILED" },
      { status: 500, headers: HEADERS });
  }

  try {
    const cronResponse = await fetch(new URL("/api/cron/lexware/mail-orchestration", request.url), {
      method: "GET",
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    const workerBody = await cronResponse.json().catch(() => null);
    const postcheck = await readTemporaryMailOrchestrationPostcheck(invoiceJobId);
    const exactProcessed = cronResponse.status === 200 && isExactProcessedResult(workerBody)
      && isTemporaryMailOrchestrationPostcheckReady(postcheck, mailJobCountBefore);
    return NextResponse.json({
      ok: exactProcessed,
      code: exactProcessed ? "TEMPORARY_MAIL_ORCHESTRATION_PROCESSED_CONFIRMED"
        : "TEMPORARY_MAIL_ORCHESTRATION_RESULT_BLOCKED",
      cronStatus: cronResponse.status,
      worker: exactProcessed ? {
        code: "NATIVE_MAIL_ORCHESTRATION_PROCESSED",
        processedCount: 1,
        enqueueCount: 1,
        activationCount: 1,
        outcome: "enqueued_and_activated",
      } : null,
      targetPendingPristine: postcheck.targetPendingPristine,
      mailJobCountIncrementedByOne: postcheck.totalMailJobCount === mailJobCountBefore + 1,
    }, { status: exactProcessed ? 200 : 409, headers: HEADERS });
  } catch {
    return NextResponse.json({ ok: false, code: "MAIL_ORCHESTRATION_CRON_REQUEST_FAILED" },
      { status: 502, headers: HEADERS });
  }
}
