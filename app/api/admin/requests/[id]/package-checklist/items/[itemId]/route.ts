import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
    itemId: string;
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

export async function PATCH(request: NextRequest, context: RouteContext) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id, itemId } = await context.params;
    const requestId = cleanText(id);
    const checklistItemId = cleanText(itemId);

    if (!requestId || !checklistItemId) {
      return NextResponse.json(
        { ok: false, message: "Anfrage-ID oder Checklistenposition fehlt." },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));

    const isChecked =
      typeof body.isChecked === "boolean" ? body.isChecked : null;

    const note =
      typeof body.note === "string" ? body.note.trim().slice(0, 2000) : null;

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (isChecked !== null) {
      updatePayload.is_checked = isChecked;
      updatePayload.checked_at = isChecked ? new Date().toISOString() : null;
    }

    if (note !== null) {
      updatePayload.note = note || null;
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("school_package_checklist_items")
      .update(updatePayload)
      .eq("id", checklistItemId)
      .eq("request_id", requestId)
      .select("*")
      .maybeSingle();

    if (error) {
      throw new Error(`Checklistenposition konnte nicht gespeichert werden: ${error.message}`);
    }

    if (!data) {
      return NextResponse.json(
        { ok: false, message: "Checklistenposition wurde nicht gefunden." },
        { status: 404 }
      );
    }

    const { data: allItems, error: allItemsError } = await supabase
      .from("school_package_checklist_items")
      .select("id, is_checked")
      .eq("request_id", requestId);

    if (allItemsError) {
      throw new Error(
        `Checklistenstatus konnte nicht geprüft werden: ${allItemsError.message}`
      );
    }

    const items = allItems || [];
    const checkedCount = items.filter((item) => item.is_checked).length;
    const totalCount = items.length;

    const nextStatus =
      totalCount > 0 && checkedCount > 0 && checkedCount < totalCount
        ? "in_progress"
        : totalCount > 0 && checkedCount === totalCount
          ? "in_progress"
          : "created";

    await supabase
      .from("school_requests")
      .update({
        package_checklist_status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .neq("package_checklist_status", "completed");

    return NextResponse.json({
      ok: true,
      message: "Checklistenposition wurde gespeichert.",
      item: data,
      checkedCount,
      totalCount,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Checklistenposition konnte nicht gespeichert werden.",
      },
      { status: 500 }
    );
  }
}