import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params?: Promise<{ id?: string }> | { id?: string };
};

type SocialPostRow = {
  id: string;
  topic: string;
  status: string;
  review_status: string | null;
  scheduled_at: string | null;
  published_at: string | null;
};

type SocialAssetRow = {
  id: string;
  public_url: string | null;
  storage_path: string | null;
  status: string | null;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
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
    /\/api\/admin\/social\/([^/]+)\/mark-published\/?$/
  );

  const pathId = match?.[1] ? decodeURIComponent(match[1]) : "";

  return cleanString(contextId || pathId)
    .replace(/^"+/, "")
    .replace(/"+$/, "")
    .trim();
}

async function loadPost(id: string) {
  const { data, error } = await supabaseServer
    .from("social_posts")
    .select("id, topic, status, review_status, scheduled_at, published_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data || null) as SocialPostRow | null;
}

async function hasPublishableImageAsset(postId: string) {
  const { data, error } = await supabaseServer
    .from("social_assets")
    .select("id, public_url, storage_path, status")
    .eq("post_id", postId)
    .eq("asset_type", "image")
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(error.message);
  }

  const assets = (data || []) as SocialAssetRow[];

  return assets.some((asset) => Boolean(cleanString(asset.public_url)));
}

async function handleMarkPublished(request: Request, context: RouteContext) {
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

    const post = await loadPost(id);

    if (!post) {
      return NextResponse.json(
        {
          ok: false,
          message: "Social-Beitrag wurde nicht gefunden.",
        },
        { status: 404 }
      );
    }

    if (post.status === "published") {
      return NextResponse.json({
        ok: true,
        message: "Dieser Beitrag ist bereits als veröffentlicht markiert.",
        post,
      });
    }

    if (post.status === "archived") {
      return NextResponse.json(
        {
          ok: false,
          message: "Archivierte Beiträge können nicht veröffentlicht werden.",
        },
        { status: 400 }
      );
    }

    if (post.status === "failed") {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Beiträge mit Fehlerstatus können nicht direkt veröffentlicht werden.",
        },
        { status: 400 }
      );
    }

    if (post.review_status !== "approved") {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Content-Review ist noch nicht freigegeben. Bitte zuerst Review öffnen und den Beitrag freigeben.",
        },
        { status: 400 }
      );
    }

    const hasImage = await hasPublishableImageAsset(post.id);

    if (!hasImage) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Es ist noch kein veröffentlichbares Social-Bild vorhanden. Bitte zuerst ein Bild erzeugen.",
        },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    const { data: updatedPost, error: updateError } = await supabaseServer
      .from("social_posts")
      .update({
        status: "published",
        published_at: now,
        updated_at: now,
      })
      .eq("id", post.id)
      .select("id, topic, status, review_status, scheduled_at, published_at")
      .single();

    if (updateError) {
      return NextResponse.json(
        {
          ok: false,
          message: updateError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Beitrag wurde als veröffentlicht markiert.",
      post: updatedPost,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Markieren als veröffentlicht.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  return handleMarkPublished(request, context);
}

export async function PATCH(request: Request, context: RouteContext) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  return handleMarkPublished(request, context);
}