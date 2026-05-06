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

async function createRequestEvent(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  requestId: string,
  eventType: string,
  message: string,
  metadata?: Record<string, unknown>
) {
  const payloads = [
    {
      request_id: requestId,
      event_type: eventType,
      message,
      metadata: metadata ?? {},
    },
    {
      request_id: requestId,
      type: eventType,
      message,
      metadata: metadata ?? {},
    },
  ];

  for (const payload of payloads) {
    const { error } = await supabase
      .from("school_request_events")
      .insert(payload);

    if (!error) return;
  }
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
      return jsonResponse(
        {
          ok: false,
          message:
            "Zu dieser Anfrage wurde keine Datei gefunden. Bitte lade die Liste erneut hoch.",
        },
        404
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
      "Kunde hat die automatische Listenauswertung gestartet.",
      {
        token,
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
        await supabase
          .from("school_requests")
          .update({
            status: "manual_review",
            ai_status: "error",
            updated_at: new Date().toISOString(),
          })
          .eq("id", requestId);

        return jsonResponse(
          {
            ok: false,
            message:
              "Die Analyse-Route hat keine JSON-Antwort geliefert. Prüfe bitte das Terminal.",
            details: getShortRawText(analyzePayload.rawText),
          },
          500
        );
      }

      if (!analyzeResponse.ok || analyzePayload.json.ok === false) {
        await supabase
          .from("school_requests")
          .update({
            status: "manual_review",
            ai_status: "error",
            updated_at: new Date().toISOString(),
          })
          .eq("id", requestId);

        return jsonResponse(
          {
            ok: false,
            message:
              analyzePayload.json.message ||
              "Die Liste konnte nicht ausgewertet werden.",
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
      await supabase
        .from("school_requests")
        .update({
          status: "manual_review",
          ai_status: "no_items_detected",
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      return jsonResponse(
        {
          ok: false,
          itemCount: 0,
          matchCount: 0,
          message:
            "Es konnten keine Positionen aus der Liste erkannt werden. Bitte prüfe die Datei oder bearbeite die Anfrage manuell.",
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

    const requestItemIds = (requestItems || []).map((item) => item.id);

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
        await supabase
          .from("school_requests")
          .update({
            status: "manual_review",
            offer_status: "not_created",
            updated_at: new Date().toISOString(),
          })
          .eq("id", requestId);

        return jsonResponse(
          {
            ok: false,
            message:
              "Die Matching-Route hat keine JSON-Antwort geliefert. Prüfe bitte das Terminal.",
            details: getShortRawText(matchPayload.rawText),
          },
          500
        );
      }

      if (!matchResponse.ok || matchPayload.json.ok === false) {
        await supabase
          .from("school_requests")
          .update({
            status: "manual_review",
            offer_status: "not_created",
            updated_at: new Date().toISOString(),
          })
          .eq("id", requestId);

        return jsonResponse(
          {
            ok: false,
            message:
              matchPayload.json.message ||
              "Die Produktvorschläge konnten nicht erstellt werden.",
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

    await supabase
      .from("school_requests")
      .update({
        status: "analysis_done",
        ai_status: "done",
        offer_status: "matching_done",
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    await createRequestEvent(
      supabase,
      requestId,
      "customer_prepare_done",
      "Automatische Listenauswertung und Produktvorschläge wurden erstellt.",
      {
        itemCount,
        matchCount,
      }
    );

    return jsonResponse({
      ok: true,
      itemCount,
      matchCount,
      message:
        matchCount > 0
          ? "Deine Liste wurde ausgewertet. Du kannst jetzt passende Produkte auswählen."
          : "Deine Liste wurde ausgewertet. Es wurden Positionen erkannt, aber nicht überall passende Produktvorschläge gefunden. Du kannst Produkte selbst suchen oder BSS prüft die Positionen manuell.",
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