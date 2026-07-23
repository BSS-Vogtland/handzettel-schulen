import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { supabaseServer } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type AddPreparedCartItemBody = {
  productId?: string | null;
  quantity?: number | string | null;
  adminNote?: string | null;
};

type ProductRow = Record<string, unknown> & {
  id?: string | number | null;
};

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeQuantity(value: unknown) {
  return Math.max(1, Math.min(99, Math.floor(toNumber(value, 1))));
}

function getStringValue(product: ProductRow, keys: string[]) {
  for (const key of keys) {
    const value = product[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function getProductName(product: ProductRow) {
  return (
    getStringValue(product, [
      "name",
      "product_name",
      "title",
      "display_name",
      "label",
    ]) || "Unbenanntes Produkt"
  );
}

function getProductSku(product: ProductRow) {
  return getStringValue(product, [
    "sku",
    "product_sku",
    "article_number",
    "item_number",
    "artikelnummer",
  ]);
}

function getProductPrice(product: ProductRow) {
  return Math.max(
    0,
    toNumber(
      product.price ??
        product.gross_price ??
        product.product_price ??
        product.unit_price ??
        product.sale_price_gross ??
        product.sale_price,
      0
    )
  );
}

function getProductImageUrl(product: ProductRow) {
  return getStringValue(product, [
    "image_styled_url",
    "styled_image_url",
    "image_url",
    "image_original_url",
    "product_image_url",
    "image",
    "photo_url",
    "picture_url",
  ]);
}

function isProductActive(product: ProductRow) {
  if (product.active === false) return false;

  const status = getStringValue(product, ["status", "product_status"]);

  if (!status) return true;

  return !["inactive", "archived", "deleted", "disabled"].includes(
    status.toLowerCase()
  );
}

export async function POST(request: Request, context: RouteContext) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id: cartId } = await context.params;
    const body = (await request.json()) as AddPreparedCartItemBody;

    const productId = cleanText(body.productId);
    const quantity = normalizeQuantity(body.quantity);

    if (!cartId) {
      return NextResponse.json(
        {
          ok: false,
          message: "Keine Warenkorb-ID übergeben.",
        },
        { status: 400 }
      );
    }

    if (!productId) {
      return NextResponse.json(
        {
          ok: false,
          message: "Kein Produkt ausgewählt.",
        },
        { status: 400 }
      );
    }

    const { data: cart, error: cartError } = await supabaseServer
      .from("school_prepared_carts")
      .select("id, status")
      .eq("id", cartId)
      .maybeSingle();

    if (cartError) {
      return NextResponse.json(
        {
          ok: false,
          message: cartError.message,
        },
        { status: 500 }
      );
    }

    if (!cart) {
      return NextResponse.json(
        {
          ok: false,
          message: "Der vorbereitete Warenkorb wurde nicht gefunden.",
        },
        { status: 404 }
      );
    }

    if (
      cart.status === "ordered" ||
      cart.status === "cancelled" ||
      cart.status === "expired"
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Dieser Warenkorb kann nicht mehr bearbeitet werden.",
        },
        { status: 409 }
      );
    }

    const { data: productData, error: productError } = await supabaseServer
      .from("school_products")
      .select("*")
      .eq("id", productId)
      .maybeSingle();

    if (productError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Produkt konnte nicht geladen werden: ${productError.message}`,
        },
        { status: 500 }
      );
    }

    const product = productData as ProductRow | null;

    if (!product || !isProductActive(product)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Das Produkt ist nicht verfügbar.",
        },
        { status: 404 }
      );
    }

    const price = getProductPrice(product);

    if (price <= 0) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Für dieses Produkt ist kein gültiger Verkaufspreis hinterlegt.",
        },
        { status: 400 }
      );
    }

    const { data: existingItem, error: existingItemError } =
      await supabaseServer
        .from("school_prepared_cart_items")
        .select("id, quantity")
        .eq("cart_id", cartId)
        .eq("product_id", productId)
        .maybeSingle();

    if (existingItemError) {
      return NextResponse.json(
        {
          ok: false,
          message: existingItemError.message,
        },
        { status: 500 }
      );
    }

    if (existingItem) {
      const nextQuantity = Math.min(
        99,
        normalizeQuantity(existingItem.quantity) + quantity
      );

      const { data: updatedItem, error: updateError } = await supabaseServer
        .from("school_prepared_cart_items")
        .update({
          quantity: nextQuantity,
          unit_price_snapshot: price,
          product_name_snapshot: getProductName(product),
          product_sku_snapshot: getProductSku(product),
          image_url_snapshot: getProductImageUrl(product),
          category_snapshot: getStringValue(product, [
            "category",
            "product_category",
            "type",
          ]),
          format_snapshot: getStringValue(product, [
            "format",
            "size",
            "product_format",
          ]),
          color_snapshot: getStringValue(product, [
            "color",
            "colour",
            "farbe",
          ]),
          lineature_snapshot: getStringValue(product, [
            "lineature",
            "lineatur",
            "ruling",
          ]),
          admin_note: cleanText(body.adminNote),
        })
        .eq("id", existingItem.id)
        .select("*")
        .single();

      if (updateError || !updatedItem) {
        return NextResponse.json(
          {
            ok: false,
            message:
              updateError?.message ||
              "Die Produktmenge konnte nicht aktualisiert werden.",
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        item: updatedItem,
        message: "Die Produktmenge wurde erhöht.",
      });
    }

    const { count } = await supabaseServer
      .from("school_prepared_cart_items")
      .select("id", { count: "exact", head: true })
      .eq("cart_id", cartId);

    const { data: createdItem, error: insertError } = await supabaseServer
      .from("school_prepared_cart_items")
      .insert({
        cart_id: cartId,
        product_id: productId,
        quantity,

        product_name_snapshot: getProductName(product),
        product_sku_snapshot: getProductSku(product),
        unit_price_snapshot: price,
        image_url_snapshot: getProductImageUrl(product),

        category_snapshot: getStringValue(product, [
          "category",
          "product_category",
          "type",
        ]),
        format_snapshot: getStringValue(product, [
          "format",
          "size",
          "product_format",
        ]),
        color_snapshot: getStringValue(product, [
          "color",
          "colour",
          "farbe",
        ]),
        lineature_snapshot: getStringValue(product, [
          "lineature",
          "lineatur",
          "ruling",
        ]),

        admin_note: cleanText(body.adminNote),
        sort_order: count || 0,
      })
      .select("*")
      .single();

    if (insertError || !createdItem) {
      return NextResponse.json(
        {
          ok: false,
          message:
            insertError?.message ||
            "Das Produkt konnte nicht hinzugefügt werden.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      item: createdItem,
      message: "Das Produkt wurde zum Warenkorb hinzugefügt.",
    });
  } catch (error) {
    console.error("Prepared cart item POST error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Das Produkt konnte nicht hinzugefügt werden.",
      },
      { status: 500 }
    );
  }
}