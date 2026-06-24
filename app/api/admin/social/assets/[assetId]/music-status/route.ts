import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params?: Promise<{ assetId?: string }> | { assetId?: string };
};

type MusicStatus = "none" | "manual_added" | "planned";

type SocialAssetRow = {
  id: string;
  asset_type: string | null;
  metadata: Record<string, unknown> | null;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function normalizeMusicStatus(value: unknown): MusicStatus {
  if (value === "manual_added") return "manual_added";
  if (value === "planned") return "planned";

  return "none";
}

async function getAssetIdFromRequest(request: Request, context: RouteContext) {
  let contextId = "";

  try {
    const rawParams = context.params;

    let params: { assetId?: string } | undefined;

    if (!rawParams) {
      params = undefined;
    } else if (
      typeof (rawParams as Promise<{ assetId?: string }>).then === "function"
    ) {
      params = await (rawParams as Promise<{ assetId?: string }>);
    } else {
      params = rawParams as { assetId?: string };
    }

    contextId = cleanString(params?.assetId);
  } catch {
    contextId = "";
  }

  const url = new URL(request.url);
  const match = url.pathname.match(
    /\/api\/admin\/social\/assets\/([^/]+)\/music-status\/?$/
  );

  const pathId = match?.[1] ? decodeURIComponent(match[1]) : "";

  return cleanString(contextId || pathId)
    .replace(/^"+/, "")
    .replace(/"+$/, "")
    .trim();
}

async function loadAsset(assetId: string) {
  const { data, error } = await supabaseServer
    .from("social_assets")
    .select("id, asset_type, metadata")
    .eq("id", assetId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (data || null) as SocialAssetRow | null;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const assetId = await getAssetIdFromRequest(request, context);

    if (!assetId || !isUuid(assetId)) {
      return NextResponse.json(
        {
          ok: false,
          message: `Ungültige Asset-ID: ${assetId || "keine ID empfangen"}`,
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

    const musicStatus = normalizeMusicStatus(
      body && typeof body === "object"
        ? (body as { musicStatus?: unknown }).musicStatus
        : null
    );

    const musicNoteRaw =
      body && typeof body === "object"
        ? (body as { musicNote?: unknown }).musicNote
        : null;

    const musicNote = cleanString(musicNoteRaw).slice(0, 500);

    const asset = await loadAsset(assetId);

    if (!asset) {
      return NextResponse.json(
        { ok: false, message: "Social-Asset wurde nicht gefunden." },
        { status: 404 }
      );
    }

    if (asset.asset_type !== "video") {
      return NextResponse.json(
        {
          ok: false,
          message: "Musikstatus kann nur für Video-Assets gesetzt werden.",
        },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    const currentMetadata =
      asset.metadata && typeof asset.metadata === "object"
        ? asset.metadata
        : {};

    const nextMetadata = {
      ...currentMetadata,
      music_status: musicStatus,
      music_note: musicNote,
      music_updated_at: now,
      audio: {
        status: musicStatus,
        note: musicNote,
        updated_at: now,
      },
    };

    const { data, error } = await supabaseServer
      .from("social_assets")
      .update({
        metadata: nextMetadata,
      })
      .eq("id", assetId)
      .select("id, asset_type, metadata, public_url, storage_path")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      message: "Musikstatus wurde gespeichert.",
      asset: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Unbekannter Fehler beim Speichern des Musikstatus.",
      },
      { status: 500 }
    );
  }
}

