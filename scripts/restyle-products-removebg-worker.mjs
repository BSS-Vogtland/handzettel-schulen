import dotenv from "dotenv";

dotenv.config({
  path: ".env.local",
});

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const PRODUCT_IMAGE_BUCKET = "school-product-images";
const STYLED_PREFIX = "products-styled-removebg";

const OUTPUT_SIZE = 1254;
const DEFAULT_MAX_WIDTH = 860;
const DEFAULT_MAX_HEIGHT = 760;
const FLAT_MAX_WIDTH = 900;
const FLAT_MAX_HEIGHT = 900;
const PRODUCT_BOTTOM_Y = 1038;
const WEBP_QUALITY = 84;

const REMOVE_BG_API_URL = "https://api.remove.bg/v1.0/removebg";

const BACKGROUND_PATH = path.join(
  process.cwd(),
  "scripts",
  "assets",
  "handzettel-product-bg.png"
);

const FLAT_PRODUCT_KEYWORDS = [
  "heft",
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

function getArg(name, fallback = null) {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));

  if (!found) return fallback;

  return found.slice(prefix.length);
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase-Variablen fehlen. Prüfe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY in .env.local."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getRemoveBgApiKey() {
  const apiKey = String(process.env.REMOVE_BG_API_KEY || "").trim();

  if (!apiKey || apiKey.length < 10) {
    throw new Error("REMOVE_BG_API_KEY fehlt in .env.local.");
  }

  return apiKey;
}

function cleanString(value) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function getProductName(product) {
  return cleanString(product.name) || "Unbenanntes Produkt";
}

function sanitizePathPart(value) {
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

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(2).replace(".", ",")} MB`;
}

function parseStoragePathFromPublicUrl(publicUrl) {
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

function getSourceImageUrl(product) {
  return cleanString(product.image_original_url) || cleanString(product.image_url);
}

function getSourceStoragePath(product) {
  return parseStoragePathFromPublicUrl(getSourceImageUrl(product));
}

function getStyledStoragePath(product, sourceStoragePath) {
  const sourceParsed = path.posix.parse(sourceStoragePath);
  const productId = sanitizePathPart(product.id);
  const productName = sanitizePathPart(getProductName(product));
  const sourceName = sanitizePathPart(sourceParsed.name);
  const timestamp = Date.now();

  const baseName = [productId, productName, sourceName, timestamp]
    .filter(Boolean)
    .join("-")
    .slice(0, 210);

  return `${STYLED_PREFIX}/${baseName}.webp`;
}

function isFlatProduct(productName) {
  const normalized = productName
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");

  return FLAT_PRODUCT_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

async function blobToBuffer(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function downloadStorageFile(supabase, storagePath) {
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

async function prepareImageForRemoveBg(sourceBuffer) {
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

async function removeBackgroundWithRemoveBg(sourceBuffer, productName) {
  const apiKey = getRemoveBgApiKey();
  const preparedPng = await prepareImageForRemoveBg(sourceBuffer);

  const preparedArrayBuffer = preparedPng.buffer.slice(
    preparedPng.byteOffset,
    preparedPng.byteOffset + preparedPng.byteLength
  );

  const formData = new FormData();

  formData.append(
    "image_file",
    new Blob([preparedArrayBuffer], { type: "image/png" }),
    `${sanitizePathPart(productName) || "produkt"}.png`
  );

  formData.append("size", "auto");
  formData.append("type", "auto");
  formData.append("format", "png");

  const response = await fetch(REMOVE_BG_API_URL, {
    method: "POST",
    headers: {
      "X-Api-Key": apiKey,
    },
    body: formData,
  });

  const responseBuffer = Buffer.from(await response.arrayBuffer());

  if (!response.ok) {
    const errorText = responseBuffer.toString("utf8");
    throw new Error(
      `remove.bg Fehler ${response.status}: ${errorText || "Keine Fehlerdetails"}`
    );
  }

  return sharp(responseBuffer, {
    failOn: "none",
  })
    .ensureAlpha()
    .png()
    .toBuffer();
}

function makeShadowSvg(width, height, productWidth, flatProduct) {
  const cx = Math.round(width / 2);
  const cy = PRODUCT_BOTTOM_Y + (flatProduct ? 18 : 24);

  const rx = flatProduct
    ? Math.max(120, Math.min(300, Math.round(productWidth * 0.34)))
    : Math.max(140, Math.min(360, Math.round(productWidth * 0.42)));

  const ry = flatProduct
    ? Math.max(12, Math.min(28, Math.round(productWidth * 0.026)))
    : Math.max(18, Math.min(42, Math.round(productWidth * 0.05)));

  const opacity = flatProduct ? 0.11 : 0.17;

  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="rgba(15,23,42,${opacity})" />
    </svg>
  `);
}

