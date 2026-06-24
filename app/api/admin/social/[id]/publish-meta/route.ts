import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  getConfiguredMetaPlatforms,
  publishFacebookPhoto,
  publishFacebookVideo,
  publishInstagramImage,
  publishInstagramReel,
  type MetaPublishFailure,
  type MetaPublishPlatformResult,
} from "@/lib/social/metaPublishing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params?: Promise<{ id?: string }> | { id?: string };
};

type MetaPlatform = "facebook" | "instagram";
type PublishMediaType = "image" | "video";

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
  asset_type: string | null;
  mime_type: string | null;
};

type ParsedPublishRequest = {
  platforms: MetaPlatform[];
  mediaType: PublishMediaType;
  dryRun: boolean;
};

type AlreadyPublishedMetaPublication = {
  platform: MetaPlatform;
  meta_id: string | null;
  meta_post_id: string | null;
  meta_creation_id: string | null;
  published_at: string | null;
  created_at: string | null;
  payload: Record<string, unknown> | null;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePostId(value: unknown) {
  const raw = cleanString(value)
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[‐-‒–—−]/g, "-")
    .replace(/^"+/, "")
    .replace(/"+$/, "")
    .trim();

  const match = raw.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  );

  return match ? match[0] : raw;
}

function isUuid(value: string) {
  const normalized = normalizePostId(value);

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    normalized.replace(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4})-([0-9a-f]{4}[0-9a-f]{12})$/i, "$1-$2")
  );
}

function isStrictUuid(value: string) {
  const normalized = normalizePostId(value);

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    normalized
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

function buildCaptionForPlatform({
  platform,
  post,
}: {
  platform: MetaPlatform;
  post: SocialPostRow;
}) {
  if (platform === "facebook") {
    return buildPostingText({
      hook: post.facebook_hook || post.hook,
      caption: post.facebook_caption || post.caption,
      cta: post.cta,
      hashtags: post.hashtags,
    });
  }

  return buildPostingText({
    hook: post.instagram_hook || post.hook,
    caption: post.instagram_caption || post.caption,
    cta: post.cta,
    hashtags: post.hashtags,
  });
}

function platformLabel(platform: MetaPlatform) {
  return platform === "facebook" ? "Facebook" : "Instagram";
}

function mediaTypeLabel(mediaType: PublishMediaType) {
  return mediaType === "video" ? "Video/Reel" : "Bildpost";
}

function getPayloadMediaType(payload: Record<string, unknown> | null) {
  const value = payload?.media_type;

  if (value === "video") return "video";
  if (value === "image") return "image";

  return "image";
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

    contextId = normalizePostId(params?.id);
  } catch {
    contextId = "";
  }

  const url = new URL(request.url);
  const match = url.pathname.match(
    /\/api\/admin\/social\/([^/]+)\/publish-meta\/?$/
  );

  const pathId = match?.[1] ? decodeURIComponent(match[1]) : "";

  return normalizePostId(contextId || pathId);
}

