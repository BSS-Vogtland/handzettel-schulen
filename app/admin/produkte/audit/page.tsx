import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProductRow = {
  id: string;
  name?: string | null;
  product_name?: string | null;
  sku?: string | null;
  product_sku?: string | null;
  ean?: string | null;
  category?: string | null;
  product_type?: string | null;
  format?: string | null;
  color?: string | null;
  lineature?: string | null;
  active?: boolean | null;
  updated_at?: string | null;
};

type AliasRow = {
  product_id?: string | null;
  alias?: string | null;
  alias_text?: string | null;
  keyword?: string | null;
  value?: string | null;
  name?: string | null;
};

type AuditLevel = "good" | "warning" | "danger";

type AuditResult = {
  level: AuditLevel;
  positives: string[];
  missing: string[];
  warnings: string[];
  suggestions: string[];
  unsafeAliases: string[];
  genericAliases: string[];
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase-Konfiguration fehlt.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalize(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/\u00e4/g, "ae")
    .replace(/\u00f6/g, "oe")
    .replace(/\u00fc/g, "ue")
    .replace(/\u00df/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getProductName(product: ProductRow) {
  return clean(product.name) || clean(product.product_name) || "Unbenanntes Produkt";
}

function getProductSku(product: ProductRow) {
  return clean(product.sku) || clean(product.product_sku) || "";
}

function getAliasValue(alias: AliasRow) {
  return (
    clean(alias.alias) ||
    clean(alias.alias_text) ||
    clean(alias.keyword) ||
    clean(alias.value) ||
    clean(alias.name)
  );
}

function includesAny(text: string, values: string[]) {
  return values.some((value) => text.includes(normalize(value)));
}

function inferCategory(product: ProductRow) {
  const text = normalize([getProductName(product), product.product_type, product.category].join(" "));

  if (includesAny(text, ["wachsmal", "pinsel", "tuschkasten", "farbkasten", "schulmalfarben", "mischpalette", "schere"])) {
    return "Kunst";
  }

  if (includesAny(text, ["schreibheft", "hausaufgabenheft", "vokabelheft", "umschlag"])) {
    return "Hefte";
  }

  if (includesAny(text, ["schnellhefter", "papphefter", "sammelmappe", "postmappe", "kunstmappe", "mappe"])) {
    return "Mappen";
  }

  if (includesAny(text, ["lineal", "geodreieck", "zirkel"])) {
    return "Zeichnen";
  }

  if (includesAny(text, ["klebestift", "kleber"])) {
    return "Kleben";
  }

  if (includesAny(text, ["bleistift", "radiergummi", "spitzer", "textmarker", "buntstift", "filzstift"])) {
    return "Schreiben";
  }

  if (includesAny(text, ["stehsammler"])) {
    return "Organisation";
  }

  return "";
}

function inferProductType(product: ProductRow) {
  const text = normalize([getProductName(product), product.product_type, product.category].join(" "));

  const checks: Array<[string, string[]]> = [
    ["Wachsmalstifte", ["wachsmalstift", "wachsmalstifte", "wachsmalkreide", "malkreide"]],
    ["Filzstifte", ["filzstift", "filzstifte"]],
    ["Buntstifte", ["buntstift", "buntstifte"]],
    ["Pinsel", ["borstenpinsel", "haarpinsel", "pinsel"]],
    ["Tuschkasten", ["tuschkasten", "farbkasten", "schulmalfarben"]],
    ["Mischpalette", ["mischpalette"]],
    ["Federmappe", ["federmappe", "federtasche", "schlampermappe"]],
    ["Schnellhefter", ["schnellhefter"]],
    ["Papphefter", ["papphefter"]],
    ["Sammelmappe", ["sammelmappe", "kunstmappe"]],
    ["Postmappe", ["postmappe"]],
    ["Schreibheft", ["schreibheft"]],
    ["Hausaufgabenheft", ["hausaufgabenheft"]],
    ["Umschlag", ["umschlag", "heftumschlag", "buchumschlag"]],
    ["Lineal", ["lineal"]],
    ["Geodreieck", ["geodreieck"]],
    ["Zirkel", ["zirkel"]],
    ["Klebestift", ["klebestift"]],
    ["Schere", ["bastelschere", "schere"]],
    ["Stehsammler", ["stehsammler"]],
    ["Bleistift", ["bleistift"]],
    ["Radiergummi", ["radiergummi"]],
    ["Spitzer", ["doppelanspitzer", "spitzer"]],
    ["Textmarker", ["textmarker"]],
  ];

  for (const [type, words] of checks) {
    if (includesAny(text, words)) return type;
  }

  return "";
}

function inferFormat(product: ProductRow) {
  const text = normalize(getProductName(product));

  if (/\ba3\b/.test(text)) return "A3";
  if (/\ba4\b/.test(text)) return "A4";
  if (/\ba5\b/.test(text)) return "A5";

  return "";
}

function inferColor(product: ProductRow) {
  const text = normalize(getProductName(product));

  const colors: Array<[string, string]> = [
    ["blau", "blau"],
    ["gelb", "gelb"],
    ["gruen", "gruen"],
    ["rot", "rot"],
    ["weiss", "weiss"],
    ["orange", "orange"],
    ["lila", "lila"],
    ["schwarz", "schwarz"],
    ["mehrfarbig", "mehrfarbig"],
  ];

  for (const [needle, label] of colors) {
    if (text.includes(needle)) return label;
  }

  if (/\b\d{1,2}\s*farben\b/.test(text)) return "mehrfarbig";

  return "";
}

function inferLineature(product: ProductRow) {
  const text = normalize(getProductName(product));
  const match = text.match(/\b(lineatur|lin|nr|nummer)\s*(0|1|2|3|4|5|6|7|8f|9|10|20|25|26|27|28|dm|sl)\b/);

  return match?.[2] || "";
}

function detectCore(product: ProductRow) {
  return normalize(product.product_type || inferProductType(product));
}

const blockedTermsByCore: Record<string, string[]> = {
  wachsmalstifte: ["filzstift", "buntstift", "pinsel", "tuschkasten", "farbkasten", "schulmalfarben", "mischpalette"],
  filzstifte: ["wachsmalstift", "wachsmalkreide", "buntstift", "pinsel", "tuschkasten", "farbkasten", "schulmalfarben", "mischpalette"],
  buntstifte: ["wachsmalstift", "wachsmalkreide", "filzstift", "pinsel", "tuschkasten", "farbkasten", "schulmalfarben", "mischpalette"],
  pinsel: ["wachsmalstift", "filzstift", "buntstift", "tuschkasten", "farbkasten", "schulmalfarben", "mischpalette"],
  tuschkasten: ["wachsmalstift", "filzstift", "buntstift", "pinsel", "mischpalette"],
  mischpalette: ["wachsmalstift", "filzstift", "buntstift", "pinsel", "tuschkasten", "farbkasten", "schulmalfarben"],
  federmappe: ["sammelmappe", "postmappe", "kunstmappe", "schnellhefter", "papphefter", "schreibheft", "hausaufgabenheft"],
  schnellhefter: ["federmappe", "federtasche", "schlampermappe", "schreibheft", "hausaufgabenheft", "lineatur"],
  papphefter: ["federmappe", "federtasche", "schlampermappe", "schreibheft", "hausaufgabenheft", "lineatur"],
  sammelmappe: ["federmappe", "federtasche", "schlampermappe", "schreibheft", "hausaufgabenheft", "lineatur"],
  postmappe: ["federmappe", "federtasche", "schlampermappe", "schreibheft", "hausaufgabenheft", "lineatur"],
  schreibheft: ["schnellhefter", "papphefter", "sammelmappe", "postmappe", "federmappe"],
  hausaufgabenheft: ["schnellhefter", "papphefter", "sammelmappe", "postmappe", "federmappe"],
  schere: ["kleber", "klebestift", "uhu", "pinsel", "wachsmalstift", "tuschkasten"],
  klebestift: ["schere", "bastelschere", "pinsel", "wachsmalstift", "tuschkasten"],
  lineal: ["geodreieck", "zirkel", "winkelmesser"],
  stehsammler: ["schulranzen", "schulrucksack", "ranzen", "rucksack", "federmappe", "turnbeutel"],
};

function isGenericAlias(alias: string, product: ProductRow) {
  const normalizedAlias = normalize(alias);
  const sku = normalize(getProductSku(product));

  if (!normalizedAlias) return true;
  if (sku && normalizedAlias.includes(sku)) return false;

  const category = normalize(product.category);
  const format = normalize(product.format);
  const color = normalize(product.color);
  const lineature = normalize(product.lineature);

  const singleValues = [category, format, color, lineature].filter(Boolean);

  if (singleValues.includes(normalizedAlias)) return true;
  if (/^\d{1,2}\s*farben$/.test(normalizedAlias)) return true;

  const combinations = [
    [category, color],
    [category, format],
    [category, lineature],
    [format, color],
    [format, lineature],
    [color, lineature],
  ]
    .filter((parts) => parts.every(Boolean))
    .map((parts) => parts.join(" "));

  return combinations.includes(normalizedAlias);
}

function auditProduct(product: ProductRow, aliases: string[]): AuditResult {
  const positives: string[] = [];
  const missing: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];
  const unsafeAliases: string[] = [];
  const genericAliases: string[] = [];

  const category = clean(product.category);
  const productType = clean(product.product_type);
  const format = clean(product.format);
  const color = clean(product.color);
  const lineature = clean(product.lineature);

  const inferredCategory = inferCategory(product);
  const inferredType = inferProductType(product);
  const inferredFormat = inferFormat(product);
  const inferredColor = inferColor(product);
  const inferredLineature = inferLineature(product);

  if (category) positives.push("Kategorie gepflegt");
  else {
    missing.push("Kategorie fehlt");
    if (inferredCategory) suggestions.push("Kategorie-Vorschlag: " + inferredCategory);
  }

  if (productType) positives.push("Typ / Kernartikel gepflegt");
  else {
    missing.push("Typ / Kernartikel fehlt");
    if (inferredType) suggestions.push("Typ-Vorschlag: " + inferredType);
  }

  const combined = normalize([getProductName(product), category, productType, format, color, lineature].join(" "));
  const effectiveType = normalize(productType || inferredType);

  const auditText = effectiveType + " " + combined;
  const isUmschlag = includesAny(auditText, ["umschlag", "buchumschlag", "heftumschlag", "buchfolie"]);
  const isTrueLineatureHeft = includesAny(auditText, ["schreibheft", "schulheft", "geometrie heft"]);
  const isHeft = isTrueLineatureHeft || includesAny(auditText, ["hausaufgabenheft", "vokabelheft"]) || isUmschlag;
  const isMappe = includesAny(auditText, ["schnellhefter", "papphefter", "sammelmappe", "postmappe", "kunstmappe"]);
  const isFedermappe = includesAny(auditText, ["federmappe", "federtasche", "schlampermappe"]);
  const isPinsel = includesAny(auditText, ["pinsel"]);
  const isLineal = includesAny(auditText, ["lineal"]);
  const isKlebestift = includesAny(auditText, ["klebestift"]);
  const needsLineature = isTrueLineatureHeft;

  if ((isHeft || isMappe) && !isFedermappe) {
    if (format) positives.push("Format gepflegt");
    else {
      missing.push("Format fehlt");
      if (inferredFormat) suggestions.push("Format-Vorschlag: " + inferredFormat);
    }
  }

  if ((isMappe || isUmschlag) && !isFedermappe) {
    if (color) positives.push("Farbe gepflegt");
    else {
      missing.push("Farbe fehlt");
      if (inferredColor) suggestions.push("Farbe-Vorschlag: " + inferredColor);
    }
  }

  if (needsLineature) {
    if (lineature) positives.push("Lineatur gepflegt");
    else {
      missing.push("Lineatur fehlt");
      if (inferredLineature) suggestions.push("Lineatur-Vorschlag: " + inferredLineature);
    }
  }

  const hasPinselNumber =
    /\bpinsel\s*(nr|nummer)?\s*([1-9]|[12][0-9]|30)\b/.test(combined) ||
    /\b(nr|nummer)\s*([1-9]|[12][0-9]|30)\b/.test(combined);

  if (isPinsel && !hasPinselNumber) {
    missing.push("Pinselnummer fehlt");
  }

  if (isLineal && !/\b(10|15|16|17|20|30)\s*cm\b|\b(10|15|16|17|20|30)\b/.test(combined)) {
    missing.push("Lineallaenge fehlt");
  }

  if (isKlebestift && !includesAny(combined, ["gross", "grosser", "groß", "klein", "mittel"])) {
    missing.push("Klebestift-Groesse fehlt");
  }

  const core = detectCore(product);
  const blockedTerms = blockedTermsByCore[core] || [];

  for (const alias of aliases) {
    const normalizedAlias = normalize(alias);

    if (!normalizedAlias) continue;

    if (blockedTerms.some((term) => normalizedAlias.includes(normalize(term)))) {
      unsafeAliases.push(alias);
    }

    if (isGenericAlias(alias, product)) {
      genericAliases.push(alias);
    }
  }

  if (unsafeAliases.length > 0) warnings.push("Gefaehrliche artverwandte Aliase vorhanden");
  if (genericAliases.length > 0) missing.push("Zu allgemeine Aliase prüfen");

  const level: AuditLevel =
    warnings.length > 0 ? "danger" : missing.length > 0 || suggestions.length > 0 ? "warning" : "good";

  return {
    level,
    positives,
    missing,
    warnings,
    suggestions,
    unsafeAliases,
    genericAliases,
  };
}

function levelLabel(level: AuditLevel) {
  if (level === "good") return "Gut";
  if (level === "warning") return "Unvollstaendig";
  return "Risiko";
}

function levelClass(level: AuditLevel) {
  if (level === "good") return "border-[#B8E2C8] bg-[#F4FBF6]";
  if (level === "warning") return "border-[#F0D59A] bg-[#FFF9E8]";
  return "border-[#F1B7B7] bg-[#FFF5F5]";
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => clean(value)).filter(Boolean)));
}


