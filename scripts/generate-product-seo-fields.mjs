import dotenv from "dotenv";

dotenv.config({
  path: ".env.local",
});

import process from "node:process";
import { createClient } from "@supabase/supabase-js";

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

function normalizeGermanText(value) {
  return String(value ?? "")
    .trim()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss");
}

function cleanText(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function slugifyProductText(value) {
  return normalizeGermanText(value)
    .toLowerCase()
    .replace(/&/g, " und ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

function uniqueList(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const cleaned = cleanText(value);

    if (!cleaned) continue;

    const key = cleaned.toLowerCase();

    if (seen.has(key)) continue;

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function limitText(value, maxLength) {
  const cleaned = cleanText(value);

  if (cleaned.length <= maxLength) return cleaned;

  return cleaned.slice(0, maxLength - 1).trimEnd() + "…";
}

function getProductName(product) {
  return (
    product.name ||
    product.product_name ||
    product.title ||
    product.display_name ||
    "Schulmaterial"
  );
}

function getProductSku(product) {
  return product.sku || product.product_sku || null;
}

function getProductPrice(product) {
  return (
    product.price ||
    product.product_price ||
    product.sale_price_gross ||
    product.sale_price ||
    null
  );
}

function buildDetails(product) {
  const details = [];

  if (product.format) details.push(String(product.format).toUpperCase());
  if (product.color) details.push(cleanText(product.color));

  if (product.lineature) {
    details.push(`Lineatur ${cleanText(product.lineature)}`);
  }

  const width = cleanText(product.book_width_mm);
  const height = cleanText(product.book_height_mm);

  if (width && height) {
    details.push(`${width} x ${height} mm`);
  }

  if (product.book_size_note) {
    details.push(cleanText(product.book_size_note));
  }

  return uniqueList(details);
}

function inferUseCase(product) {
  const text = [
    getProductName(product),
    product.category,
    product.product_type,
    product.format,
    product.color,
    product.lineature,
  ]
    .join(" ")
    .toLowerCase();

  if (text.includes("heft")) return "für Schule, Unterricht und Schulmateriallisten";
  if (text.includes("umschlag")) return "für Hefte, Bücher und Schulmateriallisten";
  if (text.includes("schnellhefter")) return "für Schule, Fächer und Unterlagen";
  if (text.includes("mappe")) return "für Kunst, Schule und Unterlagen";
  if (text.includes("stift")) return "für Federtasche, Schule und Unterricht";
  if (text.includes("spitzer")) return "für Federtasche, Schule und Schreibtisch";
  if (text.includes("radier")) return "für Federtasche, Schule und Schreibbedarf";
  if (text.includes("kleber")) return "für Basteln, Schule und Unterricht";
  if (text.includes("schere")) return "für Basteln, Schule und Unterricht";
  if (text.includes("block")) return "für Schule, Unterricht und Notizen";
  if (text.includes("papier")) return "für Kunst, Basteln und Schule";

  return "für Schule, Unterricht und Schulmateriallisten";
}

function generateProductSeoFields(product, slug) {
  const productName = cleanText(getProductName(product)) || "Schulmaterial";
  const category = cleanText(product.category) || "Schulmaterial";
  const productType = cleanText(product.product_type);
  const details = buildDetails(product);
  const detailText = details.length > 0 ? ` ${details.join(" ")}` : "";
  const readableName = cleanText(`${productName}${detailText}`);
  const useCase = inferUseCase(product);

  const seoTitle = limitText(
    `${readableName} online finden | Handzettel-Schulen.de`,
    68
  );

  const seoDescription = limitText(
    `${readableName} ${useCase}. Schnell finden, vormerken und bequem im Schulmaterial-Shop von Handzettel-Schulen.de nachkaufen.`,
    155
  );

  const keywordCandidates = [
    productName,
    readableName,
    category,
    productType,
    product.format ? `${productName} ${product.format}` : "",
    product.color ? `${productName} ${product.color}` : "",
    product.lineature ? `${productName} Lineatur ${product.lineature}` : "",
    "Schulmaterial",
    "Schulbedarf",
    "Schulmaterialliste",
    "Handzettel-Schulen.de",
  ];

  const seoKeywords = uniqueList(
    keywordCandidates
      .map((value) => cleanText(value))
      .filter((value) => value.length >= 2)
  ).slice(0, 12);

  const imageAltText = limitText(
    `${readableName} als Schulmaterial für Schule und Unterricht`,
    125
  );

  const imageTitleText = limitText(
    `${readableName} – Handzettel-Schulen.de`,
    90
  );

  return {
    seo_slug: slug,
    seo_title: seoTitle,
    seo_description: seoDescription,
    seo_keywords: seoKeywords,
    image_alt_text: imageAltText,
    image_title_text: imageTitleText,
    seo_updated_at: new Date().toISOString(),
  };
}

function shouldProcessProduct(product, force) {
  if (!product?.id) return false;

  if (force) return true;

  return (
    !product.seo_slug ||
    !product.seo_title ||
    !product.seo_description ||
    !product.image_alt_text ||
    !product.image_title_text
  );
}

function makeSlugBase(product) {
  const productName = cleanText(getProductName(product));
  const details = buildDetails(product);
  const readableName = cleanText(
    [productName, ...details].filter(Boolean).join(" ")
  );

  return slugifyProductText(readableName || productName || product.id) || product.id;
}

function createUniqueSlug(product, usedSlugs) {
  const baseSlug = makeSlugBase(product);
  let candidate = baseSlug;
  let counter = 2;

  while (usedSlugs.has(candidate)) {
    candidate = `${baseSlug}-${counter}`;
    counter += 1;
  }

  usedSlugs.add(candidate);

  return candidate;
}

async function loadProducts(supabase) {
  const { data, error } = await supabase
    .from("school_products")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(3000);

  if (error) {
    throw new Error(`Produkte konnten nicht geladen werden: ${error.message}`);
  }

  return data || [];
}

async function main() {
  console.log("");
  console.log("SEO-Felder für Produkte erzeugen");
  console.log("================================");
  console.log("");

  const dryRun = hasFlag("--dry-run");
  const force = hasFlag("--force");
  const all = hasFlag("--all");
  const limitArg = Number(getArg("--limit", "20"));
  const limit =
    Number.isFinite(limitArg) && limitArg > 0 ? Math.floor(limitArg) : 20;

  console.log(`Modus: ${dryRun ? "Dry Run, keine Speicherung" : "Speichern aktiv"}`);
  console.log(`Umfang: ${all ? "alle passenden Produkte" : `maximal ${limit} Produkte`}`);
  console.log(`Force: ${force ? "ja, vorhandene SEO-Daten überschreiben" : "nein"}`);
  console.log("");

  const supabase = getSupabaseAdmin();
  const allProducts = await loadProducts(supabase);

  const usedSlugs = new Set(
    allProducts
      .map((product) => cleanText(product.seo_slug))
      .filter(Boolean)
  );

  const productsToProcess = allProducts
    .filter((product) => shouldProcessProduct(product, force))
    .slice(0, all ? allProducts.length : limit);

  if (productsToProcess.length === 0) {
    console.log("Keine passenden Produkte ohne SEO-Daten gefunden.");
    console.log("");
    return;
  }

  console.log(`Zu verarbeitende Produkte: ${productsToProcess.length}`);
  console.log("");

  let successCount = 0;
  let errorCount = 0;

  for (const [index, product] of productsToProcess.entries()) {
    const productName = getProductName(product);
    const oldSlug = cleanText(product.seo_slug);

    if (oldSlug) {
      usedSlugs.delete(oldSlug);
    }

    const slug = oldSlug && !force ? oldSlug : createUniqueSlug(product, usedSlugs);

    if (oldSlug && !usedSlugs.has(oldSlug)) {
      usedSlugs.add(oldSlug);
    }

    const seoFields = generateProductSeoFields(product, slug);

    console.log(`[${index + 1}/${productsToProcess.length}] ${productName}`);
    console.log(`   Slug: ${seoFields.seo_slug}`);
    console.log(`   Title: ${seoFields.seo_title}`);
    console.log(`   Alt: ${seoFields.image_alt_text}`);

    if (dryRun) {
      successCount += 1;
      console.log("   Dry Run erfolgreich.");
      console.log("");
      continue;
    }

    const payload = {
      ...seoFields,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("school_products")
      .update(payload)
      .eq("id", product.id);

    if (error) {
      errorCount += 1;
      console.error(`   Fehler: ${error.message}`);
      console.log("");
      continue;
    }

    successCount += 1;
    console.log("   SEO gespeichert.");
    console.log("");
  }

  console.log("Zusammenfassung");
  console.log("===============");
  console.log(`Erfolgreich: ${successCount}`);
  console.log(`Fehler: ${errorCount}`);
  console.log("");
}

main().catch((error) => {
  console.error("");
  console.error("SEO-Script abgebrochen:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});