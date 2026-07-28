import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { adoptSafeRequestMatches } from "@/app/lib/requestSafeMatchAdoptionService";
import {
  AUTO_SELECTION_GUARD_VERSION,
  AUTO_SELECTION_MIN_GENERIC_SCORE,
} from "@/lib/requestAutoSelection";
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

const AUTO_PRESELECT_MIN_SCORE =
  AUTO_SELECTION_MIN_GENERIC_SCORE;

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

async function callLocalRoute(path: string, cookieHeader: string | null) {
  const siteUrl = getSiteUrl();
  const headers = new Headers();

  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }

  const response = await fetch(`${siteUrl}${path}`, {
    method: "POST",
    headers,
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
  // CENTRAL_WHATSAPP_AUTO_SELECTION_V1
  const {
    supabase,
    requestId,
  } = input;

  const {
    data: itemRows,
    error: itemRowsError,
  } = await supabase
    .from("school_request_items")
    .select("id")
    .eq(
      "request_id",
      requestId,
    );

  if (itemRowsError) {
    throw new Error(
      `Positionen konnten nicht geladen werden: ${itemRowsError.message}`,
    );
  }

  const itemIds =
    (itemRows || []).map(
      (item) =>
        String(item.id),
    );

  let matchCount = 0;

  if (itemIds.length > 0) {
    const {
      count,
      error: matchCountError,
    } = await supabase
      .from("school_request_matches")
      .select(
        "id",
        {
          count: "exact",
          head: true,
        },
      )
      .in(
        "request_item_id",
        itemIds,
      );

    if (matchCountError) {
      throw new Error(
        `Produktvorschläge konnten nicht gezählt werden: ${matchCountError.message}`,
      );
    }

    matchCount =
      count || 0;
  }

  const adoptionResult =
    await adoptSafeRequestMatches({
      requestId,
      auditMode: "none",
    });

  if (!adoptionResult.data.ok) {
    throw new Error(
      adoptionResult.data.message ||
        "Sichere Treffer konnten nicht zentral übernommen werden.",
    );
  }

  const insertedCount =
    (adoptionResult.data.adoptedCount || 0) +
    (adoptionResult.data.correctedCount || 0) +
    (adoptionResult.data.refreshedCount || 0);

  return {
    insertedCount,

    safeMatchCount:
      insertedCount,

    itemCount:
      itemIds.length,

    matchCount,
  };
}

export async function POST(request: NextRequest, context: Params) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const cookieHeader = request.headers.get("cookie");
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
        `/api/admin/requests/${id}/analyze`,
        cookieHeader
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

    const matchPayload = await callLocalRoute(
      `/api/admin/requests/${id}/match`,
      cookieHeader
    );

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
        autoSelectionGuardVersion: AUTO_SELECTION_GUARD_VERSION,
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
