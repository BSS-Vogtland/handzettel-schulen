import type { SupabaseClient } from "@supabase/supabase-js";

export type DiscountType = "percent" | "fixed_amount";
export type DiscountAppliesTo = "all" | "shop" | "school_package";

export type DiscountCampaignRecord = {
  id: string;
  name: string;
  description: string | null;
  discount_type: DiscountType;
  discount_value: number;
  starts_at: string | null;
  ends_at: string | null;
  applies_to: DiscountAppliesTo;
  is_active: boolean;
  minimum_order_amount: number | null;
  max_discount_amount: number | null;
  created_at: string;
  updated_at: string;
};

export type AppliedDiscountResult = {
  campaignId: string | null;
  discountName: string | null;
  discountType: DiscountType | null;
  discountValue: number | null;
  discountAmount: number;
  campaign: DiscountCampaignRecord | null;
};

export type FindActiveDiscountParams = {
  supabase: SupabaseClient;
  appliesTo: Exclude<DiscountAppliesTo, "all">;
  subtotalAmount: number;
  now?: Date;
};

type RawDiscountCampaignRecord = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  discount_type?: unknown;
  discount_value?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
  applies_to?: unknown;
  is_active?: unknown;
  minimum_order_amount?: unknown;
  max_discount_amount?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

function toNumber(value: unknown, fallback = 0) {
  const numericValue =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").replace(",", ".").trim());

  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const numericValue = toNumber(value, Number.NaN);

  return Number.isFinite(numericValue) ? numericValue : null;
}

function toNullableString(value: unknown) {
  if (typeof value !== "string") return null;

  return value;
}

function toRequiredString(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;

  return value;
}

function isDiscountType(value: unknown): value is DiscountType {
  return value === "percent" || value === "fixed_amount";
}

function isDiscountAppliesTo(value: unknown): value is DiscountAppliesTo {
  return value === "all" || value === "shop" || value === "school_package";
}

