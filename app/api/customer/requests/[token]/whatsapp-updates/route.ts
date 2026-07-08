import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    token: string;
  }>;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase Umgebungsvariablen fehlen. Pruefe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function saveEvent(input: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
  enabled: boolean;
}) {
  await input.supabase.from("school_request_events").insert({
    request_id: input.requestId,
    event_type: input.enabled
      ? "customer_enabled_whatsapp_updates"
      : "customer_disabled_whatsapp_updates",
    title: input.enabled
      ? "WhatsApp-Updates aktiviert"
      : "WhatsApp-Updates abgewählt",
    description: input.enabled
      ? "Der Kunde möchte zum Paketwunsch per WhatsApp informiert werden."
      : "Der Kunde möchte keine WhatsApp-Updates zum Paketwunsch erhalten.",
    source: "customer",
    metadata: {
      whatsappUpdatesEnabled: input.enabled,
    },
  });
}

export async function POST(request: NextRequest, context: Params) {
  try {
    const { token } = await context.params;

    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          message: "Kein Angebots-Token übergeben.",
        },
        { status: 400 }
      );
    }

    const payload = await request.json().catch(() => ({}));
    const enabled = payload?.enabled !== false;
    const now = new Date().toISOString();

    const supabase = getSupabaseAdmin();

    const { data: schoolRequest, error: requestError } = await supabase
      .from("school_requests")
      .select("*")
      .eq("offer_token", token)
      .single();

    if (requestError || !schoolRequest) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Anfrage konnte nicht geladen werden: " +
            (requestError?.message || "nicht gefunden"),
        },
        { status: 404 }
      );
    }

    const { error: updateError } = await supabase
      .from("school_requests")
      .update({
        whatsapp_updates_enabled: enabled,
        whatsapp_updates_requested_at: enabled ? now : null,
        whatsapp_updates_opted_out_at: enabled ? null : now,
        updated_at: now,
      })
      .eq("id", schoolRequest.id);

    if (updateError) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "WhatsApp-Einstellung konnte nicht gespeichert werden. Ist die SQL-Migration ausgeführt? Details: " +
            updateError.message,
        },
        { status: 500 }
      );
    }

    await saveEvent({
      supabase,
      requestId: schoolRequest.id,
      enabled,
    });

    return NextResponse.json({
      ok: true,
      enabled,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "WhatsApp-Einstellung konnte nicht gespeichert werden.",
      },
      { status: 500 }
    );
  }
}
