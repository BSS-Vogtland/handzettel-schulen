import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const PRODUCT_IMAGE_BUCKET = "school-product-images";
const STYLED_PREFIX = "products-styled-removebg";

const OUTPUT_SIZE = 1254;
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

type ProductProfile = {
  label: string;
  maxWidth: number;
  maxHeight: number;
  minTop: number;
  bottomY: number;
  padding: number;
  shadowOpacity: number;
  shadowWidthFactor: number;
  shadowHeightFactor: number;
  shadowYOffset: number;
  preserveOriginal: boolean;
};

const PRODUCT_PROFILES: Record<string, ProductProfile> = {
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

type ProductRow = {
  id: string;
  name?: string | null;
  product_name?: string | null;
  title?: string | null;
  sku?: string | null;
  image_url?: string | null;
  image_original_url?: string | null;
  image_styled_url?: string | null;
  image_styled_at?: string | null;
};

export type ProductImageStyleResult = {
  styledImageUrl: string;
  storagePath: string;
  usedRemoveBg: boolean;
  profile: string;
};

type TryStyleResult =
  | {
      attempted: true;
      ok: true;
      result: ProductImageStyleResult;
      message: string;
    }
  | {
      attempted: true;
      ok: false;
      result: null;
      message: string;
    }
  | {
      attempted: false;
      ok: false;
      result: null;
      message: string;
    };

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase-Variablen fehlen. Prüfe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY."
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
    throw new Error("REMOVE_BG_API_KEY fehlt in den Umgebungsvariablen.");
  }

  return apiKey;
}

function cleanString(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function normalizeText(value: unknown) {
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

function hasKeyword(value: unknown, keywords: string[]) {
  const normalized = normalizeText(value);

  return keywords.some((keyword) => normalized.includes(normalizeText(keyword)));
}

function getProductName(product: ProductRow) {
  return cleanString(product.name || product.product_name || product.title) || "Unbenanntes Produkt";
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
  const timestamp = Date.now();

  const baseName = [productId, productName, sourceName, timestamp]
    .filter(Boolean)
    .join("-")
    .slice(0, 210);

  return `${STYLED_PREFIX}/${baseName}.webp`;
}

function getProductProfile(productName: string): ProductProfile {
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
    const normalized = normalizeText(productName);

    if (
      normalized.includes("pinsel sortiment") ||
      normalized.includes("pinselset") ||
      normalized.includes("pinsel sort")
    ) {
      return PRODUCT_PROFILES.slimLarge;
    }

    return PRODUCT_PROFILES.slim;
  }

  return PRODUCT_PROFILES.default;
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
      `Bild konnte nicht aus Supabase geladen werden: ${error?.message || "Unbekannter Fehler"}`
    );
  }

  return blobToBuffer(data);
}

async function prepareImageForRemoveBg(sourceBuffer: Buffer) {
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

async function prepareOriginalLayer(sourceBuffer: Buffer) {
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

async function removeBackgroundWithRemoveBg(sourceBuffer: Buffer, productName: string) {
  const apiKey = getRemoveBgApiKey();
  const preparedPng = await prepareImageForRemoveBg(sourceBuffer);

  const formData = new FormData();

  formData.append(
    "image_file",
    new Blob([new Uint8Array(preparedPng)], { type: "image/png" }),
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

function makeShadowSvg(
  width: number,
  height: number,
  productWidth: number,
  profile: ProductProfile
) {
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

async function composeProductOnBackground(productLayerBuffer: Buffer, productName: string) {
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

async function uploadStyledImage(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  styledStoragePath: string,
  styledBuffer: Buffer
) {
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

async function updateProductStyledImageUrl(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  product: ProductRow,
  styledPublicUrl: string
) {
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

export async function styleProductImageById(productId: string): Promise<ProductImageStyleResult> {
  const cleanProductId = cleanString(productId);

  if (!cleanProductId) {
    throw new Error("Keine Produkt-ID übergeben.");
  }

  const supabase = getSupabaseAdmin();

  const { data: product, error: productError } = await supabase
    .from("school_products")
    .select("*")
    .eq("id", cleanProductId)
    .maybeSingle();

  if (productError) {
    throw new Error(`Produkt konnte nicht geladen werden: ${productError.message}`);
  }

  if (!product) {
    throw new Error("Produkt wurde nicht gefunden.");
  }

  const typedProduct = product as ProductRow;
  const productName = getProductName(typedProduct);
  const profile = getProductProfile(productName);
  const sourceStoragePath = getSourceStoragePath(typedProduct);

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

  const styledStoragePath = getStyledStoragePath(typedProduct, sourceStoragePath);
  const sourceBuffer = await downloadStorageFile(supabase, sourceStoragePath);

  const productLayerBuffer = profile.preserveOriginal
    ? await prepareOriginalLayer(sourceBuffer)
    : await removeBackgroundWithRemoveBg(sourceBuffer, productName);

  const styledBuffer = await composeProductOnBackground(
    productLayerBuffer,
    productName
  );

  const styledPublicUrl = await uploadStyledImage(
    supabase,
    styledStoragePath,
    styledBuffer
  );

  await updateProductStyledImageUrl(supabase, typedProduct, styledPublicUrl);

  return {
    styledImageUrl: styledPublicUrl,
    storagePath: styledStoragePath,
    usedRemoveBg: !profile.preserveOriginal,
    profile: profile.label,
  };
}

export async function tryStyleProductImageById(productId: string): Promise<TryStyleResult> {
  const cleanProductId = cleanString(productId);

  if (!cleanProductId) {
    return {
      attempted: false,
      ok: false,
      result: null,
      message: "Keine Produkt-ID übergeben.",
    };
  }

  try {
    const result = await styleProductImageById(cleanProductId);

    return {
      attempted: true,
      ok: true,
      result,
      message: result.usedRemoveBg
        ? "Produktbild wurde mit remove.bg freigestellt und auf den Shop-Hintergrund gesetzt."
        : "Produktbild wurde originalschonend auf den Shop-Hintergrund gesetzt.",
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      result: null,
      message:
        error instanceof Error
          ? error.message
          : "Produktbild konnte nicht freigestellt werden.",
    };
  }
}
