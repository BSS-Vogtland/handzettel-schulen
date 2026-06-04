import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

type ProductRow = Record<string, unknown>;

const PRODUCT_IMAGE_BUCKET = "school-product-images";
const STYLED_PREFIX = "products-styled-openai";

const OPENAI_IMAGE_EDIT_URL = "https://api.openai.com/v1/images/edits";
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5";

const OUTPUT_SIZE = 1254;
const PRODUCT_MAX_WIDTH = 860;
const PRODUCT_MAX_HEIGHT = 760;
const PRODUCT_BOTTOM_Y = 1040;
const WEBP_QUALITY = 82;

const BACKGROUND_PATH = path.join(
  process.cwd(),
  "scripts",
  "assets",
  "handzettel-product-bg.png"
);

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

function getOpenAiApiKey() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || apiKey.trim().length < 20) {
    throw new Error("OPENAI_API_KEY fehlt in den Umgebungsvariablen.");
  }

  return apiKey.trim();
}

function cleanString(value: unknown) {
  if (value === null || value === undefined) return null;

  const trimmed = String(value).trim();

  return trimmed.length > 0 ? trimmed : null;
}

function getProductName(product: ProductRow) {
  return (
    cleanString(product.name) ||
    cleanString(product.product_name) ||
    cleanString(product.title) ||
    cleanString(product.display_name) ||
    "Unbenanntes Produkt"
  );
}

function sanitizePathPart(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(2).replace(".", ",")} MB`;
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

function parseStoragePathFromPublicUrl(publicUrl: unknown) {
  const url = cleanString(publicUrl);

  if (!url) return null;

  const marker = `/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/`;
  const markerIndex = url.indexOf(marker);

  if (markerIndex === -1) return null;

  const rawPath = url.slice(markerIndex + marker.length).split("?")[0];

  if (!rawPath) return null;

  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
}

function getSourceImageUrl(product: ProductRow) {
  return cleanString(product.image_original_url) || cleanString(product.image_url);
}

function getSourceStoragePath(product: ProductRow) {
  return parseStoragePathFromPublicUrl(getSourceImageUrl(product));
}

function getStyledStoragePath(product: ProductRow, sourceStoragePath: string) {
  const sourceParsed = path.posix.parse(sourceStoragePath);
  const productId = sanitizePathPart(product.id);
  const productName = sanitizePathPart(getProductName(product));
  const sourceName = sanitizePathPart(sourceParsed.name);

  const baseName = [productId, productName, sourceName]
    .filter(Boolean)
    .join("-")
    .slice(0, 180);

  return `${STYLED_PREFIX}/${baseName}.webp`;
}

async function blobToBuffer(blob: Blob) {
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function downloadStorageFile(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  storagePath: string
) {
  const { data, error } = await supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .download(storagePath);

  if (error || !data) {
    throw new Error(
      `Bild konnte nicht aus Supabase geladen werden: ${
        error?.message || "Unbekannter Fehler"
      }`
    );
  }

  return blobToBuffer(data);
}

async function prepareImageForOpenAi(sourceBuffer: Buffer) {
  return sharp(sourceBuffer, {
    failOn: "none",
    unlimited: false,
  })
    .rotate()
    .resize({
      width: 1400,
      height: 1400,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png({
      compressionLevel: 6,
      adaptiveFiltering: true,
    })
    .toBuffer();
}

async function cutOutWithOpenAi(sourceBuffer: Buffer, productName: string) {
  const apiKey = getOpenAiApiKey();
  const preparedPng = await prepareImageForOpenAi(sourceBuffer);

  const formData = new FormData();

  formData.append("model", OPENAI_IMAGE_MODEL);
  formData.append(
    "prompt",
    [
      "Remove the background from this product photo.",
      "Keep only the photographed product.",
      "Do not redesign the product.",
      "Do not change the product shape, label, text, colors, packaging, proportions, or visible details.",
      "Only isolate the product from the background.",
      "Return the product on a transparent background.",
      "Preserve the product as close to the original as possible.",
    ].join(" ")
  );

  const preparedArrayBuffer = preparedPng.buffer.slice(
  preparedPng.byteOffset,
  preparedPng.byteOffset + preparedPng.byteLength
) as ArrayBuffer;

formData.append(
  "image",
  new Blob([preparedArrayBuffer], { type: "image/png" }),
  `${sanitizePathPart(productName) || "product"}.png`
);

  formData.append("size", "1024x1024");
  formData.append("background", "transparent");
  formData.append("quality", "medium");

  const response = await fetch(OPENAI_IMAGE_EDIT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `OpenAI Images API Fehler ${response.status}: ${responseText}`
    );
  }

  let json: {
    data?: Array<{
      b64_json?: string;
      url?: string;
    }>;
  };

  try {
    json = JSON.parse(responseText);
  } catch {
    throw new Error("OpenAI-Antwort konnte nicht als JSON gelesen werden.");
  }

  const firstImage = json?.data?.[0];

  if (!firstImage) {
    throw new Error("OpenAI hat kein Bild zurückgegeben.");
  }

  if (firstImage.b64_json) {
    return Buffer.from(firstImage.b64_json, "base64");
  }

  if (firstImage.url) {
    const imageResponse = await fetch(firstImage.url);

    if (!imageResponse.ok) {
      throw new Error(
        `OpenAI-Bild-URL konnte nicht geladen werden: ${imageResponse.status}`
      );
    }

    return Buffer.from(await imageResponse.arrayBuffer());
  }

  throw new Error("OpenAI-Antwort enthält weder b64_json noch url.");
}

function makeShadowSvg(width: number, height: number, productWidth: number) {
  const rx = Math.max(120, Math.min(360, Math.round(productWidth * 0.42)));
  const ry = Math.max(20, Math.min(48, Math.round(productWidth * 0.055)));
  const cx = Math.round(width / 2);
  const cy = PRODUCT_BOTTOM_Y + 24;

  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="rgba(15, 23, 42, 0.18)" />
    </svg>
  `);
}

