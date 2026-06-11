import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SchoolRequestRow = {
  id: string;
  request_number: string | null;
  status: string | null;
  offer_status: string | null;
  payment_status: string | null;
  invoice_status: string | null;
  fulfillment_status?: string | null;
  created_at: string | null;
  payment_received_at?: string | null;
  archived_at?: string | null;
  is_active?: boolean | null;
};

const ARCHIVE_REASON = "auto_unpaid_14_days";

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

function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function isAuthorized(request: Request) {
  const archiveCronSecret =
    process.env.ARCHIVE_CRON_SECRET || process.env.CRON_SECRET || "";

  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret") || "";
  const authHeader = request.headers.get("authorization") || "";
  const cronHeader = request.headers.get("x-cron-secret") || "";

  if (!archiveCronSecret) {
    return Boolean(querySecret);
  }

  return (
    querySecret === archiveCronSecret ||
    authHeader === `Bearer ${archiveCronSecret}` ||
    cronHeader === archiveCronSecret
  );
}
function isPaid(row: SchoolRequestRow) {
  return (
    row.payment_status === "payment_received" ||
    row.payment_status === "cash_paid" ||
    Boolean(row.payment_received_at)
  );
}

function isAlreadyInactive(row: SchoolRequestRow) {
  return (
    row.is_active === false ||
    row.status === "archived" ||
    Boolean(row.archived_at)
  );
}

function isFinalStatus(row: SchoolRequestRow) {
  return (
    row.status === "cancelled" ||
    row.status === "canceled" ||
    row.status === "completed" ||
    row.fulfillment_status === "shipped" ||
    row.fulfillment_status === "picked_up"
  );
}

export async function GET(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return jsonResponse(
        {
          ok: false,
          message: "Nicht autorisiert.",
        },
        401
      );
    }

    const supabase = getSupabaseAdmin();
    const now = new Date();
    const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const cutoffIso = cutoff.toISOString();
    const nowIso = now.toISOString();

    const { data, error } = await supabase
      .from("school_requests")
      .select("*")
      .lte("created_at", cutoffIso)
      .order("created_at", { ascending: true })
      .limit(250);

    if (error) {
      throw new Error(`Anfragen konnten nicht geprüft werden: ${error.message}`);
    }

    const candidates = ((data || []) as SchoolRequestRow[]).filter((row) => {
      if (isAlreadyInactive(row)) return false;
      if (isPaid(row)) return false;
      if (isFinalStatus(row)) return false;
      return true;
    });

    let archivedCount = 0;
    const archivedIds: string[] = [];

    for (const row of candidates) {
      const { data: updatedRequest, error: updateError } = await supabase
        .from("school_requests")
        .update({
          is_active: false,
          status: "archived",
          archived_at: nowIso,
          archive_reason: ARCHIVE_REASON,
          archived_previous_status: row.status || null,
          updated_at: nowIso,
        })
        .eq("id", row.id)
        .select("id")
        .maybeSingle();

      if (updateError) {
        console.error("Auto-Archivierung fehlgeschlagen:", {
          requestId: row.id,
          error: updateError.message,
        });
        continue;
      }

      if (!updatedRequest) {
        console.error("Auto-Archivierung hat keine Zeile aktualisiert:", {
          requestId: row.id,
        });
        continue;
      }

      await supabase.from("school_request_events").insert({
        request_id: row.id,
        event_type: "request_auto_archived_unpaid",
        title: "Anfrage automatisch archiviert",
        message:
          "Die Anfrage wurde automatisch archiviert, weil sie länger als 14 Tage nicht als bezahlt markiert wurde.",
        metadata: {
          archiveReason: ARCHIVE_REASON,
          cutoffIso,
          previousStatus: row.status || null,
          paymentStatus: row.payment_status || null,
        },
        created_at: nowIso,
      });

      archivedCount += 1;
      archivedIds.push(row.id);
    }

    return jsonResponse({
      ok: true,
      message: `${archivedCount} unbezahlte Anfrage(n) wurden automatisch archiviert.`,
      cutoffIso,
      checkedCount: data?.length || 0,
      candidateCount: candidates.length,
      archivedCount,
      archivedIds,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Auto-Archivierung konnte nicht ausgeführt werden.",
      },
      500
    );
  }
}