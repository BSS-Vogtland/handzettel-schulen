import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

type SchoolRequest = {
  id: string;
  request_number: string | null;
  source: string | null;
  status: string | null;
  ai_status: string | null;
  offer_status: string | null;
  offer_token: string | null;
};

type RequestFile = {
  id: string;
  request_id: string;
  storage_path: string | null;
  file_type: string | null;
  original_filename: string | null;
};

type RequestItem = {
  id: string;
  request_id: string;
  raw_text: string | null;
  normalized_name: string | null;
  quantity: number | string | null;
  status: string | null;
  category?: string | null;
  notes?: string | null;
};

type RequestMatch = {
  id: string;
  request_item_id: string;
  product_id: string | null;
  product_name: string | null;
  product_sku: string | null;
  product_price: number | string | null;
  match_score: number | string | null;
  match_reason: string | null;
  selected: boolean | null;
};

type OfferItem = {
  id: string;
  request_id: string;
  request_item_id: string | null;
  match_id: string | null;
  product_id: string | null;
  product_name: string;
  product_sku: string | null;
  product_price: number | string | null;
  quantity: number | string | null;
  unit: string | null;
  source: string | null;
  status: string | null;
};

const AUTO_PRESELECT_MIN_SCORE = 85;

function isUnsafeAutoPreselectMatchReason(match: { match_reason?: string | null }) {
  const reason = String(match.match_reason || "").toLowerCase();

  if (
    reason.includes("artverwandter kandidat") ||
    reason.includes("admin-pr") ||
    reason.includes("variantenmerkmale") ||
    reason.includes("bitte pr") ||
    reason.includes("teilweise erkannt") ||
    reason.includes("score begrenzt") ||
    reason.includes("abweichende explizite nummer")
  ) {
    return true;
  }

  // S0: Alias-Lernen ist noch nicht sauber von Suchaliasen getrennt.
  if (reason.includes("gelernte zuordnung")) {
    return true;
  }

  return false;
}


function isAutoPreselectBlockedMatch(match: { match_reason?: string | null }) {
  const reason = String(match.match_reason || "").toLowerCase();

  if (
    reason.includes("artverwandter kandidat") ||
    reason.includes("admin-pr") ||
    reason.includes("variantenmerkmale") ||
    reason.includes("bitte pr") ||
    reason.includes("teilweise erkannt") ||
    reason.includes("score begrenzt") ||
    reason.includes("abweichende explizite nummer")
  ) {
    return true;
  }

  // S0: learned aliases are not separated from normal search aliases yet.
  if (reason.includes("gelernte zuordnung")) {
    return true;
  }

  return false;
}


function normalizeAutoAdoptGuardText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Ã¤/g, "ae")
    .replace(/Ã¶/g, "oe")
    .replace(/Ã¼/g, "ue")
    .replace(/ÃŸ/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isManualComboNoAutoAdoptItem(item: {
  raw_text?: string | null;
  normalized_name?: string | null;
  category?: string | null;
  notes?: string | null;
}) {
  const text = normalizeAutoAdoptGuardText([
    item.raw_text,
    item.normalized_name,
    item.category,
    item.notes,
  ].filter(Boolean).join(" "));

  if (!text) return false;

  if (text.includes("manual_combo_no_auto_adopt")) {
    return true;
  }

  const isCombo = text.includes("kombiposition");
  const hasCover = text.includes("umschlag");
  const hasExerciseBook =
    text.includes("heft") ||
    text.includes("rechenheft") ||
    text.includes("schreibheft") ||
    text.includes("deutschheft") ||
    text.includes("matheheft") ||
    text.includes("mathematikheft");

  return isCombo && hasCover && hasExerciseBook;
}

function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

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
    "http://localhost:3000"
  );
}

function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanText(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text.length > 0 ? text : fallback;
}

function isSupportedAnalyzableFile(file: RequestFile) {
  return (
    file.file_type === "application/pdf" ||
    file.file_type === "image/jpeg" ||
    file.file_type === "image/png" ||
    file.file_type === "image/webp" ||
    file.file_type === "image/heic" ||
    file.file_type === "image/heif"
  );
}

