import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  normalizeCategoryKey,
  splitCategoryKeywords,
} from "@/lib/productCategoryDatabase";

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
      "Supabase Umgebungsvariablen fehlen. Pruefe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function cleanString(value: unknown) {
  const cleaned = String(value || "").trim();
  return cleaned.length > 0 ? cleaned : "";
}

function toInteger(value: unknown, fallback: number) {
  const parsed = Number(String(value || "").replace(/[^\d]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function getCategoryById(supabase: ReturnType<typeof getSupabaseAdmin>, id: string) {
  const { data, error } = await supabase
    .from("school_product_categories")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Kategorie nicht gefunden.");
  }

  return data as any;
}

export async function PATCH(request: NextRequest, context: Params) {
  try {
    const { id } = await context.params;
    const payload = await request.json().catch(() => ({}));

    const label = cleanString(payload.label);
    const keywords = splitCategoryKeywords(payload.keywords);
    const sortOrder = toInteger(payload.sortOrder, 100);
    const isActive = payload.isActive !== false;
    const updateProducts = payload.updateProducts !== false;

    if (!label) {
      return NextResponse.json(
        {
          ok: false,
          message: "Kategorie darf keinen leeren Namen haben.",
        },
        { status: 400 }
      );
    }

    const value = normalizeCategoryKey(label);

    if (!value) {
      return NextResponse.json(
        {
          ok: false,
          message: "Aus dem Kategorienamen konnte keine technische ID erzeugt werden.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const current = await getCategoryById(supabase, id);
    const oldLabel = cleanString(current.label);

    const { data, error } = await supabase
      .from("school_product_categories")
      .update({
        value,
        label,
        keywords,
        sort_order: sortOrder,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          message: "Kategorie konnte nicht gespeichert werden: " + error.message,
        },
        { status: 500 }
      );
    }

    let movedProductCount = 0;

    if (updateProducts && oldLabel && oldLabel !== label) {
      const { count } = await supabase
        .from("school_products")
        .select("id", { count: "exact", head: true })
        .eq("category", oldLabel);

      const { error: moveError } = await supabase
        .from("school_products")
        .update({
          category: label,
          updated_at: new Date().toISOString(),
        })
        .eq("category", oldLabel);

      if (moveError) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Kategorie wurde gespeichert, aber Produkte konnten nicht umgezogen werden: " +
              moveError.message,
          },
          { status: 500 }
        );
      }

      movedProductCount = count || 0;
    }

    return NextResponse.json({
      ok: true,
      category: data,
      movedProductCount,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Kategorie konnte nicht gespeichert werden.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, context: Params) {
  try {
    const { id } = await context.params;
    const payload = await request.json().catch(() => ({}));
    const replacementLabel = cleanString(payload.replacementLabel);

    const supabase = getSupabaseAdmin();
    const category = await getCategoryById(supabase, id);
    const label = cleanString(category.label);

    const { count, error: countError } = await supabase
      .from("school_products")
      .select("id", { count: "exact", head: true })
      .eq("category", label);

    if (countError) {
      return NextResponse.json(
        {
          ok: false,
          message: "Produktnutzung konnte nicht geprueft werden: " + countError.message,
        },
        { status: 500 }
      );
    }

    const productCount = count || 0;

    if (productCount > 0 && !replacementLabel) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Diese Kategorie wird noch von Produkten genutzt. Bitte Zielkategorie waehlen.",
        },
        { status: 409 }
      );
    }

    if (productCount > 0) {
      const { error: replacementError } = await supabase
        .from("school_product_categories")
        .select("id")
        .eq("label", replacementLabel)
        .eq("is_active", true)
        .single();

      if (replacementError) {
        return NextResponse.json(
          {
            ok: false,
            message: "Zielkategorie wurde nicht gefunden oder ist nicht aktiv.",
          },
          { status: 400 }
        );
      }

      const { error: moveError } = await supabase
        .from("school_products")
        .update({
          category: replacementLabel,
          updated_at: new Date().toISOString(),
        })
        .eq("category", label);

      if (moveError) {
        return NextResponse.json(
          {
            ok: false,
            message: "Produkte konnten nicht umgezogen werden: " + moveError.message,
          },
          { status: 500 }
        );
      }
    }

    const { error: deleteError } = await supabase
      .from("school_product_categories")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json(
        {
          ok: false,
          message: "Kategorie konnte nicht geloescht werden: " + deleteError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      movedProductCount: productCount,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Kategorie konnte nicht geloescht werden.",
      },
      { status: 500 }
    );
  }
}
