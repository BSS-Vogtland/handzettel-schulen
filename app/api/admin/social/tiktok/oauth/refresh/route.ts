import { NextResponse } from "next/server";
import {
  cleanTikTokString,
  loadStoredTikTokConnection,
  refreshTikTokToken,
  saveTikTokConnection,
} from "@/lib/social/tiktokOAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const storedConnection = await loadStoredTikTokConnection();

    const refreshToken =
      cleanTikTokString(storedConnection?.refresh_token) ||
      cleanTikTokString(process.env.TIKTOK_REFRESH_TOKEN);

    if (!refreshToken) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Kein TikTok Refresh Token vorhanden. Bitte TikTok neu verbinden.",
        },
        { status: 400 }
      );
    }

    const token = await refreshTikTokToken(refreshToken);
    const saved = await saveTikTokConnection(token);

    return NextResponse.json({
      ok: true,
      message: "TikTok Token wurde aktualisiert.",
      connection: {
        platform: saved.platform,
        external_account_id: saved.external_account_id,
        account_name: saved.account_name,
        scope: saved.scope,
        expires_at: saved.expires_at,
        refresh_expires_at: saved.refresh_expires_at,
        updated_at: saved.updated_at,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "TikTok Token konnte nicht aktualisiert werden.",
      },
      { status: 500 }
    );
  }
}
