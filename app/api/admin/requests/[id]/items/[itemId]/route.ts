import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { updateAdminRequestWorkflowState } from "@/lib/adminRequestWorkflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
    itemId: string;
  }>;
};

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

function jsonResponse(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status });
}

async function addRequestEvent(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  requestId: string,
  title: string,
  message: string,
  metadata?: Record<string, unknown>
) {
  await supabase.from("school_request_events").insert({
    request_id: requestId,
    event_type: "admin_request_item_deleted",
    title,
    message,
    metadata: metadata || {},
  });
}

export async function DELETE(_request: NextRequest, context: Params) {
  try {
    const { id, itemId } = await context.params;

    if (!id || !itemId) {
      return jsonResponse(
        {
          ok: false,
          message: "Anfrage-ID oder Positions-ID fehlt.",
        },
        400
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: requestItem, error: itemError } = await supabase
      .from("school_request_items")
      .select("id, request_id, raw_text, normalized_name, status")
      .eq("id", itemId)
      .eq("request_id", id)
      .maybeSingle();

    if (itemError) {
      return jsonResponse(
        {
          ok: false,
          message: itemError.message,
        },
        500
      );
    }

    if (!requestItem) {
      return jsonResponse(
        {
          ok: false,
          message: "Die Listenposition wurde nicht gefunden.",
        },
        404
      );
    }

    if (requestItem.status !== "manual_admin_added") {
      return jsonResponse(
        {
          ok: false,
          message:
            "Nur manuell vom Admin angelegte Listenpositionen können hier gelöscht werden.",
        },
        400
      );
    }

    const { data: linkedOfferItems, error: linkedOfferError } = await supabase
      .from("school_offer_items")
      .select("id")
      .eq("request_id", id)
      .eq("request_item_id", itemId)
      .limit(1);

    if (linkedOfferError) {
      return jsonResponse(
        {
          ok: false,
          message: linkedOfferError.message,
        },
        500
      );
    }

    if ((linkedOfferItems || []).length > 0) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Diese Listenposition hat bereits Paketpositionen. Lösche zuerst die zugehörigen Paketpositionen.",
        },
        400
      );
    }

    await supabase
      .from("school_request_matches")
      .delete()
      .eq("request_item_id", itemId);

    await supabase
      .from("school_request_item_questions")
      .delete()
      .eq("request_id", id)
      .eq("request_item_id", itemId);

    const { error: deleteError } = await supabase
      .from("school_request_items")
      .delete()
      .eq("id", itemId)
      .eq("request_id", id)
      .eq("status", "manual_admin_added");

    if (deleteError) {
      return jsonResponse(
        {
          ok: false,
          message: deleteError.message,
        },
        500
      );
    }

    await updateAdminRequestWorkflowState(supabase, id);

    const itemLabel =
      requestItem.normalized_name || requestItem.raw_text || "Listenposition";

    await addRequestEvent(
      supabase,
      id,
      "Listenposition gelöscht",
      `Admin hat die manuell angelegte Listenposition „${itemLabel}“ gelöscht.`,
      {
        request_item_id: itemId,
      }
    );

    return jsonResponse({
      ok: true,
      message: "Listenposition wurde gelöscht.",
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Listenposition konnte nicht gelöscht werden.",
      },
      500
    );
  }
}