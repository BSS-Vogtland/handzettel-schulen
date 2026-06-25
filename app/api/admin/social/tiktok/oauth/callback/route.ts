import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  cleanTikTokString,
  exchangeTikTokCodeForToken,
  saveTikTokConnection,
} from "@/lib/social/tiktokOAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://www.handzettel-schulen.de";
}

function buildAdminRedirect({
  status,
  message,
}: {
  status: "connected" | "error";
  message?: string;
}) {
  const url = new URL("/admin/social", getBaseUrl());

  url.searchParams.set("social_tiktok_oauth", status);

  if (message) {
    url.searchParams.set("message", message.slice(0, 400));
  }

  return url;
}

export async function GET(request: Request) {
  const cookieStore = await cookies();

  try {
    const requestUrl = new URL(request.url);

    const error = cleanTikTokString(requestUrl.searchParams.get("error"));
    const errorDescription = cleanTikTokString(
      requestUrl.searchParams.get("error_description")
    );

    if (error) {
      throw new Error(errorDescription || error);
    }

    const code = cleanTikTokString(requestUrl.searchParams.get("code"));
    const state = cleanTikTokString(requestUrl.searchParams.get("state"));
    const expectedState = cleanTikTokString(
      cookieStore.get("social_tiktok_oauth_state")?.value
    );

    if (!code) {
      throw new Error("TikTok OAuth Callback enthaelt keinen Code.");
    }

    if (!state || !expectedState || state !== expectedState) {
      throw new Error(
        "TikTok OAuth State ist ungueltig. Bitte Verbindung erneut starten."
      );
    }

    const token = await exchangeTikTokCodeForToken(code);
    await saveTikTokConnection(token);

    const response = NextResponse.redirect(
      buildAdminRedirect({
        status: "connected",
        message: "TikTok wurde verbunden.",
      })
    );

    response.cookies.set("social_tiktok_oauth_state", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (error) {
    const response = NextResponse.redirect(
      buildAdminRedirect({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "TikTok OAuth Callback ist fehlgeschlagen.",
      })
    );

    response.cookies.set("social_tiktok_oauth_state", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return response;
  }
}
