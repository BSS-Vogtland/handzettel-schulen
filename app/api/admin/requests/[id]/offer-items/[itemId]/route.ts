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

type PatchPayload = {
  productName?: string | null;
  productSku?: string | null;
  productPrice?: number | string | null;
  quantity?: number | string | null;
  unit?: string | null;
  notes?: string | null;
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
    const { error } = await supabase.from("school_request_events").insert(payload);
    if (!error) return;
  }
}

export async function PATCH(request: NextRequest, context: Params) {
  try {
    const { id, itemId } = await context.params;
    const supabase = getSupabaseAdmin();

    if (!id || !itemId) {
      return jsonResponse(
        {
          ok: false,
          message: "Anfrage-ID oder Paketpositions-ID fehlt.",
        },
        400
      );
    }

    let body: PatchPayload = {};

    try {
      body = (await request.json()) as PatchPayload;
    } catch {
      return jsonResponse(
        {
          ok: false,
          message: "Die Anfrage konnte nicht gelesen werden.",
        },
        400
      );
    }

    const productName = String(body.productName || "").trim();
    const productSku = String(body.productSku || "").trim();
    const unit = String(body.unit || "").trim();
    const notes = String(body.notes || "").trim();
    const productPrice = toNumber(body.productPrice, 0);
    const quantity = toNumber(body.quantity, 1) || 1;

    if (!productName) {
      return jsonResponse(
        {
          ok: false,
          message: "Bitte gib einen Produktnamen ein.",
        },
        400
      );
    }

    if (quantity <= 0) {
      return jsonResponse(
        {
          ok: false,
          message: "Die Menge muss größer als 0 sein.",
        },
        400
      );
    }

    const { data: schoolRequest, error: requestError } = await supabase
      .from("school_requests")
      .select("*")
      .eq("id", id)
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

    const { data: existingItem, error: existingError } = await supabase
      .from("school_offer_items")
      .select("*")
      .eq("id", itemId)
      .eq("request_id", id)
      .maybeSingle();

    if (existingError) {
      return jsonResponse(
        {
          ok: false,
          message: `Paketposition konnte nicht geladen werden: ${existingError.message}`,
        },
        500
      );
    }

    if (!existingItem) {
      return jsonResponse(
        {
          ok: false,
          message: "Paketposition wurde nicht gefunden.",
        },
        404
      );
    }

    const { data: updatedItem, error: updateError } = await supabase
      .from("school_offer_items")
      .update({
        product_name: productName,
        product_sku: productSku || null,
        product_price: productPrice,
        quantity,
        unit: unit || null,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", itemId)
      .eq("request_id", id)
      .select("*")
      .single();

    if (updateError) {
      return jsonResponse(
        {
          ok: false,
          message: `Paketposition konnte nicht aktualisiert werden: ${updateError.message}`,
        },
        500
      );
    }

    await supabase
      .from("school_requests")
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    await createRequestEvent(
      supabase,
      id,
      "admin_offer_item_updated",
      "Admin hat eine Paketposition bearbeitet.",
      {
        offerItemId: itemId,
        oldProductName: existingItem.product_name || null,
        newProductName: productName,
        productSku: productSku || null,
        productPrice,
        quantity,
        unit: unit || null,
      }
    );

    return jsonResponse({
      ok: true,
      item: updatedItem,
      message: "Paketposition wurde aktualisiert.",
    });
  } catch (error) {
    console.error("Admin update offer item error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Paketposition konnte nicht aktualisiert werden.",
      },
      500
    );
  }
}

export async function DELETE(_request: NextRequest, context: Params) {
  try {
    const { id, itemId } = await context.params;
    const supabase = getSupabaseAdmin();

    if (!id || !itemId) {
      return jsonResponse(
        {
          ok: false,
          message: "Anfrage-ID oder Paketpositions-ID fehlt.",
        },
        400
      );
    }

    const { data: schoolRequest, error: requestError } = await supabase
      .from("school_requests")
      .select("*")
      .eq("id", id)
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

    const { data: offerItem, error: itemError } = await supabase
      .from("school_offer_items")
      .select("*")
      .eq("id", itemId)
      .eq("request_id", id)
      .maybeSingle();

    if (itemError) {
      return jsonResponse(
        {
          ok: false,
          message: `Paketposition konnte nicht geladen werden: ${itemError.message}`,
        },
        500
      );
    }

    if (!offerItem) {
      return jsonResponse(
        {
          ok: false,
          message: "Paketposition wurde nicht gefunden.",
        },
        404
      );
    }

    const { error: deleteError } = await supabase
      .from("school_offer_items")
      .delete()
      .eq("id", itemId)
      .eq("request_id", id);

    if (deleteError) {
      return jsonResponse(
        {
          ok: false,
          message: `Paketposition konnte nicht gelöscht werden: ${deleteError.message}`,
        },
        500
      );
    }

    if (offerItem.match_id) {
      await supabase
        .from("school_request_matches")
        .update({
          selected: false,
        })
        .eq("id", offerItem.match_id);
    }

    await supabase
      .from("school_requests")
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    await createRequestEvent(
      supabase,
      id,
      "admin_offer_item_deleted",
      "Admin hat eine Paketposition gelöscht.",
      {
        offerItemId: itemId,
        requestItemId: offerItem.request_item_id || null,
        matchId: offerItem.match_id || null,
        productId: offerItem.product_id || null,
        productName: offerItem.product_name || null,
        productSku: offerItem.product_sku || null,
        source: offerItem.source || null,
        requestWasConfirmed:
          schoolRequest.status === "confirmed" ||
          schoolRequest.offer_status === "confirmed",
      }
    );

    return jsonResponse({
      ok: true,
      message: "Paketposition wurde gelöscht.",
    });
  } catch (error) {
    console.error("Admin delete offer item error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Paketposition konnte nicht gelöscht werden.",
      },
      500
    );
  }
}