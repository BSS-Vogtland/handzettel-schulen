import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { updateAdminRequestWorkflowState } from "@/lib/adminRequestWorkflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
    itemId: string;
  }>;
};

type ResolutionStatus =
  | "customer_supplies_self"
  | "covered_by_alternative"
  | "open";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase Umgebungsvariablen fehlen. Prüfe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getResolutionLabel(status: ResolutionStatus) {
  switch (status) {
    case "customer_supplies_self":
      return "Kunde besorgt selbst";
    case "covered_by_alternative":
      return "Durch Alternative/Sammelposition abgedeckt";
    case "open":
      return "Wieder geöffnet";
    default:
      return "Bearbeitet";
  }
}

export async function POST(request: NextRequest, context: Params) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id, itemId } = await context.params;
    const supabase = getSupabaseAdmin();

    if (!id || !itemId) {
      return jsonResponse(
        {
          ok: false,
          message: "Anfrage-ID oder Positions-ID fehlt.",
        },
        400
      );
    }

    let body: {
      resolutionStatus?: ResolutionStatus;
      note?: string | null;
    } = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const resolutionStatus = String(
      body.resolutionStatus || ""
    ).trim() as ResolutionStatus;

    const allowedStatuses: ResolutionStatus[] = [
      "customer_supplies_self",
      "covered_by_alternative",
      "open",
    ];

    if (!allowedStatuses.includes(resolutionStatus)) {
      return jsonResponse(
        {
          ok: false,
          message: "Ungültiger Erledigungsstatus.",
        },
        400
      );
    }

    const { data: existingItem, error: itemError } = await supabase
      .from("school_request_items")
      .select("id, request_id, raw_text, normalized_name")
      .eq("id", itemId)
      .maybeSingle();

    if (itemError) {
      return jsonResponse(
        {
          ok: false,
          message: `Listenposition konnte nicht geprüft werden: ${itemError.message}`,
        },
        500
      );
    }

    if (!existingItem || existingItem.request_id !== id) {
      return jsonResponse(
        {
          ok: false,
          message: "Diese Listenposition gehört nicht zu dieser Anfrage.",
        },
        400
      );
    }

    const now = new Date().toISOString();

    const updatePayload =
      resolutionStatus === "open"
        ? {
            admin_resolution_status: null,
            admin_resolution_note: null,
            admin_resolved_at: null,
            admin_resolved_by: null,
            updated_at: now,
          }
        : {
            admin_resolution_status: resolutionStatus,
            admin_resolution_note: String(body.note || "").trim() || null,
            admin_resolved_at: now,
            admin_resolved_by: "admin",
            updated_at: now,
          };

    const { error: updateError } = await supabase
      .from("school_request_items")
      .update(updatePayload)
      .eq("id", itemId)
      .eq("request_id", id);

    if (updateError) {
      return jsonResponse(
        {
          ok: false,
          message: `Listenposition konnte nicht gespeichert werden: ${updateError.message}`,
        },
        500
      );
    }

    const itemLabel =
      String(existingItem.normalized_name || "").trim() ||
      String(existingItem.raw_text || "").trim() ||
      "Listenposition";

    await supabase.from("school_request_events").insert({
      request_id: id,
      event_type:
        resolutionStatus === "open"
          ? "admin_request_item_reopened"
          : "admin_request_item_resolved",
      title:
        resolutionStatus === "open"
          ? "Listenposition wieder geöffnet"
          : "Listenposition fachlich erledigt",
      message:
        resolutionStatus === "open"
          ? `${itemLabel} wurde wieder als offene Position markiert.`
          : `${itemLabel} wurde markiert als: ${getResolutionLabel(
              resolutionStatus
            )}.`,
    });

    await updateAdminRequestWorkflowState(supabase, id);

    return jsonResponse({
      ok: true,
      message:
        resolutionStatus === "open"
          ? "Position wurde wieder geöffnet."
          : "Position wurde als erledigt markiert.",
      resolutionStatus,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Position konnte nicht gespeichert werden.",
      },
      500
    );
  }
}