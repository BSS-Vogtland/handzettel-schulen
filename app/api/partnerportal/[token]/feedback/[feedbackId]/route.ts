import { NextRequest, NextResponse } from "next/server";
import {
  PartnerPortalServiceError,
  updatePartnerReferralFeedback,
} from "@/app/lib/recommendations/partnerPortalService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PartnerPortalFeedbackRouteContext = {
  params: Promise<{
    token: string;
    feedbackId: string;
  }>;
};

export async function PATCH(
  request: NextRequest,
  context: PartnerPortalFeedbackRouteContext,
) {
  try {
    const { token, feedbackId } =
      await context.params;

    if (
      !token ||
      token.length > 200 ||
      !feedbackId
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Der Partnerzugang oder die Vermittlung ist ungültig.",
        },
        {
          status: 400,
          headers: {
            "Cache-Control":
              "no-store, max-age=0",
          },
        },
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Die übermittelten Daten sind ungültig.",
        },
        {
          status: 400,
          headers: {
            "Cache-Control":
              "no-store, max-age=0",
          },
        },
      );
    }

    const referral =
      await updatePartnerReferralFeedback(
        token,
        feedbackId,
        body as {
          status:
            | "open"
            | "ordered"
            | "not_ordered"
            | "cancelled";
          externalOrderReference?:
            | string
            | null;
          orderDate?: string | null;
          grossRevenue?:
            | number
            | string
            | null;
          currency?: string | null;
          partnerNote?: string | null;
        },
      );

    return NextResponse.json(
      {
        ok: true,
        message:
          "Die Rückmeldung wurde gespeichert.",
        referral,
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    if (
      error instanceof PartnerPortalServiceError
    ) {
      return NextResponse.json(
        {
          ok: false,
          message: error.message,
        },
        {
          status: error.status,
          headers: {
            "Cache-Control":
              "no-store, max-age=0",
          },
        },
      );
    }

    console.error(
      "[Partner portal API] Rückmeldung konnte nicht gespeichert werden",
      {
        errorName:
          error instanceof Error
            ? error.name
            : "UnknownError",
        errorMessage:
          error instanceof Error
            ? error.message
            : "Unbekannter Fehler",
      },
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "Die Rückmeldung konnte nicht gespeichert werden.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control":
            "no-store, max-age=0",
        },
      },
    );
  }
}