import { NextResponse } from "next/server";
import {
  getMetaConfigStatus,
  verifyMetaConnection,
} from "@/lib/social/metaPublishing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = getMetaConfigStatus();
    const verification = await verifyMetaConnection();

    return NextResponse.json({
      ok: true,
      message: "Meta-Systemstatus wurde geprüft.",
      checked_at: new Date().toISOString(),
      config,
      verification,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Meta-Systemstatus konnte nicht geprüft werden.",
        checked_at: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