async function composeProductOnBackground(cutoutBuffer, productName) {
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

  const withSafetyPadding = await sharp(trimmed, {
    failOn: "none",
  })
    .extend({
      top: flatProduct ? 12 : 7,
      bottom: flatProduct ? 12 : 7,
      left: flatProduct ? 12 : 7,
      right: flatProduct ? 12 : 7,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const resized = await sharp(withSafetyPadding, {
    failOn: "none",
  })
    .resize({
      width: flatProduct ? FLAT_MAX_WIDTH : 860,
      height: flatProduct ? FLAT_MAX_HEIGHT : 760,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer({ resolveWithObject: true });

  const productWidth =
    resized.info.width || (flatProduct ? FLAT_MAX_WIDTH : DEFAULT_MAX_WIDTH);
  const productHeight =
    resized.info.height || (flatProduct ? FLAT_MAX_HEIGHT : DEFAULT_MAX_HEIGHT);

  const left = Math.round((OUTPUT_SIZE - productWidth) / 2);
  const top = Math.max(flatProduct ? 170 : 230, PRODUCT_BOTTOM_Y - productHeight);

  const shadowSvg = makeShadowSvg(
    OUTPUT_SIZE,
    OUTPUT_SIZE,
    productWidth,
    flatProduct
  );

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

async function uploadStyledImage(supabase, styledStoragePath, styledBuffer) {
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

async function updateProductStyledImageUrl(supabase, product, styledPublicUrl) {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("school_products")
    .update({
      image_styled_url: styledPublicUrl,
      image_styled_at: now,
      updated_at: now,
    })
    .eq("id", product.id);

  if (error) {
    throw new Error(
      `Produkt konnte nicht mit image_styled_url aktualisiert werden: ${error.message}`
    );
  }
}

async function main() {
  const productId = getArg("--id");

  if (!productId) {
    throw new Error("Fehlender Parameter: --id=<produkt-id>");
  }

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

  const productName = getProductName(product);
  const sourceStoragePath = getSourceStoragePath(product);

  if (!sourceStoragePath) {
    throw new Error(
      "Für dieses Produkt wurde keine verwendbare Supabase-Bildquelle gefunden."
    );
  }

  if (
    sourceStoragePath.startsWith("products-styled/") ||
    sourceStoragePath.startsWith("products-styled-openai/") ||
    sourceStoragePath.startsWith("products-styled-cutout/") ||
    sourceStoragePath.startsWith("products-styled-removebg/")
  ) {
    throw new Error(
      "Die aktuelle Bildquelle ist bereits ein gestyltes Bild. Bitte image_original_url prüfen."
    );
  }

  const styledStoragePath = getStyledStoragePath(product, sourceStoragePath);

  console.log(`Produkt: ${productName}`);
  console.log(`Quelle:  ${sourceStoragePath}`);
  console.log(`Ziel:    ${styledStoragePath}`);

  const sourceBuffer = await downloadStorageFile(supabase, sourceStoragePath);
  console.log(`Quelle geladen: ${formatBytes(sourceBuffer.length)}`);

  const cutoutBuffer = await removeBackgroundWithRemoveBg(
    sourceBuffer,
    productName
  );
  console.log(`Freistellung erzeugt: ${formatBytes(cutoutBuffer.length)}`);

  const styledBuffer = await composeProductOnBackground(cutoutBuffer, productName);
  console.log(`Shopbild erzeugt: ${formatBytes(styledBuffer.length)}`);

  const styledPublicUrl = await uploadStyledImage(
    supabase,
    styledStoragePath,
    styledBuffer
  );

  await updateProductStyledImageUrl(supabase, product, styledPublicUrl);

  console.log("Gespeichert.");
  console.log(styledPublicUrl);
}

main().catch((error) => {
  console.error("");
  console.error("Worker-Fehler:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});