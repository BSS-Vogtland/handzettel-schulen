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

/**
 * Logo-/Claim-Safe-Zone.
 * Produkte dürfen optisch nicht in diesen Bereich hineinragen.
 */
const LOGO_SAFE_BOTTOM_Y = 355;
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
  "loeschblatt",
  "deckblatt",
];

const TRANSPARENT_PRODUCT_KEYWORDS = [
  "transparent",
  "klar",
  "clear",
  "durchsichtig",
  "pvc",
  "folie",
  "folien",
  "buchumschlag",
  "heftumschlag",
  "umschlag transparent",
  "umschlag klar",
  "schnellhefter pvc",
];

const SLIM_PRODUCT_KEYWORDS = [
  "klebestift",
  "textmarker",
  "permanentmarker",
  "marker",
  "bleistift",
  "pinsel",
  "lineal",
  "zirkel",
  "heftstreifen",
  "aktentulli",
  "schere",
];

const PRODUCT_PROFILES = {
  default: {
    label: "default",
    maxWidth: 720,
    maxHeight: 610,
    minTop: LOGO_SAFE_BOTTOM_Y + 10,
    bottomY: PRODUCT_BOTTOM_Y,
    padding: 8,
    shadowOpacity: 0.15,
    shadowWidthFactor: 0.38,
    shadowHeightFactor: 0.042,
    shadowYOffset: 22,
    preserveOriginal: false,
  },
  flat: {
    label: "flat",
    maxWidth: 690,
    maxHeight: 600,
    minTop: LOGO_SAFE_BOTTOM_Y + 20,
    bottomY: PRODUCT_BOTTOM_Y,
    padding: 14,
    shadowOpacity: 0.1,
    shadowWidthFactor: 0.31,
    shadowHeightFactor: 0.023,
    shadowYOffset: 17,
    preserveOriginal: false,
  },
  flatTransparent: {
    label: "flat-transparent-original-preserved",
    maxWidth: 600,
    maxHeight: 500,
    minTop: LOGO_SAFE_BOTTOM_Y + 55,
    bottomY: PRODUCT_BOTTOM_Y - 22,
    padding: 22,
    shadowOpacity: 0.055,
    shadowWidthFactor: 0.25,
    shadowHeightFactor: 0.016,
    shadowYOffset: 12,
    preserveOriginal: true,
  },
  slim: {
    label: "slim",
    maxWidth: 560,
    maxHeight: 500,
    minTop: LOGO_SAFE_BOTTOM_Y + 45,
    bottomY: PRODUCT_BOTTOM_Y - 18,
    padding: 12,
    shadowOpacity: 0.1,
    shadowWidthFactor: 0.29,
    shadowHeightFactor: 0.021,
    shadowYOffset: 13,
    preserveOriginal: false,
  },
  slimLarge: {
    label: "slim-large",
    maxWidth: 620,
    maxHeight: 520,
    minTop: LOGO_SAFE_BOTTOM_Y + 42,
    bottomY: PRODUCT_BOTTOM_Y - 14,
    padding: 12,
    shadowOpacity: 0.1,
    shadowWidthFactor: 0.3,
    shadowHeightFactor: 0.021,
    shadowYOffset: 13,
    preserveOriginal: false,
  },
};

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

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[,;/_]+/g, " ")
    .replace(/\s+/g, " ");
}

