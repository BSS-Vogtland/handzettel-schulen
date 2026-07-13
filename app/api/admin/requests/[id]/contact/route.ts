import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase Admin-Umgebung ist nicht vollständig konfiguriert.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function cleanPhone(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim().replace(/\s+/g, " ");

  return cleaned.length > 0 ? cleaned : null;
}

export async function PATCH(request: Request, context: RouteContext) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { ok: false, message: "Anfrage-ID fehlt." },
        { status: 400 }
      );
    }

    const payload = await request.json().catch(() => null);
    const phone = cleanPhone(
      payload && typeof payload === "object"
        ? (payload as { phone?: unknown }).phone
        : null
    );

    if (phone && phone.length > 80) {
      return NextResponse.json(
        {
          ok: false,
          message: "Die Telefonnummer ist zu lang. Bitte kürzer speichern.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    const { data: existingRequest, error: fetchError } = await supabase
      .from("school_requests")
      .select("id, phone")
      .eq("id", id)
      .single();

    if (fetchError || !existingRequest) {
      return NextResponse.json(
        { ok: false, message: "Die Anfrage wurde nicht gefunden." },
        { status: 404 }
      );
    }

    const oldPhone =
      typeof existingRequest.phone === "string" ? existingRequest.phone : null;

    if ((oldPhone ?? "") === (phone ?? "")) {
      return NextResponse.json({
        ok: true,
        unchanged: true,
        phone,
      });
    }

    const { error: updateError } = await supabase
      .from("school_requests")
      .update({
        phone,
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Telefonnummer konnte nicht gespeichert werden: ${updateError.message}`,
        },
        { status: 500 }
      );
    }

    const { error: eventError } = await supabase
      .from("school_request_events")
      .insert({
        request_id: id,
        event_type: "admin_contact_phone_updated",
        title: "Telefonnummer korrigiert",
        message: `Telefonnummer wurde im Adminbereich geändert. Vorher: ${
          oldPhone || "nicht angegeben"
        } · Neu: ${phone || "nicht angegeben"}`,
      });

    if (eventError) {
      console.warn(
        "[admin-contact-update] Ereignis konnte nicht geschrieben werden:",
        eventError.message
      );
    }

    return NextResponse.json({
      ok: true,
      phone,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die Telefonnummer konnte nicht gespeichert werden.",
      },
      { status: 500 }
    );
  }
}