async function parsePublishRequest(
  request: Request
): Promise<ParsedPublishRequest> {
  const configured = getConfiguredMetaPlatforms();

  let body: unknown = null;

  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const requested =
    body &&
    typeof body === "object" &&
    Array.isArray((body as { platforms?: unknown }).platforms)
      ? ((body as { platforms: unknown[] }).platforms.filter(
          (platform) => platform === "facebook" || platform === "instagram"
        ) as MetaPlatform[])
      : [];

  const rawMediaType =
    body && typeof body === "object"
      ? (body as { mediaType?: unknown }).mediaType
      : null;

  const mediaType: PublishMediaType =
    rawMediaType === "video" ? "video" : "image";

  const dryRun =
    body && typeof body === "object"
      ? (body as { dryRun?: unknown }).dryRun === true
      : false;

  const uniqueRequested = Array.from(new Set(requested));
  const platforms = uniqueRequested.length > 0 ? uniqueRequested : configured;

  return {
    platforms: platforms.filter((platform) => configured.includes(platform)),
    mediaType,
    dryRun,
  };
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

async function loadLatestAsset({
  postId,
  mediaType,
}: {
  postId: string;
  mediaType: PublishMediaType;
}) {
  const { data, error } = await supabaseServer
    .from("social_assets")
    .select("id, public_url, storage_path, status, asset_type, mime_type")
    .eq("post_id", postId)
    .eq("asset_type", mediaType)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (data || null) as SocialAssetRow | null;
}

async function updatePostAfterSuccessfulMetaPublish(postId: string) {
  const now = new Date().toISOString();

  const { data, error } = await supabaseServer
    .from("social_posts")
    .update({
      published_at: now,
      updated_at: now,
    })
    .eq("id", postId)
    .select("id, topic, status, review_status, scheduled_at, published_at")
    .single();

  if (error) throw new Error(error.message);

  return data;
}

function pickResultTextValue(result: MetaPublishPlatformResult, key: string) {
  if (!result || typeof result !== "object") return null;

  const value = (result as Record<string, unknown>)[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function logMetaPublishEvent({
  postId,
  platform,
  mediaUrl,
  mediaType,
  assetId,
  finalText,
  result,
}: {
  postId: string;
  platform: MetaPlatform;
  mediaUrl: string;
  mediaType: PublishMediaType;
  assetId: string | null;
  finalText: string;
  result: MetaPublishPlatformResult;
}) {
  try {
    const now = new Date().toISOString();

    const metaId = pickResultTextValue(result, "id");
    const metaPostId = pickResultTextValue(result, "postId");
    const metaCreationId = pickResultTextValue(result, "creationId");

    const message = result.ok
      ? "Meta-Veröffentlichung erfolgreich."
      : result.message || "Meta-Veröffentlichung fehlgeschlagen.";

    const { error } = await supabaseServer
      .from("social_publish_events")
      .insert({
        post_id: postId,
        platform,
        event_type: "publish",
        status: result.ok ? "success" : "failed",
        meta_id: metaId,
        meta_post_id: metaPostId,
        meta_creation_id: metaCreationId,
        image_url: mediaUrl,
        message,
        error_message: result.ok ? null : message,
        payload: JSON.parse(
          JSON.stringify({
            media_type: mediaType,
            asset_id: assetId,
            media_url: mediaUrl,
            final_text: finalText,
            result: result || {},
          })
        ),
        published_at: result.ok ? now : null,
      });

    if (error) {
      console.error(
        "[SocialPilot Meta Publish Log] Insert failed:",
        error.message
      );
    }
  } catch (error) {
    console.error(
      "[SocialPilot Meta Publish Log] Unexpected logging error:",
      error instanceof Error ? error.message : error
    );
  }
}

async function getAlreadyPublishedMetaPublications({
  postId,
  platforms,
  mediaType,
}: {
  postId: string;
  platforms: MetaPlatform[];
  mediaType: PublishMediaType;
}) {
  if (!postId || platforms.length === 0) return [];

  const { data, error } = await supabaseServer
    .from("social_publish_events")
    .select(
      "platform, meta_id, meta_post_id, meta_creation_id, published_at, created_at, payload"
    )
    .eq("post_id", postId)
    .eq("event_type", "publish")
    .eq("status", "success")
    .in("platform", platforms)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(
      "[SocialPilot Meta Publish Guard] Could not check existing publications:",
      error.message
    );

    throw new Error(
      "Doppelveröffentlichungsschutz konnte nicht geprüft werden."
    );
  }

  const seen = new Set<string>();
  const rows = (data || []) as AlreadyPublishedMetaPublication[];
  const uniqueRows: AlreadyPublishedMetaPublication[] = [];

  for (const row of rows) {
    if (!row.platform) continue;

    const rowMediaType = getPayloadMediaType(row.payload);
    const key = `${row.platform}:${rowMediaType}`;

    if (rowMediaType !== mediaType) continue;
    if (seen.has(key)) continue;

    seen.add(key);
    uniqueRows.push(row);
  }

  return uniqueRows;
}

async function publishToPlatform({
  platform,
  post,
  mediaUrl,
  mediaType,
}: {
  platform: MetaPlatform;
  post: SocialPostRow;
  mediaUrl: string;
  mediaType: PublishMediaType;
}): Promise<MetaPublishPlatformResult> {
  try {
    const caption = buildCaptionForPlatform({ platform, post });

    if (platform === "facebook") {
      if (mediaType === "video") {
        return await publishFacebookVideo({ videoUrl: mediaUrl, caption });
      }

      return await publishFacebookPhoto({ imageUrl: mediaUrl, caption });
    }

    if (mediaType === "video") {
      return await publishInstagramReel({ videoUrl: mediaUrl, caption });
    }

    return await publishInstagramImage({ imageUrl: mediaUrl, caption });
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
    const id = normalizePostId(await getPostIdFromRequest(request, context));

    if (!id || !isStrictUuid(id)) {
      return NextResponse.json(
        {
          ok: false,
          message: `Ungültige Beitrags-ID: ${id || "keine ID empfangen"}`,
        },
        { status: 400 }
      );
    }

    const { platforms, mediaType, dryRun } = await parsePublishRequest(request);

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

    const latestAsset = await loadLatestAsset({
      postId: post.id,
      mediaType,
    });

    const mediaUrl = cleanString(latestAsset?.public_url);

    if (!mediaUrl) {
      return NextResponse.json(
        {
          ok: false,
          message:
            mediaType === "video"
              ? "Es ist noch kein veröffentlichbares Social-Video vorhanden. Bitte zuerst ein Video erzeugen."
              : "Es ist noch kein veröffentlichbares Social-Bild vorhanden. Bitte zuerst ein Bild erzeugen.",
        },
        { status: 400 }
      );
    }

    if (!/^https:\/\//i.test(mediaUrl)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            mediaType === "video"
              ? "Das Social-Video braucht eine öffentlich erreichbare HTTPS-URL, damit Meta es veröffentlichen kann."
              : "Das Social-Bild braucht eine öffentlich erreichbare HTTPS-URL, damit Meta es veröffentlichen kann.",
        },
        { status: 400 }
      );
    }

    const alreadyPublishedPublications =
      await getAlreadyPublishedMetaPublications({
        postId: post.id,
        platforms,
        mediaType,
      });

    if (alreadyPublishedPublications.length > 0) {
      const blockedLabels = alreadyPublishedPublications.map((event) => {
        const label = platformLabel(event.platform);
        return `${label} ${mediaTypeLabel(mediaType)}`;
      });

      return NextResponse.json(
        {
          ok: false,
          blocked: true,
          reason: "already_published",
          mediaType,
          message: `Doppelveröffentlichung blockiert: Diese Kombination wurde bereits veröffentlicht: ${blockedLabels.join(
            ", "
          )}.`,
          alreadyPublished: alreadyPublishedPublications,
        },
        { status: 409 }
      );
    }

    const captions = platforms.map((platform) => ({
      platform,
      platformLabel: platformLabel(platform),
      caption: buildCaptionForPlatform({ platform, post }),
    }));

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        message: `${mediaTypeLabel(
          mediaType
        )}-Vorschau wurde erstellt. Es wurde noch nichts veröffentlicht.`,
        mediaType,
        mediaTypeLabel: mediaTypeLabel(mediaType),
        platforms,
        platformLabels: platforms.map(platformLabel),
        asset: {
          id: latestAsset?.id || null,
          public_url: mediaUrl,
          storage_path: latestAsset?.storage_path || null,
          status: latestAsset?.status || null,
          asset_type: latestAsset?.asset_type || mediaType,
          mime_type: latestAsset?.mime_type || null,
        },
        captions,
        post: {
          id: post.id,
          topic: post.topic,
          status: post.status,
          review_status: post.review_status,
          scheduled_at: post.scheduled_at,
          published_at: post.published_at,
        },
      });
    }

    const results: MetaPublishPlatformResult[] = [];

    for (const platform of platforms) {
      const result = await publishToPlatform({
        platform,
        post,
        mediaUrl,
        mediaType,
      });

      results.push(result);

      await logMetaPublishEvent({
        postId: post.id,
        platform,
        mediaUrl,
        mediaType,
        assetId: latestAsset?.id || null,
        finalText: buildCaptionForPlatform({ platform, post }),
        result,
      });
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

    const updatedPost = await updatePostAfterSuccessfulMetaPublish(post.id);

    const platformLabelText = platforms.map(platformLabel).join(" und ");

    return NextResponse.json({
      ok: true,
      message: `Beitrag wurde als ${mediaTypeLabel(
        mediaType
      )} über ${platformLabelText} veröffentlicht und im SocialPilot-Protokoll gespeichert.`,
      mediaType,
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
