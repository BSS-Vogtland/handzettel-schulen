import { createHash } from "node:crypto";

const ATTRIBUTION_COOKIE_PREFIX = "hds_rec_";
const ATTRIBUTION_COOKIE_HASH_LENGTH = 16;

export const RECOMMENDATION_REFERRER_POLICY = "no-referrer";

export function recommendationAttributionCookieName(
  projectKey: string,
  partnerId: string,
) {
  const hash = createHash("sha256")
    .update(`handzettel-schulen:recommendation-attribution:${projectKey}:${partnerId}`)
    .digest("hex")
    .slice(0, ATTRIBUTION_COOKIE_HASH_LENGTH);

  return `${ATTRIBUTION_COOKIE_PREFIX}${hash}`;
}
