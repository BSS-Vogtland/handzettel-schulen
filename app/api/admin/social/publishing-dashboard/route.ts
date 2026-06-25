import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getTikTokDraftUploadReadiness } from "@/lib/social/tiktokPosting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UnknownRow = Record<string, unknown>;

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function loadRecentPosts() {
  const ordered = await supabaseServer
    .from("social_posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(12);

  if (!ordered.error) {
    return ordered.data || [];
  }

  const fallback = await supabaseServer
    .from("social_posts")
    .select("*")
    .limit(12);

  if (fallback.error) {
    throw new Error(fallback.error.message);
  }

  return fallback.data || [];
}

async function loadAssets(postIds: string[]) {
  if (postIds.length === 0) return [];

  const ordered = await supabaseServer
    .from("social_assets")
    .select("*")
    .in("post_id", postIds)
    .neq("status", "archived")
    .order("created_at", { ascending: false });

  if (!ordered.error) {
    return ordered.data || [];
  }

  const fallback = await supabaseServer
    .from("social_assets")
    .select("*")
    .in("post_id", postIds);

  if (fallback.error) {
    return [];
  }

  return fallback.data || [];
}

async function loadPublishEvents(postIds: string[]) {
  if (postIds.length === 0) return [];

  const ordered = await supabaseServer
    .from("social_publish_events")
    .select("*")
    .in("post_id", postIds)
    .order("created_at", { ascending: false })
    .limit(240);

  if (!ordered.error) {
    return ordered.data || [];
  }

  const fallback = await supabaseServer
    .from("social_publish_events")
    .select("*")
    .in("post_id", postIds)
    .limit(240);

  if (fallback.error) {
    return [];
  }

  return fallback.data || [];
}

function getId(row: UnknownRow) {
  return cleanString(row.id);
}

export async function GET() {
  try {
    const posts = await loadRecentPosts();
    const postIds = posts.map(getId).filter(Boolean);

    const [assets, publishEvents] = await Promise.all([
      loadAssets(postIds),
      loadPublishEvents(postIds),
    ]);

    let tiktok:
      | {
          connected: boolean;
          scope: string;
          uploadEnabled: boolean;
          hasVideoUploadScope: boolean;
          canUpload: boolean;
          blockedReason: string;
        }
      | null = null;

    try {
      const readiness = await getTikTokDraftUploadReadiness();

      tiktok = {
        connected: Boolean(readiness.connection?.id),
        scope: readiness.scope || "",
        uploadEnabled: Boolean(readiness.uploadEnabled),
        hasVideoUploadScope: Boolean(readiness.hasVideoUploadScope),
        canUpload: Boolean(readiness.canUpload),
        blockedReason: readiness.blockedReason || "",
      };
    } catch (error) {
      tiktok = {
        connected: false,
        scope: "",
        uploadEnabled: false,
        hasVideoUploadScope: false,
        canUpload: false,
        blockedReason:
          error instanceof Error
            ? error.message
            : "TikTok-Status konnte nicht geladen werden.",
      };
    }

    return NextResponse.json({
      ok: true,
      checked_at: new Date().toISOString(),
      posts,
      assets,
      publishEvents,
      tiktok,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Publishing-Dashboard konnte nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}
