import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({
  path: ".env.local",
});

const PRODUCT_IMAGE_BUCKET = "school-product-images";

const PRODUCT_IDS_TO_DELETE = [
  "13ec40cd-2aa3-43b1-85d3-613e94608fc0", // Test
  "91b706b6-71c1-45dd-8765-1a8b900ff648", // Test 2
];

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
  return product.name || product.product_name || product.title || product.id;
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

async function safeDeleteFromTable(supabase, tableName, columnName, values) {
  if (!values.length) return;

  const { error } = await supabase
    .from(tableName)
    .delete()
    .in(columnName, values);

  if (error) {
    console.log(
      `   Hinweis: ${tableName}.${columnName} konnte nicht gelöscht werden: ${error.message}`
    );
    return;
  }

  console.log(`   Bereinigt: ${tableName}`);
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  const supabase = getSupabaseAdmin();

  console.log("");
  console.log("Testprodukte sauber löschen");
  console.log("===========================");
  console.log(`Modus: ${dryRun ? "Dry Run, keine Löschung" : "Löschen aktiv"}`);
  console.log("");

  const { data: products, error } = await supabase
    .from("school_products")
    .select("*")
    .in("id", PRODUCT_IDS_TO_DELETE);

  if (error) {
    throw new Error(`Produkte konnten nicht geladen werden: ${error.message}`);
  }

  if (!products || products.length === 0) {
    console.log("Keine passenden Testprodukte gefunden.");
    return;
  }

  console.log(`Gefundene Produkte: ${products.length}`);

  for (const product of products) {
    console.log(`- ${getProductName(product)} (${product.id})`);
  }

  const storagePaths = [];

  for (const product of products) {
    for (const key of ["image_url", "image_original_url", "image_styled_url"]) {
      const storagePath = parseStoragePathFromPublicUrl(product[key]);

      if (storagePath) {
        storagePaths.push(storagePath);
      }
    }
  }

  const uniqueStoragePaths = Array.from(new Set(storagePaths));

  console.log("");
  console.log(`Zu löschende Storage-Dateien: ${uniqueStoragePaths.length}`);

  for (const storagePath of uniqueStoragePaths) {
    console.log(`- ${storagePath}`);
  }

  if (dryRun) {
    console.log("");
    console.log("Dry Run beendet. Es wurde nichts gelöscht.");
    return;
  }

  console.log("");
  console.log("Lösche Storage-Dateien ...");

  if (uniqueStoragePaths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from(PRODUCT_IMAGE_BUCKET)
      .remove(uniqueStoragePaths);

    if (storageError) {
      console.log(
        `   Hinweis: Storage-Dateien konnten nicht vollständig gelöscht werden: ${storageError.message}`
      );
    } else {
      console.log("   Storage-Dateien gelöscht.");
    }
  }

  console.log("");
  console.log("Bereinige Datenbank-Referenzen ...");

  await safeDeleteFromTable(
    supabase,
    "school_product_aliases",
    "product_id",
    PRODUCT_IDS_TO_DELETE
  );

  await safeDeleteFromTable(
    supabase,
    "school_request_matches",
    "product_id",
    PRODUCT_IDS_TO_DELETE
  );

  await safeDeleteFromTable(
    supabase,
    "school_offer_items",
    "product_id",
    PRODUCT_IDS_TO_DELETE
  );

  console.log("");
  console.log("Lösche Produktzeilen ...");

  const { error: deleteProductsError } = await supabase
    .from("school_products")
    .delete()
    .in("id", PRODUCT_IDS_TO_DELETE);

  if (deleteProductsError) {
    throw new Error(
      `Produkte konnten nicht gelöscht werden: ${deleteProductsError.message}`
    );
  }

  console.log("Fertig. Testprodukte wurden sauber gelöscht.");
  console.log("");
}

main().catch((error) => {
  console.error("");
  console.error("Löschvorgang abgebrochen:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});