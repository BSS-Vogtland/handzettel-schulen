import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  loadProductCategoryOptions,
  normalizeCategoryKey,
  splitCategoryKeywords,
} from "@/lib/productCategoryDatabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const activeOnly = request.nextUrl.searchParams.get("active") === "1";
    const categories = await loadProductCategoryOptions(supabase, { activeOnly });

    return NextResponse.json({
      ok: true,
      categories,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Produktkategorien konnten nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => ({}));
    const label = cleanString(payload.label);
    const keywords = splitCategoryKeywords(payload.keywords);
    const sortOrder = toInteger(payload.sortOrder, 100);

    if (!label) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte gib einen Kategorienamen ein.",
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

    const { data, error } = await supabase
      .from("school_product_categories")
      .insert({
        value,
        label,
        keywords,
        sort_order: sortOrder,
        is_active: true,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Kategorie konnte nicht angelegt werden. Ist die SQL-Migration ausgefuehrt? Details: " +
            error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      category: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Kategorie konnte nicht angelegt werden.",
      },
      { status: 500 }
    );
  }
}
