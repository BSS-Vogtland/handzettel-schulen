import "server-only";

import { randomBytes } from "node:crypto";
import { recommendationAttributionCookieName } from "@/app/lib/recommendations/recommendationAttribution";
import type { RecommendationRedirectContext } from "@/app/lib/recommendations/recommendationRedirectContext";
import {
  addRecommendationAttributionToUrl,
  validateRecommendationHttpUrl,
} from "@/app/lib/recommendations/recommendationUrl";
import {
  DEFAULT_RECOMMENDATION_PROJECT_KEY,
  getRecommendationAdminClient,
  isRecommendationUuid,
  recommendationProjectKey,
  recommendationSearch,
} from "@/app/lib/recommendations/serviceSupport";

const CLOSED_REQUEST_STATUSES = new Set([
  "archived",
  "confirmed",
  "completed",
  "complete",
  "ordered",
  "order_completed",
  "checkout_completed",
]);

const EXCLUDED_ITEM_STATUSES = new Set([
  "covered_by_alternative",
  "not_needed",
  "resolved",
  "done",
  "ignored",
]);

export class RecommendationClickServiceError extends Error {
  constructor(message = "Die Partnerempfehlung ist nicht mehr verfügbar.") {
    super(message);
    this.name = "RecommendationClickServiceError";
  }
}

export type RecommendationClickAdminRow = {
  id: string;
  clickToken: string;
  referralCode: string;
  partnerId: string | null;
  categoryId: string | null;
  ruleId: string | null;
  requestId: string | null;
  childId: string | null;
  requestItemId: string | null;
  partnerCode: string;
  partnerName: string;
  categoryName: string;
  matchedTerm: string | null;
  clickedAt: string;
  attributionExpiresAt: string;
  referrerOrigin: string | null;
  isProbableBot: boolean;
};

export type RecommendationClickListOptions = {
  projectKey?: string;
  search?: string;
  partnerId?: string;
  categoryId?: string;
  bot?: "all" | "human" | "bot";
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
};

function status(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function requiredString(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new RecommendationClickServiceError();
  }

  return value.trim();
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function requiredReferralCode(value: unknown) {
  const referralCode = requiredString(value);

  if (
    !/^HZS-R-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/.test(
      referralCode,
    )
  ) {
    throw new RecommendationClickServiceError();
  }

  return referralCode;
}

function safeReferrerOrigin(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }

    return url.origin.slice(0, 500);
  } catch {
    return null;
  }
}

function probableBot(userAgent: string | null) {
  return /bot|crawler|spider|slurp|headless|preview|facebookexternalhit|whatsapp|telegram|discordbot|bingpreview/i.test(
    userAgent || "",
  );
}

function closedRequest(row: Record<string, unknown>) {
  return (
    row.is_active === false ||
    Boolean(row.archived_at) ||
    CLOSED_REQUEST_STATUSES.has(status(row.status)) ||
    CLOSED_REQUEST_STATUSES.has(status(row.offer_status))
  );
}

function excludedItem(row: Record<string, unknown>) {
  return (
    EXCLUDED_ITEM_STATUSES.has(status(row.status)) ||
    EXCLUDED_ITEM_STATUSES.has(status(row.admin_resolution_status))
  );
}

