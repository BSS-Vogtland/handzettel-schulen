import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

type AutomationPayload = {
  automation_enabled?: boolean;
  auto_prepare_content?: boolean;
  email_notifications_enabled?: boolean;

  recipient_email?: string | null;
  recipient_name?: string | null;

  timezone?: string;
  reminder_times?: string[];

  preparation_mode?: string;
  prep_lead_business_days?: number | string;

  move_monday_to_friday?: boolean;
  move_weekend_to_friday?: boolean;

  post_only_after_review?: boolean;
  ads_only_after_review?: boolean;

  notes?: string | null;
};

type SocialProjectRow = {
  id: string;
  name: string;
};

const ALLOWED_PREPARATION_MODES = [
  "previous_calendar_day",
  "previous_business_day",
];

const SAFE_TIMEZONE_FALLBACK = "Europe/Berlin";

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

function cleanBool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function cleanInteger(value: unknown, fallback: number) {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(number)) return fallback;

  return Math.max(1, Math.min(10, Math.round(number)));
}

function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function cleanReminderTimes(value: unknown) {
  if (!Array.isArray(value)) return ["08:00", "18:00"];

  const cleaned = value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(isValidTime);

  const unique = Array.from(new Set(cleaned));

  if (unique.length === 0) return ["08:00", "18:00"];

  return unique.sort();
}

function cleanPreparationMode(value: unknown) {
  const mode = cleanString(value, "previous_business_day");

  if (ALLOWED_PREPARATION_MODES.includes(mode)) return mode;

  return "previous_business_day";
}

async function loadActiveProject() {
  const { data, error } = await supabaseServer
    .from("social_projects")
    .select("id, name")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data || null) as SocialProjectRow | null;
}

export async function PATCH(request: Request) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const project = await loadActiveProject();

    if (!project) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Kein aktives Social-Projekt gefunden. Bitte zuerst das Projektprofil einrichten.",
        },
        { status: 404 }
      );
    }

    const payload = (await request.json()) as AutomationPayload;

    const preparationMode = cleanPreparationMode(payload.preparation_mode);
    const reminderTimes = cleanReminderTimes(payload.reminder_times);

    const row = {
      project_id: project.id,

      automation_enabled: cleanBool(payload.automation_enabled, true),
      auto_prepare_content: cleanBool(payload.auto_prepare_content, true),
      email_notifications_enabled: cleanBool(
        payload.email_notifications_enabled,
        true
      ),

      recipient_email: cleanNullableString(payload.recipient_email),
      recipient_name: cleanNullableString(payload.recipient_name),

      timezone: cleanString(payload.timezone, SAFE_TIMEZONE_FALLBACK),

      reminder_times: reminderTimes,

      preparation_mode: preparationMode,
      prep_lead_business_days: cleanInteger(payload.prep_lead_business_days, 1),

      move_monday_to_friday: cleanBool(payload.move_monday_to_friday, true),
      move_weekend_to_friday: cleanBool(payload.move_weekend_to_friday, true),

      post_only_after_review: cleanBool(payload.post_only_after_review, true),
      ads_only_after_review: cleanBool(payload.ads_only_after_review, true),

      notes: cleanNullableString(payload.notes),
    };

    const { data, error } = await supabaseServer
      .from("social_automation_settings")
      .upsert(row, {
        onConflict: "project_id",
      })
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
      message: "Automation-Einstellungen wurden gespeichert.",
      settings: data,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Speichern der Automation-Einstellungen.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    );
  }
}