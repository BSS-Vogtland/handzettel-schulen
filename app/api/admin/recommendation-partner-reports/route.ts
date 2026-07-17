import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import {
  processPartnerMonthlyReports,
  type PartnerMonthlyReportMode,
} from "@/app/lib/recommendations/partnerMonthlyReportService";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function noStoreJson(
  body: Record<string, unknown>,
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control":
        "no-store, max-age=0",
    },
  });
}

export async function POST(
  request: NextRequest,
) {
  const unauthorized =
    await requireAdminApiSession();

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const body = (await request
      .json()
      .catch(() => ({}))) as Record<
      string,
      unknown
    >;

    const mode: PartnerMonthlyReportMode =
      body.mode === "send"
        ? "send"
        : "dry_run";

    const now =
      typeof body.now === "string" &&
      body.now.trim()
        ? new Date(body.now)
        : new Date();

    if (Number.isNaN(now.getTime())) {
      return noStoreJson(
        {
          ok: false,
          message:
            "Der angegebene Ausführungszeitpunkt ist ungültig.",
        },
        400,
      );
    }

    const result =
      await processPartnerMonthlyReports({
        mode,
        requestedBy: "admin",
        projectKey:
          typeof body.projectKey ===
            "string" &&
          body.projectKey.trim()
            ? body.projectKey
            : undefined,
        partnerId:
          typeof body.partnerId ===
            "string" &&
          body.partnerId.trim()
            ? body.partnerId
            : null,
        period:
          typeof body.period ===
            "string" &&
          body.period.trim()
            ? body.period
            : null,
        now,
        force: body.force === true,
      });

    return noStoreJson(
      {
        ...result,
        message:
          mode === "dry_run"
            ? "Dry-Run des Partner-Monatsberichts abgeschlossen."
            : "Versandlauf des Partner-Monatsberichts abgeschlossen.",
      },
      result.ok ? 200 : 500,
    );
  } catch (error) {
    console.error(
      "[Partner monthly report admin API] Fehler",
      error,
    );

    return noStoreJson(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Der Partner-Monatsbericht konnte nicht verarbeitet werden.",
      },
      500,
    );
  }
}