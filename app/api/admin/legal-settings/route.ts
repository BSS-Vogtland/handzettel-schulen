import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { NextResponse } from "next/server";
import {
  getLegalSettings,
  updateLegalSettings,
  type LegalSettingsUpdateInput,
} from "@/lib/legal-settings";

export const runtime = "nodejs";

export async function GET() {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const settings = await getLegalSettings();

    return NextResponse.json({
      ok: true,
      settings,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Rechtliche Einstellungen konnten nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const payload = (await request.json()) as LegalSettingsUpdateInput;

    const settings = await updateLegalSettings(payload);

    return NextResponse.json({
      ok: true,
      message: "Rechtliche Einstellungen wurden gespeichert.",
      settings,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Rechtliche Einstellungen konnten nicht gespeichert werden.",
      },
      { status: 500 }
    );
  }
}