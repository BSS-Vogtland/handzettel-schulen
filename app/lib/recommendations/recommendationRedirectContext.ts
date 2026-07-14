import "server-only";

import { recommendationContextSecret } from "@/app/lib/recommendations/recommendationContextSecret";
import {
  createRecommendationRedirectContextCore,
  readRecommendationRedirectContextCore,
  type RecommendationRedirectContext,
  type RecommendationRedirectContextInput,
} from "@/app/lib/recommendations/recommendationRedirectContextCore";

export type { RecommendationRedirectContext };

export function createRecommendationRedirectContext(
  input: RecommendationRedirectContextInput,
) {
  return createRecommendationRedirectContextCore(
    input,
    recommendationContextSecret(),
  );
}

export function readRecommendationRedirectContext(token: unknown) {
  try {
    return readRecommendationRedirectContextCore(
      token,
      recommendationContextSecret(),
    );
  } catch {
    return null;
  }
}
