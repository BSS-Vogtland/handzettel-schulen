"use client";

import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import {
  type ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addShopCartItem,
  formatShopPrice,
  getShopCartCount,
  readShopCart,
} from "./_lib/shopCart";

type ProductRow = Record<string, unknown> & {
  id?: string | number | null;
};

type ProductAliasRow = Record<string, unknown> & {
  id?: string | number | null;
  product_id?: string | number | null;
};

type ShopProductRow = ProductRow & {
  __shopAliases: string[];
  __shopSearchText: string;
  __shopIdentifiers: string[];
};

type AddToCartFeedback = {
  productId: string;
  productName: string;
  mode: "added" | "increased";
  cartCount: number;
};

const PRODUCT_PAGE_SIZE = 500;
const ALIAS_PAGE_SIZE = 1000;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

function getStringValue(
  row: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function getNumberValue(
  row: Record<string, unknown>,
  keys: readonly string[],
): number {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const normalized = value.replace(",", ".").replace(/[^\d.-]/g, "");
      const parsed = Number(normalized);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
}

function getTextValues(
  row: Record<string, unknown>,
  keys: readonly string[],
) {
  const values: string[] = [];

  for (const key of keys) {
    const value = row[key];

    if (typeof value === "string" && value.trim()) {
      values.push(value.trim());
      continue;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      values.push(String(value));
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string" && entry.trim()) {
          values.push(entry.trim());
        } else if (typeof entry === "number" && Number.isFinite(entry)) {
          values.push(String(entry));
        }
      }
    }
  }

  return values;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

function normalizeSearchText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeIdentifier(value: unknown) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");
}

function getIdentifierSearchCandidates(value: unknown) {
  const compact = normalizeIdentifier(value);

  if (!compact) {
    return [];
  }

  const withoutLabel = compact.replace(
    /^(?:ISBN13|ISBN10|ISBN|EAN|GTIN|ARTIKELNUMMER|ARTIKELNR|ARTNR)/,
    "",
  );

  return Array.from(
    new Set(
      [compact, withoutLabel].filter((candidate) => candidate.length >= 3),
    ),
  );
}

function getProductId(product: ProductRow): string {
  const rawId = product.id ?? getStringValue(product, ["product_id", "uuid"]);

  return rawId ? String(rawId) : "";
}

function getProductName(product: ProductRow): string {
  return (
    getStringValue(product, [
      "name",
      "product_name",
      "title",
      "display_name",
      "label",
    ]) || "Unbenanntes Produkt"
  );
}

function getProductSku(product: ProductRow): string | null {
  return getStringValue(product, [
    "sku",
    "product_sku",
    "article_number",
    "item_number",
    "artikelnummer",
  ]);
}

function getProductPrice(product: ProductRow): number {
  return getNumberValue(product, [
    "price",
    "gross_price",
    "product_price",
    "unit_price",
    "sale_price_gross",
    "sale_price",
    "brutto_preis",
  ]);
}

function getProductCategory(product: ProductRow): string | null {
  return getStringValue(product, [
    "category",
    "product_category",
    "product_type",
    "type",
  ]);
}

function getProductImageUrl(product: ProductRow): string | null {
  return getStringValue(product, [
    "image_styled_url",
    "styled_image_url",
    "image_url",
    "product_image_url",
    "image",
    "photo_url",
    "picture_url",
  ]);
}

function getProductImageAlt(product: ProductRow, fallbackName: string): string {
  return (
    getStringValue(product, [
      "image_alt_text",
      "image_alt",
      "alt_text",
      "seo_image_alt",
    ]) || `${fallbackName} als Produktbild`
  );
}

function getProductImageTitle(
  product: ProductRow,
  fallbackName: string,
): string {
  return (
    getStringValue(product, [
      "image_title_text",
      "image_title",
      "title_text",
      "seo_image_title",
    ]) || `${fallbackName} – Handzettel-Schulen.de`
  );
}

function getProductFormat(product: ProductRow): string | null {
  return getStringValue(product, ["format", "size", "product_format"]);
}

