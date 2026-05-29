"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";

type ProductRow = Record<string, unknown> & {
  id?: string | number | null;
};

type CartItem = {
  productId: string;
  name: string;
  sku: string | null;
  price: number;
  imageUrl: string | null;
  quantity: number;
  category: string | null;
  format: string | null;
  color: string | null;
  lineature: string | null;
};

const SHOP_CART_KEY = "handzettel_schulen_shop_cart_v1";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

function getStringValue(product: ProductRow, keys: string[]): string | null {
  for (const key of keys) {
    const value = product[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function getNumberValue(product: ProductRow, keys: string[]): number {
  for (const key of keys) {
    const value = product[key];

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
    "sale_price",
    "brutto_preis",
  ]);
}

function getProductCategory(product: ProductRow): string | null {
  return getStringValue(product, ["category", "product_category", "type"]);
}

function getProductImageUrl(product: ProductRow): string | null {
  return getStringValue(product, [
    "image_url",
    "product_image_url",
    "image",
    "photo_url",
    "picture_url",
  ]);
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

function formatPrice(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function readCart(): CartItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(SHOP_CART_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed as CartItem[];
  } catch {
    return [];
  }
}

function writeCart(items: CartItem[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SHOP_CART_KEY, JSON.stringify(items));
}

export default function ShopPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("Alle");
  const [cartCount, setCartCount] = useState(0);
  const [lastAddedProductName, setLastAddedProductName] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setCartCount(
      readCart().reduce((sum, item) => {
        return sum + item.quantity;
      }, 0),
    );
  }, []);

  useEffect(() => {
    async function loadProducts() {
      setIsLoading(true);
      setLoadError(null);

      if (!supabase) {
        setProducts([]);
        setLoadError(
          "Die Supabase-Verbindung ist noch nicht vollständig konfiguriert.",
        );
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("school_products")
        .select("*")
        .limit(300);

      if (error) {
        setProducts([]);
        setLoadError(
          "Die Produkte konnten nicht geladen werden. Prüfe ggf. die Leserechte für school_products.",
        );
        setIsLoading(false);
        return;
      }

      const cleanProducts = (data || []).filter((product) => {
        const status = getProductStatus(product);

        if (!status) {
          return true;
        }

        return !["inactive", "archived", "deleted", "disabled"].includes(
          status.toLowerCase(),
        );
      });

      setProducts(cleanProducts);
      setIsLoading(false);
    }

    loadProducts();
  }, []);

  const categories = useMemo(() => {
    const categorySet = new Set<string>();

    for (const product of products) {
      const category = getProductCategory(product);

      if (category) {
        categorySet.add(category);
      }
    }

    return ["Alle", ...Array.from(categorySet).sort((a, b) => a.localeCompare(b))];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return products.filter((product) => {
      const name = getProductName(product);
      const sku = getProductSku(product);
      const category = getProductCategory(product);
      const format = getProductFormat(product);
      const color = getProductColor(product);
      const lineature = getProductLineature(product);

      const categoryMatches =
        activeCategory === "Alle" || category === activeCategory;

      const searchText = [
        name,
        sku,
        category,
        format,
        color,
        lineature,
        getStringValue(product, ["description", "short_description", "notes"]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const searchMatches =
        normalizedSearch.length === 0 || searchText.includes(normalizedSearch);

      return categoryMatches && searchMatches;
    });
  }, [activeCategory, products, searchTerm]);

  function handleAddToCart(product: ProductRow) {
    const productId = getProductId(product);

    if (!productId) {
      return;
    }

    const name = getProductName(product);
    const sku = getProductSku(product);
    const price = getProductPrice(product);
    const imageUrl = getProductImageUrl(product);
    const category = getProductCategory(product);
    const format = getProductFormat(product);
    const color = getProductColor(product);
    const lineature = getProductLineature(product);

    const existingCart = readCart();
    const existingItem = existingCart.find((item) => item.productId === productId);

    let nextCart: CartItem[];

    if (existingItem) {
      nextCart = existingCart.map((item) => {
        if (item.productId !== productId) {
          return item;
        }

        return {
          ...item,
          quantity: item.quantity + 1,
        };
      });
    } else {
      nextCart = [
        ...existingCart,
        {
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
        },
      ];
    }

    writeCart(nextCart);

    setCartCount(
      nextCart.reduce((sum, item) => {
        return sum + item.quantity;
      }, 0),
    );

    setLastAddedProductName(name);

    window.setTimeout(() => {
      setLastAddedProductName(null);
    }, 2600);
  }

  return (
    <main className="min-h-screen bg-[#f7f1e8] text-[#172033]">
      <section className="border-b border-[#eadfce] bg-gradient-to-br from-[#fffaf2] via-[#f7f1e8] to-[#e8eef7]">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-10 md:px-8 lg:flex-row lg:items-center lg:justify-between lg:py-14">
          <div className="max-w-3xl">
            <p className="mb-3 inline-flex rounded-full bg-[#172033] px-4 py-2 text-sm font-semibold text-white shadow-sm">
              Neuer Bereich · Schulmaterial-Shop
            </p>

            <h1 className="text-4xl font-black tracking-tight text-[#172033] md:text-5xl">
              Schulmaterial schnell finden und direkt nachkaufen.
            </h1>

            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4c5870]">
              Hier entsteht der kleine Webshop von Handzettel-Schulen.de. Du
              kannst Produkte suchen, nach Kategorien filtern und Artikel direkt
              in den Warenkorb legen.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <span className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-[#172033] shadow-sm ring-1 ring-[#eadfce]">
                Produkte aus dem Bestand
              </span>
              <span className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-[#172033] shadow-sm ring-1 ring-[#eadfce]">
                Suche & Kategorien
              </span>
              <span className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-[#172033] shadow-sm ring-1 ring-[#eadfce]">
                Warenkorb vorbereitet
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

            <div className="mt-5 rounded-2xl bg-[#f7f1e8] p-4 text-sm leading-6 text-[#4c5870]">
              Die Warenkorb-Seite bauen wir im nächsten Schritt unter{" "}
              <span className="font-bold text-[#172033]">/shop/warenkorb</span>.
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 py-8 md:px-8">
        <div className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-[#eadfce] md:p-6">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <label
                htmlFor="shop-search"
                className="mb-2 block text-sm font-bold text-[#172033]"
              >
                Produkt suchen
              </label>

              <input
                id="shop-search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="z. B. Schulheft A5, Lineatur 8f, Umschlag blau ..."
                className="w-full rounded-2xl border border-[#d8cdbb] bg-[#fffaf2] px-4 py-4 text-base font-medium text-[#172033] outline-none transition focus:border-[#9b2f23] focus:bg-white focus:ring-4 focus:ring-[#9b2f23]/10"
              />
            </div>

            <div className="rounded-2xl bg-[#172033] px-5 py-4 text-white shadow-sm">
              <p className="text-sm font-semibold text-white/70">Gefunden</p>
              <p className="text-2xl font-black">{filteredProducts.length}</p>
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

        {lastAddedProductName ? (
          <div className="mt-5 rounded-2xl bg-[#e7f7ec] px-5 py-4 text-sm font-bold text-[#246b3a] ring-1 ring-[#bfe7c9]">
            „{lastAddedProductName}“ wurde in den Warenkorb gelegt.
          </div>
        ) : null}

        {isLoading ? (
          <div className="mt-8 rounded-[2rem] bg-white p-8 text-center shadow-sm ring-1 ring-[#eadfce]">
            <p className="text-lg font-black text-[#172033]">
              Produkte werden geladen …
            </p>
            <p className="mt-2 text-sm text-[#5b667a]">
              Der Shop ruft gerade den aktuellen Produktbestand ab.
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
              Versuche einen anderen Suchbegriff oder wähle eine andere Kategorie.
            </p>
          </div>
        ) : null}

        {!isLoading && !loadError && filteredProducts.length > 0 ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredProducts.map((product) => {
              const productId = getProductId(product);
              const name = getProductName(product);
              const sku = getProductSku(product);
              const price = getProductPrice(product);
              const imageUrl = getProductImageUrl(product);
              const category = getProductCategory(product);
              const format = getProductFormat(product);
              const color = getProductColor(product);
              const lineature = getProductLineature(product);

              return (
                <article
                  key={productId || name}
                  className="flex h-full flex-col overflow-hidden rounded-[2rem] bg-white shadow-sm ring-1 ring-[#eadfce] transition hover:-translate-y-0.5 hover:shadow-xl"
                >
                  <div className="relative flex aspect-[4/3] items-center justify-center bg-[#eef2f7]">
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageUrl}
                        alt={name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
                        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-3xl shadow-sm">
                          📚
                        </div>
                        <p className="text-sm font-bold text-[#5b667a]">
                          Produktbild folgt
                        </p>
                      </div>
                    )}

                    {category ? (
                      <span className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1.5 text-xs font-black text-[#172033] shadow-sm">
                        {category}
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

                    <div className="mt-6 flex items-end justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9b2f23]">
                          Preis
                        </p>
                        <p className="text-2xl font-black text-[#172033]">
                          {formatPrice(price)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAddToCart(product)}
                        disabled={!productId}
                        className="rounded-2xl bg-[#172033] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#9b2f23] disabled:cursor-not-allowed disabled:bg-[#9aa3b3]"
                      >
                        In den Warenkorb
                      </button>
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