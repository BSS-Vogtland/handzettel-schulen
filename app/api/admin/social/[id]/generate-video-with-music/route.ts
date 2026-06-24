import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params?: Promise<{ id?: string }> | { id?: string };
};

type SocialAssetRow = {
  id: string;
  post_id: string;
  public_url: string | null;
  storage_path: string | null;
  file_size: number | null;
  status: string | null;
  asset_type: string | null;
  mime_type: string | null;
  metadata: Record<string, unknown> | null;
};

type SocialMusicTrackRow = {
  id: string;
  title: string;
  public_url: string | null;
  storage_path: string | null;
  mime_type: string | null;
  duration_seconds: number | null;
  mood_tags: string[] | null;
  template_keys: string[] | null;
  license_type: string | null;
  license_source: string | null;
  license_note: string | null;
  is_active: boolean | null;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(cleanString(value));

  if (!Number.isFinite(parsed)) return fallback;

  return Math.min(max, Math.max(min, parsed));
}

function getDurationSeconds(metadata: Record<string, unknown> | null | undefined) {
  const value = metadata?.duration_seconds;

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);

    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return 30;
}

function getFfmpegPath() {
  const explicitPath = cleanString(process.env.FFMPEG_PATH);

  if (explicitPath) return explicitPath;

  const platform = process.platform;
  const arch = process.arch;

  const packageName =
    platform === "win32" && arch === "x64"
      ? "@ffmpeg-installer/win32-x64"
      : platform === "linux" && arch === "x64"
        ? "@ffmpeg-installer/linux-x64"
        : platform === "darwin" && arch === "x64"
          ? "@ffmpeg-installer/darwin-x64"
          : platform === "darwin" && arch === "arm64"
            ? "@ffmpeg-installer/darwin-arm64"
            : "";

  if (packageName) {
    const binaryName = platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
    const binaryPath = path.join(process.cwd(), "node_modules", packageName, binaryName);

    if (existsSync(binaryPath)) return binaryPath;
  }

  return "ffmpeg";
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(getFfmpegPath(), args, {
      windowsHide: true,
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `FFmpeg ist fehlgeschlagen. Code ${code}. ${stderr.slice(-3000)}`
        )
      );
    });
  });
}

