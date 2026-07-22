import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getProductAvailability,
  getProductAvailabilityDate,
  getProductBrand,
  getProductGtin,
  getProductMpn,
  productHasUniqueIdentifiers,
} from "@/lib/product-commerce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 3600;

type ProductRow = Record<string, unknown> & {
  id?: string | number | null;
  updated_at?: string | null;
  created_at?: string | null;
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

function cleanText(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function getStringValue(product: ProductRow, keys: string[]) {
  for (const key of keys) {
    const value = product[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return "";
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

function escapeXml(value: unknown) {
  return cleanText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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

function normalizeMerchantDescription(value: unknown) {
  const raw = cleanText(value)
    .replace(/…/g, "")
    .replace(/\.\.\./g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!raw) {
    return "";
  }

  if (raw.length <= 5000) {
    return raw;
  }

  const shortened = raw.slice(0, 4990);
  const lastSentenceEnd = Math.max(
    shortened.lastIndexOf("."),
    shortened.lastIndexOf("!"),
    shortened.lastIndexOf("?")
  );

  if (lastSentenceEnd > 120) {
    return shortened.slice(0, lastSentenceEnd + 1).trim();
  }

  return shortened.trim();
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
    return normalizeMerchantDescription(direct);
  }

  const name = getProductName(product);
  const details = [
    getProductCategory(product),
    getProductType(product),
    getProductFormat(product),
    getProductLineature(product)
      ? `Lineatur ${getProductLineature(product)}`
      : "",
    getProductColor(product),
  ]
    .filter(Boolean)
    .join(", ");

  return normalizeMerchantDescription(
    details
      ? `${name} für die Schulmaterialliste. Details: ${details}.`
      : `${name} für die Schulmaterialliste bequem online nachkaufen.`
  );
}

function getProductSlug(product: ProductRow) {
  const explicit = getStringValue(product, ["seo_slug", "slug", "product_slug"]);

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

function getGoogleProductCategory(product: ProductRow) {
  const combined = `${getProductCategory(product)} ${getProductType(product)} ${getProductName(product)}`.toLowerCase();

  if (
    combined.includes("ranz") ||
    combined.includes("sporttasche") ||
    combined.includes("beutel")
  ) {
    return "5181"; // Luggage & Bags
  }

  if (
    combined.includes("kleber") ||
    combined.includes("schere") ||
    combined.includes("papier") ||
    combined.includes("heft") ||
    combined.includes("umschlag") ||
    combined.includes("stift") ||
    combined.includes("füller") ||
    combined.includes("fueller") ||
    combined.includes("block") ||
    combined.includes("mappe") ||
    combined.includes("lineal") ||
    combined.includes("zirkel") ||
    combined.includes("geodreieck")
  ) {
    return "922"; // Office Supplies
  }

  return "922";
}

function buildProductType(product: ProductRow) {
  return [
    "Schulmaterial",
    getProductCategory(product),
    getProductType(product),
    getProductFormat(product),
  ]
    .filter(Boolean)
    .join(" > ");
}

function buildFeedItem(product: ProductRow) {
  const siteUrl = getSiteUrl();
  const id = getProductSku(product) || getProductId(product);
  const title = getProductName(product).slice(0, 150);
  const description = getProductDescription(product);
  const slug = getProductSlug(product);
  const link = `${siteUrl}/shop/produkt/${slug}`;
  const imageUrl = getProductImageUrl(product);
  const price = getProductPrice(product);
  const gtin = getProductGtin(product);
  const brand = getProductBrand(product);
  const mpn = getProductMpn(product);
  const availability = getProductAvailability(product);
  const availabilityDate = getProductAvailabilityDate(product);
  const identifierExists = productHasUniqueIdentifiers(product);
  const color = getProductColor(product);
  const productType = buildProductType(product);
  const googleProductCategory = getGoogleProductCategory(product);

  if (!id || !title || !slug || price <= 0 || !imageUrl) {
    return "";
  }

  const gtinTag = gtin
    ? `<g:gtin>${escapeXml(gtin)}</g:gtin>`
    : "";

  const brandTag = brand
    ? `<g:brand>${escapeXml(brand)}</g:brand>`
    : "";

  const mpnTag = brand && mpn
    ? `<g:mpn>${escapeXml(mpn)}</g:mpn>`
    : "";

  const availabilityDateTag =
    availabilityDate &&
    (availability === "preorder" || availability === "backorder")
      ? `<g:availability_date>${escapeXml(availabilityDate)}</g:availability_date>`
      : "";

  const colorTag = color
    ? `<g:color>${escapeXml(color)}</g:color>`
    : "";

  return `
    <item>
      <g:id>${escapeXml(id)}</g:id>
      <g:title>${escapeXml(title)}</g:title>
      <g:description>${escapeXml(description)}</g:description>
      <g:link>${escapeXml(link)}</g:link>
      <g:image_link>${escapeXml(imageUrl)}</g:image_link>
      <g:availability>${escapeXml(availability)}</g:availability>
      ${availabilityDateTag}
      <g:price>${price.toFixed(2)} EUR</g:price>
      <g:condition>new</g:condition>
      ${brandTag}
      ${gtinTag}
      ${mpnTag}
      <g:identifier_exists>${identifierExists ? "yes" : "no"}</g:identifier_exists>
      ${colorTag}
      <g:google_product_category>${escapeXml(googleProductCategory)}</g:google_product_category>
      <g:product_type>${escapeXml(productType)}</g:product_type>
    </item>`;
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("school_products")
      .select("*")
      .limit(1500);

    if (error) {
      throw new Error(`Produkte konnten nicht geladen werden: ${error.message}`);
    }

    const items = ((data || []) as ProductRow[])
      .filter(isVisibleProduct)
      .map(buildProductItemSafely)
      .filter(Boolean)
      .join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Handzettel-Schulen.de Produktfeed</title>
    <link>${escapeXml(getSiteUrl())}</link>
    <description>Schulmaterial-Produkte von Handzettel-Schulen.de</description>
    ${items}
  </channel>
</rss>`;

    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Produktfeed konnte nicht erzeugt werden.";

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Handzettel-Schulen.de Produktfeed</title>
    <link>${escapeXml(getSiteUrl())}</link>
    <description>${escapeXml(message)}</description>
  </channel>
</rss>`;

    return new NextResponse(xml, {
      status: 500,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
      },
    });
  }
}

function buildProductItemSafely(product: ProductRow) {
  try {
    return buildFeedItem(product);
  } catch {
    return "";
  }
}