function getProductColor(product: ProductRow): string | null {
  return getStringValue(product, ["color", "colour", "farbe"]);
}

function getProductLineature(product: ProductRow): string | null {
  return getStringValue(product, ["lineature", "lineatur", "ruling"]);
}

function getProductStatus(product: ProductRow): string | null {
  return getStringValue(product, ["status", "product_status"]);
}

function getProductEan(product: ProductRow): string | null {
  return getStringValue(product, ["ean", "gtin", "barcode"]);
}

function getProductIsbn10(product: ProductRow): string | null {
  return getStringValue(product, ["book_isbn10", "isbn10", "isbn_10"]);
}

function getProductIsbn13(product: ProductRow): string | null {
  return getStringValue(product, [
    "book_isbn13",
    "isbn13",
    "isbn_13",
    "isbn",
  ]);
}

function getProductPublisher(product: ProductRow): string | null {
  return getStringValue(product, [
    "publisher",
    "book_publisher",
    "book_publisher_name",
    "publisher_name",
    "verlag",
    "brand",
    "brand_name",
    "manufacturer",
    "manufacturer_name",
    "hersteller",
  ]);
}

function isBookProduct(product: ProductRow) {
  const rawIsBook = product.is_book;

  if (rawIsBook === true) {
    return true;
  }

  if (typeof rawIsBook === "string") {
    const normalized = rawIsBook.trim().toLowerCase();

    if (["true", "1", "yes", "ja"].includes(normalized)) {
      return true;
    }
  }

  return Boolean(getProductIsbn10(product) || getProductIsbn13(product));
}

function getDisplayBookIsbn(product: ProductRow): string | null {
  const isbn13 = getProductIsbn13(product);

  if (isbn13) {
    return isbn13;
  }

  const isbn10 = getProductIsbn10(product);

  if (isbn10) {
    return isbn10;
  }

  const ean = getProductEan(product);
  const normalizedEan = normalizeIdentifier(ean);

  if (isBookProduct(product) && normalizedEan.length === 13) {
    return ean;
  }

  return null;
}

function isVisibleShopProduct(product: ProductRow) {
  const activeValue = product.active;

  if (
    activeValue === false ||
    activeValue === 0 ||
    String(activeValue).trim().toLowerCase() === "false"
  ) {
    return false;
  }

  const status = getProductStatus(product);

  if (!status) {
    return true;
  }

  return !["inactive", "archived", "deleted", "disabled"].includes(
    status.toLowerCase(),
  );
}

