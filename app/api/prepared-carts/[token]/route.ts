import { supabaseServer } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

type ProductRow = Record<string, unknown> & {
  id?: string | number | null;
};

type PreparedCartItemRow = {
  id: string;
  cart_id: string;
  product_id: string;
  quantity: number | string;
  product_name_snapshot: string;
  product_sku_snapshot: string | null;
  unit_price_snapshot: number | string;
  image_url_snapshot: string | null;
  category_snapshot: string | null;
  format_snapshot: string | null;
  color_snapshot: string | null;
  lineature_snapshot: string | null;
  sort_order: number | string;
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

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
  return roundMoney(
    Math.max(
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
  if (product.active === false) {
    return false;
  }

  const status = getStringValue(product, ["status", "product_status"]);

  if (!status) {
    return true;
  }

  return !["inactive", "archived", "deleted", "disabled"].includes(
    status.toLowerCase()
  );
}

export async function GET(
  _request: Request,
  context: RouteContext
) {
  try {
    const { token } = await context.params;
    const normalizedToken = cleanText(token);

    if (!normalizedToken) {
      return NextResponse.json(
        {
          ok: false,
          message: "Der Warenkorb-Link ist unvollständig.",
        },
        { status: 400 }
      );
    }

    const { data: cartData, error: cartError } = await supabaseServer
      .from("school_prepared_carts")
      .select("*")
      .eq("token", normalizedToken)
      .maybeSingle();

    if (cartError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Der vorbereitete Warenkorb konnte nicht geladen werden: ${cartError.message}`,
        },
        { status: 500 }
      );
    }

    if (!cartData) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Dieser Warenkorb-Link ist ungültig oder wurde zurückgezogen.",
        },
        { status: 404 }
      );
    }

    const cart = cartData as Record<string, unknown>;
    const status = String(cart.status || "draft");
    const expiresAt = cleanText(cart.expires_at);
    const isExpired =
      expiresAt !== null &&
      new Date(expiresAt).getTime() <= Date.now();

    if (
      isExpired &&
      ["draft", "sent", "opened", "edited"].includes(status)
    ) {
      await supabaseServer
        .from("school_prepared_carts")
        .update({
          status: "expired",
        })
        .eq("id", cart.id);

      return NextResponse.json(
        {
          ok: false,
          status: "expired",
          message:
            "Dieser vorbereitete Warenkorb ist leider abgelaufen. Bitte kontaktiere uns für einen neuen Link.",
        },
        { status: 410 }
      );
    }

    if (status === "cancelled") {
      return NextResponse.json(
        {
          ok: false,
          status,
          message:
            "Dieser vorbereitete Warenkorb wurde zurückgezogen.",
        },
        { status: 410 }
      );
    }

    if (status === "ordered") {
      const invoiceToken = cleanText(cart.ordered_invoice_token);

      return NextResponse.json({
        ok: true,
        status,
        alreadyOrdered: true,
        title: cleanText(cart.title),
        customerName: cleanText(cart.customer_name),
        orderedAt: cleanText(cart.ordered_at),
        invoiceUrl: invoiceToken
          ? `/rechnung/${encodeURIComponent(invoiceToken)}`
          : null,
      });
    }

    const { data: itemData, error: itemError } = await supabaseServer
      .from("school_prepared_cart_items")
      .select("*")
      .eq("cart_id", cart.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (itemError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Die Warenkorbpositionen konnten nicht geladen werden: ${itemError.message}`,
        },
        { status: 500 }
      );
    }

    const preparedItems = (itemData || []) as PreparedCartItemRow[];
    const productIds = preparedItems.map((item) => item.product_id);

    let products: ProductRow[] = [];

    if (productIds.length > 0) {
      const { data, error } = await supabaseServer
        .from("school_products")
        .select("*")
        .in("id", productIds);

      if (error) {
        return NextResponse.json(
          {
            ok: false,
            message: `Die aktuellen Produktdaten konnten nicht geladen werden: ${error.message}`,
          },
          { status: 500 }
        );
      }

      products = (data || []) as ProductRow[];
    }

    const productsById = new Map<string, ProductRow>();

    for (const product of products) {
      const productId = cleanText(product.id);

      if (productId) {
        productsById.set(productId, product);
      }
    }

    const availableItems: Array<Record<string, unknown>> = [];
    const unavailableItems: Array<Record<string, unknown>> = [];

    for (const preparedItem of preparedItems) {
      const product = productsById.get(preparedItem.product_id);
      const quantity = normalizeQuantity(preparedItem.quantity);

      if (!product || !isProductActive(product)) {
        unavailableItems.push({
          id: preparedItem.id,
          productId: preparedItem.product_id,
          name: preparedItem.product_name_snapshot,
          sku: preparedItem.product_sku_snapshot,
          quantity,
          reason: "Dieses Produkt ist momentan nicht verfügbar.",
        });
        continue;
      }

      const currentPrice = getProductPrice(product);

      if (currentPrice <= 0) {
        unavailableItems.push({
          id: preparedItem.id,
          productId: preparedItem.product_id,
          name: getProductName(product),
          sku: getProductSku(product),
          quantity,
          reason:
            "Für dieses Produkt ist momentan kein gültiger Preis hinterlegt.",
        });
        continue;
      }

      availableItems.push({
        preparedItemId: preparedItem.id,
        productId: preparedItem.product_id,
        name: getProductName(product),
        sku: getProductSku(product),
        price: currentPrice,
        preparedPrice: roundMoney(
          toNumber(preparedItem.unit_price_snapshot, 0)
        ),
        imageUrl:
          getProductImageUrl(product) ||
          preparedItem.image_url_snapshot,
        quantity,
        category:
          getStringValue(product, [
            "category",
            "product_category",
            "type",
          ]) || preparedItem.category_snapshot,
        format:
          getStringValue(product, [
            "format",
            "size",
            "product_format",
          ]) || preparedItem.format_snapshot,
        color:
          getStringValue(product, [
            "color",
            "colour",
            "farbe",
          ]) || preparedItem.color_snapshot,
        lineature:
          getStringValue(product, [
            "lineature",
            "lineatur",
            "ruling",
          ]) || preparedItem.lineature_snapshot,
      });
    }

    if (status === "draft" || status === "sent") {
      await supabaseServer
        .from("school_prepared_carts")
        .update({
          status: "opened",
          opened_at: cart.opened_at || new Date().toISOString(),
        })
        .eq("id", cart.id);
    }

    const subtotalAmount = roundMoney(
      availableItems.reduce((sum, rawItem) => {
        return (
          sum +
          toNumber(rawItem.price, 0) *
            normalizeQuantity(rawItem.quantity)
        );
      }, 0)
    );

    return NextResponse.json({
      ok: true,
      status: status === "draft" || status === "sent" ? "opened" : status,
      alreadyOrdered: false,

      cart: {
        id: cart.id,
        token: normalizedToken,
        title: cleanText(cart.title),
        customerName: cleanText(cart.customer_name),
        email: cleanText(cart.email),
        phone: cleanText(cart.phone),
        expiresAt,
        subtotalAmount,
        items: availableItems,
        unavailableItems,

        checkoutPrefill: {
          token: normalizedToken,

          /*
           * Nur aktuelle und vergleichsweise stabile Kontaktdaten werden
           * vorausgefüllt. Frühere Adressen, Schulangaben, Übergabearten
           * und Zahlungsarten werden bewusst nicht wiederverwendet.
           */
          customerName: cleanText(cart.customer_name) || "",
          email: cleanText(cart.email) || "",
          phone: cleanText(cart.phone) || "",

          billingName: cleanText(cart.customer_name) || "",
          billingEmail: cleanText(cart.email) || "",
          billingPhone: cleanText(cart.phone) || "",
          billingStreet: "",
          billingPostalCode: "",
          billingCity: "",

          shippingAddressDiffers: false,
          shippingName: "",
          shippingStreet: "",
          shippingPostalCode: "",
          shippingCity: "",

          childName: "",
          schoolName: "",
          className: "",

          fulfillmentMethod: "pickup",
          paymentMethod: "paypal",

          customerMessage: "",
        },
      },
    });
  } catch (error) {
    console.error("Prepared cart public GET error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Der vorbereitete Warenkorb konnte nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}