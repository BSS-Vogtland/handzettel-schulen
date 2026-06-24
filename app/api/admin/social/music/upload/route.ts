import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
  "audio/mp4",
  "audio/ogg",
  "audio/webm",
]);

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toSlug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function splitTags(value: unknown) {
  return cleanString(value)
    .split(/[,;\n]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseOptionalInteger(value: unknown) {
  const raw = cleanString(value);
  if (!raw) return null;

  const parsed = Number.parseInt(raw, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getSafeFilename(filename: string) {
  const cleaned = filename
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned || "audio-file";
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, message: "Keine Audiodatei empfangen." },
        { status: 400 }
      );
    }

    const mimeType = file.type || "application/octet-stream";

    if (!ALLOWED_AUDIO_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        {
          ok: false,
          message: `Dateityp wird nicht unterstützt: ${mimeType}`,
        },
        { status: 400 }
      );
    }

    const title =
      cleanString(formData.get("title")) ||
      file.name.replace(/\.[^.]+$/, "").trim() ||
      "Musiktitel";

    const slug = toSlug(title) || `music-${Date.now()}`;
    const id = randomUUID();
    const safeFilename = getSafeFilename(file.name);
    const storagePath = `music/${id}/${safeFilename}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabaseServer.storage
      .from("social-audio")
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) throw new Error(uploadError.message);

    const { data: publicUrlData } = supabaseServer.storage
      .from("social-audio")
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData.publicUrl;

    const durationSeconds = parseOptionalInteger(
      formData.get("durationSeconds")
    );

    const bpm = parseOptionalInteger(formData.get("bpm"));

    const insertPayload = {
      id,
      title,
      slug,
      storage_bucket: "social-audio",
      storage_path: storagePath,
      public_url: publicUrl,
      mime_type: mimeType,
      file_size: buffer.byteLength,
      duration_seconds: durationSeconds,
      bpm,
      mood_tags: splitTags(formData.get("moodTags")),
      template_keys: splitTags(formData.get("templateKeys")),
      topic_categories: splitTags(formData.get("topicCategories")),
      license_type: cleanString(formData.get("licenseType")) || "lizenzfrei",
      license_source: cleanString(formData.get("licenseSource")),
      license_note: cleanString(formData.get("licenseNote")),
      sort_order: parseOptionalInteger(formData.get("sortOrder")) || 100,
      is_active: true,
    };

    const { data, error } = await supabaseServer
      .from("social_music_library")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      message: "Musik wurde in die SocialPilot-Musikbibliothek importiert.",
      track: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Unbekannter Fehler beim Musik-Upload.",
      },
      { status: 500 }
    );
  }
}
