import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRODUCT_IMAGE_BUCKET = "school-product-images";

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
  image_url?: string | null;
  book_width_mm?: number | string | null;
  book_height_mm?: number | string | null;
  book_size_note?: string | null;
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

function toOptionalInteger(value: unknown): number | null {
  const raw = String(value ?? "").trim();

  if (!raw) return null;

  const cleaned = raw.replace(/[^\d]/g, "");

  if (!cleaned) return null;

  const parsed = Number(cleaned);

  if (!Number.isFinite(parsed)) return null;

  return Math.max(0, Math.floor(parsed));
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
    .slice(0, 20);
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

function getBookSizeAliases(input: {
  productName: string;
  bookWidthMm: number | null;
  bookHeightMm: number | null;
  bookSizeNote: string;
}) {
  const aliases: string[] = [];

  if (!input.bookWidthMm || !input.bookHeightMm) {
    return aliases;
  }

  const width = String(input.bookWidthMm);
  const height = String(input.bookHeightMm);
  const sizeLabel = `${width} x ${height} mm`;

  aliases.push(
    sizeLabel,
    `${width} x ${height}`,
    `${width} ${height}`,
    `Buchmaß ${sizeLabel}`,
    `Buchmass ${sizeLabel}`,
    `Buchumschlag ${sizeLabel}`,
    `Buchhülle ${sizeLabel}`,
    `Umschlag ${sizeLabel}`,
    `${input.productName} ${sizeLabel}`,
    `${input.productName} ${width} x ${height}`
  );

  if (input.bookSizeNote) {
    aliases.push(
      `${input.productName} ${input.bookSizeNote}`,
      `${sizeLabel} ${input.bookSizeNote}`
    );
  }

  return aliases;
}

function buildAliasList(input: {
  productName: string;
  productSku: string;
  category: string;
  productType: string;
  format: string;
  color: string;
  lineature: string;
  aliases: string;
  bookWidthMm: number | null;
  bookHeightMm: number | null;
  bookSizeNote: string;
}) {
  const manualAliases = input.aliases
    .split(/[\n,;]+/)
    .map((alias) => alias.trim())
    .filter(Boolean);

  const generatedAliases = [
    input.productName,
    `${input.productName} ${input.productSku}`,
    `${input.productType} ${input.format} ${input.color} ${input.lineature}`,
    `${input.category} ${input.format} ${input.color} ${input.lineature}`,
    ...getBookSizeAliases({
      productName: input.productName,
      bookWidthMm: input.bookWidthMm,
      bookHeightMm: input.bookHeightMm,
      bookSizeNote: input.bookSizeNote,
    }),
  ]
    .map((alias) => alias.trim().replace(/\s+/g, " "))
    .filter((alias) => alias.length >= 2);

  return Array.from(new Set([...manualAliases, ...generatedAliases]));
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

async function uploadProductImage(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  file: File | null
) {
  if (!file) return null;

  if (!file.type.startsWith("image/")) {
    throw new Error("Bitte lade nur Bilddateien hoch.");
  }

  const maxSize = 5 * 1024 * 1024;

  if (file.size > maxSize) {
    throw new Error("Das Produktbild darf maximal 5 MB groß sein.");
  }

  const extension =
    file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
    "jpg";

  const storagePath = `products/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(
      `Produktbild konnte nicht hochgeladen werden: ${uploadError.message}`
    );
  }

  const { data } = supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .getPublicUrl(storagePath);

  return data.publicUrl || null;
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
    aliases: string;
    imageUrl: string | null;
    bookWidthMm: number | null;
    bookHeightMm: number | null;
    bookSizeNote: string;
  }
) {
  const matchKeywords = Array.from(
    new Set([
      ...splitKeywords(input.productName),
      ...splitKeywords(input.productSku),
      ...splitKeywords(input.category),
      ...splitKeywords(input.productType),
      ...splitKeywords(input.format),
      ...splitKeywords(input.color),
      ...splitKeywords(input.lineature),
      ...splitKeywords(input.aliases),
      ...splitKeywords(input.bookWidthMm),
      ...splitKeywords(input.bookHeightMm),
      ...splitKeywords(input.bookSizeNote),
      input.bookWidthMm && input.bookHeightMm
        ? `${input.bookWidthMm}x${input.bookHeightMm}`
        : "",
    ])
  ).filter(Boolean);

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
      image_url: input.imageUrl,
      book_width_mm: input.bookWidthMm,
      book_height_mm: input.bookHeightMm,
      book_size_note: input.bookSizeNote || null,
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
      image_url: input.imageUrl,
      book_width_mm: input.bookWidthMm,
      book_height_mm: input.bookHeightMm,
      book_size_note: input.bookSizeNote || null,
      match_keywords: matchKeywords,
      active: true,
    },
    {
      title: input.productName,
      sku: input.productSku || null,
      price: input.productPrice,
      category: input.category || null,
      image_url: input.imageUrl,
      book_width_mm: input.bookWidthMm,
      book_height_mm: input.bookHeightMm,
      book_size_note: input.bookSizeNote || null,
    },
    {
      name: input.productName,
      sku: input.productSku || null,
      price: input.productPrice,
      category: input.category || null,
      active: true,
    },
    {
      product_name: input.productName,
      product_sku: input.productSku || null,
      product_price: input.productPrice,
      category: input.category || null,
      active: true,
    },
  ];

  let lastErrorMessage = "Unbekannter Fehler";

  for (const payload of payloadVariants) {
    const { data, error } = await supabase
      .from("school_products")
      .insert(payload)
      .select("*")
      .single();

    if (!error && data) {
      return data as ProductRow;
    }

    if (error?.message) {
      lastErrorMessage = error.message;
    }
  }

  throw new Error(
    `Produkt konnte nicht angelegt werden. Prüfe die Spalten in school_products. Letzter Fehler: ${lastErrorMessage}`
  );
}

async function updateExistingProductFlexible(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  productId: string,
  input: {
    imageUrl: string | null;
    bookWidthMm: number | null;
    bookHeightMm: number | null;
    bookSizeNote: string;
  }
) {
  const now = new Date().toISOString();

  const fullPayload: Record<string, unknown> = {
    book_width_mm: input.bookWidthMm,
    book_height_mm: input.bookHeightMm,
    book_size_note: input.bookSizeNote || null,
    updated_at: now,
  };

  if (input.imageUrl) {
    fullPayload.image_url = input.imageUrl;
  }

  const { error: fullUpdateError } = await supabase
    .from("school_products")
    .update(fullPayload)
    .eq("id", productId);

  if (!fullUpdateError) return;

  if (input.imageUrl) {
    await supabase
      .from("school_products")
      .update({
        image_url: input.imageUrl,
        updated_at: now,
      })
      .eq("id", productId);
  }
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

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const formData = await request.formData();

    const productName = String(formData.get("productName") || "").trim();
    const productSku = String(formData.get("productSku") || "").trim();
    const productPrice = toNumber(formData.get("productPrice"), 0);
    const category = String(formData.get("category") || "").trim();
    const productType = String(formData.get("productType") || "").trim();
    const format = String(formData.get("format") || "").trim();
    const color = String(formData.get("color") || "").trim();
    const lineature = String(formData.get("lineature") || "").trim();
    const aliases = String(formData.get("aliases") || "").trim();

    const bookWidthMm = toOptionalInteger(formData.get("bookWidthMm"));
    const bookHeightMm = toOptionalInteger(formData.get("bookHeightMm"));
    const bookSizeNote = String(formData.get("bookSizeNote") || "").trim();

    const imageFileValue = formData.get("productImage");
    const imageFile =
      imageFileValue instanceof File && imageFileValue.size > 0
        ? imageFileValue
        : null;

    if (!productName) {
      return jsonResponse(
        {
          ok: false,
          message: "Bitte gib einen Produktnamen ein.",
        },
        400
      );
    }

    if (
      (bookWidthMm !== null && bookHeightMm === null) ||
      (bookWidthMm === null && bookHeightMm !== null)
    ) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Bitte gib beim Buchmaß entweder Breite und Höhe an oder lasse beide Felder leer.",
        },
        400
      );
    }

    const imageUrl = await uploadProductImage(supabase, imageFile);

    const existingProduct = await findExistingProductBySkuOrName(
      supabase,
      productName,
      productSku
    );

    if (existingProduct) {
      await updateExistingProductFlexible(supabase, existingProduct.id, {
        imageUrl,
        bookWidthMm,
        bookHeightMm,
        bookSizeNote,
      });

      const aliasList = buildAliasList({
        productName,
        productSku,
        category,
        productType,
        format,
        color,
        lineature,
        aliases,
        bookWidthMm,
        bookHeightMm,
        bookSizeNote,
      });

      let aliasCount = 0;

      for (const alias of aliasList) {
        const created = await createAliasFlexible(
          supabase,
          existingProduct.id,
          alias
        );

        if (created) aliasCount += 1;
      }

      return jsonResponse({
        ok: true,
        existing: true,
        product: {
          id: existingProduct.id,
          productName: getProductName(existingProduct),
          productSku: getProductSku(existingProduct),
          productPrice: getProductPrice(existingProduct),
          imageUrl: imageUrl || existingProduct.image_url || null,
        },
        aliasCount,
        message:
          imageUrl || bookWidthMm || bookHeightMm || bookSizeNote
            ? "Dieses Produkt existiert bereits. Bild, Buchmaße und Suchbegriffe wurden aktualisiert."
            : "Dieses Produkt existiert bereits. Zusätzliche Suchbegriffe wurden gespeichert.",
      });
    }

    const product = await createProductFlexible(supabase, {
      productName,
      productSku,
      productPrice,
      category,
      productType,
      format,
      color,
      lineature,
      aliases,
      imageUrl,
      bookWidthMm,
      bookHeightMm,
      bookSizeNote,
    });

    const aliasList = buildAliasList({
      productName,
      productSku,
      category,
      productType,
      format,
      color,
      lineature,
      aliases,
      bookWidthMm,
      bookHeightMm,
      bookSizeNote,
    });

    let aliasCount = 0;

    for (const alias of aliasList) {
      const created = await createAliasFlexible(supabase, product.id, alias);
      if (created) aliasCount += 1;
    }

    return jsonResponse({
      ok: true,
      existing: false,
      product: {
        id: product.id,
        productName: getProductName(product),
        productSku: getProductSku(product),
        productPrice: getProductPrice(product),
        imageUrl: product.image_url || imageUrl || null,
      },
      aliasCount,
      message: imageUrl
        ? "Produkt wurde mit Bild und optionalen Buchmaßen angelegt und ist ab sofort verfügbar."
        : "Produkt wurde mit optionalen Buchmaßen angelegt und ist ab sofort verfügbar.",
    });
  } catch (error) {
    console.error("Quick product create error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Produkt konnte nicht angelegt werden.",
      },
      500
    );
  }
}