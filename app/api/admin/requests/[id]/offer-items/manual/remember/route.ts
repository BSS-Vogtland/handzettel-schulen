import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
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

function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function cleanText(value: unknown) {
  return String(value || "").trim();
}

async function createAliasFlexible(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  productId: string,
  aliasText: string
) {
  const cleanedAlias = cleanText(aliasText);

  if (!productId || !cleanedAlias) return false;

  const aliasVariants = [
    {
      product_id: productId,
      alias: cleanedAlias,
    },
    {
      product_id: productId,
      alias_text: cleanedAlias,
    },
    {
      product_id: productId,
      alias_name: cleanedAlias,
    },
    {
      product_id: productId,
      name: cleanedAlias,
    },
  ];

  let lastError: unknown = null;

  for (const payload of aliasVariants) {
    const { error } = await supabase
      .from("school_product_aliases")
      .insert(payload);

    if (!error) return true;

    lastError = error;
  }

  throw new Error(
    lastError instanceof Error
      ? lastError.message
      : "Alias konnte nicht gespeichert werden. Prüfe die Tabelle school_product_aliases."
  );
}

export async function POST(request: NextRequest, context: Params) {
  try {
    const { id } = await context.params;
    const supabase = getSupabaseAdmin();

    let body: {
      productId?: string | null;
      requestItemId?: string | null;
      aliasText?: string | null;
    } = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const productId = cleanText(body.productId);
    const requestItemId = cleanText(body.requestItemId);
    const aliasText = cleanText(body.aliasText);

    if (!id) {
      return jsonResponse(
        {
          ok: false,
          message: "Anfrage-ID fehlt.",
        },
        400
      );
    }

    if (!productId) {
      return jsonResponse(
        {
          ok: false,
          message: "Produkt-ID fehlt.",
        },
        400
      );
    }

    if (!aliasText) {
      return jsonResponse(
        {
          ok: false,
          message: "Alias/Zurodnungstext fehlt.",
        },
        400
      );
    }

    const { data: product, error: productError } = await supabase
      .from("school_products")
      .select("id")
      .eq("id", productId)
      .maybeSingle();

    if (productError) {
      return jsonResponse(
        {
          ok: false,
          message: `Produkt konnte nicht geprüft werden: ${productError.message}`,
        },
        500
      );
    }

    if (!product) {
      return jsonResponse(
        {
          ok: false,
          message: "Produkt wurde nicht gefunden.",
        },
        404
      );
    }

    if (requestItemId) {
      const { data: requestItem, error: requestItemError } = await supabase
        .from("school_request_items")
        .select("id, request_id")
        .eq("id", requestItemId)
        .maybeSingle();

      if (requestItemError) {
        return jsonResponse(
          {
            ok: false,
            message: `Listenposition konnte nicht geprüft werden: ${requestItemError.message}`,
          },
          500
        );
      }

      if (!requestItem || requestItem.request_id !== id) {
        return jsonResponse(
          {
            ok: false,
            message: "Diese Listenposition gehört nicht zu dieser Anfrage.",
          },
          400
        );
      }
    }

    const created = await createAliasFlexible(supabase, productId, aliasText);

    if (!created) {
      return jsonResponse(
        {
          ok: false,
          message: "Zuordnung konnte nicht gespeichert werden.",
        },
        500
      );
    }

    await supabase.from("school_request_events").insert({
      request_id: id,
      event_type: "admin_manual_alias_remembered",
      title: "Zuordnung für spätere Listen gespeichert",
      message: `Die Listenposition "${aliasText}" wurde als Alias zum Produkt gespeichert.`,
    });

    return jsonResponse({
      ok: true,
      message: "Zuordnung wurde für spätere Listen gespeichert.",
      productId,
      requestItemId: requestItemId || null,
      aliasText,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Zuordnung konnte nicht gespeichert werden.",
      },
      500
    );
  }
}