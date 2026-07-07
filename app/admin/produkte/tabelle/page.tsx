import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import AdminProductTableEditor, {
  type AdminProductTableRow,
} from "@/components/AdminProductTableEditor";
import { normalizeProductCategory } from "@/lib/productCategories";

export const dynamic = "force-dynamic";

type ProductRow = {
  id: string;
  name?: string | null;
  product_name?: string | null;
  title?: string | null;
  sku?: string | null;
  product_sku?: string | null;
  ean?: string | null;
  price?: number | string | null;
  product_price?: number | string | null;
  sale_price?: number | string | null;
  sale_price_gross?: number | string | null;
  category?: string | null;
  product_type?: string | null;
  format?: string | null;
  color?: string | null;
  lineature?: string | null;
  book_width_mm?: number | string | null;
  book_height_mm?: number | string | null;
  book_size_note?: string | null;
  image_url?: string | null;
  image_original_url?: string | null;
  image_styled_url?: string | null;
  product_image_url?: string | null;
  image?: string | null;
  photo_url?: string | null;
  picture_url?: string | null;
  active?: boolean | null;
  is_active?: boolean | null;
  stock_quantity?: number | string | null;
  storage_location?: string | null;
  supplier_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type AliasRow = {
  id?: string;
  product_id?: string | null;
  alias?: string | null;
  alias_text?: string | null;
  alias_name?: string | null;
  name?: string | null;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase Umgebungsvariablen fehlen. Pruefe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function cleanString(value: unknown) {
  const cleaned = String(value || "").trim();
  return cleaned.length > 0 ? cleaned : "";
}

function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getProductName(product: ProductRow) {
  return (
    cleanString(product.name) ||
    cleanString(product.product_name) ||
    cleanString(product.title) ||
    "Unbenanntes Produkt"
  );
}

function getProductSku(product: ProductRow) {
  return cleanString(product.sku) || cleanString(product.product_sku);
}

function getProductPrice(product: ProductRow) {
  return (
    product.price ??
    product.product_price ??
    product.sale_price_gross ??
    product.sale_price ??
    0
  );
}

function formatPriceInput(value: unknown) {
  const numberValue = toNumber(value, 0);
  if (!numberValue) return "";
  return String(numberValue).replace(".", ",");
}

function getImageUrl(product: ProductRow) {
  return (
    cleanString(product.image_styled_url) ||
    cleanString(product.image_url) ||
    cleanString(product.image_original_url) ||
    cleanString(product.product_image_url) ||
    cleanString(product.image) ||
    cleanString(product.photo_url) ||
    cleanString(product.picture_url)
  );
}

function getAliasText(alias: AliasRow) {
  return (
    cleanString(alias.alias) ||
    cleanString(alias.alias_text) ||
    cleanString(alias.alias_name) ||
    cleanString(alias.name)
  );
}

function toInputValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

export default async function AdminProductTablePage() {
  const supabase = getSupabaseAdmin();

  const { data: productsData, error: productsError } = await supabase
    .from("school_products")
    .select("*");

  if (productsError) {
    throw new Error("Produkte konnten nicht geladen werden: " + productsError.message);
  }

  const { data: aliasesData } = await supabase
    .from("school_product_aliases")
    .select("*");

  const aliasesByProduct = new Map<string, string[]>();

  for (const alias of ((aliasesData || []) as AliasRow[])) {
    const productId = cleanString(alias.product_id);
    const aliasText = getAliasText(alias);

    if (!productId || !aliasText) continue;

    const current = aliasesByProduct.get(productId) || [];
    current.push(aliasText);
    aliasesByProduct.set(productId, current);
  }

  const products = ((productsData || []) as ProductRow[]).sort((a, b) =>
    getProductName(a).localeCompare(getProductName(b), "de", {
      sensitivity: "base",
    })
  );

  const tableRows: AdminProductTableRow[] = products.map((product) => {
    const productId = cleanString(product.id);

    return {
      id: productId,
      active: product.active !== false && product.is_active !== false,
      productName: getProductName(product),
      productSku: getProductSku(product),
      ean: cleanString(product.ean),
      productPrice: formatPriceInput(getProductPrice(product)),
      category: normalizeProductCategory(product.category),
      productType: cleanString(product.product_type),
      format: cleanString(product.format),
      color: cleanString(product.color),
      lineature: cleanString(product.lineature),
      bookWidthMm: toInputValue(product.book_width_mm),
      bookHeightMm: toInputValue(product.book_height_mm),
      bookSizeNote: cleanString(product.book_size_note),
      imageUrl: getImageUrl(product),
      stockQuantity: toInputValue(product.stock_quantity),
      storageLocation: cleanString(product.storage_location),
      supplierName: cleanString(product.supplier_name),
      aliases: (aliasesByProduct.get(productId) || []).join("\n"),
      createdAt: product.created_at || null,
      updatedAt: product.updated_at || null,
    };
  });

  return (
    <main className="min-h-screen bg-[#F7F1E8] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1900px]">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link
              href="/admin/produkte"
              className="inline-flex rounded-full border border-[#D8C8B8] bg-white px-4 py-2 text-sm font-black text-[#102A43] transition hover:border-[#B5282D]"
            >
              Zurueck zur Produktverwaltung
            </Link>

            <h1 className="mt-4 text-3xl font-black tracking-tight text-[#102A43]">
              Produktdaten-Tabelle
            </h1>

            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
              Bearbeite Produktstammdaten direkt in einer Tabelle. Kategorie, Typ,
              Format, Farbe und Lineatur werden fuer Matching und Suche mitgespeichert.
            </p>
          </div>

          <div className="rounded-[24px] border border-[#E8DED2] bg-white px-5 py-4 text-sm font-black text-[#102A43] shadow-sm">
            {tableRows.length} Produkte
          </div>
        </div>

        <AdminProductTableEditor initialRows={tableRows} />
      </div>
    </main>
  );
}
