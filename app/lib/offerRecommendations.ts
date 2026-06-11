import { createClient } from "@supabase/supabase-js";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdmin>;

type RequestItem = {
  id: string;
  raw_text?: string | null;
  normalized_name?: string | null;
  category?: string | null;
  product_type?: string | null;
  format?: string | null;
  color?: string | null;
  lineature?: string | null;
  notes?: string | null;
};

type OfferItem = {
  id: string;
  product_id?: string | null;
  product_name?: string | null;
  product_sku?: string | null;
  notes?: string | null;
};

type ProductRow = {
  id: string;
  name?: string | null;
  product_name?: string | null;
  title?: string | null;
  sku?: string | null;
  product_sku?: string | null;
  category?: string | null;
  product_type?: string | null;
  format?: string | null;
  color?: string | null;
  lineature?: string | null;
  active?: boolean | null;
};

type ExistingRecommendation = {
  id: string;
  request_id: string;
  request_item_id?: string | null;
  product_id: string;
  source?: string | null;
  reason?: string | null;
  sort_order?: number | null;
  is_visible?: boolean | null;
  added_to_offer_item_id?: string | null;
};

type RecommendationCandidate = {
  product: ProductRow;
  reason: string;
  score: number;
  requestItemId: string | null;
};

export type RebuildOfferRecommendationsResult = {
  ok: true;
  requestId: string;
  insertedCount: number;
  updatedCount: number;
  hiddenCount: number;
  candidateCount: number;
  message: string;
};

function createSupabaseAdmin() {
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

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/grün/g, "gruen")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text: string, words: string[]) {
  const normalizedText = normalizeText(text);
  return words.some((word) => normalizedText.includes(normalizeText(word)));
}

function hasFormat(text: string, format: "a4" | "a5" | "a3") {
  return normalizeText(text).includes(format);
}

function getProductName(product: ProductRow) {
  return (
    cleanText(product.name) ||
    cleanText(product.product_name) ||
    cleanText(product.title) ||
    "Unbenanntes Produkt"
  );
}

