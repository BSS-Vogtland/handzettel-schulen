import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
﻿import { NextResponse } from "next/server";
import {
  buildPublicConnectionStatus,
  loadStoredTikTokConnection,
  updateTikTokConnectionAccountInfo,
  verifyTikTokUserInfo,
} from "@/lib/social/tiktokOAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const storedConnection = await loadStoredTikTokConnection();
    const publicStatus = buildPublicConnectionStatus({ storedConnection });

    let verification:
      | {
          ok: boolean;
          status?: number;
          error?: unknown;
          payload?: unknown;
          skipped?: boolean;
          reason?: string;
          user?: unknown;
        }
      | null = null;

    if (!publicStatus.activeAccessToken) {
      verification = {
        ok: false,
        skipped: true,
        reason:
          "Noch kein TikTok Access Token vorhanden. Bitte TikTok per OAuth verbinden.",
      };
    } else {
      verification = await verifyTikTokUserInfo(publicStatus.activeAccessToken);

      if (storedConnection && verification.ok) {
        const user =
          typeof verification.user === "object" && verification.user !== null
            ? (verification.user as {
                open_id?: string;
                display_name?: string;
                avatar_url?: string;
              })
            : null;

        if (user) {
          await updateTikTokConnectionAccountInfo({
            connection: storedConnection,
            user,
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      checked_at: new Date().toISOString(),
      source: publicStatus.source,
      config: publicStatus.config,
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
