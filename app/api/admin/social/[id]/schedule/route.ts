
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

type SchedulePayload = {
  scheduled_at?: string | null;
};

type SocialPostRow = {
  id: string;
  status: string;
  review_status: string | null;
  topic: string;
  scheduled_at: string | null;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function parseScheduleDate(value: unknown) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  if (!trimmed) return null;

  const date = new Date(trimmed);

  if (Number.isNaN(date.getTime())) return null;

  return date;
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
          message: "Ungültige Beitrags-ID.",
        },
        { status: 400 }
      );
    }

    const payload = (await request.json()) as SchedulePayload;
    const scheduleDate = parseScheduleDate(payload.scheduled_at);

    if (!scheduleDate) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte wähle ein gültiges Veröffentlichungsdatum aus.",
        },
        { status: 400 }
      );
    }

    const earliestAllowed = Date.now() - 5 * 60 * 1000;

    if (scheduleDate.getTime() < earliestAllowed) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Der geplante Zeitpunkt liegt in der Vergangenheit. Bitte wähle einen zukünftigen Zeitpunkt.",
        },
        { status: 400 }
      );
    }

    const { data: postData, error: postError } = await supabaseServer
      .from("social_posts")
      .select("id, status, review_status, topic, scheduled_at")
      .eq("id", id)
      .single();

    if (postError || !postData) {
      return NextResponse.json(
        {
          ok: false,
          message: postError?.message || "Social-Beitrag wurde nicht gefunden.",
        },
        { status: 404 }
      );
    }

    const post = postData as SocialPostRow;

    if (post.status === "published") {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Dieser Beitrag ist bereits veröffentlicht und kann nicht erneut geplant werden.",
        },
        { status: 400 }
      );
    }

    if (post.review_status !== "approved") {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Dieser Beitrag ist noch nicht im Content-Review freigegeben. Bitte zuerst das Review öffnen und den Beitrag freigeben, bevor er geplant wird.",
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseServer
      .from("social_posts")
      .update({
        status: "scheduled",
        scheduled_at: scheduleDate.toISOString(),
      })
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
      message: "Beitrag wurde im Kalender geplant.",
      post: data,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Planen des Beitrags.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
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

    const { data: postData, error: postError } = await supabaseServer
      .from("social_posts")
      .select("id, status, review_status, topic, scheduled_at")
      .eq("id", id)
      .single();

    if (postError || !postData) {
      return NextResponse.json(
        {
          ok: false,
          message: postError?.message || "Social-Beitrag wurde nicht gefunden.",
        },
        { status: 404 }
      );
    }

    const post = postData as SocialPostRow;

    if (post.status === "published") {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Dieser Beitrag ist bereits veröffentlicht. Die Planung kann nicht mehr entfernt werden.",
        },
        { status: 400 }
      );
    }

    const nextStatus = post.review_status === "approved" ? "approved" : "draft";

    const { data, error } = await supabaseServer
      .from("social_posts")
      .update({
        status: nextStatus,
        scheduled_at: null,
      })
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
      message: "Kalenderplanung wurde entfernt.",
      post: data,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Entfernen der Kalenderplanung.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    );
  }
}