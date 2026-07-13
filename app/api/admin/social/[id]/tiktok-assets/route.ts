import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
﻿import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params?: Promise<{ id?: string }> | { id?: string };
};

type SocialAssetRow = {
  id: string;
  post_id?: string | null;
  asset_type?: string | null;
  provider?: string | null;
  model?: string | null;
  public_url?: string | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  status?: string | null;
  prompt?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function lower(value: unknown) {
  return cleanString(value).toLowerCase();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
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
    /\/api\/admin\/social\/([^/]+)\/tiktok-assets\/?$/
  );

  const pathId = match?.[1] ? decodeURIComponent(match[1]) : "";

  return cleanString(contextId || pathId)
    .replace(/^"+/, "")
    .replace(/"+$/, "")
    .trim();
}

function getMetadataText(asset: SocialAssetRow, key: string) {
  return cleanString(asset.metadata?.[key]);
}

function getNestedMetadataText(
  asset: SocialAssetRow,
  parentKey: string,
  childKey: string
) {
  const parent = asset.metadata?.[parentKey];

  if (!parent || typeof parent !== "object") return "";

  return cleanString((parent as Record<string, unknown>)[childKey]);
}

function isImageAsset(asset: SocialAssetRow) {
  const type = lower(asset.asset_type);
  const mime = lower(asset.mime_type);
  const url = lower(asset.public_url || asset.storage_path);

  return (
    type.includes("image") ||
    type.includes("photo") ||
    mime.startsWith("image/") ||
    url.endsWith(".png") ||
    url.endsWith(".jpg") ||
    url.endsWith(".jpeg") ||
    url.endsWith(".webp")
  );
}

function isVideoAsset(asset: SocialAssetRow) {
  const type = lower(asset.asset_type);
  const mime = lower(asset.mime_type);
  const url = lower(asset.public_url || asset.storage_path);

  return (
    type.includes("video") ||
    mime.startsWith("video/") ||
    url.endsWith(".mp4") ||
    url.endsWith(".mov") ||
    url.endsWith(".webm")
  );
}

function isTikTokGeneratedAsset(asset: SocialAssetRow) {
  const generationMode = lower(asset.metadata?.generation_mode);
  const intendedPlatform = lower(asset.metadata?.intended_platform);
  const model = lower(asset.model);

  return (
    generationMode === "tiktok_vertical_video" ||
    intendedPlatform === "tiktok" ||
    model === "tiktok-vertical-render-v1" ||
    model === "tiktok-vertical-render-v2" ||
    model === "tiktok-vertical-render-v3"
  );
}

function getAudioStatus(asset: SocialAssetRow) {
  const musicStatus = lower(asset.metadata?.music_status);
  const sourceMusicStatus = lower(asset.metadata?.source_music_status);
  const audioStatus = lower(getNestedMetadataText(asset, "audio", "status"));
  const audioNote = getNestedMetadataText(asset, "audio", "note");
  const provider = lower(asset.provider);
  const model = lower(asset.model);
  const generationMode = lower(asset.metadata?.generation_mode);

  const hasAudio =
    musicStatus === "embedded" ||
    sourceMusicStatus === "embedded" ||
    audioStatus.includes("embedded") ||
    audioStatus.includes("copied") ||
    audioStatus.includes("transcoded") ||
    provider.includes("audio") ||
    model.includes("audio") ||
    generationMode.includes("video_with_embedded_music");

  return {
    has_audio: hasAudio,
    music_status: musicStatus || sourceMusicStatus || audioStatus || "",
    note: audioNote || "",
  };
}

function scoreSourceAsset(asset: SocialAssetRow) {
  if (!asset.public_url || asset.status === "archived") return null;
  if (isTikTokGeneratedAsset(asset)) return null;

  if (isVideoAsset(asset)) {
    let score = 200;
    const reasons = ["Video"];

    const audio = getAudioStatus(asset);

    if (audio.has_audio) {
      score += 250;
      reasons.push("Audio/Musik erkannt");
    }

    if (lower(asset.provider).includes("template-composite-video")) {
      score += 40;
      reasons.push("SocialPilot-Video");
    }

    return {
      asset,
      media_type: "video" as const,
      score,
      reason: reasons.join(", "),
      audio,
    };
  }

  if (isImageAsset(asset)) {
    return {
      asset,
      media_type: "image" as const,
      score: 50,
      reason: "Bild-Fallback",
      audio: {
        has_audio: false,
        music_status: "",
        note: "Kein Audio, weil Bild-Asset.",
      },
    };
  }

  return null;
}

function getTikTokVersion(asset: SocialAssetRow) {
  const model = cleanString(asset.model);

  if (model === "tiktok-vertical-render-v3") return "V2I.3";
  if (model === "tiktok-vertical-render-v2") return "V2I.2";
  if (model === "tiktok-vertical-render-v1") return "V2I.1";

  return model || "TikTok 9:16";
}

function simplifyAsset(asset: SocialAssetRow) {
  const audio = getAudioStatus(asset);

  return {
    id: asset.id,
    asset_type: asset.asset_type || "",
    provider: asset.provider || "",
    model: asset.model || "",
    version: getTikTokVersion(asset),
    public_url: asset.public_url || "",
    storage_path: asset.storage_path || "",
    mime_type: asset.mime_type || "",
    file_size: asset.file_size || 0,
    status: asset.status || "",
    created_at: asset.created_at || "",
    metadata: asset.metadata || null,
    audio,
    source_media_asset_id: cleanString(asset.metadata?.source_media_asset_id),
    source_media_type: cleanString(asset.metadata?.source_media_type),
    source_music_status: cleanString(asset.metadata?.source_music_status),
  };
}

export async function GET(request: Request, context: RouteContext) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const postId = await getPostIdFromRequest(request, context);

    if (!postId || !isUuid(postId)) {
      return NextResponse.json(
        {
          ok: false,
          message: `Ungültige Beitrags-ID: ${postId || "keine ID empfangen"}`,
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseServer
      .from("social_assets")
      .select("*")
      .eq("post_id", postId)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(80);

    if (error) {
      throw new Error(error.message);
    }

    const assets = ((data || []) as SocialAssetRow[]).filter(Boolean);

    const sourceCandidates = assets
      .map(scoreSourceAsset)
      .filter(Boolean)
      .sort((a, b) => {
        if (!a || !b) return 0;
        return b.score - a.score;
      });

    const bestSource = sourceCandidates[0] || null;

    const tiktokVideos = assets
      .filter((asset) => isTikTokGeneratedAsset(asset) && isVideoAsset(asset))
      .map(simplifyAsset)
      .sort((a, b) => {
        const aDate = new Date(a.created_at || 0).getTime();
        const bDate = new Date(b.created_at || 0).getTime();

        return bDate - aDate;
      });

    const currentTikTokVideo = tiktokVideos[0] || null;

    const normalVideos = assets
      .filter((asset) => !isTikTokGeneratedAsset(asset) && isVideoAsset(asset))
      .map(simplifyAsset);

    const images = assets
      .filter((asset) => !isTikTokGeneratedAsset(asset) && isImageAsset(asset))
      .map(simplifyAsset);

    return NextResponse.json({
      ok: true,
      checked_at: new Date().toISOString(),
      post_id: postId,
      summary: {
        total_assets: assets.length,
        source_candidates: sourceCandidates.length,
        normal_videos: normalVideos.length,
        images: images.length,
        tiktok_videos: tiktokVideos.length,
      },
      best_source: bestSource
        ? {
            media_type: bestSource.media_type,
            score: bestSource.score,
            reason: bestSource.reason,
            audio: bestSource.audio,
            asset: simplifyAsset(bestSource.asset),
          }
        : null,
      current_tiktok_video: currentTikTokVideo,
      tiktok_videos: tiktokVideos,
      normal_videos: normalVideos,
      images,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "TikTok-Asset-Status konnte nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}