function getProductText(product: ProductRow) {
  return normalizeText(
    [
      product.name,
      product.product_name,
      product.title,
      product.sku,
      product.product_sku,
      product.category,
      product.product_type,
      product.format,
      product.color,
      product.lineature,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function getRequestItemText(item: RequestItem) {
  return normalizeText(
    [
      item.raw_text,
      item.normalized_name,
      item.category,
      item.product_type,
      item.format,
      item.color,
      item.lineature,
      item.notes,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function getOfferItemText(item: OfferItem) {
  return normalizeText(
    [item.product_name, item.product_sku, item.notes].filter(Boolean).join(" ")
  );
}

function productMatchesAny(productText: string, terms: string[]) {
  return terms.some((term) => productText.includes(normalizeText(term)));
}

function productMatchesFormat(productText: string, contextText: string) {
  if (hasFormat(contextText, "a4")) return hasFormat(productText, "a4");
  if (hasFormat(contextText, "a5")) return hasFormat(productText, "a5");
  if (hasFormat(contextText, "a3")) return hasFormat(productText, "a3");
  return true;
}

function buildCandidateForRule(input: {
  products: ProductRow[];
  selectedProductIds: Set<string>;
  adminRecommendationProductIds: Set<string>;
  requestItemId: string | null;
  contextText: string;
  productTerms: string[];
  reason: string;
  baseScore: number;
  maxCount?: number;
}) {
  const maxCount = input.maxCount || 1;

  return input.products
    .map((product) => {
      const productText = getProductText(product);

      if (product.active === false) return null;
      if (input.selectedProductIds.has(product.id)) return null;
      if (input.adminRecommendationProductIds.has(product.id)) return null;
      if (!productMatchesAny(productText, input.productTerms)) return null;
      if (!productMatchesFormat(productText, input.contextText)) return null;

      let score = input.baseScore;

      if (hasFormat(input.contextText, "a4") && hasFormat(productText, "a4")) {
        score += 8;
      }

      if (hasFormat(input.contextText, "a5") && hasFormat(productText, "a5")) {
        score += 8;
      }

      if (
        includesAny(input.contextText, ["blau"]) &&
        includesAny(productText, ["blau"])
      ) {
        score += 4;
      }

      if (
        includesAny(input.contextText, ["rot"]) &&
        includesAny(productText, ["rot"])
      ) {
        score += 4;
      }

      if (
        includesAny(input.contextText, ["gruen", "grün"]) &&
        includesAny(productText, ["gruen", "grün"])
      ) {
        score += 4;
      }

      return {
        product,
        reason: input.reason,
        score,
        requestItemId: input.requestItemId,
      } satisfies RecommendationCandidate;
    })
    .filter((candidate): candidate is RecommendationCandidate =>
      Boolean(candidate)
    )
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;

      return getProductName(a.product).localeCompare(
        getProductName(b.product),
        "de",
        {
          numeric: true,
          sensitivity: "base",
        }
      );
    })
    .slice(0, maxCount);
}

function buildRecommendationsForText(input: {
  products: ProductRow[];
  selectedProductIds: Set<string>;
  adminRecommendationProductIds: Set<string>;
  requestItemId: string | null;
  contextText: string;
}) {
  const candidates: RecommendationCandidate[] = [];
  const text = input.contextText;

  if (
    includesAny(text, [
      "fueller",
      "füller",
      "füllhalter",
      "fuellhalter",
      "federhalter",
      "iridiumfeder",
    ])
  ) {
    candidates.push(
      ...buildCandidateForRule({
        ...input,
        productTerms: ["tintenpatron", "patronen", "tinte"],
        reason:
          "Passt häufig zum Füller und kann zusätzlich für den Schulalltag sinnvoll sein.",
        baseScore: 95,
        maxCount: 1,
      })
    );
  }

  if (
    includesAny(text, [
      "farbkasten",
      "tuschkasten",
      "wasserfarbe",
      "malkittel",
      "malen",
      "kunst",
    ])
  ) {
    candidates.push(
      ...buildCandidateForRule({
        ...input,
        productTerms: ["deckweiss", "deckweiß"],
        reason:
          "Passt häufig zum Farbkasten und wird im Kunstunterricht oft zusätzlich benötigt.",
        baseScore: 94,
        maxCount: 1,
      }),
      ...buildCandidateForRule({
        ...input,
        productTerms: ["wasserbecher", "malbecher"],
        reason:
          "Kann beim Malen mit Wasserfarben praktisch sein und ergänzt den Farbkasten sinnvoll.",
        baseScore: 86,
        maxCount: 1,
      }),
      ...buildCandidateForRule({
        ...input,
        productTerms: ["pinsel"],
        reason:
          "Ergänzt Mal- und Kunstmaterial sinnvoll, falls kein passender Pinsel vorhanden ist.",
        baseScore: 84,
        maxCount: 1,
      }),
      ...buildCandidateForRule({
        ...input,
        productTerms: ["malkittel"],
        reason:
          "Kann Kleidung beim Malen schützen und ist besonders für jüngere Kinder sinnvoll.",
        baseScore: 80,
        maxCount: 1,
      })
    );
  }

  if (includesAny(text, ["bleistift", "graphitstift"])) {
    candidates.push(
      ...buildCandidateForRule({
        ...input,
        productTerms: ["radierer"],
        reason:
          "Passt häufig zu Bleistiften und ist als Ergänzung für die Federmappe sinnvoll.",
        baseScore: 90,
        maxCount: 1,
      }),
      ...buildCandidateForRule({
        ...input,
        productTerms: ["spitzer", "anspitzer", "spitzerdose"],
        reason: "Passt häufig zu Bleistiften und Buntstiften.",
        baseScore: 89,
        maxCount: 1,
      })
    );
  }

  if (includesAny(text, ["buntstift", "buntstifte", "farbstift"])) {
    candidates.push(
      ...buildCandidateForRule({
        ...input,
        productTerms: ["spitzer", "anspitzer", "spitzerdose"],
        reason:
          "Passt häufig zu Buntstiften und ist als Ergänzung für die Federmappe sinnvoll.",
        baseScore: 88,
        maxCount: 1,
      })
    );
  }

  if (
    includesAny(text, ["heft", "schreibheft", "schulheft"]) &&
    !includesAny(text, ["umschlag", "huelle", "hülle", "hefthuelle"])
  ) {
    candidates.push(
      ...buildCandidateForRule({
        ...input,
        productTerms: [
          "umschlag",
          "hülle",
          "huelle",
          "hefthuelle",
          "heftumschlag",
        ],
        reason: "Zu Heften wird häufig ein passender Umschlag benötigt.",
        baseScore: 82,
        maxCount: 1,
      })
    );
  }

  if (includesAny(text, ["ordner", "hefter", "schnellhefter"])) {
    candidates.push(
      ...buildCandidateForRule({
        ...input,
        productTerms: ["trennblatt", "register"],
        reason: "Kann beim Sortieren von Unterlagen zusätzlich hilfreich sein.",
        baseScore: 72,
        maxCount: 1,
      })
    );
  }

  if (includesAny(text, ["schere", "kleber", "klebestift", "basteln"])) {
    candidates.push(
      ...buildCandidateForRule({
        ...input,
        productTerms: ["bastelmappe", "tonpapier", "zeichenblock"],
        reason: "Kann bei Bastel- und Kunstaufgaben ergänzend sinnvoll sein.",
        baseScore: 70,
        maxCount: 1,
      })
    );
  }

  return candidates;
}

function dedupeCandidates(candidates: RecommendationCandidate[]) {
  const bestByProductId = new Map<string, RecommendationCandidate>();

  for (const candidate of candidates) {
    const current = bestByProductId.get(candidate.product.id);

    if (!current || candidate.score > current.score) {
      bestByProductId.set(candidate.product.id, candidate);
    }
  }

  return Array.from(bestByProductId.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;

    return getProductName(a.product).localeCompare(
      getProductName(b.product),
      "de",
      {
        numeric: true,
        sensitivity: "base",
      }
    );
  });
}

export async function rebuildOfferRecommendations(
  requestId: string
): Promise<RebuildOfferRecommendationsResult> {
  const cleanRequestId = String(requestId || "").trim();

  if (!cleanRequestId) {
    throw new Error("Keine Anfrage-ID für Empfehlungserzeugung übergeben.");
  }

  const supabase = createSupabaseAdmin();

  const [
    { data: requestItemsData, error: requestItemsError },
    { data: offerItemsData, error: offerItemsError },
    { data: existingRecommendationsData, error: existingRecommendationsError },
    { data: productsData, error: productsError },
  ] = await Promise.all([
    supabase
      .from("school_request_items")
      .select("*")
      .eq("request_id", cleanRequestId),

    supabase
      .from("school_offer_items")
      .select("*")
      .eq("request_id", cleanRequestId),

    supabase
      .from("school_offer_recommendations")
      .select("*")
      .eq("request_id", cleanRequestId),

    supabase.from("school_products").select("*").limit(1500),
  ]);

  if (requestItemsError) {
    throw new Error(
      `Listenpositionen konnten nicht geladen werden: ${requestItemsError.message}`
    );
  }

  if (offerItemsError) {
    throw new Error(
      `Paketpositionen konnten nicht geladen werden: ${offerItemsError.message}`
    );
  }

  if (existingRecommendationsError) {
    throw new Error(
      `Bestehende Empfehlungen konnten nicht geladen werden: ${existingRecommendationsError.message}`
    );
  }

  if (productsError) {
    throw new Error(`Produkte konnten nicht geladen werden: ${productsError.message}`);
  }

  const requestItems = (requestItemsData || []) as RequestItem[];
  const offerItems = (offerItemsData || []) as OfferItem[];
  const products = (productsData || []) as ProductRow[];
  const existingRecommendations =
    (existingRecommendationsData || []) as ExistingRecommendation[];

  const selectedProductIds = new Set(
    offerItems
      .map((item) => String(item.product_id || "").trim())
      .filter(Boolean)
  );

  const adminRecommendationProductIds = new Set(
    existingRecommendations
      .filter((recommendation) => recommendation.source === "admin")
      .filter((recommendation) => !recommendation.added_to_offer_item_id)
      .map((recommendation) => String(recommendation.product_id || "").trim())
      .filter(Boolean)
  );

  const existingOpenSystemRecommendations = existingRecommendations.filter(
    (recommendation) =>
      recommendation.source === "system" &&
      !recommendation.added_to_offer_item_id
  );

  const existingSystemByProductId = new Map<string, ExistingRecommendation>();

  for (const recommendation of existingOpenSystemRecommendations) {
    existingSystemByProductId.set(recommendation.product_id, recommendation);
  }

  const candidates: RecommendationCandidate[] = [];

  for (const item of requestItems) {
    const contextText = getRequestItemText(item);

    if (!contextText) continue;

    candidates.push(
      ...buildRecommendationsForText({
        products,
        selectedProductIds,
        adminRecommendationProductIds,
        requestItemId: item.id,
        contextText,
      })
    );
  }

  for (const item of offerItems) {
    const contextText = getOfferItemText(item);

    if (!contextText) continue;

    candidates.push(
      ...buildRecommendationsForText({
        products,
        selectedProductIds,
        adminRecommendationProductIds,
        requestItemId: null,
        contextText,
      })
    );
  }

  const finalCandidates = dedupeCandidates(candidates).slice(0, 8);
  const finalProductIds = new Set(
    finalCandidates.map((candidate) => candidate.product.id)
  );

  const now = new Date().toISOString();

  let insertedCount = 0;
  let updatedCount = 0;
  let hiddenCount = 0;

  for (const recommendation of existingOpenSystemRecommendations) {
    const shouldHide =
      selectedProductIds.has(recommendation.product_id) ||
      !finalProductIds.has(recommendation.product_id);

    if (!shouldHide) continue;

    const { error } = await supabase
      .from("school_offer_recommendations")
      .update({
        is_visible: false,
        updated_at: now,
      })
      .eq("id", recommendation.id);

    if (!error) hiddenCount += 1;
  }

  for (const [index, candidate] of finalCandidates.entries()) {
    const existing = existingSystemByProductId.get(candidate.product.id);

    if (existing) {
      const preserveVisibility = existing.is_visible === false ? false : true;

      const { error } = await supabase
        .from("school_offer_recommendations")
        .update({
          request_item_id: candidate.requestItemId,
          reason: candidate.reason,
          sort_order: 10 + index,
          is_visible: selectedProductIds.has(candidate.product.id)
            ? false
            : preserveVisibility,
          updated_at: now,
        })
        .eq("id", existing.id);

      if (!error) updatedCount += 1;
      continue;
    }

    if (selectedProductIds.has(candidate.product.id)) {
      continue;
    }

    const { error } = await supabase.from("school_offer_recommendations").insert({
      request_id: cleanRequestId,
      request_item_id: candidate.requestItemId,
      product_id: candidate.product.id,
      source: "system",
      title: null,
      reason: candidate.reason,
      sort_order: 10 + index,
      is_visible: true,
      added_to_offer_item_id: null,
      created_at: now,
      updated_at: now,
    });

    if (!error) insertedCount += 1;
  }

  return {
    ok: true,
    requestId: cleanRequestId,
    insertedCount,
    updatedCount,
    hiddenCount,
    candidateCount: finalCandidates.length,
    message: `${insertedCount} neue, ${updatedCount} aktualisierte und ${hiddenCount} ausgeblendete Empfehlungen.`,
  };
}