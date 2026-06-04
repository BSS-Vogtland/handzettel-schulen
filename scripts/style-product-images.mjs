import dotenv from "dotenv";

dotenv.config({
  path: ".env.local",
});

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { removeBackground } from "@imgly/background-removal-node";

const PRODUCT_IMAGE_BUCKET = "school-product-images";
const ORIGINAL_PREFIX = "products/";
const STYLED_PREFIX = "products-styled/";

const OUTPUT_SIZE = 1254;
const PRODUCT_MAX_WIDTH = 820;
const PRODUCT_MAX_HEIGHT = 720;
const PRODUCT_BOTTOM_Y = 1015;

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

function getProductName(product) {
  return (
    product.name ||
    product.product_name ||
    product.title ||
    product.display_name ||
    "Unbenanntes Produkt"
  );
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

function getStyledStoragePath(originalStoragePath) {
  const parsed = path.posix.parse(originalStoragePath);
  const originalBaseName = parsed.name || `product-${Date.now()}`;

  if (originalStoragePath.startsWith(ORIGINAL_PREFIX)) {
    const withoutOriginalPrefix = originalStoragePath.slice(ORIGINAL_PREFIX.length);
    const styledRelative = withoutOriginalPrefix.replace(/\.[^.]+$/, ".png");

    return `${STYLED_PREFIX}${styledRelative}`;
  }

  return `${STYLED_PREFIX}${originalBaseName}.png`;
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
      `Originalbild konnte nicht aus Supabase geladen werden: ${
        error?.message || "Unbekannter Fehler"
      }`
    );
  }

  return blobToBuffer(data);
}

async function normalizeInputImageToPng(inputBuffer, productLabel) {
  console.log(`   Originalbild für Verarbeitung vorbereiten: ${productLabel}`);

  const normalized = await sharp(inputBuffer, {
    failOn: "none",
    unlimited: false,
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

  return normalized;
}

async function removeImageBackground(inputBuffer, productLabel) {
  const normalizedPngBuffer = await normalizeInputImageToPng(
    inputBuffer,
    productLabel
  );

  const inputBlob = new Blob([normalizedPngBuffer], {
    type: "image/png",
  });

  console.log(`   Hintergrund entfernen: ${productLabel}`);

  const processedBlob = await removeBackground(inputBlob, {
    model: "medium",
    output: {
      format: "image/png",
      quality: 0.95,
    },
    progress: (key, current, total) => {
      if (!total) return;

      const percentage = Math.round((current / total) * 100);

      if (
        percentage === 25 ||
        percentage === 50 ||
        percentage === 75 ||
        percentage === 100
      ) {
        console.log(`   ${key}: ${percentage}%`);
      }
    },
  });

  return blobToBuffer(processedBlob);
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
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
    })
    .toBuffer();
}

async function uploadStyledImage(supabase, styledStoragePath, styledBuffer) {
  const { error } = await supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(styledStoragePath, styledBuffer, {
      contentType: "image/png",
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

async function updateProductImageUrls(supabase, product, styledPublicUrl) {
  const originalUrl = product.image_original_url || product.image_url || null;

  const { error } = await supabase
    .from("school_products")
    .update({
      image_original_url: originalUrl,
      image_styled_url: styledPublicUrl,
      image_styled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", product.id);

  if (error) {
    throw new Error(
      `Produkt konnte nicht mit image_styled_url aktualisiert werden: ${error.message}`
    );
  }
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
    .limit(all ? 1000 : limit);

  if (error) {
    throw new Error(`Produkte konnten nicht geladen werden: ${error.message}`);
  }

  const products = (data || []).filter((product) => {
    if (!product?.id) return false;
    if (!product.image_url) return false;

    if (!force && product.image_styled_url) {
      return false;
    }

    return true;
  });

  return products;
}

async function main() {
  console.log("");
  console.log("Produktbilder mit Handzettel-Hintergrund erzeugen");
  console.log("================================================");
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
  console.log("");

  const supabase = getSupabaseAdmin();
  const products = await loadProductsToProcess(supabase);

  if (products.length === 0) {
    console.log("Keine passenden Produkte gefunden.");
    console.log(
      "Hinweis: Ohne --force werden Produkte mit vorhandener image_styled_url übersprungen."
    );
    return;
  }

  console.log(`Zu verarbeitende Produkte: ${products.length}`);
  console.log("");

  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const [index, product] of products.entries()) {
    const productName = getProductName(product);
    const imageUrl = product.image_url;
    const originalStoragePath = parseStoragePathFromPublicUrl(imageUrl);

    console.log(`[${index + 1}/${products.length}] ${productName}`);

    if (!originalStoragePath) {
      skippedCount += 1;
      console.log(
        "   Übersprungen: image_url gehört nicht zum erwarteten Supabase-Bucket."
      );
      console.log("");
      continue;
    }

    if (!originalStoragePath.startsWith(ORIGINAL_PREFIX)) {
      skippedCount += 1;
      console.log(
        `   Übersprungen: Storage-Pfad liegt nicht unter ${ORIGINAL_PREFIX}: ${originalStoragePath}`
      );
      console.log("");
      continue;
    }

    const styledStoragePath = getStyledStoragePath(originalStoragePath);

    try {
      console.log(`   Original: ${originalStoragePath}`);
      console.log(`   Ziel:     ${styledStoragePath}`);

      if (dryRun) {
        successCount += 1;
        console.log("   Dry Run erfolgreich.");
        console.log("");
        continue;
      }

      const originalBuffer = await downloadStorageFile(
        supabase,
        originalStoragePath
      );

      const cutoutBuffer = await removeImageBackground(originalBuffer, productName);
      const styledBuffer = await composeProductOnBackground(cutoutBuffer);

      const styledPublicUrl = await uploadStyledImage(
        supabase,
        styledStoragePath,
        styledBuffer
      );

      await updateProductImageUrls(supabase, product, styledPublicUrl);

      successCount += 1;
      console.log("   Fertig.");
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
  console.log("");
}

main().catch((error) => {
  console.error("");
  console.error("Batch-Abbruch:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});