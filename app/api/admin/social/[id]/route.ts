import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ALLOWED_STATUS = [
  "draft",
  "approved",
  "scheduled",
  "published",
  "failed",
  "archived",
];

type UpdatePayload = {
  status?: string;
  topic?: string;
  content_angle?: string | null;
  hook?: string;
  caption?: string;
  cta?: string | null;
  hashtags?: string[];
  keywords?: string[];
  tiktok_hook?: string | null;
  tiktok_caption?: string | null;
  instagram_hook?: string | null;
  instagram_caption?: string | null;
  facebook_hook?: string | null;
  facebook_caption?: string | null;
  image_prompt?: string | null;
  video_prompt?: string | null;
  scheduled_at?: string | null;
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
    .slice(0, 30);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;

    if (!id || !isUuid(id)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Ungültige Beitrags-ID.",
        },
        { status: 400 }
      );
    }

    const payload = (await request.json()) as UpdatePayload;

    const status = cleanString(payload.status, "draft");

    if (!ALLOWED_STATUS.includes(status)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Ungültiger Status.",
        },
        { status: 400 }
      );
    }

    const topic = cleanString(payload.topic);

    if (!topic) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte gib ein Thema ein.",
        },
        { status: 400 }
      );
    }

    const hook = cleanString(payload.hook);

    if (!hook) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte gib einen Hook ein.",
        },
        { status: 400 }
      );
    }

    const caption = cleanString(payload.caption);

    if (!caption) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte gib eine Caption ein.",
        },
        { status: 400 }
      );
    }

    const scheduledAt =
      typeof payload.scheduled_at === "string" &&
      payload.scheduled_at.trim().length > 0
        ? new Date(payload.scheduled_at).toISOString()
        : null;

    const updateRow = {
      status,
      topic,
      content_angle: cleanNullableString(payload.content_angle),
      hook,
      caption,
      cta: cleanNullableString(payload.cta),
      hashtags: cleanStringArray(payload.hashtags),
      keywords: cleanStringArray(payload.keywords),
      tiktok_hook: cleanNullableString(payload.tiktok_hook),
      tiktok_caption: cleanNullableString(payload.tiktok_caption),
      instagram_hook: cleanNullableString(payload.instagram_hook),
      instagram_caption: cleanNullableString(payload.instagram_caption),
      facebook_hook: cleanNullableString(payload.facebook_hook),
      facebook_caption: cleanNullableString(payload.facebook_caption),
      image_prompt: cleanNullableString(payload.image_prompt),
      video_prompt: cleanNullableString(payload.video_prompt),
      scheduled_at: scheduledAt,
    };

    const { data, error } = await supabaseServer
      .from("social_posts")
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
      message: "Social-Beitrag wurde gespeichert.",
      post: data,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Speichern des Social-Beitrags.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    );
  }
}