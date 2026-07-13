import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
﻿import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

function jsonResponse(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status });
}

type RouteContext = {
  params:
    | Promise<{
        id: string;
        aliasId: string;
      }>
    | {
        id: string;
        aliasId: string;
      };
};

export async function DELETE(_request: Request, context: RouteContext) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const params = await Promise.resolve(context.params);
    const productId = String(params.id || "").trim();
    const aliasId = String(params.aliasId || "").trim();

    if (!productId || !aliasId) {
      return jsonResponse(
        {
          ok: false,
          message: "Produkt-ID oder Alias-ID fehlt.",
        },
        400
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: existingAlias, error: readError } = await supabase
      .from("school_product_aliases")
      .select("id, product_id, alias")
      .eq("id", aliasId)
      .eq("product_id", productId)
      .maybeSingle();

    if (readError) {
      return jsonResponse(
        {
          ok: false,
          message: `Alias konnte nicht geprüft werden: ${readError.message}`,
        },
        500
      );
    }

    if (!existingAlias) {
      return jsonResponse(
        {
          ok: false,
          message: "Alias wurde nicht gefunden oder gehört nicht zu diesem Produkt.",
        },
        404
      );
    }

    const { error: deleteError } = await supabase
      .from("school_product_aliases")
      .delete()
      .eq("id", aliasId)
      .eq("product_id", productId);

    if (deleteError) {
      return jsonResponse(
        {
          ok: false,
          message: `Alias konnte nicht gelöscht werden: ${deleteError.message}`,
        },
        500
      );
    }

    return jsonResponse({
      ok: true,
      aliasId,
      productId,
      alias: existingAlias.alias,
      message: "Gespeicherte Zuordnung wurde gelöscht.",
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Alias konnte nicht gelöscht werden.",
      },
      500
    );
  }
}