function normalizeDiscountCampaignRecord(
  record: RawDiscountCampaignRecord
): DiscountCampaignRecord | null {
  if (!record || typeof record !== "object") return null;

  const id = toRequiredString(record.id);
  const name = toRequiredString(record.name);
  const discountType = record.discount_type;
  const appliesTo = record.applies_to;

  if (!id || !name) return null;
  if (!isDiscountType(discountType)) return null;
  if (!isDiscountAppliesTo(appliesTo)) return null;

  return {
    id,
    name,
    description: toNullableString(record.description),
    discount_type: discountType,
    discount_value: toNumber(record.discount_value, 0),
    starts_at: toNullableString(record.starts_at),
    ends_at: toNullableString(record.ends_at),
    applies_to: appliesTo,
    is_active: Boolean(record.is_active),
    minimum_order_amount: toNullableNumber(record.minimum_order_amount),
    max_discount_amount: toNullableNumber(record.max_discount_amount),
    created_at: toRequiredString(record.created_at),
    updated_at: toRequiredString(record.updated_at),
  };
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isStarted(campaign: DiscountCampaignRecord, now: Date) {
  if (!campaign.starts_at) return true;

  const startsAt = new Date(campaign.starts_at).getTime();

  if (!Number.isFinite(startsAt)) return true;

  return startsAt <= now.getTime();
}

function isNotEnded(campaign: DiscountCampaignRecord, now: Date) {
  if (!campaign.ends_at) return true;

  const endsAt = new Date(campaign.ends_at).getTime();

  if (!Number.isFinite(endsAt)) return true;

  return endsAt >= now.getTime();
}

function appliesToTarget(
  campaign: DiscountCampaignRecord,
  appliesTo: Exclude<DiscountAppliesTo, "all">
) {
  return campaign.applies_to === "all" || campaign.applies_to === appliesTo;
}

function meetsMinimumOrderAmount(
  campaign: DiscountCampaignRecord,
  subtotalAmount: number
) {
  if (campaign.minimum_order_amount === null) {
    return true;
  }

  return subtotalAmount >= campaign.minimum_order_amount;
}

export function calculateDiscountAmount(params: {
  subtotalAmount: number;
  discountType: DiscountType;
  discountValue: number;
  maxDiscountAmount?: number | null;
}) {
  const subtotalAmount = roundMoney(Math.max(0, params.subtotalAmount));
  const discountValue = roundMoney(Math.max(0, params.discountValue));

  if (subtotalAmount <= 0 || discountValue <= 0) {
    return 0;
  }

  let discountAmount = 0;

  if (params.discountType === "percent") {
    discountAmount = roundMoney(subtotalAmount * (discountValue / 100));
  } else {
    discountAmount = discountValue;
  }

  if (params.maxDiscountAmount !== null && params.maxDiscountAmount !== undefined) {
    const maxDiscountAmount = roundMoney(Math.max(0, params.maxDiscountAmount));

    if (maxDiscountAmount > 0) {
      discountAmount = Math.min(discountAmount, maxDiscountAmount);
    }
  }

  return roundMoney(Math.min(subtotalAmount, Math.max(0, discountAmount)));
}

export function buildEmptyDiscountResult(): AppliedDiscountResult {
  return {
    campaignId: null,
    discountName: null,
    discountType: null,
    discountValue: null,
    discountAmount: 0,
    campaign: null,
  };
}

export function applyDiscountCampaign(params: {
  campaign: DiscountCampaignRecord | null;
  subtotalAmount: number;
  appliesTo: Exclude<DiscountAppliesTo, "all">;
  now?: Date;
}): AppliedDiscountResult {
  const { campaign, subtotalAmount, appliesTo } = params;
  const now = params.now ?? new Date();

  if (!campaign) {
    return buildEmptyDiscountResult();
  }

  if (!campaign.is_active) {
    return buildEmptyDiscountResult();
  }

  if (!appliesToTarget(campaign, appliesTo)) {
    return buildEmptyDiscountResult();
  }

  if (!isStarted(campaign, now)) {
    return buildEmptyDiscountResult();
  }

  if (!isNotEnded(campaign, now)) {
    return buildEmptyDiscountResult();
  }

  if (!meetsMinimumOrderAmount(campaign, subtotalAmount)) {
    return buildEmptyDiscountResult();
  }

  const discountAmount = calculateDiscountAmount({
    subtotalAmount,
    discountType: campaign.discount_type,
    discountValue: campaign.discount_value,
    maxDiscountAmount: campaign.max_discount_amount,
  });

  if (discountAmount <= 0) {
    return buildEmptyDiscountResult();
  }

  return {
    campaignId: campaign.id,
    discountName: campaign.name,
    discountType: campaign.discount_type,
    discountValue: campaign.discount_value,
    discountAmount,
    campaign,
  };
}

export async function findActiveDiscountCampaign(
  params: FindActiveDiscountParams
): Promise<AppliedDiscountResult> {
  const { supabase, appliesTo, subtotalAmount } = params;
  const now = params.now ?? new Date();

  if (subtotalAmount <= 0) {
    return buildEmptyDiscountResult();
  }

  const { data, error } = await supabase
    .from("school_discount_campaigns")
    .select(
      [
        "id",
        "name",
        "description",
        "discount_type",
        "discount_value",
        "starts_at",
        "ends_at",
        "applies_to",
        "is_active",
        "minimum_order_amount",
        "max_discount_amount",
        "created_at",
        "updated_at",
      ].join(",")
    )
    .eq("is_active", true)
    .in("applies_to", ["all", appliesTo])
    .or(`starts_at.is.null,starts_at.lte.${now.toISOString()}`)
    .or(`ends_at.is.null,ends_at.gte.${now.toISOString()}`)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("Rabattaktion konnte nicht geladen werden:", error.message);
    return buildEmptyDiscountResult();
  }

  const campaigns = ((data ?? []) as RawDiscountCampaignRecord[])
    .map((record) => normalizeDiscountCampaignRecord(record))
    .filter((campaign): campaign is DiscountCampaignRecord => campaign !== null);

  const matchingCampaign = campaigns.find((campaign) => {
    return (
      campaign.is_active &&
      appliesToTarget(campaign, appliesTo) &&
      isStarted(campaign, now) &&
      isNotEnded(campaign, now) &&
      meetsMinimumOrderAmount(campaign, subtotalAmount)
    );
  });

  return applyDiscountCampaign({
    campaign: matchingCampaign ?? null,
    subtotalAmount,
    appliesTo,
    now,
  });
}