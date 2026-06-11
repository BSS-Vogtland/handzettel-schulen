import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
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

    const { data: checklistItems, error: checklistItemsError } = await supabase
      .from("school_package_checklist_items")
      .select("id, is_checked")
      .eq("request_id", requestId);

    if (checklistItemsError) {
      throw new Error(
        `Checkliste konnte nicht geladen werden: ${checklistItemsError.message}`
      );
    }

    const items = checklistItems || [];
    const totalCount = items.length;
    const checkedCount = items.filter((item) => item.is_checked).length;

    if (totalCount === 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "Die Checkliste wurde noch nicht erzeugt.",
          checkedCount,
          totalCount,
        },
        { status: 409 }
      );
    }

    if (checkedCount !== totalCount) {
      return NextResponse.json(
        {
          ok: false,
          message: `Die Prüfung kann noch nicht abgeschlossen werden. Es sind erst ${checkedCount} von ${totalCount} Positionen abgehakt.`,
          checkedCount,
          totalCount,
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("school_requests")
      .update({
        package_checklist_status: "completed",
        package_checklist_completed_at: now,
        updated_at: now,
      })
      .eq("id", requestId);

    if (updateError) {
      throw new Error(
        `Checklistenabschluss konnte nicht gespeichert werden: ${updateError.message}`
      );
    }

    await supabase.from("school_request_events").insert({
      request_id: requestId,
      event_type: "package_checklist_completed",
      title: "Paketwunsch-Checkliste abgeschlossen",
      message: `Die interne Paketwunsch-Checkliste wurde abgeschlossen. ${checkedCount} von ${totalCount} Positionen wurden geprüft.`,
      metadata: {
        checkedCount,
        totalCount,
      },
      created_at: now,
    });

    return NextResponse.json({
      ok: true,
      message: "Paketwunsch-Checkliste wurde abgeschlossen.",
      checkedCount,
      totalCount,
      completedAt: now,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Checkliste konnte nicht abgeschlossen werden.",
      },
      { status: 500 }
    );
  }
}