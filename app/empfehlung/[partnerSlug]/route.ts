import { NextRequest, NextResponse } from "next/server";
import { RECOMMENDATION_REFERRER_POLICY } from "@/app/lib/recommendations/recommendationAttribution";
import { createRecommendationClick } from "@/app/lib/recommendations/recommendationClickService";
import { readRecommendationRedirectContext } from "@/app/lib/recommendations/recommendationRedirectContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFallback(request: NextRequest) {
  const fallback = new URL("/", request.url);
  fallback.searchParams.set("empfehlung", "ungueltig");
  const response = NextResponse.redirect(fallback, 302);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", RECOMMENDATION_REFERRER_POLICY);
  return response;
}

export async function GET(
  request: NextRequest,
  context: RouteContext<"/empfehlung/[partnerSlug]">,
) {
  const { partnerSlug } = await context.params;
  const redirectContext = readRecommendationRedirectContext(
    request.nextUrl.searchParams.get("context"),
  );
  if (!redirectContext || redirectContext.partnerSlug !== partnerSlug) {
    return safeFallback(request);
  }

  try {
    const click = await createRecommendationClick({
      context: redirectContext,
      referrer: request.headers.get("referer"),
      userAgent: request.headers.get("user-agent"),
    });
    const response = NextResponse.redirect(new URL(click.targetUrl), 302);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", RECOMMENDATION_REFERRER_POLICY);
    if (!click.isProbableBot) {
      response.cookies.set({
        name: click.attributionCookieName,
        value: click.clickToken,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: click.attributionMaxAgeSeconds,
        priority: "medium",
      });
    }
    return response;
  } catch {
    return safeFallback(request);
  }
}
