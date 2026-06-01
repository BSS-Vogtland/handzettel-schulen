import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

type CampaignPayload = {
  post_id?: string | null;
  asset_id?: string | null;
  platform?: string;
  objective?: string;
  campaign_name?: string;
  ad_headline?: string | null;
  ad_text?: string | null;
  landing_page_url?: string | null;
  target_location?: string | null;
  target_audience_description?: string | null;
  placements?: string[];
  daily_budget_eur?: string | number | null;
  lifetime_budget_eur?: string | number | null;
  start_at?: string | null;
  end_at?: string | null;
  notes?: string | null;
};

const ALLOWED_PLATFORMS = ["meta", "google", "tiktok", "manual"];
const ALLOWED_OBJECTIVES = [
  "reach",
  "traffic",
  "leads",
  "messages",
  "conversions",
  "awareness",
];

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

function cleanStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function isUuidOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  if (!trimmed) return null;

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      trimmed
    );

  return isUuid ? trimmed : null;
}

function eurToCents(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const raw =
    typeof value === "number"
      ? String(value)
      : typeof value === "string"
        ? value.replace(",", ".")
        : "";

  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return Math.round(parsed * 100);
}

function parseDateTime(value: unknown) {
  if (typeof value !== "string") return null;
  if (!value.trim()) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

async function loadActiveProjectId() {
  const { data, error } = await supabaseServer
    .from("social_projects")
    .select("id")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;

  return data.id as string;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as CampaignPayload;

    const projectId = await loadActiveProjectId();

    const platform = cleanString(payload.platform, "meta");
    const objective = cleanString(payload.objective, "traffic");

    if (!ALLOWED_PLATFORMS.includes(platform)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Ungültige Plattform.",
        },
        { status: 400 }
      );
    }

    if (!ALLOWED_OBJECTIVES.includes(objective)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Ungültiges Kampagnenziel.",
        },
        { status: 400 }
      );
    }

    const campaignName = cleanString(payload.campaign_name);

    if (!campaignName) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte gib einen Kampagnennamen ein.",
        },
        { status: 400 }
      );
    }

    const dailyBudgetCents = eurToCents(payload.daily_budget_eur);
    const lifetimeBudgetCents = eurToCents(payload.lifetime_budget_eur);

    if (!dailyBudgetCents && !lifetimeBudgetCents) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Bitte gib mindestens ein Tagesbudget oder ein Gesamtbudget ein.",
        },
        { status: 400 }
      );
    }

    const startAt = parseDateTime(payload.start_at);
    const endAt = parseDateTime(payload.end_at);

    if (startAt && endAt && new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      return NextResponse.json(
        {
          ok: false,
          message: "Das Enddatum muss nach dem Startdatum liegen.",
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseServer
      .from("social_ad_campaigns")
      .insert({
        project_id: projectId,
        post_id: isUuidOrNull(payload.post_id),
        asset_id: isUuidOrNull(payload.asset_id),

        status: "draft",
        platform,
        objective,

        campaign_name: campaignName,
        ad_headline: cleanNullableString(payload.ad_headline),
        ad_text: cleanNullableString(payload.ad_text),
        landing_page_url: cleanNullableString(payload.landing_page_url),

        target_location: cleanNullableString(payload.target_location),
        target_audience_description: cleanNullableString(
          payload.target_audience_description
        ),
        placements: cleanStringArray(payload.placements),

        daily_budget_cents: dailyBudgetCents,
        lifetime_budget_cents: lifetimeBudgetCents,
        currency: "EUR",

        start_at: startAt,
        end_at: endAt,

        notes: cleanNullableString(payload.notes),
        internal_warning:
          "Diese Kampagne ist nur ein interner Entwurf. Es wird noch kein Werbebudget ausgegeben.",
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
      message: "Ads-Kampagne wurde als Entwurf erstellt.",
      campaign: data,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Erstellen der Ads-Kampagne.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    );
  }
}