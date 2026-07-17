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
  response.headers.set(
    "Referrer-Policy",
    RECOMMENDATION_REFERRER_POLICY,
  );

  return response;
}

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{
      partnerSlug: string;
    }>;
  },
) {
  const { partnerSlug } = await context.params;

  const redirectToken =
    request.nextUrl.searchParams.get("context") ??
    request.nextUrl.searchParams.get("ctx");

  const redirectContext =
    readRecommendationRedirectContext(redirectToken);

  if (!redirectContext) {
    console.error(
      "[Recommendation redirect] Ungültiger oder fehlender Redirect-Kontext",
      {
        partnerSlug,
        hasContextParameter:
          request.nextUrl.searchParams.has("context") ||
          request.nextUrl.searchParams.has("ctx"),
        pathname: request.nextUrl.pathname,
      },
    );

    return safeFallback(request);
  }

  if (redirectContext.partnerSlug !== partnerSlug) {
    console.error(
      "[Recommendation redirect] Partner-Slug stimmt nicht mit dem Kontext überein",
      {
        routePartnerSlug: partnerSlug,
        contextPartnerSlug: redirectContext.partnerSlug,
        partnerId: redirectContext.partnerId,
      },
    );

    return safeFallback(request);
  }

  try {
    const click = await createRecommendationClick({
      context: redirectContext,
      referrer: request.headers.get("referer"),
      userAgent: request.headers.get("user-agent"),
    });

    const response = NextResponse.redirect(
      new URL(click.targetUrl),
      302,
    );

    response.headers.set("Cache-Control", "no-store");
    response.headers.set(
      "Referrer-Policy",
      RECOMMENDATION_REFERRER_POLICY,
    );

    if (!click.isProbableBot) {
      response.cookies.set({
        name: click.attributionCookieName,
        value: click.clickToken,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: click.attributionMaxAgeSeconds,
      });
    }

    return response;
  } catch (error) {
    console.error(
      "[Recommendation redirect] Partnerklick fehlgeschlagen",
      {
        errorName:
          error instanceof Error
            ? error.name
            : "UnknownError",
        errorMessage:
          error instanceof Error
            ? error.message
            : String(error),
        partnerSlug,
        projectKey: redirectContext.projectKey,
        partnerId: redirectContext.partnerId,
        categoryId: redirectContext.categoryId,
        ruleId: redirectContext.ruleId,
        requestId: redirectContext.requestId,
        childId: redirectContext.childId,
        requestItemId: redirectContext.requestItemId,
      },
    );

    return safeFallback(request);
  }
}