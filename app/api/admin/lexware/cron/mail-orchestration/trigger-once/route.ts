import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import {
  AdminMutationRequestError,
  hasExactConfirmation,
  hasSameRequestOrigin,
  readLimitedJsonBody,
} from "@/app/lib/adminMutationRequestGuard";
import {
  countNativeLexwareMailJobs,
  readTemporaryMailOrchestrationPrecheck,
} from "@/app/lib/lexware/lexwareTemporaryMailOrchestrationPrecheck";
import {
  isTemporaryMailOrchestrationPrecheckReady,
  TEMPORARY_MAIL_ORCHESTRATION_CONFIRMATION,
} from "@/app/lib/lexware/lexwareTemporaryMailOrchestrationTriggerCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "no-store" };

function isExactNoop(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return row.ok === true && row.code === "NATIVE_MAIL_ORCHESTRATION_NOOP"
    && row.processedCount === 0 && row.enqueueCount === 0 && row.activationCount === 0
    && row.outcome === null;
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

  let mailJobCountBefore: number;
  try {
    const precheck = await readTemporaryMailOrchestrationPrecheck();
    if (!isTemporaryMailOrchestrationPrecheckReady(precheck)) {
      return NextResponse.json({ ok: false, code: "MAIL_ORCHESTRATION_PRECHECK_BLOCKED" },
        { status: 409, headers: HEADERS });
    }
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
    const mailJobCountAfter = await countNativeLexwareMailJobs();
    const exactNoop = cronResponse.status === 200 && isExactNoop(workerBody)
      && mailJobCountAfter === mailJobCountBefore;
    return NextResponse.json({
      ok: exactNoop,
      code: exactNoop ? "TEMPORARY_MAIL_ORCHESTRATION_NOOP_CONFIRMED" : "TEMPORARY_MAIL_ORCHESTRATION_RESULT_BLOCKED",
      cronStatus: cronResponse.status,
      worker: exactNoop ? {
        code: "NATIVE_MAIL_ORCHESTRATION_NOOP",
        processedCount: 0,
        enqueueCount: 0,
        activationCount: 0,
      } : null,
      mailJobsUnchanged: mailJobCountAfter === mailJobCountBefore,
    }, { status: exactNoop ? 200 : 409, headers: HEADERS });
  } catch {
    return NextResponse.json({ ok: false, code: "MAIL_ORCHESTRATION_CRON_REQUEST_FAILED" },
      { status: 502, headers: HEADERS });
  }
}
