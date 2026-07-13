import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
﻿import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONFIRM_TEXT = "CLEAR_PUBLISHED_PREPARED_ASSETS";

type ResetBody = {
  dryRun?: boolean;
  confirm?: string;
};

type SocialPostRow = {
  id: string;
  topic: string | null;
  status: string | null;
  published_at: string | null;
};

type SocialAssetRow = {
  id: string;
  post_id: string | null;
  asset_type: string | null;
  status: string | null;
  storage_path: string | null;
  created_at: string | null;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getResetSecret() {
  return cleanString(process.env.SOCIAL_RESET_SECRET || process.env.CRON_SECRET);
}

function isAuthorized(request: Request) {
  const secret = getResetSecret();

  if (!secret) return false;

  const url = new URL(request.url);
  const querySecret = cleanString(url.searchParams.get("secret"));
  const headerSecret = cleanString(request.headers.get("x-social-reset-secret"));

  return querySecret === secret || headerSecret === secret;
}

async function readBody(request: Request): Promise<ResetBody> {
  try {
    const body = (await request.json()) as ResetBody;
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function loadPublishedPostIds() {
  const ids = new Set<string>();

  const { data: postsData, error: postsError } = await supabaseServer
    .from("social_posts")
    .select("id, topic, status, published_at")
    .or("status.eq.published,published_at.not.is.null");

  if (postsError) {
    throw new Error(postsError.message);
  }

  for (const post of (postsData || []) as SocialPostRow[]) {
    if (post.id) ids.add(post.id);
  }

  const { data: eventsData, error: eventsError } = await supabaseServer
    .from("social_publish_events")
    .select("post_id")
    .eq("event_type", "publish")
    .eq("status", "success");

  if (eventsError) {
    throw new Error(eventsError.message);
  }

  for (const event of eventsData || []) {
    const postId = cleanString((event as { post_id?: unknown }).post_id);
    if (postId) ids.add(postId);
  }

  return Array.from(ids);
}

async function loadPostsByIds(ids: string[]) {
  if (ids.length === 0) return [];

  const posts: SocialPostRow[] = [];

  for (const batch of chunkArray(ids, 100)) {
    const { data, error } = await supabaseServer
      .from("social_posts")
      .select("id, topic, status, published_at")
      .in("id", batch);

    if (error) throw new Error(error.message);

    posts.push(...((data || []) as SocialPostRow[]));
  }

  return posts;
}

async function loadActiveAssets(postIds: string[]) {
  if (postIds.length === 0) return [];

  const assets: SocialAssetRow[] = [];

  for (const batch of chunkArray(postIds, 100)) {
    const { data, error } = await supabaseServer
      .from("social_assets")
      .select("id, post_id, asset_type, status, storage_path, created_at")
      .in("post_id", batch)
      .neq("status", "archived");

    if (error) throw new Error(error.message);

    assets.push(...((data || []) as SocialAssetRow[]));
  }

  return assets;
}

async function archiveAssets(assetIds: string[]) {
  let archived = 0;

  for (const batch of chunkArray(assetIds, 100)) {
    const { count, error } = await supabaseServer
      .from("social_assets")
      .update({
        status: "archived",
      }, { count: "exact" })
      .in("id", batch);

    if (error) throw new Error(error.message);

    archived += count || 0;
  }

  return archived;
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Nicht autorisiert. SOCIAL_RESET_SECRET oder CRON_SECRET fehlt oder ist falsch.",
        },
        { status: 401 }
      );
    }

    const body = await readBody(request);
    const dryRun = body.dryRun !== false;

    if (!dryRun && cleanString(body.confirm) !== CONFIRM_TEXT) {
      return NextResponse.json(
        {
          ok: false,
          message: `Für das echte Entfernen muss confirm exakt "${CONFIRM_TEXT}" sein.`,
        },
        { status: 400 }
      );
    }

    const publishedPostIds = await loadPublishedPostIds();
    const posts = await loadPostsByIds(publishedPostIds);
    const assets = await loadActiveAssets(publishedPostIds);
    const assetIds = assets.map((asset) => asset.id).filter(Boolean);

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        message:
          "Dry-Run: Es wurde noch nichts archiviert. Prüfe die Zahlen und starte danach den echten Lauf.",
        publishedPosts: posts.length,
        activePreparedAssets: assets.length,
        imageAssets: assets.filter((asset) => asset.asset_type === "image").length,
        videoAssets: assets.filter((asset) => asset.asset_type === "video").length,
        samplePosts: posts.slice(0, 10).map((post) => ({
          id: post.id,
          topic: post.topic,
          status: post.status,
          published_at: post.published_at,
        })),
        sampleAssets: assets.slice(0, 10).map((asset) => ({
          id: asset.id,
          post_id: asset.post_id,
          asset_type: asset.asset_type,
          status: asset.status,
          created_at: asset.created_at,
        })),
      });
    }

    const archivedAssets = assetIds.length > 0 ? await archiveAssets(assetIds) : 0;

    return NextResponse.json({
      ok: true,
      dryRun: false,
      message:
        "Vorbereitete Assets bei veröffentlichten Beiträgen wurden archiviert. Die veröffentlichten Beiträge und Publish-Historie bleiben erhalten.",
      publishedPosts: posts.length,
      archivedAssets,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Unbekannter Fehler beim Entfernen vorbereiteter Assets.",
      },
      { status: 500 }
    );
  }
}
