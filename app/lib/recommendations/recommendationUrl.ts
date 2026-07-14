export const RECOMMENDATION_CLICK_QUERY_PARAMETER = "hz_click";

export function validateRecommendationHttpUrl(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  try {
    const parsed = new URL(text);
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:")
      || !parsed.hostname
      || parsed.username
      || parsed.password
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function addRecommendationClickTokenToUrl(
  targetUrl: unknown,
  clickToken: unknown,
) {
  const validatedTargetUrl = validateRecommendationHttpUrl(targetUrl);
  if (
    !validatedTargetUrl
    || typeof clickToken !== "string"
    || !/^[A-Za-z0-9_-]{32,}$/.test(clickToken)
  ) {
    return null;
  }

  const parsed = new URL(validatedTargetUrl);
  parsed.searchParams.set(RECOMMENDATION_CLICK_QUERY_PARAMETER, clickToken);
  return parsed.toString();
}
