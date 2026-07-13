import { slugifyProductText } from "@/app/lib/productSeo";

export type RecommendationSlugNormalizationResult =
  | { ok: true; slug: string }
  | { ok: false; message: string };

export function normalizeRecommendationText(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function normalizeRecommendationSlug(
  value: unknown,
): RecommendationSlugNormalizationResult {
  const normalizedText = normalizeRecommendationText(value);
  if (!normalizedText) {
    return { ok: false, message: "Bitte einen Namen oder Slug angeben." };
  }

  const slug = slugifyProductText(normalizedText);
  if (!slug) {
    return { ok: false, message: "Aus dem Wert konnte kein gültiger Slug erzeugt werden." };
  }

  return { ok: true, slug };
}
