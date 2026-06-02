import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { calculateDiscountAmount, roundMoney } from "../../../lib/discountCampaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DiscountType = "percent" | "fixed_amount";
type AppliesTo = "all" | "shop" | "school_package";

type DiscountCampaignRecord = {
  id: string;
  name: string;
  description: string | null;
  discount_type: DiscountType;
  discount_value: number | string;
  starts_at: string | null;
  ends_at: string | null;
  applies_to: AppliesTo;
  is_active: boolean;
  minimum_order_amount: number | string | null;
  max_discount_amount: number | string | null;
  created_at: string;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase Umgebungsvariablen fehlen. Prüfe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number(String(value).replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSubtotal(value: string | null) {
  const subtotal = toNumber(value, 0);
  return roundMoney(Math.max(0, subtotal));
}

function isDiscountType(value: unknown): value is DiscountType {
  return value === "percent" || value === "fixed_amount";
}

function isAppliesTo(value: unknown): value is AppliesTo {
  return value === "all" || value === "shop" || value === "school_package";
}

function normalizeCampaign(
  record: Record<string, unknown>
): DiscountCampaignRecord | null {
  if (!record.id || typeof record.id !== "string") return null;
  if (!record.name || typeof record.name !== "string") return null;
  if (!isDiscountType(record.discount_type)) return null;
  if (!isAppliesTo(record.applies_to)) return null;

  return {
    id: record.id,
    name: record.name,
    description:
      typeof record.description === "string" ? record.description : null,
    discount_type: record.discount_type,
    discount_value: record.discount_value as number | string,
    starts_at: typeof record.starts_at === "string" ? record.starts_at : null,
    ends_at: typeof record.ends_at === "string" ? record.ends_at : null,
    applies_to: record.applies_to,
    is_active: Boolean(record.is_active),
    minimum_order_amount:
      record.minimum_order_amount === null ||
      record.minimum_order_amount === undefined
        ? null
        : (record.minimum_order_amount as number | string),
    max_discount_amount:
      record.max_discount_amount === null ||
      record.max_discount_amount === undefined
        ? null
        : (record.max_discount_amount as number | string),
    created_at: typeof record.created_at === "string" ? record.created_at : "",
  };
}

function campaignIsCurrentlyValid(campaign: DiscountCampaignRecord, now: Date) {
  if (!campaign.is_active) return false;
  if (campaign.applies_to !== "all" && campaign.applies_to !== "shop") return false;

  if (campaign.starts_at) {
    const startsAt = new Date(campaign.starts_at).getTime();
    if (Number.isFinite(startsAt) && startsAt > now.getTime()) return false;
  }

  if (campaign.ends_at) {
    const endsAt = new Date(campaign.ends_at).getTime();
    if (Number.isFinite(endsAt) && endsAt < now.getTime()) return false;
  }

  return true;
}

export async function GET(request: NextRequest) {
  try {
    const subtotalAmount = normalizeSubtotal(
      request.nextUrl.searchParams.get("subtotal")
    );

    const supabase = getSupabaseAdmin();
    const now = new Date();

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
        ].join(",")
      )
      .eq("is_active", true)
      .in("applies_to", ["all", "shop"])
      .or(`starts_at.is.null,starts_at.lte.${now.toISOString()}`)
      .or(`ends_at.is.null,ends_at.gte.${now.toISOString()}`)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          hasCampaign: false,
          message: error.message,
        },
        { status: 500 }
      );
    }

    const campaigns = ((data ?? []) as unknown as Record<string, unknown>[])
      .map((record) => normalizeCampaign(record))
      .filter((campaign): campaign is DiscountCampaignRecord => {
        return campaign !== null && campaignIsCurrentlyValid(campaign, now);
      });

    const campaign = campaigns[0] ?? null;

    if (!campaign) {
      return NextResponse.json({
        ok: true,
        hasCampaign: false,
        wouldApply: false,
        subtotalAmount,
        minimumOrderAmount: null,
        missingAmount: null,
        discountCampaignId: null,
        discountName: null,
        discountType: null,
        discountValue: null,
        discountAmount: 0,
        totalAfterDiscount: subtotalAmount,
      });
    }

    const minimumOrderAmount =
      campaign.minimum_order_amount === null
        ? null
        : roundMoney(Math.max(0, toNumber(campaign.minimum_order_amount, 0)));

    const maxDiscountAmount =
      campaign.max_discount_amount === null
        ? null
        : roundMoney(Math.max(0, toNumber(campaign.max_discount_amount, 0)));

    const discountValue = roundMoney(
      Math.max(0, toNumber(campaign.discount_value, 0))
    );

    const minimumReached =
      minimumOrderAmount === null || subtotalAmount >= minimumOrderAmount;

    const missingAmount =
      minimumOrderAmount !== null && !minimumReached
        ? roundMoney(Math.max(0, minimumOrderAmount - subtotalAmount))
        : 0;

    const discountAmount = minimumReached
      ? calculateDiscountAmount({
          subtotalAmount,
          discountType: campaign.discount_type,
          discountValue,
          maxDiscountAmount,
        })
      : 0;

    const totalAfterDiscount = roundMoney(
      Math.max(0, subtotalAmount - discountAmount)
    );

    return NextResponse.json({
      ok: true,
      hasCampaign: true,
      wouldApply: minimumReached && discountAmount > 0,
      subtotalAmount,
      minimumOrderAmount,
      missingAmount,
      discountCampaignId: campaign.id,
      discountName: campaign.name,
      discountType: campaign.discount_type,
      discountValue,
      discountAmount,
      totalAfterDiscount,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        hasCampaign: false,
        message:
          error instanceof Error
            ? error.message
            : "Rabattvorschau konnte nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}