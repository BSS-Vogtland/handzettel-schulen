import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { supabaseServer } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type PreparedCartDeleteRow = {
  id: string;
  title: string | null;
  customer_name: string | null;
  status: string;
  ordered_request_id: string | null;
  ordered_invoice_id: string | null;
};

export async function DELETE(
  _request: Request,
  context: RouteContext
) {
  const unauthorized = await requireAdminApiSession();

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { id: cartId } = await context.params;

    if (!cartId) {
      return NextResponse.json(
        {
          ok: false,
          message: "Keine Warenkorb-ID übergeben.",
        },
        {
          status: 400,
        }
      );
    }

    const { data: cartData, error: cartError } =
      await supabaseServer
        .from("school_prepared_carts")
        .select(
          "id, title, customer_name, status, ordered_request_id, ordered_invoice_id"
        )
        .eq("id", cartId)
        .maybeSingle();

    if (cartError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Der Warenkorb konnte nicht geprüft werden: ${cartError.message}`,
        },
        {
          status: 500,
        }
      );
    }

    const cart =
      cartData as unknown as PreparedCartDeleteRow | null;

    if (!cart) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Der vorbereitete Warenkorb wurde nicht gefunden.",
        },
        {
          status: 404,
        }
      );
    }

    if (
      cart.status === "ordered" ||
      Boolean(cart.ordered_request_id) ||
      Boolean(cart.ordered_invoice_id)
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Bereits bestellte Warenkörbe können nicht gelöscht werden, weil sie mit einer Bestellung oder Rechnung verknüpft sind.",
        },
        {
          status: 409,
        }
      );
    }

    const { error: itemsDeleteError } =
      await supabaseServer
        .from("school_prepared_cart_items")
        .delete()
        .eq("cart_id", cartId);

    if (itemsDeleteError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Die Warenkorbpositionen konnten nicht gelöscht werden: ${itemsDeleteError.message}`,
        },
        {
          status: 500,
        }
      );
    }

    const { data: deletedCartData, error: cartDeleteError } =
      await supabaseServer
        .from("school_prepared_carts")
        .delete()
        .eq("id", cartId)
        .select("id")
        .maybeSingle();

    if (cartDeleteError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Der Warenkorb konnte nicht gelöscht werden: ${cartDeleteError.message}`,
        },
        {
          status: 500,
        }
      );
    }

    const deletedCart =
      deletedCartData as unknown as { id: string } | null;

    if (!deletedCart) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Der Warenkorb wurde nicht gefunden oder konnte nicht gelöscht werden.",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Der vorbereitete Warenkorb wurde gelöscht.",
    });
  } catch (error) {
    console.error("Prepared cart DELETE error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Der vorbereitete Warenkorb konnte nicht gelöscht werden.",
      },
      {
        status: 500,
      }
    );
  }
}