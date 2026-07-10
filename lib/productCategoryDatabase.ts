import { PRODUCT_CATEGORY_OPTIONS } from "@/lib/productCategories";

export type ProductCategoryOptionRecord = {
  id: string;
  value: string;
  label: string;
  keywords: string[];
  sortOrder: number;
  isActive: boolean;
  source?: "database" | "fallback";
};

type ProductCategoryDbRow = {
  id?: unknown;
  value?: unknown;
  label?: unknown;
  keywords?: unknown;
  sort_order?: unknown;
  is_active?: unknown;
};

type SupabaseLike = {
  from: (table: string) => any;
};

function cleanString(value: unknown) {
  const cleaned = String(value || "").trim();
  return cleaned.length > 0 ? cleaned : "";
}

export function normalizeCategoryKey(value: unknown) {
  return cleanString(value)
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/&/g, " und ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function splitCategoryKeywords(value: unknown) {
  return String(value || "")
    .split(/[\n,;]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 80);
}

function isMissingCategoryTableError(error: any) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");

  return (
    code === "42P01" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    message.includes("school_product_categories") ||
    message.toLowerCase().includes("could not find the table")
  );
}

export function getFallbackProductCategoryOptions(): ProductCategoryOptionRecord[] {
  return PRODUCT_CATEGORY_OPTIONS.map((option, index) => ({
    id: "fallback-" + option.value,
    value: option.value,
    label: option.label,
    keywords: [...option.keywords],
    sortOrder: (index + 1) * 10,
    isActive: true,
    source: "fallback" as const,
  }));
}

export async function loadProductCategoryOptions(
  supabase: SupabaseLike,
  options?: {
    activeOnly?: boolean;
  }
): Promise<ProductCategoryOptionRecord[]> {
  const activeOnly = options?.activeOnly === true;

  const query = supabase
    .from("school_product_categories")
    .select("id,value,label,keywords,sort_order,is_active")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  const { data, error } = activeOnly
    ? await query.eq("is_active", true)
    : await query;

  if (error) {
    if (isMissingCategoryTableError(error)) {
      return getFallbackProductCategoryOptions();
    }

    throw new Error("Produktkategorien konnten nicht geladen werden: " + error.message);
  }

  const dbRows = (data || []) as ProductCategoryDbRow[];

  const rows: ProductCategoryOptionRecord[] = dbRows.map(
    (row: ProductCategoryDbRow, index: number) => ({
      id: cleanString(row.id),
      value: cleanString(row.value),
      label: cleanString(row.label),
      keywords: Array.isArray(row.keywords)
        ? row.keywords
            .map((entry: unknown) => cleanString(entry))
            .filter((entry: string) => Boolean(entry))
        : [],
      sortOrder:
        typeof row.sort_order === "number" && Number.isFinite(row.sort_order)
          ? row.sort_order
          : (index + 1) * 10,
      isActive: row.is_active !== false,
      source: "database" as const,
    })
  );

  return rows.filter(
    (row: ProductCategoryOptionRecord) => row.id && row.value && row.label
  );
}

export function normalizeProductCategoryWithOptions(
  value: unknown,
  options: ProductCategoryOptionRecord[]
) {
  const raw = cleanString(value);

  if (!raw) return "";

  const exactLabel = options.find((option) => option.label === raw);
  if (exactLabel) return exactLabel.label;

  const normalized = normalizeCategoryKey(raw);

  const byValue = options.find((option) => option.value === normalized);
  if (byValue) return byValue.label;

  const byLabelKey = options.find(
    (option) => normalizeCategoryKey(option.label) === normalized
  );
  if (byLabelKey) return byLabelKey.label;

  const byKeyword = options.find((option) =>
    option.keywords.some((keyword) => normalizeCategoryKey(keyword) === normalized)
  );
  if (byKeyword) return byKeyword.label;

  return "";
}

export async function loadProductCategoryUsageCounts(supabase: SupabaseLike) {
  const counts = new Map<string, number>();
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("school_products")
      .select("category")
      .range(from, from + pageSize - 1);

    if (error) {
      console.warn("Produktkategorie-Nutzung konnte nicht geladen werden:", error.message);
      return counts;
    }

    for (const row of data || []) {
      const category = cleanString((row as any).category);
      if (!category) continue;
      counts.set(category, (counts.get(category) || 0) + 1);
    }

    if (!data || data.length < pageSize) break;
  }

  return counts;
}
