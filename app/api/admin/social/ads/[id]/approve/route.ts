import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ApprovalPayload = {
  approved_by_name?: string;
  approved_by_email?: string | null;
  confirmation_text?: string;
};

type CampaignRow = {
  id: string;
  status: string;
  platform: string;
  objective: string;
  campaign_name: string;
  ad_headline: string | null;
  ad_text: string | null;
  landing_page_url: string | null;
  target_location: string | null;
  target_audience_description: string | null;
  daily_budget_cents: number | null;
  lifetime_budget_cents: number | null;
  currency: string;
  start_at: string | null;
  end_at: string | null;
};

const REQUIRED_CONFIRMATION = "ICH BESTÄTIGE DAS WERBEBUDGET";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function cleanString(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function cleanNullableString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatEuro(cents: number | null) {
  if (!cents) return "nicht festgelegt";

  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function buildApprovalText(campaign: CampaignRow) {
  return [
    `Ich bestätige die Freigabe der Werbekampagne "${campaign.campaign_name}".`,
    `Plattform: ${campaign.platform}.`,
    `Ziel: ${campaign.objective}.`,
    `Tagesbudget: ${formatEuro(campaign.daily_budget_cents)}.`,
    `Gesamtbudget: ${formatEuro(campaign.lifetime_budget_cents)}.`,
    `Mir ist bewusst, dass eine spätere API-Anbindung auf Grundlage dieser Freigabe Werbebudget beim verbundenen Werbekonto ausgeben darf.`,
  ].join(" ");
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;

    if (!id || !isUuid(id)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Ungültige Kampagnen-ID.",
        },
        { status: 400 }
      );
    }

    const payload = (await request.json()) as ApprovalPayload;

    const approvedByName = cleanString(payload.approved_by_name);
    const approvedByEmail = cleanNullableString(payload.approved_by_email);
    const confirmationText = cleanString(payload.confirmation_text);

    if (!approvedByName) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte gib den Namen der freigebenden Person ein.",
        },
        { status: 400 }
      );
    }

    if (confirmationText !== REQUIRED_CONFIRMATION) {
      return NextResponse.json(
        {
          ok: false,
          message: `Bitte bestätige exakt mit: ${REQUIRED_CONFIRMATION}`,
        },
        { status: 400 }
      );
    }

    const { data: campaignData, error: campaignError } = await supabaseServer
      .from("social_ad_campaigns")
      .select("*")
      .eq("id", id)
      .single();

    if (campaignError || !campaignData) {
      return NextResponse.json(
        {
          ok: false,
          message: campaignError?.message || "Kampagne wurde nicht gefunden.",
        },
        { status: 404 }
      );
    }

    const campaign = campaignData as CampaignRow;

    if (campaign.status === "approved" || campaign.status === "launched") {
      return NextResponse.json(
        {
          ok: false,
          message: "Diese Kampagne wurde bereits freigegeben oder gestartet.",
        },
        { status: 400 }
      );
    }

    const approvalText = buildApprovalText(campaign);

    const { error: approvalError } = await supabaseServer
      .from("social_ad_approvals")
      .insert({
        campaign_id: id,
        approved_by_name: approvedByName,
        approved_by_email: approvedByEmail,
        approved_daily_budget_cents: campaign.daily_budget_cents,
        approved_lifetime_budget_cents: campaign.lifetime_budget_cents,
        approved_currency: campaign.currency || "EUR",
        approval_text: approvalText,
        confirmation_text: confirmationText,
        approval_snapshot: {
          campaign_id: campaign.id,
          campaign_name: campaign.campaign_name,
          platform: campaign.platform,
          objective: campaign.objective,
          ad_headline: campaign.ad_headline,
          ad_text: campaign.ad_text,
          landing_page_url: campaign.landing_page_url,
          target_location: campaign.target_location,
          target_audience_description: campaign.target_audience_description,
          daily_budget_cents: campaign.daily_budget_cents,
          lifetime_budget_cents: campaign.lifetime_budget_cents,
          currency: campaign.currency,
          start_at: campaign.start_at,
          end_at: campaign.end_at,
        },
      });

    if (approvalError) {
      return NextResponse.json(
        {
          ok: false,
          message: approvalError.message,
        },
        { status: 500 }
      );
    }

    const { data: updatedCampaign, error: updateError } = await supabaseServer
      .from("social_ad_campaigns")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by_name: approvedByName,
        approved_by_email: approvedByEmail,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json(
        {
          ok: false,
          message: updateError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Werbekampagne wurde freigegeben.",
      campaign: updatedCampaign,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler bei der Kampagnenfreigabe.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    );
  }
}