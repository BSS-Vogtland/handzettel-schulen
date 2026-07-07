import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import AdminProductTableEditor, {
  type AdminProductTableRow,
} from "@/components/AdminProductTableEditor";
import {
  loadProductCategoryOptions,
  normalizeProductCategoryWithOptions,
} from "@/lib/productCategoryDatabase";

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

type AdminProductTablePageProps = {
  searchParams?: Promise<{
    q?: string | string[];
    page?: string | string[];
    pageSize?: string | string[];
  }>;
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

function getSearchParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

function getPositiveInteger(value: string | string[] | undefined, fallback: number) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(String(raw || "").replace(/[^\d]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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

function buildSearchOrFilter(searchQuery: string) {
  const safe = searchQuery
    .replace(/[,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!safe) return "";

  const like = "%" + safe + "%";

  return [
    "name.ilike." + like,
    "product_name.ilike." + like,
    "title.ilike." + like,
    "sku.ilike." + like,
    "product_sku.ilike." + like,
    "ean.ilike." + like,
    "category.ilike." + like,
    "product_type.ilike." + like,
    "format.ilike." + like,
    "color.ilike." + like,
    "lineature.ilike." + like,
  ].join(",");
}

function buildTableHref(params: {
  page: number;
  pageSize: number;
  searchQuery: string;
}) {
  const query = new URLSearchParams();

  if (params.searchQuery.trim()) {
    query.set("q", params.searchQuery.trim());
  }

  if (params.page > 1) {
    query.set("page", String(params.page));
  }

  if (params.pageSize !== 50) {
    query.set("pageSize", String(params.pageSize));
  }

  const queryString = query.toString();
  return queryString ? "/admin/produkte/tabelle?" + queryString : "/admin/produkte/tabelle";
}

async function loadVisibleProductAliases(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  productIds: string[]
) {
  if (productIds.length === 0) return [] as AliasRow[];

  const { data, error } = await supabase
    .from("school_product_aliases")
    .select("*")
    .in("product_id", productIds);

  if (error) {
    console.warn("Produkt-Aliase konnten fuer die Tabellenpflege nicht geladen werden:", error.message);
    return [] as AliasRow[];
  }

  return (data || []) as AliasRow[];
}

export default async function AdminProductTablePage({
  searchParams,
}: AdminProductTablePageProps) {
  const resolvedSearchParams = (await searchParams) || {};
  const searchQuery = getSearchParam(resolvedSearchParams.q);
  const pageSizeRaw = getPositiveInteger(resolvedSearchParams.pageSize, 50);
  const pageSize = Math.min(Math.max(pageSizeRaw, 25), 150);
  const page = Math.max(getPositiveInteger(resolvedSearchParams.page, 1), 1);
  const offset = (page - 1) * pageSize;
  const rangeTo = offset + pageSize - 1;

  const supabase = getSupabaseAdmin();
  const categoryOptions = await loadProductCategoryOptions(supabase, { activeOnly: true });

  let productsQuery = supabase
    .from("school_products")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, rangeTo);

  const searchFilter = buildSearchOrFilter(searchQuery);

  if (searchFilter) {
    productsQuery = productsQuery.or(searchFilter);
  }

  let { data: productsData, error: productsError, count } = await productsQuery;
  let searchFallbackUsed = false;

  if (productsError && searchFilter) {
    searchFallbackUsed = true;

    const fallback = await supabase
      .from("school_products")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, rangeTo);

    productsData = fallback.data;
    productsError = fallback.error;
    count = fallback.count;
  }

  if (productsError) {
    throw new Error("Produkte konnten nicht geladen werden: " + productsError.message);
  }

  const products = ((productsData || []) as ProductRow[]).sort((a, b) =>
    getProductName(a).localeCompare(getProductName(b), "de", {
      sensitivity: "base",
    })
  );

  const productIds = products.map((product) => cleanString(product.id)).filter(Boolean);
  const aliasesData = await loadVisibleProductAliases(supabase, productIds);

  const aliasesByProduct = new Map<string, string[]>();

  for (const alias of aliasesData) {
    const productId = cleanString(alias.product_id);
    const aliasText = getAliasText(alias);

    if (!productId || !aliasText) continue;

    const current = aliasesByProduct.get(productId) || [];
    current.push(aliasText);
    aliasesByProduct.set(productId, current);
  }

  const tableRows: AdminProductTableRow[] = products.map((product) => {
    const productId = cleanString(product.id);

    return {
      id: productId,
      active: product.active !== false && product.is_active !== false,
      productName: getProductName(product),
      productSku: getProductSku(product),
      ean: cleanString(product.ean),
      productPrice: formatPriceInput(getProductPrice(product)),
      category: normalizeProductCategoryWithOptions(product.category, categoryOptions),
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

  const totalCount = count || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const previousHref = buildTableHref({
    page: Math.max(1, page - 1),
    pageSize,
    searchQuery,
  });
  const nextHref = buildTableHref({
    page: page + 1,
    pageSize,
    searchQuery,
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
              Bearbeite Produktstammdaten direkt in einer Tabelle. Aus Performancegruenden
              werden nicht mehr alle Produkte gleichzeitig geladen.
            </p>
          </div>

          <div className="rounded-[24px] border border-[#E8DED2] bg-white px-5 py-4 text-sm font-black text-[#102A43] shadow-sm">
            {totalCount > 0 ? totalCount : tableRows.length} Produkte gesamt
          </div>
        </div>

        <section className="mb-4 rounded-[28px] border border-[#E8DED2] bg-white p-4 shadow-sm">
          <form
            action="/admin/produkte/tabelle"
            className="grid gap-3 lg:grid-cols-[1fr_170px_auto_auto] lg:items-end"
          >
            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                Datenbank-Suche
              </label>
              <input
                name="q"
                defaultValue={searchQuery}
                placeholder="Name, SKU, EAN, Kategorie, Typ, Format, Farbe ..."
                className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-bold text-[#102A43] outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                Pro Seite
              </label>
              <select
                name="pageSize"
                defaultValue={String(pageSize)}
                className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-bold text-[#102A43] outline-none transition focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
              >
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="150">150</option>
              </select>
            </div>

            <input type="hidden" name="page" value="1" />

            <button
              type="submit"
              className="min-h-12 rounded-2xl bg-[#12395F] px-5 text-sm font-black text-white shadow-sm transition hover:brightness-110"
            >
              Suchen / laden
            </button>

            <Link
              href="/admin/produkte/tabelle"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[#D8C8B8] bg-[#FBF7F0] px-5 text-sm font-black text-[#102A43] transition hover:border-[#B5282D]"
            >
              Zuruecksetzen
            </Link>
          </form>

          {searchFallbackUsed ? (
            <p className="mt-3 rounded-2xl border border-[#F4C7C7] bg-[#FFF1F1] px-4 py-3 text-sm font-bold text-[#B5282D]">
              Die Datenbank-Suche konnte nicht auf alle Spalten angewendet werden. Es wurde
              stattdessen die normale Seitenladung verwendet.
            </p>
          ) : null}

          <div className="mt-4 flex flex-col gap-3 text-sm font-bold text-[#52616F] sm:flex-row sm:items-center sm:justify-between">
            <p>
              Seite {page} von {totalPages}. Sichtbar: {tableRows.length} Produkte.
            </p>

            <div className="flex gap-2">
              <Link
                href={previousHref}
                aria-disabled={page <= 1}
                className={
                  "inline-flex min-h-10 items-center justify-center rounded-xl border px-4 text-xs font-black transition " +
                  (page <= 1
                    ? "pointer-events-none border-[#E8DED2] bg-[#FBF7F0] text-[#A0A0A0]"
                    : "border-[#D8C8B8] bg-white text-[#102A43] hover:border-[#B5282D]")
                }
              >
                Zurueck
              </Link>

              <Link
                href={nextHref}
                aria-disabled={page >= totalPages}
                className={
                  "inline-flex min-h-10 items-center justify-center rounded-xl border px-4 text-xs font-black transition " +
                  (page >= totalPages
                    ? "pointer-events-none border-[#E8DED2] bg-[#FBF7F0] text-[#A0A0A0]"
                    : "border-[#D8C8B8] bg-white text-[#102A43] hover:border-[#B5282D]")
                }
              >
                Weiter
              </Link>
            </div>
          </div>
        </section>

        <AdminProductTableEditor
          initialRows={tableRows}
          categoryOptions={categoryOptions}
        />
      </div>
    </main>
  );
}
