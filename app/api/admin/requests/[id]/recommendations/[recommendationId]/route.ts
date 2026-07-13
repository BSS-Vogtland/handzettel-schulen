import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
    recommendationId: string;
  }>;
};

type BodyPayload = {
  title?: string | null;
  reason?: string | null;
  isVisible?: boolean;
  sortOrder?: number | string | null;
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

function cleanText(value: unknown) {
  const text = String(value || "").trim();
  return text.length > 0 ? text : null;
}

function toInteger(value: unknown, fallback = 100) {
  const parsed = Number(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

export async function PATCH(request: NextRequest, context: Params) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id, recommendationId } = await context.params;
    const requestId = String(id || "").trim();
    const cleanRecommendationId = String(recommendationId || "").trim();

    if (!requestId || !cleanRecommendationId) {
      return jsonResponse(
        {
          ok: false,
          message: "Anfrage oder Empfehlung fehlt.",
        },
        400
      );
    }

    let body: BodyPayload = {};

    try {
      body = (await request.json()) as BodyPayload;
    } catch {
      return jsonResponse(
        {
          ok: false,
          message: "Die Empfehlung konnte nicht gelesen werden.",
        },
        400
      );
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if ("title" in body) {
      updatePayload.title = cleanText(body.title);
    }

    if ("reason" in body) {
      updatePayload.reason = cleanText(body.reason);
    }

    if ("isVisible" in body) {
      updatePayload.is_visible = Boolean(body.isVisible);
    }

    if ("sortOrder" in body) {
      updatePayload.sort_order = toInteger(body.sortOrder, 100);
    }

    const supabase = getSupabaseAdmin();

    const { data: recommendation, error: recommendationError } = await supabase
      .from("school_offer_recommendations")
      .select("*")
      .eq("id", cleanRecommendationId)
      .eq("request_id", requestId)
      .maybeSingle();

    if (recommendationError) {
      return jsonResponse(
        {
          ok: false,
          message: `Empfehlung konnte nicht geladen werden: ${recommendationError.message}`,
        },
        500
      );
    }

    if (!recommendation) {
      return jsonResponse(
        {
          ok: false,
          message: "Empfehlung wurde nicht gefunden.",
        },
        404
      );
    }

    if (recommendation.added_to_offer_item_id) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Diese Empfehlung wurde bereits vom Kunden übernommen und kann nicht mehr geändert werden.",
        },
        409
      );
    }

    const { data: updatedRecommendation, error: updateError } = await supabase
      .from("school_offer_recommendations")
      .update(updatePayload)
      .eq("id", cleanRecommendationId)
      .eq("request_id", requestId)
      .select("*")
      .single();

    if (updateError) {
      return jsonResponse(
        {
          ok: false,
          message: `Empfehlung konnte nicht gespeichert werden: ${updateError.message}`,
        },
        500
      );
    }

    return jsonResponse({
      ok: true,
      recommendation: updatedRecommendation,
      message: "Empfehlung wurde gespeichert.",
    });
  } catch (error) {
    console.error("Admin recommendation PATCH error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Empfehlung konnte nicht gespeichert werden.",
      },
      500
    );
  }
}