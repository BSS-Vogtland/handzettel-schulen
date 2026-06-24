import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

type SocialAssetRow = {
  id: string;
  storage_bucket: string;
  storage_path: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ assetId: string }> }
) {
  try {
    const { assetId } = await context.params;

    if (!assetId || !isUuid(assetId)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Ungültige Bild-ID.",
        },
        { status: 400 }
      );
    }

    const { data: assetData, error: assetError } = await supabaseServer
      .from("social_assets")
      .select("id, storage_bucket, storage_path")
      .eq("id", assetId)
      .single();

    if (assetError || !assetData) {
      return NextResponse.json(
        {
          ok: false,
          message: assetError?.message || "Bild wurde nicht gefunden.",
        },
        { status: 404 }
      );
    }

    const asset = assetData as SocialAssetRow;

    if (asset.storage_bucket && asset.storage_path) {
      const { error: removeError } = await supabaseServer.storage
        .from(asset.storage_bucket)
        .remove([asset.storage_path]);

      if (removeError) {
        return NextResponse.json(
          {
            ok: false,
            message: removeError.message,
          },
          { status: 500 }
        );
      }
    }

    const { error: deleteError } = await supabaseServer
      .from("social_assets")
      .delete()
      .eq("id", assetId);

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
      message: "Bild wurde gelöscht.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Löschen des Bildes.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    );
  }
}


