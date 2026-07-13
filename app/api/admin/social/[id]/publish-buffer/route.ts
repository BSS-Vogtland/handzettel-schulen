import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
﻿import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUFFER_API_URL = "https://api.buffer.com";

type RouteContext = {
  params?: Promise<{ id?: string }> | { id?: string };
};

type SocialPostRow = {
  id: string;
  topic: string | null;
  status: string | null;
  review_status: string | null;
  published_at: string | null;
  scheduled_at: string | null;
  hook: string | null;
  caption: string | null;
  cta: string | null;
  hashtags: unknown;
  tiktok_hook: string | null;
  tiktok_caption: string | null;
};

type SocialAssetRow = {
  id: string;
  public_url: string | null;
  storage_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  status: string | null;
  created_at: string | null;
};

type BufferGraphQlResponse<T> = {
  data?: T;
  errors?: Array<{
    message?: string;
  }>;
};

type BufferCreateDraftResponse = {
  createPost:
    | {
        __typename: "PostActionSuccess";
        post: {
          id: string;
          text?: string | null;
        };
      }
    | {
        __typename: string;
        message?: string | null;
      };
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePostId(value: unknown) {
  return cleanString(value)
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[‐-‒–—−]/g, "-")
    .replace(/^"+/, "")
    .replace(/"+$/, "")
    .trim();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    normalizePostId(value)
  );
}

function getBufferApiKey() {
  return cleanString(process.env.BUFFER_API_KEY);
}

function getBufferChannelId() {
  return cleanString(process.env.BUFFER_HANDZETTEL_CHANNEL_ID);
}

function getBufferChannelName() {
  return cleanString(process.env.BUFFER_HANDZETTEL_CHANNEL_NAME) || "Handzettel_Schulen.de";
}

function normalizeHashtags(value: unknown) {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\s]+/)
      : [];

  return rawValues
    .map((entry) => cleanString(entry))
    .filter(Boolean)
    .map((entry) => (entry.startsWith("#") ? entry : `#${entry}`));
}

function normalizeDueAt(value: string | null) {
  const cleaned = cleanString(value);

  if (!cleaned) return "";

  const date = new Date(cleaned);

  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString();
}

function formatScheduledLabel(value: string | null) {
  const dueAt = normalizeDueAt(value);

  if (!dueAt) return "";

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(new Date(dueAt));
}

function buildTikTokBufferText(post: SocialPostRow) {
  const hook = cleanString(post.tiktok_hook || post.hook);
  const caption = cleanString(post.tiktok_caption || post.caption);
  const cta = cleanString(post.cta);
  const hashtags = normalizeHashtags(post.hashtags).join(" ");

  return [hook, caption, cta, hashtags].filter(Boolean).join("\n\n");
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
    /\/api\/admin\/social\/([^/]+)\/publish-buffer\/?$/
  );

  const pathId = match?.[1] ? decodeURIComponent(match[1]) : "";

  return normalizePostId(contextId || pathId);
}

async function readRequestBody(request: Request) {
  try {
    const body = await request.json();

    return body && typeof body === "object"
      ? (body as {
          dryRun?: unknown;
          assetId?: unknown;
          force?: unknown;
        })
      : {};
  } catch {
    return {};
  }
}

async function loadVideoAsset(postId: string, assetId: string) {
  let query = supabaseServer
    .from("social_assets")
    .select("id, public_url, storage_path, file_size, mime_type, status, created_at")
    .eq("post_id", postId)
    .eq("asset_type", "video")
    .neq("status", "archived");

  if (assetId) {
    query = query.eq("id", assetId);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data || null) as SocialAssetRow | null;
}

async function findExistingBufferDraft({
  postId,
  channelId,
  assetId,
}: {
  postId: string;
  channelId: string;
  assetId: string;
}) {
  const { data, error } = await supabaseServer
    .from("social_publish_events")
    .select("id, created_at, payload")
    .eq("post_id", postId)
    .eq("platform", "buffer")
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return null;
  }

  const rows = (data || []) as Array<{
    id: string;
    created_at: string;
    payload: Record<string, unknown> | null;
  }>;

  return (
    rows.find((row) => {
      const payload = row.payload || {};

      return (
        payload.action === "buffer_tiktok_scheduled" &&
        payload.channel_id === channelId &&
        payload.asset_id === assetId
      );
    }) || null
  );
}