function compareMatchesStable(a: RequestMatch, b: RequestMatch) {
  const scoreDifference =
    toNumber(b.match_score, 0) - toNumber(a.match_score, 0);

  if (scoreDifference !== 0) return scoreDifference;

  const productNameComparison = String(a.product_name || "").localeCompare(
    String(b.product_name || ""),
    "de",
    {
      numeric: true,
      sensitivity: "base",
    }
  );

  if (productNameComparison !== 0) return productNameComparison;

  const skuComparison = String(a.product_sku || "").localeCompare(
    String(b.product_sku || ""),
    "de",
    {
      numeric: true,
      sensitivity: "base",
    }
  );

  if (skuComparison !== 0) return skuComparison;

  return String(a.id).localeCompare(String(b.id), "de", {
    numeric: true,
    sensitivity: "base",
  });
}

async function createRequestEvent(input: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const payloads = [
    {
      request_id: input.requestId,
      event_type: input.eventType,
      message: input.message,
      metadata: input.metadata ?? {},
    },
    {
      request_id: input.requestId,
      type: input.eventType,
      message: input.message,
      metadata: input.metadata ?? {},
    },
  ];

  for (const payload of payloads) {
    const { error } = await input.supabase
      .from("school_request_events")
      .insert(payload);

    if (!error) return;
  }
}

async function callLocalRoute(path: string) {
  const siteUrl = getSiteUrl();

  const response = await fetch(`${siteUrl}${path}`, {
    method: "POST",
    cache: "no-store",
  });

  const rawText = await response.text();

  let payload: {
    ok?: boolean;
    message?: string;
    itemCount?: number;
    matchCount?: number;
  } | null = null;

  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    throw new Error(
      `Die Route ${path} hat keine JSON-Antwort geliefert. Antwort: ${rawText.slice(
        0,
        300
      )}`
    );
  }

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || `Die Route ${path} ist fehlgeschlagen.`);
  }

  return payload;
}

async function loadRequestBundle(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  id: string
) {
  const { data: requestData, error: requestError } = await supabase
    .from("school_requests")
    .select(
      "id, request_number, source, status, ai_status, offer_status, offer_token"
    )
    .eq("id", id)
    .maybeSingle();

  if (requestError) {
    throw new Error(
      `Anfrage konnte nicht geladen werden: ${requestError.message}`
    );
  }

  if (!requestData) {
    return null;
  }

  const [
    { data: filesData, error: filesError },
    { data: itemsData, error: itemsError },
    { data: offerItemsData, error: offerItemsError },
  ] = await Promise.all([
    supabase
      .from("school_request_files")
      .select("*")
      .eq("request_id", id)
      .order("created_at", { ascending: true }),

    supabase
      .from("school_request_items")
      .select("*")
      .eq("request_id", id)
      .order("created_at", { ascending: true }),

    supabase
      .from("school_offer_items")
      .select("*")
      .eq("request_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (filesError) {
    throw new Error(
      `Dateien konnten nicht geladen werden: ${filesError.message}`
    );
  }

  if (itemsError) {
    throw new Error(
      `Positionen konnten nicht geladen werden: ${itemsError.message}`
    );
  }

  if (offerItemsError) {
    throw new Error(
      `Paketpositionen konnten nicht geladen werden: ${offerItemsError.message}`
    );
  }

  return {
    request: requestData as SchoolRequest,
    files: (filesData || []) as RequestFile[],
    items: (itemsData || []) as RequestItem[],
    offerItems: (offerItemsData || []) as OfferItem[],
  };
}

async function insertSafeMatchesIntoOffer(input: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
}) {
  const { supabase, requestId } = input;

  const { data: itemsData, error: itemsError } = await supabase
    .from("school_request_items")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });

  if (itemsError) {
    throw new Error(
      `Positionen konnten nicht geladen werden: ${itemsError.message}`
    );
  }

  const items = (itemsData || []) as RequestItem[];
  const itemIds = items.map((item) => item.id);

  if (itemIds.length === 0) {
    return {
      insertedCount: 0,
      safeMatchCount: 0,
      itemCount: 0,
      matchCount: 0,
    };
  }

  const [
    { data: matchesData, error: matchesError },
    { data: existingOfferItemsData, error: existingOfferItemsError },
  ] = await Promise.all([
    supabase
      .from("school_request_matches")
      .select("*")
      .in("request_item_id", itemIds)
      .order("request_item_id", { ascending: true })
      .order("match_score", { ascending: false }),

    supabase.from("school_offer_items").select("*").eq("request_id", requestId),
  ]);

  if (matchesError) {
    throw new Error(
      `Produktvorschläge konnten nicht geladen werden: ${matchesError.message}`
    );
  }

  if (existingOfferItemsError) {
    throw new Error(
      `Bestehende Paketpositionen konnten nicht geladen werden: ${existingOfferItemsError.message}`
    );
  }

  const matches = (matchesData || []) as RequestMatch[];
  const existingOfferItems = (existingOfferItemsData || []) as OfferItem[];

  

  const existingProductIds = new Set(
    existingOfferItems
      .map((item) => item.product_id)
      .filter((value): value is string => Boolean(value))
  );

  const selectedProductIdsInThisRun = new Set<string>();
