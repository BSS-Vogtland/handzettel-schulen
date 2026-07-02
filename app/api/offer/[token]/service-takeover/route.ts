import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Params = {
  params: Promise<{
    token: string;
  }>;
};

type Body = {
  openChoiceCount?: number | null;
  manualReviewCount?: number | null;
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

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function readBodySafely(request: Request): Promise<Body> {
  const rawText = await request.text();

  if (!rawText) return {};

  try {
    return JSON.parse(rawText) as Body;
  } catch {
    return {};
  }
}

export async function POST(request: Request, { params }: Params) {
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

    const body = await readBodySafely(request);
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
    const openChoiceCount = toNumber(body.openChoiceCount, 0);
    const manualReviewCount = toNumber(body.manualReviewCount, 0);

    const { error: updateError } = await supabase
      .from("school_requests")
      .update({
        status: "manual_review",
        offer_status: "manual_review",
        updated_at: now,
      })
      .eq("id", requestRow.id);

    if (updateError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Team-Übernahme konnte nicht gespeichert werden: ${updateError.message}`,
        },
        { status: 500 }
      );
    }

    const { error: eventError } = await supabase
      .from("school_request_events")
      .insert({
        request_id: requestRow.id,
        event_type: "customer_requested_team_takeover",
        title: "Kunde wünscht Team-Übernahme",
        description: `Der Kunde möchte, dass Handzettel-Schulen.de die offenen Positionen übernimmt. Offene Auswahl: ${openChoiceCount}. Persönliche Prüfung: ${manualReviewCount}.`,
        created_at: now,
      });

    if (eventError) {
      console.error("Team takeover event could not be written:", eventError);
    }

    return NextResponse.json({
      ok: true,
      message: "Handzettel-Schulen.de übernimmt die offenen Positionen.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler bei der Team-Übernahme.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    );
  }
}