function slugify(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function getProductSlug(product: ProductRow): string {
  const explicit = getStringValue(product, [
    "seo_slug",
    "slug",
    "product_slug",
  ]);

  if (explicit) {
    return slugify(explicit);
  }

  const name = getProductName(product);
  const sku = getProductSku(product);
  const id = getProductId(product);

  return slugify([name, sku || id].filter(Boolean).join(" "));
}

function getAliasText(alias: ProductAliasRow) {
  return getStringValue(alias, [
    "alias",
    "alias_text",
    "alias_name",
    "name",
    "value",
    "search_term",
  ]);
}

function getAliasProductId(alias: ProductAliasRow) {
  const rawProductId =
    alias.product_id ?? getStringValue(alias, ["productId", "product"]);

  return rawProductId ? String(rawProductId) : "";
}

function buildAliasesByProductId(rows: ProductAliasRow[]) {
  const aliasesByProductId = new Map<string, Set<string>>();

  for (const row of rows) {
    const productId = getAliasProductId(row);
    const aliasText = getAliasText(row);

    if (!productId || !aliasText) {
      continue;
    }

    const current = aliasesByProductId.get(productId) || new Set<string>();
    current.add(aliasText);
    aliasesByProductId.set(productId, current);
  }

  const result = new Map<string, string[]>();

  for (const [productId, aliases] of aliasesByProductId.entries()) {
    result.set(
      productId,
      Array.from(aliases).sort((left, right) =>
        left.localeCompare(right, "de", {
          numeric: true,
          sensitivity: "base",
        }),
      ),
    );
  }

  return result;
}

function getEmbeddedProductSearchValues(product: ProductRow) {
  return getTextValues(product, [
    "aliases",
    "alias",
    "search_aliases",
    "keywords",
    "search_keywords",
    "matching_keywords",
    "seo_keywords",
    "tags",
  ]);
}

function prepareShopProduct(product: ProductRow, aliases: string[]) {
  const embeddedSearchValues = getEmbeddedProductSearchValues(product);
  const allAliases = uniqueStrings([...aliases, ...embeddedSearchValues]);

  const identifiers = uniqueStrings([
    getProductId(product),
    getProductSku(product),
    getProductEan(product),
    getProductIsbn10(product),
    getProductIsbn13(product),
  ])
    .map(normalizeIdentifier)
    .filter(Boolean);

  const searchText = normalizeSearchText(
    [
      getProductName(product),
      getProductSku(product),
      getProductEan(product),
      getProductIsbn10(product),
      getProductIsbn13(product),
      getProductPublisher(product),
      getProductCategory(product),
      getProductFormat(product),
      getProductColor(product),
      getProductLineature(product),
      getStringValue(product, [
        "description",
        "short_description",
        "seo_description",
        "meta_description",
        "notes",
      ]),
      ...allAliases,
    ]
      .filter(Boolean)
      .join(" "),
  );

  return {
    ...product,
    __shopAliases: allAliases,
    __shopSearchText: searchText,
    __shopIdentifiers: Array.from(new Set(identifiers)),
  } satisfies ShopProductRow;
}

function compareProductsStable(left: ProductRow, right: ProductRow) {
  const leftHasImage = Boolean(getProductImageUrl(left));
  const rightHasImage = Boolean(getProductImageUrl(right));

  if (leftHasImage !== rightHasImage) {
    return leftHasImage ? -1 : 1;
  }

  const nameComparison = getProductName(left).localeCompare(
    getProductName(right),
    "de",
    {
      numeric: true,
      sensitivity: "base",
    },
  );

  if (nameComparison !== 0) {
    return nameComparison;
  }

  const skuComparison = String(getProductSku(left) || "").localeCompare(
    String(getProductSku(right) || ""),
    "de",
    {
      numeric: true,
      sensitivity: "base",
    },
  );

  if (skuComparison !== 0) {
    return skuComparison;
  }

  return getProductId(left).localeCompare(getProductId(right), "de", {
    numeric: true,
    sensitivity: "base",
  });
}

function getProductSearchRank(
  product: ShopProductRow,
  normalizedSearch: string,
  identifierSearchCandidates: string[],
): number | null {
  const searchTokens = normalizedSearch.split(" ").filter(Boolean);
  const textMatches =
    searchTokens.length === 0 ||
    searchTokens.every((token) => product.__shopSearchText.includes(token));

  const matchingIdentifiers =
    identifierSearchCandidates.length > 0
      ? product.__shopIdentifiers.filter((identifier) =>
          identifierSearchCandidates.some((candidate) =>
            identifier.includes(candidate),
          ),
        )
      : [];

  if (!textMatches && matchingIdentifiers.length === 0) {
    return null;
  }

  if (
    matchingIdentifiers.some((identifier) =>
      identifierSearchCandidates.some((candidate) => identifier === candidate),
    )
  ) {
    return 0;
  }

  if (
    matchingIdentifiers.some((identifier) =>
      identifierSearchCandidates.some((candidate) =>
        identifier.startsWith(candidate),
      ),
    )
  ) {
    return 1;
  }

  if (matchingIdentifiers.length > 0) {
    return 2;
  }

  const normalizedName = normalizeSearchText(getProductName(product));

  if (normalizedName === normalizedSearch) {
    return 3;
  }

  if (normalizedName.startsWith(normalizedSearch)) {
    return 4;
  }

  const normalizedAliases = product.__shopAliases.map(normalizeSearchText);

  if (normalizedAliases.some((alias) => alias === normalizedSearch)) {
    return 5;
  }

  if (normalizedAliases.some((alias) => alias.startsWith(normalizedSearch))) {
    return 6;
  }

  return 7;
}

async function loadAllProductRows() {
  if (!supabase) {
    return [] as ProductRow[];
  }

  const rows: ProductRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("school_products")
      .select("*")
      .or("active.is.null,active.eq.true")
      .order("id", { ascending: true })
      .range(from, from + PRODUCT_PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const page = (data || []) as ProductRow[];

    if (page.length === 0) {
      break;
    }

    rows.push(...page);
    from += page.length;
  }

  const byProductId = new Map<string, ProductRow>();
  const withoutId: ProductRow[] = [];

  for (const row of rows) {
    const productId = getProductId(row);

    if (!productId) {
      withoutId.push(row);
      continue;
    }

    byProductId.set(productId, row);
  }

  return [...byProductId.values(), ...withoutId];
}

async function loadAllProductAliasRows() {
  if (!supabase) {
    return [] as ProductAliasRow[];
  }

  const rows: ProductAliasRow[] = [];
  let from = 0;
  let useStableOrder = true;

  while (true) {
    const response = useStableOrder
      ? await supabase
          .from("school_product_aliases")
          .select("*")
          .order("product_id", { ascending: true })
          .order("id", { ascending: true })
          .range(from, from + ALIAS_PAGE_SIZE - 1)
      : await supabase
          .from("school_product_aliases")
          .select("*")
          .range(from, from + ALIAS_PAGE_SIZE - 1);

    if (response.error) {
      if (useStableOrder && from === 0) {
        useStableOrder = false;
        continue;
      }

      console.warn(
        "Shop-Aliase konnten nicht vollständig geladen werden:",
        response.error,
      );

      return rows;
    }

    const page = (response.data || []) as ProductAliasRow[];

    if (page.length === 0) {
      break;
    }

    rows.push(...page);
    from += page.length;
  }

  return rows;
}

export default function ShopPage() {
  const [products, setProducts] = useState<ShopProductRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("Alle");
  const [cartCount, setCartCount] = useState(0);
  const [feedback, setFeedback] = useState<AddToCartFeedback | null>(null);
  const [recentlyAddedProductId, setRecentlyAddedProductId] = useState<
    string | null
  >(null);

  const feedbackTimerRef = useRef<number | null>(null);
  const buttonTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setCartCount(getShopCartCount(readShopCart()));

    function handleCartUpdate() {
      setCartCount(getShopCartCount(readShopCart()));
    }

    window.addEventListener("shop-cart-updated", handleCartUpdate);
    window.addEventListener("storage", handleCartUpdate);

    return () => {
      window.removeEventListener("shop-cart-updated", handleCartUpdate);
      window.removeEventListener("storage", handleCartUpdate);

      if (feedbackTimerRef.current) {
        window.clearTimeout(feedbackTimerRef.current);
      }

      if (buttonTimerRef.current) {
        window.clearTimeout(buttonTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      setIsLoading(true);
      setLoadError(null);

      if (!supabase) {
        if (!cancelled) {
          setProducts([]);
          setLoadError(
            "Die Supabase-Verbindung ist noch nicht vollständig konfiguriert.",
          );
          setIsLoading(false);
        }

        return;
      }

      try {
        // SHOP_ISBN_PAGINATION_V1
        const [productRows, aliasRows] = await Promise.all([
          loadAllProductRows(),
          loadAllProductAliasRows(),
        ]);

        const aliasesByProductId = buildAliasesByProductId(aliasRows);

        const cleanProducts = productRows
          .filter(isVisibleShopProduct)
          .map((product) => {
            const productId = getProductId(product);
            const aliases = productId
              ? aliasesByProductId.get(productId) || []
              : [];

            return prepareShopProduct(product, aliases);
          })
          .sort(compareProductsStable);

        if (!cancelled) {
          setProducts(cleanProducts);
        }
      } catch (error) {
        console.error("Shop-Produkte konnten nicht geladen werden:", error);

        if (!cancelled) {
          setProducts([]);
          setLoadError(
            "Die Produkte konnten nicht vollständig geladen werden. Prüfe die öffentlichen Leserechte für school_products.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadProducts();

    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(() => {
    const categorySet = new Set<string>();

    for (const product of products) {
      const category = getProductCategory(product);

      if (category) {
        categorySet.add(category);
      }
    }

    return [
      "Alle",
      ...Array.from(categorySet).sort((left, right) =>
        left.localeCompare(right, "de", {
          numeric: true,
          sensitivity: "base",
        }),
      ),
    ];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const rawSearch = searchTerm.trim();
    const normalizedSearch = normalizeSearchText(rawSearch);
    const identifierSearchCandidates =
      getIdentifierSearchCandidates(rawSearch);
    const hasSearch =
      normalizedSearch.length > 0 || identifierSearchCandidates.length > 0;

    return products
      .filter((product) => {
        const category = getProductCategory(product);

        return activeCategory === "Alle" || category === activeCategory;
      })
      .map((product) => ({
        product,
        rank: hasSearch
          ? getProductSearchRank(
              product,
              normalizedSearch,
              identifierSearchCandidates,
            )
          : 0,
      }))
      .filter(
        (
          entry,
        ): entry is {
          product: ShopProductRow;
          rank: number;
        } => entry.rank !== null,
      )
      .sort((left, right) => {
        if (left.rank !== right.rank) {
          return left.rank - right.rank;
        }

        return compareProductsStable(left.product, right.product);
      })
      .map((entry) => entry.product);
  }, [activeCategory, products, searchTerm]);

  function handleAddToCart(product: ProductRow) {
    const productId = getProductId(product);

    if (!productId) {
      return;
    }

    const currentCart = readShopCart();
    const wasAlreadyInCart = currentCart.some(
      (item) => item.productId === productId,
    );

    const name = getProductName(product);
    const sku = getProductSku(product);
    const price = getProductPrice(product);
    const imageUrl = getProductImageUrl(product);
    const category = getProductCategory(product);
    const format = getProductFormat(product);
    const color = getProductColor(product);
    const lineature = getProductLineature(product);

    const nextCart = addShopCartItem({
      productId,
      name,
      sku,
      price,
      imageUrl,
      quantity: 1,
      category,
      format,
      color,
      lineature,
      sourceType: "shop",
    });

    const nextCartCount = getShopCartCount(nextCart);

    setCartCount(nextCartCount);
    setRecentlyAddedProductId(productId);
    setFeedback({
      productId,
      productName: name,
      mode: wasAlreadyInCart ? "increased" : "added",
      cartCount: nextCartCount,
    });

    if (feedbackTimerRef.current) {
      window.clearTimeout(feedbackTimerRef.current);
    }

    if (buttonTimerRef.current) {
      window.clearTimeout(buttonTimerRef.current);
    }

    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedback(null);
    }, 6500);

    buttonTimerRef.current = window.setTimeout(() => {
      setRecentlyAddedProductId(null);
    }, 1800);
  }

  function closeFeedback() {
    setFeedback(null);

    if (feedbackTimerRef.current) {
      window.clearTimeout(feedbackTimerRef.current);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f1e8] text-[#172033]">
      {feedback ? (
        <div
          className="fixed left-4 right-4 top-4 z-50 mx-auto max-w-xl rounded-[1.5rem] border border-[#bfe7c9] bg-white p-4 shadow-2xl md:left-auto md:right-6 md:top-6 md:w-[420px]"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#e7f7ec] text-2xl">
              ✓
            </div>

            <div className="min-w-0 flex-1">
              <p className="font-black text-[#246b3a]">
                {feedback.mode === "increased"
                  ? "Menge im Warenkorb erhöht"
                  : "Artikel wurde hinzugefügt"}
              </p>

              <p className="mt-1 text-sm font-semibold leading-6 text-[#4c5870]">
                „{feedback.productName}“ liegt jetzt im Warenkorb.
              </p>

              <p className="mt-1 text-xs font-bold text-[#7a8496]">
                Aktuell {feedback.cartCount} Artikel im Warenkorb.
              </p>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Link
                  href="/shop/warenkorb"
                  className="inline-flex flex-1 justify-center rounded-2xl bg-[#172033] px-4 py-3 text-sm font-black text-white transition hover:bg-[#9b2f23]"
                >
                  Zum Warenkorb
                </Link>

                <button
                  type="button"
                  onClick={closeFeedback}
                  className="inline-flex flex-1 justify-center rounded-2xl bg-[#f7f1e8] px-4 py-3 text-sm font-black text-[#172033] ring-1 ring-[#eadfce] transition hover:bg-white"
                >
                  Weiter einkaufen
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={closeFeedback}
              className="rounded-full px-2 py-1 text-lg font-black text-[#7a8496] transition hover:bg-[#f7f1e8] hover:text-[#172033]"
              aria-label="Hinweis schließen"
            >
              ×
            </button>
          </div>
        </div>
      ) : null}

      <section className="border-b border-[#eadfce] bg-gradient-to-br from-[#fffaf2] via-[#f7f1e8] to-[#e8eef7]">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-10 md:px-8 lg:flex-row lg:items-center lg:justify-between lg:py-14">
          <div className="max-w-3xl">
            <Link
              href="/"
              className="mb-5 inline-flex rounded-full bg-white px-4 py-2 text-sm font-bold text-[#172033] shadow-sm ring-1 ring-[#eadfce] transition hover:bg-[#172033] hover:text-white"
            >
              ← Zurück zur Startseite
            </Link>

            <p className="mb-3 inline-flex rounded-full bg-[#172033] px-4 py-2 text-sm font-semibold text-white shadow-sm">
              Schulmaterial-Shop
            </p>

            <h1 className="text-4xl font-black tracking-tight text-[#172033] md:text-5xl">
              Schulmaterial und Bücher schnell finden und direkt nachkaufen.
            </h1>

            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4c5870]">
              Suche nach Produktname, Artikelnummer, EAN, ISBN oder Verlag und
              lege passende Artikel direkt in den Warenkorb.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <span className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-[#172033] shadow-sm ring-1 ring-[#eadfce]">
                Vollständiger aktiver Bestand
              </span>

              <span className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-[#172033] shadow-sm ring-1 ring-[#eadfce]">
                ISBN- und EAN-Suche
              </span>

              <span className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-[#172033] shadow-sm ring-1 ring-[#eadfce]">
                Direkt in den Warenkorb
              </span>
            </div>
          </div>

          <div className="rounded-[2rem] bg-white p-6 shadow-xl ring-1 ring-[#eadfce] lg:min-w-[330px]">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#9b2f23]">
              Warenkorb
            </p>

            <p className="mt-3 text-4xl font-black text-[#172033]">
              {cartCount}
            </p>

            <p className="mt-2 text-sm leading-6 text-[#5b667a]">
              {cartCount === 1
                ? "1 Artikel liegt aktuell im Warenkorb."
                : `${cartCount} Artikel liegen aktuell im Warenkorb.`}
            </p>

            <Link
              href="/shop/warenkorb"
              className="mt-5 flex w-full justify-center rounded-2xl bg-[#172033] px-5 py-4 text-sm font-black text-white shadow-sm transition hover:bg-[#9b2f23]"
            >
              Warenkorb ansehen
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 py-8 md:px-8">
        <div className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-[#eadfce] md:p-6">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <label
                htmlFor="shop-search"
                className="mb-2 block text-sm font-bold text-[#172033]"
              >
                Produkt oder Buch suchen
              </label>

              <input
                id="shop-search"
                type="search"
                value={searchTerm}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setSearchTerm(event.target.value)
                }
                placeholder="z. B. Schulheft A5, Artikelnummer, 9783965203709 oder BVK ..."
                className="w-full rounded-2xl border border-[#d8cdbb] bg-[#fffaf2] px-4 py-4 text-base font-medium text-[#172033] outline-none transition focus:border-[#9b2f23] focus:bg-white focus:ring-4 focus:ring-[#9b2f23]/10"
              />

              <p className="mt-2 text-xs font-semibold leading-5 text-[#7a8496]">
                Durchsucht Name, SKU, EAN, ISBN-10, ISBN-13, Verlag,
                Produktmerkmale und verfügbare Suchaliasse.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 lg:min-w-[230px]">
              <div className="rounded-2xl bg-[#172033] px-4 py-3 text-white shadow-sm">
                <p className="text-xs font-semibold text-white/70">Gefunden</p>
                <p className="text-2xl font-black">{filteredProducts.length}</p>
              </div>

              <div className="rounded-2xl bg-[#f7f1e8] px-4 py-3 text-[#172033] ring-1 ring-[#eadfce]">
                <p className="text-xs font-semibold text-[#7a8496]">Geladen</p>
                <p className="text-2xl font-black">{products.length}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
            {categories.map((category) => {
              const isActive = category === activeCategory;

              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className={
                    isActive
                      ? "whitespace-nowrap rounded-full bg-[#9b2f23] px-4 py-2 text-sm font-bold text-white shadow-sm"
                      : "whitespace-nowrap rounded-full bg-[#f7f1e8] px-4 py-2 text-sm font-bold text-[#4c5870] ring-1 ring-[#eadfce] transition hover:bg-white hover:text-[#172033]"
                  }
                >
                  {category}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 rounded-[1.5rem] border border-[#eadfce] bg-[#fffaf2] px-4 py-3 text-xs font-semibold leading-5 text-[#5b667a] shadow-sm">
          <span className="font-black text-[#172033]">Hinweis:</span>{" "}
          Produktbilder dienen der besseren Orientierung und können KI-gestützt
          optimiert worden sein. Geringfügige optische Abweichungen sind
          möglich. Maßgeblich sind Artikelbeschreibung und Produktmerkmale.
        </div>

        {isLoading ? (
          <div className="mt-8 rounded-[2rem] bg-white p-8 text-center shadow-sm ring-1 ring-[#eadfce]">
            <p className="text-lg font-black text-[#172033]">
              Gesamter Produktbestand wird geladen …
            </p>

            <p className="mt-2 text-sm text-[#5b667a]">
              Der Shop lädt alle Produktseiten nacheinander und bereitet die
              ISBN- und Alias-Suche vor.
            </p>
          </div>
        ) : null}

        {loadError ? (
          <div className="mt-8 rounded-[2rem] bg-white p-8 shadow-sm ring-1 ring-[#eadfce]">
            <p className="text-lg font-black text-[#9b2f23]">
              Produkte konnten nicht geladen werden.
            </p>

            <p className="mt-3 text-sm leading-6 text-[#5b667a]">
              {loadError}
            </p>
          </div>
        ) : null}

        {!isLoading && !loadError && filteredProducts.length === 0 ? (
          <div className="mt-8 rounded-[2rem] bg-white p-8 text-center shadow-sm ring-1 ring-[#eadfce]">
            <p className="text-lg font-black text-[#172033]">
              Keine passenden Produkte gefunden.
            </p>

            <p className="mt-2 text-sm text-[#5b667a]">
              Prüfe die Schreibweise, suche direkt nach ISBN oder EAN oder wähle
              eine andere Kategorie.
            </p>
          </div>
        ) : null}

        {!isLoading && !loadError && filteredProducts.length > 0 ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredProducts.map((product, index) => {
              const productId = getProductId(product);
              const name = getProductName(product);
              const sku = getProductSku(product);
              const price = getProductPrice(product);
              const imageUrl = getProductImageUrl(product);
              const imageAlt = getProductImageAlt(product, name);
              const imageTitle = getProductImageTitle(product, name);
              const category = getProductCategory(product);
              const format = getProductFormat(product);
              const color = getProductColor(product);
              const lineature = getProductLineature(product);
              const publisher = getProductPublisher(product);
              const bookIsbn = getDisplayBookIsbn(product);
              const isBook = isBookProduct(product);
              const wasRecentlyAdded = recentlyAddedProductId === productId;
              const productDetailHref = `/shop/produkt/${getProductSlug(
                product,
              )}`;

              return (
                <article
                  key={productId || `${getProductSlug(product)}-${index}`}
                  className={[
                    "flex h-full flex-col overflow-hidden rounded-[2rem] bg-white shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-xl",
                    wasRecentlyAdded
                      ? "ring-2 ring-[#2f7d50]"
                      : "ring-[#eadfce]",
                  ].join(" ")}
                >
                  <div className="relative flex min-h-[360px] items-center justify-center overflow-hidden bg-[#fffaf2] sm:min-h-[380px] lg:min-h-[400px]">
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageUrl}
                        alt={imageAlt}
                        title={imageTitle}
                        loading="lazy"
                        decoding="async"
                        className={
                          isBook
                            ? "h-full w-full object-contain object-center p-6"
                            : "h-full w-full object-cover object-center"
                        }
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
                        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-3xl shadow-sm">
                          {isBook ? "📖" : "📚"}
                        </div>

                        <p className="text-sm font-bold text-[#5b667a]">
                          {isBook ? "Buch ohne Coverbild" : "Produktbild folgt"}
                        </p>

                        <p className="mt-2 max-w-xs text-xs font-semibold leading-5 text-[#7a8496]">
                          Der Artikel bleibt vollständig suchbar und bestellbar.
                        </p>
                      </div>
                    )}

                    {category ? (
                      <span className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1.5 text-xs font-black text-[#172033] shadow-sm">
                        {category}
                      </span>
                    ) : null}

                    {isBook ? (
                      <span className="absolute bottom-4 left-4 rounded-full bg-[#172033]/95 px-3 py-1.5 text-xs font-black text-white shadow-sm">
                        Buch
                      </span>
                    ) : null}

                    {wasRecentlyAdded ? (
                      <span className="absolute right-4 top-4 rounded-full bg-[#e7f7ec] px-3 py-1.5 text-xs font-black text-[#246b3a] shadow-sm ring-1 ring-[#bfe7c9]">
                        ✓ Hinzugefügt
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex-1">
                      <h2 className="text-xl font-black leading-tight text-[#172033]">
                        {name}
                      </h2>

                      {sku ? (
                        <p className="mt-2 text-sm font-semibold text-[#7a8496]">
                          Art.-Nr.: {sku}
                        </p>
                      ) : null}

                      {isBook && publisher ? (
                        <p className="mt-2 text-sm font-semibold text-[#5b667a]">
                          Verlag: {publisher}
                        </p>
                      ) : null}

                      {isBook && bookIsbn ? (
                        <p className="mt-1 break-all text-sm font-semibold text-[#5b667a]">
                          ISBN: {bookIsbn}
                        </p>
                      ) : null}

                      <div className="mt-4 flex flex-wrap gap-2">
                        {format ? (
                          <span className="rounded-full bg-[#f7f1e8] px-3 py-1.5 text-xs font-bold text-[#4c5870]">
                            Format: {format}
                          </span>
                        ) : null}

                        {lineature ? (
                          <span className="rounded-full bg-[#f7f1e8] px-3 py-1.5 text-xs font-bold text-[#4c5870]">
                            Lineatur: {lineature}
                          </span>
                        ) : null}

                        {color ? (
                          <span className="rounded-full bg-[#f7f1e8] px-3 py-1.5 text-xs font-bold text-[#4c5870]">
                            Farbe: {color}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-6">
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9b2f23]">
                        Preis
                      </p>

                      <p className="text-2xl font-black text-[#172033]">
                        {formatShopPrice(price)}
                      </p>

                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <Link
                          href={productDetailHref}
                          className="rounded-2xl bg-[#f7f1e8] px-4 py-3 text-center text-sm font-black text-[#172033] ring-1 ring-[#eadfce] transition hover:bg-white"
                        >
                          Details ansehen
                        </Link>

                        <button
                          type="button"
                          onClick={() => handleAddToCart(product)}
                          disabled={!productId}
                          className={[
                            "rounded-2xl px-4 py-3 text-sm font-black shadow-sm transition disabled:cursor-not-allowed disabled:bg-[#9aa3b3]",
                            wasRecentlyAdded
                              ? "bg-[#2f7d50] text-white"
                              : "bg-[#172033] text-white hover:bg-[#9b2f23]",
                          ].join(" ")}
                        >
                          {wasRecentlyAdded
                            ? "Hinzugefügt ✓"
                            : "In den Warenkorb"}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </main>
  );
}