export async function createRecommendationClick(input: {
  context: RecommendationRedirectContext;
  referrer: string | null;
  userAgent: string | null;
}) {
  const { context } = input;
  const supabase = getRecommendationAdminClient();

  const childQuery = context.childId
    ? supabase
        .from("school_request_children")
        .select("id,request_id,is_active")
        .eq("id", context.childId)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [
    partnerResult,
    categoryResult,
    ruleResult,
    linkResult,
    requestResult,
    itemResult,
    offerResult,
    childResult,
  ] = await Promise.all([
    supabase
      .from("recommendation_partners")
      .select(
        "id,project_key,partner_code,name,slug,target_url,active,attribution_days",
      )
      .eq("id", context.partnerId)
      .eq("project_key", context.projectKey)
      .eq("slug", context.partnerSlug)
      .maybeSingle(),

    supabase
      .from("recommendation_partner_categories")
      .select("id,project_key,name,active")
      .eq("id", context.categoryId)
      .eq("project_key", context.projectKey)
      .maybeSingle(),

    supabase
      .from("recommendation_rules")
      .select("id,project_key,category_id,active")
      .eq("id", context.ruleId)
      .eq("project_key", context.projectKey)
      .maybeSingle(),

    supabase
      .from("recommendation_partner_category_links")
      .select("partner_id,category_id,active")
      .eq("project_key", context.projectKey)
      .eq("partner_id", context.partnerId)
      .eq("category_id", context.categoryId)
      .maybeSingle(),

    supabase
      .from("school_requests")
      .select("id,status,offer_status,is_active,archived_at")
      .eq("id", context.requestId)
      .maybeSingle(),

    supabase
      .from("school_request_items")
      .select(
        "id,request_id,child_id,status,admin_resolution_status",
      )
      .eq("id", context.requestItemId)
      .maybeSingle(),

    supabase
      .from("school_offer_items")
      .select("id")
      .eq("request_item_id", context.requestItemId)
      .limit(1)
      .maybeSingle(),

    childQuery,
  ]);

  const results = [
    partnerResult,
    categoryResult,
    ruleResult,
    linkResult,
    requestResult,
    itemResult,
    offerResult,
    childResult,
  ];

  if (results.some((result) => result.error)) {
    throw new RecommendationClickServiceError();
  }

  const partner = record(partnerResult.data);
  const category = record(categoryResult.data);
  const rule = record(ruleResult.data);
  const link = record(linkResult.data);
  const requestRow = record(requestResult.data);
  const item = record(itemResult.data);
  const child = record(childResult.data);

  if (
    partner.active !== true ||
    category.active !== true ||
    rule.active !== true ||
    link.active !== true ||
    rule.category_id !== context.categoryId ||
    item.request_id !== context.requestId ||
    nullableString(item.child_id) !== context.childId ||
    closedRequest(requestRow) ||
    excludedItem(item) ||
    offerResult.data ||
    (
      context.childId &&
      (
        child.request_id !== context.requestId ||
        child.is_active !== true
      )
    )
  ) {
    throw new RecommendationClickServiceError();
  }

  const targetUrl = validateRecommendationHttpUrl(partner.target_url);

  if (!targetUrl) {
    throw new RecommendationClickServiceError();
  }

  const attributionDays = Number(partner.attribution_days);

  if (
    !Number.isInteger(attributionDays) ||
    attributionDays < 1 ||
    attributionDays > 365
  ) {
    throw new RecommendationClickServiceError();
  }

  const clickedAt = new Date();

  const attributionExpiresAt = new Date(
    clickedAt.getTime() +
      attributionDays * 24 * 60 * 60 * 1000,
  );

  const clickToken = randomBytes(24).toString("base64url");

  const userAgent =
    nullableString(input.userAgent)?.slice(0, 512) ?? null;

  const { data: insertedClick, error: insertError } = await supabase
    .from("recommendation_clicks")
    .insert({
      click_token: clickToken,
      project_key: context.projectKey,
      partner_id: context.partnerId,
      category_id: context.categoryId,
      rule_id: context.ruleId,
      request_id: context.requestId,
      child_id: context.childId,
      request_item_id: context.requestItemId,
      partner_code_snapshot: requiredString(partner.partner_code),
      partner_name_snapshot: requiredString(partner.name),
      category_name_snapshot: requiredString(category.name),
      matched_term: context.matchedTerm || null,
      target_url_snapshot: targetUrl,
      clicked_at: clickedAt.toISOString(),
      attribution_expires_at: attributionExpiresAt.toISOString(),
      referrer_origin: safeReferrerOrigin(input.referrer),
      user_agent: userAgent,
      is_probable_bot: probableBot(userAgent),
    })
    .select("id,referral_code")
    .single();

  if (insertError || !insertedClick) {
    console.error("[Recommendation click] Klick konnte nicht gespeichert werden", {
      errorCode: insertError?.code ?? null,
      errorMessage: insertError?.message ?? null,
      partnerId: context.partnerId,
      requestId: context.requestId,
      requestItemId: context.requestItemId,
    });

    throw new RecommendationClickServiceError();
  }

  const referralCode = requiredReferralCode(
    insertedClick.referral_code,
  );

  const redirectUrl = addRecommendationAttributionToUrl(
    targetUrl,
    {
      clickToken,
      referralCode,
    },
  );

  if (!redirectUrl) {
    throw new RecommendationClickServiceError();
  }

  return {
    targetUrl: redirectUrl,
    clickToken,
    referralCode,
    attributionCookieName: recommendationAttributionCookieName(
      context.projectKey,
      context.partnerId,
    ),
    attributionMaxAgeSeconds:
      attributionDays * 24 * 60 * 60,
    isProbableBot: probableBot(userAgent),
  };
}

