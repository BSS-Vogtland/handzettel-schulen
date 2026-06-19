import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { styleProductImageById } from "@/app/lib/productImageStyling";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ProductRow = {
  id: string;
  name: string | null;
  sku: string | null;
  image_url: string | null;
  image_original_url: string | null;
  image_styled_url: string | null;
  image_styled_at: string | null;
};

function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase Admin-Konfiguration fehlt. NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY ist nicht gesetzt."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function toPositiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return fallback;

  const rounded = Math.floor(parsed);

  if (rounded <= 0) return fallback;

  return rounded;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const limit = Math.min(toPositiveInt(body?.limit, 5), 25);
    const dryRun = Boolean(body?.dryRun);

    const supabase = getSupabaseAdminClient();

    const { data: products, error } = await supabase
      .from("school_products")
      .select(
        "id,name,sku,image_url,image_original_url,image_styled_url,image_styled_at"
      )
      .eq("active", true)
      .not("image_url", "is", null)
      .or("image_styled_url.is.null,image_styled_url.eq.")
      .order("name", { ascending: true })
      .limit(limit);

    if (error) {
      throw new Error(
        `Produkte ohne KI-Hintergrund konnten nicht geladen werden: ${error.message}`
      );
    }

    const candidates = ((products || []) as ProductRow[]).filter((product) => {
      const imageUrl = String(product.image_url || "").trim();
      const styledUrl = String(product.image_styled_url || "").trim();

      return imageUrl.length > 0 && styledUrl.length === 0;
    });

    if (dryRun) {
      return jsonResponse({
        ok: true,
        dryRun: true,
        limit,
        count: candidates.length,
        products: candidates.map((product) => ({
          id: product.id,
          name: product.name,
          sku: product.sku,
          imageUrl: product.image_url,
        })),
      });
    }

    const results: Array<{
      productId: string;
      name: string | null;
      sku: string | null;
      ok: boolean;
      styledImageUrl?: string;
      storagePath?: string;
      usedRemoveBg?: boolean;
      profile?: unknown;
      message?: string;
    }> = [];

    for (const product of candidates) {
      try {
        const result = await styleProductImageById(product.id);

        results.push({
          productId: product.id,
          name: product.name,
          sku: product.sku,
          ok: true,
          styledImageUrl: result.styledImageUrl,
          storagePath: result.storagePath,
          usedRemoveBg: result.usedRemoveBg,
          profile: result.profile,
        });
      } catch (error) {
        console.error("Batch style image product error:", {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          error,
        });

        results.push({
          productId: product.id,
          name: product.name,
          sku: product.sku,
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "Bild konnte nicht verarbeitet werden.",
        });
      }
    }

    const successCount = results.filter((result) => result.ok).length;
    const failedCount = results.filter((result) => !result.ok).length;

    return jsonResponse({
      ok: failedCount === 0,
      limit,
      selectedCount: candidates.length,
      successCount,
      failedCount,
      results,
      message:
        failedCount === 0
          ? `${successCount} Produktbilder wurden verarbeitet.`
          : `${successCount} Produktbilder wurden verarbeitet, ${failedCount} sind fehlgeschlagen.`,
    });
  } catch (error) {
    console.error("Batch style missing images error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Batch-Verarbeitung der Produktbilder ist fehlgeschlagen.",
      },
      500
    );
  }
}

export async function GET() {
  return jsonResponse(
    {
      ok: false,
      message: "Diese Route kann nur per POST genutzt werden.",
    },
    405
  );
}
