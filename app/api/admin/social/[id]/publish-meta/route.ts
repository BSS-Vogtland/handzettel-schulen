import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  getConfiguredMetaPlatforms,
  publishFacebookPhoto,
  publishInstagramImage,
  type MetaPublishFailure,
  type MetaPublishPlatformResult,
} from "@/lib/social/metaPublishing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params?: Promise<{ id?: string }> | { id?: string };
};

type MetaPlatform = "facebook" | "instagram";

type SocialPostRow = {
  id: string;
  topic: string;
  status: string;
  review_status: string | null;
  hook: string | null;
  caption: string | null;
  cta: string | null;
  hashtags: string[] | null;
  facebook_hook: string | null;
  facebook_caption: string | null;
  instagram_hook: string | null;
  instagram_caption: string | null;
  scheduled_at: string | null;
  published_at: string | null;
};

type SocialAssetRow = {
  id: string;
  public_url: string | null;
  storage_path: string | null;
  status: string | null;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function normalizeHashtags(hashtags: string[] | null) {
  return (hashtags || [])
    .map((hashtag) => hashtag.trim())
    .filter(Boolean)
    .map((hashtag) => (hashtag.startsWith("#") ? hashtag : `#${hashtag}`));
}

function buildPostingText({
  hook,
  caption,
  cta,
  hashtags,
}: {
  hook: string | null;
  caption: string | null;
  cta: string | null;
  hashtags: string[] | null;
}) {
  const parts = [
    cleanString(hook),
    cleanString(caption),
    cleanString(cta),
    normalizeHashtags(hashtags).join(" "),
  ].filter(Boolean);

  return parts.join("\n\n");
}

async function getPostIdFromRequest(request: Request, context: RouteContext) {
  let contextId = "";

  try {
    const rawParams = context.params;

    let params: { id?: string } | undefined;

    if (!rawParams) {
      params = undefined;
    } else if (
      typeof (rawParams as Promise<{ id?: string }>).then === "function"
    ) {
      params = await (rawParams as Promise<{ id?: string }>);
    } else {
      params = rawParams as { id?: string };
    }

    contextId = cleanString(params?.id);
  } catch {
    contextId = "";
  }

  const url = new URL(request.url);
  const match = url.pathname.match(
    /\/api\/admin\/social\/([^/]+)\/publish-meta\/?$/
  );

  const pathId = match?.[1] ? decodeURIComponent(match[1]) : "";

  return cleanString(contextId || pathId)
    .replace(/^"+/, "")
    .replace(/"+$/, "")
    .trim();
}

async function parsePlatforms(request: Request): Promise<MetaPlatform[]> {
  const configured = getConfiguredMetaPlatforms();

  let body: unknown = null;

  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const requested =
    body && typeof body === "object" && Array.isArray((body as { platforms?: unknown }).platforms)
      ? ((body as { platforms: unknown[] }).platforms
          .filter((platform) => platform === "facebook" || platform === "instagram") as MetaPlatform[])
      : [];

  const uniqueRequested = Array.from(new Set(requested));
  const platforms = uniqueRequested.length > 0 ? uniqueRequested : configured;

  return platforms.filter((platform) => configured.includes(platform));
}

async function loadPost(id: string) {
  const { data, error } = await supabaseServer
    .from("social_posts")
    .select(
      "id, topic, status, review_status, hook, caption, cta, hashtags, facebook_hook, facebook_caption, instagram_hook, instagram_caption, scheduled_at, published_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (data || null) as SocialPostRow | null;
}

async function loadLatestImageAsset(postId: string) {
  const { data, error } = await supabaseServer
    .from("social_assets")
    .select("id, public_url, storage_path, status")
    .eq("post_id", postId)
    .eq("asset_type", "image")
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (data || null) as SocialAssetRow | null;
}

async function markPostPublished(postId: string) {
  const now = new Date().toISOString();

  const { data, error } = await supabaseServer
    .from("social_posts")
    .update({
      status: "published",
      published_at: now,
      updated_at: now,
    })
    .eq("id", postId)
    .select("id, topic, status, review_status, scheduled_at, published_at")
    .single();

  if (error) throw new Error(error.message);

  return data;
}

async function publishToPlatform({
  platform,
  post,
  imageUrl,
}: {
  platform: MetaPlatform;
  post: SocialPostRow;
  imageUrl: string;
}): Promise<MetaPublishPlatformResult> {
  try {
    if (platform === "facebook") {
      const caption = buildPostingText({
        hook: post.facebook_hook || post.hook,
        caption: post.facebook_caption || post.caption,
        cta: post.cta,
        hashtags: post.hashtags,
      });

      return await publishFacebookPhoto({ imageUrl, caption });
    }

    const caption = buildPostingText({
      hook: post.instagram_hook || post.hook,
      caption: post.instagram_caption || post.caption,
      cta: post.cta,
      hashtags: post.hashtags,
    });

    return await publishInstagramImage({ imageUrl, caption });
  } catch (error) {
    return {
      platform,
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : `${platform} Veröffentlichung ist fehlgeschlagen.`,
    } satisfies MetaPublishFailure;
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const id = await getPostIdFromRequest(request, context);

    if (!id || !isUuid(id)) {
      return NextResponse.json(
        {
          ok: false,
          message: `Ungültige Beitrags-ID: ${id || "keine ID empfangen"}`,
        },
        { status: 400 }
      );
    }

    const platforms = await parsePlatforms(request);

    if (platforms.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Keine angefragte Meta-Plattform ist vollständig konfiguriert. Prüfe Vercel ENV: META_FACEBOOK_PAGE_ID, META_FACEBOOK_PAGE_ACCESS_TOKEN, META_INSTAGRAM_BUSINESS_ACCOUNT_ID, META_INSTAGRAM_ACCESS_TOKEN oder META_ACCESS_TOKEN.",
        },
        { status: 400 }
      );
    }

    const post = await loadPost(id);

    if (!post) {
      return NextResponse.json(
        { ok: false, message: "Social-Beitrag wurde nicht gefunden." },
        { status: 404 }
      );
    }

    if (post.status === "published") {
      return NextResponse.json({
        ok: true,
        message: "Dieser Beitrag ist bereits als veröffentlicht markiert.",
        post,
      });
    }

    if (post.status === "archived" || post.status === "failed") {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Archivierte Beiträge oder Beiträge mit Fehlerstatus können nicht direkt über Meta veröffentlicht werden.",
        },
        { status: 400 }
      );
    }

    if (post.review_status !== "approved") {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Content-Review ist noch nicht freigegeben. Bitte zuerst Review öffnen und den Beitrag freigeben.",
        },
        { status: 400 }
      );
    }

    const latestAsset = await loadLatestImageAsset(post.id);
    const imageUrl = cleanString(latestAsset?.public_url);

    if (!imageUrl) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Es ist noch kein veröffentlichbares Social-Bild vorhanden. Bitte zuerst ein Bild erzeugen.",
        },
        { status: 400 }
      );
    }

    if (!/^https:\/\//i.test(imageUrl)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Das Social-Bild braucht eine öffentlich erreichbare HTTPS-URL, damit Meta es veröffentlichen kann.",
        },
        { status: 400 }
      );
    }

    const results: MetaPublishPlatformResult[] = [];

    for (const platform of platforms) {
      results.push(await publishToPlatform({ platform, post, imageUrl }));
    }

    const failedResults = results.filter((result) => !result.ok);

    if (failedResults.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          message:
            failedResults.length === results.length
              ? "Meta-Veröffentlichung ist fehlgeschlagen."
              : "Meta-Veröffentlichung war nur teilweise erfolgreich. Der Beitrag wurde deshalb nicht automatisch als veröffentlicht markiert.",
          results,
        },
        { status: 502 }
      );
    }

    const updatedPost = await markPostPublished(post.id);

    const platformLabel = platforms
      .map((platform) => (platform === "facebook" ? "Facebook" : "Instagram"))
      .join(" und ");

    return NextResponse.json({
      ok: true,
      message: `Beitrag wurde über ${platformLabel} veröffentlicht und im SocialPilot als veröffentlicht markiert.`,
      results,
      post: updatedPost,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Unbekannter Fehler bei der Meta-Veröffentlichung.",
      },
      { status: 500 }
    );
  }
}