async function composeProductOnBackground(cutoutBuffer: Buffer) {
  if (!fs.existsSync(BACKGROUND_PATH)) {
    throw new Error(
      `Hintergrundbild fehlt: ${BACKGROUND_PATH}. Lege die Datei unter scripts/assets/handzettel-product-bg.png ab und committe sie mit.`
    );
  }

  const backgroundBuffer = await sharp(BACKGROUND_PATH)
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, {
      fit: "cover",
      position: "center",
    })
    .png()
    .toBuffer();

  const resizedProduct = await sharp(cutoutBuffer, {
    failOn: "none",
  })
    .ensureAlpha()
    .trim({
      threshold: 8,
    })
    .resize({
      width: PRODUCT_MAX_WIDTH,
      height: PRODUCT_MAX_HEIGHT,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer({
      resolveWithObject: true,
    });

  const productWidth = resizedProduct.info.width || PRODUCT_MAX_WIDTH;
  const productHeight = resizedProduct.info.height || PRODUCT_MAX_HEIGHT;

  const left = Math.round((OUTPUT_SIZE - productWidth) / 2);
  const top = Math.max(300, PRODUCT_BOTTOM_Y - productHeight);

  const shadowSvg = makeShadowSvg(OUTPUT_SIZE, OUTPUT_SIZE, productWidth);

  return sharp(backgroundBuffer)
    .composite([
      {
        input: shadowSvg,
        left: 0,
        top: 0,
      },
      {
        input: resizedProduct.data,
        left,
        top,
      },
    ])
    .webp({
      quality: WEBP_QUALITY,
      effort: 4,
    })
    .toBuffer();
}

async function uploadStyledImage(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  styledStoragePath: string;
  styledBuffer: Buffer;
}) {
  const { error } = await params.supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(params.styledStoragePath, params.styledBuffer, {
      contentType: "image/webp",
      upsert: true,
    });

  if (error) {
    throw new Error(
      `Gestyltes Produktbild konnte nicht hochgeladen werden: ${error.message}`
    );
  }

  const { data } = params.supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .getPublicUrl(params.styledStoragePath);

  if (!data?.publicUrl) {
    throw new Error(
      "Öffentliche URL für gestyltes Produktbild konnte nicht erzeugt werden."
    );
  }

  return data.publicUrl;
}

async function updateProductStyledImageUrl(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  product: ProductRow;
  styledPublicUrl: string;
}) {
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {};

  setIfColumnExists(payload, params.product, "image_styled_url", params.styledPublicUrl);
  setIfColumnExists(payload, params.product, "image_styled_at", now);
  setIfColumnExists(payload, params.product, "updated_at", now);

  if (Object.keys(payload).length === 0) {
    throw new Error(
      "Die Spalten image_styled_url / image_styled_at konnten im Produkt nicht gefunden werden."
    );
  }

  const { error } = await params.supabase
    .from("school_products")
    .update(payload)
    .eq("id", params.product.id);

  if (error) {
    throw new Error(
      `Produkt konnte nicht mit image_styled_url aktualisiert werden: ${error.message}`
    );
  }
}

export async function POST(_request: NextRequest, context: Params) {
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

    const { data: product, error: productError } = await supabase
      .from("school_products")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (productError) {
      return jsonResponse(
        {
          ok: false,
          message: `Produkt konnte nicht geladen werden: ${productError.message}`,
        },
        500
      );
    }

    if (!product) {
      return jsonResponse(
        {
          ok: false,
          message: "Produkt wurde nicht gefunden.",
        },
        404
      );
    }

    const productRow = product as ProductRow;
    const productName = getProductName(productRow);
    const sourceStoragePath = getSourceStoragePath(productRow);

    if (!sourceStoragePath) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Für dieses Produkt wurde keine verwendbare Supabase-Bildquelle gefunden.",
        },
        400
      );
    }

    if (
      sourceStoragePath.startsWith("products-styled/") ||
      sourceStoragePath.startsWith("products-styled-openai/")
    ) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Die aktuelle Bildquelle ist bereits ein gestyltes Bild. Bitte zuerst ein Original- oder Shopbild hinterlegen.",
        },
        400
      );
    }

    const styledStoragePath = getStyledStoragePath(productRow, sourceStoragePath);

    const sourceBuffer = await downloadStorageFile(supabase, sourceStoragePath);
    const cutoutBuffer = await cutOutWithOpenAi(sourceBuffer, productName);
    const styledBuffer = await composeProductOnBackground(cutoutBuffer);

    const styledPublicUrl = await uploadStyledImage({
      supabase,
      styledStoragePath,
      styledBuffer,
    });

    await updateProductStyledImageUrl({
      supabase,
      product: productRow,
      styledPublicUrl,
    });

    return jsonResponse({
      ok: true,
      message: "KI-Hintergrund wurde erzeugt und gespeichert.",
      productId: id,
      productName,
      sourceStoragePath,
      styledStoragePath,
      imageStyledUrl: styledPublicUrl,
      sourceSize: formatBytes(sourceBuffer.length),
      styledSize: formatBytes(styledBuffer.length),
    });
  } catch (error) {
    console.error("Admin product style image error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "KI-Hintergrund konnte nicht erzeugt werden.",
      },
      500
    );
  }
}