export type RecommendationUrlValidationResult =
  | { ok: true; normalizedUrl: string }
  | { ok: false; message: string };

/**
 * Validates a browser redirect destination. A successful result is not permission
 * to fetch the URL from the server; doing so would require separate SSRF defenses.
 */
export function validateRecommendationTargetUrl(
  value: unknown,
): RecommendationUrlValidationResult {
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, message: "Bitte eine Ziel-URL angeben." };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(value.trim());
  } catch {
    return { ok: false, message: "Die Ziel-URL ist ungültig." };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return { ok: false, message: "Die Ziel-URL muss HTTP oder HTTPS verwenden." };
  }

  if (!parsedUrl.hostname) {
    return { ok: false, message: "Die Ziel-URL benötigt einen Hostnamen." };
  }

  if (parsedUrl.username || parsedUrl.password) {
    return { ok: false, message: "Zugangsdaten sind in der Ziel-URL nicht erlaubt." };
  }

  return { ok: true, normalizedUrl: parsedUrl.toString() };
}
