export const RECOMMENDATION_CLICK_QUERY_PARAMETER = "hz_click";
export const RECOMMENDATION_REFERRAL_QUERY_PARAMETER = "hz_ref";

export function validateRecommendationHttpUrl(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    return null;
  }

  try {
    const parsed = new URL(text);

    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function validClickToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_-]{32,}$/.test(value)
  );
}

function validReferralCode(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^HZS-R-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/.test(
      value,
    )
  );
}

export function addRecommendationAttributionToUrl(
  targetUrl: unknown,
  input: {
    clickToken: unknown;
    referralCode: unknown;
  },
) {
  const validatedTargetUrl = validateRecommendationHttpUrl(targetUrl);

  if (
    !validatedTargetUrl ||
    !validClickToken(input.clickToken) ||
    !validReferralCode(input.referralCode)
  ) {
    return null;
  }

  const parsed = new URL(validatedTargetUrl);

  parsed.searchParams.set(
    RECOMMENDATION_CLICK_QUERY_PARAMETER,
    input.clickToken,
  );

  parsed.searchParams.set(
    RECOMMENDATION_REFERRAL_QUERY_PARAMETER,
    input.referralCode,
  );

  return parsed.toString();
}

/**
 * Rückwärtskompatibler Helfer.
 *
 * Neue Klickstrecken sollten addRecommendationAttributionToUrl verwenden,
 * damit neben hz_click auch der kurze Vermittlungscode hz_ref übertragen wird.
 */
export function addRecommendationClickTokenToUrl(
  targetUrl: unknown,
  clickToken: unknown,
) {
  const validatedTargetUrl = validateRecommendationHttpUrl(targetUrl);

  if (!validatedTargetUrl || !validClickToken(clickToken)) {
    return null;
  }

  const parsed = new URL(validatedTargetUrl);

  parsed.searchParams.set(
    RECOMMENDATION_CLICK_QUERY_PARAMETER,
    clickToken,
  );

  return parsed.toString();
}