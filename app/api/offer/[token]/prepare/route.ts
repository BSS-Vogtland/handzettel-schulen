import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    token: string;
  }>;
};

type SchoolRequest = {
  id: string;
  status: string | null;
  offer_status: string | null;
  ai_status: string | null;
};

type RequestItemRow = {
  id: string;
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
  selected: boolean | null;
  created_at: string | null;
};

type OfferItemRow = {
  id: string;
  request_id: string;
  request_item_id: string | null;
  match_id: string | null;
  product_id: string | null;
};

const AUTO_PRESELECT_MIN_SCORE = 85;

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

async function createRequestEvent(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  requestId: string,
  eventType: string,
  message: string,
  metadata?: Record<string, unknown>
) {
  const createdAt = new Date().toISOString();

  const payloads = [
    {
      request_id: requestId,
      event_type: eventType,
      message,
      metadata: metadata ?? {},
      created_at: createdAt,
    },
    {
      request_id: requestId,
      type: eventType,
      message,
      metadata: metadata ?? {},
      created_at: createdAt,
    },
    {
      request_id: requestId,
      event_type: eventType,
      message,
      created_at: createdAt,
    },
  ];

  for (const payload of payloads) {
    const { error } = await supabase
      .from("school_request_events")
      .insert(payload);

    if (!error) return;
  }
}

async function markRequestAsManualReview(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
  aiStatus?: string;
  offerStatus?: string;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const {
    supabase,
    requestId,
    aiStatus = "manual_review",
    offerStatus = "manual_review",
    eventType,
    message,
    metadata,
  } = params;

  const now = new Date().toISOString();

  await supabase
    .from("school_requests")
    .update({
      status: "manual_review",
      ai_status: aiStatus,
      offer_status: offerStatus,
      updated_at: now,
    })
    .eq("id", requestId);

  await createRequestEvent(supabase, requestId, eventType, message, {
    ...(metadata || {}),
    manualReview: true,
  });
}

async function readJsonSafely(response: Response) {
  const rawText = await response.text();

  try {
    return {
      rawText,
      json: rawText ? JSON.parse(rawText) : null,
    };
  } catch {
    return {
      rawText,
      json: null,
    };
  }
}

