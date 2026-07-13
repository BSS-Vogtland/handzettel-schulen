import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

type CampaignRow = {
  id: string;
  project_id: string | null;
  post_id: string | null;
  asset_id: string | null;

  parent_campaign_id: string | null;
  version_number: number | null;

  status: string;
  platform: string;
  objective: string;

  campaign_name: string;
  ad_headline: string | null;
  ad_text: string | null;
  landing_page_url: string | null;

  target_location: string | null;
  target_audience_description: string | null;
  placements: string[] | null;

  daily_budget_cents: number | null;
  lifetime_budget_cents: number | null;
  currency: string;

  start_at: string | null;
  end_at: string | null;

  notes: string | null;
  internal_warning: string | null;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function cleanCampaignBaseName(value: string) {
  return value
    .replace(/\s+[–-]\s+Version\s+\d+$/i, "")
    .replace(/\s+\(Version\s+\d+\)$/i, "")
    .trim();
}

async function getNextVersionNumber(rootCampaignId: string) {
  const { data, error } = await supabaseServer
    .from("social_ad_campaigns")
    .select("version_number")
    .or(`id.eq.${rootCampaignId},parent_campaign_id.eq.${rootCampaignId}`);

  if (error) {
    throw new Error(error.message);
  }

  const numbers = (data || [])
    .map((row) => Number(row.version_number || 1))
    .filter((value) => Number.isFinite(value));

  const maxVersion = numbers.length > 0 ? Math.max(...numbers) : 1;

  return maxVersion + 1;
}

export async function POST(
  _request: Request,
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

    const rootCampaignId = campaign.parent_campaign_id || campaign.id;
    const nextVersionNumber = await getNextVersionNumber(rootCampaignId);
    const baseName = cleanCampaignBaseName(campaign.campaign_name);

    const { data: newCampaign, error: insertError } = await supabaseServer
      .from("social_ad_campaigns")
      .insert({
        project_id: campaign.project_id,
        post_id: campaign.post_id,
        asset_id: campaign.asset_id,

        parent_campaign_id: rootCampaignId,
        version_number: nextVersionNumber,

        status: "draft",
        platform: campaign.platform,
        objective: campaign.objective,

        campaign_name: `${baseName} – Version ${nextVersionNumber}`,
        ad_headline: campaign.ad_headline,
        ad_text: campaign.ad_text,
        landing_page_url: campaign.landing_page_url,

        target_location: campaign.target_location,
        target_audience_description: campaign.target_audience_description,
        placements: campaign.placements || [],

        daily_budget_cents: campaign.daily_budget_cents,
        lifetime_budget_cents: campaign.lifetime_budget_cents,
        currency: campaign.currency || "EUR",

        start_at: campaign.start_at,
        end_at: campaign.end_at,

        notes: [
          `Neue bearbeitbare Version aus Kampagne "${campaign.campaign_name}" erstellt.`,
          "Bitte Budget, Zielgruppe, Laufzeit, Landingpage und Anzeigentexte erneut prüfen.",
          "Diese Version muss separat freigegeben werden.",
          campaign.notes ? `Ursprüngliche Notiz: ${campaign.notes}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),

        internal_warning:
          "Diese Kampagne ist eine neue Version eines bestehenden Kampagnenentwurfs. Es wird noch kein Werbebudget ausgegeben.",
      })
      .select("*")
      .single();

    if (insertError) {
      return NextResponse.json(
        {
          ok: false,
          message: insertError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message:
        "Neue Kampagnenversion wurde erstellt. Die alte Freigabe bleibt unverändert.",
      campaign: newCampaign,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Erstellen der Kampagnenversion.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    );
  }
}