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
const ORIGINAL_BACKUP_PREFIX = "products-original";
const OPTIMIZED_PREFIX = "products";

const MAX_IMAGE_SIZE = 1400;
const WEBP_QUALITY = 82;

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

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(2).replace(".", ",")} MB`;
}

function getReductionPercent(originalBytes, optimizedBytes) {
  if (!originalBytes || !optimizedBytes || optimizedBytes >= originalBytes) {
    return 0;
  }

  return Math.round(((originalBytes - optimizedBytes) / originalBytes) * 100);
}

function getCleanExtensionFromPath(storagePath) {
  const ext =
    path.posix
      .extname(storagePath || "")
      .replace(".", "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "jpg";

  return ext || "jpg";
}

function getContentTypeFromExtension(extension) {
  const ext = String(extension || "").toLowerCase();

  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "avif") return "image/avif";
  if (ext === "heic") return "image/heic";
  if (ext === "heif") return "image/heif";
  if (ext === "gif") return "image/gif";

  return "image/jpeg";
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
    .slice(0, 80);
}

function makeMigrationBaseName(product, originalStoragePath) {
  const parsed = path.posix.parse(originalStoragePath);
  const originalName = sanitizePathPart(parsed.name);
  const productId = sanitizePathPart(product.id);
  const productName = sanitizePathPart(getProductName(product));

  return [productId, productName, originalName]
    .filter(Boolean)
    .join("-")
    .slice(0, 180);
}

function makeTargetPaths(product, originalStoragePath) {
  const extension = getCleanExtensionFromPath(originalStoragePath);
  const baseName = makeMigrationBaseName(product, originalStoragePath);

  return {
    originalBackupPath: `${ORIGINAL_BACKUP_PREFIX}/${baseName}.${extension}`,
    optimizedPath: `${OPTIMIZED_PREFIX}/${baseName}.webp`,
  };
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

async function uploadBufferToStorage(input) {
  const { error } = await input.supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(input.storagePath, input.buffer, {
      contentType: input.contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(
      `Upload fehlgeschlagen für ${input.storagePath}: ${error.message}`
    );
  }

  const { data } = input.supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .getPublicUrl(input.storagePath);

  if (!data?.publicUrl) {
    throw new Error(
      `Öffentliche URL konnte nicht erzeugt werden für ${input.storagePath}.`
    );
  }

  return data.publicUrl;
}

async function createOptimizedWebpBuffer(originalBuffer) {
  return sharp(originalBuffer, {
    failOn: "none",
  })
    .rotate()
    .resize({
      width: MAX_IMAGE_SIZE,
      height: MAX_IMAGE_SIZE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: WEBP_QUALITY,
      effort: 4,
    })
    .toBuffer();
}

async function updateProductImageUrls(supabase, productId, input) {
  const now = new Date().toISOString();

  const fullPayload = {
    image_original_url: input.originalPublicUrl,
    image_url: input.optimizedPublicUrl,
    updated_at: now,
  };

  const { error: fullError } = await supabase
    .from("school_products")
    .update(fullPayload)
    .eq("id", productId);

  if (!fullError) return;

  const fallbackPayload = {
    image_original_url: input.originalPublicUrl,
    image_url: input.optimizedPublicUrl,
  };

  const { error: fallbackError } = await supabase
    .from("school_products")
    .update(fallbackPayload)
    .eq("id", productId);

  if (fallbackError) {
    throw new Error(
      `Produkt konnte nicht aktualisiert werden: ${fallbackError.message}`
    );
  }
}

function shouldProcessProduct(product, force) {
  if (!product?.id) return false;
  if (!product.image_url) return false;

  const imageUrl = String(product.image_url || "");

  if (!force && product.image_original_url && imageUrl.includes(".webp")) {
    return false;
  }

  if (!force && product.image_original_url && product.image_url) {
    return false;
  }

  return true;
}

async function loadProductsToProcess(supabase) {
  const force = hasFlag("--force");
  const all = hasFlag("--all");
  const limitArg = Number(getArg("--limit", "5"));

  const limit =
    Number.isFinite(limitArg) && limitArg > 0 ? Math.floor(limitArg) : 5;

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
  console.log("Bestehende Produktbilder optimieren");
  console.log("===================================");
  console.log("");

  const dryRun = hasFlag("--dry-run");
  const force = hasFlag("--force");
  const all = hasFlag("--all");
  const limit = getArg("--limit", "5");

  console.log(`Modus: ${dryRun ? "Dry Run, keine Speicherung" : "Speichern aktiv"}`);
  console.log(`Umfang: ${all ? "alle passenden Produkte" : `maximal ${limit} Produkte`}`);
  console.log(`Force: ${force ? "ja, vorhandene optimierte Bilder neu erzeugen" : "nein"}`);
  console.log(`Zielgröße: max. ${MAX_IMAGE_SIZE} x ${MAX_IMAGE_SIZE}px`);
  console.log(`WebP-Qualität: ${WEBP_QUALITY}`);
  console.log("");

  const supabase = getSupabaseAdmin();
  const products = await loadProductsToProcess(supabase);

  if (products.length === 0) {
    console.log("Keine passenden Produkte gefunden.");
    console.log(
      "Hinweis: Ohne --force werden Produkte mit vorhandener image_original_url übersprungen."
    );
    console.log("");
    return;
  }

  console.log(`Zu verarbeitende Produkte: ${products.length}`);
  console.log("");

  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let totalOriginalBytes = 0;
  let totalOptimizedBytes = 0;

  for (const [index, product] of products.entries()) {
    const productName = getProductName(product);
    const originalStoragePath = parseStoragePathFromPublicUrl(product.image_url);

    console.log(`[${index + 1}/${products.length}] ${productName}`);

    if (!originalStoragePath) {
      skippedCount += 1;
      console.log(
        "   Übersprungen: image_url gehört nicht zum erwarteten Supabase-Bucket."
      );
      console.log("");
      continue;
    }

    const { originalBackupPath, optimizedPath } = makeTargetPaths(
      product,
      originalStoragePath
    );

    console.log(`   Aktuelles Bild: ${originalStoragePath}`);
    console.log(`   Original-Kopie: ${originalBackupPath}`);
    console.log(`   Optimiert:      ${optimizedPath}`);

    if (dryRun) {
      successCount += 1;
      console.log("   Dry Run erfolgreich.");
      console.log("");
      continue;
    }

    try {
      const originalBuffer = await downloadStorageFile(
        supabase,
        originalStoragePath
      );

      const optimizedBuffer = await createOptimizedWebpBuffer(originalBuffer);

      const originalExtension = getCleanExtensionFromPath(originalStoragePath);
      const originalContentType = getContentTypeFromExtension(originalExtension);

      const originalPublicUrl = await uploadBufferToStorage({
        supabase,
        storagePath: originalBackupPath,
        buffer: originalBuffer,
        contentType: originalContentType,
      });

      const optimizedPublicUrl = await uploadBufferToStorage({
        supabase,
        storagePath: optimizedPath,
        buffer: optimizedBuffer,
        contentType: "image/webp",
      });

      await updateProductImageUrls(supabase, product.id, {
        originalPublicUrl,
        optimizedPublicUrl,
      });

      const reduction = getReductionPercent(
        originalBuffer.length,
        optimizedBuffer.length
      );

      totalOriginalBytes += originalBuffer.length;
      totalOptimizedBytes += optimizedBuffer.length;
      successCount += 1;

      console.log(
        `   Fertig: ${formatBytes(originalBuffer.length)} → ${formatBytes(
          optimizedBuffer.length
        )} (${reduction}% kleiner)`
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

  const totalReduction = getReductionPercent(totalOriginalBytes, totalOptimizedBytes);

  console.log("Zusammenfassung");
  console.log("===============");
  console.log(`Erfolgreich: ${successCount}`);
  console.log(`Übersprungen: ${skippedCount}`);
  console.log(`Fehler: ${errorCount}`);

  if (totalOriginalBytes > 0) {
    console.log(
      `Gesamtgröße: ${formatBytes(totalOriginalBytes)} → ${formatBytes(
        totalOptimizedBytes
      )} (${totalReduction}% kleiner)`
    );
  }

  console.log("");
}

main().catch((error) => {
  console.error("");
  console.error("Migrations-Abbruch:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});