function getShortRawText(rawText: string) {
  if (!rawText) return "";

  return rawText
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function compareMatches(a: RequestMatchRow, b: RequestMatchRow) {
  const scoreDifference =
    toNumber(b.match_score, 0) - toNumber(a.match_score, 0);

  if (scoreDifference !== 0) return scoreDifference;

  const nameComparison = String(a.product_name || "").localeCompare(
    String(b.product_name || ""),
    "de",
    {
      numeric: true,
      sensitivity: "base",
    }
  );

  if (nameComparison !== 0) return nameComparison;

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

function getBestAutoPreselectMatches(matches: RequestMatchRow[]) {
  const matchesByRequestItem = new Map<string, RequestMatchRow[]>();

  for (const match of matches) {
    if (!match.request_item_id) continue;
    if (!match.product_id) continue;

    const score = toNumber(match.match_score, 0);
    if (score < AUTO_PRESELECT_MIN_SCORE) continue;

    const current = matchesByRequestItem.get(match.request_item_id) || [];
    current.push(match);
    matchesByRequestItem.set(match.request_item_id, current);
  }

  const bestMatches: RequestMatchRow[] = [];

  for (const itemMatches of matchesByRequestItem.values()) {
    const bestMatch = itemMatches.sort(compareMatches)[0];

    if (bestMatch) {
      bestMatches.push(bestMatch);
    }
  }

  return bestMatches.sort(compareMatches);
}

async function autoPreselectSafeMatches(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
  requestItemIds: string[];
}) {
  const { supabase, requestId, requestItemIds } = params;

  if (requestItemIds.length === 0) {
    return {
      preselectedCount: 0,
      alreadyExistingCount: 0,
      candidateCount: 0,
    };
  }

  const { data: matchesData, error: matchesError } = await supabase
    .from("school_request_matches")
    .select("*")
    .in("request_item_id", requestItemIds)
    .order("request_item_id", { ascending: true })
    .order("match_score", { ascending: false })
    .order("product_name", { ascending: true })
    .order("product_sku", { ascending: true })
    .order("id", { ascending: true });

  if (matchesError) {
    throw new Error(
      `Sichere Treffer konnten nicht geladen werden: ${matchesError.message}`
    );
  }

  const matches = (matchesData || []) as RequestMatchRow[];
  const candidates = getBestAutoPreselectMatches(matches);

  if (candidates.length === 0) {
    return {
      preselectedCount: 0,
      alreadyExistingCount: 0,
      candidateCount: 0,
    };
  }

  const { data: existingOfferItemsData, error: existingOfferItemsError } =
    await supabase
      .from("school_offer_items")
      .select("id, request_id, request_item_id, match_id, product_id")
      .eq("request_id", requestId);

  if (existingOfferItemsError) {
    throw new Error(
      `Bestehende Paketpositionen konnten nicht geprüft werden: ${existingOfferItemsError.message}`
    );
  }

  const existingOfferItems = (existingOfferItemsData || []) as OfferItemRow[];

  const existingRequestItemIds = new Set(
    existingOfferItems
      .map((item) => item.request_item_id)
      .filter((value): value is string => Boolean(value))
  );

  const existingMatchIds = new Set(
    existingOfferItems
      .map((item) => item.match_id)
      .filter((value): value is string => Boolean(value))
  );

  const existingProductKeys = new Set(
    existingOfferItems
      .map((item) => {
        if (!item.request_item_id || !item.product_id) return null;
        return `${item.request_item_id}::${item.product_id}`;
      })
      .filter((value): value is string => Boolean(value))
  );

  const rowsToInsert = candidates
    .filter((match) => {
      const productKey = `${match.request_item_id}::${match.product_id}`;

      if (existingRequestItemIds.has(match.request_item_id)) return false;
      if (existingMatchIds.has(match.id)) return false;
      if (existingProductKeys.has(productKey)) return false;

      return true;
    })
    .map((match) => {
      const productPrice = toNumber(match.product_price, 0);

      return {
        request_id: requestId,
        request_item_id: match.request_item_id,
        match_id: match.id,
        product_id: match.product_id,
        product_name: cleanText(match.product_name, "Produkt"),
        product_sku: cleanText(match.product_sku, "") || null,
        product_price: productPrice,
        quantity: 1,
        unit: "Stk.",
        source: "auto_preselected",
        status: "preselected",
        notes: `Automatisch vorausgewählt, da der Produkttreffer ${toNumber(
          match.match_score,
          0
        )} % Übereinstimmung erreicht hat.`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });

  if (rowsToInsert.length === 0) {
    return {
      preselectedCount: 0,
      alreadyExistingCount: candidates.length,
      candidateCount: candidates.length,
    };
  }

  const { error: insertError } = await supabase
    .from("school_offer_items")
    .insert(rowsToInsert);

  if (insertError) {
    throw new Error(
      `Sichere Treffer konnten nicht automatisch in den Paketwunsch gelegt werden: ${insertError.message}`
    );
  }

  await createRequestEvent(
    supabase,
    requestId,
    "customer_auto_preselected_items",
    `${rowsToInsert.length} sichere Treffer wurden automatisch in den Paketwunsch gelegt.`,
    {
      threshold: AUTO_PRESELECT_MIN_SCORE,
      preselectedCount: rowsToInsert.length,
      candidateCount: candidates.length,
      matchIds: rowsToInsert.map((row) => row.match_id),
    }
  );

  return {
    preselectedCount: rowsToInsert.length,
    alreadyExistingCount: candidates.length - rowsToInsert.length,
    candidateCount: candidates.length,
  };
}

export async function POST(request: NextRequest, context: Params) {
  try {
    const { token } = await context.params;
    const supabase = getSupabaseAdmin();

    if (!token) {
      return jsonResponse(
        {
          ok: false,
          message: "Kein Angebotstoken übergeben.",
        },
        400
      );
    }

    const { data: requestData, error: requestError } = await supabase
      .from("school_requests")
      .select("id, status, offer_status, ai_status")
      .eq("offer_token", token)
      .maybeSingle();

    if (requestError) {
      return jsonResponse(
        {
          ok: false,
          message: `Anfrage konnte nicht geladen werden: ${requestError.message}`,
        },
        500
      );
    }

    if (!requestData) {
      return jsonResponse(
        {
          ok: false,
          message: "Anfrage wurde nicht gefunden.",
        },
        404
      );
    }

    const schoolRequest = requestData as SchoolRequest;
    const requestId = schoolRequest.id;

    if (
      schoolRequest.status === "confirmed" ||
      schoolRequest.offer_status === "confirmed"
    ) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Der Paketwunsch wurde bereits abgesendet. Die Auswertung kann nicht erneut gestartet werden.",
        },
        409
      );
    }

    const { data: files, error: filesError } = await supabase
      .from("school_request_files")
      .select("id")
      .eq("request_id", requestId)
      .limit(1);

    if (filesError) {
      return jsonResponse(
        {
          ok: false,
          message: `Datei konnte nicht geprüft werden: ${filesError.message}`,
        },
        500
      );
    }

    if (!files || files.length === 0) {
      await markRequestAsManualReview({
        supabase,
        requestId,
        aiStatus: "missing_file",
        offerStatus: "manual_review",
        eventType: "package_prepare_needs_manual_review",
        message:
          "Automatische Paketvorbereitung wurde gestoppt, weil keine Datei zur Anfrage gefunden wurde.",
        metadata: {
          reason: "missing_file",
          token,
        },
      });

      return jsonResponse(
        {
          ok: false,
          manualReview: true,
          reason: "missing_file",
          message:
            "Zu dieser Anfrage wurde keine Datei gefunden. Die Anfrage wurde zur manuellen Prüfung markiert.",
        },
        422
      );
    }

    await supabase
      .from("school_requests")
      .update({
        status: "analysis_running",
        ai_status: "running",
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    await createRequestEvent(
      supabase,
      requestId,
      "customer_prepare_started",
      "Kunde hat die automatische Paketvorbereitung gestartet.",
      {
        token,
        autoPreselectMinScore: AUTO_PRESELECT_MIN_SCORE,
      }
    );

    const { count: existingItemCount } = await supabase
      .from("school_request_items")
      .select("id", { count: "exact", head: true })
      .eq("request_id", requestId);

    let itemCount = existingItemCount || 0;

    const origin = new URL(request.url).origin;

    if (itemCount === 0) {
      const analyzeUrl = `${origin}/api/admin/requests/${requestId}/analyze`;

      const analyzeResponse = await fetch(analyzeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const analyzePayload = await readJsonSafely(analyzeResponse);

      if (!analyzePayload.json) {
        await markRequestAsManualReview({
          supabase,
          requestId,
          aiStatus: "error",
          offerStatus: "manual_review",
          eventType: "package_prepare_needs_manual_review",
          message:
            "Die automatische Analyse konnte nicht abgeschlossen werden, weil die Analyse-Route keine JSON-Antwort geliefert hat.",
          metadata: {
            reason: "analyze_no_json_response",
            details: getShortRawText(analyzePayload.rawText),
            token,
          },
        });

        return jsonResponse(
          {
            ok: false,
            manualReview: true,
            reason: "analyze_no_json_response",
            message:
              "Die Analyse-Route hat keine JSON-Antwort geliefert. Die Anfrage wurde zur manuellen Prüfung markiert.",
            details: getShortRawText(analyzePayload.rawText),
          },
          500
        );
      }

      if (!analyzeResponse.ok || analyzePayload.json.ok === false) {
        await markRequestAsManualReview({
          supabase,
          requestId,
          aiStatus: "error",
          offerStatus: "manual_review",
          eventType: "package_prepare_needs_manual_review",
          message:
            "Die automatische Analyse konnte die Liste nicht auswerten. Die Anfrage wurde zur manuellen Prüfung markiert.",
          metadata: {
            reason: "analyze_failed",
            details: analyzePayload.json,
            token,
          },
        });

        return jsonResponse(
          {
            ok: false,
            manualReview: true,
            reason: "analyze_failed",
            message:
              analyzePayload.json.message ||
              "Die Liste konnte nicht automatisch ausgewertet werden. Die Anfrage wurde zur manuellen Prüfung markiert.",
            details: analyzePayload.json,
          },
          analyzeResponse.status || 500
        );
      }

      const { count: newItemCount } = await supabase
        .from("school_request_items")
        .select("id", { count: "exact", head: true })
        .eq("request_id", requestId);

      itemCount = newItemCount || 0;
    }

    if (itemCount === 0) {
      await markRequestAsManualReview({
        supabase,
        requestId,
        aiStatus: "no_items_detected",
        offerStatus: "manual_review",
        eventType: "package_prepare_needs_manual_review",
        message:
          "Es konnten keine Positionen aus der Liste erkannt werden. Die Anfrage wurde zur manuellen Prüfung markiert.",
        metadata: {
          reason: "no_items_detected",
          itemCount: 0,
          matchCount: 0,
          preselectedCount: 0,
          token,
        },
      });

      return jsonResponse(
        {
          ok: false,
          manualReview: true,
          reason: "no_items_detected",
          itemCount: 0,
          matchCount: 0,
          preselectedCount: 0,
          message:
            "Es konnten keine Positionen aus der Liste erkannt werden. Deine Anfrage wurde zur manuellen Prüfung markiert.",
        },
        422
      );
    }

    const { data: requestItems, error: itemsError } = await supabase
      .from("school_request_items")
      .select("id")
      .eq("request_id", requestId);

    if (itemsError) {
      return jsonResponse(
        {
          ok: false,
          message: `Erkannte Positionen konnten nicht geladen werden: ${itemsError.message}`,
        },
        500
      );
    }

    const requestItemIds = ((requestItems || []) as RequestItemRow[]).map(
      (item) => item.id
    );

    let matchCount = 0;

    if (requestItemIds.length > 0) {
      const { count: existingMatchCount } = await supabase
        .from("school_request_matches")
        .select("id", { count: "exact", head: true })
        .in("request_item_id", requestItemIds);

      matchCount = existingMatchCount || 0;
    }

    if (matchCount === 0) {
      const matchUrl = `${origin}/api/admin/requests/${requestId}/match`;

      const matchResponse = await fetch(matchUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const matchPayload = await readJsonSafely(matchResponse);

      if (!matchPayload.json) {
        await markRequestAsManualReview({
          supabase,
          requestId,
          aiStatus: "done",
          offerStatus: "manual_review",
          eventType: "package_prepare_needs_manual_review",
          message:
            "Die automatische Produktzuordnung konnte nicht abgeschlossen werden, weil die Matching-Route keine JSON-Antwort geliefert hat.",
          metadata: {
            reason: "match_no_json_response",
            itemCount,
            details: getShortRawText(matchPayload.rawText),
            token,
          },
        });

        return jsonResponse(
          {
            ok: false,
            manualReview: true,
            reason: "match_no_json_response",
            message:
              "Die Matching-Route hat keine JSON-Antwort geliefert. Die Anfrage wurde zur manuellen Prüfung markiert.",
            details: getShortRawText(matchPayload.rawText),
          },
          500
        );
      }

      if (!matchResponse.ok || matchPayload.json.ok === false) {
        await markRequestAsManualReview({
          supabase,
          requestId,
          aiStatus: "done",
          offerStatus: "manual_review",
          eventType: "package_prepare_needs_manual_review",
          message:
            "Die automatische Produktzuordnung konnte nicht erstellt werden. Die Anfrage wurde zur manuellen Prüfung markiert.",
          metadata: {
            reason: "match_failed",
            itemCount,
            details: matchPayload.json,
            token,
          },
        });

        return jsonResponse(
          {
            ok: false,
            manualReview: true,
            reason: "match_failed",
            message:
              matchPayload.json.message ||
              "Die Produktvorschläge konnten nicht erstellt werden. Die Anfrage wurde zur manuellen Prüfung markiert.",
            details: matchPayload.json,
          },
          matchResponse.status || 500
        );
      }

      if (requestItemIds.length > 0) {
        const { count: newMatchCount } = await supabase
          .from("school_request_matches")
          .select("id", { count: "exact", head: true })
          .in("request_item_id", requestItemIds);

        matchCount = newMatchCount || 0;
      }
    }

    const autoPreselectResult = await autoPreselectSafeMatches({
      supabase,
      requestId,
      requestItemIds,
    });

    const nextOfferStatus =
      autoPreselectResult.preselectedCount > 0 ||
      autoPreselectResult.alreadyExistingCount > 0
        ? "customer_selection"
        : "matching_done";

    await supabase
      .from("school_requests")
      .update({
        status: "analysis_done",
        ai_status: "done",
        offer_status: nextOfferStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    await createRequestEvent(
      supabase,
      requestId,
      "customer_prepare_done",
      autoPreselectResult.preselectedCount > 0
        ? "Automatische Listenauswertung wurde abgeschlossen. Sichere Treffer wurden direkt in den Paketwunsch gelegt."
        : "Automatische Listenauswertung und Produktvorschläge wurden erstellt.",
      {
        itemCount,
        matchCount,
        preselectedCount: autoPreselectResult.preselectedCount,
        alreadyExistingCount: autoPreselectResult.alreadyExistingCount,
        autoPreselectMinScore: AUTO_PRESELECT_MIN_SCORE,
      }
    );

    return jsonResponse({
      ok: true,
      itemCount,
      matchCount,
      preselectedCount: autoPreselectResult.preselectedCount,
      alreadyExistingCount: autoPreselectResult.alreadyExistingCount,
      autoPreselectMinScore: AUTO_PRESELECT_MIN_SCORE,
      message:
        autoPreselectResult.preselectedCount > 0
          ? `${autoPreselectResult.preselectedCount} sichere Treffer wurden bereits für Dich in den Paketwunsch gelegt. Du kannst sie bei Bedarf entfernen und die offenen Positionen ergänzen.`
          : matchCount > 0
            ? "Deine Liste wurde ausgewertet. Sichere Treffer werden angezeigt, offene Positionen kannst Du aktiv auswählen."
            : "Deine Liste wurde ausgewertet. Es wurden Positionen erkannt, aber nicht überall passende Produktvorschläge gefunden. Du kannst Produkte selbst suchen oder Handzettel-Schulen.de prüft die Positionen manuell.",
    });
  } catch (error) {
    console.error("Customer prepare package error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die Liste konnte nicht ausgewertet werden.",
      },
      500
    );
  }
}