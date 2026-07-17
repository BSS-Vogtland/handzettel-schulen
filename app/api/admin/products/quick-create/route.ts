import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { normalizeProductCategory } from "@/lib/productCategories";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import {
  generateProductSeoFields,
  slugifyProductText,
} from "../../../../lib/productSeo";
import { tryStyleProductImageById } from "../../../../lib/productImageStyling";
import { createUniqueProductSku } from "../../../../lib/productSku";
import { buildProductKeywordData } from "../../../../lib/productKeywords";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRODUCT_IMAGE_BUCKET = "school-product-images";
const PRODUCT_IMAGE_ORIGINAL_PREFIX = "products-original";
const PRODUCT_IMAGE_OPTIMIZED_PREFIX = "products";

type ProductRow = {
  id: string;
  name?: string | null;
  title?: string | null;
  sku?: string | null;
  ean?: string | null;
  price?: number | string | null;
  sale_price?: number | string | null;
  sale_price_gross?: number | string | null;
  category?: string | null;
  product_type?: string | null;
  format?: string | null;
  color?: string | null;
  lineature?: string | null;
  image_url?: string | null;
  image_original_url?: string | null;
  image_styled_url?: string | null;
  image_styled_at?: string | null;
  image_source?: string | null;
  image_source_url?: string | null;
  image_license?: string | null;
  image_license_url?: string | null;
  image_attribution?: string | null;
  image_usage_status?: string | null;
  image_checked_at?: string | null;
  book_width_mm?: number | string | null;
  book_height_mm?: number | string | null;
  book_size_note?: string | null;
  seo_slug?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  seo_keywords?: string[] | null;
  image_alt_text?: string | null;
  image_title_text?: string | null;
  seo_updated_at?: string | null;
  active?: boolean | null;
  updated_at?: string | null;
};

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
      "Supabase Umgebungsvariablen fehlen. Prüfe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY.",
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

function hasColumn(product: ProductRow, columnName: string) {
  return Object.prototype.hasOwnProperty.call(product, columnName);
}

function setIfColumnExists(
  updatePayload: Record<string, unknown>,
  product: ProductRow,
  columnName: string,
  value: unknown,
) {
  if (hasColumn(product, columnName)) {
    updatePayload[columnName] = value;
  }
}

type ImageSourceMetadata = {
  source: string | null;
  sourceUrl: string | null;
  license: string | null;
  licenseUrl: string | null;
  attribution: string | null;
  usageStatus: string | null;
};

async function updateImageSourceMetadataFlexible(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  product: ProductRow,
  metadata: ImageSourceMetadata,
) {
  const hasMetadata = Boolean(
    metadata.source ||
    metadata.sourceUrl ||
    metadata.license ||
    metadata.licenseUrl ||
    metadata.attribution ||
    metadata.usageStatus,
  );

  if (!hasMetadata) {
    return;
  }

  const updatePayload: Record<string, unknown> = {};

  setIfColumnExists(updatePayload, product, "image_source", metadata.source);
  setIfColumnExists(
    updatePayload,
    product,
    "image_source_url",
    metadata.sourceUrl,
  );
  setIfColumnExists(updatePayload, product, "image_license", metadata.license);
  setIfColumnExists(
    updatePayload,
    product,
    "image_license_url",
    metadata.licenseUrl,
  );
  setIfColumnExists(
    updatePayload,
    product,
    "image_attribution",
    metadata.attribution,
  );
  setIfColumnExists(
    updatePayload,
    product,
    "image_usage_status",
    metadata.usageStatus,
  );
  setIfColumnExists(
    updatePayload,
    product,
    "image_checked_at",
    new Date().toISOString(),
  );

  if (Object.keys(updatePayload).length === 0) {
    return;
  }

  const { error } = await supabase
    .from("school_products")
    .update(updatePayload)
    .eq("id", product.id);

  if (error) {
    throw new Error(
      `Bildquellen-Metadaten konnten nicht gespeichert werden: ${error.message}`,
    );
  }
}

