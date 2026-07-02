import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export async function POST(_request: Request, { params }: Params) {
  try {
    const { token } = await params;
    const cleanToken = String(token || "").trim();

    if (!cleanToken) {
      return NextResponse.json(
        {
          ok: false,
          message: "Kein Paketwunsch-Token übergeben.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: requestRow, error: requestError } = await supabase
      .from("school_requests")
      .select("id, status, offer_status")
      .eq("offer_token", cleanToken)
      .maybeSingle();

    if (requestError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Anfrage konnte nicht geladen werden: ${requestError.message}`,
        },
        { status: 500 }
      );
    }

    if (!requestRow) {
      return NextResponse.json(
        {
          ok: false,
          message: "Paketwunsch wurde nicht gefunden.",
        },
        { status: 404 }
      );
    }

    if (
      requestRow.status === "confirmed" ||
      requestRow.offer_status === "confirmed"
    ) {
      return NextResponse.json(
        {
          ok: false,
          message: "Der Paketwunsch wurde bereits bestätigt.",
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();

    const updatePayload: Record<string, string> = {
      updated_at: now,
    };

    if (requestRow.status === "manual_review") {
      updatePayload.status = "in_progress";
    }

    if (requestRow.offer_status === "manual_review") {
      updatePayload.offer_status = "matching_done";
    }

    const { error: updateError } = await supabase
      .from("school_requests")
      .update(updatePayload)
      .eq("id", requestRow.id);

    if (updateError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Selbst-Auswahl konnte nicht gespeichert werden: ${updateError.message}`,
        },
        { status: 500 }
      );
    }

    const { error: eventError } = await supabase
      .from("school_request_events")
      .insert({
        request_id: requestRow.id,
        event_type: "customer_selected_self_selection",
        title: "Kunde wählt Selbst-Auswahl",
        description:
          "Der Kunde möchte die offenen Positionen wieder selbst auswählen und bearbeiten.",
        created_at: now,
      });

    if (eventError) {
      console.error("Self-selection event could not be written:", eventError);
    }

    return NextResponse.json({
      ok: true,
      message: "Selbst-Auswahl wurde gespeichert.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler bei der Selbst-Auswahl.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    );
  }
}
