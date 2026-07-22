import { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

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
    return null;
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

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
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
    status.toLowerCase(),
  );
}

function getSafeLastModified(
  value: string | null,
  fallback: Date,
) {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);

  if (!Number.isFinite(parsed.getTime())) {
    return fallback;
  }

  return parsed;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/shop`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/widerruf-rueckgabe`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${siteUrl}/impressum`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${siteUrl}/datenschutz`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];

  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return staticRoutes;
  }

  const { data, error } = await supabase
    .from("school_products")
    .select("*")
    .limit(1500);

  if (error) {
    return staticRoutes;
  }

  const usedUrls = new Set(staticRoutes.map((entry) => entry.url));

  const productRoutes: MetadataRoute.Sitemap = [];

  for (const product of (data || []) as ProductRow[]) {
    if (!isVisibleProduct(product)) {
      continue;
    }

    const slug = getProductSlug(product);

    if (!slug) {
      continue;
    }

    const url = `${siteUrl}/shop/produkt/${slug}`;

    if (usedUrls.has(url)) {
      continue;
    }

    usedUrls.add(url);

    const updatedAt = getStringValue(product, [
      "updated_at",
      "created_at",
    ]);

    productRoutes.push({
      url,
      lastModified: getSafeLastModified(updatedAt, now),
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  return [...staticRoutes, ...productRoutes];
}
