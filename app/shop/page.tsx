"use client";

import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addShopCartItem,
  formatShopPrice,
  getShopCartCount,
  readShopCart,
} from "./_lib/shopCart";

type ProductRow = Record<string, unknown> & {
  id?: string | number | null;
};

type AddToCartFeedback = {
  productId: string;
  productName: string;
  mode: "added" | "increased";
  cartCount: number;
};

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

function getProductImageTitle(product: ProductRow, fallbackName: string): string {
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

export default function ShopPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
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
    async function loadProducts() {
      setIsLoading(true);
      setLoadError(null);

      if (!supabase) {
        setProducts([]);
        setLoadError(
          "Die Supabase-Verbindung ist noch nicht vollständig konfiguriert."
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
          "Die Produkte konnten nicht geladen werden. Prüfe ggf. die Leserechte für school_products."
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
          status.toLowerCase()
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

    const currentCart = readShopCart();
    const wasAlreadyInCart = currentCart.some((item) => {
      return item.productId === productId;
    });

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
        <div className="fixed left-4 right-4 top-4 z-50 mx-auto max-w-xl rounded-[1.5rem] border border-[#bfe7c9] bg-white p-4 shadow-2xl md:left-auto md:right-6 md:top-6 md:w-[420px]">
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
                Aktuell {feedback.cartCount}{" "}
                {feedback.cartCount === 1 ? "Artikel" : "Artikel"} im Warenkorb.
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

        <div className="mt-4 rounded-[1.5rem] border border-[#eadfce] bg-[#fffaf2] px-4 py-3 text-xs font-semibold leading-5 text-[#5b667a] shadow-sm">
          <span className="font-black text-[#172033]">Hinweis:</span>{" "}
          Produktbilder dienen der besseren Orientierung und können KI-gestützt
          optimiert worden sein. Geringfügige optische Abweichungen sind möglich.
          Maßgeblich sind Artikelbeschreibung und Produktmerkmale.
        </div>

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
              const imageAlt = getProductImageAlt(product, name);
              const imageTitle = getProductImageTitle(product, name);
              const category = getProductCategory(product);
              const format = getProductFormat(product);
              const color = getProductColor(product);
              const lineature = getProductLineature(product);
              const wasRecentlyAdded = recentlyAddedProductId === productId;

              return (
                <article
                  key={productId || name}
                  className={[
                    "flex h-full flex-col overflow-hidden rounded-[2rem] bg-white shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-xl",
                    wasRecentlyAdded
                      ? "ring-2 ring-[#2f7d50]"
                      : "ring-[#eadfce]",
                  ].join(" ")}
                >
                  <div className="relative flex aspect-[4/3] items-center justify-center bg-[#eef2f7]">
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageUrl}
                        alt={imageAlt}
                        title={imageTitle}
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
                          {formatShopPrice(price)}
                        </p>
                      </div>

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
                        {wasRecentlyAdded ? "Hinzugefügt ✓" : "In den Warenkorb"}
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