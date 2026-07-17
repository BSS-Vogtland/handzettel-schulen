import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_COVER_SIZE_BYTES = 12 * 1024 * 1024;

const ALLOWED_EXTERNAL_COVER_HOSTS = [
  "books.google.com",
  "books.google.de",
  "books.googleusercontent.com",
  "googleusercontent.com",
  "upload.wikimedia.org",
];

function jsonError(message: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      message,
    },
    { status },
  );
}

function cleanString(value: unknown) {
  const cleaned = String(value ?? "").trim();

  return cleaned.length > 0 ? cleaned : null;
}

function isAllowedExternalHost(hostname: string) {
  const normalizedHostname = hostname.toLowerCase();

  return ALLOWED_EXTERNAL_COVER_HOSTS.some((allowedHost) => {
    const normalizedAllowedHost = allowedHost.toLowerCase();

    return (
      normalizedHostname === normalizedAllowedHost ||
      normalizedHostname.endsWith(`.${normalizedAllowedHost}`)
    );
  });
}

async function fetchCover(targetUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);

  try {
    return await fetch(targetUrl, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
        "User-Agent": "Handzettel-Schulen.de ISBN-Cover-Proxy/2.0",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function imageResponseFromUpstream(response: Response) {
  if (!response.ok) {
    if (response.status === 404 || response.status === 204) {
      return jsonError("Für dieses Buch wurde kein Cover gefunden.", 404);
    }

    if (response.status === 401 || response.status === 403) {
      return jsonError("Die Coverquelle hat den Zugriff abgelehnt.", 502);
    }

    return jsonError(
      `Das Cover konnte nicht geladen werden (Quelle: HTTP ${response.status}).`,
      502,
    );
  }

  let finalUrl: URL;

  try {
    finalUrl = new URL(response.url);
  } catch {
    return jsonError(
      "Die Coverquelle hat auf eine ungültige URL umgeleitet.",
      502,
    );
  }

  if (
    finalUrl.protocol !== "https:" ||
    !isAllowedExternalHost(finalUrl.hostname)
  ) {
    return jsonError(
      "Die Coverquelle hat auf einen nicht freigegebenen Host umgeleitet.",
      403,
    );
  }

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.toLowerCase().startsWith("image/")) {
    return jsonError("Die Coverquelle hat keine Bilddatei geliefert.", 502);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);

  if (Number.isFinite(contentLength) && contentLength > MAX_COVER_SIZE_BYTES) {
    return jsonError("Die Coverdatei ist größer als 12 MB.", 413);
  }

  const imageBuffer = await response.arrayBuffer();

  if (imageBuffer.byteLength === 0) {
    return jsonError("Die geladene Coverdatei ist leer.", 502);
  }

  if (imageBuffer.byteLength > MAX_COVER_SIZE_BYTES) {
    return jsonError("Die Coverdatei ist größer als 12 MB.", 413);
  }

  return new NextResponse(imageBuffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(imageBuffer.byteLength),
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApiSession();

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const rawUrl = cleanString(request.nextUrl.searchParams.get("url"));

    if (!rawUrl) {
      return jsonError("Es wurde keine Cover-URL übergeben.", 400);
    }

    let targetUrl: URL;

    try {
      targetUrl = new URL(rawUrl);
    } catch {
      return jsonError("Die übergebene Cover-URL ist ungültig.", 400);
    }

    if (targetUrl.protocol !== "https:") {
      return jsonError(
        "Cover dürfen ausschließlich über HTTPS geladen werden.",
        400,
      );
    }

    if (!isAllowedExternalHost(targetUrl.hostname)) {
      return jsonError(
        `Die Coverquelle ${targetUrl.hostname} ist nicht für die automatische Übernahme freigegeben.`,
        403,
      );
    }

    const response = await fetchCover(targetUrl.toString());

    return imageResponseFromUpstream(response);
  } catch (error) {
    console.error("ISBN cover proxy error:", error);

    return jsonError(
      error instanceof Error
        ? error.message
        : "Das Buchcover konnte nicht geladen werden.",
      500,
    );
  }
}