async function bufferGraphQl<T>(
  query: string,
  variables?: Record<string, unknown>
) {
  const apiKey = getBufferApiKey();

  if (!apiKey) {
    throw new Error("BUFFER_API_KEY fehlt.");
  }

  const response = await fetch(BUFFER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      variables: variables || {},
    }),
    cache: "no-store",
  });

  const text = await response.text();

  let payload: BufferGraphQlResponse<T> | null = null;

  try {
    payload = JSON.parse(text) as BufferGraphQlResponse<T>;
  } catch {
    throw new Error(
      `Buffer API hat keine JSON-Antwort geliefert. HTTP ${response.status}: ${text.slice(0, 300)}`
    );
  }

  const graphQlError = payload.errors
    ?.map((error) => error.message)
    .filter(Boolean)
    .join(" | ");

  if (!response.ok || graphQlError) {
    throw new Error(
      `Buffer API Fehler. HTTP ${response.status}: ${
        graphQlError || JSON.stringify(payload).slice(0, 500)
      }`
    );
  }

  if (!payload.data) {
    throw new Error("Buffer API hat keine Daten geliefert.");
  }

  return payload.data;
}

async function createBufferTikTokScheduledPost({
  channelId,
  finalText,
  videoUrl,
  dueAt,
}: {
  channelId: string;
  finalText: string;
  videoUrl: string;
  dueAt: string;
}) {
  const data = await bufferGraphQl<BufferCreateDraftResponse>(
    `
      mutation CreateBufferTikTokScheduledPost($input: CreatePostInput!) {
        createPost(input: $input) {
          __typename
          ... on PostActionSuccess {
            post {
              id
              text
            }
          }
          ... on MutationError {
            message
          }
        }
      }
    `,
    {
      input: {
        text: finalText,
        channelId,
        schedulingType: "automatic",
        mode: "customScheduled",
        dueAt,
        saveToDraft: false,
        aiAssisted: true,
        source: "handzettel-socialpilot-tiktok-buffer-scheduled",
        assets: [
          {
            video: {
              url: videoUrl,
            },
          },
        ],
      },
    }
  );

  const result = data.createPost;

  if ("post" in result) {
    return result.post;
  }

  const errorMessage =
    "message" in result &&
    typeof result.message === "string" &&
    result.message.trim()
      ? result.message
      : "Buffer-Planung konnte nicht erstellt werden.";

  throw new Error(errorMessage);
}

async function logBufferEvent({
  postId,
  channelId,
  channelName,
  asset,
  finalText,
  bufferPostId,
}: {
  postId: string;
  channelId: string;
  channelName: string;
  asset: SocialAssetRow;
  finalText: string;
  bufferPostId: string;
}) {
  const { error } = await supabaseServer.from("social_publish_events").insert({
    post_id: postId,
    platform: "buffer",
    event_type: "draft",
    status: "success",
    meta_id: bufferPostId,
    meta_post_id: bufferPostId,
    meta_creation_id: null,
    image_url: asset.public_url,
    message: "Buffer-TikTok-Post geplant.",
    error_message: null,
    payload: JSON.parse(
      JSON.stringify({
        action: "buffer_tiktok_scheduled",
        channel_id: channelId,
        channel_name: channelName,
        buffer_post_id: bufferPostId,
        asset_id: asset.id,
        video_url: asset.public_url,
        final_text: finalText,
      })
    ),
    published_at: null,
  });

  if (error) {
    return error.message;
  }

  return "";
}

