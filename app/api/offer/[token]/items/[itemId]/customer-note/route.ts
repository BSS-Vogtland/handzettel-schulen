import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    token: string;
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

async function createRequestEvent(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  requestId: string,
  eventType: string,
  message: string,
  metadata?: Record<string, unknown>
) {
  const payloads = [
    {
      request_id: requestId,
      event_type: eventType,
      title: "Kundennotiz gespeichert",
      message,
      description: message,
      metadata: metadata ?? {},
      created_at: new Date().toISOString(),
    },
    {
      request_id: requestId,
      type: eventType,
      title: "Kundennotiz gespeichert",
      message,
      description: message,
      metadata: metadata ?? {},
      created_at: new Date().toISOString(),
    },
  ];

  for (const payload of payloads) {
    const { error } = await supabase
      .from("school_request_events")
      .insert(payload);

    if (!error) return;
  }
}

export async function PATCH(request: NextRequest, context: Params) {
  try {
    const { token, itemId } = await context.params;
    const cleanToken = String(token || "").trim();
    const cleanItemId = String(itemId || "").trim();

    if (!cleanToken || !cleanItemId) {
      return jsonResponse(
        {
          ok: false,
          message: "Angebot oder Paketposition fehlt.",
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
          message: "Die Notiz konnte nicht gelesen werden.",
        },
        400
      );
    }

    const customerNote = cleanNote(body.customerNote);

    if (customerNote.length > MAX_NOTE_LENGTH) {
      return jsonResponse(
        {
          ok: false,
          message: `Die Notiz ist zu lang. Bitte maximal ${MAX_NOTE_LENGTH} Zeichen verwenden.`,
        },
        400
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: schoolRequest, error: requestError } = await supabase
      .from("school_requests")
      .select("id, status, offer_status, request_number")
      .eq("offer_token", cleanToken)
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

    if (
      schoolRequest.status === "confirmed" ||
      schoolRequest.offer_status === "confirmed"
    ) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Der Paketwunsch wurde bereits abgesendet. Notizen können danach nicht mehr geändert werden.",
        },
        409
      );
    }

    const requestId = String(schoolRequest.id);

    const { data: offerItem, error: offerItemError } = await supabase
      .from("school_offer_items")
      .select("id, request_id, product_name")
      .eq("id", cleanItemId)
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
          message: "Diese Paketposition gehört nicht zu diesem Angebot.",
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
      .eq("id", cleanItemId)
      .eq("request_id", requestId);

    if (updateError) {
      return jsonResponse(
        {
          ok: false,
          message: `Notiz konnte nicht gespeichert werden: ${updateError.message}`,
        },
        500
      );
    }

    await createRequestEvent(
      supabase,
      requestId,
      "customer_offer_item_note_saved",
      customerNote
        ? `Kunde hat eine Notiz zu „${offerItem.product_name || "Paketposition"}“ gespeichert.`
        : `Kunde hat die Notiz zu „${offerItem.product_name || "Paketposition"}“ entfernt.`,
      {
        offerItemId: cleanItemId,
        productName: offerItem.product_name || null,
        customerNote,
        requestNumber: schoolRequest.request_number || null,
      }
    );

    return jsonResponse({
      ok: true,
      customerNote,
      message: customerNote
        ? "Deine Notiz wurde gespeichert."
        : "Deine Notiz wurde entfernt.",
    });
  } catch (error) {
    console.error("Customer offer item note error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die Notiz konnte nicht gespeichert werden.",
      },
      500
    );
  }
}