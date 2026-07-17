import {
  processPartnerMonthlyReports,
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

function isAuthorized(
  request: NextRequest,
) {
  const cronSecret =
    process.env.CRON_SECRET || "";

  const querySecret =
    request.nextUrl.searchParams.get(
      "secret",
    ) || "";

  const authorization =
    request.headers.get(
      "authorization",
    ) || "";

  const cronHeader =
    request.headers.get(
      "x-vercel-cron",
    ) || "";

  if (
    cronHeader === "1" ||
    cronHeader.toLowerCase() === "true"
  ) {
    return true;
  }

  if (!cronSecret) {
    return false;
  }

  return (
    querySecret === cronSecret ||
    authorization ===
      `Bearer ${cronSecret}`
  );
}

export async function GET(
  request: NextRequest,
) {
  if (!isAuthorized(request)) {
    return noStoreJson(
      {
        ok: false,
        message: "Nicht autorisiert.",
      },
      401,
    );
  }

  try {
    const nowValue =
      request.nextUrl.searchParams.get(
        "now",
      );

    const now = nowValue
      ? new Date(nowValue)
      : new Date();

    if (Number.isNaN(now.getTime())) {
      return noStoreJson(
        {
          ok: false,
          message:
            "Der now-Parameter ist ungültig.",
        },
        400,
      );
    }

    const period =
      request.nextUrl.searchParams.get(
        "period",
      );

    const partnerId =
      request.nextUrl.searchParams.get(
        "partner_id",
      );

    const force =
      request.nextUrl.searchParams.get(
        "force",
      ) === "true";

    const result =
      await processPartnerMonthlyReports({
        mode: "send",
        requestedBy: "cron",
        period,
        partnerId,
        now,
        force,
      });

    return noStoreJson(
      {
        ...result,
        message:
          "Automatischer Partner-Monatsbericht wurde verarbeitet.",
      },
      result.ok ? 200 : 500,
    );
  } catch (error) {
    console.error(
      "[Partner monthly report cron] Fehler",
      error,
    );

    return noStoreJson(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Der automatische Partner-Monatsbericht konnte nicht verarbeitet werden.",
      },
      500,
    );
  }
}