function getProductName(product: ProductRow) {
  return product.name || product.title || "Unbenanntes Produkt";
}

function getProductSku(product: ProductRow) {
  return product.sku || null;
}

function getProductPrice(product: ProductRow) {
  return toNumber(
    product.price ?? product.sale_price_gross ?? product.sale_price,
    0,
  );
}

function sameOptionalText(left: unknown, right: unknown) {
  return normalizeText(left) === normalizeText(right);
}

function sameOptionalInteger(left: unknown, right: unknown) {
  return toOptionalInteger(left) === toOptionalInteger(right);
}

function isSameProductVariant(
  product: ProductRow,
  input: {
    productName: string;
    category: string;
    productType: string;
    format: string;
    color: string;
    lineature: string;
    bookWidthMm: number | null;
    bookHeightMm: number | null;
  },
) {
  if (!sameOptionalText(getProductName(product), input.productName)) {
    return false;
  }

  const hasBookMeasure =
    input.bookWidthMm !== null ||
    input.bookHeightMm !== null ||
    product.book_width_mm !== null ||
    product.book_height_mm !== null;

  if (hasBookMeasure) {
    return (
      sameOptionalInteger(product.book_width_mm, input.bookWidthMm) &&
      sameOptionalInteger(product.book_height_mm, input.bookHeightMm)
    );
  }

  return (
    sameOptionalText(product.category, input.category) &&
    sameOptionalText(product.product_type, input.productType) &&
    sameOptionalText(product.format, input.format) &&
    sameOptionalText(product.color, input.color) &&
    sameOptionalText(product.lineature, input.lineature)
  );
}

async function findExistingProductByUniqueIdentifiersOrVariant(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  input: {
    productName: string;
    productSku: string;
    ean: string | null;
    category: string;
    productType: string;
    format: string;
    color: string;
    lineature: string;
    bookWidthMm: number | null;
    bookHeightMm: number | null;
  },
) {
  if (input.productSku) {
    const { data, error } = await supabase
      .from("school_products")
      .select("*")
      .eq("sku", input.productSku)
      .maybeSingle();

    if (!error && data) return data as ProductRow;
  }

  if (input.ean) {
    const { data, error } = await supabase
      .from("school_products")
      .select("*")
      .eq("ean", input.ean)
      .maybeSingle();

    if (!error && data) return data as ProductRow;
  }

  const { data, error } = await supabase
    .from("school_products")
    .select("*")
    .eq("name", input.productName)
    .limit(50);

  if (error || !data || data.length === 0) {
    return null;
  }

  const sameVariant = (data as ProductRow[]).find((product) =>
    isSameProductVariant(product, input),
  );

  return sameVariant || null;
}

function getCleanExtension(fileName: string, fileType?: string) {
  const fromName =
    fileName
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "";

  if (fromName) {
    return fromName === "jpeg" ? "jpg" : fromName;
  }

  if (fileType === "image/png") return "png";
  if (fileType === "image/webp") return "webp";
  if (fileType === "image/avif") return "avif";
  if (fileType === "image/heic") return "heic";
  if (fileType === "image/heif") return "heif";

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
      upsert: false,
    });

  if (uploadError) {
    throw new Error(
      `Produktbild konnte nicht hochgeladen werden: ${uploadError.message}`,
    );
  }

  const { data } = input.supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .getPublicUrl(input.storagePath);

  return data.publicUrl || null;
}

