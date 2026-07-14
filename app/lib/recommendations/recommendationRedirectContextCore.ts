import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const CONTEXT_VERSION = 1;
const CONTEXT_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const MAX_TOKEN_LENGTH = 4_096;

export type RecommendationRedirectContext = {
  version: 1;
  projectKey: string;
  partnerId: string;
  partnerSlug: string;
  categoryId: string;
  ruleId: string;
  requestId: string;
  childId: string | null;
  requestItemId: string;
  matchedTerm: string;
  expiresAt: number;
};

export type RecommendationRedirectContextInput = Omit<
  RecommendationRedirectContext,
  "version" | "expiresAt"
>;

function contextKey(secret: string) {
  return createHash("sha256")
    .update(`handzettel-schulen:recommendation-context:v${CONTEXT_VERSION}:${secret}`)
    .digest();
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isSlug(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function parseContext(
  value: unknown,
  now: number,
): RecommendationRedirectContext | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<RecommendationRedirectContext>;
  if (
    row.version !== CONTEXT_VERSION
    || typeof row.projectKey !== "string"
    || !row.projectKey.trim()
    || !isUuid(row.partnerId)
    || !isSlug(row.partnerSlug)
    || !isUuid(row.categoryId)
    || !isUuid(row.ruleId)
    || !isUuid(row.requestId)
    || (row.childId !== null && !isUuid(row.childId))
    || !isUuid(row.requestItemId)
    || typeof row.matchedTerm !== "string"
    || row.matchedTerm.length > 250
    || typeof row.expiresAt !== "number"
    || !Number.isSafeInteger(row.expiresAt)
    || now > row.expiresAt
  ) {
    return null;
  }
  return row as RecommendationRedirectContext;
}

export function createRecommendationRedirectContextCore(
  input: RecommendationRedirectContextInput,
  secret: string,
  now = Date.now(),
) {
  const payload: RecommendationRedirectContext = {
    ...input,
    version: CONTEXT_VERSION,
    expiresAt: now + CONTEXT_MAX_AGE_MS,
  };
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", contextKey(secret), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

export function readRecommendationRedirectContextCore(
  token: unknown,
  secret: string,
  now = Date.now(),
) {
  if (
    typeof token !== "string"
    || !token
    || token.length > MAX_TOKEN_LENGTH
    || !/^[A-Za-z0-9_-]+$/.test(token)
  ) {
    return null;
  }
  try {
    const encrypted = Buffer.from(token, "base64url");
    if (encrypted.length <= IV_LENGTH + AUTH_TAG_LENGTH) return null;
    const iv = encrypted.subarray(0, IV_LENGTH);
    const authTag = encrypted.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = encrypted.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv("aes-256-gcm", contextKey(secret), iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    return parseContext(JSON.parse(plaintext), now);
  } catch {
    return null;
  }
}
