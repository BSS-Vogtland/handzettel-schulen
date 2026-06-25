import { supabaseServer } from "@/lib/supabase/server";
import {
  cleanTikTokString,
  loadStoredTikTokConnection,
} from "@/lib/social/tiktokOAuth";

const TIKTOK_INBOX_VIDEO_INIT_URL =
  "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/";
const TIKTOK_UPLOAD_STATUS_URL =
  "https://open.tiktokapis.com/v2/post/publish/status/fetch/";

type SocialPostRow = {
  id: string;
  topic?: string | null;
  hook?: string | null;
  caption?: string | null;
  cta?: string | null;
  hashtags?: string[] | null;
  tiktok_hook?: string | null;
  tiktok_caption?: string | null;
  status?: string | null;
  review_status?: string | null;
};

type SocialAssetRow = {
  id: string;
  post_id?: string | null;
  asset_type?: string | null;
  public_url?: string | null;
  storage_path?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
};

type TikTokInitResponse = {
  data?: {
    publish_id?: string;
    upload_url?: string;
  };
  error?: {
    code?: string;
    message?: string;
    log_id?: string;
  };
};

type TikTokStatusResponse = {
  data?: unknown;
  error?: {
    code?: string;
    message?: string;
    log_id?: string;
  };
};

function normalizeHashtags(hashtags: string[] | null | undefined) {
  return (hashtags || [])
    .map((hashtag) => String(hashtag || "").trim())
    .filter(Boolean)
    .map((hashtag) => (hashtag.startsWith("#") ? hashtag : `#${hashtag}`));
}

function extractString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getMusicAttribution(asset: SocialAssetRow | null) {
  const metadata = asset?.metadata || {};

  const direct =
    extractString(metadata.music_attribution) ||
    extractString(metadata.music_credit) ||
    extractString(metadata.music_license_source) ||
    extractString(metadata.license_source) ||
    extractString(metadata.audio_license_source);

  const nestedAudio =
    metadata.audio && typeof metadata.audio === "object"
      ? (metadata.audio as Record<string, unknown>)
      : null;

  const nested =
    extractString(nestedAudio?.music_attribution) ||
    extractString(nestedAudio?.music_credit) ||
    extractString(nestedAudio?.license_source);

  return direct || nested;
}

export function buildTikTokCaption({
  post,
  videoAsset,
}: {
  post: SocialPostRow;
  videoAsset: SocialAssetRow | null;
}) {
  const hook = cleanTikTokString(post.tiktok_hook || post.hook);
  const caption = cleanTikTokString(post.tiktok_caption || post.caption);
  const cta = cleanTikTokString(post.cta);
  const hashtags = normalizeHashtags(post.hashtags);
  const musicAttribution = getMusicAttribution(videoAsset);

  const parts = [hook, caption, cta, hashtags.join(" ")].filter(Boolean);

  if (musicAttribution) {
    parts.push(`Musiknachweis: ${musicAttribution}`);
  }

  return parts.join("\n\n");
}

export function hasTikTokScope(scope: string | null | undefined, wanted: string) {
  return String(scope || "")
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .includes(wanted);
}

export async function loadTikTokPost(postId: string) {
  const { data, error } = await supabaseServer
    .from("social_posts")
    .select("*")
    .eq("id", postId)
    .single();

  if (error || !data) {
    throw new Error("Social-Beitrag wurde nicht gefunden.");
  }

  return data as SocialPostRow;
}

export async function loadTikTokVideoAsset({
  postId,
  assetId,
}: {
  postId: string;
  assetId?: string | null;
}) {
  let query = supabaseServer
    .from("social_assets")
    .select("*")
    .eq("post_id", postId)
    .eq("asset_type", "video")
    .neq("status", "archived")
    .order("created_at", { ascending: false });

  if (assetId) {
    query = query.eq("id", assetId);
  }

  const { data, error } = await query.limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return ((data || [])[0] || null) as SocialAssetRow | null;
}

