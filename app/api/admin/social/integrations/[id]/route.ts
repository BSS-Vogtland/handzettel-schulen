import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

type UpdatePayload = {
  status?: string;
  account_label?: string | null;
  account_identifier?: string | null;
  external_account_url?: string | null;
  setup_notes?: string | null;
  internal_notes?: string | null;
  is_required?: boolean;
  mark_checked?: boolean;
};

const ALLOWED_STATUS = [
  "not_started",
  "prepared",
  "connected",
  "needs_attention",
  "error",
];

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function cleanString(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function cleanNullableString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id || !isUuid(id)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Ungültige Integrations-ID.",
        },
        { status: 400 }
      );
    }

    const payload = (await request.json()) as UpdatePayload;

    const status = cleanString(payload.status, "not_started");

    if (!ALLOWED_STATUS.includes(status)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Ungültiger Integrationsstatus.",
        },
        { status: 400 }
      );
    }

    const updateRow = {
      status,
      account_label: cleanNullableString(payload.account_label),
      account_identifier: cleanNullableString(payload.account_identifier),
      external_account_url: cleanNullableString(payload.external_account_url),
      setup_notes: cleanNullableString(payload.setup_notes),
      internal_notes: cleanNullableString(payload.internal_notes),
      is_required: Boolean(payload.is_required),
      last_checked_at: payload.mark_checked ? new Date().toISOString() : undefined,
    };

    const { data, error } = await supabaseServer
      .from("social_integrations")
      .update(updateRow)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          message: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Integration wurde gespeichert.",
      integration: data,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Speichern der Integration.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    );
  }
}