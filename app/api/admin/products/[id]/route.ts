import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import {
  generateProductSeoFields,
  slugifyProductText,
} from "../../../../lib/productSeo";
import { createUniqueProductSku } from "../../../../lib/productSku";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

type ProductRow = Record<string, unknown>;

const PRODUCT_IMAGE_BUCKET = "school-product-images";
const PRODUCT_IMAGE_ORIGINAL_PREFIX = "products-original";
const PRODUCT_IMAGE_OPTIMIZED_PREFIX = "products";

type UploadedProductImage = {
  imageUrl: string | null;
  originalImageUrl: string | null;
  optimizedStoragePath: string | null;
  originalStoragePath: string | null;
  originalSizeBytes: number;
  optimizedSizeBytes: number;
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

function cleanString(value: unknown) {
  if (value === null || value === undefined) return null;

  const trimmed = String(value).trim();

  return trimmed.length > 0 ? trimmed : null;
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

function splitAliases(value: unknown) {
  const text = String(value ?? "");

  return Array.from(
    new Set(
      text
        .split(/[\n;,]+/g)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    )
  );
}

function hasColumn(product: ProductRow, columnName: string) {
  return Object.prototype.hasOwnProperty.call(product, columnName);
}

function setIfColumnExists(
  updatePayload: Record<string, unknown>,
  product: ProductRow,
  columnName: string,
  value: unknown
) {
  if (hasColumn(product, columnName)) {
    updatePayload[columnName] = value;
  }
}

function getFileExtension(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();

  if (fromName && /^[a-z0-9]+$/.test(fromName)) {
    return fromName === "jpeg" ? "jpg" : fromName;
  }

  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/avif") return "avif";
  if (file.type === "image/heic") return "heic";
  if (file.type === "image/heif") return "heif";

  return "jpg";
}

function getContentTypeFromExtension(extension: string) {
  const ext = extension.toLowerCase();

  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "avif") return "image/avif";
  if (ext === "heic") return "image/heic";
  if (ext === "heif") return "image/heif";

  return "image/jpeg";
}

async function createOptimizedProductImageBuffer(fileBuffer: Buffer) {
  return sharp(fileBuffer, {
    failOn: "none",
  })
    .rotate()
    .resize({
      width: 1400,
      height: 1400,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: 82,
      effort: 4,
    })
    .toBuffer();
}

async function uploadBufferToStorage(input: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  storagePath: string;
  buffer: Buffer;
  contentType: string;
}) {
  const { error: uploadError } = await input.supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(input.storagePath, input.buffer, {
      contentType: input.contentType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(
      `Produktbild konnte nicht hochgeladen werden: ${uploadError.message}`
    );
  }

  const { data } = input.supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .getPublicUrl(input.storagePath);

  if (!data.publicUrl) {
    throw new Error("Produktbild wurde hochgeladen, aber keine URL erzeugt.");
  }

  return data.publicUrl;
}

async function uploadProductImage(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  productId: string;
  productName: string;
  file: File;
}): Promise<UploadedProductImage> {
  const { supabase, productId, productName, file } = params;

  if (!file.type.startsWith("image/")) {
    throw new Error("Bitte lade eine Bilddatei hoch.");
  }

  const maxSize = 15 * 1024 * 1024;

  if (file.size > maxSize) {
    throw new Error("Das Produktbild darf maximal 15 MB groß sein.");
  }

  const extension = getFileExtension(file);
  const productSlug = slugifyProductText(productName) || "produkt";
  const uniquePart = `${Date.now()}-${crypto.randomUUID()}`;

  const originalStoragePath = `${PRODUCT_IMAGE_ORIGINAL_PREFIX}/${productId}-${productSlug}-${uniquePart}.${extension}`;
  const optimizedStoragePath = `${PRODUCT_IMAGE_OPTIMIZED_PREFIX}/${productId}-${productSlug}-${uniquePart}.webp`;

  const arrayBuffer = await file.arrayBuffer();
  const originalBuffer = Buffer.from(arrayBuffer);
  const optimizedBuffer = await createOptimizedProductImageBuffer(originalBuffer);

  const originalImageUrl = await uploadBufferToStorage({
    supabase,
    storagePath: originalStoragePath,
    buffer: originalBuffer,
    contentType: file.type || getContentTypeFromExtension(extension),
  });

  const imageUrl = await uploadBufferToStorage({
    supabase,
    storagePath: optimizedStoragePath,
    buffer: optimizedBuffer,
    contentType: "image/webp",
  });

  return {
    imageUrl,
    originalImageUrl,
    optimizedStoragePath,
    originalStoragePath,
    originalSizeBytes: originalBuffer.length,
    optimizedSizeBytes: optimizedBuffer.length,
  };
}

