import { createClient } from "@supabase/supabase-js";
import { getRequestItemBookIdentity } from "@/lib/requestBookIdentity";

type RequestRow = {
  id: string;
  request_number: string | null;
  status: string | null;
  offer_status: string | null;
};

type RequestItemRow = {
  id: string;
  request_id: string;
  child_id?: string | null;
  raw_text: string | null;
  normalized_name: string | null;
  quantity: number | string | null;
  category?: string | null;
  notes?: string | null;
  status?: string | null;
  admin_resolution_status?: string | null;
  is_book?: boolean | null;
  book_isbn10?: string | null;
  book_isbn13?: string | null;
};

type RequestMatchRow = {
  id: string;
  request_item_id: string;
  product_id: string | null;
  product_name: string | null;
  product_sku: string | null;
  product_price: number | string | null;
  match_score: number | string | null;
  match_reason: string | null;
};

type OfferItemRow = {
  id: string;
  request_id: string;
  request_item_id: string | null;
  match_id: string | null;
  product_id: string | null;
  product_name: string | null;
  product_sku: string | null;
  product_price: number | string | null;
  quantity: number | string | null;
  unit: string | null;
  source: string | null;
  status: string | null;
  notes: string | null;
  customer_note: string | null;
  customer_note_updated_at: string | null;
  child_id?: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type AutoOfferInsertRow = {
  request_id: string;
  request_item_id: string;
  match_id: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  product_price: number;
  quantity: number;
  unit: string;
  child_id: string | null;
  source: string;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

type PlannedOfferUpdate = {
  offerItem: OfferItemRow;
  requestItem: RequestItemRow;
  match: RequestMatchRow;
  mode: "corrected" | "refreshed";
};

const SAFE_MATCH_SCORE = 80;
const AUTO_ISBN_IDENTITY_MARKER = "auto_isbn_identity";
const AUTO_OFFER_SOURCES = new Set(["auto_safe_match", "auto_preselected"]);
const UNTOUCHED_TIMESTAMP_TOLERANCE_MS = 10_000;
const TECHNICAL_BACKFILL_MINIMUM_ROWS = 2;

const RESOLVED_REQUEST_ITEM_STATUSES = new Set([
  "not_needed",
  "customer_supplies_self",
  "covered_by_alternative",
  "resolved",
  "admin_resolved",
  "manually_resolved",
  "rejected",
  "dismissed",
  "skipped",
]);

export type SafeMatchAdoptionPayload = {
  ok: boolean;
  message: string;
  adoptedCount?: number;
  correctedCount?: number;
  refreshedCount?: number;
  protectedCount?: number;
  exactIsbnCount?: number;
  skippedCount?: number;
  minimumScore?: number;
};

export type SafeMatchAdoptionResult = {
  data: SafeMatchAdoptionPayload;
  status: number;
};

function serviceResponse(
  data: SafeMatchAdoptionPayload,
  options?: { status?: number },
): SafeMatchAdoptionResult {
  return {
    data,
    status: options?.status ?? 200,
  };
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase Umgebungsvariablen fehlen. Prüfe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function cleanText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeQuantity(value: unknown) {
  return Math.max(1, Math.min(99, Math.floor(toNumber(value, 1))));
}

function normalizeGuardText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getRequestItemTitle(item: RequestItemRow) {
  return item.normalized_name || item.raw_text || "Unbekannte Position";
}

function isManualComboNoAutoAdoptItem(item: RequestItemRow) {
  const text = normalizeGuardText(
    [item.raw_text, item.normalized_name, item.category, item.notes]
      .filter(Boolean)
      .join(" "),
  );

  if (!text) {
    return false;
  }

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

function isRequestItemBlockedForAutoAdoption(item: RequestItemRow) {
  if (isManualComboNoAutoAdoptItem(item)) {
    return true;
  }

  const statuses = [item.status, item.admin_resolution_status]
    .map((value) => cleanText(value).toLowerCase())
    .filter(Boolean);

  return statuses.some((status) =>
    RESOLVED_REQUEST_ITEM_STATUSES.has(status),
  );
}

function compareMatches(a: RequestMatchRow, b: RequestMatchRow) {
  const scoreDifference =
    toNumber(b.match_score, 0) - toNumber(a.match_score, 0);

  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  const productNameComparison = cleanText(a.product_name).localeCompare(
    cleanText(b.product_name),
    "de",
    {
      numeric: true,
      sensitivity: "base",
    },
  );

  if (productNameComparison !== 0) {
    return productNameComparison;
  }

  const skuComparison = cleanText(a.product_sku).localeCompare(
    cleanText(b.product_sku),
    "de",
    {
      numeric: true,
      sensitivity: "base",
    },
  );

  if (skuComparison !== 0) {
    return skuComparison;
  }

  return String(a.id).localeCompare(String(b.id), "de", {
    numeric: true,
    sensitivity: "base",
  });
}

function isExactIsbnIdentityMatch(match: RequestMatchRow) {
  const score = toNumber(match.match_score, 0);
  const reason = normalizeGuardText(match.match_reason);

  if (!match.request_item_id || !match.product_id || !match.product_name) {
    return false;
  }

  if (score !== 100) {
    return false;
  }

  if (!reason.includes("exakte isbn identitat")) {
    return false;
  }

  if (
    reason.includes("admin prufung") ||
    reason.includes("mehrere aktive produkte")
  ) {
    return false;
  }

  return true;
}

function isSafeGenericAutoAdoptMatch(match: RequestMatchRow) {
  const score = toNumber(match.match_score, 0);
  const reason = normalizeGuardText(match.match_reason);

  if (!match.request_item_id || !match.product_id || !match.product_name) {
    return false;
  }

  if (score < SAFE_MATCH_SCORE) {
    return false;
  }

  if (
    reason.includes("artverwandter kandidat") ||
    reason.includes("admin pr") ||
    reason.includes("variantenmerkmale") ||
    reason.includes("bitte pr") ||
    reason.includes("teilweise erkannt") ||
    reason.includes("score begrenzt") ||
    reason.includes("abweichende explizite nummer") ||
    reason.includes("gelernte zuordnung") ||
    reason.includes("mehrere aktive produkte")
  ) {
    return false;
  }

  return true;
}

function isExpectedAutomaticStatus(item: OfferItemRow) {
  const source = cleanText(item.source).toLowerCase();
  const status = cleanText(item.status).toLowerCase();

  if (source === "auto_preselected") {
    return status === "preselected";
  }

  if (source === "auto_safe_match") {
    return status === "confirmed";
  }

  return false;
}

function hasRecognizedAutomaticNote(item: OfferItemRow) {
  const notes = normalizeGuardText(item.notes);

  return (
    notes.includes(AUTO_ISBN_IDENTITY_MARKER) ||
    notes.includes("automatisch vorausgewahlt") ||
    notes.includes("automatisch aus sicherem produktvorschlag ubernommen")
  );
}

function getTimestampKey(value: unknown) {
  const timestamp = Date.parse(cleanText(value));

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

function getLikelyTechnicalBackfillTimestamps(
  offerItems: OfferItemRow[],
) {
  /*
   * TECHNICAL_BACKFILL_GUARD_V1
   *
   * Die ISBN-Migration hat bestehende Paketpositionen gesammelt über
   * "product_id = product_id" nachgezogen. Ein vorhandener
   * updated_at-Trigger kann dadurch viele rein automatisch erzeugte
   * Positionen auf exakt denselben technischen Zeitstempel setzen.
   *
   * Der gemeinsame Zeitstempel gilt nur dann als technischer
   * Backfill, wenn mindestens zwei maschinell erzeugte Auto-Positionen
   * desselben Vorgangs ihn teilen. Individuelle spätere Bearbeitungen
   * erhalten einen anderen Zeitstempel und bleiben geschützt.
   */
  const timestampCounts = new Map<string, number>();

  for (const item of offerItems) {
    const source = cleanText(item.source).toLowerCase();

    if (!AUTO_OFFER_SOURCES.has(source)) {
      continue;
    }

    if (cleanText(item.customer_note) || item.customer_note_updated_at) {
      continue;
    }

    if (!isExpectedAutomaticStatus(item)) {
      continue;
    }

    if (!hasRecognizedAutomaticNote(item)) {
      continue;
    }

    const createdAt = Date.parse(cleanText(item.created_at));
    const updatedAt = Date.parse(cleanText(item.updated_at));

    if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) {
      continue;
    }

    if (
      Math.abs(updatedAt - createdAt) <=
      UNTOUCHED_TIMESTAMP_TOLERANCE_MS
    ) {
      continue;
    }

    const timestampKey = getTimestampKey(item.updated_at);

    if (!timestampKey) {
      continue;
    }

    timestampCounts.set(
      timestampKey,
      (timestampCounts.get(timestampKey) || 0) + 1,
    );
  }

  return new Set<string>(
    Array.from(timestampCounts.entries())
      .filter(
        ([, count]) =>
          count >= TECHNICAL_BACKFILL_MINIMUM_ROWS,
      )
      .map(([timestamp]) => timestamp),
  );
}

function hasUntouchedAutomaticTimestamps(
  item: OfferItemRow,
  technicalBackfillTimestamps: ReadonlySet<string>,
) {
  const createdAt = Date.parse(cleanText(item.created_at));
  const updatedAt = Date.parse(cleanText(item.updated_at));

  if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) {
    return false;
  }

  if (
    Math.abs(updatedAt - createdAt) <=
    UNTOUCHED_TIMESTAMP_TOLERANCE_MS
  ) {
    return true;
  }

  const updatedAtKey = getTimestampKey(item.updated_at);

  return Boolean(
    updatedAtKey &&
      technicalBackfillTimestamps.has(updatedAtKey),
  );
}

function hasAutoIsbnIdentityMarker(item: OfferItemRow) {
  return normalizeGuardText(item.notes).includes(
    AUTO_ISBN_IDENTITY_MARKER,
  );
}

function isPristineAutomaticOfferItem(
  item: OfferItemRow,
  technicalBackfillTimestamps: ReadonlySet<string>,
) {
  const source = cleanText(item.source).toLowerCase();

  if (!AUTO_OFFER_SOURCES.has(source)) {
    return false;
  }

  if (cleanText(item.customer_note) || item.customer_note_updated_at) {
    return false;
  }

  if (!isExpectedAutomaticStatus(item)) {
    return false;
  }

  if (!hasRecognizedAutomaticNote(item)) {
    return false;
  }

  return hasUntouchedAutomaticTimestamps(
    item,
    technicalBackfillTimestamps,
  );
}

function getMatchesByRequestItem(matches: RequestMatchRow[]) {
  const result = new Map<string, RequestMatchRow[]>();

  for (const match of matches) {
    const current = result.get(match.request_item_id) || [];

    current.push(match);
    result.set(match.request_item_id, current);
  }

  for (const current of result.values()) {
    current.sort(compareMatches);
  }

  return result;
}

function getOfferItemsByRequestItem(offerItems: OfferItemRow[]) {
  const result = new Map<string, OfferItemRow[]>();

  for (const offerItem of offerItems) {
    if (!offerItem.request_item_id) {
      continue;
    }

    const current = result.get(offerItem.request_item_id) || [];

    current.push(offerItem);
    result.set(offerItem.request_item_id, current);
  }

  return result;
}

function getUniqueExactIsbnMatches(matches: RequestMatchRow[]) {
  const uniqueByProductId = new Map<string, RequestMatchRow>();

  for (const match of matches) {
    if (!isExactIsbnIdentityMatch(match) || !match.product_id) {
      continue;
    }

    const existing = uniqueByProductId.get(match.product_id);

    if (!existing || compareMatches(match, existing) < 0) {
      uniqueByProductId.set(match.product_id, match);
    }
  }

  return Array.from(uniqueByProductId.values()).sort(compareMatches);
}

function getBestSafeGenericMatch(matches: RequestMatchRow[]) {
  return (
    matches
      .filter(isSafeGenericAutoAdoptMatch)
      .sort(compareMatches)[0] || null
  );
}

function buildExactIsbnNotes(params: {
  requestItem: RequestItemRow;
  match: RequestMatchRow;
  mode: "inserted" | "corrected" | "refreshed";
  previousOfferItem?: OfferItemRow | null;
}) {
  const { requestItem, match, mode, previousOfferItem } = params;

  const matchedIdentity = getRequestItemBookIdentity(requestItem);
  const isbn = matchedIdentity.primaryIsbn || "unbekannt";

  const actionText =
    mode === "corrected"
      ? "Eine unberührte automatische Fehlzuordnung wurde durch das eindeutige ISBN-Produkt ersetzt."
      : mode === "refreshed"
        ? "Die bereits richtige automatische Buchzuordnung wurde auf den aktuellen eindeutigen ISBN-Treffer synchronisiert."
        : "Das eindeutige ISBN-Produkt wurde automatisch übernommen.";

  return [
    `${AUTO_ISBN_IDENTITY_MARKER}: ${actionText}`,
    `ISBN: ${isbn}.`,
    `Matchscore: ${toNumber(match.match_score, 0)} %.`,
    `Listenposition: ${getRequestItemTitle(requestItem)}.`,
    previousOfferItem && mode === "corrected"
      ? `Vorherige automatische Zuordnung: ${cleanText(
          previousOfferItem.product_name,
          "unbekanntes Produkt",
        )}.`
      : null,
    match.match_reason ? `Grund: ${match.match_reason}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildGenericNotes(
  requestItem: RequestItemRow,
  match: RequestMatchRow,
) {
  return [
    "Automatisch aus sicherem Produktvorschlag übernommen.",
    `Matchscore: ${toNumber(match.match_score, 0)} %.`,
    `Listenposition: ${getRequestItemTitle(requestItem)}.`,
    match.match_reason ? `Grund: ${match.match_reason}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildInsertRow(params: {
  requestId: string;
  requestItem: RequestItemRow;
  match: RequestMatchRow;
  now: string;
  exactIsbn: boolean;
}): AutoOfferInsertRow {
  const { requestId, requestItem, match, now, exactIsbn } = params;
  const productId = cleanText(match.product_id);

  if (!productId) {
    throw new Error(
      "Ein sicherer Produktvorschlag enthält keine Produkt-ID.",
    );
  }

  return {
    request_id: requestId,
    request_item_id: requestItem.id,
    match_id: match.id,
    product_id: productId,
    product_name: cleanText(match.product_name, "Produktvorschlag"),
    product_sku: cleanText(match.product_sku) || null,
    product_price: toNumber(match.product_price, 0),
    quantity: normalizeQuantity(requestItem.quantity),
    unit: "Stk.",
    child_id: cleanText(requestItem.child_id) || null,
    source: "auto_safe_match",
    status: "confirmed",
    notes: exactIsbn
      ? buildExactIsbnNotes({
          requestItem,
          match,
          mode: "inserted",
        })
      : buildGenericNotes(requestItem, match),
    created_at: now,
    updated_at: now,
  };
}

function buildOfferUpdatePayload(
  plan: PlannedOfferUpdate,
  now: string,
) {
  const { offerItem, requestItem, match, mode } = plan;

  return {
    request_id: requestItem.request_id,
    request_item_id: requestItem.id,
    match_id: match.id,
    product_id: match.product_id,
    product_name: cleanText(match.product_name, "Produktvorschlag"),
    product_sku: cleanText(match.product_sku) || null,
    product_price: toNumber(match.product_price, 0),
    quantity: normalizeQuantity(requestItem.quantity),
    unit: "Stk.",
    child_id:
      cleanText(requestItem.child_id) ||
      cleanText(offerItem.child_id) ||
      null,
    source: "auto_safe_match",
    status: "confirmed",
    notes: buildExactIsbnNotes({
      requestItem,
      match,
      mode,
      previousOfferItem: offerItem,
    }),
    updated_at: now,
  };
}

function getNextOfferStatus(currentValue: unknown) {
  const current = cleanText(currentValue);
  const normalized = current.toLowerCase();

  if (
    !normalized ||
    normalized === "not_created" ||
    normalized === "matching_pending" ||
    normalized === "matching_done"
  ) {
    return "matching_done";
  }

  return current;
}

function buildResultMessage(params: {
  adoptedCount: number;
  correctedCount: number;
  refreshedCount: number;
  protectedCount: number;
}) {
  const {
    adoptedCount,
    correctedCount,
    refreshedCount,
    protectedCount,
  } = params;

  const parts: string[] = [];

  if (adoptedCount === 1) {
    parts.push(
      "1 sicherer Treffer wurde in den Paketwunsch übernommen.",
    );
  } else if (adoptedCount > 1) {
    parts.push(
      `${adoptedCount} sichere Treffer wurden in den Paketwunsch übernommen.`,
    );
  }

  if (correctedCount === 1) {
    parts.push(
      "1 unberührte automatische ISBN-Fehlzuordnung wurde korrigiert.",
    );
  } else if (correctedCount > 1) {
    parts.push(
      `${correctedCount} unberührte automatische ISBN-Fehlzuordnungen wurden korrigiert.`,
    );
  }

  if (refreshedCount === 1) {
    parts.push(
      "1 bereits richtige automatische ISBN-Zuordnung wurde synchronisiert.",
    );
  } else if (refreshedCount > 1) {
    parts.push(
      `${refreshedCount} bereits richtige automatische ISBN-Zuordnungen wurden synchronisiert.`,
    );
  }

  if (protectedCount === 1) {
    parts.push(
      "1 bestehende manuell oder kundenseitig bearbeitete Paketposition wurde geschützt und nicht überschrieben.",
    );
  } else if (protectedCount > 1) {
    parts.push(
      `${protectedCount} bestehende manuell oder kundenseitig bearbeitete Paketpositionen wurden geschützt und nicht überschrieben.`,
    );
  }

  if (parts.length === 0) {
    return "Es wurden keine neuen sicheren Treffer gefunden und keine unberührten automatischen ISBN-Fehlzuordnungen korrigiert.";
  }

  return parts.join(" ");
}

async function insertRequestEvent(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
  eventType: string;
  title: string;
  description: string;
}) {
  const { supabase, requestId, eventType, title, description } = params;

  const { error } = await supabase.from("school_request_events").insert({
    request_id: requestId,
    event_type: eventType,
    title,
    description,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("Event konnte nicht gespeichert werden:", error);
  }
}

export async function adoptSafeRequestMatches(input: {
  requestId: string;
}): Promise<SafeMatchAdoptionResult> {
  try {
    const requestId = cleanText(input.requestId);

    if (!requestId) {
      return serviceResponse(
        {
          ok: false,
          message: "Keine Anfrage-ID übergeben.",
        },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    const { data: requestData, error: requestError } = await supabase
      .from("school_requests")
      .select("id, request_number, status, offer_status")
      .eq("id", requestId)
      .maybeSingle();

    if (requestError) {
      return serviceResponse(
        {
          ok: false,
          message: requestError.message,
        },
        { status: 500 },
      );
    }

    if (!requestData) {
      return serviceResponse(
        {
          ok: false,
          message: "Anfrage nicht gefunden.",
        },
        { status: 404 },
      );
    }

    const request = requestData as RequestRow;

    if (
      cleanText(request.status).toLowerCase() === "confirmed" ||
      cleanText(request.offer_status).toLowerCase() === "confirmed"
    ) {
      return serviceResponse(
        {
          ok: false,
          message:
            "Der Paketwunsch wurde bereits bestätigt. Automatische Produktzuordnungen werden nicht mehr verändert.",
        },
        { status: 409 },
      );
    }

    const { data: itemsData, error: itemsError } = await supabase
      .from("school_request_items")
      .select(
        [
          "id",
          "request_id",
          "child_id",
          "raw_text",
          "normalized_name",
          "quantity",
          "category",
          "notes",
          "status",
          "admin_resolution_status",
          "is_book",
          "book_isbn10",
          "book_isbn13",
        ].join(", "),
      )
      .eq("request_id", requestId)
      .order("created_at", { ascending: true });

    if (itemsError) {
      return serviceResponse(
        {
          ok: false,
          message: itemsError.message,
        },
        { status: 500 },
      );
    }

    const items = (itemsData || []) as unknown as RequestItemRow[];

    if (items.length === 0) {
      return serviceResponse({
        ok: true,
        adoptedCount: 0,
        correctedCount: 0,
        refreshedCount: 0,
        protectedCount: 0,
        exactIsbnCount: 0,
        skippedCount: 0,
        minimumScore: SAFE_MATCH_SCORE,
        message:
          "Es sind keine erkannten Materialpositionen vorhanden. Bitte zuerst die Liste erneut analysieren.",
      });
    }

    const { data: offerItemsData, error: offerItemsError } =
      await supabase
        .from("school_offer_items")
        .select(
          [
            "id",
            "request_id",
            "request_item_id",
            "match_id",
            "product_id",
            "product_name",
            "product_sku",
            "product_price",
            "quantity",
            "unit",
            "source",
            "status",
            "notes",
            "customer_note",
            "customer_note_updated_at",
            "child_id",
            "created_at",
            "updated_at",
          ].join(", "),
        )
        .eq("request_id", requestId);

    if (offerItemsError) {
      return serviceResponse(
        {
          ok: false,
          message: offerItemsError.message,
        },
        { status: 500 },
      );
    }

    const offerItems =
      (offerItemsData || []) as unknown as OfferItemRow[];

    const technicalBackfillTimestamps =
      getLikelyTechnicalBackfillTimestamps(offerItems);

    const eligibleItems = items.filter(
      (item) => !isRequestItemBlockedForAutoAdoption(item),
    );

    if (eligibleItems.length === 0) {
      return serviceResponse({
        ok: true,
        adoptedCount: 0,
        correctedCount: 0,
        refreshedCount: 0,
        protectedCount: 0,
        exactIsbnCount: 0,
        skippedCount: items.length,
        minimumScore: SAFE_MATCH_SCORE,
        message:
          "Es sind keine Positionen vorhanden, die automatisch übernommen werden dürfen.",
      });
    }

    const eligibleItemIds = eligibleItems.map((item) => item.id);

    const { data: matchesData, error: matchesError } = await supabase
      .from("school_request_matches")
      .select(
        [
          "id",
          "request_item_id",
          "product_id",
          "product_name",
          "product_sku",
          "product_price",
          "match_score",
          "match_reason",
        ].join(", "),
      )
      .in("request_item_id", eligibleItemIds)
      .gte("match_score", SAFE_MATCH_SCORE)
      .order("request_item_id", { ascending: true })
      .order("match_score", { ascending: false })
      .order("product_name", { ascending: true })
      .order("product_sku", { ascending: true })
      .order("id", { ascending: true });

    if (matchesError) {
      return serviceResponse(
        {
          ok: false,
          message: matchesError.message,
        },
        { status: 500 },
      );
    }

    const matches =
      (matchesData || []) as unknown as RequestMatchRow[];

    const matchesByRequestItem = getMatchesByRequestItem(matches);
    const offerItemsByRequestItem =
      getOfferItemsByRequestItem(offerItems);

    const rowsToInsert: AutoOfferInsertRow[] = [];
    const plannedUpdates: PlannedOfferUpdate[] = [];
    const selectedMatchIds = new Set<string>();
    const deselectedMatchIds = new Set<string>();

    let protectedCount = 0;
    let exactIsbnCount = 0;

    for (const item of eligibleItems) {
      const itemMatches = matchesByRequestItem.get(item.id) || [];
      const existingOfferItems =
        offerItemsByRequestItem.get(item.id) || [];

      const bookIdentity = getRequestItemBookIdentity(item);

      if (bookIdentity.isBook) {
        const exactMatches = getUniqueExactIsbnMatches(itemMatches);

        if (exactMatches.length !== 1) {
          if (existingOfferItems.length > 0) {
            protectedCount += 1;
          }

          continue;
        }

        const exactMatch = exactMatches[0];
        exactIsbnCount += 1;

        if (existingOfferItems.length === 0) {
          rowsToInsert.push(
            buildInsertRow({
              requestId,
              requestItem: item,
              match: exactMatch,
              now,
              exactIsbn: true,
            }),
          );

          selectedMatchIds.add(exactMatch.id);
          continue;
        }

        const sameProductOfferItems = existingOfferItems.filter(
          (offerItem) =>
            offerItem.product_id === exactMatch.product_id,
        );

        if (sameProductOfferItems.length > 0) {
          selectedMatchIds.add(exactMatch.id);

          if (existingOfferItems.length > 1) {
            protectedCount += 1;
            continue;
          }

          const existingOfferItem = sameProductOfferItems[0];

          if (hasAutoIsbnIdentityMarker(existingOfferItem)) {
            continue;
          }

          if (
            !isPristineAutomaticOfferItem(
              existingOfferItem,
              technicalBackfillTimestamps,
            )
          ) {
            continue;
          }

          plannedUpdates.push({
            offerItem: existingOfferItem,
            requestItem: item,
            match: exactMatch,
            mode: "refreshed",
          });

          if (
            existingOfferItem.match_id &&
            existingOfferItem.match_id !== exactMatch.id
          ) {
            deselectedMatchIds.add(existingOfferItem.match_id);
          }

          continue;
        }

        if (
          existingOfferItems.length !== 1 ||
          hasAutoIsbnIdentityMarker(existingOfferItems[0]) ||
          !isPristineAutomaticOfferItem(
            existingOfferItems[0],
            technicalBackfillTimestamps,
          )
        ) {
          protectedCount += 1;
          continue;
        }

        const existingOfferItem = existingOfferItems[0];

        plannedUpdates.push({
          offerItem: existingOfferItem,
          requestItem: item,
          match: exactMatch,
          mode: "corrected",
        });

        if (
          existingOfferItem.match_id &&
          existingOfferItem.match_id !== exactMatch.id
        ) {
          deselectedMatchIds.add(existingOfferItem.match_id);
        }

        selectedMatchIds.add(exactMatch.id);
        continue;
      }

      if (existingOfferItems.length > 0) {
        continue;
      }

      const bestMatch = getBestSafeGenericMatch(itemMatches);

      if (!bestMatch) {
        continue;
      }

      rowsToInsert.push(
        buildInsertRow({
          requestId,
          requestItem: item,
          match: bestMatch,
          now,
          exactIsbn: false,
        }),
      );

      selectedMatchIds.add(bestMatch.id);
    }

    for (const plan of plannedUpdates) {
      let updateQuery = supabase
        .from("school_offer_items")
        .update(buildOfferUpdatePayload(plan, now))
        .eq("id", plan.offerItem.id)
        .eq("request_id", requestId)
        .eq("source", plan.offerItem.source)
        .eq("status", plan.offerItem.status)
        .is("customer_note", null)
        .is("customer_note_updated_at", null);

      if (plan.offerItem.updated_at) {
        updateQuery = updateQuery.eq(
          "updated_at",
          plan.offerItem.updated_at,
        );
      }

      if (plan.offerItem.product_id) {
        updateQuery = updateQuery.eq(
          "product_id",
          plan.offerItem.product_id,
        );
      } else {
        updateQuery = updateQuery.is("product_id", null);
      }

      const {
        data: updatedOfferItem,
        error: updateError,
      } = await updateQuery.select("id").maybeSingle();

      if (updateError) {
        return serviceResponse(
          {
            ok: false,
            message: updateError.message,
          },
          { status: 500 },
        );
      }

      if (!updatedOfferItem) {
        return serviceResponse(
          {
            ok: false,
            message:
              "Die automatische Paketposition wurde zwischenzeitlich verändert und deshalb nicht überschrieben. Bitte lade die Anfrage neu.",
          },
          { status: 409 },
        );
      }
    }

    let insertedCount = 0;

    if (rowsToInsert.length > 0) {
      const {
        data: insertedOfferItems,
        error: insertError,
      } = await supabase
        .from("school_offer_items")
        .insert(rowsToInsert)
        .select("id, request_item_id, match_id, product_id");

      if (insertError) {
        return serviceResponse(
          {
            ok: false,
            message: insertError.message,
          },
          { status: 500 },
        );
      }

      insertedCount =
        insertedOfferItems?.length || rowsToInsert.length;
    }

    if (deselectedMatchIds.size > 0) {
      const { error: deselectError } = await supabase
        .from("school_request_matches")
        .update({
          selected: false,
        })
        .in("id", Array.from(deselectedMatchIds));

      if (deselectError) {
        console.error(
          "Alte automatische Matches konnten nicht abgewählt werden:",
          deselectError,
        );
      }
    }

    if (selectedMatchIds.size > 0) {
      const { error: matchUpdateError } = await supabase
        .from("school_request_matches")
        .update({
          selected: true,
        })
        .in("id", Array.from(selectedMatchIds));

      if (matchUpdateError) {
        console.error(
          "Sichere Matches wurden übernommen, aber selected konnte nicht aktualisiert werden:",
          matchUpdateError,
        );
      }
    }

    const correctedCount = plannedUpdates.filter(
      (plan) => plan.mode === "corrected",
    ).length;

    const refreshedCount = plannedUpdates.filter(
      (plan) => plan.mode === "refreshed",
    ).length;

    const handledItemCount =
      insertedCount + correctedCount + refreshedCount;

    const skippedCount = Math.max(
      0,
      items.length - handledItemCount,
    );

    if (handledItemCount > 0) {
      const nextOfferStatus = getNextOfferStatus(
        request.offer_status,
      );

      const { error: requestUpdateError } = await supabase
        .from("school_requests")
        .update({
          offer_status: nextOfferStatus,
          updated_at: now,
        })
        .eq("id", requestId);

      if (requestUpdateError) {
        console.error(
          "Anfragestatus konnte nach automatischer Übernahme nicht aktualisiert werden:",
          requestUpdateError,
        );
      }
    }

    const message = buildResultMessage({
      adoptedCount: insertedCount,
      correctedCount,
      refreshedCount,
      protectedCount,
    });

    await insertRequestEvent({
      supabase,
      requestId,
      eventType: "safe_matches_adopted",
      title:
        insertedCount + correctedCount + refreshedCount > 0
          ? "Sichere Treffer übernommen"
          : "Keine sicheren Treffer übernommen",
      description: [
        message,
        `Mindestscore für normale automatische Treffer: ${SAFE_MATCH_SCORE} %.`,
        `Eindeutige ISBN-Zuordnungen verarbeitet: ${exactIsbnCount}.`,
      ].join(" "),
    });

    return serviceResponse({
      ok: true,
      adoptedCount: insertedCount,
      correctedCount,
      refreshedCount,
      protectedCount,
      exactIsbnCount,
      skippedCount,
      minimumScore: SAFE_MATCH_SCORE,
      message,
    });
  } catch (error) {
    console.error("adopt safe matches error:", error);

    return serviceResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Sichere Treffer konnten nicht übernommen werden.",
      },
      { status: 500 },
    );
  }
}