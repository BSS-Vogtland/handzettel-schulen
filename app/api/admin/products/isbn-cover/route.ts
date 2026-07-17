import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_SIZE_BYTES = 12 * 1024 * 1024;

const DEFAULT_ALLOWED_HOSTS = [
  "books.google.com",
  "books.google.de",
  "googleusercontent.com",
  "openlibrary.org",
  "covers.openlibrary.org",
  "cornelsen.de",
  "vlb.de",
  "buchhandel.de",
];

function cleanString(value: unknown): string | null {
  const cleaned = String(value ?? "").trim();

  return cleaned.length > 0 ? cleaned : null;
}

function normalizeIsbn(value: unknown): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^0-9X]/g, "")
    .slice(0, 13);
}

function getConfiguredAllowedHosts(): string[] {
  const configuredHosts = String(
    process.env.ISBN_COVER_ALLOWED_HOSTS || ""
  )
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  return Array.from(
    new Set([...DEFAULT_ALLOWED_HOSTS, ...configuredHosts])
  );
}

function isAllowedHostname(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase();

  return getConfiguredAllowedHosts().some((allowedHost) => {
    return (
      normalizedHostname === allowedHost ||
      normalizedHostname.endsWith(`.${allowedHost}`)
    );
  });
}

function getImageExtension(contentType: string): string {
  const normalized = contentType.toLowerCase();

  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("avif")) return "avif";
  if (normalized.includes("gif")) return "gif";

  return "jpg";
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();

    if (!text) {
      return "";
    }

    try {
      const payload = JSON.parse(text) as {
        message?: string;
      };

      return payload.message || text;
    } catch {
      return text;
    }
  } catch {
    return "";
  }
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApiSession();

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const sourceUrl = cleanString(
      request.nextUrl.searchParams.get("url")
    );

    const isbn =
      normalizeIsbn(request.nextUrl.searchParams.get("isbn")) ||
      "buch";

    if (!sourceUrl) {
      return NextResponse.json(
        {
          ok: false,
          message: "Es wurde keine Cover-URL übergeben.",
        },
        { status: 400 }
      );
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(sourceUrl);
    } catch {
      return NextResponse.json(
        {
          ok: false,
          message: "Die übergebene Cover-URL ist ungültig.",
        },
        { status: 400 }
      );
    }

    if (parsedUrl.protocol !== "https:") {
      return NextResponse.json(
        {
          ok: false,
          message: "Cover dürfen nur über HTTPS geladen werden.",
        },
        { status: 400 }
      );
    }

    if (!isAllowedHostname(parsedUrl.hostname)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            `Der Cover-Host „${parsedUrl.hostname}“ ist nicht freigegeben. ` +
            "Ergänze ihn bei Bedarf in ISBN_COVER_ALLOWED_HOSTS.",
        },
        { status: 400 }
      );
    }

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 15000);

    let externalResponse: Response;

    try {
      externalResponse = await fetch(parsedUrl.toString(), {
        method: "GET",
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          Accept:
            "image/avif,image/webp,image/png,image/jpeg,image/*",
          "User-Agent":
            "Handzettel-Schulen.de ISBN-Cover-Import/1.0",
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!externalResponse.ok) {
      const externalMessage =
        await readErrorMessage(externalResponse);

      return NextResponse.json(
        {
          ok: false,
          message:
            `Das Cover konnte nicht geladen werden. HTTP ${externalResponse.status}.` +
            (externalMessage
              ? ` Antwort: ${externalMessage.slice(0, 300)}`
              : ""),
        },
        { status: 502 }
      );
    }

    const contentType = String(
      externalResponse.headers.get("content-type") || ""
    )
      .split(";")[0]
      .trim()
      .toLowerCase();

    if (!contentType.startsWith("image/")) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Die externe Adresse hat keine Bilddatei geliefert.",
        },
        { status: 502 }
      );
    }

    const declaredLength = Number(
      externalResponse.headers.get("content-length") || 0
    );

    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_IMAGE_SIZE_BYTES
    ) {
      return NextResponse.json(
        {
          ok: false,
          message: "Das gefundene Cover ist größer als 12 MB.",
        },
        { status: 413 }
      );
    }

    const arrayBuffer =
      await externalResponse.arrayBuffer();

    if (arrayBuffer.byteLength === 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "Die geladene Coverdatei ist leer.",
        },
        { status: 502 }
      );
    }

    if (arrayBuffer.byteLength > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json(
        {
          ok: false,
          message: "Das gefundene Cover ist größer als 12 MB.",
        },
        { status: 413 }
      );
    }

    const extension = getImageExtension(contentType);

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(arrayBuffer.byteLength),
        "Content-Disposition":
          `inline; filename="isbn-${isbn}.${extension}"`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("ISBN cover download error:", error);

    const isAbortError =
      error instanceof Error &&
      error.name === "AbortError";

    return NextResponse.json(
      {
        ok: false,
        message: isAbortError
          ? "Das Laden des Covers hat zu lange gedauert."
          : error instanceof Error
            ? error.message
            : "Das Cover konnte nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}