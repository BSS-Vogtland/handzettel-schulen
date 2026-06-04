import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { removeBackground } from "@imgly/background-removal-node";

type ProductRow = {
  id: string;
  name?: string | null;
  title?: string | null;
  image_url?: string | null;
  image_original_url?: string | null;
  image_styled_url?: string | null;
  image_styled_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

const PRODUCT_IMAGE_BUCKET = "school-product-images";
const STYLED_PREFIX = "products-styled-openai";

const OUTPUT_SIZE = 1254;
const DEFAULT_MAX_WIDTH = 860;
const DEFAULT_MAX_HEIGHT = 760;
const FLAT_MAX_WIDTH = 860;
const FLAT_MAX_HEIGHT = 860;
const PRODUCT_BOTTOM_Y = 1038;
const WEBP_QUALITY = 84;

const BACKGROUND_PATH = path.join(
  process.cwd(),
  "scripts",
  "assets",
  "handzettel-product-bg.png"
);

const FLAT_PRODUCT_KEYWORDS = [
  "heft",
  "hefte",
  "schreibheft",
  "rechenheft",
  "geometrieheft",
  "vokabelheft",
  "hausaufgabenheft",
  "umschlag",
  "schnellhefter",
  "mappe",
  "kunstmappe",
  "sammelmappe",
  "block",
  "zeichenblock",
  "schreibblock",
  "malblock",
  "papier",
  "buntpapier",
  "karton",
  "zeichenkarton",
  "buch",
  "buchumschlag",
  "heftumschlag",
  "muttiheft",
  "löschblatt",
  "deckblatt",
];

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

function getProductName(product: ProductRow) {
  return cleanString(product.name) || cleanString(product.title) || "Unbenanntes Produkt";
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

function isFlatProduct(productName: string) {
  const normalized = productName
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");

  return FLAT_PRODUCT_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

async function blobToBuffer(blob: Blob) {
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function downloadStorageFile(storagePath: string) {
  const supabase = getSupabaseAdmin();

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

async function prepareImageForCutout(sourceBuffer: Buffer) {
  return sharp(sourceBuffer, {
    failOn: "none",
    limitInputPixels: false,
  })
    .rotate()
    .resize({
      width: 1800,
      height: 1800,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png({
      compressionLevel: 6,
      adaptiveFiltering: true,
    })
    .toBuffer();
}

async function removeOnlyBackground(sourceBuffer: Buffer) {
  const preparedPng = await prepareImageForCutout(sourceBuffer);

  const removed = await removeBackground(preparedPng);
  const removedBuffer = Buffer.from(await removed.arrayBuffer());

  return sharp(removedBuffer, {
    failOn: "none",
  })
    .ensureAlpha()
    .png()
    .toBuffer();
}

function makeShadowSvg(
  width: number,
  height: number,
  productWidth: number,
  isFlat: boolean
) {
  const cx = Math.round(width / 2);
  const cy = PRODUCT_BOTTOM_Y + (isFlat ? 18 : 24);

  const rx = isFlat
    ? Math.max(120, Math.min(300, Math.round(productWidth * 0.34)))
    : Math.max(140, Math.min(360, Math.round(productWidth * 0.42)));

  const ry = isFlat
    ? Math.max(12, Math.min(28, Math.round(productWidth * 0.026)))
    : Math.max(18, Math.min(42, Math.round(productWidth * 0.05)));

  const opacity = isFlat ? 0.12 : 0.18;

  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="rgba(15,23,42,${opacity})" />
    </svg>
  `);
}

async function composeProductOnBackground(cutoutBuffer: Buffer, productName: string) {
  if (!fs.existsSync(BACKGROUND_PATH)) {
    throw new Error(
      `Hintergrundbild fehlt: ${BACKGROUND_PATH}. Lege die Datei unter scripts/assets/handzettel-product-bg.png ab.`
    );
  }

  const flatProduct = isFlatProduct(productName);

  const backgroundBuffer = await sharp(BACKGROUND_PATH)
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, {
      fit: "cover",
      position: "center",
    })
    .png()
    .toBuffer();

  const trimmed = await sharp(cutoutBuffer, {
    failOn: "none",
  })
    .ensureAlpha()
    .trim({
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      threshold: 6,
    })
    .toBuffer();

  // Kleiner Sicherheitsabstand rund um das Originalprodukt,
  // damit gerade bei Heften / Kanten nichts "zu knapp" wirkt.
  const withSafetyPadding = await sharp(trimmed)
    .extend({
      top: flatProduct ? 10 : 6,
      bottom: flatProduct ? 10 : 6,
      left: flatProduct ? 10 : 6,
      right: flatProduct ? 10 : 6,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const resized = await sharp(withSafetyPadding, {
    failOn: "none",
  })
    .resize({
      width: flatProduct ? FLAT_MAX_WIDTH : DEFAULT_MAX_WIDTH,
      height: flatProduct ? FLAT_MAX_HEIGHT : DEFAULT_MAX_HEIGHT,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer({ resolveWithObject: true });

  const productWidth = resized.info.width || (flatProduct ? FLAT_MAX_WIDTH : DEFAULT_MAX_WIDTH);
  const productHeight =
    resized.info.height || (flatProduct ? FLAT_MAX_HEIGHT : DEFAULT_MAX_HEIGHT);

  const left = Math.round((OUTPUT_SIZE - productWidth) / 2);
  const top = Math.max(flatProduct ? 180 : 240, PRODUCT_BOTTOM_Y - productHeight);

  const shadowSvg = makeShadowSvg(OUTPUT_SIZE, OUTPUT_SIZE, productWidth, flatProduct);

  return sharp(backgroundBuffer)
    .composite([
      {
        input: shadowSvg,
        left: 0,
        top: 0,
      },
      {
        input: resized.data,
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

async function uploadStyledImage(styledStoragePath: string, styledBuffer: Buffer) {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(styledStoragePath, styledBuffer, {
      contentType: "image/webp",
      upsert: true,
    });

  if (error) {
    throw new Error(
      `Gestyltes Produktbild konnte nicht hochgeladen werden: ${error.message}`
    );
  }

  const { data } = supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .getPublicUrl(styledStoragePath);

  if (!data?.publicUrl) {
    throw new Error(
      "Öffentliche URL für gestyltes Produktbild konnte nicht erzeugt werden."
    );
  }

  return data.publicUrl;
}

async function updateProductStyledImageUrl(product: ProductRow, styledPublicUrl: string) {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {};

  setIfColumnExists(payload, product, "image_styled_url", styledPublicUrl);
  setIfColumnExists(payload, product, "image_styled_at", now);
  setIfColumnExists(payload, product, "updated_at", now);

  if (Object.keys(payload).length === 0) {
    throw new Error(
      "Die Spalten image_styled_url / image_styled_at konnten im Produkt nicht gefunden werden."
    );
  }

  const { error } = await supabase
    .from("school_products")
    .update(payload)
    .eq("id", product.id);

  if (error) {
    throw new Error(
      `Produkt konnte nicht mit image_styled_url aktualisiert werden: ${error.message}`
    );
  }
}

export async function styleProductImageById(productId: string) {
  const supabase = getSupabaseAdmin();

  const { data: product, error: productError } = await supabase
    .from("school_products")
    .select("*")
    .eq("id", productId)
    .maybeSingle();

  if (productError) {
    throw new Error(`Produkt konnte nicht geladen werden: ${productError.message}`);
  }

  if (!product) {
    throw new Error("Produkt wurde nicht gefunden.");
  }

  const productRow = product as ProductRow;
  const productName = getProductName(productRow);
  const sourceStoragePath = getSourceStoragePath(productRow);

  if (!sourceStoragePath) {
    throw new Error(
      "Für dieses Produkt wurde keine verwendbare Supabase-Bildquelle gefunden."
    );
  }

  if (
    sourceStoragePath.startsWith("products-styled/") ||
    sourceStoragePath.startsWith("products-styled-openai/")
  ) {
    throw new Error(
      "Die aktuelle Bildquelle ist bereits ein gestyltes Bild. Bitte zuerst ein Original- oder Shopbild hinterlegen."
    );
  }

  const styledStoragePath = getStyledStoragePath(productRow, sourceStoragePath);

  const sourceBuffer = await downloadStorageFile(sourceStoragePath);
  const cutoutBuffer = await removeOnlyBackground(sourceBuffer);
  const styledBuffer = await composeProductOnBackground(cutoutBuffer, productName);
  const styledPublicUrl = await uploadStyledImage(styledStoragePath, styledBuffer);

  await updateProductStyledImageUrl(productRow, styledPublicUrl);

  return {
    ok: true,
    productId,
    productName,
    sourceStoragePath,
    styledStoragePath,
    imageStyledUrl: styledPublicUrl,
    sourceSize: formatBytes(sourceBuffer.length),
    styledSize: formatBytes(styledBuffer.length),
    mode: "cutout-original-preserved",
  };
}

export async function tryStyleProductImageById(productId: string) {
  try {
    const result = await styleProductImageById(productId);

    return {
      attempted: true,
      ok: true,
      result,
      message: "KI-Hintergrund wurde erzeugt, ohne das Produkt generativ neu zu malen.",
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      result: null,
      message:
        error instanceof Error
          ? error.message
          : "KI-Hintergrund konnte nicht erzeugt werden.",
    };
  }
}