export async function POST(request: Request, context: RouteContext) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const postId = await getPostIdFromRequest(request, context);

    if (!postId || !isUuid(postId)) {
      return NextResponse.json(
        {
          ok: false,
          message: `Ungültige Social-Post-ID: ${postId || "keine ID empfangen"}`,
        },
        { status: 400 }
      );
    }

    const body = await readRequestBody(request);
    const dryRun = body.dryRun !== false;
    const force = body.force === true;
    const assetId = cleanString(body.assetId);

    const channelId = getBufferChannelId();
    const channelName = getBufferChannelName();

    if (!channelId) {
      return NextResponse.json(
        {
          ok: false,
          message: "BUFFER_HANDZETTEL_CHANNEL_ID fehlt.",
        },
        { status: 500 }
      );
    }

    const { data: postData, error: postError } = await supabaseServer
      .from("social_posts")
      .select(
        "id, topic, status, review_status, published_at, scheduled_at, hook, caption, cta, hashtags, tiktok_hook, tiktok_caption"
      )
      .eq("id", postId)
      .single();

    if (postError || !postData) {
      return NextResponse.json(
        {
          ok: false,
          message: "Social-Beitrag wurde nicht gefunden.",
        },
        { status: 404 }
      );
    }

    const post = postData as SocialPostRow;
    const asset = await loadVideoAsset(postId, assetId);

    const finalText = buildTikTokBufferText(post);
    const videoUrl = cleanString(asset?.public_url);
    const reviewApproved = post.review_status === "approved";
        const alreadyPublished = post.status === "published" || Boolean(post.published_at);
    const dueAt = normalizeDueAt(post.scheduled_at);
    const scheduledLabel = formatScheduledLabel(post.scheduled_at);

    const existingDraft =
      asset?.id && channelId
        ? await findExistingBufferDraft({
            postId,
            channelId,
            assetId: asset.id,
          })
        : null;

    const previewPayload = {
      channelId,
      channelName,
      post: {
        id: post.id,
        topic: post.topic,
        review_status: post.review_status,
        status: post.status,
      },
      videoAsset: asset
        ? {
            id: asset.id,
            public_url: asset.public_url,
            file_size: asset.file_size,
            mime_type: asset.mime_type,
            status: asset.status,
            created_at: asset.created_at,
          }
        : null,
      finalText,
      alreadyBuffered: Boolean(existingDraft),
      existingDraft,
      scheduledAt: dueAt,
      scheduledLabel,
      canUpload:
        Boolean(reviewApproved) &&
        Boolean(!alreadyPublished) &&
        Boolean(dueAt) &&
        Boolean(asset?.public_url) &&
        Boolean(videoUrl.startsWith("https://")) &&
        Boolean(finalText) &&
        Boolean(!existingDraft),
      blockedReason: !reviewApproved
        ? "Content-Review ist noch nicht freigegeben."
        : alreadyPublished
          ? "Dieser Beitrag ist bereits als veröffentlicht markiert."
          : !dueAt
            ? "Für vollautomatische Buffer-Planung fehlt ein SocialPilot-Zeitpunkt."
            : !asset?.public_url
              ? "Kein öffentliches TikTok-Video für Buffer gefunden."
              : !videoUrl.startsWith("https://")
                ? "Buffer benötigt eine öffentliche HTTPS-Video-URL."
                : !finalText
                  ? "Kein finaler TikTok-Text vorhanden."
                  : existingDraft
                    ? "Für dieses TikTok-Video wurde bereits eine Buffer-Planung erstellt."
                    : "",
    };

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        message: "Buffer-Vorschau bereit.",
        ...previewPayload,
      });
    }

    if (!reviewApproved) {
      return NextResponse.json(
        {
          ok: false,
          message: "Content-Review ist noch nicht freigegeben.",
          ...previewPayload,
        },
        { status: 400 }
      );
    }

    if (alreadyPublished) {
      return NextResponse.json(
        {
          ok: false,
          message: "Dieser Beitrag ist bereits als veröffentlicht markiert.",
          ...previewPayload,
        },
        { status: 400 }
      );
    }

    if (!asset?.public_url) {
      return NextResponse.json(
        {
          ok: false,
          message: "Kein öffentliches TikTok-Video für Buffer gefunden.",
          ...previewPayload,
        },
        { status: 400 }
      );
    }

    if (!videoUrl.startsWith("https://")) {
      return NextResponse.json(
        {
          ok: false,
          message: "Buffer benötigt eine öffentliche HTTPS-Video-URL.",
          ...previewPayload,
        },
        { status: 400 }
      );
    }

    if (!finalText) {
      return NextResponse.json(
        {
          ok: false,
          message: "Kein finaler TikTok-Text vorhanden.",
          ...previewPayload,
        },
        { status: 400 }
      );
    }

    if (!dueAt) {
      return NextResponse.json(
        {
          ok: false,
          message: "Für vollautomatische Buffer-Planung fehlt ein SocialPilot-Zeitpunkt.",
          ...previewPayload,
        },
        { status: 400 }
      );
    }

    if (existingDraft && !force) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Für dieses TikTok-Video wurde bereits eine Buffer-Planung erstellt.",
          ...previewPayload,
        },
        { status: 409 }
      );
    }

    const bufferPost = await createBufferTikTokScheduledPost({
      channelId,
      finalText,
      videoUrl,
      dueAt,
    });

    const logWarning = await logBufferEvent({
      postId,
      channelId,
      channelName,
      asset,
      finalText,
      bufferPostId: bufferPost.id,
    });

    return NextResponse.json({
      ok: true,
      dryRun: false,
      message: logWarning
        ? `Buffer-Post wurde geplant. Protokoll-Warnung: ${logWarning}`
        : "Buffer-Post wurde geplant.",
      publishId: bufferPost.id,
      bufferPostId: bufferPost.id,
      ...previewPayload,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Unbekannter Fehler bei der Buffer-Übergabe.",
      },
      { status: 500 }
    );
  }
}




