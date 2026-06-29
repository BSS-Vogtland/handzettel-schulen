import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SocialPostRow = {
  id: string;
  topic: string | null;
  status: string | null;
  review_status: string | null;
  scheduled_at: string | null;
  published_at?: string | null;
};

type SocialAssetRow = {
  id: string;
  post_id: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  asset_type: string | null;
  status: string | null;
};

type ResetBody = {
  dryRun?: boolean;
  confirm?: string;
};

const CONFIRM_TEXT = "RESET_UNPUBLISHED_SOCIALPILOT";

const OPTIONAL_POST_TABLES = [
  "social_ad_campaigns",
  "social_post_metrics",
  "social_post_reviews",
  "social_review_reminder_events",
  "social_review_reminders",
  "social_publishing_queue",
  "social_scheduled_jobs",
];

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getResetSecret() {
  return cleanString(process.env.SOCIAL_RESET_SECRET || process.env.CRON_SECRET);
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function readBody(request: Request): Promise<ResetBody> {
  try {
    const body = (await request.json()) as ResetBody;
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

function isAuthorized(request: Request) {
  const secret = getResetSecret();

  if (!secret) return false;

  const url = new URL(request.url);
  const querySecret = cleanString(url.searchParams.get("secret"));
  const headerSecret = cleanString(request.headers.get("x-social-reset-secret"));

  return querySecret === secret || headerSecret === secret;
}

async function loadPublishedPostIds() {
  const publishedIds = new Set<string>();

  const { data: publishEventsData, error: publishEventsError } =
    await supabaseServer
      .from("social_publish_events")
      .select("post_id")
      .eq("event_type", "publish")
      .eq("status", "success");

  if (publishEventsError) {
    throw new Error(publishEventsError.message);
  }

  for (const event of publishEventsData || []) {
    const postId = cleanString((event as { post_id?: unknown }).post_id);
    if (postId) publishedIds.add(postId);
  }

  return publishedIds;
}

async function deleteStorageObjects(assets: SocialAssetRow[]) {
  const warnings: string[] = [];
  const grouped = new Map<string, string[]>();

  for (const asset of assets) {
    const storagePath = cleanString(asset.storage_path);
    if (!storagePath) continue;

    const bucket =
      cleanString(asset.storage_bucket) ||
      process.env.SOCIAL_ASSETS_BUCKET ||
      "social-assets";

    if (!grouped.has(bucket)) grouped.set(bucket, []);
    grouped.get(bucket)?.push(storagePath);
  }

  let deletedStorageObjects = 0;

  for (const [bucket, paths] of grouped.entries()) {
    const uniquePaths = Array.from(new Set(paths));

    for (const batch of chunkArray(uniquePaths, 100)) {
      const { error } = await supabaseServer.storage.from(bucket).remove(batch);

      if (error) {
        warnings.push(
          `Storage konnte nicht vollständig gelöscht werden: Bucket ${bucket}: ${error.message}`
        );
      } else {
        deletedStorageObjects += batch.length;
      }
    }
  }

  return {
    deletedStorageObjects,
    warnings,
  };
}

async function deleteRowsByPostId(table: string, postIds: string[]) {
  let deleted = 0;
  const warnings: string[] = [];

  for (const batch of chunkArray(postIds, 100)) {
    const { count, error } = await supabaseServer
      .from(table)
      .delete({ count: "exact" })
      .in("post_id", batch);

    if (error) {
      warnings.push(`${table}: ${error.message}`);
    } else {
      deleted += count || 0;
    }
  }

  return {
    table,
    deleted,
    warnings,
  };
}

async function deleteRowsById(table: string, ids: string[]) {
  let deleted = 0;

  for (const batch of chunkArray(ids, 100)) {
    const { count, error } = await supabaseServer
      .from(table)
      .delete({ count: "exact" })
      .in("id", batch);

    if (error) {
      throw new Error(`${table}: ${error.message}`);
    }

    deleted += count || 0;
  }

  return deleted;
}

export async function POST(request: Request) {
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
          message: `Für den echten Reset muss confirm exakt "${CONFIRM_TEXT}" sein.`,
        },
        { status: 400 }
      );
    }

    const { data: postsData, error: postsError } = await supabaseServer
      .from("social_posts")
      .select("id, topic, status, review_status, scheduled_at, published_at")
      .order("created_at", { ascending: false });

    if (postsError) throw new Error(postsError.message);

    const posts = (postsData || []) as SocialPostRow[];
    const publishedEventIds = await loadPublishedPostIds();

    const keepPosts = posts.filter((post) => {
      if (post.status === "published") return true;
      if (post.published_at) return true;
      if (publishedEventIds.has(post.id)) return true;

      return false;
    });

    const resetPosts = posts.filter(
      (post) => !keepPosts.some((kept) => kept.id === post.id)
    );

    const resetPostIds = resetPosts.map((post) => post.id);

    let assets: SocialAssetRow[] = [];

    if (resetPostIds.length > 0) {
      for (const batch of chunkArray(resetPostIds, 100)) {
        const { data: assetsData, error: assetsError } = await supabaseServer
          .from("social_assets")
          .select("id, post_id, storage_bucket, storage_path, asset_type, status")
          .in("post_id", batch);

        if (assetsError) throw new Error(assetsError.message);

        assets = assets.concat((assetsData || []) as SocialAssetRow[]);
      }
    }

    const assetIds = assets.map((asset) => asset.id);

    const scheduledPosts = resetPosts.filter((post) => post.scheduled_at);
    const approvedPosts = resetPosts.filter(
      (post) => post.status === "approved" || post.review_status === "approved"
    );
    const draftPosts = resetPosts.filter((post) => post.status === "draft");

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        message:
          "Dry-Run: Es wurde noch nichts gelöscht. Prüfe die Zahlen und starte danach den echten Reset.",
        keep: {
          publishedPosts: keepPosts.length,
        },
        reset: {
          posts: resetPosts.length,
          draftPosts: draftPosts.length,
          approvedPosts: approvedPosts.length,
          scheduledPosts: scheduledPosts.length,
          assets: assets.length,
          imageAssets: assets.filter((asset) => asset.asset_type === "image")
            .length,
          videoAssets: assets.filter((asset) => asset.asset_type === "video")
            .length,
        },
        sampleResetPosts: resetPosts.slice(0, 10).map((post) => ({
          id: post.id,
          topic: post.topic,
          status: post.status,
          review_status: post.review_status,
          scheduled_at: post.scheduled_at,
        })),
      });
    }

    const optionalDeletes = [];

    if (resetPostIds.length > 0) {
      for (const table of OPTIONAL_POST_TABLES) {
        optionalDeletes.push(await deleteRowsByPostId(table, resetPostIds));
      }
    }

    const storageResult = await deleteStorageObjects(assets);

    const deletedPublishEvents =
      resetPostIds.length > 0
        ? (await deleteRowsByPostId("social_publish_events", resetPostIds))
            .deleted
        : 0;

    const deletedAssets =
      assetIds.length > 0 ? await deleteRowsById("social_assets", assetIds) : 0;

    const deletedPosts =
      resetPostIds.length > 0
        ? await deleteRowsById("social_posts", resetPostIds)
        : 0;

    const optionalWarnings = optionalDeletes.flatMap((item) => item.warnings);
    const warnings = [...storageResult.warnings, ...optionalWarnings];

    return NextResponse.json({
      ok: true,
      dryRun: false,
      message:
        "SocialPilot wurde zurückgesetzt. Veröffentlichte Beiträge wurden behalten.",
      keep: {
        publishedPosts: keepPosts.length,
      },
      deleted: {
        posts: deletedPosts,
        publishEvents: deletedPublishEvents,
        assets: deletedAssets,
        storageObjects: storageResult.deletedStorageObjects,
        optionalTables: optionalDeletes.map((item) => ({
          table: item.table,
          deleted: item.deleted,
        })),
      },
      warnings,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Unbekannter Fehler beim SocialPilot-Reset.",
      },
      { status: 500 }
    );
  }
}
