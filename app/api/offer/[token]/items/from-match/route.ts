import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    token: string;
  }>;
};

type RequestBody = {
  matchId?: string | null;
};

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

function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
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
      message,
      metadata: metadata ?? {},
    },
    {
      request_id: requestId,
      type: eventType,
      message,
      metadata: metadata ?? {},
    },
  ];

  for (const payload of payloads) {
    const { error } = await supabase
      .from("school_request_events")
      .insert(payload);

    if (!error) return;
  }
}

export async function POST(request: NextRequest, context: Params) {
  try {
    const { token } = await context.params;

    if (!token) {
      return jsonResponse(
        {
          ok: false,
          message: "Kein Angebotstoken übergeben.",
        },
        400
      );
    }

    let body: RequestBody = {};

    try {
      body = (await request.json()) as RequestBody;
    } catch {
      return jsonResponse(
        {
          ok: false,
          message: "Die Anfrage konnte nicht gelesen werden.",
        },
        400
      );
    }

    const matchId = String(body.matchId || "").trim();

    if (!matchId) {
      return jsonResponse(
        {
          ok: false,
          message: "Keine Produktvorschlag-ID übergeben.",
        },
        400
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: schoolRequest, error: requestError } = await supabase
      .from("school_requests")
      .select("*")
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
            "Der Paketwunsch wurde bereits abgesendet. Die Auswahl kann nicht mehr geändert werden.",
        },
        409
      );
    }

    const requestId = schoolRequest.id as string;

    const { data: match, error: matchError } = await supabase
      .from("school_request_matches")
      .select("*")
      .eq("id", matchId)
      .maybeSingle();

    if (matchError) {
      return jsonResponse(
        {
          ok: false,
          message: `Produktvorschlag konnte nicht geladen werden: ${matchError.message}`,
        },
        500
      );
    }

    if (!match) {
      return jsonResponse(
        {
          ok: false,
          message: "Produktvorschlag wurde nicht gefunden.",
        },
        404
      );
    }

    const requestItemId = match.request_item_id as string | null;

    if (!requestItemId) {
      return jsonResponse(
        {
          ok: false,
          message: "Dieser Produktvorschlag ist keiner Listenposition zugeordnet.",
        },
        400
      );
    }

    const { data: requestItem, error: requestItemError } = await supabase
      .from("school_request_items")
      .select("*")
      .eq("id", requestItemId)
      .maybeSingle();

    if (requestItemError) {
      return jsonResponse(
        {
          ok: false,
          message: `Listenposition konnte nicht geladen werden: ${requestItemError.message}`,
        },
        500
      );
    }

    if (!requestItem) {
      return jsonResponse(
        {
          ok: false,
          message: "Listenposition wurde nicht gefunden.",
        },
        404
      );
    }

    if (requestItem.request_id !== requestId) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Dieser Produktvorschlag gehört nicht zu dieser Kundenanfrage.",
        },
        403
      );
    }

    const { data: existingOfferItem, error: existingError } = await supabase
      .from("school_offer_items")
      .select("*")
      .eq("request_id", requestId)
      .eq("match_id", matchId)
      .maybeSingle();

    if (existingError) {
      return jsonResponse(
        {
          ok: false,
          message: `Bestehende Auswahl konnte nicht geprüft werden: ${existingError.message}`,
        },
        500
      );
    }

    if (existingOfferItem) {
      return jsonResponse({
        ok: true,
        alreadySelected: true,
        item: existingOfferItem,
        message: "Dieses Produkt ist bereits in Deinem Paketwunsch.",
      });
    }

    const quantity = toNumber(requestItem.quantity, 1) || 1;

    const { data: insertedItem, error: insertError } = await supabase
      .from("school_offer_items")
      .insert({
        request_id: requestId,
        request_item_id: requestItemId,
        match_id: matchId,
        product_id: match.product_id || null,
        product_name: match.product_name || "Produktvorschlag",
        product_sku: match.product_sku || null,
        product_price: toNumber(match.product_price, 0),
        quantity,
        unit: null,
        source: "customer_selection",
        status: "draft",
        notes: null,
      })
      .select("*")
      .single();

    if (insertError) {
      return jsonResponse(
        {
          ok: false,
          message: `Produkt konnte nicht in den Paketwunsch übernommen werden: ${insertError.message}`,
        },
        500
      );
    }

    await supabase
      .from("school_request_matches")
      .update({
        selected: true,
      })
      .eq("id", matchId);

    await supabase
      .from("school_requests")
      .update({
        offer_status: "customer_selection",
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    await createRequestEvent(
      supabase,
      requestId,
      "customer_product_selected",
      "Kunde hat ein Produkt in den Paketwunsch übernommen.",
      {
        requestItemId,
        matchId,
        productId: match.product_id || null,
        productName: match.product_name || null,
        productSku: match.product_sku || null,
        quantity,
      }
    );

    return jsonResponse({
      ok: true,
      item: insertedItem,
      message: "Produkt wurde in Deinen Paketwunsch übernommen.",
    });
  } catch (error) {
    console.error("Customer select product error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Das Produkt konnte nicht ausgewählt werden.",
      },
      500
    );
  }
}
