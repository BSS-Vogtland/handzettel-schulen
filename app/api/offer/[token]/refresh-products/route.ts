import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

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

function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

async function insertRequestEvent(input: {
  requestId: string;
  eventType: string;
  title: string;
  description: string;
}) {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("school_request_events").insert({
    request_id: input.requestId,
    event_type: input.eventType,
    title: input.title,
    description: input.description,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("refresh-products event error:", error);
  }
}

export async function POST(_request: Request, context: Params) {
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

    const supabase = getSupabaseAdmin();

    const { data: requestData, error: requestError } = await supabase
      .from("school_requests")
      .select("id, offer_token, status, offer_status")
      .eq("offer_token", token)
      .maybeSingle();

    if (requestError) {
      return NextResponse.json(
        {
          ok: false,
          message: requestError.message,
        },
        { status: 500 }
      );
    }

    if (!requestData) {
      return NextResponse.json(
        {
          ok: false,
          message: "Der Paketwunsch wurde nicht gefunden.",
        },
        { status: 404 }
      );
    }

    const requestId = String(requestData.id);

    const isConfirmed =
      requestData.status === "confirmed" ||
      requestData.offer_status === "confirmed";

    if (isConfirmed) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Der Paketwunsch wurde bereits bestätigt. Neue Produkte können hier nicht mehr automatisch ergänzt werden.",
        },
        { status: 409 }
      );
    }

    const { count: itemCount, error: itemCountError } = await supabase
      .from("school_request_items")
      .select("id", { count: "exact", head: true })
      .eq("request_id", requestId);

    if (itemCountError) {
      return NextResponse.json(
        {
          ok: false,
          message: itemCountError.message,
        },
        { status: 500 }
      );
    }

    if (!itemCount || itemCount <= 0) {
      return NextResponse.json({
        ok: true,
        rematched: false,
        adoptedCount: 0,
        skippedCount: 0,
        message:
          "Für diese Liste sind noch keine erkannten Positionen vorhanden. Bitte warte auf die persönliche Prüfung.",
      });
    }

    await insertRequestEvent({
      requestId,
      eventType: "customer_product_refresh_started",
      title: "Kunde sucht neue Produkte",
      description:
        "Der Kunde hat auf der Angebotsseite die erneute Produktsuche gestartet.",
    });

    const baseUrl = getBaseUrl();

    const matchResponse = await fetch(
      `${baseUrl}/api/admin/requests/${requestId}/match`,
      {
        method: "POST",
        cache: "no-store",
      }
    );

    const matchResult = await matchResponse.json().catch(() => null);

    if (!matchResponse.ok || !matchResult?.ok) {
      await insertRequestEvent({
        requestId,
        eventType: "customer_product_refresh_failed",
        title: "Neue Produktsuche fehlgeschlagen",
        description:
          matchResult?.message ||
          matchResult?.error ||
          "Die Produktvorschläge konnten nicht neu berechnet werden.",
      });

      return NextResponse.json(
        {
          ok: false,
          message:
            matchResult?.message ||
            matchResult?.error ||
            "Die Produktvorschläge konnten nicht neu berechnet werden.",
        },
        { status: 500 }
      );
    }

    const adoptResponse = await fetch(
      `${baseUrl}/api/admin/requests/${requestId}/adopt-safe-matches`,
      {
        method: "POST",
        cache: "no-store",
      }
    );

    const adoptResult = await adoptResponse.json().catch(() => null);

    if (!adoptResponse.ok || !adoptResult?.ok) {
      await insertRequestEvent({
        requestId,
        eventType: "customer_product_refresh_failed",
        title: "Neue Produktsuche teilweise fehlgeschlagen",
        description:
          adoptResult?.message ||
          adoptResult?.error ||
          "Die Produktvorschläge wurden neu berechnet, aber sichere Treffer konnten nicht übernommen werden.",
      });

      return NextResponse.json(
        {
          ok: false,
          message:
            adoptResult?.message ||
            adoptResult?.error ||
            "Die Produktvorschläge wurden neu berechnet, aber sichere Treffer konnten nicht übernommen werden.",
        },
        { status: 500 }
      );
    }

    const adoptedCount =
      typeof adoptResult.adoptedCount === "number"
        ? adoptResult.adoptedCount
        : 0;

    const skippedCount =
      typeof adoptResult.skippedCount === "number"
        ? adoptResult.skippedCount
        : 0;

    const message =
      adoptedCount > 0
        ? adoptedCount === 1
          ? "1 neuer passender Artikel wurde ergänzt."
          : `${adoptedCount} neue passende Artikel wurden ergänzt.`
        : "Es wurden aktuell keine neuen sicheren Treffer gefunden.";

    await insertRequestEvent({
      requestId,
      eventType: "customer_product_refresh_completed",
      title: "Neue Produktsuche abgeschlossen",
      description: message,
    });

    return NextResponse.json({
      ok: true,
      rematched: true,
      adoptedCount,
      skippedCount,
      minimumScore: adoptResult.minimumScore ?? 85,
      message,
    });
  } catch (error) {
    console.error("customer refresh products error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Neue Produkte konnten nicht gesucht werden.",
      },
      { status: 500 }
    );
  }
}
