import {
  createPartnerPortalAdminAccess,
  PartnerPortalAdminServiceError,
  updatePartnerPortalAdminSettings,
} from "@/app/lib/recommendations/partnerPortalAdminService";
import { PartnerPortalServiceError } from "@/app/lib/recommendations/partnerPortalService";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function noStoreJson(
  body: Record<string, unknown>,
  status: number,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

function errorResponse(error: unknown) {
  if (
    error instanceof
      PartnerPortalAdminServiceError ||
    error instanceof PartnerPortalServiceError
  ) {
    return noStoreJson(
      {
        ok: false,
        message: error.message,
      },
      error.status,
    );
  }

  console.error(
    "[Partner portal admin API] Aktion fehlgeschlagen",
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

  return noStoreJson(
    {
      ok: false,
      message:
        "Die Partnerportal-Einstellungen konnten nicht verarbeitet werden.",
    },
    500,
  );
}

async function readBody(request: NextRequest) {
  try {
    const value: unknown = await request.json();

    return value !== null &&
      typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    throw new PartnerPortalAdminServiceError(
      "VALIDATION",
      "Die übermittelten Daten sind ungültig.",
      400,
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;
    const body = await readBody(request);

    const projectKey =
      typeof body.projectKey === "string"
        ? body.projectKey
        : undefined;

    const settings =
      await updatePartnerPortalAdminSettings(
        id,
        {
          contactName:
            typeof body.contactName === "string"
              ? body.contactName
              : body.contactName === null
                ? null
                : undefined,
          contactEmail:
            typeof body.contactEmail === "string"
              ? body.contactEmail
              : body.contactEmail === null
                ? null
                : undefined,
          partnerPortalEnabled:
            typeof body.partnerPortalEnabled ===
            "boolean"
              ? body.partnerPortalEnabled
              : undefined,
          reportFrequency:
            body.reportFrequency === "disabled" ||
            body.reportFrequency === "weekly" ||
            body.reportFrequency === "monthly"
              ? body.reportFrequency
              : undefined,
        },
        projectKey,
      );

    return noStoreJson(
      {
        ok: true,
        message:
          "Die Partnerportal-Einstellungen wurden gespeichert.",
        settings,
      },
      200,
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;
    const body = await readBody(request);

    const projectKey =
      typeof body.projectKey === "string"
        ? body.projectKey
        : undefined;

    const result =
      await createPartnerPortalAdminAccess(
        id,
        {
          label:
            typeof body.label === "string"
              ? body.label
              : body.label === null
                ? null
                : undefined,
          expiresAt:
            typeof body.expiresAt === "string"
              ? body.expiresAt
              : body.expiresAt === null
                ? null
                : undefined,
          deactivateExisting:
            body.deactivateExisting === true,
        },
        projectKey,
      );

    return noStoreJson(
      {
        ok: true,
        message:
          "Der neue Partnerzugang wurde erstellt.",
        access: result,
      },
      201,
    );
  } catch (error) {
    return errorResponse(error);
  }
}