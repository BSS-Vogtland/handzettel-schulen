import { randomBytes } from "node:crypto";

export type RecommendationContextEnvironment = {
  RECOMMENDATION_CONTEXT_SECRET?: string;
  NODE_ENV?: string;
};

let developmentSecret: string | null = null;

function recommendationDevelopmentContextSecret() {
  developmentSecret ??= randomBytes(32).toString("base64url");
  return developmentSecret;
}

export function recommendationContextSecret(
  environment?: RecommendationContextEnvironment,
) {
  const source = environment ?? process.env;
  const secret = source.RECOMMENDATION_CONTEXT_SECRET?.trim();
  if (secret && secret.length >= 32) return secret;

  if (source.NODE_ENV !== "production") {
    return recommendationDevelopmentContextSecret();
  }

  if (!secret || secret.length < 32) {
    throw new Error("Der Recommendation-Kontext ist nicht sicher konfiguriert.");
  }

  return secret;
}
