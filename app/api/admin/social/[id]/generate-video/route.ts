import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import { access, constants } from "fs/promises";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORAGE_BUCKET = process.env.SOCIAL_ASSETS_BUCKET || "social-assets";
const FPS = 30;
const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1350;
const MAX_ZOOM = 1.055;

type SocialAssetRow = {
  id: string;
  post_id: string;
  asset_type: string;
  storage_bucket: string;
  storage_path: string;
  public_url: string | null;
  mime_type: string | null;
  metadata: Record<string, unknown> | null;
};

type GenerateVideoRequestBody = {
  durationSeconds?: unknown;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

function normalizeDurationSeconds(value: unknown) {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : null;

  if (!numericValue || !Number.isFinite(numericValue)) {
    return 30;
  }

  const rounded = Math.round(numericValue);

  if ([7, 15, 30, 60].includes(rounded)) {
    return rounded;
  }

  if (rounded < 7) return 7;
  if (rounded <= 15) return 15;
  if (rounded <= 30) return 30;

  return 60;
}

async function fileExists(filePath: string) {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    try {
      await access(filePath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}

async function resolveFfmpegPath() {
  if (process.env.FFMPEG_PATH) {
    return process.env.FFMPEG_PATH;
  }

  const platform = process.platform;
  const arch = process.arch;
  const binaryName = platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const candidates: string[] = [];

  if (platform === "win32" && arch === "x64") {
    candidates.push(
      path.join(
        process.cwd(),
        "node_modules",
        "@ffmpeg-installer",
        "win32-x64",
        binaryName
      )
    );
  }

  if (platform === "linux" && arch === "x64") {
    candidates.push(
      path.join(
        process.cwd(),
        "node_modules",
        "@ffmpeg-installer",
        "linux-x64",
        binaryName
      )
    );
  }

  if (platform === "darwin" && arch === "x64") {
    candidates.push(
      path.join(
        process.cwd(),
        "node_modules",
        "@ffmpeg-installer",
        "darwin-x64",
        binaryName
      )
    );
  }

  if (platform === "darwin" && arch === "arm64") {
    candidates.push(
      path.join(
        process.cwd(),
        "node_modules",
        "@ffmpeg-installer",
        "darwin-arm64",
        binaryName
      )
    );
  }

  candidates.push("ffmpeg");

  for (const candidate of candidates) {
    if (candidate === "ffmpeg") {
      return candidate;
    }

    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return "ffmpeg";
}

async function runFfmpeg({
  inputPath,
  outputPath,
  durationSeconds,
}: {
  inputPath: string;
  outputPath: string;
  durationSeconds: number;
}) {
  const ffmpegPath = await resolveFfmpegPath();
  const frameCount = durationSeconds * FPS;
  const zoomIncrement = ((MAX_ZOOM - 1) / frameCount).toFixed(8);

  const args = [
    "-y",
    "-loop",
    "1",
    "-i",
    inputPath,
    "-t",
    String(durationSeconds),
    "-r",
    String(FPS),
    "-an",
    "-vf",
    [
      "scale=2160:2700",
      `zoompan=z='min(zoom+${zoomIncrement},${MAX_ZOOM})':d=${frameCount}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${CANVAS_WIDTH}x${CANVAS_HEIGHT}:fps=${FPS}`,
      "format=yuv420p",
    ].join(","),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputPath,
  ];

  return new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, args, {
      windowsHide: true,
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `FFmpeg wurde mit Code ${code} beendet. ${stderr.slice(-2000)}`
        )
      );
    });
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const tempDir = path.join(os.tmpdir(), `social-video-${randomUUID()}`);

  try {
    const { id } = await context.params;
    const postId = String(id || "").trim();

    if (!postId || !isUuid(postId)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Ungültige Social-Post-ID.",
        },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as GenerateVideoRequestBody;
    const durationSeconds = normalizeDurationSeconds(body.durationSeconds);

    const { data: postData, error: postError } = await supabaseServer
      .from("social_posts")
      .select("id, topic, hook, caption")
      .eq("id", postId)
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

    const { data: imageAssetData, error: imageAssetError } = await supabaseServer
      .from("social_assets")
      .select("*")
      .eq("post_id", postId)
      .eq("asset_type", "image")
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (imageAssetError) {
      return NextResponse.json(
        {
          ok: false,
          message: imageAssetError.message,
        },
        { status: 500 }
      );
    }

    if (!imageAssetData) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Es wurde kein fertiges Bild-Asset gefunden. Bitte zuerst ein Bild für diesen Beitrag erzeugen.",
        },
        { status: 400 }
      );
    }

    const imageAsset = imageAssetData as SocialAssetRow;

    if (!imageAsset.storage_bucket || !imageAsset.storage_path) {
      return NextResponse.json(
        {
          ok: false,
          message: "Das Bild-Asset hat keinen gültigen Storage-Pfad.",
        },
        { status: 400 }
      );
    }

    const { data: downloadedImage, error: downloadError } =
      await supabaseServer.storage
        .from(imageAsset.storage_bucket)
        .download(imageAsset.storage_path);

    if (downloadError || !downloadedImage) {
      return NextResponse.json(
        {
          ok: false,
          message:
            downloadError?.message ||
            "Das Bild-Asset konnte nicht aus dem Storage geladen werden.",
        },
        { status: 500 }
      );
    }

    await mkdir(tempDir, { recursive: true });

    const inputPath = path.join(tempDir, "input.png");
    const outputPath = path.join(tempDir, "output.mp4");

    const inputBuffer = Buffer.from(await downloadedImage.arrayBuffer());
    await writeFile(inputPath, inputBuffer);

    await runFfmpeg({
      inputPath,
      outputPath,
      durationSeconds,
    });

    const videoBuffer = await readFile(outputPath);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const storagePath = `social/posts/${postId}/video-${durationSeconds}s-${timestamp}.mp4`;

    const { error: uploadError } = await supabaseServer.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, videoBuffer, {
        contentType: "video/mp4",
        cacheControl: "31536000",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        {
          ok: false,
          message: uploadError.message,
        },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = supabaseServer.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData.publicUrl || null;

    const { data: videoAssetData, error: videoAssetError } =
      await supabaseServer
        .from("social_assets")
        .insert({
          post_id: postId,
          asset_type: "video",
          provider: "template-composite-video",
          model: `ffmpeg-ken-burns-v1-${durationSeconds}s`,
          prompt: `Animated ${durationSeconds}s MP4 generated from the latest ready SocialPilot image asset with a subtle zoom-in movement. No music.`,
          storage_bucket: STORAGE_BUCKET,
          storage_path: storagePath,
          public_url: publicUrl,
          mime_type: "video/mp4",
          file_size: videoBuffer.byteLength,
          status: "ready",
          metadata: {
            source: "admin_social_generate_video_v2",
            generation_mode: "animated_from_template_composite",
            duration_seconds: durationSeconds,
            fps: FPS,
            canvas_width: CANVAS_WIDTH,
            canvas_height: CANVAS_HEIGHT,
            music_ready: durationSeconds >= 30,
            animation: {
              type: "ken_burns_zoom_in",
              max_zoom: MAX_ZOOM,
              has_audio: false,
              music_status: "none",
              visual_loop_ready: true,
            },
            source_image_asset_id: imageAsset.id,
            source_image_storage_bucket: imageAsset.storage_bucket,
            source_image_storage_path: imageAsset.storage_path,
          },
        })
        .select("*")
        .single();

    if (videoAssetError) {
      return NextResponse.json(
        {
          ok: false,
          message: videoAssetError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Animiertes ${durationSeconds}-Sekunden-Video wurde erzeugt.`,
      asset: videoAssetData,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Erzeugen des animierten Videos.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => null);
  }
}