async function replaceProductAliases(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  productId: string,
  aliases: string[]
) {
  const { error: deleteError } = await supabase
    .from("school_product_aliases")
    .delete()
    .eq("product_id", productId);

  if (deleteError) {
    throw new Error(
      `Alte Suchbegriffe konnten nicht gelöscht werden: ${deleteError.message}`
    );
  }

  if (aliases.length === 0) return;

  const aliasTextRows = aliases.map((aliasText) => ({
    product_id: productId,
    alias_text: aliasText,
  }));

  const { error: aliasTextInsertError } = await supabase
    .from("school_product_aliases")
    .insert(aliasTextRows);

  if (!aliasTextInsertError) return;

  const aliasRows = aliases.map((alias) => ({
    product_id: productId,
    alias,
  }));

  const { error: aliasInsertError } = await supabase
    .from("school_product_aliases")
    .insert(aliasRows);

  if (!aliasInsertError) return;

  const nameRows = aliases.map((name) => ({
    product_id: productId,
    name,
  }));

  const { error: nameInsertError } = await supabase
    .from("school_product_aliases")
    .insert(nameRows);

  if (nameInsertError) {
    throw new Error(
      `Suchbegriffe konnten nicht gespeichert werden: ${nameInsertError.message}`
    );
  }
}

async function readPatchPayload(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();

    const productImageEntry = formData.get("productImage");
    const productImage =
      productImageEntry instanceof File && productImageEntry.size > 0
        ? productImageEntry
        : null;

    return {
      productName: formData.get("productName"),
      productSku: formData.get("productSku"),
      ean: formData.get("ean"),
      productPrice: formData.get("productPrice"),
      category: formData.get("category"),
      productType: formData.get("productType"),
      format: formData.get("format"),
      color: formData.get("color"),
      lineature: formData.get("lineature"),
      bookWidthMm: formData.get("bookWidthMm"),
      bookHeightMm: formData.get("bookHeightMm"),
      bookSizeNote: formData.get("bookSizeNote"),
      imageUrl: formData.get("imageUrl"),
      active: formData.get("active"),
      aliases: formData.get("aliases"),
      productImage,
    };
  }

  const payload = await request.json();

  return {
    ...payload,
    productImage: null,
  };
}

function parseActive(value: unknown) {
  if (typeof value === "boolean") return value;

  const text = String(value ?? "true").toLowerCase().trim();

  return text !== "false" && text !== "0" && text !== "off";
}

async function createUniqueSeoSlug(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  productId: string;
  preferredSlug: string;
}) {
  const baseSlug =
    slugifyProductText(params.preferredSlug) ||
    `produkt-${params.productId.slice(0, 8)}`;

  let candidate = baseSlug;
  let counter = 2;

  while (counter < 200) {
    const { data, error } = await params.supabase
      .from("school_products")
      .select("id")
      .eq("seo_slug", candidate)
      .neq("id", params.productId)
      .limit(1);

    if (error) {
      return candidate;
    }

    if (!data || data.length === 0) {
      return candidate;
    }

    candidate = `${baseSlug}-${counter}`;
    counter += 1;
  }

  return `${baseSlug}-${params.productId.slice(0, 8)}`;
}

