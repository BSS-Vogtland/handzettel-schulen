import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

type CampaignRow = {
  id: string;
  status: string;
  campaign_name: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
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
      .select("id, status, campaign_name")
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

    if (campaign.status === "launched") {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Gestartete Kampagnen sollten nicht hart gelöscht werden. Diese Kampagne muss später pausiert, beendet oder archiviert werden.",
        },
        { status: 400 }
      );
    }

    const { error: deleteError } = await supabaseServer
      .from("social_ad_campaigns")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json(
        {
          ok: false,
          message: deleteError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Kampagne "${campaign.campaign_name}" wurde gelöscht.`,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Löschen der Kampagne.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    );
  }
}