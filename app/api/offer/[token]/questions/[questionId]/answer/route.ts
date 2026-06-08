import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    token: string;
    questionId: string;
  }>;
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
      title: "Rückfrage beantwortet",
      description: message,
      metadata: metadata ?? {},
      created_at: new Date().toISOString(),
    },
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

export async function POST(request: NextRequest, context: Params) {
  try {
    const { token, questionId } = await context.params;
    const supabase = getSupabaseAdmin();

    const body = await request.json().catch(() => null);
    const answerText = String(body?.answerText || "").trim();

    if (!token || !questionId) {
      return jsonResponse(
        {
          ok: false,
          message: "Angebotslink oder Rückfrage fehlt.",
        },
        400
      );
    }

    if (!answerText) {
      return jsonResponse(
        {
          ok: false,
          message: "Bitte gib eine Antwort ein.",
        },
        400
      );
    }

    const { data: requestData, error: requestError } = await supabase
      .from("school_requests")
      .select("id, status, offer_status")
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

    if (
      requestData.status === "confirmed" ||
      requestData.offer_status === "confirmed"
    ) {
      return jsonResponse(
        {
          ok: false,
          message: "Diese Anfrage wurde bereits bestätigt.",
        },
        409
      );
    }

    const now = new Date().toISOString();

    const { data: question, error: updateError } = await supabase
      .from("school_request_item_questions")
      .update({
        answer_text: answerText,
        status: "answered",
        answered_at: now,
        updated_at: now,
      })
      .eq("id", questionId)
      .eq("request_id", requestData.id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();

    if (updateError) {
      return jsonResponse(
        {
          ok: false,
          message: `Antwort konnte nicht gespeichert werden: ${updateError.message}`,
        },
        500
      );
    }

    if (!question) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Diese Rückfrage ist nicht mehr offen oder wurde bereits beantwortet.",
        },
        409
      );
    }

    await createRequestEvent(
      supabase,
      requestData.id,
      "request_item_question_answered",
      "Der Kunde hat eine Rückfrage beantwortet.",
      {
        questionId,
        requestItemId: question.request_item_id,
      }
    );

    return jsonResponse({
      ok: true,
      question,
      message: "Danke, Deine Antwort wurde gespeichert.",
    });
  } catch (error) {
    console.error("Customer question answer error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Antwort konnte nicht gespeichert werden.",
      },
      500
    );
  }
}
