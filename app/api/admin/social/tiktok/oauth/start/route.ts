import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
﻿import { NextResponse } from "next/server";
import {
  buildTikTokAuthorizationUrl,
  createTikTokOAuthState,
} from "@/lib/social/tiktokOAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://www.handzettel-schulen.de";
}

export async function GET() {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const state = createTikTokOAuthState();
    const url = buildTikTokAuthorizationUrl({ state });

    const response = NextResponse.redirect(url);

    response.cookies.set("social_tiktok_oauth_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });

    return response;
  } catch (error) {
    const redirectUrl = new URL("/admin/social", getBaseUrl());

    redirectUrl.searchParams.set("social_tiktok_oauth", "error");
    redirectUrl.searchParams.set(
      "message",
      error instanceof Error
        ? error.message
        : "TikTok OAuth konnte nicht gestartet werden."
    );

    return NextResponse.redirect(redirectUrl);
  }
}