export async function getTikTokDraftUploadReadiness() {
  const connection = await loadStoredTikTokConnection();
  const accessToken = cleanTikTokString(connection?.access_token);
  const scope = cleanTikTokString(connection?.scope);
  const uploadEnabled =
    cleanTikTokString(process.env.TIKTOK_ENABLE_DRAFT_UPLOAD).toLowerCase() ===
    "true";
  const hasVideoUploadScope = hasTikTokScope(scope, "video.upload");

  let blockedReason = "";

  if (!connection || !accessToken) {
    blockedReason =
      "TikTok ist noch nicht per OAuth verbunden. Bitte zuerst TikTok verbinden.";
  } else if (!hasVideoUploadScope) {
    blockedReason =
      "TikTok ist verbunden, aber der Scope video.upload ist noch nicht autorisiert. Der echte Draft-Upload bleibt deshalb gesperrt.";
  } else if (!uploadEnabled) {
    blockedReason =
      "TIKTOK_ENABLE_DRAFT_UPLOAD ist noch nicht aktiviert. Der echte Upload bleibt bis zur Freigabe bewusst gesperrt.";
  }

  return {
    connection,
    accessToken,
    scope,
    uploadEnabled,
    hasVideoUploadScope,
    canUpload: Boolean(connection && accessToken && hasVideoUploadScope && uploadEnabled),
    blockedReason,
  };
}

async function insertTikTokPublishEvent({
  postId,
  status,
  publishId,
  videoAsset,
  finalText,
  errorMessage,
  rawResult,
}: {
  postId: string;
  status: "success" | "failed";
  publishId?: string | null;
  videoAsset?: SocialAssetRow | null;
  finalText?: string | null;
  errorMessage?: string | null;
  rawResult?: unknown;
}) {
  const basePayload = {
    post_id: postId,
    platform: "tiktok",
    event_type: "upload_draft",
    status,
    meta_id: publishId || null,
    meta_post_id: publishId || null,
    meta_creation_id: null,
    error_message: errorMessage || null,
    published_at: null,
  };

  const fullPayload = {
    ...basePayload,
    asset_id: videoAsset?.id || null,
    media_type: "video",
    media_url: videoAsset?.public_url || null,
    final_text: finalText || null,
    raw_response: rawResult || null,
  };

  const { error: fullError } = await supabaseServer
    .from("social_publish_events")
    .insert(fullPayload);

  if (!fullError) return;

  const { error: fallbackError } = await supabaseServer
    .from("social_publish_events")
    .insert(basePayload);

  if (fallbackError) {
    console.error(
      "[SocialPilot TikTok Upload Log] Insert failed:",
      fallbackError.message
    );
  }
}

