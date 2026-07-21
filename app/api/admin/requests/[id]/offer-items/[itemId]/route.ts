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

type PatchPayload = {
  productName?: string | null;
  productSku?: string | null;
  productPrice?: number | string | null;
  quantity?: number | string | null;
  unit?: string | null;
  notes?: string | null;
  existingProductId?: string | null;
};

type ProductRow = {
  id: string;
  name?: string | null;
  product_name?: string | null;
  title?: string | null;
  sku?: string | null;
  product_sku?: string | null;
  price?: number | string | null;
  product_price?: number | string | null;
  sale_price?: number | string | null;
  sale_price_gross?: number | string | null;
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

function getProductName(product: ProductRow) {
  return (
    product.name ||
    product.product_name ||
    product.title ||
    "Unbenanntes Produkt"
  );
}

function getProductSku(product: ProductRow) {
  return product.sku || product.product_sku || null;
}

function getProductPrice(product: ProductRow) {
  return toNumber(
    product.price ??
      product.product_price ??
      product.sale_price_gross ??
      product.sale_price,
    0
  );
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
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

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

    const existingProductId = String(body.existingProductId || "").trim();

    let productName = String(body.productName || "").trim();
    let productSku = String(body.productSku || "").trim();
    let productPrice = toNumber(body.productPrice, 0);
    const quantity = toNumber(body.quantity, 1) || 1;
    const unit = String(body.unit || "").trim();
    const notes = String(body.notes || "").trim();

    let selectedProduct: ProductRow | null = null;

    if (existingProductId) {
      const { data: productData, error: productError } = await supabase
        .from("school_products")
        .select("*")
        .eq("id", existingProductId)
        .maybeSingle();

      if (productError) {
        return jsonResponse(
          {
            ok: false,
            message: `Bestandsprodukt konnte nicht geladen werden: ${productError.message}`,
          },
          500
        );
      }

      if (!productData) {
        return jsonResponse(
          {
            ok: false,
            message: "Das gewählte Bestandsprodukt wurde nicht gefunden.",
          },
          404
        );
      }

      selectedProduct = productData as ProductRow;
      productName = getProductName(selectedProduct);
      productSku = getProductSku(selectedProduct) || "";
      productPrice = getProductPrice(selectedProduct);
    }

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
          message: "Bitte gib eine gültige Menge ein.",
        },
        400
      );
    }

    if (productPrice < 0) {
      return jsonResponse(
        {
          ok: false,
          message: "Bitte gib einen gültigen Einzelpreis ein.",
        },
        400
      );
    }

    if (selectedProduct && productPrice <= 0) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Das gewählte Bestandsprodukt hat keinen gültigen Preis. Bitte pflege den Preis zuerst in der Produktverwaltung.",
        },
        400
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
          message: "Die Paketposition wurde nicht gefunden.",
        },
        404
      );
    }

    const now = new Date().toISOString();

    const updatePayload: Record<string, unknown> = {
      product_name: productName,
      product_sku: productSku || null,
      product_price: productPrice,
      quantity,
      unit: unit || null,
      notes: notes || null,
      updated_at: now,
    };

    if (selectedProduct) {
      updatePayload.product_id = selectedProduct.id;
      updatePayload.match_id = null;
      updatePayload.source = "admin_existing_product";
    }

    const { data: updatedItem, error: updateError } = await supabase
      .from("school_offer_items")
      .update(updatePayload)
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
        updated_at: now,
      })
      .eq("id", id);

    await createRequestEvent(
      supabase,
      id,
      "admin_offer_item_updated",
      selectedProduct
        ? `Paketposition wurde auf Shopartikel „${productName}“ geändert.`
        : `Paketposition „${productName}“ wurde aktualisiert.`,
      {
        offerItemId: itemId,
        requestItemId:
          (existingItem as { request_item_id?: string | null }).request_item_id ||
          null,
        oldProductId:
          (existingItem as { product_id?: string | null }).product_id || null,
        productId:
          selectedProduct?.id ||
          (updatedItem as { product_id?: string | null }).product_id ||
          null,
        productName,
        productSku: productSku || null,
        productPrice,
        quantity,
        unit: unit || null,
        shopProductChanged: Boolean(selectedProduct),
      }
    );

    return jsonResponse({
      ok: true,
      message: selectedProduct
        ? "Paketposition wurde auf den gewählten Shopartikel geändert."
        : "Paketposition wurde aktualisiert.",
      item: updatedItem,
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
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

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