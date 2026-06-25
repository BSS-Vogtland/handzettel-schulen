import { NextResponse } from "next/server";
import {
  buildTikTokCaption,
  createTikTokDraftUpload,
  getTikTokDraftUploadReadiness,
  loadTikTokPost,
  loadTikTokVideoAsset,
} from "@/lib/social/tiktokPosting";

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
    /\/api\/admin\/social\/([^/]+)\/publish-tiktok\/?$/
  );

  const pathId = match?.[1] ? decodeURIComponent(match[1]) : "";

  return cleanString(contextId || pathId)
    .replace(/^"+/, "")
    .replace(/"+$/, "")
    .trim();
}

async function parseBody(request: Request) {
  try {
    const body = (await request.json()) as {
      dryRun?: boolean;
      assetId?: string;
    };

    return {
      dryRun: Boolean(body?.dryRun),
      assetId: cleanString(body?.assetId),
    };
  } catch {
    return {
      dryRun: false,
      assetId: "",
    };
  }
}

export async function POST(request: Request, context: RouteContext) {
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

    const { dryRun, assetId } = await parseBody(request);

    const post = await loadTikTokPost(id);
    const videoAsset = await loadTikTokVideoAsset({
      postId: id,
      assetId: assetId || null,
    });
    const readiness = await getTikTokDraftUploadReadiness();
    const finalText = buildTikTokCaption({ post, videoAsset });

    const videoBlockedReason = !videoAsset?.public_url
      ? "Es ist noch kein veröffentlichbares TikTok-Video vorhanden."
      : "";

    const reviewBlockedReason =
      post.review_status !== "approved"
        ? "Content-Review ist noch nicht freigegeben. Bitte zuerst Review öffnen und den Beitrag freigeben."
        : "";

    const blockedReason =
      reviewBlockedReason ||
      videoBlockedReason ||
      readiness.blockedReason ||
      "";

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        message: blockedReason
          ? "TikTok-Draft-Upload ist vorbereitet, aber noch gesperrt."
          : "TikTok-Draft-Upload ist vorbereitet.",
        canUpload: Boolean(!blockedReason && readiness.canUpload),
        blockedReason,
        readiness: {
          uploadEnabled: readiness.uploadEnabled,
          hasVideoUploadScope: readiness.hasVideoUploadScope,
          scope: readiness.scope,
        },
        post: {
          id: post.id,
          topic: post.topic || null,
          review_status: post.review_status || null,
          status: post.status || null,
        },
        videoAsset: videoAsset
          ? {
              id: videoAsset.id,
              public_url: videoAsset.public_url,
              file_size: videoAsset.file_size || null,
              mime_type: videoAsset.mime_type || null,
              status: videoAsset.status || null,
              created_at: videoAsset.created_at || null,
            }
          : null,
        finalText,
      });
    }

    if (blockedReason || !readiness.canUpload) {
      return NextResponse.json(
        {
          ok: false,
          message: blockedReason || "TikTok-Draft-Upload ist noch gesperrt.",
          canUpload: false,
        },
        { status: 400 }
      );
    }

    const result = await createTikTokDraftUpload({
      postId: id,
      assetId: assetId || null,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "TikTok-Draft-Upload ist fehlgeschlagen.",
      },
      { status: 500 }
    );
  }
}