const existingByRequestItem = new Map<string, OfferItem[]>();

  for (const offerItem of existingOfferItems) {
    if (!offerItem.request_item_id) continue;

    const current = existingByRequestItem.get(offerItem.request_item_id) || [];
    current.push(offerItem);
    existingByRequestItem.set(offerItem.request_item_id, current);
  }

  const matchesByItem = new Map<string, RequestMatch[]>();

  for (const item of items) {
    const itemMatches = matches
      .filter((match) => match.request_item_id === item.id)
      .sort(compareMatchesStable);

    matchesByItem.set(item.id, itemMatches);
  }

  const autoAdoptableItemIds = new Set(
    items
      .filter((item) => !isManualComboNoAutoAdoptItem(item))
      .map((item) => item.id)
  );

  const rowsToInsert = items
    .map((item) => {
      if (!autoAdoptableItemIds.has(item.id)) return null;

      const existingForItem = existingByRequestItem.get(item.id) || [];

      if (existingForItem.length > 0) return null;

      const bestSafeMatch = (matchesByItem.get(item.id) || [])
        .filter((match) => {
          return (
            Boolean(match.product_id) &&
            ((toNumber(match.match_score, 0) >= AUTO_PRESELECT_MIN_SCORE && !isUnsafeAutoPreselectMatchReason(match)) && !isAutoPreselectBlockedMatch(match))
          );
        })
        .sort(compareMatchesStable)[0];

      if (!bestSafeMatch) return null;

      const productPrice = toNumber(bestSafeMatch.product_price, 0);
      const quantity = toNumber(item.quantity, 1) || 1;

      return {
        request_id: requestId,
        request_item_id: bestSafeMatch.request_item_id,
        match_id: bestSafeMatch.id,
        product_id: bestSafeMatch.product_id,
        product_name: cleanText(bestSafeMatch.product_name, "Produkt"),
        product_sku: cleanText(bestSafeMatch.product_sku, "") || null,
        product_price: productPrice,
        quantity,
        unit: "Stk.",
        source: "auto_preselected",
        status: "preselected",
        notes: `Automatisch vorausgewählt, da der Produkttreffer ${toNumber(
          bestSafeMatch.match_score,
          0
        )} % Übereinstimmung erreicht hat.`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await supabase
      .from("school_offer_items")
      .insert(rowsToInsert);

    if (insertError) {
      throw new Error(
        `Sichere Treffer konnten nicht in den Paketwunsch übernommen werden: ${insertError.message}`
      );
    }
  }

  const safeMatchCount = matches.filter(
    (match) =>
      Boolean(match.product_id) &&
      autoAdoptableItemIds.has(match.request_item_id) &&
      ((toNumber(match.match_score, 0) >= AUTO_PRESELECT_MIN_SCORE && !isUnsafeAutoPreselectMatchReason(match)) && !isAutoPreselectBlockedMatch(match))
  ).length;

  return {
    insertedCount: rowsToInsert.length,
    safeMatchCount,
    itemCount: items.length,
    matchCount: matches.length,
  };
}

export async function POST(_request: NextRequest, context: Params) {
  try {
    const { id } = await context.params;
    const supabase = getSupabaseAdmin();

    if (!id) {
      return jsonResponse(
        {
          ok: false,
          message: "Keine Anfrage-ID übergeben.",
        },
        400
      );
    }

    let bundle = await loadRequestBundle(supabase, id);

    if (!bundle) {
      return jsonResponse(
        {
          ok: false,
          message: "Anfrage wurde nicht gefunden.",
        },
        404
      );
    }

    await createRequestEvent({
      supabase,
      requestId: id,
      eventType: "whatsapp_prepare_started",
      message:
        "Die WhatsApp-Anfrage wird ausgewertet und der Paketwunsch wird vorbereitet.",
      metadata: {
        source: bundle.request.source,
      },
    });

    const hasItemsBeforeAnalyze = bundle.items.length > 0;
    const hasAnalyzableFile = bundle.files.some(
      (file) => file.storage_path && isSupportedAnalyzableFile(file)
    );

    let analyzeRan = false;
    let analyzeMessage: string | null = null;

    if (!hasItemsBeforeAnalyze) {
      if (!hasAnalyzableFile) {
        await supabase
          .from("school_requests")
          .update({
            status: "manual_review",
            ai_status: "unsupported_file_type",
            offer_status: "not_created",
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);

        await createRequestEvent({
          supabase,
          requestId: id,
          eventType: "whatsapp_prepare_needs_manual_review",
          message:
            "Die WhatsApp-Anfrage enthält keine erkannten Textpositionen und keine analysierbare Datei. Manuelle Prüfung nötig.",
          metadata: {
            fileCount: bundle.files.length,
          },
        });

        return jsonResponse(
          {
            ok: false,
            message:
              "Es gibt noch keine erkannten Positionen und keine analysierbare Datei. Bitte füge Textpositionen hinzu oder lade ein Foto/PDF hoch.",
          },
          422
        );
      }

      const analyzePayload = await callLocalRoute(
        `/api/admin/requests/${id}/analyze`
      );

      analyzeRan = true;
      analyzeMessage = analyzePayload.message || "Analyse wurde ausgeführt.";

      bundle = await loadRequestBundle(supabase, id);

      if (!bundle) {
        throw new Error(
          "Anfrage konnte nach der Analyse nicht neu geladen werden."
        );
      }

      if (bundle.items.length === 0) {
        await supabase
          .from("school_requests")
          .update({
            status: "manual_review",
            offer_status: "not_created",
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);

        return jsonResponse({
          ok: true,
          needsManualReview: true,
          message:
            "Die Liste wurde analysiert, aber es konnten keine Positionen sicher erkannt werden.",
          analyzeRan,
          analyzeMessage,
          itemCount: 0,
          matchCount: 0,
          autoPreselectedCount: 0,
          offerUrl: bundle.request.offer_token
            ? `${getSiteUrl()}/angebot/${bundle.request.offer_token}`
            : null,
        });
      }
    }

    const matchPayload = await callLocalRoute(`/api/admin/requests/${id}/match`);

    const autoPreselectResult = await insertSafeMatchesIntoOffer({
      supabase,
      requestId: id,
    });

    const nextOfferStatus =
      autoPreselectResult.matchCount > 0 ||
      autoPreselectResult.insertedCount > 0
        ? "customer_selection"
        : "not_created";

    const nextStatus =
      autoPreselectResult.insertedCount > 0 ||
      autoPreselectResult.matchCount > 0
        ? "offer_created"
        : "manual_review";

    await supabase
      .from("school_requests")
      .update({
        status: nextStatus,
        ai_status: "done",
        offer_status: nextOfferStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    await createRequestEvent({
      supabase,
      requestId: id,
      eventType: "whatsapp_prepare_done",
      message:
        autoPreselectResult.insertedCount > 0
          ? `${autoPreselectResult.insertedCount} sichere Treffer wurden in den Paketwunsch übernommen.`
          : "Die WhatsApp-Anfrage wurde ausgewertet. Es wurden keine sicheren Treffer automatisch übernommen.",
      metadata: {
        analyzeRan,
        analyzeMessage,
        matchMessage: matchPayload.message || null,
        itemCount: autoPreselectResult.itemCount,
        matchCount: autoPreselectResult.matchCount,
        safeMatchCount: autoPreselectResult.safeMatchCount,
        autoPreselectedCount: autoPreselectResult.insertedCount,
        autoPreselectMinScore: AUTO_PRESELECT_MIN_SCORE,
      },
    });

    bundle = await loadRequestBundle(supabase, id);

    const offerUrl = bundle?.request.offer_token
      ? `${getSiteUrl()}/angebot/${bundle.request.offer_token}`
      : null;

    return jsonResponse({
      ok: true,
      message:
        autoPreselectResult.insertedCount > 0
          ? "WhatsApp-Liste wurde ausgewertet und sichere Treffer wurden in den Paketwunsch übernommen."
          : "WhatsApp-Liste wurde ausgewertet. Es gibt Produktvorschläge oder manuelle Prüfpositionen.",
      analyzeRan,
      analyzeMessage,
      matchMessage: matchPayload.message || null,
      itemCount: autoPreselectResult.itemCount,
      matchCount: autoPreselectResult.matchCount,
      safeMatchCount: autoPreselectResult.safeMatchCount,
      autoPreselectedCount: autoPreselectResult.insertedCount,
      offerUrl,
      redirectUrl: `/admin/anfragen/${id}`,
    });
  } catch (error) {
    console.error("WhatsApp prepare error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die WhatsApp-Anfrage konnte nicht vorbereitet werden.",
      },
      500
    );
  }
}