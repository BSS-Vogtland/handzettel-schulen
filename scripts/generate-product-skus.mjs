import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run") || !args.has("--apply");
const overwrite = args.has("--overwrite");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Fehlende Umgebungsvariablen: NEXT_PUBLIC_SUPABASE_URL und/oder SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/é/g, "e")
    .replace(/è/g, "e")
    .replace(/á/g, "a")
    .replace(/à/g, "a")
    .replace(/ó/g, "o")
    .replace(/ò/g, "o")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toSkuToken(value) {
  return normalizeText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function includesAny(text, words) {
  return words.some((word) => text.includes(word));
}

function getProductTypeCode(input) {
  const text = normalizeText([
    input.productName,
    input.category,
    input.productType,
    input.format,
    input.color,
    input.lineature,
  ].join(" "));

  if (includesAny(text, ["umschlag", "umschlaege", "heftumschlag", "buchumschlag"])) return "UMS";
  if (includesAny(text, ["schnellhefter", "hefter"])) return "SHF";
  if (includesAny(text, ["hausaufgabenheft", "zahlenlernheft", "lernheft", "schreibheft", "heft"])) return "HEF";
  if (includesAny(text, ["zeichenkarton", "zeichenpapier", "zeichenblock", "malblock", "collegeblock", "block"])) return "BLK";
  if (includesAny(text, ["wasserbecher", "becher"])) return "BCH";
  if (includesAny(text, ["klebestift", "textmarker", "permanentmarker", "marker", "filzstift", "buntstift", "bleistift", "stift"])) return "STF";
  if (includesAny(text, ["pinsel"])) return "PIN";
  if (includesAny(text, ["radiergummi", "radierer"])) return "RAD";
  if (includesAny(text, ["spitzer", "anspitzer"])) return "SPZ";
  if (includesAny(text, ["schere"])) return "SCH";
  if (includesAny(text, ["lineal"])) return "LIN";
  if (includesAny(text, ["zirkel"])) return "ZIR";
  if (includesAny(text, ["mappe", "sammelmappe", "eckspanner"])) return "MAP";
  if (includesAny(text, ["deckfarben", "farbkasten", "tuschkasten", "wasserfarbe"])) return "FAR";
  if (includesAny(text, ["buntpapier", "tonpapier", "papier"])) return "PAP";
  if (includesAny(text, ["knete", "knetmasse"])) return "KNT";
  if (includesAny(text, ["kleber", "leim"])) return "KLB";

  const categoryToken = toSkuToken(input.category).slice(0, 3);
  if (categoryToken.length >= 2) return categoryToken;

  return "ART";
}

function getFormatCode(value) {
  const text = normalizeText(value);

  if (!text) return null;

  if (/\ba3\b/.test(text)) return "A3";
  if (/\ba4\b/.test(text)) return "A4";
  if (/\ba5\b/.test(text) && includesAny(text, ["quer", "querformat"])) return "A5Q";
  if (/\ba5\b/.test(text)) return "A5";
  if (/\ba6\b/.test(text)) return "A6";

  const token = toSkuToken(value);
  return token ? token.slice(0, 8) : null;
}

function getLineatureCode(value) {
  const text = normalizeText(value);

  if (!text) return null;

  if (/\b8\s*f\b/.test(text) || /\b8f\b/.test(text)) return "L8F";

  const numberMatch = text.match(/\b(\d{1,2})\b/);
  if (!numberMatch) return null;

  return `L${numberMatch[1]}`;
}

function getColorCodes(value) {
  const text = normalizeText(value);

  if (!text) return [];

  const codes = [];

  if (includesAny(text, ["orange gelb blau gruen rosa"]) || text.includes(",") || includesAny(text, ["mehrfarbig", "farbmix", "sortiert"])) {
    codes.push("MIX");
    return codes;
  }

  if (includesAny(text, ["transparent", "klar", "durchsichtig", "clear"])) codes.push("KLAR");
  else if (includesAny(text, ["hellblau"])) codes.push("HELLBLAU");
  else if (includesAny(text, ["hellgruen"])) codes.push("HELLGRUEN");
  else if (includesAny(text, ["dunkelblau"])) codes.push("DUNKELBLAU");
  else if (includesAny(text, ["weiss", "white"])) codes.push("WEISS");
  else if (includesAny(text, ["schwarz", "black"])) codes.push("SCHWARZ");
  else if (includesAny(text, ["grau", "gray", "grey"])) codes.push("GRAU");
  else if (includesAny(text, ["braun"])) codes.push("BRAUN");
  else if (includesAny(text, ["blau"])) codes.push("BLAU");
  else if (includesAny(text, ["gruen"])) codes.push("GRUEN");
  else if (includesAny(text, ["rot"])) codes.push("ROT");
  else if (includesAny(text, ["gelb"])) codes.push("GELB");
  else if (includesAny(text, ["orange"])) codes.push("ORANGE");
  else if (includesAny(text, ["pink", "rosa"])) codes.push("PINK");
  else if (includesAny(text, ["lila", "violett"])) codes.push("LILA");

  if (includesAny(text, ["gedeckt"])) codes.push("G");
  if (includesAny(text, ["gemustert", "muster"])) codes.push("GM");

  return codes;
}

function buildProductSkuBase(input) {
  const typeCode = getProductTypeCode(input);
  const formatCode = getFormatCode(input.format);
  const lineatureCode = getLineatureCode(input.lineature);
  const colorCodes = getColorCodes(input.color);

  const parts = ["HS", typeCode];

  if (formatCode) parts.push(formatCode);

  if (typeCode === "HEF" && lineatureCode) {
    parts.push(lineatureCode);
  }

  for (const colorCode of colorCodes) {
    if (colorCode) parts.push(colorCode);
  }

  if (parts.length < 3) {
    const fallback = toSkuToken(input.productName).split("-").filter(Boolean).slice(0, 2);
    parts.push(...fallback);
  }

  return parts
    .map((part) => toSkuToken(part))
    .filter(Boolean)
    .join("-");
}

function makeUniqueSku(base, usedByBase) {
  const current = usedByBase.get(base) || 0;
  const next = current + 1;
  usedByBase.set(base, next);
  return `${base}-${String(next).padStart(3, "0")}`;
}

function getProductName(product) {
  return product.name || product.product_name || product.title || "Unbenanntes Produkt";
}

const { data, error } = await supabase
  .from("school_products")
  .select("*")
  .order("name", { ascending: true });

if (error) {
  console.error(`Produkte konnten nicht geladen werden: ${error.message}`);
  process.exit(1);
}

const products = data || [];
const usedByBase = new Map();
const changes = [];

for (const product of products) {
  const oldSku = String(product.sku || "").trim();

  if (oldSku && !overwrite) {
    continue;
  }

  const base = buildProductSkuBase({
    productName: getProductName(product),
    category: product.category,
    productType: product.product_type,
    format: product.format,
    color: product.color,
    lineature: product.lineature,
  });

  const newSku = makeUniqueSku(base || "HS-ART", usedByBase);

  if (oldSku !== newSku) {
    changes.push({
      id: product.id,
      name: getProductName(product),
      oldSku: oldSku || null,
      newSku,
    });
  }
}

console.log(`Produkte geladen: ${products.length}`);
console.log(`Geplante Änderungen: ${changes.length}`);
console.log(`Modus: ${dryRun ? "DRY RUN - keine Datenbankänderung" : "APPLY - Datenbank wird geändert"}`);
console.log(`Overwrite: ${overwrite ? "ja, bestehende Art.-Nr. werden überschrieben" : "nein, nur leere Art.-Nr."}`);
console.log("");

for (const change of changes.slice(0, 200)) {
  console.log(`${change.name}: ${change.oldSku || "—"} -> ${change.newSku}`);
}

if (changes.length > 200) {
  console.log(`... ${changes.length - 200} weitere Änderungen nicht angezeigt.`);
}

if (dryRun) {
  console.log("");
  console.log("Noch nichts geändert. Zum Schreiben ausführen:");
  console.log("node scripts/generate-product-skus.mjs --apply --overwrite");
  process.exit(0);
}

for (const change of changes) {
  const { error: updateError } = await supabase
    .from("school_products")
    .update({
      sku: change.newSku,
      updated_at: new Date().toISOString(),
    })
    .eq("id", change.id);

  if (updateError) {
    console.error(`Fehler bei ${change.name}: ${updateError.message}`);
    process.exitCode = 1;
  }
}

console.log("");
console.log("Fertig.");
