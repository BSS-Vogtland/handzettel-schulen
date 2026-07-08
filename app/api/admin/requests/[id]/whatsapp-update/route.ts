import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  buildAdminWhatsappUpdateText,
  createWhatsappLink,
  getSiteUrl,
  normalizeWhatsappPhone,
} from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
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

function cleanString(value: unknown) {
  const cleaned = String(value || "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

async function logWhatsappOpen(input: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  requestId: string;
  whatsappUrl: string;
}) {
  const now = new Date().toISOString();

  await input.supabase
    .from("school_requests")
    .update({
      whatsapp_updates_last_admin_opened_at: now,
      updated_at: now,
    })
    .eq("id", input.requestId);

  await input.supabase.from("school_request_events").insert({
    request_id: input.requestId,
    event_type: "admin_opened_whatsapp_update",
    title: "WhatsApp-Update geöffnet",
    description:
      "Der Admin hat einen vorbereiteten WhatsApp-Update-Link geöffnet. Der Versand erfolgt manuell in WhatsApp.",
    source: "admin",
    metadata: {
      whatsappUrl: input.whatsappUrl,
    },
  });
}

export async function GET(_request: NextRequest, context: Params) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          message: "Keine Anfrage-ID übergeben.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: schoolRequest, error: requestError } = await supabase
      .from("school_requests")
      .select("*")
      .eq("id", id)
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

    if (schoolRequest.whatsapp_updates_enabled === false) {
      return NextResponse.json(
        {
          ok: false,
          message: "Der Kunde hat WhatsApp-Updates abgewählt.",
        },
        { status: 409 }
      );
    }

    const customerPhone = normalizeWhatsappPhone(schoolRequest.phone);

    if (!customerPhone) {
      return NextResponse.json(
        {
          ok: false,
          message: "Für diese Anfrage ist keine WhatsApp-fähige Telefonnummer hinterlegt.",
        },
        { status: 400 }
      );
    }

    const offerUrl = schoolRequest.offer_token
      ? getSiteUrl() + "/angebot/" + schoolRequest.offer_token
      : null;

    const text = buildAdminWhatsappUpdateText({
      customerName: cleanString(schoolRequest.customer_name),
      requestNumber: cleanString(schoolRequest.request_number),
      offerUrl,
    });

    const whatsappUrl = createWhatsappLink(customerPhone, text);

    await logWhatsappOpen({
      supabase,
      requestId: schoolRequest.id,
      whatsappUrl,
    }).catch((error) => {
      console.warn("WhatsApp-Update-Öffnung konnte nicht protokolliert werden:", error);
    });

    return NextResponse.redirect(whatsappUrl);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "WhatsApp-Update konnte nicht geöffnet werden.",
      },
      { status: 500 }
    );
  }
}
