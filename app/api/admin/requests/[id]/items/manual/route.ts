import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { updateAdminRequestWorkflowState } from "@/lib/adminRequestWorkflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

type RequestBody = {
  rawText?: unknown;
  normalizedName?: unknown;
  quantity?: unknown;
  category?: unknown;
  productType?: unknown;
  format?: unknown;
  color?: unknown;
  lineature?: unknown;
  notes?: unknown;
  childId?: unknown;
};

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

function cleanText(value: unknown, maxLength = 240) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function cleanNullableText(value: unknown, maxLength = 160) {
  const text = cleanText(value, maxLength);
  return text || null;
}

function toQuantity(value: unknown) {
  const parsed = Number(String(value || "").replace(",", "."));

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }

  return parsed;
}

function jsonResponse(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status });
}

export async function POST(request: NextRequest, context: Params) {
  try {
    const { id } = await context.params;

    if (!id) {
      return jsonResponse(
        {
          ok: false,
          message: "Keine Anfrage-ID übergeben.",
        },
        400
      );
    }

    const body = (await request.json().catch(() => ({}))) as RequestBody;

    const rawText = cleanText(body.rawText, 240);
    const normalizedName = cleanNullableText(body.normalizedName, 240) || rawText;

    if (!rawText && !normalizedName) {
      return jsonResponse(
        {
          ok: false,
          message: "Bitte gib mindestens eine Bezeichnung für die neue Position ein.",
        },
        400
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: schoolRequest, error: requestError } = await supabase
      .from("school_requests")
      .select("id, status, offer_status")
      .eq("id", id)
      .maybeSingle();

    if (requestError) {
      return jsonResponse(
        {
          ok: false,
          message: requestError.message,
        },
        500
      );
    }

    if (!schoolRequest) {
      return jsonResponse(
        {
          ok: false,
          message: "Anfrage wurde nicht gefunden.",
        },
        404
      );
    }

    const now = new Date().toISOString();

    const explicitChildId = body.childId ? String(body.childId).trim() : "";
    let manualChildId: string | null = null;

    if (explicitChildId) {
      const { data: manualChildData, error: manualChildError } = await supabase
        .from("school_request_children")
        .select("id, request_id")
        .eq("id", explicitChildId)
        .eq("request_id", id)
        .maybeSingle();

      if (manualChildError) {
        return jsonResponse(
          {
            ok: false,
            message: `Kind-Zuordnung konnte nicht geprüft werden: ${manualChildError.message}`,
          },
          500
        );
      }

      if (!manualChildData) {
        return jsonResponse(
          {
            ok: false,
            message: "Das ausgewählte Kind gehört nicht zu dieser Anfrage.",
          },
          400
        );
      }

      manualChildId = explicitChildId;
    }


    const { data: insertedItem, error: insertError } = await supabase
      .from("school_request_items")
      .insert({
        request_id: id,
        child_id: manualChildId,
        raw_text: rawText || normalizedName,
        normalized_name: normalizedName,
        quantity: toQuantity(body.quantity),
        product_type: cleanNullableText(body.productType, 120),
        category: cleanNullableText(body.category, 120),
        format: cleanNullableText(body.format, 80),
        color: cleanNullableText(body.color, 80),
        lineature: cleanNullableText(body.lineature, 80),
        notes: cleanNullableText(body.notes, 500),
        confidence: 1,
        status: "manual_admin_added",
        created_at: now,
        updated_at: now,
      })
      .select("id, raw_text, normalized_name")
      .single();

    if (insertError || !insertedItem) {
      return jsonResponse(
        {
          ok: false,
          message:
            insertError?.message ||
            "Die neue Listenposition konnte nicht angelegt werden.",
        },
        500
      );
    }

    await updateAdminRequestWorkflowState(supabase, id);

    await supabase.from("school_request_events").insert({
      request_id: id,
      event_type: "admin_request_item_added",
      title: "Listenposition manuell ergänzt",
      message: `Admin hat die Listenposition „${
        insertedItem.normalized_name || insertedItem.raw_text
      }“ manuell ergänzt.`,
      metadata: {
        request_item_id: insertedItem.id,
      },
    });

    return jsonResponse({
      ok: true,
      message: "Neue Listenposition wurde angelegt.",
      itemId: insertedItem.id,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Neue Listenposition konnte nicht angelegt werden.",
      },
      500
    );
  }
}
