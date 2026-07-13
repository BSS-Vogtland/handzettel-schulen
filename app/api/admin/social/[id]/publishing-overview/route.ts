import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
﻿import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getTikTokDraftUploadReadiness } from "@/lib/social/tiktokPosting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params?: Promise<{ id?: string }> | { id?: string };
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
    /\/api\/admin\/social\/([^/]+)\/publishing-overview\/?$/
  );

  const pathId = match?.[1] ? decodeURIComponent(match[1]) : "";

  return cleanString(contextId || pathId)
    .replace(/^"+/, "")
    .replace(/"+$/, "")
    .trim();
}

async function loadPublishEvents(postId: string) {
  const ordered = await supabaseServer
    .from("social_publish_events")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: false })
    .limit(60);

  if (!ordered.error) {
    return ordered.data || [];
  }

  const fallback = await supabaseServer
    .from("social_publish_events")
    .select("*")
    .eq("post_id", postId)
    .limit(60);

  if (fallback.error) {
    return [];
  }

  return fallback.data || [];
}

export async function GET(request: Request, context: RouteContext) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const id = await getPostIdFromRequest(request, context);

    if (!id || !isUuid(id)) {
      return NextResponse.json(
        {
          ok: false,
          message: `Ungültige Beitrags-ID: ${id || "keine ID empfangen"}`,
        },
        { status: 400 }
      );
    }

    const { data: post, error: postError } = await supabaseServer
      .from("social_posts")
      .select("*")
      .eq("id", id)
      .single();

    if (postError || !post) {
      return NextResponse.json(
        {
          ok: false,
          message: "Social-Beitrag wurde nicht gefunden.",
        },
        { status: 404 }
      );
    }

    const { data: assets, error: assetsError } = await supabaseServer
      .from("social_assets")
      .select("*")
      .eq("post_id", id)
      .neq("status", "archived")
      .order("created_at", { ascending: false });

    if (assetsError) {
      return NextResponse.json(
        {
          ok: false,
          message: assetsError.message,
        },
        { status: 500 }
      );
    }

    const publishEvents = await loadPublishEvents(id);

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
      post,
      assets: assets || [],
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
            : "Publishing-Übersicht konnte nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}