function dateBoundary(
  value: string | undefined,
  endOfDay: boolean,
) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (endOfDay) {
    date.setUTCDate(date.getUTCDate() + 1);
  }

  return date.toISOString();
}

function normalizeAdminRow(
  value: unknown,
): RecommendationClickAdminRow {
  const row = record(value);

  return {
    id: requiredString(row.id),
    clickToken: requiredString(row.click_token),
    referralCode: requiredReferralCode(row.referral_code),
    partnerId: nullableString(row.partner_id),
    categoryId: nullableString(row.category_id),
    ruleId: nullableString(row.rule_id),
    requestId: nullableString(row.request_id),
    childId: nullableString(row.child_id),
    requestItemId: nullableString(row.request_item_id),
    partnerCode: requiredString(row.partner_code_snapshot),
    partnerName: requiredString(row.partner_name_snapshot),
    categoryName: requiredString(row.category_name_snapshot),
    matchedTerm: nullableString(row.matched_term),
    clickedAt: requiredString(row.clicked_at),
    attributionExpiresAt: requiredString(
      row.attribution_expires_at,
    ),
    referrerOrigin: nullableString(row.referrer_origin),
    isProbableBot: row.is_probable_bot === true,
  };
}

export async function listRecommendationClicks(
  options: RecommendationClickListOptions = {},
) {
  const projectKey = recommendationProjectKey(
    options.projectKey ??
      DEFAULT_RECOMMENDATION_PROJECT_KEY,
  );

  const search = recommendationSearch(options.search);
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const limit = Math.min(
    100,
    Math.max(1, Math.trunc(options.limit ?? 50)),
  );

  if (
    options.partnerId &&
    !isRecommendationUuid(options.partnerId)
  ) {
    throw new RecommendationClickServiceError(
      "Der Partnerfilter ist ungültig.",
    );
  }

  if (
    options.categoryId &&
    !isRecommendationUuid(options.categoryId)
  ) {
    throw new RecommendationClickServiceError(
      "Der Kategoriefilter ist ungültig.",
    );
  }

  const supabase = getRecommendationAdminClient();

  let query = supabase
    .from("recommendation_clicks")
    .select(
      "id,click_token,referral_code,partner_id,category_id,rule_id,request_id,child_id,request_item_id,partner_code_snapshot,partner_name_snapshot,category_name_snapshot,matched_term,clicked_at,attribution_expires_at,referrer_origin,is_probable_bot",
      { count: "exact" },
    )
    .eq("project_key", projectKey);

  if (options.partnerId) {
    query = query.eq("partner_id", options.partnerId);
  }

  if (options.categoryId) {
    query = query.eq("category_id", options.categoryId);
  }

  if (options.bot === "bot") {
    query = query.eq("is_probable_bot", true);
  }

  if (options.bot === "human") {
    query = query.eq("is_probable_bot", false);
  }

  const fromDate = dateBoundary(options.dateFrom, false);
  const toDate = dateBoundary(options.dateTo, true);

  if (fromDate) {
    query = query.gte("clicked_at", fromDate);
  }

  if (toDate) {
    query = query.lt("clicked_at", toDate);
  }

  if (search) {
    query = query.or(
      [
        `partner_name_snapshot.ilike.%${search}%`,
        `partner_code_snapshot.ilike.%${search}%`,
        `category_name_snapshot.ilike.%${search}%`,
        `matched_term.ilike.%${search}%`,
        `click_token.ilike.%${search}%`,
        `referral_code.ilike.%${search}%`,
      ].join(","),
    );
  }

  const from = (page - 1) * limit;

  const { data, error, count } = await query
    .order("clicked_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + limit - 1);

  if (error) {
    throw new RecommendationClickServiceError(
      "Klickdaten konnten nicht geladen werden.",
    );
  }

  return {
    clicks: (data ?? []).map(normalizeAdminRow),
    total: count ?? 0,
    page,
    limit,
  };
}