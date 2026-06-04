import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  ImageIcon,
  PackagePlus,
  Search,
  ShoppingBasket,
  Smartphone,
  Sparkles,
} from "lucide-react";
import AdminQuickProductForm from "@/components/AdminQuickProductForm";
import AdminEditProductForm from "@/components/AdminEditProductForm";
import AdminProductPreviewImage from "@/components/AdminProductPreviewImage";

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
      "Supabase Umgebungsvariablen fehlen. Prüfe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatMoney(value: unknown) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(toNumber(value, 0));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function getProductName(product: ProductRow) {
  return (
    product.name ||
    product.product_name ||
    product.title ||
    "Unbenanntes Produkt"
  );
}

function getProductSku(product: ProductRow) {
  return product.sku || product.product_sku || null;
}

function getProductPrice(product: ProductRow) {
  return toNumber(
    product.price ??
      product.product_price ??
      product.sale_price_gross ??
      product.sale_price,
    0
  );
}

function getAliasText(alias: AliasRow) {
  return alias.alias || alias.alias_text || alias.alias_name || alias.name || "";
}

function getBookMeasureLabel(product: ProductRow) {
  const width = toNumber(product.book_width_mm, 0);
  const height = toNumber(product.book_height_mm, 0);

  if (width <= 0 || height <= 0) {
    return null;
  }

  return `${width} x ${height} mm`;
}

function cleanImageUrl(value: unknown) {
  const cleaned = String(value || "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function getProductImageCandidates(product: ProductRow) {
  const candidates = [
    product.image_styled_url,
    product.image_url,
    product.image_original_url,
    product.product_image_url,
    product.image,
    product.photo_url,
    product.picture_url,
  ]
    .map((value) => cleanImageUrl(value))
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(candidates));
}

function getEditableProductImageUrl(product: ProductRow) {
  /*
    Wichtig:
    Für die Bearbeitungsmaske darf NICHT image_styled_url übergeben werden.
    Sonst kann ein KI-Hintergrundbild versehentlich als normales image_url gespeichert werden.
  */
  return cleanImageUrl(product.image_url);
}

function hasStyledProductImage(product: ProductRow) {
  return Boolean(cleanImageUrl(product.image_styled_url));
}

