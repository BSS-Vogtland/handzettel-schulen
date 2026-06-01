import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

type SocialPostRow = {
  id: string;
  project_id: string | null;
  topic: string;
  hook: string;
  caption: string;
  cta: string | null;
  hashtags: string[] | null;
  instagram_hook: string | null;
  instagram_caption: string | null;
  facebook_hook: string | null;
  facebook_caption: string | null;
};

type SocialProjectRow = {
  id: string;
  name: string;
  website_url: string | null;
  target_audience: string | null;
};

type SocialAssetRow = {
  id: string;
  public_url: string | null;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(
    value
  );
}

function cleanString(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function cleanStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeHashtags(hashtags: string[] | null) {
  return cleanStringArray(hashtags).map((hashtag) =>
    hashtag.startsWith("#") ? hashtag : `#${hashtag}`
  );
}

async function loadProject(projectId: string | null) {
  if (projectId) {
    const { data } = await supabaseServer
      .from("social_projects")
      .select("id, name, website_url, target_audience")
      .eq("id", projectId)
      .maybeSingle();

    if (data) return data as SocialProjectRow;
  }

  const { data } = await supabaseServer
    .from("social_projects")
    .select("id, name, website_url, target_audience")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (data || null) as SocialProjectRow | null;
}

function buildCampaignName(post: SocialPostRow) {
  const topic = cleanString(post.topic, "Social-Beitrag");
  const base = topic.length > 70 ? `${topic.slice(0, 70)}...` : topic;

  return `${base} – Ads-Kampagne`;
}

function buildAdHeadline(post: SocialPostRow) {
  return cleanString(post.instagram_hook, cleanString(post.facebook_hook, post.hook));
}

function buildAdText(post: SocialPostRow) {
  const caption = cleanString(
    post.instagram_caption,
    cleanString(post.facebook_caption, post.caption)
  );

  const cta = cleanString(post.cta);
  const hashtags = normalizeHashtags(post.hashtags).join(" ");

  return [caption, cta, hashtags].filter(Boolean).join("\n\n");
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

    const { data: postData, error: postError } = await supabaseServer
      .from("social_posts")
      .select(
        "id, project_id, topic, hook, caption, cta, hashtags, instagram_hook, instagram_caption, facebook_hook, facebook_caption"
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
    const project = await loadProject(post.project_id);

    const { data: assetData } = await supabaseServer
      .from("social_assets")
      .select("id, public_url")
      .eq("post_id", post.id)
      .eq("asset_type", "image")
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const latestAsset = (assetData || null) as SocialAssetRow | null;

    const campaignName = buildCampaignName(post);
    const adHeadline = buildAdHeadline(post);
    const adText = buildAdText(post);

    const { data: campaignData, error: campaignError } = await supabaseServer
      .from("social_ad_campaigns")
      .insert({
        project_id: project?.id || post.project_id || null,
        post_id: post.id,
        asset_id: latestAsset?.id || null,

        status: "draft",
        platform: "meta",
        objective: "traffic",

        campaign_name: campaignName,
        ad_headline: adHeadline,
        ad_text: adText,
        landing_page_url: project?.website_url || null,

        target_location: null,
        target_audience_description: project?.target_audience || null,
        placements: ["Facebook", "Instagram", "Reels"],

        daily_budget_cents: 1000,
        lifetime_budget_cents: 7000,
        currency: "EUR",

        start_at: null,
        end_at: null,

        notes:
          "Automatisch aus einem SocialPilot-Beitrag erstellt. Bitte Zielregion, Zielgruppe, Budget, Laufzeit und Landingpage vor Freigabe prüfen.",
        internal_warning:
          "Diese Kampagne ist nur ein interner Entwurf. Es wird noch kein Werbebudget ausgegeben.",
      })
      .select("*")
      .single();

    if (campaignError) {
      return NextResponse.json(
        {
          ok: false,
          message: campaignError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Ads-Kampagnenentwurf wurde aus dem Beitrag erstellt.",
      campaign: campaignData,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Erstellen der Ads-Kampagne aus dem Beitrag.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    );
  }
}