type AuditFilter =
  | "all"
  | "missing-type"
  | "missing-variants"
  | "generic-aliases"
  | "incomplete"
  | "good";

function normalizeSearchParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function getAuditFilter(value: string | string[] | undefined): AuditFilter {
  const filter = normalizeSearchParam(value);

  if (
    filter === "missing-type" ||
    filter === "missing-variants" ||
    filter === "generic-aliases" ||
    filter === "incomplete" ||
    filter === "good"
  ) {
    return filter;
  }

  return "all";
}

function matchesAuditFilter(entry: { audit: AuditResult }, filter: AuditFilter) {
  if (filter === "all") return true;

  if (filter === "missing-type") {
    return entry.audit.missing.some((item) =>
      normalize(item).includes("typ kernartikel fehlt")
    );
  }

  if (filter === "missing-variants") {
    return entry.audit.missing.some((item) => {
      const normalized = normalize(item);

      return (
        normalized.includes("format fehlt") ||
        normalized.includes("farbe fehlt") ||
        normalized.includes("lineatur fehlt") ||
        normalized.includes("pinselnummer fehlt") ||
        normalized.includes("lineallaenge fehlt") ||
        normalized.includes("klebestift groesse fehlt")
      );
    });
  }

  if (filter === "generic-aliases") {
    return entry.audit.genericAliases.length > 0;
  }

  if (filter === "incomplete") {
    return entry.audit.level === "warning";
  }

  if (filter === "good") {
    return entry.audit.level === "good";
  }

  return true;
}

