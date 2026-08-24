import { NextResponse } from "next/server";
import {
  getAdminAuditActor,
  requireAdminApiSession,
} from "@/app/lib/adminApiAuth";
import {
  hasExactConfirmation,
  hasSameRequestOrigin,
  readLimitedJsonBody,
} from "@/app/lib/adminMutationRequestGuard";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store" };
const TRIGGER_CONFIRMATION =
  "TRIGGER_SINGLE_AFTER_SALES_FULFILLMENT_HOLD_TEST";
const CASE_ID = "c1bc4f52-f6e2-48fb-aa3a-f6aebcc84953";
const REQUEST_ID = "0e7544a4-69e9-4813-a93b-47ac34307ccb";
const INVOICE_ID = "1aeb6cbf-d949-484d-af76-802645b4cac3";
const RPC_CONFIRMATION = "CONFIRM_SET_AFTER_SALES_FULFILLMENT_HOLD";
const REASON =
  "Controlled After-Sales Phase A production test: fulfillment HOLD on not_started";

export async function POST(request: Request) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  if (!hasSameRequestOrigin(request)) {
    return NextResponse.json(
      { ok: false, code: "SAME_ORIGIN_REQUIRED" },
      { status: 403, headers: HEADERS },
    );
  }

  let body: unknown;
  try {
    body = await readLimitedJsonBody(request, 256);
  } catch {
    return NextResponse.json(
      { ok: false, code: "JSON_INVALID" },
      { status: 400, headers: HEADERS },
    );
  }

  if (!hasExactConfirmation(body, TRIGGER_CONFIRMATION)) {
    return NextResponse.json(
      { ok: false, code: "CONFIRMATION_INVALID" },
      { status: 400, headers: HEADERS },
    );
  }

  const actor = await getAdminAuditActor();
  if (!actor) {
    return NextResponse.json(
      { ok: false, code: "ADMIN_SESSION_INVALID" },
      { status: 401, headers: HEADERS },
    );
  }

  const { data, error } = await supabaseServer.rpc(
    "set_after_sales_fulfillment_hold",
    {
      p_case_id: CASE_ID,
      p_request_id: REQUEST_ID,
      p_invoice_id: INVOICE_ID,
      p_expected_case_status: "received",
      p_expected_case_revision: 2,
      p_expected_fulfillment_status: "not_started",
      p_expected_fulfillment_revision: 0,
      p_actor_type: actor.actorType,
      p_actor_reference: actor.actorReference,
      p_reason: REASON,
      p_confirmation: RPC_CONFIRMATION,
    },
  );

  if (error) {
    return NextResponse.json(
      { ok: false, code: "FULFILLMENT_HOLD_RPC_BLOCKED" },
      { status: 409, headers: HEADERS },
    );
  }

  const rows = data === null ? [] : Array.isArray(data) ? data : [data];
  if (rows.length !== 1) {
    return NextResponse.json(
      { ok: false, code: "FULFILLMENT_HOLD_CAS_MISS" },
      { status: 409, headers: HEADERS },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      code: "FULFILLMENT_HOLD_SET",
      caseRevision: rows[0]?.revision ?? null,
      actorReference: actor.actorReference,
    },
    { headers: HEADERS },
  );
}
