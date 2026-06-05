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

function normalizeForCompare(value) {
  return normalizeGermanText(value)
    .toLowerCase()
    .replace(/&/g, " und ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

    const key = normalizeForCompare(cleaned);

    if (!key || seen.has(key)) continue;

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

function containsToken(text, token) {
  const normalizedText = normalizeForCompare(text);
  const normalizedToken = normalizeForCompare(token);

  if (!normalizedText || !normalizedToken) return false;

  return ` ${normalizedText} `.includes(` ${normalizedToken} `);
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

function productNameAlreadyContainsValue(productName, value) {
  const cleanedValue = cleanText(value);

  if (!cleanedValue) return true;

  return containsToken(productName, cleanedValue);
}

function normalizeDetailValue(value) {
  const cleaned = cleanText(value);

  if (!cleaned) return "";

  if (/^a\d(\s*(hoch|querformat|quer))?$/i.test(cleaned)) {
    return cleaned
      .replace(/^a/i, "A")
      .replace(/\s+/g, " ")
      .replace(/hoch/i, "Hochformat")
      .replace(/querformat/i, "Querformat")
      .replace(/quer/i, "Querformat");
  }

  const amountMatch = cleaned.match(/^(\d+(?:[,.]\d+)?)\s*(g|kg|ml|l|mm|cm|m)$/i);
  if (amountMatch) {
    return `${amountMatch[1].replace(",", ".")} ${amountMatch[2].toLowerCase()}`;
  }

  if (/^box$/i.test(cleaned)) return "Box";
  if (/^set$/i.test(cleaned)) return "Set";

  return cleaned;
}

function shouldUseLineature(product, lineature) {
  if (!lineature) return false;

  const normalizedLineature = normalizeForCompare(lineature);
  const text = normalizeForCompare(
    [
      getProductName(product),
      product.category,
      product.product_type,
    ].join(" ")
  );

  const isHeftLike =
    text.includes("heft") ||
    text.includes("schreibheft") ||
    text.includes("lernheft") ||
    text.includes("muttiheft");

  if (!isHeftLike) {
    return false;
  }

  return (
    /^\d+[a-z]?$/.test(normalizedLineature) ||
    normalizedLineature === "dm" ||
    normalizedLineature === "liniert" ||
    normalizedLineature === "kariert" ||
    normalizedLineature.includes("lineatur")
  );
}

function isProductActive(product) {
  if (!product) return false;

  if (product.active === false) return false;

  const status = cleanText(product.status || product.product_status).toLowerCase();
  if (["inactive", "archived", "deleted", "disabled"].includes(status)) {
    return false;
  }

  return true;
}

function normalizeLineature(value) {
  return cleanText(value)
    .replace(/^lineatur\s*/i, "")
    .replace(/^lin\.\s*/i, "")
    .replace(/^lin\s*/i, "")
    .replace(/^l\s*/i, "")
    .trim();
}

function productNameAlreadyContainsLineature(productName, value) {
  const lineature = normalizeLineature(value);

  if (!lineature) return true;

  const normalizedName = normalizeForCompare(productName);
  const normalizedLineature = normalizeForCompare(lineature);

  if (!normalizedName || !normalizedLineature) return false;

  return (
    normalizedName.includes(`lineatur ${normalizedLineature}`) ||
    normalizedName.includes(`lin ${normalizedLineature}`) ||
    normalizedName.includes(`l ${normalizedLineature}`)
  );
}

function productNameAlreadyContainsBookMeasure(productName, width, height) {
  const cleanedWidth = cleanText(width);
  const cleanedHeight = cleanText(height);

  if (!cleanedWidth || !cleanedHeight) return true;

  const normalizedName = normalizeForCompare(productName);

  return normalizedName.includes(`${cleanedWidth} ${cleanedHeight}`);
}

function buildDetails(product) {
  const productName = cleanText(getProductName(product));
  const details = [];

  const format = normalizeDetailValue(product.format);
  const color = normalizeDetailValue(product.color);
  const lineature = normalizeLineature(product.lineature);

  if (format && !productNameAlreadyContainsValue(productName, format)) {
    details.push(format);
  }

  if (color && !productNameAlreadyContainsValue(productName, color)) {
    details.push(color);
  }

  if (
    shouldUseLineature(product, lineature) &&
    !productNameAlreadyContainsLineature(productName, lineature)
  ) {
    details.push(`Lineatur ${lineature}`);
  }

  const width = cleanText(product.book_width_mm);
  const height = cleanText(product.book_height_mm);

  if (
    width &&
    height &&
    !productNameAlreadyContainsBookMeasure(productName, width, height)
  ) {
    details.push(`${width} x ${height} mm`);
  }

  const note = cleanText(product.book_size_note);

  if (note && !normalizeForCompare(productName).includes(normalizeForCompare(note))) {
    details.push(note);
  }

  return uniqueList(details);
}

function buildReadableProductSeoName(product) {
  const productName = cleanText(getProductName(product)) || "Schulmaterial";
  const details = buildDetails(product);
  const detailText = details.length > 0 ? ` ${details.join(" ")}` : "";

  return cleanText(`${productName}${detailText}`);
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
  const readableName = buildReadableProductSeoName(product);
  const category = cleanText(product.category) || "Schulmaterial";
  const productType = cleanText(product.product_type);
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
    product.format ? `${productName} ${normalizeDetailValue(product.format)}` : "",
    product.color ? `${productName} ${normalizeDetailValue(product.color)}` : "",
    shouldUseLineature(product, normalizeLineature(product.lineature))
      ? `${productName} Lineatur ${normalizeLineature(product.lineature)}`
      : "",
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
  const readableName = buildReadableProductSeoName(product);

  return (
    slugifyProductText(readableName || getProductName(product) || product.id) ||
    product.id
  );
}

async function createUniqueSlug(supabase, product, usedSlugs) {
  const baseSlug = makeSlugBase(product) || `produkt-${String(product.id).slice(0, 8)}`;

  let candidate = baseSlug;
  let counter = 2;

  while (counter < 300) {
    if (!usedSlugs.has(candidate)) {
      const { data, error } = await supabase
        .from("school_products")
        .select("id")
        .eq("seo_slug", candidate)
        .neq("id", product.id)
        .limit(1);

      if (error || !data || data.length === 0) {
        usedSlugs.add(candidate);
        return candidate;
      }
    }

    candidate = `${baseSlug}-${counter}`;
    counter += 1;
  }

  const fallback = `${baseSlug}-${String(product.id).slice(0, 8)}`;
  usedSlugs.add(fallback);
  return fallback;
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
  const includeInactive = hasFlag("--include-inactive");
  const limitArg = Number(getArg("--limit", "20"));
  const limit =
    Number.isFinite(limitArg) && limitArg > 0 ? Math.floor(limitArg) : 20;

  console.log(`Modus: ${dryRun ? "Dry Run, keine Speicherung" : "Speichern aktiv"}`);
  console.log(`Umfang: ${all ? "alle passenden Produkte" : `maximal ${limit} Produkte`}`);
  console.log(`Force: ${force ? "ja, vorhandene SEO-Daten überschreiben" : "nein"}`);
  console.log(`Inaktive Produkte: ${includeInactive ? "werden mit verarbeitet" : "werden übersprungen"}`);
  console.log("");

  const supabase = getSupabaseAdmin();
  const allProducts = await loadProducts(supabase);

  const productsToProcess = allProducts
    .filter((product) => includeInactive || isProductActive(product))
    .filter((product) => shouldProcessProduct(product, force))
    .slice(0, all ? allProducts.length : limit);

  if (productsToProcess.length === 0) {
    console.log("Keine passenden Produkte ohne SEO-Daten gefunden.");
    console.log("");
    return;
  }

  console.log(`Zu verarbeitende Produkte: ${productsToProcess.length}`);
  console.log("");

  const usedSlugs = new Set();
  let successCount = 0;
  let errorCount = 0;

  for (const [index, product] of productsToProcess.entries()) {
    const productName = getProductName(product);
    const existingSlug = cleanText(product.seo_slug);
    const slug =
      existingSlug && !force
        ? existingSlug
        : await createUniqueSlug(supabase, product, usedSlugs);

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