function matchesAuditSearch(entry: { product: ProductRow; aliases: string[] }, searchQuery: string) {
  const query = normalize(searchQuery);

  if (!query) return true;

  const haystack = normalize([
    getProductName(entry.product),
    getProductSku(entry.product),
    entry.product.category,
    entry.product.product_type,
    entry.product.format,
    entry.product.color,
    entry.product.lineature,
    entry.aliases.join(" "),
  ].join(" "));

  return haystack.includes(query);
}

function buildAuditHref(filter: AuditFilter, searchQuery: string) {
  const params = new URLSearchParams();

  if (filter !== "all") params.set("filter", filter);
  if (searchQuery.trim()) params.set("q", searchQuery.trim());

  const query = params.toString();

  return query ? `/admin/produkte/audit?${query}` : "/admin/produkte/audit";
}

function filterButtonClass(active: boolean) {
  return [
    "inline-flex rounded-full border px-4 py-2 text-xs font-black transition",
    active
      ? "border-[#12395F] bg-[#12395F] text-white"
      : "border-[#D8C8B8] bg-white text-[#12395F] hover:border-[#12395F]",
  ].join(" ");
}

export default async function ProductAuditPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const activeFilter = getAuditFilter(resolvedSearchParams.filter);
  const searchQuery = normalizeSearchParam(resolvedSearchParams.q);

  let products: ProductRow[] = [];
  let aliasesByProductId = new Map<string, string[]>();
  let errorMessage: string | null = null;

  try {
    const supabase = getSupabaseAdmin();

    const { data: productData, error: productError } = await supabase
      .from("school_products")
      .select("*")
      .order("name", { ascending: true });

    if (productError) throw productError;

    products = (productData || []) as ProductRow[];

    const { data: aliasData, error: aliasError } = await supabase
      .from("school_product_aliases")
      .select("*")
      .limit(20000);

    if (aliasError) throw aliasError;

    for (const row of (aliasData || []) as AliasRow[]) {
      const productId = clean(row.product_id);
      const alias = getAliasValue(row);

      if (!productId || !alias) continue;

      const current = aliasesByProductId.get(productId) || [];
      current.push(alias);
      aliasesByProductId.set(productId, current);
    }
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Produktdaten-Audit konnte nicht geladen werden.";
  }

  const auditedProducts = products.map((product) => {
    const aliases = unique(aliasesByProductId.get(product.id) || []);
    const audit = auditProduct(product, aliases);

    return {
      product,
      aliases,
      audit,
    };
  });

  const filteredProducts = auditedProducts.filter((entry) => {
    return (
      matchesAuditFilter(entry, activeFilter) &&
      matchesAuditSearch(entry, searchQuery)
    );
  });

  const filterCounts: Record<AuditFilter, number> = {
    all: auditedProducts.length,
    "missing-type": auditedProducts.filter((entry) =>
      matchesAuditFilter(entry, "missing-type")
    ).length,
    "missing-variants": auditedProducts.filter((entry) =>
      matchesAuditFilter(entry, "missing-variants")
    ).length,
    "generic-aliases": auditedProducts.filter((entry) =>
      matchesAuditFilter(entry, "generic-aliases")
    ).length,
    incomplete: auditedProducts.filter((entry) =>
      matchesAuditFilter(entry, "incomplete")
    ).length,
    good: auditedProducts.filter((entry) => matchesAuditFilter(entry, "good"))
      .length,
  };

  const sortedProducts = filteredProducts.sort((a, b) => {
    const rank: Record<AuditLevel, number> = {
      danger: 0,
      warning: 1,
      good: 2,
    };

    const rankDifference = rank[a.audit.level] - rank[b.audit.level];

    if (rankDifference !== 0) return rankDifference;

    return getProductName(a.product).localeCompare(getProductName(b.product), "de", {
      numeric: true,
      sensitivity: "base",
    });
  });

  const goodCount = auditedProducts.filter((entry) => entry.audit.level === "good").length;
  const warningCount = auditedProducts.filter((entry) => entry.audit.level === "warning").length;
  const dangerCount = auditedProducts.filter((entry) => entry.audit.level === "danger").length;

  return (
    <main className="min-h-screen bg-[#F7F1E8] px-4 py-8 text-[#102A43]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div>
          <Link
            href="/admin/produkte"
            className="mb-3 inline-flex rounded-full bg-white px-4 py-2 text-xs font-black text-[#12395F] shadow-sm"
          >
            Zurueck zu Produkte
          </Link>

          <div className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
            Produktdaten-Audit
          </div>

          <h1 className="mt-3 text-3xl font-black">Matching-Daten prüfen</h1>

          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
            Diese Seite prueft die bereits befuellten Produktfelder und Aliase. Es werden keine Daten veraendert.
          </p>
        </div>

        {errorMessage ? (
          <section className="rounded-[28px] border border-[#F1B7B7] bg-[#FFF5F5] p-5 text-sm font-bold text-[#A11D1D]">
            {errorMessage}
          </section>
        ) : null}

        <section className="rounded-[28px] border border-[#D8C8B8] bg-white p-4 shadow-sm">
          <div className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
            Filter und Suche
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={buildAuditHref("all", searchQuery)}
              className={filterButtonClass(activeFilter === "all")}
            >
              Alle ({filterCounts.all})
            </Link>

            <Link
              href={buildAuditHref("missing-type", searchQuery)}
              className={filterButtonClass(activeFilter === "missing-type")}
            >
              Typ fehlt ({filterCounts["missing-type"]})
            </Link>

            <Link
              href={buildAuditHref("missing-variants", searchQuery)}
              className={filterButtonClass(activeFilter === "missing-variants")}
            >
              Varianten fehlen ({filterCounts["missing-variants"]})
            </Link>

            <Link
              href={buildAuditHref("generic-aliases", searchQuery)}
              className={filterButtonClass(activeFilter === "generic-aliases")}
            >
              Allgemeine Aliase ({filterCounts["generic-aliases"]})
            </Link>

            <Link
              href={buildAuditHref("incomplete", searchQuery)}
              className={filterButtonClass(activeFilter === "incomplete")}
            >
              Unvollständig ({filterCounts.incomplete})
            </Link>

            <Link
              href={buildAuditHref("good", searchQuery)}
              className={filterButtonClass(activeFilter === "good")}
            >
              Gut ({filterCounts.good})
            </Link>
          </div>

          <form
            action="/admin/produkte/audit"
            className="mt-4 flex flex-col gap-2 md:flex-row"
          >
            <input type="hidden" name="filter" value={activeFilter} />

            <input
              name="q"
              defaultValue={searchQuery}
              placeholder="Produkt, SKU, Kategorie, Typ oder Alias suchen..."
              className="min-h-11 flex-1 rounded-2xl border border-[#D8C8B8] bg-[#FBF7F0] px-4 text-sm font-bold outline-none focus:border-[#12395F] focus:ring-4 focus:ring-[#12395F]/10"
            />

            <button className="rounded-2xl bg-[#12395F] px-5 py-3 text-sm font-black text-white">
              Suchen
            </button>

            {searchQuery ? (
              <Link
                href={buildAuditHref(activeFilter, "")}
                className="inline-flex items-center justify-center rounded-2xl border border-[#D8C8B8] bg-white px-5 py-3 text-sm font-black text-[#12395F]"
              >
                Suche löschen
              </Link>
            ) : null}
          </form>

          <p className="mt-3 text-xs font-semibold text-[#52616F]">
            Angezeigt: {filteredProducts.length} von {auditedProducts.length} Artikeln.
          </p>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-[24px] border border-[#B8E2C8] bg-[#F4FBF6] p-5">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-[#1F6B35]">Gut</div>
            <div className="mt-2 text-3xl font-black">{goodCount}</div>
          </div>

          <div className="rounded-[24px] border border-[#F0D59A] bg-[#FFF9E8] p-5">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-[#8A5A00]">Unvollstaendig</div>
            <div className="mt-2 text-3xl font-black">{warningCount}</div>
          </div>

          <div className="rounded-[24px] border border-[#F1B7B7] bg-[#FFF5F5] p-5">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-[#A11D1D]">Risiko</div>
            <div className="mt-2 text-3xl font-black">{dangerCount}</div>
          </div>
        </section>

        <section className="grid gap-4">
          {sortedProducts.length === 0 ? (
            <div className="rounded-[28px] border border-[#D8C8B8] bg-white p-6 text-sm font-bold text-[#52616F]">
              Keine Produkte für diesen Filter gefunden.
            </div>
          ) : null}

          {sortedProducts.map(({ product, aliases, audit }) => (
            <article
              key={product.id}
              className={["rounded-[28px] border p-5 shadow-sm", levelClass(audit.level)].join(" ")}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.14em] opacity-80">
                    {levelLabel(audit.level)}
                  </div>

                  <h2 className="mt-1 text-xl font-black text-[#102A43]">
                    {getProductName(product)}
                  </h2>

                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-[#52616F]">
                    <span className="rounded-full bg-white px-3 py-1">Art.-Nr.: {getProductSku(product) || "fehlt"}</span>
                    <span className="rounded-full bg-white px-3 py-1">Kategorie: {clean(product.category) || "fehlt"}</span>
                    <span className="rounded-full bg-white px-3 py-1">Typ: {clean(product.product_type) || "fehlt"}</span>
                    <span className="rounded-full bg-white px-3 py-1">Format: {clean(product.format) || "-"}</span>
                    <span className="rounded-full bg-white px-3 py-1">Farbe: {clean(product.color) || "-"}</span>
                    <span className="rounded-full bg-white px-3 py-1">Lineatur: {clean(product.lineature) || "-"}</span>
                    <span className="rounded-full bg-white px-3 py-1">Aliase: {aliases.length}</span>
                  </div>
                </div>

                <Link
                  href="/admin/produkte"
                  className="inline-flex rounded-full bg-[#12395F] px-4 py-2 text-xs font-black text-white"
                >
                  In Produktverwaltung oeffnen
                </Link>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-4">
                <AuditBox title="Gepflegt" items={audit.positives} empty="Keine Staerken erkannt." />
                <AuditBox title="Fehlt" items={audit.missing} empty="Keine Pflichtluecken erkannt." />
                <AuditBox title="Risiken" items={audit.warnings} empty="Keine Risiken erkannt." />
                <AuditBox title="Vorschlaege" items={audit.suggestions} empty="Keine Vorschlaege noetig." />
              </div>

              {audit.unsafeAliases.length > 0 || audit.genericAliases.length > 0 ? (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {audit.unsafeAliases.length > 0 ? (
                    <AliasBox title="Gefaehrliche Aliase" aliases={audit.unsafeAliases} tone="danger" />
                  ) : null}

                  {audit.genericAliases.length > 0 ? (
                    <AliasBox title="Zu allgemeine Aliase" aliases={audit.genericAliases} tone="warning" />
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

function AuditBox(props: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-2xl bg-white p-3">
      <div className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-[#12395F]">
        {props.title}
      </div>

      {props.items.length > 0 ? (
        <ul className="space-y-1 text-xs font-semibold leading-5 text-[#52616F]">
          {props.items.map((item) => (
            <li key={item}>- {item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs font-semibold text-[#52616F]">{props.empty}</p>
      )}
    </div>
  );
}

function AliasBox(props: { title: string; aliases: string[]; tone: "danger" | "warning" }) {
  const className =
    props.tone === "danger"
      ? "rounded-full bg-[#FFF5F5] px-3 py-1 text-xs font-bold text-[#A11D1D]"
      : "rounded-full bg-[#FFF9E8] px-3 py-1 text-xs font-bold text-[#8A5A00]";

  return (
    <div className="rounded-2xl bg-white p-3">
      <div className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-[#12395F]">
        {props.title}
      </div>

      <div className="flex flex-wrap gap-2">
        {props.aliases.map((alias) => (
          <span key={alias} className={className}>
            {alias}
          </span>
        ))}
      </div>
    </div>
  );
}