function buildSeoInput(input: {
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
  return {
    productName: input.productName,
    sku: input.productSku,
    category: input.category,
    productType: input.productType,
    format: input.format,
    color: input.color,
    lineature: input.lineature,
    bookWidthMm: input.bookWidthMm,
    bookHeightMm: input.bookHeightMm,
    bookSizeNote: input.bookSizeNote,
  };
}

async function createUniqueSeoSlug(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  productId?: string | null;
  preferredSlug: string;
}) {
  const baseSlug =
    slugifyProductText(params.preferredSlug) ||
    `produkt-${crypto.randomUUID().slice(0, 8)}`;

  let candidate = baseSlug;
  let counter = 2;

  while (counter < 300) {
    let query = params.supabase
      .from("school_products")
      .select("id")
      .eq("seo_slug", candidate)
      .limit(1);

    if (params.productId) {
      query = query.neq("id", params.productId);
    }

    const { data, error } = await query;

    if (error) {
      return candidate;
    }

    if (!data || data.length === 0) {
      return candidate;
    }

    candidate = `${baseSlug}-${counter}`;
    counter += 1;
  }

  return `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;
}

async function buildSeoPayload(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  productId?: string | null;
  product?: ProductRow | null;
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
  const seoFields = generateProductSeoFields(
    buildSeoInput({
      productName: params.productName,
      productSku: params.productSku,
      category: params.category,
      productType: params.productType,
      format: params.format,
      color: params.color,
      lineature: params.lineature,
      bookWidthMm: params.bookWidthMm,
      bookHeightMm: params.bookHeightMm,
      bookSizeNote: params.bookSizeNote,
    }),
  );

  const seoSlug = await createUniqueSeoSlug({
    supabase: params.supabase,
    productId: params.productId,
    preferredSlug: seoFields.seo_slug,
  });

  const fullPayload = {
    seo_slug: seoSlug,
    seo_title: seoFields.seo_title,
    seo_description: seoFields.seo_description,
    seo_keywords: seoFields.seo_keywords,
    image_alt_text: seoFields.image_alt_text,
    image_title_text: seoFields.image_title_text,
    seo_updated_at: new Date().toISOString(),
  };

  if (!params.product) {
    return fullPayload;
  }

  const filteredPayload: Record<string, unknown> = {};

  setIfColumnExists(
    filteredPayload,
    params.product,
    "seo_slug",
    fullPayload.seo_slug,
  );
  setIfColumnExists(
    filteredPayload,
    params.product,
    "seo_title",
    fullPayload.seo_title,
  );
  setIfColumnExists(
    filteredPayload,
    params.product,
    "seo_description",
    fullPayload.seo_description,
  );
  setIfColumnExists(
    filteredPayload,
    params.product,
    "seo_keywords",
    fullPayload.seo_keywords,
  );
  setIfColumnExists(
    filteredPayload,
    params.product,
    "image_alt_text",
    fullPayload.image_alt_text,
  );
  setIfColumnExists(
    filteredPayload,
    params.product,
    "image_title_text",
    fullPayload.image_title_text,
  );
  setIfColumnExists(
    filteredPayload,
    params.product,
    "seo_updated_at",
    fullPayload.seo_updated_at,
  );

  return filteredPayload;
}

async function uploadProductImage(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  file: File | null,
  productName: string,
): Promise<UploadedProductImage> {
  if (!file) {
    return {
      imageUrl: null,
      originalImageUrl: null,
      optimizedStoragePath: null,
      originalStoragePath: null,
      originalSizeBytes: 0,
      optimizedSizeBytes: 0,
    };
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Bitte lade nur Bilddateien hoch.");
  }

  const maxSize = 15 * 1024 * 1024;

  if (file.size > maxSize) {
    throw new Error("Das Produktbild darf maximal 15 MB groß sein.");
  }

  const extension = getCleanExtension(file.name, file.type);
  const productSlug = slugifyProductText(productName) || "produkt";
  const baseName = `${Date.now()}-${crypto.randomUUID()}-${productSlug}`;

  const originalStoragePath = `${PRODUCT_IMAGE_ORIGINAL_PREFIX}/${baseName}.${extension}`;
  const optimizedStoragePath = `${PRODUCT_IMAGE_OPTIMIZED_PREFIX}/${baseName}.webp`;

  const arrayBuffer = await file.arrayBuffer();
  const originalBuffer = Buffer.from(arrayBuffer);
  const optimizedBuffer =
    await createOptimizedProductImageBuffer(originalBuffer);

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

async function createProductFlexible(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  input: {
    productName: string;
    productSku: string;
    ean: string | null;
    productPrice: number;
    category: string;
    productType: string;
    format: string;
    color: string;
    lineature: string;
    matchKeywords: string[];
    imageUrl: string | null;
    originalImageUrl: string | null;
    bookWidthMm: number | null;
    bookHeightMm: number | null;
    bookSizeNote: string;
  },
) {
  const seoPayload = await buildSeoPayload({
    supabase,
    productId: null,
    product: null,
    productName: input.productName,
    productSku: input.productSku || null,
    category: input.category || null,
    productType: input.productType || null,
    format: input.format || null,
    color: input.color || null,
    lineature: input.lineature || null,
    bookWidthMm: input.bookWidthMm,
    bookHeightMm: input.bookHeightMm,
    bookSizeNote: input.bookSizeNote || null,
  });

  const payloadVariants: Array<Record<string, unknown>> = [
    {
      name: input.productName,
      sku: input.productSku || null,
      ean: input.ean || null,
      price: input.productPrice,
      category: input.category || null,
      product_type: input.productType || null,
      format: input.format || null,
      color: input.color || null,
      lineature: input.lineature || null,
      image_url: input.imageUrl,
      image_original_url: input.originalImageUrl,
      book_width_mm: input.bookWidthMm,
      book_height_mm: input.bookHeightMm,
      book_size_note: input.bookSizeNote || null,
      match_keywords: input.matchKeywords,
      active: true,
      ...seoPayload,
    },
    {
      title: input.productName,
      sku: input.productSku || null,
      ean: input.ean || null,
      price: input.productPrice,
      category: input.category || null,
      image_url: input.imageUrl,
      image_original_url: input.originalImageUrl,
      book_width_mm: input.bookWidthMm,
      book_height_mm: input.bookHeightMm,
      book_size_note: input.bookSizeNote || null,
      ...seoPayload,
    },
    {
      name: input.productName,
      sku: input.productSku || null,
      ean: input.ean || null,
      price: input.productPrice,
      category: input.category || null,
      product_type: input.productType || null,
      format: input.format || null,
      color: input.color || null,
      lineature: input.lineature || null,
      image_url: input.imageUrl,
      image_original_url: input.originalImageUrl,
      book_width_mm: input.bookWidthMm,
      book_height_mm: input.bookHeightMm,
      book_size_note: input.bookSizeNote || null,
      match_keywords: input.matchKeywords,
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
    `Produkt konnte nicht angelegt werden. Prüfe die Spalten in school_products. Letzter Fehler: ${lastErrorMessage}`,
  );
}

async function updateExistingProductFlexible(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  product: ProductRow,
  input: {
    productName: string;
    productSku: string;
    ean: string | null;
    productPrice: number;
    category: string;
    productType: string;
    format: string;
    color: string;
    lineature: string;
    matchKeywords: string[];
    imageUrl: string | null;
    originalImageUrl: string | null;
    bookWidthMm: number | null;
    bookHeightMm: number | null;
    bookSizeNote: string;
  },
) {
  const now = new Date().toISOString();

  const seoPayload = await buildSeoPayload({
    supabase,
    productId: product.id,
    product,
    productName: input.productName,
    productSku: input.productSku || null,
    category: input.category || null,
    productType: input.productType || null,
    format: input.format || null,
    color: input.color || null,
    lineature: input.lineature || null,
    bookWidthMm: input.bookWidthMm,
    bookHeightMm: input.bookHeightMm,
    bookSizeNote: input.bookSizeNote || null,
  });

  const updatePayload: Record<string, unknown> = {};

  setIfColumnExists(updatePayload, product, "name", input.productName);
  setIfColumnExists(updatePayload, product, "title", input.productName);

  setIfColumnExists(updatePayload, product, "sku", input.productSku || null);
  setIfColumnExists(updatePayload, product, "ean", input.ean || null);

  setIfColumnExists(updatePayload, product, "price", input.productPrice);
  setIfColumnExists(updatePayload, product, "sale_price", input.productPrice);
  setIfColumnExists(
    updatePayload,
    product,
    "sale_price_gross",
    input.productPrice,
  );

  setIfColumnExists(updatePayload, product, "category", input.category || null);
  setIfColumnExists(
    updatePayload,
    product,
    "product_type",
    input.productType || null,
  );
  setIfColumnExists(updatePayload, product, "format", input.format || null);
  setIfColumnExists(updatePayload, product, "color", input.color || null);
  setIfColumnExists(
    updatePayload,
    product,
    "lineature",
    input.lineature || null,
  );

  setIfColumnExists(updatePayload, product, "book_width_mm", input.bookWidthMm);
  setIfColumnExists(
    updatePayload,
    product,
    "book_height_mm",
    input.bookHeightMm,
  );
  setIfColumnExists(
    updatePayload,
    product,
    "book_size_note",
    input.bookSizeNote || null,
  );

  setIfColumnExists(
    updatePayload,
    product,
    "match_keywords",
    input.matchKeywords,
  );

  if (input.imageUrl) {
    setIfColumnExists(updatePayload, product, "image_url", input.imageUrl);
  }

  if (input.originalImageUrl) {
    setIfColumnExists(
      updatePayload,
      product,
      "image_original_url",
      input.originalImageUrl,
    );
  }

  if (input.imageUrl || input.originalImageUrl) {
    setIfColumnExists(updatePayload, product, "image_styled_url", null);
    setIfColumnExists(updatePayload, product, "image_styled_at", null);
  }

  Object.assign(updatePayload, seoPayload);

  setIfColumnExists(updatePayload, product, "updated_at", now);

  if (Object.keys(updatePayload).length === 0) return;

  const { error } = await supabase
    .from("school_products")
    .update(updatePayload)
    .eq("id", product.id);

  if (error) {
    throw new Error(
      `Produkt konnte nicht aktualisiert werden: ${error.message}`,
    );
  }
}

async function createAliasFlexible(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  productId: string,
  aliasText: string,
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

async function addAliasesFlexible(input: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  productId: string;
  aliases: string[];
}) {
  let aliasCount = 0;

  for (const alias of input.aliases) {
    const created = await createAliasFlexible(
      input.supabase,
      input.productId,
      alias,
    );

    if (created) aliasCount += 1;
  }

  return aliasCount;
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const supabase = getSupabaseAdmin();
    const formData = await request.formData();

    const productName = String(formData.get("productName") || "").trim();
    const requestedProductSku = String(formData.get("productSku") || "").trim();
    const ean = cleanString(formData.get("ean"));
    const productPrice = toNumber(formData.get("productPrice"), 0);
    const rawCategory = String(formData.get("category") || "").trim();
    const category = normalizeProductCategory(rawCategory);

    if (!category) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte wähle eine feste Produktkategorie aus.",
        },
        { status: 400 },
      );
    }
    const productType = String(formData.get("productType") || "").trim();
    const format = String(formData.get("format") || "").trim();
    const color = String(formData.get("color") || "").trim();
    const lineature = String(formData.get("lineature") || "").trim();
    const aliases = String(formData.get("aliases") || "").trim();
    const rejectExisting =
      String(formData.get("rejectExisting") || "").trim() === "true";
    const skipImageStyling =
      String(formData.get("skipImageStyling") || "").trim() === "true";

    const imageSourceMetadata: ImageSourceMetadata = {
      source: cleanString(formData.get("imageSource")),
      sourceUrl: cleanString(formData.get("imageSourceUrl")),
      license: cleanString(formData.get("imageLicense")),
      licenseUrl: cleanString(formData.get("imageLicenseUrl")),
      attribution: cleanString(formData.get("imageAttribution")),
      usageStatus: cleanString(formData.get("imageUsageStatus")),
    };

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
        400,
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
        400,
      );
    }

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
      }));

    const keywordData = buildProductKeywordData({
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

    const uploadedImage = await uploadProductImage(
      supabase,
      imageFile,
      productName,
    );

    const existingProduct =
      await findExistingProductByUniqueIdentifiersOrVariant(supabase, {
        productName,
        productSku,
        ean,
        category,
        productType,
        format,
        color,
        lineature,
        bookWidthMm,
        bookHeightMm,
      });

    if (existingProduct && rejectExisting) {
      return jsonResponse(
        {
          ok: false,
          existing: true,
          product: {
            id: existingProduct.id,
            productName: getProductName(existingProduct),
            productSku: getProductSku(existingProduct),
            ean: existingProduct.ean || ean || null,
            productPrice: getProductPrice(existingProduct),
            imageUrl:
              existingProduct.image_url ||
              existingProduct.image_original_url ||
              null,
          },
          message:
            "Der Import wurde blockiert, weil bereits ein Produkt mit dieser ISBN/EAN oder derselben Produktvariante vorhanden ist.",
        },
        409,
      );
    }

    if (existingProduct) {
      await updateExistingProductFlexible(supabase, existingProduct, {
        productName,
        productSku,
        ean,
        productPrice,
        category,
        productType,
        format,
        color,
        lineature,
        matchKeywords: keywordData.matchKeywords,
        imageUrl: uploadedImage.imageUrl,
        originalImageUrl: uploadedImage.originalImageUrl,
        bookWidthMm,
        bookHeightMm,
        bookSizeNote,
      });

      const aliasCount = await addAliasesFlexible({
        supabase,
        productId: existingProduct.id,
        aliases: keywordData.aliases,
      });

      if (uploadedImage.imageUrl || uploadedImage.originalImageUrl) {
        await updateImageSourceMetadataFlexible(
          supabase,
          existingProduct,
          imageSourceMetadata,
        );
      }

      const shouldStyleImage =
        !skipImageStyling &&
        Boolean(uploadedImage.imageUrl && uploadedImage.originalImageUrl);

      const autoStyle = shouldStyleImage
        ? await tryStyleProductImageById(existingProduct.id)
        : {
            attempted: false,
            ok: false,
            result: null,
            message: skipImageStyling
              ? "Bildstyling wurde für dieses Originalbild bewusst deaktiviert."
              : "Kein neues Bild übergeben.",
          };

      return jsonResponse({
        ok: true,
        existing: true,
        product: {
          id: existingProduct.id,
          productName: getProductName(existingProduct),
          productSku,
          ean,
          productPrice,
          imageUrl:
            uploadedImage.imageUrl ||
            existingProduct.image_url ||
            existingProduct.image_original_url ||
            null,
        },
        aliases: keywordData.aliases,
        matchKeywords: keywordData.matchKeywords,
        aliasCount,
        matchKeywordCount: keywordData.matchKeywords.length,
        autoStyle,
        imageOptimization:
          uploadedImage.imageUrl && uploadedImage.originalImageUrl
            ? {
                originalSizeBytes: uploadedImage.originalSizeBytes,
                optimizedSizeBytes: uploadedImage.optimizedSizeBytes,
              }
            : null,
        message:
          uploadedImage.imageUrl || bookWidthMm || bookHeightMm || bookSizeNote
            ? skipImageStyling && uploadedImage.imageUrl
              ? `Dieses Produkt existiert bereits. Das Originalbild wurde ohne KI-Veränderung übernommen; Buchmaße, SEO-Daten und ${keywordData.aliases.length} Suchbegriffe wurden aktualisiert.`
              : autoStyle.ok
                ? `Dieses Produkt existiert bereits. Bild, Buchmaße, SEO-Daten, ${keywordData.aliases.length} Suchbegriffe und KI-Hintergrund wurden aktualisiert.`
                : `Dieses Produkt existiert bereits. Bild, Buchmaße, SEO-Daten und ${keywordData.aliases.length} Suchbegriffe wurden aktualisiert. Der KI-Hintergrund konnte nicht automatisch erzeugt werden.`
            : `Dieses Produkt existiert bereits. ${keywordData.aliases.length} Suchbegriffe und SEO-Daten wurden aktualisiert.`,
      });
    }

    const product = await createProductFlexible(supabase, {
      productName,
      productSku,
      ean,
      productPrice,
      category,
      productType,
      format,
      color,
      lineature,
      matchKeywords: keywordData.matchKeywords,
      imageUrl: uploadedImage.imageUrl,
      originalImageUrl: uploadedImage.originalImageUrl,
      bookWidthMm,
      bookHeightMm,
      bookSizeNote,
    });

    const aliasCount = await addAliasesFlexible({
      supabase,
      productId: product.id,
      aliases: keywordData.aliases,
    });

    if (uploadedImage.imageUrl || uploadedImage.originalImageUrl) {
      await updateImageSourceMetadataFlexible(
        supabase,
        product,
        imageSourceMetadata,
      );
    }

    const shouldStyleImage =
      !skipImageStyling &&
      Boolean(uploadedImage.imageUrl && uploadedImage.originalImageUrl);

    const autoStyle = shouldStyleImage
      ? await tryStyleProductImageById(product.id)
      : {
          attempted: false,
          ok: false,
          result: null,
          message: skipImageStyling
            ? "Bildstyling wurde für dieses Originalbild bewusst deaktiviert."
            : "Kein neues Bild übergeben.",
        };

    return jsonResponse({
      ok: true,
      existing: false,
      product: {
        id: product.id,
        productName: getProductName(product),
        productSku: getProductSku(product),
        ean: product.ean || ean || null,
        productPrice: getProductPrice(product),
        imageUrl: product.image_url || uploadedImage.imageUrl || null,
        seoSlug: product.seo_slug || null,
        seoTitle: product.seo_title || null,
      },
      aliases: keywordData.aliases,
      matchKeywords: keywordData.matchKeywords,
      aliasCount,
      matchKeywordCount: keywordData.matchKeywords.length,
      autoStyle,
      imageOptimization:
        uploadedImage.imageUrl && uploadedImage.originalImageUrl
          ? {
              originalSizeBytes: uploadedImage.originalSizeBytes,
              optimizedSizeBytes: uploadedImage.optimizedSizeBytes,
            }
          : null,
      message: uploadedImage.imageUrl
        ? skipImageStyling
          ? `Produkt wurde mit unverändertem Originalbild, optimierter Shopdatei, gespeicherter Bildquelle, SEO-Daten und ${keywordData.aliases.length} Suchbegriffen angelegt. Ein KI-Hintergrund wurde bewusst nicht erzeugt.`
          : autoStyle.ok
            ? `Produkt wurde mit optimiertem Shopbild, Originalbild, SEO-Daten, ${keywordData.aliases.length} Suchbegriffen und KI-Hintergrund angelegt.`
            : `Produkt wurde mit optimiertem Shopbild, Originalbild, SEO-Daten und ${keywordData.aliases.length} Suchbegriffen angelegt. Der KI-Hintergrund konnte nicht automatisch erzeugt werden und kann später im Produkt manuell erstellt werden.`
        : `Produkt wurde mit optionalen Buchmaßen, SEO-Daten und ${keywordData.aliases.length} Suchbegriffen angelegt und ist ab sofort verfügbar.`,
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
      500,
    );
  }
}
