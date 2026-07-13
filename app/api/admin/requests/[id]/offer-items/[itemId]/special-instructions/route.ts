import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
    itemId: string;
  }>;
};

type BodyPayload = {
  customerNote?: string | null;
};

const MAX_NOTE_LENGTH = 500;

function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

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

function cleanNote(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n");
}

async function createRequestEvent(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
  productName: string | null;
  customerNote: string;
}) {
  const { supabase, requestId, productName, customerNote } = params;

  /*
    Wichtig:
    In diesem Projekt wurde bereits festgestellt, dass school_request_events
    sicher die Spalten event_type, title, description, created_at nutzt.
    Keine message/metadata/type-Spalten voraussetzen.
  */
  await supabase.from("school_request_events").insert({
    request_id: requestId,
    event_type: "admin_offer_item_special_instructions_saved",
    title: "Besondere Hinweise gespeichert",
    description: customerNote
      ? `Admin hat besondere Hinweise zu „${
          productName || "Paketposition"
        }“ gespeichert.`
      : `Admin hat besondere Hinweise zu „${
          productName || "Paketposition"
        }“ entfernt.`,
    created_at: new Date().toISOString(),
  });
}

export async function PATCH(request: NextRequest, context: Params) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id, itemId } = await context.params;
    const requestId = String(id || "").trim();
    const offerItemId = String(itemId || "").trim();

    if (!requestId || !offerItemId) {
      return jsonResponse(
        {
          ok: false,
          message: "Anfrage oder Paketposition fehlt.",
        },
        400
      );
    }

    let body: BodyPayload = {};

    try {
      body = (await request.json()) as BodyPayload;
    } catch {
      return jsonResponse(
        {
          ok: false,
          message: "Der besondere Hinweis konnte nicht gelesen werden.",
        },
        400
      );
    }

    const customerNote = cleanNote(body.customerNote);

    if (customerNote.length > MAX_NOTE_LENGTH) {
      return jsonResponse(
        {
          ok: false,
          message: `Der Hinweis ist zu lang. Bitte maximal ${MAX_NOTE_LENGTH} Zeichen verwenden.`,
        },
        400
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: schoolRequest, error: requestError } = await supabase
      .from("school_requests")
      .select("id, request_number")
      .eq("id", requestId)
      .maybeSingle();

    if (requestError) {
      return jsonResponse(
        {
          ok: false,
          message: `Anfrage konnte nicht geladen werden: ${requestError.message}`,
        },
        500
      );
    }

    if (!schoolRequest) {
      return jsonResponse(
        {
          ok: false,
          message: "Anfrage wurde nicht gefunden.",
        },
        404
      );
    }

    const { data: offerItem, error: offerItemError } = await supabase
      .from("school_offer_items")
      .select("id, request_id, product_name")
      .eq("id", offerItemId)
      .eq("request_id", requestId)
      .maybeSingle();

    if (offerItemError) {
      return jsonResponse(
        {
          ok: false,
          message: `Paketposition konnte nicht geladen werden: ${offerItemError.message}`,
        },
        500
      );
    }

    if (!offerItem) {
      return jsonResponse(
        {
          ok: false,
          message: "Diese Paketposition gehört nicht zu dieser Anfrage.",
        },
        403
      );
    }

    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("school_offer_items")
      .update({
        customer_note: customerNote || null,
        customer_note_updated_at: customerNote ? now : null,
        updated_at: now,
      })
      .eq("id", offerItemId)
      .eq("request_id", requestId);

    if (updateError) {
      return jsonResponse(
        {
          ok: false,
          message: `Besondere Hinweise konnten nicht gespeichert werden: ${updateError.message}`,
        },
        500
      );
    }

    await createRequestEvent({
      supabase,
      requestId,
      productName: String(offerItem.product_name || "").trim() || null,
      customerNote,
    });

    return jsonResponse({
      ok: true,
      customerNote,
      message: customerNote
        ? "Besondere Hinweise wurden gespeichert."
        : "Besondere Hinweise wurden entfernt.",
    });
  } catch (error) {
    console.error("Admin offer item special instructions error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Besondere Hinweise konnten nicht gespeichert werden.",
      },
      500
    );
  }
}