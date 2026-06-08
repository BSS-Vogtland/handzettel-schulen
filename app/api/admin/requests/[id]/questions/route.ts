import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
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
      title: "Rückfrage",
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
    const { id } = await context.params;
    const supabase = getSupabaseAdmin();

    const body = await request.json().catch(() => null);

    const requestItemId =
      typeof body?.requestItemId === "string" && body.requestItemId.trim()
        ? body.requestItemId.trim()
        : null;

    const questionText = String(body?.questionText || "").trim();

    if (!id) {
      return jsonResponse(
        {
          ok: false,
          message: "Keine Anfrage-ID übergeben.",
        },
        400
      );
    }

    if (questionText.length < 3) {
      return jsonResponse(
        {
          ok: false,
          message: "Bitte gib eine konkrete Rückfrage ein.",
        },
        400
      );
    }

    const { data: requestData, error: requestError } = await supabase
      .from("school_requests")
      .select("id")
      .eq("id", id)
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

    if (requestItemId) {
      const { data: itemData, error: itemError } = await supabase
        .from("school_request_items")
        .select("id")
        .eq("id", requestItemId)
        .eq("request_id", id)
        .maybeSingle();

      if (itemError) {
        return jsonResponse(
          {
            ok: false,
            message: `Listenposition konnte nicht geprüft werden: ${itemError.message}`,
          },
          500
        );
      }

      if (!itemData) {
        return jsonResponse(
          {
            ok: false,
            message: "Die gewählte Listenposition gehört nicht zu dieser Anfrage.",
          },
          400
        );
      }
    }

    const { data: question, error: insertError } = await supabase
      .from("school_request_item_questions")
      .insert({
        request_id: id,
        request_item_id: requestItemId,
        question_text: questionText,
        status: "pending",
        channel: "portal",
        created_by: "admin",
        created_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (insertError) {
      return jsonResponse(
        {
          ok: false,
          message: `Rückfrage konnte nicht gespeichert werden: ${insertError.message}`,
        },
        500
      );
    }

    await createRequestEvent(
      supabase,
      id,
      "request_item_question_created",
      "Eine positionsbezogene Rückfrage wurde erstellt.",
      {
        questionId: question?.id,
        requestItemId,
      }
    );

    return jsonResponse({
      ok: true,
      question,
      message: "Rückfrage wurde gespeichert.",
    });
  } catch (error) {
    console.error("Admin request question create error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Rückfrage konnte nicht gespeichert werden.",
      },
      500
    );
  }
}
