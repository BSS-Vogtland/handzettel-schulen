import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type DiscountType = "percent" | "fixed_amount";
type AppliesTo = "all" | "shop" | "school_package";

type UpdateDiscountCampaignBody = {
  name?: string;
  description?: string | null;
  discountType?: DiscountType;
  discountValue?: number | string;
  startsAt?: string | null;
  endsAt?: string | null;
  appliesTo?: AppliesTo;
  isActive?: boolean;
  minimumOrderAmount?: number | string | null;
  maxDiscountAmount?: number | string | null;
};

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL fehlt.");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY fehlt.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function normalizeNullableText(value: unknown) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRequiredText(value: unknown) {
  if (typeof value !== "string") return "";

  return value.trim();
}

function normalizeMoney(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const numericValue =
    typeof value === "number"
      ? value
      : Number(String(value).replace(",", ".").trim());

  if (!Number.isFinite(numericValue)) return null;

  return Math.round((numericValue + Number.EPSILON) * 100) / 100;
}

function normalizeDateTime(value: unknown) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function isDiscountType(value: unknown): value is DiscountType {
  return value === "percent" || value === "fixed_amount";
}

function isAppliesTo(value: unknown): value is AppliesTo {
  return value === "all" || value === "shop" || value === "school_package";
}

function validateDateRange(startsAt: string | null, endsAt: string | null) {
  if (!startsAt || !endsAt) return true;

  return new Date(startsAt).getTime() <= new Date(endsAt).getTime();
}

async function getCampaignId(
  context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
  const maybeParams = context.params;

  if (typeof (maybeParams as Promise<{ id: string }>).then === "function") {
    const params = await (maybeParams as Promise<{ id: string }>);
    return params.id;
  }

  return (maybeParams as { id: string }).id;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
  try {
    const id = await getCampaignId(context);

    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          error: "Rabattaktion-ID fehlt.",
        },
        { status: 400 }
      );
    }

    const body = (await request.json()) as UpdateDiscountCampaignBody;

    const name = normalizeRequiredText(body.name);
    const description = normalizeNullableText(body.description);
    const discountType = body.discountType;
    const discountValue = normalizeMoney(body.discountValue);
    const startsAt = normalizeDateTime(body.startsAt);
    const endsAt = normalizeDateTime(body.endsAt);
    const appliesTo = body.appliesTo ?? "all";
    const isActive = body.isActive ?? true;
    const minimumOrderAmount = normalizeMoney(body.minimumOrderAmount);
    const maxDiscountAmount = normalizeMoney(body.maxDiscountAmount);

    if (!name) {
      return NextResponse.json(
        {
          ok: false,
          error: "Bitte gib einen Namen für die Rabattaktion ein.",
        },
        { status: 400 }
      );
    }

    if (!isDiscountType(discountType)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Bitte wähle eine gültige Rabattart.",
        },
        { status: 400 }
      );
    }

    if (!isAppliesTo(appliesTo)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Bitte wähle einen gültigen Geltungsbereich.",
        },
        { status: 400 }
      );
    }

    if (discountValue === null || discountValue <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "Bitte gib einen Rabattwert größer als 0 ein.",
        },
        { status: 400 }
      );
    }

    if (discountType === "percent" && discountValue > 100) {
      return NextResponse.json(
        {
          ok: false,
          error: "Ein prozentualer Rabatt darf maximal 100 % betragen.",
        },
        { status: 400 }
      );
    }

    if (!validateDateRange(startsAt, endsAt)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Das Startdatum darf nicht nach dem Enddatum liegen.",
        },
        { status: 400 }
      );
    }

    if (minimumOrderAmount !== null && minimumOrderAmount < 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "Der Mindestbestellwert darf nicht negativ sein.",
        },
        { status: 400 }
      );
    }

    if (maxDiscountAmount !== null && maxDiscountAmount <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "Der maximale Rabattbetrag muss größer als 0 sein.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from("school_discount_campaigns")
      .update({
        name,
        description,
        discount_type: discountType,
        discount_value: discountValue,
        starts_at: startsAt,
        ends_at: endsAt,
        applies_to: appliesTo,
        is_active: isActive,
        minimum_order_amount: minimumOrderAmount,
        max_discount_amount: maxDiscountAmount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: "Rabattaktion konnte nicht aktualisiert werden.",
          details: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      campaign: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unbekannter Fehler beim Aktualisieren der Rabattaktion.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
  try {
    const id = await getCampaignId(context);

    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          error: "Rabattaktion-ID fehlt.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    const { error } = await supabase
      .from("school_discount_campaigns")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: "Rabattaktion konnte nicht gelöscht werden.",
          details: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unbekannter Fehler beim Löschen der Rabattaktion.",
      },
      { status: 500 }
    );
  }
}