export type RecommendationContextEnvironment = {
  RECOMMENDATION_CONTEXT_SECRET?: string;
};

export function recommendationContextSecret(
  environment?: RecommendationContextEnvironment,
) {
  const secret = (
    environment === undefined
      ? process.env.RECOMMENDATION_CONTEXT_SECRET
      : environment.RECOMMENDATION_CONTEXT_SECRET
  )?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("Der Recommendation-Kontext ist nicht sicher konfiguriert.");
  }
  return secret;
}
