import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import {
  AdminMutationRequestError,
  hasExactConfirmation,
  hasSameRequestOrigin,
  readLimitedJsonBody,
} from "@/app/lib/adminMutationRequestGuard";
import {
  readTemporaryMailProcessPostcheck,
  readTemporaryMailProcessPrecheck,
} from "@/app/lib/lexware/lexwareTemporaryMailProcessPrecheck";
import {
  isTemporaryMailProcessAmbiguousPostcheck,
  isTemporaryMailProcessPrecheckReady,
  isTemporaryMailProcessSuccessPostcheck,
  TEMPORARY_MAIL_PROCESS_CONFIRMATION,
} from "@/app/lib/lexware/lexwareTemporaryMailProcessTriggerCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "no-store" };

const workerResult = (value: unknown) => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : null;

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
  if (!hasExactConfirmation(body, TEMPORARY_MAIL_PROCESS_CONFIRMATION)) {
    return NextResponse.json({ ok: false, code: "CONFIRMATION_INVALID" }, { status: 400, headers: HEADERS });
  }
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, code: "CRON_SECRET_UNAVAILABLE" }, { status: 503, headers: HEADERS });
  }
  try {
    const precheck = await readTemporaryMailProcessPrecheck();
    if (!isTemporaryMailProcessPrecheckReady(precheck)) {
      return NextResponse.json({ ok: false, code: "MAIL_PROCESS_PRECHECK_BLOCKED" },
        { status: 409, headers: HEADERS });
    }
  } catch {
    return NextResponse.json({ ok: false, code: "MAIL_PROCESS_PRECHECK_FAILED" },
      { status: 500, headers: HEADERS });
  }

  try {
    const cronResponse = await fetch(new URL("/api/cron/lexware/mail-process", request.url), {
      method: "GET",
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    const row = workerResult(await cronResponse.json().catch(() => null));
    const postcheck = await readTemporaryMailProcessPostcheck();
    const success = cronResponse.status === 200 && row?.ok === true
      && row.code === "NATIVE_MAIL_PROCESS_CRON_PROCESSED" && row.processedCount === 1
      && row.smtpAttemptCount === 1 && row.outcome === "sent"
      && isTemporaryMailProcessSuccessPostcheck(postcheck);
    const ambiguous = cronResponse.status === 409 && row?.ok === false
      && row.code === "NATIVE_MAIL_PROCESS_CRON_BLOCKED" && row.processedCount === 1
      && row.smtpAttemptCount === 1 && row.outcome === "manual_review"
      && isTemporaryMailProcessAmbiguousPostcheck(postcheck);
    return NextResponse.json({
      ok: success,
      code: success ? "TEMPORARY_MAIL_PROCESS_SUCCEEDED"
        : ambiguous ? "TEMPORARY_MAIL_PROCESS_AMBIGUOUS" : "TEMPORARY_MAIL_PROCESS_RESULT_BLOCKED",
      cronStatus: cronResponse.status,
      processedCount: success || ambiguous ? 1 : 0,
      smtpAttemptCount: success || ambiguous ? 1 : 0,
      outcome: success ? "sent" : ambiguous ? "manual_review" : "blocked",
      successConfirmed: postcheck.successConfirmed,
      ambiguousConfirmed: postcheck.ambiguousConfirmed,
    }, { status: success ? 200 : 409, headers: HEADERS });
  } catch {
    return NextResponse.json({ ok: false, code: "MAIL_PROCESS_CRON_REQUEST_FAILED" },
      { status: 502, headers: HEADERS });
  }
}
