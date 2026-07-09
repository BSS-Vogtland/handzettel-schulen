import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    token: string;
    itemId: string;
  }>;
};

type RequestRow = {
  id: string;
  status: string | null;
  offer_status: string | null;
};

type OfferItemRow = {
  id: string;
  request_id: string;
  request_item_id: string | null;
  match_id: string | null;
  product_id: string | null;
  product_name: string | null;
  source: string | null;
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

function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

async function createRequestEvent(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const { supabase, requestId, eventType, message, metadata } = params;
  const createdAt = new Date().toISOString();

  const payloads = [
    {
      request_id: requestId,
      event_type: eventType,
      message,
      metadata: metadata || {},
      created_at: createdAt,
    },
    {
      request_id: requestId,
      type: eventType,
      message,
      metadata: metadata || {},
      created_at: createdAt,
    },
    {
      request_id: requestId,
      event_type: eventType,
      message,
      created_at: createdAt,
    },
  ];

  for (const payload of payloads) {
    const { error } = await supabase
      .from("school_request_events")
      .insert(payload);

    if (!error) return;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { token, itemId } = await context.params;

    if (!token) {
      return jsonResponse(
        {
          ok: false,
          message: "Kein Angebotstoken übergeben.",
        },
        400
      );
    }

    if (!itemId) {
      return jsonResponse(
        {
          ok: false,
          message: "Keine Paketposition übergeben.",
        },
        400
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: requestData, error: requestError } = await supabase
      .from("school_requests")
      .select("id, status, offer_status")
      .eq("offer_token", token)
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

    if (!requestData) {
      return jsonResponse(
        {
          ok: false,
          message: "Anfrage wurde nicht gefunden.",
        },
        404
      );
    }

    const requestRow = requestData as RequestRow;

    if (
      requestRow.status === "confirmed" ||
      requestRow.offer_status === "confirmed"
    ) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Der Paketwunsch wurde bereits abgesendet. Produkte können nicht mehr entfernt werden.",
        },
        409
      );
    }

    const { data: offerItemData, error: offerItemError } = await supabase
      .from("school_offer_items")
      .select("*")
      .eq("id", itemId)
      .eq("request_id", requestRow.id)
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

    if (!offerItemData) {
      return jsonResponse(
        {
          ok: false,
          message: "Diese Paketposition wurde nicht gefunden.",
        },
        404
      );
    }

    const offerItem = offerItemData as OfferItemRow;

    const { error: deleteError } = await supabase
      .from("school_offer_items")
      .delete()
      .eq("id", itemId)
      .eq("request_id", requestRow.id);

    if (deleteError) {
      return jsonResponse(
        {
          ok: false,
          message: `Produkt konnte nicht entfernt werden: ${deleteError.message}`,
        },
        500
      );
    }

    await createRequestEvent({
      supabase,
      requestId: requestRow.id,
      eventType: "customer_offer_item_removed",
      message: `Kunde hat „${
        offerItem.product_name || "Produkt"
      }“ aus dem Paket entfernt.`,
      metadata: {
        offerItemId: offerItem.id,
        requestItemId: offerItem.request_item_id,
        matchId: offerItem.match_id,
        productId: offerItem.product_id,
        source: offerItem.source,
      },
    });

    await supabase
      .from("school_requests")
      .update({
        offer_status: "customer_selection",
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestRow.id);

    return jsonResponse({
      ok: true,
      message: "Produkt wurde aus dem Paket entfernt.",
    });
  } catch (error) {
    console.error("Customer remove offer item error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Produkt konnte nicht entfernt werden.",
      },
      500
    );
  }
}

export async function GET() {
  return jsonResponse(
    {
      ok: false,
      message: "Diese Route kann nur per DELETE genutzt werden.",
    },
    405
  );
}