export default async function AdminProductsPage() {
  const supabase = getSupabaseAdmin();

  const { data: productsData, error: productsError } = await supabase
    .from("school_products")
    .select("*")
    .limit(500);

  if (productsError) {
    throw new Error(
      `Produkte konnten nicht geladen werden: ${productsError.message}`
    );
  }

  const { data: aliasesData } = await supabase
    .from("school_product_aliases")
    .select("*")
    .limit(5000);

  const products = ((productsData || []) as ProductRow[]).sort((a, b) => {
    const aDate = String(a.created_at || "");
    const bDate = String(b.created_at || "");

    if (aDate && bDate && aDate !== bDate) {
      return bDate.localeCompare(aDate);
    }

    return getProductName(a).localeCompare(getProductName(b), "de", {
      numeric: true,
      sensitivity: "base",
    });
  });

  const aliases = (aliasesData || []) as AliasRow[];

  const aliasesByProduct = new Map<string, AliasRow[]>();

  for (const alias of aliases) {
    if (!alias.product_id) continue;

    const current = aliasesByProduct.get(alias.product_id) || [];
    current.push(alias);
    aliasesByProduct.set(alias.product_id, current);
  }

  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-sm font-black text-[#12395F] transition hover:text-[#B5282D]"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zum Admin-Bereich
          </Link>

          <Link
            href="/admin/produkte/mobile"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
          >
            <Smartphone className="h-4 w-4" />
            Mobile Produkterfassung
          </Link>
        </div>

        <header className="rounded-[34px] border border-[#E8DED2] bg-white p-5 shadow-[0_18px_45px_rgba(16,42,67,0.10)] sm:p-7">
          <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">
                <PackagePlus className="h-3.5 w-3.5" />
                Produktverwaltung
              </div>

              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                Produkte erfassen & bearbeiten
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#52616F] sm:text-base">
                Lege Produkte zentral an und bearbeite bestehende Produkte
                direkt im Bestand. Änderungen wirken sich auf Produktsuche,
                Matching und Kundenseite aus.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Link
                  href="/admin/produkte/mobile"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
                >
                  <Camera className="h-4 w-4" />
                  Schnell per Handy erfassen
                </Link>

                <div className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] px-4 py-3 text-sm font-semibold leading-6 text-[#52616F]">
                  Ideal für Laden/Lager: Produkt fotografieren, Name und Preis
                  eintragen, speichern, nächstes Produkt.
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                Produktbestand
              </p>
              <p className="mt-2 text-3xl font-black text-[#102A43]">
                {products.length}
              </p>
              <p className="mt-1 text-sm font-semibold text-[#52616F]">
                geladene Produkte
              </p>

              <Link
                href="/admin/produkte/mobile"
                className="mt-4 inline-flex w-full min-h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#12395F] shadow-sm ring-1 ring-[#E8DED2] transition hover:bg-[#EEF4FA]"
              >
                <Smartphone className="h-4 w-4" />
                Mobile Erfassung öffnen
              </Link>
            </div>
          </div>
        </header>

        <AdminQuickProductForm />

        <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                <ShoppingBasket className="h-3.5 w-3.5" />
                Produktliste
              </div>

              <h2 className="text-2xl font-black text-[#102A43]">
                Bestehende Produkte
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#52616F]">
                Öffne bei einem Produkt den Bearbeiten-Bereich, um Stammdaten,
                Preis, Aliase, Produktbild, Buchmaße oder den Aktivstatus zu
                ändern.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:items-end">
              <Link
                href="/admin/produkte/mobile"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
              >
                <Camera className="h-4 w-4" />
                Neues Produkt per Kamera
              </Link>

              <div className="rounded-2xl bg-[#FBF7F0] px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-black text-[#12395F]">
                  <Search className="h-4 w-4" />
                  Suche folgt im nächsten Feinschliff
                </div>
              </div>
            </div>
          </div>

          {products.length > 0 ? (
            <div className="grid gap-3">
              {products.map((product) => {
                const productAliases = aliasesByProduct.get(product.id) || [];
                const aliasTexts = productAliases
                  .map((alias) => getAliasText(alias))
                  .filter(Boolean);

                const bookMeasureLabel = getBookMeasureLabel(product);
                const imageCandidates = getProductImageCandidates(product);
                const editableImageUrl = getEditableProductImageUrl(product);
                const styledImageAvailable = hasStyledProductImage(product);

                return (
                  <article
                    key={product.id}
                    className="rounded-[24px] border border-[#E8DED2] bg-[#FBF7F0] p-4"
                  >
                    <div className="grid gap-4 lg:grid-cols-[120px_1fr_170px] lg:items-start">
                      <div className="overflow-hidden rounded-2xl border border-[#E8DED2] bg-white">
                        {imageCandidates.length > 0 ? (
                          <AdminProductPreviewImage
                            alt={getProductName(product)}
                            sources={imageCandidates}
                            className="h-28 w-full object-contain p-2"
                          />
                        ) : (
                          <div className="flex h-28 w-full flex-col items-center justify-center text-[#A75B28]">
                            <ImageIcon className="h-6 w-6" />
                            <span className="mt-2 text-xs font-black">
                              Kein Bild
                            </span>
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          {product.category ? (
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#A75B28]">
                              {product.category}
                            </span>
                          ) : null}

                          {product.product_type ? (
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#52616F]">
                              Typ: {product.product_type}
                            </span>
                          ) : null}

                          {product.format ? (
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#52616F]">
                              Format: {product.format}
                            </span>
                          ) : null}

                          {product.color ? (
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#52616F]">
                              Farbe: {product.color}
                            </span>
                          ) : null}

                          {product.lineature ? (
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#52616F]">
                              Lineatur: {product.lineature}
                            </span>
                          ) : null}

                          {bookMeasureLabel ? (
                            <span className="rounded-full bg-[#F5FAFD] px-3 py-1 text-xs font-black text-[#12395F] ring-1 ring-[#D6E7EF]">
                              Buchmaß: {bookMeasureLabel}
                            </span>
                          ) : null}

                          {styledImageAvailable ? (
                            <span className="rounded-full bg-[#F0FFF6] px-3 py-1 text-xs font-black text-[#2F7D50] ring-1 ring-[#BFE3CD]">
                              KI-Hintergrund aktiv
                            </span>
                          ) : (
                            <span className="rounded-full bg-[#FFF8EE] px-3 py-1 text-xs font-black text-[#A75B28] ring-1 ring-[#F1D1A8]">
                              Noch kein KI-Hintergrund
                            </span>
                          )}
                        </div>

                        <h3 className="text-lg font-black text-[#102A43]">
                          {getProductName(product)}
                        </h3>

                        <p className="mt-1 text-sm font-semibold text-[#52616F]">
                          {getProductSku(product)
                            ? `Art.-Nr.: ${getProductSku(product)}`
                            : "Ohne Art.-Nr."}
                        </p>

                        <p className="mt-1 text-sm font-semibold text-[#52616F]">
                          {product.ean ? `EAN: ${product.ean}` : "Ohne EAN"}
                        </p>

                        {bookMeasureLabel || product.book_size_note ? (
                          <div className="mt-3 rounded-2xl border border-[#D6E7EF] bg-white px-4 py-3 text-sm font-semibold text-[#12395F]">
                            {bookMeasureLabel ? (
                              <p>
                                Buchmaß:{" "}
                                <span className="font-black">
                                  {bookMeasureLabel}
                                </span>
                              </p>
                            ) : null}

                            {product.book_size_note ? (
                              <p className={bookMeasureLabel ? "mt-1" : ""}>
                                Hinweis: {product.book_size_note}
                              </p>
                            ) : null}
                          </div>
                        ) : null}

                        {aliasTexts.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {aliasTexts.slice(0, 8).map((alias, index) => (
                              <span
                                key={`${product.id}-alias-${index}`}
                                className="rounded-full border border-[#E8DED2] bg-white px-3 py-1 text-xs font-bold text-[#52616F]"
                              >
                                {alias}
                              </span>
                            ))}

                            {aliasTexts.length > 8 ? (
                              <span className="rounded-full border border-[#E8DED2] bg-white px-3 py-1 text-xs font-bold text-[#A75B28]">
                                +{aliasTexts.length - 8} weitere
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <p className="mt-3 text-sm font-semibold text-[#9AA7B2]">
                            Noch keine Aliase gespeichert.
                          </p>
                        )}

                        <AdminEditProductForm
                          productId={product.id}
                          productName={getProductName(product)}
                          productSku={getProductSku(product)}
                          ean={product.ean || null}
                          productPrice={getProductPrice(product)}
                          category={product.category || null}
                          productType={product.product_type || null}
                          format={product.format || null}
                          color={product.color || null}
                          lineature={product.lineature || null}
                          bookWidthMm={
                            product.book_width_mm !== null &&
                            product.book_width_mm !== undefined
                              ? String(product.book_width_mm)
                              : null
                          }
                          bookHeightMm={
                            product.book_height_mm !== null &&
                            product.book_height_mm !== undefined
                              ? String(product.book_height_mm)
                              : null
                          }
                          bookSizeNote={product.book_size_note || null}
                          imageUrl={editableImageUrl}
                          active={product.active !== false}
                          aliases={aliasTexts}
                        />
                      </div>

                      <div className="rounded-2xl bg-white p-4 lg:text-right">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                          Preis
                        </p>
                        <p className="mt-2 text-xl font-black text-[#102A43]">
                          {formatMoney(getProductPrice(product))}
                        </p>
                        <p className="mt-2 text-xs font-semibold text-[#52616F]">
                          Erstellt: {formatDate(product.created_at)}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-[#52616F]">
                          Geändert: {formatDate(product.updated_at)}
                        </p>

                        {product.active === false ? (
                          <p className="mt-2 rounded-full bg-[#FFF5F5] px-3 py-1 text-xs font-black text-[#B5282D]">
                            Inaktiv
                          </p>
                        ) : (
                          <p className="mt-2 rounded-full bg-[#F0FFF6] px-3 py-1 text-xs font-black text-[#2F7D50]">
                            Aktiv
                          </p>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#D8C8B8] bg-[#FBF7F0] p-8 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-white text-[#A75B28]">
                <Sparkles className="h-6 w-6" />
              </div>

              <h3 className="text-xl font-black text-[#102A43]">
                Noch keine Produkte vorhanden.
              </h3>

              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#52616F]">
                Lege oben Dein erstes Produkt an oder nutze die mobile
                Produkterfassung mit Kamera. Danach kann es in Kundenlisten
                gefunden und manuell übernommen werden.
              </p>

              <Link
                href="/admin/produkte/mobile"
                className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
              >
                <Camera className="h-4 w-4" />
                Erstes Produkt per Kamera erfassen
              </Link>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
