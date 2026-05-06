import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

type RequestRow = {
  id: string;
  request_number: string | null;
  status: string | null;
  offer_status: string | null;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;

    if (!token) {
      return NextResponse.json(
        { ok: false, message: "Kein Angebotstoken übergeben." },
        { status: 400 }
      );
    }

    const { data: requestData, error: requestError } = await supabaseServer
      .from("school_requests")
      .select("id, request_number, status, offer_status")
      .eq("offer_token", token)
      .single();

    if (requestError || !requestData) {
      return NextResponse.json(
        {
          ok: false,
          message:
            requestError?.message || "Das Angebot wurde nicht gefunden.",
        },
        { status: 404 }
      );
    }

    const requestRow = requestData as RequestRow;

    if (requestRow.status === "confirmed") {
      return NextResponse.json({
        ok: true,
        message: "Dieses Angebot wurde bereits bestätigt.",
      });
    }

    const { count, error: countError } = await supabaseServer
      .from("school_offer_items")
      .select("id", { count: "exact", head: true })
      .eq("request_id", requestRow.id);

    if (countError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Die Angebotspositionen konnten nicht geprüft werden: ${countError.message}`,
        },
        { status: 500 }
      );
    }

    if (!count || count <= 0) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Dieses Angebot enthält noch keine Produkte und kann daher nicht bestätigt werden.",
        },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabaseServer
      .from("school_requests")
      .update({
        status: "confirmed",
        offer_status: "confirmed",
      })
      .eq("id", requestRow.id);

    if (updateError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Das Angebot konnte nicht bestätigt werden: ${updateError.message}`,
        },
        { status: 500 }
      );
    }

    const { error: eventError } = await supabaseServer
      .from("school_request_events")
      .insert({
        request_id: requestRow.id,
        event_type: "offer_confirmed",
        title: "Angebot bestätigt",
        description: "Der Kunde hat das Schulpaket-Angebot bestätigt.",
      });

    if (eventError) {
      console.error("Event konnte nicht gespeichert werden:", eventError);
    }

    return NextResponse.json({
      ok: true,
      message: "Das Angebot wurde bestätigt.",
    });
  } catch (error) {
    console.error("Fehler beim Bestätigen des Angebots:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Beim Bestätigen ist ein unerwarteter Fehler aufgetreten.",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      message:
        "Diese Route kann nur per POST genutzt werden. Bitte den Button auf der Angebotsseite verwenden.",
    },
    { status: 405 }
  );
}