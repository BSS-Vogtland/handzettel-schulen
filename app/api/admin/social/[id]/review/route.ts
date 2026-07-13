import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ReviewPayload = {
  reviewer_name?: string;
  reviewer_email?: string | null;
  decision?: string;

  hook_ok?: boolean;
  caption_ok?: boolean;
  image_ok?: boolean;
  cta_ok?: boolean;
  platform_fit_ok?: boolean;
  no_false_claims_ok?: boolean;
  ads_ready_ok?: boolean;

  notes?: string | null;
  required_changes?: string | null;
};

type SocialPostRow = {
  id: string;
  status: string;
  review_status: string | null;
  topic: string;
  hook: string;
  caption: string;
  cta: string | null;
  hashtags: string[] | null;
  image_prompt: string | null;
  video_prompt: string | null;
};

const ALLOWED_DECISIONS = ["approved", "needs_changes", "rejected"];

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
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

function bool(value: unknown) {
  return Boolean(value);
}

function mapDecisionToReviewStatus(decision: string) {
  if (decision === "approved") return "approved";
  if (decision === "rejected") return "rejected";
  return "needs_changes";
}

export async function POST(
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

    const payload = (await request.json()) as ReviewPayload;

    const reviewerName = cleanString(payload.reviewer_name);
    const reviewerEmail = cleanNullableString(payload.reviewer_email);
    const decision = cleanString(payload.decision, "needs_changes");

    if (!reviewerName) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte gib den Namen der prüfenden Person ein.",
        },
        { status: 400 }
      );
    }

    if (!ALLOWED_DECISIONS.includes(decision)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Ungültige Review-Entscheidung.",
        },
        { status: 400 }
      );
    }

    const { data: postData, error: postError } = await supabaseServer
      .from("social_posts")
      .select(
        "id, status, review_status, topic, hook, caption, cta, hashtags, image_prompt, video_prompt"
      )
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

    const checklist = {
      hook_ok: bool(payload.hook_ok),
      caption_ok: bool(payload.caption_ok),
      image_ok: bool(payload.image_ok),
      cta_ok: bool(payload.cta_ok),
      platform_fit_ok: bool(payload.platform_fit_ok),
      no_false_claims_ok: bool(payload.no_false_claims_ok),
      ads_ready_ok: bool(payload.ads_ready_ok),
    };

    const allCoreChecksOk =
      checklist.hook_ok &&
      checklist.caption_ok &&
      checklist.image_ok &&
      checklist.cta_ok &&
      checklist.platform_fit_ok &&
      checklist.no_false_claims_ok;

    if (decision === "approved" && !allCoreChecksOk) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Für eine Freigabe müssen Hook, Caption, Bildbezug, CTA, Plattform-Fit und Faktenprüfung bestätigt sein.",
        },
        { status: 400 }
      );
    }

    const { error: reviewError } = await supabaseServer
      .from("social_post_reviews")
      .insert({
        post_id: id,

        reviewer_name: reviewerName,
        reviewer_email: reviewerEmail,

        decision,

        hook_ok: checklist.hook_ok,
        caption_ok: checklist.caption_ok,
        image_ok: checklist.image_ok,
        cta_ok: checklist.cta_ok,
        platform_fit_ok: checklist.platform_fit_ok,
        no_false_claims_ok: checklist.no_false_claims_ok,
        ads_ready_ok: checklist.ads_ready_ok,

        notes: cleanNullableString(payload.notes),
        required_changes: cleanNullableString(payload.required_changes),

        review_snapshot: {
          post_id: post.id,
          status_before_review: post.status,
          review_status_before_review: post.review_status,
          topic: post.topic,
          hook: post.hook,
          caption: post.caption,
          cta: post.cta,
          hashtags: post.hashtags,
          image_prompt: post.image_prompt,
          video_prompt: post.video_prompt,
          checklist,
        },
      });

    if (reviewError) {
      return NextResponse.json(
        {
          ok: false,
          message: reviewError.message,
        },
        { status: 500 }
      );
    }

    const reviewStatus = mapDecisionToReviewStatus(decision);

    const updateRow: Record<string, unknown> = {
      review_status: reviewStatus,
      reviewed_at: new Date().toISOString(),
      reviewed_by_name: reviewerName,
    };

    if (decision === "approved" && post.status !== "published") {
      updateRow.status = "approved";
    }

    if (decision === "needs_changes" && post.status !== "published") {
      updateRow.status = "draft";
    }

    const { data: updatedPost, error: updateError } = await supabaseServer
      .from("social_posts")
      .update(updateRow)
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json(
        {
          ok: false,
          message: updateError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message:
        decision === "approved"
          ? "Beitrag wurde freigegeben."
          : decision === "rejected"
            ? "Beitrag wurde abgelehnt."
            : "Beitrag wurde zur Überarbeitung markiert.",
      post: updatedPost,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Speichern des Reviews.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    );
  }
}