async function fetchVideoBytes(videoUrl: string) {
  const response = await fetch(videoUrl, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Video konnte nicht geladen werden: HTTP ${response.status}`
    );
  }

  const contentType = response.headers.get("content-type") || "video/mp4";
  const arrayBuffer = await response.arrayBuffer();
  const size = arrayBuffer.byteLength;

  if (!size || size <= 0) {
    throw new Error("Das Video ist leer oder konnte nicht vollständig geladen werden.");
  }

  return {
    arrayBuffer,
    size,
    contentType: contentType.includes("video/") ? contentType : "video/mp4",
  };
}

async function initTikTokInboxVideoUpload({
  accessToken,
  videoSize,
}: {
  accessToken: string;
  videoSize: number;
}) {
  const response = await fetch(TIKTOK_INBOX_VIDEO_INIT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      source_info: {
        source: "FILE_UPLOAD",
        video_size: videoSize,
        chunk_size: videoSize,
        total_chunk_count: 1,
      },
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | TikTokInitResponse
    | null;

  if (!response.ok || !payload) {
    throw new Error(
      `TikTok Upload-Initialisierung fehlgeschlagen: HTTP ${response.status}`
    );
  }

  if (payload.error?.code && payload.error.code !== "ok") {
    throw new Error(
      `TikTok Upload-Initialisierung fehlgeschlagen: ${
        payload.error.message || payload.error.code
      }`
    );
  }

  const publishId = cleanTikTokString(payload.data?.publish_id);
  const uploadUrl = cleanTikTokString(payload.data?.upload_url);

  if (!publishId || !uploadUrl) {
    throw new Error(
      "TikTok hat keine vollständige Upload-Antwort mit publish_id und upload_url geliefert."
    );
  }

  return {
    publishId,
    uploadUrl,
    raw: payload,
  };
}

async function uploadVideoToTikTokUploadUrl({
  uploadUrl,
  arrayBuffer,
  size,
  contentType,
}: {
  uploadUrl: string;
  arrayBuffer: ArrayBuffer;
  size: number;
  contentType: string;
}) {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType || "video/mp4",
      "Content-Range": `bytes 0-${size - 1}/${size}`,
    },
    body: arrayBuffer,
    cache: "no-store",
  });

  const text = await response.text().catch(() => "");

  if (!response.ok) {
    throw new Error(
      `TikTok Video-Upload fehlgeschlagen: HTTP ${response.status} ${text}`
    );
  }

  return {
    ok: true,
    status: response.status,
    responseText: text,
  };
}

export async function fetchTikTokUploadStatus({
  accessToken,
  publishId,
}: {
  accessToken: string;
  publishId: string;
}) {
  const response = await fetch(TIKTOK_UPLOAD_STATUS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      publish_id: publishId,
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | TikTokStatusResponse
    | null;

  return {
    ok: response.ok && (!payload?.error?.code || payload.error.code === "ok"),
    status: response.status,
    payload,
  };
}

export async function createTikTokDraftUpload({
  postId,
  assetId,
}: {
  postId: string;
  assetId?: string | null;
}) {
  const readiness = await getTikTokDraftUploadReadiness();

  if (!readiness.canUpload || !readiness.accessToken) {
    throw new Error(readiness.blockedReason || "TikTok Upload ist noch gesperrt.");
  }

  const post = await loadTikTokPost(postId);
  const videoAsset = await loadTikTokVideoAsset({ postId, assetId });

  if (post.review_status !== "approved") {
    throw new Error(
      "Content-Review ist noch nicht freigegeben. Bitte zuerst Review öffnen und den Beitrag freigeben."
    );
  }

  if (!videoAsset?.public_url) {
    throw new Error("Es ist noch kein veröffentlichbares TikTok-Video vorhanden.");
  }

  const finalText = buildTikTokCaption({ post, videoAsset });

  try {
    const video = await fetchVideoBytes(videoAsset.public_url);
    const initResult = await initTikTokInboxVideoUpload({
      accessToken: readiness.accessToken,
      videoSize: video.size,
    });

    const uploadResult = await uploadVideoToTikTokUploadUrl({
      uploadUrl: initResult.uploadUrl,
      arrayBuffer: video.arrayBuffer,
      size: video.size,
      contentType: video.contentType,
    });

    const statusResult = await fetchTikTokUploadStatus({
      accessToken: readiness.accessToken,
      publishId: initResult.publishId,
    }).catch((error) => ({
      ok: false,
      status: 0,
      payload: {
        error:
          error instanceof Error
            ? error.message
            : "Status konnte nicht abgerufen werden.",
      },
    }));

    await insertTikTokPublishEvent({
      postId,
      status: "success",
      publishId: initResult.publishId,
      videoAsset,
      finalText,
      rawResult: {
        init: initResult.raw,
        upload: uploadResult,
        status: statusResult,
      },
    });

    return {
      ok: true,
      publishId: initResult.publishId,
      message:
        "TikTok-Draft-Upload wurde an TikTok übergeben. Öffne TikTok, um den Entwurf zu prüfen und fertigzustellen.",
      uploadResult,
      statusResult,
    };
  } catch (error) {
    await insertTikTokPublishEvent({
      postId,
      status: "failed",
      publishId: null,
      videoAsset,
      finalText,
      errorMessage:
        error instanceof Error
          ? error.message
          : "TikTok-Draft-Upload ist fehlgeschlagen.",
    });

    throw error;
  }
}
