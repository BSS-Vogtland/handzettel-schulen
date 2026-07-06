import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

type RequestItemRow = {
  id: string;
  request_id: string;
  raw_text: string | null;
  normalized_name: string | null;
  quantity: number | string | null;
  category?: string | null;
  notes?: string | null;
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
};

const SAFE_MATCH_SCORE = 80;

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

function normalizeQuantity(value: unknown) {
  return Math.max(1, Math.min(99, Math.floor(toNumber(value, 1))));
}

function getRequestItemTitle(item: RequestItemRow) {
  return item.normalized_name || item.raw_text || "Unbekannte Position";
}


function isSafeAutoAdoptMatch(match: RequestMatchRow) {
  const score = toNumber(match.match_score, 0);
  const reason = String(match.match_reason || "").toLowerCase();

  if (!match.request_item_id || !match.product_id || !match.product_name) {
    return false;
  }

  if (score < SAFE_MATCH_SCORE) {
    return false;
  }

  if (
    reason.includes("artverwandter kandidat") ||
    reason.includes("admin-pr") ||
    reason.includes("variantenmerkmale") ||
    reason.includes("bitte pr") ||
    reason.includes("teilweise erkannt") ||
    reason.includes("score begrenzt") ||
    reason.includes("abweichende explizite nummer")
  ) {
    return false;
  }

  // S0: learned aliases are not separated from normal search aliases yet.
  if (reason.includes("gelernte zuordnung")) {
    return false;
  }

  return true;
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

function compareMatches(a: RequestMatchRow, b: RequestMatchRow) {
  const scoreDifference = toNumber(b.match_score, 0) - toNumber(a.match_score, 0);

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

type AutoSafeOfferInsertRow = {
  request_id: string;
  request_item_id: string | null;
  match_id: string | null;
  product_id: string | null;
  product_name: string;
  product_sku: string | null;
  product_price: number;
  quantity: number;
  unit: string;
  source: string;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

function getAutoSafeProductKey(row: AutoSafeOfferInsertRow) {
  const productId = String(row.product_id || "").trim();
  if (productId) return `id:${productId}`;

  const sku = String(row.product_sku || "").trim().toLowerCase();
  if (sku) return `sku:${sku}`;

  return `name:${String(row.product_name || "").trim().toLowerCase()}`;
}

function mergeAutoSafeRowsByProduct(rows: AutoSafeOfferInsertRow[]) {
  const mergedByKey = new Map<
    string,
    {
      row: AutoSafeOfferInsertRow;
      matchIds: string[];
      requestItemIds: string[];
    }
  >();

  for (const row of rows) {
    const key = getAutoSafeProductKey(row);
    const existing = mergedByKey.get(key);

    if (!existing) {
      mergedByKey.set(key, {
        row: { ...row },
        matchIds: row.match_id ? [row.match_id] : [],
        requestItemIds: row.request_item_id ? [row.request_item_id] : [],
      });
      continue;
    }

    if (row.match_id && !existing.matchIds.includes(row.match_id)) {
      existing.matchIds.push(row.match_id);
    }

    if (row.request_item_id && !existing.requestItemIds.includes(row.request_item_id)) {
      existing.requestItemIds.push(row.request_item_id);
    }

    const existingQuantity = toNumber(existing.row.quantity, 0);
    const rowQuantity = toNumber(row.quantity, 0);

    // Wichtig: Duplikate nicht addieren. Sonst wird aus 2x Umschlag fälschlich 4x.
    existing.row.quantity = Math.max(existingQuantity, rowQuantity);

    existing.row.notes = [
      existing.row.notes,
      `Automatisch zusammengeführt: weiterer sicherer Treffer für dasselbe Produkt (${row.product_name}).`,
      row.notes ? `Zusatztreffer: ${row.notes}` : null,
    ]
      .filter(Boolean)
      .join(" ");
  }

  const mergedRows: AutoSafeOfferInsertRow[] = [];
  const allMatchIds: string[] = [];

  for (const entry of mergedByKey.values()) {
    if (entry.requestItemIds.length > 1) {
      entry.row.notes = [
        entry.row.notes,
        `Zusammengeführt aus ${entry.requestItemIds.length} erkannten Listenpositionen mit gleichem Produkt.`,
      ]
        .filter(Boolean)
        .join(" ");
    }

    mergedRows.push(entry.row);

    for (const matchId of entry.matchIds) {
      if (matchId && !allMatchIds.includes(matchId)) {
        allMatchIds.push(matchId);
      }
    }
  }

  return {
    rows: mergedRows,
    matchIds: allMatchIds,
  };
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

export async function POST(_request: Request, context: Params) {
  try {
    const { id: requestId } = await context.params;

    if (!requestId) {
      return NextResponse.json(
        {
          ok: false,
          message: "Keine Anfrage-ID übergeben.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    const { data: requestData, error: requestError } = await supabase
      .from("school_requests")
      .select("id, request_number")
      .eq("id", requestId)
      .maybeSingle();

    if (requestError) {
      return NextResponse.json(
        {
          ok: false,
          message: requestError.message,
        },
        { status: 500 }
      );
    }

    if (!requestData) {
      return NextResponse.json(
        {
          ok: false,
          message: "Anfrage nicht gefunden.",
        },
        { status: 404 }
      );
    }

    const { data: itemsData, error: itemsError } = await supabase
      .from("school_request_items")
      .select("id, request_id, raw_text, normalized_name, quantity, category, notes")
      .eq("request_id", requestId)
      .order("created_at", { ascending: true });

    if (itemsError) {
      return NextResponse.json(
        {
          ok: false,
          message: itemsError.message,
        },
        { status: 500 }
      );
    }

    const items = (itemsData || []) as RequestItemRow[];

    if (items.length === 0) {
      return NextResponse.json({
        ok: true,
        adoptedCount: 0,
        skippedCount: 0,
        message:
          "Es sind keine erkannten Materialpositionen vorhanden. Bitte zuerst die Liste erneut analysieren.",
      });
    }

    const { data: offerItemsData, error: offerItemsError } = await supabase
      .from("school_offer_items")
      .select("id, request_id, request_item_id, match_id, product_id")
      .eq("request_id", requestId);

    if (offerItemsError) {
      return NextResponse.json(
        {
          ok: false,
          message: offerItemsError.message,
        },
        { status: 500 }
      );
    }

    const offerItems = (offerItemsData || []) as OfferItemRow[];

    const requestItemIdsWithOfferItem = new Set(
      offerItems
        .map((item) => item.request_item_id)
        .filter((value): value is string => Boolean(value))
    );

    const candidateItems = items.filter((item) => {
      if (isManualComboNoAutoAdoptItem(item)) {
        return false;
      }

      return !requestItemIdsWithOfferItem.has(item.id);
    });

    if (candidateItems.length === 0) {
      return NextResponse.json({
        ok: true,
        adoptedCount: 0,
        skippedCount: items.length,
        message:
          "Alle erkannten Positionen haben bereits eine Paketposition. Es wurde nichts automatisch ergänzt.",
      });
    }

    const candidateItemIds = candidateItems.map((item) => item.id);

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
        ].join(", ")
      )
      .in("request_item_id", candidateItemIds)
      .gte("match_score", SAFE_MATCH_SCORE)
      .order("request_item_id", { ascending: true })
      .order("match_score", { ascending: false })
      .order("product_name", { ascending: true })
      .order("product_sku", { ascending: true })
      .order("id", { ascending: true });

    if (matchesError) {
      return NextResponse.json(
        {
          ok: false,
          message: matchesError.message,
        },
        { status: 500 }
      );
    }

    const matches = ((matchesData || []) as unknown as RequestMatchRow[])
  .filter((match) => {
        return (
          Boolean(match.request_item_id) &&
          Boolean(match.product_id) &&
          Boolean(match.product_name) &&
          isSafeAutoAdoptMatch(match)
        );
      })
      .sort(compareMatches);

    const bestMatchByRequestItemId = new Map<string, RequestMatchRow>();

    for (const match of matches) {
      const existingMatch = bestMatchByRequestItemId.get(match.request_item_id);

      if (!existingMatch) {
        bestMatchByRequestItemId.set(match.request_item_id, match);
        continue;
      }

      const sorted = [existingMatch, match].sort(compareMatches);
      bestMatchByRequestItemId.set(match.request_item_id, sorted[0]);
    }

    const itemById = new Map<string, RequestItemRow>();

    for (const item of candidateItems) {
      itemById.set(item.id, item);
    }

    const rawRowsToInsert = Array.from(bestMatchByRequestItemId.values()).map(
      (match) => {
        const item = itemById.get(match.request_item_id);
        const quantity = normalizeQuantity(item?.quantity);

        return {
          request_id: requestId,
          request_item_id: match.request_item_id,
          match_id: match.id,
          product_id: match.product_id,

          product_name: match.product_name || "Produktvorschlag",
          product_sku: match.product_sku,
          product_price: toNumber(match.product_price, 0),

          quantity,
          unit: "Stk.",

          source: "auto_safe_match",
          status: "confirmed",
          notes: [
            `Automatisch aus sicherem Produktvorschlag übernommen.`,
            `Matchscore: ${toNumber(match.match_score, 0)} %.`,
            item ? `Listenposition: ${getRequestItemTitle(item)}` : null,
            match.match_reason ? `Grund: ${match.match_reason}` : null,
          ]
            .filter(Boolean)
            .join(" "),
          created_at: now,
          updated_at: now,
        };
      }
    );

    // Jede Listenposition bleibt eine eigene Paketposition.
    // Nicht nach product_id zusammenführen, sonst können Mengen und request_item_id-Zuordnungen verfälscht werden.
    const rowsToInsert = rawRowsToInsert;
    const insertedMatchIds = rawRowsToInsert
      .map((row) => row.match_id)
      .filter((value): value is string => Boolean(value));
    if (rowsToInsert.length === 0) {
      await insertRequestEvent({
        supabase,
        requestId,
        eventType: "safe_matches_adopted",
        title: "Keine sicheren Treffer übernommen",
        description:
          "Es wurden keine neuen sicheren Treffer ab 80 % gefunden, die noch keine Paketposition hatten.",
      });

      return NextResponse.json({
        ok: true,
        adoptedCount: 0,
        skippedCount: candidateItems.length,
        message:
          "Es wurden keine neuen sicheren Treffer ab 80 % gefunden, die noch keine Paketposition hatten.",
      });
    }

    const { data: insertedOfferItems, error: insertError } = await supabase
      .from("school_offer_items")
      .insert(rowsToInsert)
      .select("id, request_item_id, match_id, product_id");

    if (insertError) {
      return NextResponse.json(
        {
          ok: false,
          message: insertError.message,
        },
        { status: 500 }
      );
    }


    if (insertedMatchIds.length > 0) {
      const { error: matchUpdateError } = await supabase
        .from("school_request_matches")
        .update({
          selected: true,
        })
        .in("id", insertedMatchIds);

      if (matchUpdateError) {
        console.error(
          "Sichere Matches wurden übernommen, aber selected konnte nicht aktualisiert werden:",
          matchUpdateError
        );
      }
    }

    await supabase
      .from("school_requests")
      .update({
        offer_status: "matching_done",
        updated_at: now,
      })
      .eq("id", requestId);

    const adoptedCount = insertedOfferItems?.length || rowsToInsert.length;
    const skippedCount = Math.max(0, candidateItems.length - adoptedCount);

    await insertRequestEvent({
      supabase,
      requestId,
      eventType: "safe_matches_adopted",
      title: "Sichere Treffer übernommen",
      description: `${adoptedCount} sichere neue Treffer wurden automatisch in den Paketwunsch übernommen. Es wurden nur Positionen ohne bestehende Paketposition berücksichtigt. Mindestscore: ${SAFE_MATCH_SCORE} %.`,
    });

    return NextResponse.json({
      ok: true,
      adoptedCount,
      skippedCount,
      minimumScore: SAFE_MATCH_SCORE,
      message:
        adoptedCount === 1
          ? "1 sicherer Treffer wurde in den Paketwunsch übernommen."
          : `${adoptedCount} sichere Treffer wurden in den Paketwunsch übernommen.`,
    });
  } catch (error) {
    console.error("adopt safe matches error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Sichere Treffer konnten nicht übernommen werden.",
      },
      { status: 500 }
    );
  }
}


