import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import sharp from "sharp";
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
  cta?: string | null;
  tiktok_hook?: string | null;
  tiktok_caption?: string | null;
  hashtags?: string[] | null;
  review_status?: string | null;
};

type SocialAssetRow = {
  id: string;
  post_id?: string | null;
  asset_type?: string | null;
  public_url?: string | null;
  storage_path?: string | null;
  mime_type?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
    /\/api\/admin\/social\/([^/]+)\/generate-tiktok-video\/?$/
  );

  const pathId = match?.[1] ? decodeURIComponent(match[1]) : "";

  return cleanString(contextId || pathId)
    .replace(/^"+/, "")
    .replace(/"+$/, "")
    .trim();
}

function getFfmpegPath() {
  try {
    const dynamicRequire = eval("require") as (packageName: string) => {
      path?: string;
    };

    const ffmpegInstaller = dynamicRequire("@ffmpeg-installer/ffmpeg");

    return ffmpegInstaller.path || "ffmpeg";
  } catch {
    return process.env.FFMPEG_PATH || "ffmpeg";
  }
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapText(value: string, maxChars: number, maxLines: number) {
  const words = cleanString(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }

    if (lines.length >= maxLines) break;
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  return lines.slice(0, maxLines);
}

function normalizeHashtags(hashtags: string[] | null | undefined) {
  return (hashtags || [])
    .map((hashtag) => String(hashtag || "").trim())
    .filter(Boolean)
    .map((hashtag) => (hashtag.startsWith("#") ? hashtag : `#${hashtag}`));
}

function getSourceImageScore(asset: SocialAssetRow) {
  const type = cleanString(asset.asset_type).toLowerCase();
  const mime = cleanString(asset.mime_type).toLowerCase();
  const url = cleanString(asset.public_url || asset.storage_path).toLowerCase();

  if (!asset.public_url) return 0;

  if (type === "image") return 100;
  if (type.includes("image")) return 90;
  if (type.includes("photo")) return 80;
  if (mime.startsWith("image/")) return 80;
  if (
    url.endsWith(".png") ||
    url.endsWith(".jpg") ||
    url.endsWith(".jpeg") ||
    url.endsWith(".webp")
  ) {
    return 70;
  }

  return 0;
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

async function loadSourceImageAsset(postId: string) {
  const { data, error } = await supabaseServer
    .from("social_assets")
    .select("*")
    .eq("post_id", postId)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    throw new Error(error.message);
  }

  const assets = ((data || []) as SocialAssetRow[])
    .map((asset) => ({
      asset,
      score: getSourceImageScore(asset),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return assets[0]?.asset || null;
}

async function fetchImageBuffer(imageUrl: string) {
  const response = await fetch(imageUrl, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Bild konnte nicht geladen werden: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();

  if (!arrayBuffer.byteLength) {
    throw new Error("Das Bild ist leer oder konnte nicht vollständig geladen werden.");
  }

  return Buffer.from(arrayBuffer);
}

function buildOverlaySvg({
  hook,
  subline,
}: {
  hook: string;
  subline: string;
}) {
  const hookLines = wrapText(hook.toUpperCase(), 18, 4);
  const sublineLines = wrapText(subline, 34, 2);

  const hookSvg = hookLines
    .map((line, index) => {
      const y = 155 + index * 78;

      return `<text x="92" y="${y}" font-size="66" font-weight="900" font-family="Arial, Helvetica, sans-serif" fill="#102A43">${escapeXml(
        line
      )}</text>`;
    })
    .join("");

  const sublineSvg = sublineLines
    .map((line, index) => {
      const y = 465 + index * 38;

      return `<text x="94" y="${y}" font-size="30" font-weight="700" font-family="Arial, Helvetica, sans-serif" fill="#486581">${escapeXml(
        line
      )}</text>`;
    })
    .join("");

  return Buffer.from(`
    <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
      <rect x="54" y="74" width="972" height="500" rx="44" fill="rgba(255,255,255,0.88)" />
      <rect x="76" y="96" width="928" height="456" rx="34" fill="none" stroke="rgba(231,216,195,0.9)" stroke-width="3" />
      ${hookSvg}
      ${sublineSvg}
      <rect x="94" y="1660" width="892" height="142" rx="36" fill="rgba(255,255,255,0.9)" />
      <text x="124" y="1728" font-size="36" font-weight="900" font-family="Arial, Helvetica, sans-serif" fill="#102A43">handzettel-schulen.de</text>
      <text x="124" y="1778" font-size="27" font-weight="700" font-family="Arial, Helvetica, sans-serif" fill="#486581">Schulmaterial entspannt vorbereiten.</text>
    </svg>
  `);
}

async function composeTikTokFrame({
  sourceImageBuffer,
  post,
}: {
  sourceImageBuffer: Buffer;
  post: SocialPostRow;
}) {
  const hook =
    cleanString(post.tiktok_hook) ||
    cleanString(post.hook) ||
    cleanString(post.topic) ||
    "Schulstart stressfrei vorbereiten";

  const subline =
    cleanString(post.tiktok_caption) ||
    cleanString(post.caption) ||
    "Upload, Paketwunsch und Schulmaterial einfach an einem Ort.";

  const background = await sharp(sourceImageBuffer)
    .resize(1080, 1920, {
      fit: "cover",
      position: "center",
    })
    .blur(24)
    .modulate({
      brightness: 0.72,
      saturation: 0.82,
    })
    .png()
    .toBuffer();

  const foreground = await sharp(sourceImageBuffer)
    .resize(900, 880, {
      fit: "inside",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();

  const metadata = await sharp(foreground).metadata();
  const foregroundWidth = metadata.width || 900;
  const foregroundHeight = metadata.height || 880;
  const foregroundLeft = Math.round((1080 - foregroundWidth) / 2);
  const foregroundTop = 650;

  const shadowSvg = Buffer.from(`
    <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
      <rect x="${foregroundLeft - 24}" y="${foregroundTop - 24}" width="${
        foregroundWidth + 48
      }" height="${
        foregroundHeight + 48
      }" rx="46" fill="rgba(16,42,67,0.22)" />
      <rect x="${foregroundLeft - 10}" y="${foregroundTop - 10}" width="${
        foregroundWidth + 20
      }" height="${
        foregroundHeight + 20
      }" rx="34" fill="rgba(255,255,255,0.92)" />
    </svg>
  `);

  return sharp(background)
    .composite([
      {
        input: shadowSvg,
        top: 0,
        left: 0,
      },
      {
        input: foreground,
        top: foregroundTop,
        left: foregroundLeft,
      },
      {
        input: buildOverlaySvg({
          hook,
          subline,
        }),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer();
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

async function renderFrameToVideo({
  frameBuffer,
  durationSeconds,
}: {
  frameBuffer: Buffer;
  durationSeconds: number;
}) {
  const id = randomUUID();
  const framePath = path.join(tmpdir(), `tiktok-frame-${id}.png`);
  const outputPath = path.join(tmpdir(), `tiktok-video-${id}.mp4`);
  const frames = Math.max(1, Math.round(durationSeconds * 30));

  try {
    await writeFile(framePath, frameBuffer);

    await runFfmpeg([
      "-y",
      "-loop",
      "1",
      "-framerate",
      "30",
      "-i",
      framePath,
      "-vf",
      `zoompan=z='min(zoom+0.00075,1.04)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30,format=yuv420p`,
      "-t",
      String(durationSeconds),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-movflags",
      "+faststart",
      "-pix_fmt",
      "yuv420p",
      outputPath,
    ]);

    return await readFile(outputPath);
  } finally {
    await unlink(framePath).catch(() => undefined);
    await unlink(outputPath).catch(() => undefined);
  }
}

async function saveVideoAsset({
  post,
  sourceAsset,
  videoBuffer,
  durationSeconds,
}: {
  post: SocialPostRow;
  sourceAsset: SocialAssetRow;
  videoBuffer: Buffer;
  durationSeconds: number;
}) {
  const storageBucket = "social-assets";
  const storagePath = `social/${post.id}/tiktok-vertical-${Date.now()}.mp4`;

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

  const { data, error } = await supabaseServer
    .from("social_assets")
    .insert({
      post_id: post.id,
      asset_type: "video",
      provider: "template-composite-video",
      model: "tiktok-vertical-render-v1",
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
        source_image_asset_id: sourceAsset.id,
        source_image_url: sourceAsset.public_url,
        intended_platform: "tiktok",
        safe_upload_mode: true,
        note:
          "TikTok 9:16 video asset generated for draft-upload preparation. Actual upload remains gated by video.upload and TIKTOK_ENABLE_DRAFT_UPLOAD.",
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
    const durationSeconds = Math.min(20, Math.max(8, rawDuration));

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
    const sourceAsset = await loadSourceImageAsset(postId);

    if (!sourceAsset?.public_url) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Für diesen Beitrag wurde kein geeignetes Bild-Asset gefunden. Bitte zuerst ein Social-Bild erzeugen.",
        },
        { status: 400 }
      );
    }

    const sourceImageBuffer = await fetchImageBuffer(sourceAsset.public_url);
    const frameBuffer = await composeTikTokFrame({
      sourceImageBuffer,
      post,
    });
    const videoBuffer = await renderFrameToVideo({
      frameBuffer,
      durationSeconds,
    });
    const asset = await saveVideoAsset({
      post,
      sourceAsset,
      videoBuffer,
      durationSeconds,
    });

    return NextResponse.json({
      ok: true,
      message: "TikTok 9:16 Video wurde erzeugt.",
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
