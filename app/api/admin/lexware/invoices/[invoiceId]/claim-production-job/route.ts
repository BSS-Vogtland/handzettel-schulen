import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { AdminMutationRequestError, hasSameRequestOrigin, readLimitedJsonBody } from "@/app/lib/adminMutationRequestGuard";
import { claimLexwareProductionJobWithPermit } from "@/app/lib/lexware/lexwareProductionWritePermitService";
import { LEXWARE_CLAIM_JOB_CONFIRMATION } from "@/app/lib/lexware/lexwareProductionWritePermitCore";
import { classifyLexwarePermitClaimError } from "@/app/lib/lexware/lexwarePermitClaimError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validBody = (body: unknown): body is { confirmation: string; permitId: string } => {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const row = body as Record<string, unknown>;
  return Object.keys(row).sort().join(",") === "confirmation,permitId"
    && row.confirmation === LEXWARE_CLAIM_JOB_CONFIRMATION
    && typeof row.permitId === "string" && UUID.test(row.permitId);
};

export async function POST(request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  const unauthorized = await requireAdminApiSession(); if (unauthorized) return unauthorized;
  if (!hasSameRequestOrigin(request)) return NextResponse.json({ ok: false, code: "SAME_ORIGIN_REQUIRED" }, { status: 403, headers: HEADERS });
  const { invoiceId } = await params; if (!UUID.test(invoiceId)) return NextResponse.json({ ok: false, code: "INVOICE_ID_INVALID" }, { status: 400, headers: HEADERS });
  let body: unknown; try { body = await readLimitedJsonBody(request, 1_024); }
  catch (error) { const large = error instanceof AdminMutationRequestError && error.code === "BODY_TOO_LARGE"; return NextResponse.json({ ok: false, code: large ? "BODY_TOO_LARGE" : "JSON_INVALID" }, { status: large ? 413 : 400, headers: HEADERS }); }
  if (!validBody(body)) return NextResponse.json({ ok: false, code: "CLAIM_INPUT_INVALID" }, { status: 400, headers: HEADERS });
  try {
    const result = await claimLexwareProductionJobWithPermit(invoiceId, body.permitId);
    return NextResponse.json({ ok: true, permitId: result.permitId, claimId: result.claimId, permitState: result.permitState, jobStatus: result.claim.jobStatus, attemptCount: result.claim.attemptCount, lockAcquired: true, postPerformed: false, lexwareRequestsPerformed: 0, mailOperationsPerformed: 0 }, { headers: HEADERS });
  } catch (error: unknown) {
    const claimBlockReason = classifyLexwarePermitClaimError(error);
    console.warn("[lexware-permit-claim]", {
      route: "/api/admin/lexware/invoices/[invoiceId]/claim-production-job",
      claimBlockReason,
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json(
      { ok: false, code: "CLAIM_BLOCKED", claimBlockReason },
      { status: 409, headers: HEADERS },
    );
  }
}
