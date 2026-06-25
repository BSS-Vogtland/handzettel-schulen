import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params?: Promise<{ id?: string }> | { id?: string };
};

type SocialPostRow = {
  id: string;
  topic?: string | null;
  hook?: string | null;
  caption?: string | null;
  tiktok_hook?: string | null;
  tiktok_caption?: string | null;
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

type SourceMedia = {
  asset: SocialAssetRow;
  mediaType: "video" | "image";
  score: number;
  reason: string;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function getMetadataText(asset: SocialAssetRow, key: string) {
  const value = asset.metadata?.[key];

  return cleanString(value);
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

function isTikTokGeneratedAsset(asset: SocialAssetRow) {
  const generationMode = getMetadataText(asset, "generation_mode");
  const intendedPlatform = getMetadataText(asset, "intended_platform");
  const model = cleanString(asset.model);

  return (
    generationMode === "tiktok_vertical_video" ||
    intendedPlatform === "tiktok" ||
    model === "tiktok-vertical-render-v1" ||
    model === "tiktok-vertical-render-v2"
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
    /\/api\/admin\/social\/([^/]+)\/generate-tiktok-video\/?$/
  );

  const pathId = match?.[1] ? decodeURIComponent(match[1]) : "";

  return cleanString(contextId || pathId)
    .replace(/^"+/, "")
    .replace(/"+$/, "")
    .trim();
}

function getFfmpegPath() {
  const explicitPath = cleanString(process.env.FFMPEG_PATH);

  if (explicitPath) {
    return explicitPath;
  }

  const platform = process.platform;
  const arch = process.arch;

  if (platform === "win32" && arch === "x64") {
    return path.join(
      process.cwd(),
      "node_modules",
      "@ffmpeg-installer",
      "win32-x64",
      "ffmpeg.exe"
    );
  }

  if (platform === "linux" && arch === "x64") {
    return path.join(
      process.cwd(),
      "node_modules",
      "@ffmpeg-installer",
      "linux-x64",
      "ffmpeg"
    );
  }

  if (platform === "darwin" && arch === "x64") {
    return path.join(
      process.cwd(),
      "node_modules",
      "@ffmpeg-installer",
      "darwin-x64",
      "ffmpeg"
    );
  }

  return "ffmpeg";
}

function isImageAsset(asset: SocialAssetRow) {
  const type = cleanString(asset.asset_type).toLowerCase();
  const mime = cleanString(asset.mime_type).toLowerCase();
  const url = cleanString(asset.public_url || asset.storage_path).toLowerCase();

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
  const type = cleanString(asset.asset_type).toLowerCase();
  const mime = cleanString(asset.mime_type).toLowerCase();
  const url = cleanString(asset.public_url || asset.storage_path).toLowerCase();

  return (
    type.includes("video") ||
    mime.startsWith("video/") ||
    url.endsWith(".mp4") ||
    url.endsWith(".mov") ||
    url.endsWith(".webm")
  );
}

function scoreSourceAsset(asset: SocialAssetRow): SourceMedia | null {
  if (!asset.public_url || asset.status === "archived") return null;
  if (isTikTokGeneratedAsset(asset)) return null;

  const provider = cleanString(asset.provider).toLowerCase();
  const model = cleanString(asset.model).toLowerCase();
  const generationMode = getMetadataText(asset, "generation_mode").toLowerCase();
  const musicStatus = getMetadataText(asset, "music_status").toLowerCase();
  const audioStatus = getNestedMetadataText(asset, "audio", "status").toLowerCase();

  if (isVideoAsset(asset)) {
    let score = 200;
    const reasons: string[] = ["Video"];

    if (
      generationMode.includes("video_with_embedded_music") ||
      provider.includes("audio") ||
      model.includes("audio") ||
      musicStatus === "embedded" ||
      audioStatus === "embedded"
    ) {
      score += 200;
      reasons.push("Musik eingebettet");
    }

    if (provider.includes("template-composite-video")) {
      score += 50;
      reasons.push("SocialPilot Video");
    }

    return {
      asset,
      mediaType: "video",
      score,
      reason: reasons.join(", "),
    };
  }

  if (isImageAsset(asset)) {
    return {
      asset,
      mediaType: "image",
      score: 50,
      reason: "Bild-Fallback",
    };
  }

  return null;
}

async function loadPost(postId: string) {
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

async function loadBestSourceMedia(postId: string) {
  const { data, error } = await supabaseServer
    .from("social_assets")
    .select("*")
    .eq("post_id", postId)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  const candidates = ((data || []) as SocialAssetRow[])
    .map(scoreSourceAsset)
    .filter(Boolean) as SourceMedia[];

  candidates.sort((a, b) => b.score - a.score);

  return candidates[0] || null;
}

async function fetchMediaBuffer(mediaUrl: string) {
  const response = await fetch(mediaUrl, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Quelldatei konnte nicht geladen werden: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();

  if (!arrayBuffer.byteLength) {
    throw new Error("Die Quelldatei ist leer oder konnte nicht vollständig geladen werden.");
  }

  return Buffer.from(arrayBuffer);
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn(getFfmpegPath(), args, {
      windowsHide: true,
    });

    let stderr = "";

    ffmpeg.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    ffmpeg.on("error", (error) => {
      reject(error);
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `FFmpeg TikTok-Render fehlgeschlagen mit Code ${code}: ${stderr.slice(
            -3000
          )}`
        )
      );
    });
  });
}

function getInputExtension(source: SourceMedia) {
  if (source.mediaType === "video") return ".mp4";

  const mime = cleanString(source.asset.mime_type).toLowerCase();
  const url = cleanString(source.asset.public_url || source.asset.storage_path).toLowerCase();

  if (mime.includes("webp") || url.endsWith(".webp")) return ".webp";
  if (mime.includes("jpeg") || url.endsWith(".jpeg") || url.endsWith(".jpg")) {
    return ".jpg";
  }

  return ".png";
}

async function renderVerticalVideo({
  source,
  sourceBuffer,
  durationSeconds,
}: {
  source: SourceMedia;
  sourceBuffer: Buffer;
  durationSeconds: number;
}) {
  const id = randomUUID();
  const inputPath = path.join(tmpdir(), `tiktok-source-${id}${getInputExtension(source)}`);
  const outputPath = path.join(tmpdir(), `tiktok-vertical-${id}.mp4`);

  const filter =
    "[0:v]split=2[base][front];" +
    "[base]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:1,eq=brightness=-0.16:saturation=0.86[bg];" +
    "[front]scale=980:1500:force_original_aspect_ratio=decrease[fg];" +
    "[bg][fg]overlay=(W-w)/2:(H-h)/2:shortest=1,format=yuv420p[v]";

  try {
    await writeFile(inputPath, sourceBuffer);

    if (source.mediaType === "video") {
      await runFfmpeg([
        "-y",
        "-i",
        inputPath,
        "-t",
        String(durationSeconds),
        "-filter_complex",
        filter,
        "-map",
        "[v]",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        outputPath,
      ]);
    } else {
      await runFfmpeg([
        "-y",
        "-loop",
        "1",
        "-framerate",
        "30",
        "-i",
        inputPath,
        "-t",
        String(durationSeconds),
        "-filter_complex",
        filter,
        "-map",
        "[v]",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-movflags",
        "+faststart",
        "-pix_fmt",
        "yuv420p",
        outputPath,
      ]);
    }

    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => undefined);
    await unlink(outputPath).catch(() => undefined);
  }
}

async function saveVideoAsset({
  post,
  source,
  videoBuffer,
  durationSeconds,
}: {
  post: SocialPostRow;
  source: SourceMedia;
  videoBuffer: Buffer;
  durationSeconds: number;
}) {
  const storageBucket = "social-assets";
  const storagePath = `social/${post.id}/tiktok-vertical-v2-${Date.now()}.mp4`;

  const upload = await supabaseServer.storage
    .from(storageBucket)
    .upload(storagePath, videoBuffer, {
      contentType: "video/mp4",
      upsert: true,
    });

  if (upload.error) {
    throw new Error(upload.error.message);
  }

  const publicUrlResult = supabaseServer.storage
    .from(storageBucket)
    .getPublicUrl(storagePath);

  const publicUrl = publicUrlResult.data.publicUrl;

  const prompt =
    cleanString(post.tiktok_hook) ||
    cleanString(post.hook) ||
    cleanString(post.topic) ||
    "TikTok 9:16 Video";

  const sourceMusicStatus =
    getMetadataText(source.asset, "music_status") ||
    getNestedMetadataText(source.asset, "audio", "status") ||
    "";

  const { data, error } = await supabaseServer
    .from("social_assets")
    .insert({
      post_id: post.id,
      asset_type: "video",
      provider: "template-composite-video",
      model: "tiktok-vertical-render-v2",
      prompt,
      storage_bucket: storageBucket,
      storage_path: storagePath,
      public_url: publicUrl,
      mime_type: "video/mp4",
      file_size: videoBuffer.byteLength,
      status: "ready",
      metadata: {
        generation_mode: "tiktok_vertical_video",
        format: "9:16",
        width: 1080,
        height: 1920,
        duration_seconds: durationSeconds,
        source_media_asset_id: source.asset.id,
        source_media_type: source.mediaType,
        source_media_reason: source.reason,
        source_media_url: source.asset.public_url,
        source_music_status: sourceMusicStatus || null,
        audio: {
          status:
            source.mediaType === "video"
              ? "copied_or_transcoded_from_source_video"
              : "none_image_fallback",
          note:
            source.mediaType === "video"
              ? "Audio wird aus dem Quellvideo übernommen, falls dort vorhanden."
              : "Kein Audio, weil nur ein Bild als Quelle vorhanden war.",
        },
        intended_platform: "tiktok",
        safe_upload_mode: true,
        note:
          "TikTok 9:16 video asset generated from the best available SocialPilot video source. Actual TikTok upload remains gated by video.upload and TIKTOK_ENABLE_DRAFT_UPLOAD.",
      },
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as SocialAssetRow;
}

async function parseBody(request: Request) {
  try {
    const body = (await request.json()) as {
      durationSeconds?: number;
    };

    const rawDuration = Number(body?.durationSeconds || 14);
    const durationSeconds = Math.min(30, Math.max(8, rawDuration));

    return {
      durationSeconds,
    };
  } catch {
    return {
      durationSeconds: 14,
    };
  }
}

export async function POST(request: Request, context: RouteContext) {
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

    const { durationSeconds } = await parseBody(request);
    const post = await loadPost(postId);
    const source = await loadBestSourceMedia(postId);

    if (!source?.asset.public_url) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Für diesen Beitrag wurde kein geeignetes Bild- oder Video-Asset gefunden. Bitte zuerst ein Social-Bild oder Video erzeugen.",
        },
        { status: 400 }
      );
    }

    const sourceBuffer = await fetchMediaBuffer(source.asset.public_url);
    const videoBuffer = await renderVerticalVideo({
      source,
      sourceBuffer,
      durationSeconds,
    });

    const asset = await saveVideoAsset({
      post,
      source,
      videoBuffer,
      durationSeconds,
    });

    return NextResponse.json({
      ok: true,
      message:
        source.mediaType === "video"
          ? "TikTok 9:16 Video wurde aus dem vorhandenen Video erzeugt. Audio wurde übernommen, falls im Quellvideo vorhanden."
          : "TikTok 9:16 Video wurde aus dem Bild erzeugt. Kein Audio enthalten, weil kein Video mit Musik als Quelle gefunden wurde.",
      source: {
        id: source.asset.id,
        media_type: source.mediaType,
        reason: source.reason,
        public_url: source.asset.public_url,
      },
      asset: {
        id: asset.id,
        public_url: asset.public_url,
        mime_type: asset.mime_type,
        status: asset.status,
        metadata: asset.metadata || null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "TikTok 9:16 Video konnte nicht erzeugt werden.",
      },
      { status: 500 }
    );
  }
}