function hasKeyword(value, keywords) {
  const normalized = normalizeText(value);

  return keywords.some((keyword) => normalized.includes(normalizeText(keyword)));
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

function getProductProfile(productName) {
  const isFlat = hasKeyword(productName, FLAT_PRODUCT_KEYWORDS);
  const isTransparent = hasKeyword(productName, TRANSPARENT_PRODUCT_KEYWORDS);
  const isSlim = hasKeyword(productName, SLIM_PRODUCT_KEYWORDS);

  if (isFlat && isTransparent) {
    return PRODUCT_PROFILES.flatTransparent;
  }

  if (isFlat) {
    return PRODUCT_PROFILES.flat;
  }

  if (isSlim) {
    if (
      normalizeText(productName).includes("pinsel sortiment") ||
      normalizeText(productName).includes("pinselset") ||
      normalizeText(productName).includes("pinsel sort")
    ) {
      return PRODUCT_PROFILES.slimLarge;
    }

    return PRODUCT_PROFILES.slim;
  }

  return PRODUCT_PROFILES.default;
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

async function prepareOriginalLayer(sourceBuffer) {
  return sharp(sourceBuffer, {
    failOn: "none",
    limitInputPixels: false,
  })
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
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
  formData.append("type", "product");
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

function makeShadowSvg(width, height, productWidth, profile) {
  const cx = Math.round(width / 2);
  const cy = profile.bottomY + profile.shadowYOffset;

  const rx = Math.max(
    80,
    Math.min(330, Math.round(productWidth * profile.shadowWidthFactor))
  );

  const ry = Math.max(
    8,
    Math.min(36, Math.round(productWidth * profile.shadowHeightFactor))
  );

  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="rgba(15,23,42,${profile.shadowOpacity})" />
    </svg>
  `);
}

async function composeProductOnBackground(productLayerBuffer, productName) {
  if (!fs.existsSync(BACKGROUND_PATH)) {
    throw new Error(
      `Hintergrundbild fehlt: ${BACKGROUND_PATH}. Lege die Datei unter scripts/assets/handzettel-product-bg.png ab.`
    );
  }

  const profile = getProductProfile(productName);

  const backgroundBuffer = await sharp(BACKGROUND_PATH)
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, {
      fit: "cover",
      position: "center",
    })
    .png()
    .toBuffer();

  const trimOptions = profile.preserveOriginal
    ? {
        threshold: 12,
      }
    : {
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        threshold: 6,
      };

  const trimmed = await sharp(productLayerBuffer, {
    failOn: "none",
  })
    .ensureAlpha()
    .trim(trimOptions)
    .toBuffer();

  const withSafetyPadding = await sharp(trimmed, {
    failOn: "none",
  })
    .extend({
      top: profile.padding,
      bottom: profile.padding,
      left: profile.padding,
      right: profile.padding,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const availableHeightBelowLogo = Math.max(
    260,
    profile.bottomY - profile.minTop
  );

  const safeMaxHeight = Math.min(profile.maxHeight, availableHeightBelowLogo);

  const resized = await sharp(withSafetyPadding, {
    failOn: "none",
  })
    .resize({
      width: profile.maxWidth,
      height: safeMaxHeight,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer({ resolveWithObject: true });

  const productWidth = resized.info.width || profile.maxWidth;
  const productHeight = resized.info.height || safeMaxHeight;

  const left = Math.round((OUTPUT_SIZE - productWidth) / 2);

  const idealTop = profile.bottomY - productHeight;
  const top = Math.max(profile.minTop, idealTop);

  const shadowSvg = makeShadowSvg(
    OUTPUT_SIZE,
    OUTPUT_SIZE,
    productWidth,
    profile
  );

  console.log(`Profil: ${profile.label}`);
  console.log(`Preserve original: ${profile.preserveOriginal ? "ja" : "nein"}`);
  console.log(`Produktgröße: ${productWidth} x ${productHeight}`);
  console.log(`Position: left=${left}, top=${top}`);
  console.log(`Safe-Zone oben: ${profile.minTop}`);

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
  const profile = getProductProfile(productName);
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

  let productLayerBuffer;

  if (profile.preserveOriginal) {
    console.log(
      "Transparenz-/PVC-Profil: Originalbild wird vollständig erhalten, remove.bg wird für dieses Produkt übersprungen."
    );
    productLayerBuffer = await prepareOriginalLayer(sourceBuffer);
    console.log(`Original-Layer vorbereitet: ${formatBytes(productLayerBuffer.length)}`);
  } else {
    productLayerBuffer = await removeBackgroundWithRemoveBg(
      sourceBuffer,
      productName
    );
    console.log(`Freistellung erzeugt: ${formatBytes(productLayerBuffer.length)}`);
  }

  const styledBuffer = await composeProductOnBackground(
    productLayerBuffer,
    productName
  );

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