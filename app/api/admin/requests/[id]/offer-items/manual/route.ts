import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createUniqueProductSku } from "../../../../../../lib/productSku";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

type ManualOfferItemPayload = {
  requestItemId?: string | null;
  productName?: string | null;
  productSku?: string | null;
  productPrice?: number | string | null;
  quantity?: number | string | null;
  unit?: string | null;
  notes?: string | null;

  existingProductId?: string | null;
  saveAsProduct?: boolean;
  rememberForFuture?: boolean;

  productCategory?: string | null;
  productType?: string | null;
  productFormat?: string | null;
  productColor?: string | null;
  productLineature?: string | null;
  aliasText?: string | null;
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
  category?: string | null;
  product_type?: string | null;
  format?: string | null;
  color?: string | null;
  lineature?: string | null;
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

function normalizeText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/grün/g, "gruen")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitKeywords(value: unknown) {
  return normalizeText(value)
    .split(" ")
    .filter((word) => word.length >= 2)
    .slice(0, 12);
}

function cleanAliasValue(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function buildAutomaticAliasList(input: {
  productName: string;
  productSku: string;
  category: string;
  productType: string;
  format: string;
  color: string;
  lineature: string;
  aliasText: string;
}) {
  const manualAliases = input.aliasText
    .split(/[\n,;]+/)
    .map((alias) => cleanAliasValue(alias))
    .filter((alias) => alias.length >= 2);

  const generatedAliases = [
    input.productName,
    input.productSku,
    `${input.productName} ${input.productSku}`,
    `${input.productName} ${input.category}`,
    `${input.productName} ${input.productType}`,
    `${input.productName} ${input.format}`,
    `${input.productName} ${input.color}`,
    `${input.productName} ${input.lineature}`,
    `${input.productName} ${input.format} ${input.color}`,
    `${input.productName} ${input.format} ${input.lineature}`,
    `${input.productType} ${input.format} ${input.color} ${input.lineature}`,
    `${input.category} ${input.format} ${input.color} ${input.lineature}`,
  ]
    .map((alias) => cleanAliasValue(alias))
    .filter((alias) => alias.length >= 2);

  return Array.from(new Set([...manualAliases, ...generatedAliases]));
}

function getMissingNewProductFields(input: {
  productName: string;
  productPrice: number;
  productCategory: string;
  productType: string;
  quantity: number;
  unit: string;
}) {
  const missingFields: string[] = [];

  if (!input.productName) missingFields.push("Produktname");
  if (input.productPrice <= 0) missingFields.push("Einzelpreis größer 0");
  if (!input.productCategory) missingFields.push("Kategorie");
  if (!input.productType) missingFields.push("Produkttyp");
  if (input.quantity <= 0) missingFields.push("Menge größer 0");
  if (!input.unit) missingFields.push("Einheit");

  return missingFields;
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

async function getRequestItemText(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  requestItemId: string | null
) {
  if (!requestItemId) return null;

  const { data } = await supabase
    .from("school_request_items")
    .select("*")
    .eq("id", requestItemId)
    .maybeSingle();

  if (!data) return null;

  return String(
    data.normalized_name ||
      data.raw_text ||
      [data.product_type, data.category, data.format, data.color, data.lineature]
        .filter(Boolean)
        .join(" ") ||
      ""
  ).trim();
}

async function findExistingProductBySkuOrName(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  productName: string,
  productSku: string
) {
  if (productSku) {
    const skuColumns = ["sku", "product_sku"];

    for (const column of skuColumns) {
      const { data, error } = await supabase
        .from("school_products")
        .select("*")
        .eq(column, productSku)
        .maybeSingle();

      if (!error && data) return data as ProductRow;
    }
  }

  const nameColumns = ["name", "product_name", "title"];

  for (const column of nameColumns) {
    const { data, error } = await supabase
      .from("school_products")
      .select("*")
      .eq(column, productName)
      .maybeSingle();

    if (!error && data) return data as ProductRow;
  }

  return null;
}

async function createProductFlexible(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  input: {
    productName: string;
    productSku: string;
    productPrice: number;
    category: string;
    productType: string;
    format: string;
    color: string;
    lineature: string;
    aliasText: string;
  }
) {
  const matchKeywords = Array.from(
    new Set([
      ...splitKeywords(input.productName),
      ...splitKeywords(input.aliasText),
      ...splitKeywords(input.category),
      ...splitKeywords(input.productType),
      ...splitKeywords(input.format),
      ...splitKeywords(input.color),
      ...splitKeywords(input.lineature),
    ])
  );

  const payloadVariants = [
    {
      name: input.productName,
      sku: input.productSku || null,
      price: input.productPrice,
      category: input.category || null,
      product_type: input.productType || null,
      format: input.format || null,
      color: input.color || null,
      lineature: input.lineature || null,
      match_keywords: matchKeywords,
      active: true,
    },
    {
      product_name: input.productName,
      product_sku: input.productSku || null,
      product_price: input.productPrice,
      category: input.category || null,
      product_type: input.productType || null,
      format: input.format || null,
      color: input.color || null,
      lineature: input.lineature || null,
      match_keywords: matchKeywords,
      active: true,
    },
    {
      title: input.productName,
      sku: input.productSku || null,
      price: input.productPrice,
      category: input.category || null,
    },
  ];

  let lastError: unknown = null;

  for (const payload of payloadVariants) {
    const { data, error } = await supabase
      .from("school_products")
      .insert(payload)
      .select("*")
      .single();

    if (!error && data) return data as ProductRow;

    lastError = error;
  }

  throw new Error(
    `Produkt konnte nicht angelegt werden: ${
      lastError instanceof Error ? lastError.message : "Tabellenstruktur prüfen."
    }`
  );
}

async function createAliasFlexible(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  productId: string,
  aliasText: string
) {
  const cleanedAlias = String(aliasText || "").trim();

  if (!productId || !cleanedAlias) return false;

  const aliasVariants = [
    {
      product_id: productId,
      alias: cleanedAlias,
    },
    {
      product_id: productId,
      alias_text: cleanedAlias,
    },
    {
      product_id: productId,
      alias_name: cleanedAlias,
    },
    {
      product_id: productId,
      name: cleanedAlias,
    },
  ];

  for (const payload of aliasVariants) {
    const { error } = await supabase
      .from("school_product_aliases")
      .insert(payload);

    if (!error) return true;
  }

  return false;
}

export async function POST(request: NextRequest, context: Params) {
  try {
    const { id } = await context.params;
    const supabase = getSupabaseAdmin();

    if (!id) {
      return jsonResponse(
        {
          ok: false,
          message: "Keine Anfrage-ID übergeben.",
        },
        400
      );
    }

    let body: ManualOfferItemPayload = {};

    try {
      body = (await request.json()) as ManualOfferItemPayload;
    } catch {
      return jsonResponse(
        {
          ok: false,
          message: "Die Anfrage konnte nicht gelesen werden.",
        },
        400
      );
    }

    let productName = String(body.productName || "").trim();
    let productSku = String(body.productSku || "").trim();
    const notes = String(body.notes || "").trim();
    const unit = String(body.unit || "").trim();

    let productPrice = toNumber(body.productPrice, 0);
    const quantity = toNumber(body.quantity, 1) || 1;

    const existingProductId = String(body.existingProductId || "").trim();
    const saveAsProduct = Boolean(body.saveAsProduct);
    const rememberForFuture = Boolean(body.rememberForFuture);

    const productCategory = String(body.productCategory || "").trim();
    const productType = String(body.productType || "").trim();
    const productFormat = String(body.productFormat || "").trim();
    const productColor = String(body.productColor || "").trim();
    const productLineature = String(body.productLineature || "").trim();

    if (!existingProductId && !saveAsProduct) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Bitte suche zuerst ein Bestandsprodukt. Wenn der Artikel nicht vorhanden ist, öffne bewusst „Neues Produkt erfassen“.",
        },
        400
      );
    }

    if (!productName && !existingProductId) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Bitte gib einen Produktnamen ein oder wähle ein Bestandsprodukt aus.",
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

    if (saveAsProduct && !existingProductId) {
      const missingFields = getMissingNewProductFields({
        productName,
        productPrice,
        productCategory,
        productType,
        quantity,
        unit,
      });

      if (missingFields.length > 0) {
        return jsonResponse(
          {
            ok: false,
            message: `Neues Produkt nicht gespeichert: Bitte fülle folgende Pflichtfelder aus: ${missingFields.join(
              ", "
            )}.`,
          },
          400
        );
      }
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

    const requestItemId = body.requestItemId
      ? String(body.requestItemId).trim()
      : null;

    if (requestItemId) {
      const { data: requestItem, error: itemError } = await supabase
        .from("school_request_items")
        .select("id, request_id")
        .eq("id", requestItemId)
        .maybeSingle();

      if (itemError) {
        return jsonResponse(
          {
            ok: false,
            message: `Listenposition konnte nicht geprüft werden: ${itemError.message}`,
          },
          500
        );
      }

      if (!requestItem || requestItem.request_id !== id) {
        return jsonResponse(
          {
            ok: false,
            message:
              "Die gewählte Listenposition gehört nicht zu dieser Anfrage.",
          },
          400
        );
      }
    }

    let productId: string | null = null;
    let productWasCreated = false;
    let productWasExisting = false;
    let productAliasList: string[] = [];

    const requestItemAliasText = await getRequestItemText(
      supabase,
      requestItemId
    );

    const preferredAliasText =
      String(body.aliasText || "").trim() || requestItemAliasText || productName;

    if (existingProductId) {
      const { data: existingProduct, error: existingProductError } =
        await supabase
          .from("school_products")
          .select("*")
          .eq("id", existingProductId)
          .maybeSingle();

      if (existingProductError) {
        return jsonResponse(
          {
            ok: false,
            message: `Bestandsprodukt konnte nicht geladen werden: ${existingProductError.message}`,
          },
          500
        );
      }

      if (!existingProduct) {
        return jsonResponse(
          {
            ok: false,
            message: "Das gewählte Bestandsprodukt wurde nicht gefunden.",
          },
          404
        );
      }

      const product = existingProduct as ProductRow;

      productId = product.id;
      productName = getProductName(product);
      productSku = getProductSku(product) || productSku;
      productPrice = getProductPrice(product);

      if (productPrice <= 0) {
        return jsonResponse(
          {
            ok: false,
            message:
              "Das gewählte Bestandsprodukt hat keinen gültigen Preis. Bitte pflege den Preis zuerst in der Produktverwaltung.",
          },
          400
        );
      }

      productAliasList = buildAutomaticAliasList({
        productName,
        productSku,
        category: String(product.category || productCategory || "").trim(),
        productType: String(product.product_type || productType || "").trim(),
        format: String(product.format || productFormat || "").trim(),
        color: String(product.color || productColor || "").trim(),
        lineature: String(product.lineature || productLineature || "").trim(),
        aliasText: preferredAliasText,
      });

      productWasExisting = true;
    } else if (saveAsProduct) {
      if (!productSku) {
        productSku = await createUniqueProductSku({
          supabase,
          input: {
            productName,
            category: productCategory,
            productType,
            format: productFormat,
            color: productColor,
            lineature: productLineature,
          },
        });
      }

      productAliasList = buildAutomaticAliasList({
        productName,
        productSku,
        category: productCategory,
        productType,
        format: productFormat,
        color: productColor,
        lineature: productLineature,
        aliasText: preferredAliasText,
      });

      const alreadyExisting = await findExistingProductBySkuOrName(
        supabase,
        productName,
        productSku
      );

      if (alreadyExisting) {
        productId = alreadyExisting.id;
        productName = getProductName(alreadyExisting);
        productSku = getProductSku(alreadyExisting) || productSku;
        productPrice = getProductPrice(alreadyExisting);

        if (productPrice <= 0) {
          return jsonResponse(
            {
              ok: false,
              message:
                "Ein gleiches Bestandsprodukt wurde gefunden, hat aber keinen gültigen Preis. Bitte pflege den Preis zuerst in der Produktverwaltung.",
            },
            400
          );
        }

        productAliasList = buildAutomaticAliasList({
          productName,
          productSku,
          category: String(alreadyExisting.category || productCategory || "").trim(),
          productType: String(
            alreadyExisting.product_type || productType || ""
          ).trim(),
          format: String(alreadyExisting.format || productFormat || "").trim(),
          color: String(alreadyExisting.color || productColor || "").trim(),
          lineature: String(
            alreadyExisting.lineature || productLineature || ""
          ).trim(),
          aliasText: preferredAliasText,
        });

        productWasExisting = true;
      } else {
        const createdProduct = await createProductFlexible(supabase, {
          productName,
          productSku,
          productPrice,
          category: productCategory,
          productType,
          format: productFormat,
          color: productColor,
          lineature: productLineature,
          aliasText: productAliasList.join("\n"),
        });

        productId = createdProduct.id;
        productName = getProductName(createdProduct);
        productSku = getProductSku(createdProduct) || productSku;
        productPrice = getProductPrice(createdProduct);
        productWasCreated = true;
      }
    }

    let aliasCount = 0;

    if ((rememberForFuture || saveAsProduct || productWasExisting) && productId) {
      for (const alias of productAliasList) {
        const created = await createAliasFlexible(supabase, productId, alias);
        if (created) aliasCount += 1;
      }
    }

    if (productId && requestItemId) {
      const { data: duplicateItem, error: duplicateError } = await supabase
        .from("school_offer_items")
        .select("id, product_name")
        .eq("request_id", id)
        .eq("request_item_id", requestItemId)
        .eq("product_id", productId)
        .maybeSingle();

      if (duplicateError) {
        return jsonResponse(
          {
            ok: false,
            message: `Bestehende Paketposition konnte nicht geprüft werden: ${duplicateError.message}`,
          },
          500
        );
      }

      if (duplicateItem) {
        return jsonResponse(
          {
            ok: false,
            message:
              "Dieses Produkt wurde für diese Listenposition bereits in den Paketwunsch übernommen.",
          },
          409
        );
      }
    }

    const { data: insertedItem, error: insertError } = await supabase
      .from("school_offer_items")
      .insert({
        request_id: id,
        request_item_id: requestItemId,
        match_id: null,
        product_id: productId,
        product_name: productName,
        product_sku: productSku || null,
        product_price: productPrice,
        quantity,
        unit: unit || null,
        source: productId ? "admin_existing_product" : "admin_manual",
        status: "draft",
        notes:
          notes ||
          (productWasCreated
            ? "Manuell durch Admin hinzugefügt und als Produkt gespeichert"
            : productWasExisting
              ? "Manuell durch Admin aus Bestandsprodukt hinzugefügt"
              : "Manuell durch Admin hinzugefügt"),
      })
      .select("*")
      .single();

    if (insertError) {
      return jsonResponse(
        {
          ok: false,
          message: `Manuelle Position konnte nicht gespeichert werden: ${insertError.message}`,
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
      "admin_manual_offer_item_added",
      "Admin hat eine manuelle Paketposition hinzugefügt.",
      {
        requestItemId,
        productId,
        productName,
        productSku: productSku || null,
        productPrice,
        quantity,
        productWasCreated,
        productWasExisting,
        rememberForFuture,
        aliasText: preferredAliasText,
        aliasCount,
        aliases: productAliasList,
        requestWasConfirmed:
          schoolRequest.status === "confirmed" ||
          schoolRequest.offer_status === "confirmed",
      }
    );

    return jsonResponse({
      ok: true,
      item: insertedItem,
      productId,
      productWasCreated,
      productWasExisting,
      aliasCount,
      message: productWasCreated
        ? `Position wurde hinzugefügt und als neues Produkt gespeichert. ${aliasCount} Suchbegriffe wurden erzeugt.`
        : productWasExisting
          ? `Bestandsprodukt wurde übernommen und für zukünftige Anfragen gemerkt. ${aliasCount} Suchbegriffe wurden erzeugt.`
          : "Manuelle Position wurde dem Paketwunsch hinzugefügt.",
    });
  } catch (error) {
    console.error("Admin manual offer item error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die manuelle Position konnte nicht gespeichert werden.",
      },
      500
    );
  }
}