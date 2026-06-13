import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    slug: string;
  }>;
};

type ProductRow = Record<string, unknown> & {
  id?: string | number | null;
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

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://www.handzettel-schulen.de"
  );
}

function getStringValue(product: ProductRow, keys: string[]) {
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

function getNumberValue(product: ProductRow, keys: string[]) {
  for (const key of keys) {
    const value = product[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value.replace(",", ".").replace(/[^\d.-]/g, ""));

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
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

function getProductId(product: ProductRow) {
  const rawId = product.id ?? getStringValue(product, ["product_id", "uuid"]);
  return rawId ? String(rawId) : "";
}

function getProductName(product: ProductRow) {
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

function getProductSku(product: ProductRow) {
  return getStringValue(product, [
    "sku",
    "product_sku",
    "article_number",
    "item_number",
    "artikelnummer",
  ]);
}

function getProductEan(product: ProductRow) {
  return getStringValue(product, ["ean", "gtin", "barcode"]);
}

function getProductPrice(product: ProductRow) {
  return getNumberValue(product, [
    "price",
    "gross_price",
    "product_price",
    "unit_price",
    "sale_price",
    "brutto_preis",
  ]);
}

function getProductCategory(product: ProductRow) {
  return getStringValue(product, ["category", "product_category", "type"]);
}

function getProductType(product: ProductRow) {
  return getStringValue(product, ["product_type", "type"]);
}

function getProductFormat(product: ProductRow) {
  return getStringValue(product, ["format", "size", "product_format"]);
}

function getProductColor(product: ProductRow) {
  return getStringValue(product, ["color", "colour", "farbe"]);
}

function getProductLineature(product: ProductRow) {
  return getStringValue(product, ["lineature", "lineatur", "ruling"]);
}

function getProductImageUrl(product: ProductRow) {
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

function getProductImageAlt(product: ProductRow, fallbackName: string) {
  return (
    getStringValue(product, [
      "image_alt_text",
      "image_alt",
      "alt_text",
      "seo_image_alt",
      "seo_alt",
    ]) || `${fallbackName} als Produktbild`
  );
}

function getProductDescription(product: ProductRow) {
  const direct =
    getStringValue(product, [
      "seo_description",
      "meta_description",
      "description",
      "short_description",
      "notes",
      "book_size_note",
    ]) || "";

  if (direct) {
    return direct;
  }

  const name = getProductName(product);
  const details = [
    getProductCategory(product),
    getProductType(product),
    getProductFormat(product),
    getProductLineature(product)
      ? `Lineatur ${getProductLineature(product)}`
      : null,
    getProductColor(product),
  ]
    .filter(Boolean)
    .join(", ");

  return details
    ? `${name} für die Schulmaterialliste. Details: ${details}.`
    : `${name} für die Schulmaterialliste bequem online nachkaufen.`;
}

function getProductSlug(product: ProductRow) {
  const explicit =
    getStringValue(product, ["seo_slug", "slug", "product_slug"]) || "";

  if (explicit) {
    return slugify(explicit);
  }

  const sku = getProductSku(product);
  const id = getProductId(product);

  return slugify([getProductName(product), sku || id].filter(Boolean).join(" "));
}

function isVisibleProduct(product: ProductRow) {
  if (product.active === false) {
    return false;
  }

  const status = getStringValue(product, ["status", "product_status"]);

  if (!status) {
    return true;
  }

  return !["inactive", "archived", "deleted", "disabled"].includes(
    status.toLowerCase()
  );
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

async function loadProductBySlug(slug: string) {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("school_products")
    .select("*")
    .limit(1500);

  if (error) {
    throw new Error(`Produkt konnte nicht geladen werden: ${error.message}`);
  }

  const normalizedSlug = slugify(slug);

  return (
    ((data || []) as ProductRow[]).find((product) => {
      if (!isVisibleProduct(product)) return false;
      return getProductSlug(product) === normalizedSlug;
    }) || null
  );
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProductBySlug(slug);

  if (!product) {
    return {
      title: "Produkt nicht gefunden | Handzettel-Schulen.de",
    };
  }

  const siteUrl = getSiteUrl();
  const name = getProductName(product);
  const description = getProductDescription(product).slice(0, 155);
  const imageUrl = getProductImageUrl(product);
  const canonicalUrl = `${siteUrl}/shop/produkt/${getProductSlug(product)}`;

  return {
    title: `${name} kaufen | Handzettel-Schulen.de`,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `${name} kaufen`,
      description,
      url: canonicalUrl,
      siteName: "Handzettel-Schulen.de",
      images: imageUrl
        ? [
            {
              url: imageUrl,
              alt: getProductImageAlt(product, name),
            },
          ]
        : [],
      type: "website",
    },
  };
}

export default async function ProductDetailPage({ params }: Params) {
  const { slug } = await params;
  const product = await loadProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const siteUrl = getSiteUrl();
  const name = getProductName(product);
  const sku = getProductSku(product);
  const ean = getProductEan(product);
  const price = getProductPrice(product);
  const category = getProductCategory(product);
  const productType = getProductType(product);
  const format = getProductFormat(product);
  const color = getProductColor(product);
  const lineature = getProductLineature(product);
  const imageUrl = getProductImageUrl(product);
  const imageAlt = getProductImageAlt(product, name);
  const description = getProductDescription(product);
  const productUrl = `${siteUrl}/shop/produkt/${getProductSlug(product)}`;

  const productJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description,
    image: imageUrl ? [imageUrl] : undefined,
    sku: sku || undefined,
    gtin13: ean && ean.length === 13 ? ean : undefined,
    gtin: ean || undefined,
    brand: {
      "@type": "Brand",
      name: "Handzettel-Schulen.de",
    },
    offers: {
      "@type": "Offer",
      url: productUrl,
      priceCurrency: "EUR",
      price: price > 0 ? price.toFixed(2) : "0.00",
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingDestination: {
          "@type": "DefinedRegion",
          addressCountry: "DE",
        },
        shippingRate: {
          "@type": "MonetaryAmount",
          value: "5.95",
          currency: "EUR",
        },
        deliveryTime: {
          "@type": "ShippingDeliveryTime",
          handlingTime: {
            "@type": "QuantitativeValue",
            minValue: 1,
            maxValue: 2,
            unitCode: "DAY",
          },
          transitTime: {
            "@type": "QuantitativeValue",
            minValue: 1,
            maxValue: 3,
            unitCode: "DAY",
          },
        },
      },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "DE",
        returnPolicyCategory:
          "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 14,
        returnMethod: "https://schema.org/ReturnByMail",
        returnFees: "https://schema.org/ReturnShippingFees",
        customerRemorseReturnFees: "https://schema.org/ReturnShippingFees",
        itemDefectReturnFees: "https://schema.org/FreeReturn",
        returnShippingFeesAmount: {
          "@type": "MonetaryAmount",
          value: "5.95",
          currency: "EUR",
        },
        refundType: "https://schema.org/FullRefund",
        merchantReturnLink:
          "https://www.handzettel-schulen.de/widerruf-rueckgabe",
      },
    },
  };

  return (
    <main className="min-h-screen bg-[#f7f1e8] text-[#172033]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(productJsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <section className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-8 md:px-8 lg:grid-cols-[minmax(0,560px)_1fr] lg:py-12">
        <div>
          <Link
            href="/shop"
            className="mb-5 inline-flex rounded-full bg-white px-4 py-2 text-sm font-bold text-[#172033] shadow-sm ring-1 ring-[#eadfce] transition hover:bg-[#172033] hover:text-white"
          >
            ← Zurück zum Shop
          </Link>

          <div className="overflow-hidden rounded-[2rem] bg-white shadow-sm ring-1 ring-[#eadfce]">
            <div className="flex min-h-[460px] items-center justify-center bg-[#fffaf2]">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt={imageAlt}
                  className="h-full w-full object-cover object-center"
                />
              ) : (
                <div className="p-8 text-center">
                  <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-[#f7f1e8] text-4xl">
                    📚
                  </div>
                  <p className="font-bold text-[#5b667a]">Produktbild folgt</p>
                </div>
              )}
            </div>
          </div>

          <p className="mt-4 rounded-[1.5rem] border border-[#eadfce] bg-[#fffaf2] px-4 py-3 text-xs font-semibold leading-5 text-[#5b667a]">
            <span className="font-black text-[#172033]">Hinweis:</span>{" "}
            Produktbilder dienen der besseren Orientierung und können KI-gestützt
            optimiert worden sein. Geringfügige optische Abweichungen sind
            möglich. Maßgeblich sind Artikelbeschreibung und Produktmerkmale.
          </p>
        </div>

        <article className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-[#eadfce] md:p-8">
          {category ? (
            <p className="mb-3 inline-flex rounded-full bg-[#f7f1e8] px-4 py-2 text-sm font-black text-[#9b2f23]">
              {category}
            </p>
          ) : null}

          <h1 className="text-4xl font-black tracking-tight text-[#172033] md:text-5xl">
            {name}
          </h1>

          <p className="mt-5 text-lg leading-8 text-[#4c5870]">
            {description}
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {sku ? (
              <span className="rounded-full bg-[#f7f1e8] px-3 py-1.5 text-xs font-bold text-[#4c5870]">
                Art.-Nr.: {sku}
              </span>
            ) : null}

            {ean ? (
              <span className="rounded-full bg-[#f7f1e8] px-3 py-1.5 text-xs font-bold text-[#4c5870]">
                EAN: {ean}
              </span>
            ) : null}

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

            {productType ? (
              <span className="rounded-full bg-[#f7f1e8] px-3 py-1.5 text-xs font-bold text-[#4c5870]">
                Typ: {productType}
              </span>
            ) : null}
          </div>

          <div className="mt-8 rounded-[2rem] bg-[#172033] p-6 text-white">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-white/70">
              Preis
            </p>
            <p className="mt-2 text-4xl font-black">{formatPrice(price)}</p>
            <p className="mt-2 text-sm font-semibold text-white/70">
              Alle Angaben vorbehaltlich Verfügbarkeit und finaler Prüfung.
            </p>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link
              href="/shop"
              className="inline-flex justify-center rounded-2xl bg-[#9b2f23] px-5 py-4 text-sm font-black text-white shadow-sm transition hover:bg-[#172033]"
            >
              Im Shop suchen
            </Link>

            <Link
              href="/shop/warenkorb"
              className="inline-flex justify-center rounded-2xl bg-[#f7f1e8] px-5 py-4 text-sm font-black text-[#172033] ring-1 ring-[#eadfce] transition hover:bg-white"
            >
              Warenkorb ansehen
            </Link>
          </div>
        </article>
      </section>
    </main>
  );
}