import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanEnv(value: string | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function getTikTokConfigStatus() {
  const clientKey = cleanEnv(process.env.TIKTOK_CLIENT_KEY);
  const clientSecret = cleanEnv(process.env.TIKTOK_CLIENT_SECRET);
  const redirectUri = cleanEnv(process.env.TIKTOK_REDIRECT_URI);
  const accessToken = cleanEnv(process.env.TIKTOK_ACCESS_TOKEN);
  const refreshToken = cleanEnv(process.env.TIKTOK_REFRESH_TOKEN);
  const openId = cleanEnv(process.env.TIKTOK_OPEN_ID);

  return {
    clientKeySet: Boolean(clientKey),
    clientSecretSet: Boolean(clientSecret),
    redirectUriSet: Boolean(redirectUri),
    accessTokenSet: Boolean(accessToken),
    refreshTokenSet: Boolean(refreshToken),
    openIdSet: Boolean(openId),
    configured: Boolean(clientKey && clientSecret && redirectUri),
    tokenConfigured: Boolean(accessToken),
  };
}

async function verifyTikTokCreator(accessToken: string) {
  const response = await fetch(
    "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      cache: "no-store",
    }
  );

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: payload,
    };
  }

  return {
    ok: true,
    status: response.status,
    payload,
  };
}

export async function GET() {
  try {
    const config = getTikTokConfigStatus();
    const accessToken = cleanEnv(process.env.TIKTOK_ACCESS_TOKEN);

    let verification:
      | {
          ok: boolean;
          status?: number;
          error?: unknown;
          payload?: unknown;
          skipped?: boolean;
          reason?: string;
        }
      | null = null;

    if (!accessToken) {
      verification = {
        ok: false,
        skipped: true,
        reason:
          "Noch kein TIKTOK_ACCESS_TOKEN gesetzt. TikTok OAuth muss zuerst eingerichtet werden.",
      };
    } else {
      verification = await verifyTikTokCreator(accessToken);
    }

    return NextResponse.json({
      ok: true,
      checked_at: new Date().toISOString(),
      config,
      verification,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        checked_at: new Date().toISOString(),
        message:
          error instanceof Error
            ? error.message
            : "TikTok-Systemstatus konnte nicht geprüft werden.",
      },
      { status: 500 }
    );
  }
}
