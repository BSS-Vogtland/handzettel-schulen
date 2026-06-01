import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

type SocialPostRow = {
  id: string;
  status: string;
  review_status: string | null;
  topic: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function POST(
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

    const { data: existingPost, error: existingError } = await supabaseServer
      .from("social_posts")
      .select("id, status, review_status, topic")
      .eq("id", id)
      .single();

    if (existingError || !existingPost) {
      return NextResponse.json(
        {
          ok: false,
          message:
            existingError?.message || "Social-Beitrag wurde nicht gefunden.",
        },
        { status: 404 }
      );
    }

    const post = existingPost as SocialPostRow;

    if (post.review_status !== "approved") {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Dieser Beitrag ist noch nicht im Content-Review freigegeben. Bitte zuerst das Review öffnen und den Beitrag freigeben, bevor er als veröffentlicht markiert wird.",
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseServer
      .from("social_posts")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
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
      message: "Beitrag wurde als veröffentlicht markiert.",
      post: data,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Markieren als veröffentlicht.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    );
  }
}