async function buildSeoPayload(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  productId: string;
  product: ProductRow;
  productName: string;
  productSku: string | null;
  category: string | null;
  productType: string | null;
  format: string | null;
  color: string | null;
  lineature: string | null;
  bookWidthMm: number | null;
  bookHeightMm: number | null;
  bookSizeNote: string | null;
}) {
  const seoFields = generateProductSeoFields({
    productName: params.productName,
    sku: params.productSku,
    category: params.category,
    productType: params.productType,
    format: params.format,
    color: params.color,
    lineature: params.lineature,
    bookWidthMm: params.bookWidthMm,
    bookHeightMm: params.bookHeightMm,
    bookSizeNote: params.bookSizeNote,
  });

  const uniqueSlug = await createUniqueSeoSlug({
    supabase: params.supabase,
    productId: params.productId,
    preferredSlug: seoFields.seo_slug,
  });

  const payload: Record<string, unknown> = {};

  setIfColumnExists(payload, params.product, "seo_slug", uniqueSlug);
  setIfColumnExists(payload, params.product, "seo_title", seoFields.seo_title);
  setIfColumnExists(
    payload,
    params.product,
    "seo_description",
    seoFields.seo_description
  );
  setIfColumnExists(
    payload,
    params.product,
    "seo_keywords",
    seoFields.seo_keywords
  );
  setIfColumnExists(
    payload,
    params.product,
    "image_alt_text",
    seoFields.image_alt_text
  );
  setIfColumnExists(
    payload,
    params.product,
    "image_title_text",
    seoFields.image_title_text
  );
  setIfColumnExists(
    payload,
    params.product,
    "seo_updated_at",
    new Date().toISOString()
  );

  return payload;
}

