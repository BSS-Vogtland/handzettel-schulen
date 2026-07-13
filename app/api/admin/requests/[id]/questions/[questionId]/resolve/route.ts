import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
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
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id, questionId } = await context.params;
    const supabase = getSupabaseAdmin();

    const body = await request.json().catch(() => null);
    const targetStatus = String(body?.status || "resolved").trim();

    if (!id || !questionId) {
      return jsonResponse(
        {
          ok: false,
          message: "Anfrage-ID oder Rückfrage-ID fehlt.",
        },
        400
      );
    }

    if (targetStatus !== "resolved" && targetStatus !== "cancelled") {
      return jsonResponse(
        {
          ok: false,
          message: "Ungültiger Zielstatus.",
        },
        400
      );
    }

    const now = new Date().toISOString();

    const updatePayload =
      targetStatus === "resolved"
        ? {
            status: "resolved",
            resolved_at: now,
            updated_at: now,
          }
        : {
            status: "cancelled",
            cancelled_at: now,
            updated_at: now,
          };

    const { data: question, error: updateError } = await supabase
      .from("school_request_item_questions")
      .update(updatePayload)
      .eq("id", questionId)
      .eq("request_id", id)
      .select("*")
      .maybeSingle();

    if (updateError) {
      return jsonResponse(
        {
          ok: false,
          message: `Rückfrage konnte nicht aktualisiert werden: ${updateError.message}`,
        },
        500
      );
    }

    if (!question) {
      return jsonResponse(
        {
          ok: false,
          message: "Rückfrage wurde nicht gefunden.",
        },
        404
      );
    }

    await createRequestEvent(
      supabase,
      id,
      targetStatus === "resolved"
        ? "request_item_question_resolved"
        : "request_item_question_cancelled",
      targetStatus === "resolved"
        ? "Eine Rückfrage wurde als erledigt markiert."
        : "Eine Rückfrage wurde zurückgezogen.",
      {
        questionId,
        requestItemId: question.request_item_id,
      }
    );

    return jsonResponse({
      ok: true,
      question,
      message:
        targetStatus === "resolved"
          ? "Rückfrage wurde als erledigt markiert."
          : "Rückfrage wurde zurückgezogen.",
    });
  } catch (error) {
    console.error("Admin request question resolve error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Rückfrage konnte nicht aktualisiert werden.",
      },
      500
    );
  }
}
