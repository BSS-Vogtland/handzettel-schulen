import "server-only";

import { createClient } from "@supabase/supabase-js";

export const DEFAULT_RECOMMENDATION_PROJECT_KEY = "handzettel-schulen";
export const RECOMMENDATION_DATABASE_INCOMPLETE_MESSAGE =
  "Die Empfehlungsdatenbank ist noch nicht vollständig eingerichtet.";

export type RecommendationServiceErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "DATABASE_NOT_READY"
  | "DATABASE";

export class RecommendationServiceError extends Error {
  constructor(
    public readonly code: RecommendationServiceErrorCode,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "RecommendationServiceError";
  }
}

export type RecommendationDatabaseError = {
  code?: string;
  message?: string;
  details?: string;
};

export function getRecommendationAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new RecommendationServiceError(
      "DATABASE",
      "Die serverseitige Datenbankverbindung ist nicht konfiguriert.",
      500,
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function recommendationValidationError(message: string): never {
  throw new RecommendationServiceError("VALIDATION", message, 400);
}

export function recommendationNotFoundError(message: string): never {
  throw new RecommendationServiceError("NOT_FOUND", message, 404);
}

export function recommendationConflictError(message: string): never {
  throw new RecommendationServiceError("CONFLICT", message, 409);
}

export function isRecommendationDatabaseIncomplete(
  error: RecommendationDatabaseError,
) {
  return ["42P01", "42703", "PGRST204", "PGRST205"].includes(
    error.code ?? "",
  );
}

export function throwRecommendationDatabaseError(
  error: RecommendationDatabaseError,
  options: { fallback: string; duplicate?: string },
): never {
  console.error("Empfehlungsdatenbankfehler:", {
    code: error.code,
    message: error.message,
    details: error.details,
  });

  if (isRecommendationDatabaseIncomplete(error)) {
    throw new RecommendationServiceError(
      "DATABASE_NOT_READY",
      RECOMMENDATION_DATABASE_INCOMPLETE_MESSAGE,
      500,
    );
  }
  if (error.code === "23505" && options.duplicate) {
    recommendationConflictError(options.duplicate);
  }

  throw new RecommendationServiceError("DATABASE", options.fallback, 500);
}

export function recommendationRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function recommendationHasOwn(
  record: Record<string, unknown>,
  key: string,
) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function recommendationRequiredText(
  value: unknown,
  label: string,
  maxLength = 250,
) {
  if (typeof value !== "string" || !value.trim()) {
    recommendationValidationError(`${label} ist erforderlich.`);
  }
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length > maxLength) {
    recommendationValidationError(
      `${label} darf maximal ${maxLength} Zeichen lang sein.`,
    );
  }
  return text;
}

export function recommendationNullableText(
  value: unknown,
  maxLength = 5000,
) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    recommendationValidationError("Ein Textfeld ist ungültig.");
  }
  const text = value.trim();
  if (!text) return null;
  if (text.length > maxLength) {
    recommendationValidationError(
      `Ein Textfeld darf maximal ${maxLength} Zeichen lang sein.`,
    );
  }
  return text;
}

export function recommendationInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
) {
  const parsed =
    typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    recommendationValidationError(
      `${label} muss zwischen ${minimum} und ${maximum} liegen.`,
    );
  }
  return parsed;
}

export function recommendationBoolean(value: unknown, label: string) {
  if (typeof value !== "boolean") {
    recommendationValidationError(`${label} ist ungültig.`);
  }
  return value;
}

export function recommendationProjectKey(value: unknown) {
  return recommendationRequiredText(
    value ?? DEFAULT_RECOMMENDATION_PROJECT_KEY,
    "Projekt",
    100,
  );
}

export function recommendationSearch(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .slice(0, 100)
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isRecommendationUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

export function assertRecommendationUuid(
  value: unknown,
  label: string,
): asserts value is string {
  if (!isRecommendationUuid(value)) {
    recommendationValidationError(`${label} ist ungültig.`);
  }
}
