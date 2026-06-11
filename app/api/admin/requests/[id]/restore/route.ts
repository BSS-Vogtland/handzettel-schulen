import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type SchoolRequestRow = {
  id: string;
  status: string | null;
  archived_previous_status?: string | null;
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

function cleanText(value: unknown) {
  return String(value || "").trim();
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const requestId = cleanText(id);

    if (!requestId) {
      return NextResponse.json(
        { ok: false, message: "Keine Anfrage-ID übergeben." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: requestData, error: requestError } = await supabase
      .from("school_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();

    if (requestError) {
      throw new Error(`Anfrage konnte nicht geladen werden: ${requestError.message}`);
    }

    if (!requestData) {
      return NextResponse.json(
        { ok: false, message: "Anfrage wurde nicht gefunden." },
        { status: 404 }
      );
    }

    const requestRow = requestData as SchoolRequestRow;
    const now = new Date().toISOString();

    const restoredStatus =
      requestRow.archived_previous_status &&
      requestRow.archived_previous_status !== "archived"
        ? requestRow.archived_previous_status
        : "offer_sent";

    const { error: updateError } = await supabase
      .from("school_requests")
      .update({
        is_active: true,
        status: restoredStatus,
        archived_at: null,
        archive_reason: null,
        archived_previous_status: null,
        restored_at: now,
        updated_at: now,
      })
      .eq("id", requestId);

    if (updateError) {
      throw new Error(
        `Anfrage konnte nicht wiederhergestellt werden: ${updateError.message}`
      );
    }

    await supabase.from("school_request_events").insert({
      request_id: requestId,
      event_type: "request_restored_from_archive",
      title: "Anfrage wiederhergestellt",
      message:
        "Die archivierte Anfrage wurde manuell wieder aktiv gesetzt.",
      metadata: {
        restoredStatus,
      },
      created_at: now,
    });

    return NextResponse.json({
      ok: true,
      message: "Anfrage wurde wiederhergestellt.",
      restoredStatus,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Anfrage konnte nicht wiederhergestellt werden.",
      },
      { status: 500 }
    );
  }
}