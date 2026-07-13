import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ProjectPayload = {
  name?: string;
  website_url?: string | null;
  industry?: string | null;
  target_audience?: string | null;
  offer_summary?: string | null;
  brand_voice?: string | null;
  image_style?: string | null;
  additional_notes?: string | null;
  content_pillars?: string[];
  content_goals?: string[];
  taboo_topics?: string[];
  cta_examples?: string[];
  platform_targets?: string[];
};

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
    .slice(0, 40);
}

async function getActiveProject() {
  const { data, error } = await supabaseServer
    .from("social_projects")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function GET() {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const project = await getActiveProject();

    return NextResponse.json({
      ok: true,
      project,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Laden des Social-Projekts.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const project = await getActiveProject();

    if (!project?.id) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Es wurde kein aktives Social-Projekt gefunden. Bitte zuerst das SQL-Setup ausführen.",
        },
        { status: 404 }
      );
    }

    const payload = (await request.json()) as ProjectPayload;

    const name = cleanString(payload.name);

    if (!name) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte gib einen Projektnamen ein.",
        },
        { status: 400 }
      );
    }

    const updateRow = {
      name,
      website_url: cleanNullableString(payload.website_url),
      industry: cleanNullableString(payload.industry),
      target_audience: cleanNullableString(payload.target_audience),
      offer_summary: cleanNullableString(payload.offer_summary),
      brand_voice: cleanNullableString(payload.brand_voice),
      image_style: cleanNullableString(payload.image_style),
      additional_notes: cleanNullableString(payload.additional_notes),
      content_pillars: cleanStringArray(payload.content_pillars),
      content_goals: cleanStringArray(payload.content_goals),
      taboo_topics: cleanStringArray(payload.taboo_topics),
      cta_examples: cleanStringArray(payload.cta_examples),
      platform_targets: cleanStringArray(payload.platform_targets),
    };

    const { data, error } = await supabaseServer
      .from("social_projects")
      .update(updateRow)
      .eq("id", project.id)
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
      message: "Social-Projekt wurde gespeichert.",
      project: data,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Speichern des Social-Projekts.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    );
  }
}