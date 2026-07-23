import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { supabaseServer } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
    itemId: string;
  }>;
};

type UpdatePreparedCartItemBody = {
  quantity?: number | string | null;
  adminNote?: string | null;
};

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function normalizeQuantity(value: unknown) {
  const parsed = Number(String(value ?? "").replace(",", "."));

  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.max(1, Math.min(99, Math.floor(parsed)));
}

async function cartCanBeEdited(cartId: string) {
  const { data, error } = await supabaseServer
    .from("school_prepared_carts")
    .select("id, status")
    .eq("id", cartId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return {
      ok: false,
      status: 404,
      message: "Der vorbereitete Warenkorb wurde nicht gefunden.",
    };
  }

  if (
    data.status === "ordered" ||
    data.status === "cancelled" ||
    data.status === "expired"
  ) {
    return {
      ok: false,
      status: 409,
      message: "Dieser Warenkorb kann nicht mehr bearbeitet werden.",
    };
  }

  return {
    ok: true,
    status: 200,
    message: "",
  };
}

export async function PATCH(request: Request, context: RouteContext) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id: cartId, itemId } = await context.params;
    const editable = await cartCanBeEdited(cartId);

    if (!editable.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: editable.message,
        },
        { status: editable.status }
      );
    }

    const body = (await request.json()) as UpdatePreparedCartItemBody;

    const { data, error } = await supabaseServer
      .from("school_prepared_cart_items")
      .update({
        quantity: normalizeQuantity(body.quantity),
        admin_note: cleanText(body.adminNote),
      })
      .eq("id", itemId)
      .eq("cart_id", cartId)
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          message: error.message,
        },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        {
          ok: false,
          message: "Die Warenkorbposition wurde nicht gefunden.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      item: data,
      message: "Die Menge wurde aktualisiert.",
    });
  } catch (error) {
    console.error("Prepared cart item PATCH error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die Warenkorbposition konnte nicht aktualisiert werden.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id: cartId, itemId } = await context.params;
    const editable = await cartCanBeEdited(cartId);

    if (!editable.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: editable.message,
        },
        { status: editable.status }
      );
    }

    const { data, error } = await supabaseServer
      .from("school_prepared_cart_items")
      .delete()
      .eq("id", itemId)
      .eq("cart_id", cartId)
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          message: error.message,
        },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        {
          ok: false,
          message: "Die Warenkorbposition wurde nicht gefunden.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Die Warenkorbposition wurde entfernt.",
    });
  } catch (error) {
    console.error("Prepared cart item DELETE error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die Warenkorbposition konnte nicht entfernt werden.",
      },
      { status: 500 }
    );
  }
}