async function downloadToFile(url: string, targetPath: string) {
  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Datei konnte nicht geladen werden: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();

  await writeFile(targetPath, Buffer.from(arrayBuffer));
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
    /\/api\/admin\/social\/([^/]+)\/generate-video-with-music\/?$/
  );

  const pathId = match?.[1] ? decodeURIComponent(match[1]) : "";

  return cleanString(contextId || pathId)
    .replace(/^"+/, "")
    .replace(/"+$/, "")
    .trim();
}

async function loadSourceVideoAsset({
  postId,
  sourceVideoAssetId,
}: {
  postId: string;
  sourceVideoAssetId: string;
}) {
  let query = supabaseServer
    .from("social_assets")
    .select("id, post_id, public_url, storage_path, file_size, status, asset_type, mime_type, metadata")
    .eq("post_id", postId)
    .eq("asset_type", "video")
    .neq("status", "archived");

  if (sourceVideoAssetId) {
    query = query.eq("id", sourceVideoAssetId);
  } else {
    query = query.order("created_at", { ascending: false }).limit(1);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw new Error(error.message);

  return (data || null) as SocialAssetRow | null;
}

async function loadMusicTrack(musicTrackId: string) {
  const { data, error } = await supabaseServer
    .from("social_music_library")
    .select(
      "id, title, public_url, storage_path, mime_type, duration_seconds, mood_tags, template_keys, license_type, license_source, license_note, is_active"
    )
    .eq("id", musicTrackId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (data || null) as SocialMusicTrackRow | null;
}

export async function POST(request: Request, context: RouteContext) {
  const jobId = randomUUID();
  const tempDir = path.join(os.tmpdir(), `social-music-${jobId}`);

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

    let body: unknown = null;

    try {
      body = await request.json();
    } catch {
      body = null;
    }

    const musicTrackId =
      body && typeof body === "object"
        ? cleanString((body as { musicTrackId?: unknown }).musicTrackId)
        : "";

    const sourceVideoAssetId =
      body && typeof body === "object"
        ? cleanString((body as { sourceVideoAssetId?: unknown }).sourceVideoAssetId)
        : "";

    const volume =
      body && typeof body === "object"
        ? clampNumber((body as { volume?: unknown }).volume, 0.35, 0.05, 1)
        : 0.35;

    if (!musicTrackId || !isUuid(musicTrackId)) {
      return NextResponse.json(
        { ok: false, message: "Bitte einen gültigen Musiktitel auswählen." },
        { status: 400 }
      );
    }

    const sourceVideo = await loadSourceVideoAsset({
      postId,
      sourceVideoAssetId,
    });

    if (!sourceVideo?.public_url) {
      return NextResponse.json(
        {
          ok: false,
          message: "Kein veröffentlichbares Ausgangsvideo gefunden.",
        },
        { status: 400 }
      );
    }

    const musicTrack = await loadMusicTrack(musicTrackId);

    if (!musicTrack?.public_url || musicTrack.is_active === false) {
      return NextResponse.json(
        {
          ok: false,
          message: "Der ausgewählte Musiktitel ist nicht verfügbar.",
        },
        { status: 400 }
      );
    }

    const durationSeconds = getDurationSeconds(sourceVideo.metadata);
    const fadeStart = Math.max(0, durationSeconds - 2);

    await mkdir(tempDir, { recursive: true });

    const inputVideoPath = path.join(tempDir, "input-video.mp4");
    const inputAudioPath = path.join(tempDir, "input-audio");
    const outputPath = path.join(tempDir, "output-with-music.mp4");

    await downloadToFile(sourceVideo.public_url, inputVideoPath);
    await downloadToFile(musicTrack.public_url, inputAudioPath);

    const filter = `[1:a]volume=${volume.toFixed(
      2
    )},afade=t=out:st=${fadeStart}:d=2[aout]`;

    await runFfmpeg([
      "-y",
      "-i",
      inputVideoPath,
      "-stream_loop",
      "-1",
      "-i",
      inputAudioPath,
      "-t",
      String(durationSeconds),
      "-filter_complex",
      filter,
      "-map",
      "0:v:0",
      "-map",
      "[aout]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-shortest",
      "-movflags",
      "+faststart",
      outputPath,
    ]);

    const outputBuffer = await readFile(outputPath);
    const timestamp = Date.now();
    const storagePath = `social/posts/${postId}/video-music-${timestamp}.mp4`;

    const { error: uploadError } = await supabaseServer.storage
      .from("social-assets")
      .upload(storagePath, outputBuffer, {
        contentType: "video/mp4",
        upsert: true,
      });

    if (uploadError) throw new Error(uploadError.message);

    const { data: publicUrlData } = supabaseServer.storage
      .from("social-assets")
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData.publicUrl;

    const metadata = {
      generation_mode: "video_with_embedded_music",
      duration_seconds: durationSeconds,
      source_video_asset_id: sourceVideo.id,
      music_track_id: musicTrack.id,
      music_title: musicTrack.title,
      music_status: "embedded",
      music_note: `Musik eingebettet: ${musicTrack.title}`,
      audio: {
        status: "embedded",
        note: `Musik eingebettet: ${musicTrack.title}`,
        track_id: musicTrack.id,
        title: musicTrack.title,
        volume,
        license_type: musicTrack.license_type,
        license_source: musicTrack.license_source,
        license_note: musicTrack.license_note,
      },
    };

    const { data: asset, error: insertError } = await supabaseServer
      .from("social_assets")
      .insert({
        post_id: postId,
        asset_type: "video",
        provider: "template-composite-video-audio",
        model: "ffmpeg-audio-mix-v1",
        public_url: publicUrl,
        storage_path: storagePath,
        file_size: outputBuffer.byteLength,
        mime_type: "video/mp4",
        status: "ready",
        metadata,
      })
      .select("*")
      .single();

    if (insertError) throw new Error(insertError.message);

    return NextResponse.json({
      ok: true,
      message: `Video wurde mit Musik erzeugt: ${musicTrack.title}`,
      asset,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Unbekannter Fehler beim Erzeugen des Videos mit Musik.",
      },
      { status: 500 }
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
