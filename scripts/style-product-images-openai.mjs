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

function getArg(name, fallback = null) {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

function hasFlag(name) {
  return process.argv.includes(name);
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

function getOpenAiApiKey() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || apiKey.trim().length < 20) {
    throw new Error("OPENAI_API_KEY fehlt in .env.local.");
  }

  return apiKey.trim();
}

function getProductName(product) {
  return (
    product.name ||
    product.product_name ||
    product.title ||
    product.display_name ||
    "Unbenanntes Produkt"
  );
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
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2).replace(".", ",")} MB`;
}

function parseStoragePathFromPublicUrl(publicUrl) {
  if (!publicUrl || typeof publicUrl !== "string") return null;

  const marker = `/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/`;
  const markerIndex = publicUrl.indexOf(marker);

  if (markerIndex === -1) return null;

  const rawPath = publicUrl.slice(markerIndex + marker.length).split("?")[0];
  if (!rawPath) return null;

  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
}

function getSourceImageUrl(product) {
  return product.image_original_url || product.image_url || null;
}

function getSourceStoragePath(product) {
  return parseStoragePathFromPublicUrl(getSourceImageUrl(product));
}

function getStyledStoragePath(product, sourceStoragePath) {
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

async function prepareImageForOpenAi(sourceBuffer) {
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

async function cutOutWithOpenAi(sourceBuffer, productName) {
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

  formData.append(
    "image",
    new Blob([preparedPng], { type: "image/png" }),
    `${sanitizePathPart(productName) || "product"}.png`
  );

  formData.append("size", "1024x1024");
  formData.append("background", "transparent");
  formData.append("quality", "medium");

  console.log(`   OpenAI-Freistellung starten: ${productName}`);

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

  let json;

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

function makeShadowSvg(width, height, productWidth) {
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

async function composeProductOnBackground(cutoutBuffer) {
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

  const fullPayload = {
    image_styled_url: styledPublicUrl,
    image_styled_at: now,
    updated_at: now,
  };

  const { error: fullError } = await supabase
    .from("school_products")
    .update(fullPayload)
    .eq("id", product.id);

  if (!fullError) return;

  const fallbackPayload = {
    image_styled_url: styledPublicUrl,
    image_styled_at: now,
  };

  const { error: fallbackError } = await supabase
    .from("school_products")
    .update(fallbackPayload)
    .eq("id", product.id);

  if (fallbackError) {
    throw new Error(
      `Produkt konnte nicht mit image_styled_url aktualisiert werden: ${fallbackError.message}`
    );
  }
}

function shouldProcessProduct(product, force) {
  if (!product?.id) return false;
  if (!product.image_url && !product.image_original_url) return false;

  if (!force && product.image_styled_url) {
    return false;
  }

  return true;
}

async function loadProductsToProcess(supabase) {
  const force = hasFlag("--force");
  const all = hasFlag("--all");
  const limitArg = Number(getArg("--limit", "3"));

  const limit =
    Number.isFinite(limitArg) && limitArg > 0 ? Math.floor(limitArg) : 3;

  const { data, error } = await supabase
    .from("school_products")
    .select("*")
    .not("image_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(all ? 1000 : limit);

  if (error) {
    throw new Error(`Produkte konnten nicht geladen werden: ${error.message}`);
  }

  return (data || []).filter((product) => shouldProcessProduct(product, force));
}

async function main() {
  console.log("");
  console.log("Produktbilder mit OpenAI-Freistellung und Handzettel-Hintergrund erzeugen");
  console.log("========================================================================");
  console.log("");

  if (!fs.existsSync(BACKGROUND_PATH)) {
    throw new Error(
      `Hintergrundbild fehlt: ${BACKGROUND_PATH}\nLege die Datei bitte unter scripts/assets/handzettel-product-bg.png ab.`
    );
  }

  const dryRun = hasFlag("--dry-run");
  const force = hasFlag("--force");
  const all = hasFlag("--all");
  const limit = getArg("--limit", "3");

  console.log(`Modus: ${dryRun ? "Dry Run, keine Speicherung" : "Speichern aktiv"}`);
  console.log(`Umfang: ${all ? "alle passenden Produkte" : `maximal ${limit} Produkte`}`);
  console.log(`Force: ${force ? "ja, vorhandene styled Bilder neu erzeugen" : "nein"}`);
  console.log(`OpenAI-Modell: ${OPENAI_IMAGE_MODEL}`);
  console.log(`Ausgabeformat: WebP, Qualität ${WEBP_QUALITY}`);
  console.log("");

  const supabase = getSupabaseAdmin();
  const products = await loadProductsToProcess(supabase);

  if (products.length === 0) {
    console.log("Keine passenden Produkte gefunden.");
    console.log(
      "Hinweis: Ohne --force werden Produkte mit vorhandener image_styled_url übersprungen."
    );
    console.log("");
    return;
  }

  console.log(`Zu verarbeitende Produkte: ${products.length}`);
  console.log("");

  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let totalSourceBytes = 0;
  let totalStyledBytes = 0;

  for (const [index, product] of products.entries()) {
    const productName = getProductName(product);
    const sourceStoragePath = getSourceStoragePath(product);

    console.log(`[${index + 1}/${products.length}] ${productName}`);

    if (!sourceStoragePath) {
      skippedCount += 1;
      console.log(
        "   Übersprungen: Bild-URL gehört nicht zum erwarteten Supabase-Bucket."
      );
      console.log("");
      continue;
    }

    if (
      sourceStoragePath.startsWith("products-styled/") ||
      sourceStoragePath.startsWith("products-styled-openai/")
    ) {
      skippedCount += 1;
      console.log("   Übersprungen: Quelle ist bereits ein styled Bild.");
      console.log("");
      continue;
    }

    const styledStoragePath = getStyledStoragePath(product, sourceStoragePath);

    console.log(`   Quelle: ${sourceStoragePath}`);
    console.log(`   Ziel:   ${styledStoragePath}`);

    if (dryRun) {
      successCount += 1;
      console.log("   Dry Run erfolgreich.");
      console.log("");
      continue;
    }

    try {
      const sourceBuffer = await downloadStorageFile(supabase, sourceStoragePath);
      const cutoutBuffer = await cutOutWithOpenAi(sourceBuffer, productName);
      const styledBuffer = await composeProductOnBackground(cutoutBuffer);

      const styledPublicUrl = await uploadStyledImage(
        supabase,
        styledStoragePath,
        styledBuffer
      );

      await updateProductStyledImageUrl(supabase, product, styledPublicUrl);

      totalSourceBytes += sourceBuffer.length;
      totalStyledBytes += styledBuffer.length;
      successCount += 1;

      console.log(
        `   Fertig: Quelle ${formatBytes(sourceBuffer.length)} → Styled ${formatBytes(
          styledBuffer.length
        )}`
      );
      console.log("");
    } catch (error) {
      errorCount += 1;
      console.error(
        `   Fehler: ${
          error instanceof Error ? error.message : "Unbekannter Fehler"
        }`
      );
      console.log("");
    }
  }

  console.log("Zusammenfassung");
  console.log("===============");
  console.log(`Erfolgreich: ${successCount}`);
  console.log(`Übersprungen: ${skippedCount}`);
  console.log(`Fehler: ${errorCount}`);

  if (totalSourceBytes > 0) {
    console.log(
      `Gesamtgröße: ${formatBytes(totalSourceBytes)} → ${formatBytes(
        totalStyledBytes
      )}`
    );
  }

  console.log("");
}

main().catch((error) => {
  console.error("");
  console.error("Batch-Abbruch:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});