import {
  deactivatePartnerPortalAdminAccess,
  PartnerPortalAdminServiceError,
} from "@/app/lib/recommendations/partnerPortalAdminService";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
    accessId: string;
  }>;
};

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id, accessId } = await context.params;

    const projectKey =
      request.nextUrl.searchParams.get("project_key") ??
      undefined;

    const result =
      await deactivatePartnerPortalAdminAccess(
        id,
        accessId,
        projectKey,
      );

    return NextResponse.json(
      {
        ...result,
        message:
          "Der Partnerzugang wurde deaktiviert.",
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    if (
      error instanceof
      PartnerPortalAdminServiceError
    ) {
      return NextResponse.json(
        {
          ok: false,
          message: error.message,
        },
        {
          status: error.status,
          headers: {
            "Cache-Control": "no-store, max-age=0",
          },
        },
      );
    }

    console.error(
      "[Partner portal admin API] Zugang konnte nicht deaktiviert werden",
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
          "Der Partnerzugang konnte nicht deaktiviert werden.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }
}