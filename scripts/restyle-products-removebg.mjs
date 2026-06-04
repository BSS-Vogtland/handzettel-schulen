import dotenv from "dotenv";

dotenv.config({
  path: ".env.local",
});

import process from "node:process";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

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

function cleanString(value) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function getProductName(product) {
  return cleanString(product.name) || "Unbenanntes Produkt";
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

function isFlatProduct(productName) {
  const normalized = normalizeText(productName);

  return FLAT_PRODUCT_KEYWORDS.some((keyword) =>
    normalized.includes(normalizeText(keyword))
  );
}

function runWorker(productId) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["scripts/restyle-products-removebg-worker.mjs", `--id=${productId}`],
      {
        cwd: process.cwd(),
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on("error", (error) => {
      resolve({
        ok: false,
        code: null,
        signal: null,
        stdout,
        stderr: error.message,
      });
    });

    child.on("close", (code, signal) => {
      resolve({
        ok: code === 0,
        code,
        signal,
        stdout,
        stderr,
      });
    });
  });
}

async function loadProducts(supabase, options) {
  let query = supabase
    .from("school_products")
    .select(
      "id,name,image_url,image_original_url,image_styled_url,image_styled_at,updated_at,created_at"
    )
    .not("image_original_url", "is", null);

  if (!options.force) {
    query = query.is("image_styled_url", null);
  }

  const { data, error } = await query.limit(1000);

  if (error) {
    throw new Error(`Produkte konnten nicht geladen werden: ${error.message}`);
  }

  let products = data || [];

  if (options.id) {
    products = products.filter((product) => product.id === options.id);
  }

  if (options.flatOnly) {
    products = products.filter((product) =>
      isFlatProduct(getProductName(product))
    );
  }

  if (options.search) {
    const normalizedSearch = normalizeText(options.search);
    products = products.filter((product) =>
      normalizeText(getProductName(product)).includes(normalizedSearch)
    );
  }

  products = products.sort((a, b) => {
    const nameA = getProductName(a).localeCompare(getProductName(b), "de", {
      sensitivity: "base",
    });

    if (nameA !== 0) return nameA;

    return String(a.id || "").localeCompare(String(b.id || ""));
  });

  const start = Math.max(0, options.offset);
  const end = start + options.limit;

  return products.slice(start, end);
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  const force = hasFlag("--force");
  const flatOnly = hasFlag("--flat-only");
  const id = getArg("--id", null);
  const search = getArg("--search", null);

  const limitArg = Number(getArg("--limit", "5"));
  const limit =
    Number.isFinite(limitArg) && limitArg > 0 ? Math.floor(limitArg) : 5;

  const offsetArg = Number(getArg("--offset", "0"));
  const offset =
    Number.isFinite(offsetArg) && offsetArg >= 0 ? Math.floor(offsetArg) : 0;

  console.log("");
  console.log("remove.bg Produktbild-Freistellung");
  console.log("==================================");
  console.log("");
  console.log(`Modus: ${dryRun ? "Dry Run" : "Speichern aktiv"}`);
  console.log(`Limit: ${limit}`);
  console.log(`Offset: ${offset}`);
  console.log(`Force: ${force ? "ja" : "nein"}`);
  console.log(`Flat only: ${flatOnly ? "ja" : "nein"}`);
  console.log(`ID: ${id || "—"}`);
  console.log(`Suche: ${search || "—"}`);
  console.log("");

  const supabase = getSupabaseAdmin();

  const products = await loadProducts(supabase, {
    dryRun,
    force,
    flatOnly,
    id,
    search,
    limit,
    offset,
  });

  if (products.length === 0) {
    console.log("Keine passenden Produkte gefunden.");
    console.log("");
    return;
  }

  console.log(`Zu verarbeitende Produkte: ${products.length}`);
  console.log("");

  let successCount = 0;
  let errorCount = 0;

  for (const [index, product] of products.entries()) {
    const productName = getProductName(product);

    console.log("------------------------------------------------------------");
    console.log(`[${index + 1}/${products.length}] ${productName}`);
    console.log(`ID: ${product.id}`);
    console.log(`Original vorhanden: ${product.image_original_url ? "ja" : "nein"}`);
    console.log(`Styled vorhanden: ${product.image_styled_url ? "ja" : "nein"}`);

    if (dryRun) {
      console.log("Dry Run: keine Verarbeitung.");
      successCount += 1;
      continue;
    }

    const result = await runWorker(product.id);

    if (result.ok) {
      successCount += 1;
      console.log("Ergebnis: OK");
    } else {
      errorCount += 1;
      console.log("Ergebnis: FEHLER");
      console.log(`Exit-Code: ${result.code ?? "—"}`);
      console.log(`Signal: ${result.signal ?? "—"}`);
    }

    console.log("");
  }

  console.log("============================================================");
  console.log("Zusammenfassung");
  console.log("============================================================");
  console.log(`Erfolgreich: ${successCount}`);
  console.log(`Fehler: ${errorCount}`);
  console.log("");
}

main().catch((error) => {
  console.error("");
  console.error("Batch-Abbruch:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});