export async function PATCH(request: NextRequest, context: Params) {
  try {
    const { id } = await context.params;
    const supabase = getSupabaseAdmin();

    if (!id) {
      return jsonResponse(
        {
          ok: false,
          message: "Keine Produkt-ID übergeben.",
        },
        400
      );
    }

    const payload = await readPatchPayload(request);

    const productName = cleanString(payload.productName);
    const requestedProductSku = cleanString(payload.productSku);
    const ean = cleanString(payload.ean);
    const category = cleanString(payload.category);
    const productType = cleanString(payload.productType);
    const format = cleanString(payload.format);
    const color = cleanString(payload.color);
    const lineature = cleanString(payload.lineature);
    const bookWidthMm = toOptionalInteger(payload.bookWidthMm);
    const bookHeightMm = toOptionalInteger(payload.bookHeightMm);
    const bookSizeNote = cleanString(payload.bookSizeNote);
    let imageUrl = cleanString(payload.imageUrl);
    let originalImageUrl: string | null = null;
    const price = toNumber(payload.productPrice, 0);
    const active = parseActive(payload.active);
    const aliases = splitAliases(payload.aliases);

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

    const { data: existingProduct, error: existingProductError } =
      await supabase
        .from("school_products")
        .select("*")
        .eq("id", id)
        .maybeSingle();

    if (existingProductError) {
      return jsonResponse(
        {
          ok: false,
          message: `Produkt konnte nicht geladen werden: ${existingProductError.message}`,
        },
        500
      );
    }

    if (!existingProduct) {
      return jsonResponse(
        {
          ok: false,
          message: "Produkt wurde nicht gefunden.",
        },
        404
      );
    }

    const product = existingProduct as ProductRow;

    const productSku =
      requestedProductSku ||
      (await createUniqueProductSku({
        supabase,
        input: {
          productName,
          category,
          productType,
          format,
          color,
          lineature,
        },
        excludeProductId: id,
      }));

    const previousImageUrl = cleanString(product.image_url);

    let uploadedImage: UploadedProductImage | null = null;

    if (payload.productImage) {
      uploadedImage = await uploadProductImage({
        supabase,
        productId: id,
        productName,
        file: payload.productImage,
      });

      imageUrl = uploadedImage.imageUrl;
      originalImageUrl = uploadedImage.originalImageUrl;
    }

    const imageWasChanged =
      Boolean(payload.productImage) ||
      Boolean(imageUrl && previousImageUrl && imageUrl !== previousImageUrl);

    const updatePayload: Record<string, unknown> = {};

    setIfColumnExists(updatePayload, product, "name", productName);
    setIfColumnExists(updatePayload, product, "product_name", productName);
    setIfColumnExists(updatePayload, product, "title", productName);

    setIfColumnExists(updatePayload, product, "sku", productSku);
    setIfColumnExists(updatePayload, product, "product_sku", productSku);
    setIfColumnExists(updatePayload, product, "ean", ean);

    setIfColumnExists(updatePayload, product, "price", price);
    setIfColumnExists(updatePayload, product, "product_price", price);
    setIfColumnExists(updatePayload, product, "sale_price", price);
    setIfColumnExists(updatePayload, product, "sale_price_gross", price);

    setIfColumnExists(updatePayload, product, "category", category);
    setIfColumnExists(updatePayload, product, "product_type", productType);
    setIfColumnExists(updatePayload, product, "format", format);
    setIfColumnExists(updatePayload, product, "color", color);
    setIfColumnExists(updatePayload, product, "lineature", lineature);

    setIfColumnExists(updatePayload, product, "book_width_mm", bookWidthMm);
    setIfColumnExists(updatePayload, product, "book_height_mm", bookHeightMm);
    setIfColumnExists(updatePayload, product, "book_size_note", bookSizeNote);

    setIfColumnExists(updatePayload, product, "image_url", imageUrl);

    if (originalImageUrl) {
      setIfColumnExists(
        updatePayload,
        product,
        "image_original_url",
        originalImageUrl
      );
    }

    if (imageWasChanged) {
      setIfColumnExists(updatePayload, product, "image_styled_url", null);
      setIfColumnExists(updatePayload, product, "image_styled_at", null);
    }

    const seoPayload = await buildSeoPayload({
      supabase,
      productId: id,
      product,
      productName,
      productSku,
      category,
      productType,
      format,
      color,
      lineature,
      bookWidthMm,
      bookHeightMm,
      bookSizeNote,
    });

    Object.assign(updatePayload, seoPayload);

    setIfColumnExists(updatePayload, product, "active", active);
    setIfColumnExists(
      updatePayload,
      product,
      "updated_at",
      new Date().toISOString()
    );

    if (Object.keys(updatePayload).length === 0) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Es konnten keine passenden Produktspalten zum Aktualisieren gefunden werden.",
        },
        500
      );
    }

    const { error: updateError } = await supabase
      .from("school_products")
      .update(updatePayload)
      .eq("id", id);

    if (updateError) {
      return jsonResponse(
        {
          ok: false,
          message: `Produkt konnte nicht aktualisiert werden: ${updateError.message}`,
        },
        500
      );
    }

    await replaceProductAliases(supabase, id, aliases);

    return jsonResponse({
      ok: true,
      message: payload.productImage
        ? "Produkt wurde aktualisiert. Das neue Bild wurde als WebP optimiert, das Originalbild wurde gespeichert und die SEO-Daten wurden aktualisiert."
        : imageWasChanged
          ? "Produkt wurde aktualisiert. Bildverknüpfung und SEO-Daten wurden aktualisiert."
          : "Produkt wurde aktualisiert. Die SEO-Daten wurden aktualisiert.",
      productSku,
      ean,
      imageUrl,
      originalImageUrl,
      imageOptimization: uploadedImage
        ? {
            originalSizeBytes: uploadedImage.originalSizeBytes,
            optimizedSizeBytes: uploadedImage.optimizedSizeBytes,
          }
        : null,
    });
  } catch (error) {
    console.error("Admin product update error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Produkt konnte nicht aktualisiert werden.",
      },
      500
    );
  }
}