import { NextResponse } from "next/server";
import { getMetaConfigStatus, verifyMetaConnection } from "@/lib/social/metaPublishing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const live = url.searchParams.get("live") === "1";

    if (live) {
      const verification = await verifyMetaConnection();
      return NextResponse.json({
        ok: true,
        mode: "live",
        ...verification,
      });
    }

    return NextResponse.json({
      ok: true,
      mode: "config_only",
      configured: getMetaConfigStatus(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Meta-Konfiguration konnte nicht geprüft werden.",
      },
      { status: 500 }
    );
  }
}
