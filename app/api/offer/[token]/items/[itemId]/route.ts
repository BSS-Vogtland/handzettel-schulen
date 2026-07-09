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

type RequestItemSnapshot = {
  id: string;
  status: string | null;
  admin_resolution_status: string | null;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase Umgebungsvariablen fehlen. PrÃ¼fe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY."
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
          message: "Kein Angebotstoken Ã¼bergeben.",
        },
        400
      );
    }

    if (!itemId) {
      return jsonResponse(
        {
          ok: false,
          message: "Keine Paketposition Ã¼bergeben.",
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
            "Der Paketwunsch wurde bereits abgesendet. Produkte kÃ¶nnen nicht mehr entfernt werden.",
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
    const now = new Date().toISOString();

    let requestItemSnapshot: RequestItemSnapshot | null = null;

    if (offerItem.request_item_id) {
      const { data: requestItemData, error: requestItemFetchError } =
        await supabase
          .from("school_request_items")
          .select("id, status, admin_resolution_status")
          .eq("id", offerItem.request_item_id)
          .eq("request_id", requestRow.id)
          .maybeSingle();

      if (requestItemFetchError) {
        return jsonResponse(
          {
            ok: false,
            message: `Zugehoerige Listenposition konnte nicht geladen werden: ${requestItemFetchError.message}`,
          },
          500
        );
      }

      if (requestItemData) {
        requestItemSnapshot = requestItemData as RequestItemSnapshot;

        const { error: requestItemUpdateError } = await supabase
          .from("school_request_items")
          .update({
            status: "not_needed",
            admin_resolution_status: "not_needed",
            updated_at: now,
          })
          .eq("id", offerItem.request_item_id)
          .eq("request_id", requestRow.id);

        if (requestItemUpdateError) {
          return jsonResponse(
            {
              ok: false,
              message: `Listenposition konnte nicht als nicht benoetigt markiert werden: ${requestItemUpdateError.message}`,
            },
            500
          );
        }
      }
    }

    const { error: deleteError } = await supabase
      .from("school_offer_items")
      .delete()
      .eq("id", itemId)
      .eq("request_id", requestRow.id);

    if (deleteError) {
      if (requestItemSnapshot && offerItem.request_item_id) {
        await supabase
          .from("school_request_items")
          .update({
            status: requestItemSnapshot.status,
            admin_resolution_status: requestItemSnapshot.admin_resolution_status,
            updated_at: now,
          })
          .eq("id", offerItem.request_item_id)
          .eq("request_id", requestRow.id);
      }

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
      message: `Kunde hat â€ž${
        offerItem.product_name || "Produkt"
      }â€œ aus dem Paket entfernt.`,
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
        updated_at: now,
      })
      .eq("id", requestRow.id);

    return jsonResponse({
      ok: true,
      message: "Produkt wurde aus dem Paket entfernt und als nicht benoetigt markiert.",
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
