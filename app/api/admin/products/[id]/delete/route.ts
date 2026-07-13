import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

type ProductRow = {
  id: string;
  name?: string | null;
  product_name?: string | null;
  title?: string | null;
  sku?: string | null;
  product_sku?: string | null;
};

type OfferItemRef = {
  id: string;
  request_id: string | null;
};

type MatchRef = {
  id: string;
  request_item_id: string | null;
};

type RequestItemRef = {
  id: string;
  request_id: string | null;
};

type RequestRef = {
  id: string;
  request_number?: string | null;
  status?: string | null;
  offer_status?: string | null;
  fulfillment_status?: string | null;
};

function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

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

function getProductName(product: ProductRow) {
  return (
    product.name ||
    product.product_name ||
    product.title ||
    "Unbenanntes Produkt"
  );
}

function getProductSku(product: ProductRow) {
  return product.sku || product.product_sku || null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter((value) => value.length > 0)
    )
  );
}

function isInactiveOrCompletedRequest(request: RequestRef | null | undefined) {
  if (!request) {
    return true;
  }

  const status = String(request.status || "").toLowerCase();
  const offerStatus = String(request.offer_status || "").toLowerCase();
  const fulfillmentStatus = String(request.fulfillment_status || "").toLowerCase();

  const inactiveStatusValues = new Set([
    "archived",
    "archive",
    "deleted",
    "cancelled",
    "canceled",
    "completed",
    "done",
    "closed",
  ]);

  const inactiveOfferStatusValues = new Set([
    "cancelled",
    "canceled",
    "completed",
    "done",
    "closed",
  ]);

  const inactiveFulfillmentValues = new Set([
    "shipped",
    "picked_up",
    "completed",
    "done",
    "closed",
    "cancelled",
    "canceled",
  ]);

  if (inactiveStatusValues.has(status)) return true;
  if (inactiveOfferStatusValues.has(offerStatus)) return true;
  if (inactiveFulfillmentValues.has(fulfillmentStatus)) return true;

  return false;
}

function isActiveRequest(request: RequestRef | null | undefined) {
  return !isInactiveOrCompletedRequest(request);
}

function getRequestLabel(request: RequestRef | null | undefined, fallbackId: string) {
  if (!request) return fallbackId;
  return request.request_number || request.id || fallbackId;
}

export async function DELETE(_request: Request, context: Params) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const productId = String(id || "").trim();

    if (!productId) {
      return jsonResponse(
        {
          ok: false,
          message: "Keine Produkt-ID übergeben.",
        },
        400
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: productData, error: productError } = await supabase
      .from("school_products")
      .select("*")
      .eq("id", productId)
      .maybeSingle();

    if (productError) {
      return jsonResponse(
        {
          ok: false,
          message: `Produkt konnte nicht geladen werden: ${productError.message}`,
        },
        500
      );
    }

    if (!productData) {
      return jsonResponse(
        {
          ok: false,
          message: "Produkt wurde nicht gefunden.",
        },
        404
      );
    }

    const product = productData as ProductRow;
    const productName = getProductName(product);
    const productSku = getProductSku(product);

    const { data: offerRefsData, error: offerRefsError } = await supabase
      .from("school_offer_items")
      .select("id, request_id")
      .eq("product_id", productId)
      .limit(5000);

    if (offerRefsError) {
      return jsonResponse(
        {
          ok: false,
          message: `Paketpositionen konnten nicht geprüft werden: ${offerRefsError.message}`,
        },
        500
      );
    }

    const offerRefs = (offerRefsData || []) as OfferItemRef[];

    const { data: matchRefsData, error: matchRefsError } = await supabase
      .from("school_request_matches")
      .select("id, request_item_id")
      .eq("product_id", productId)
      .limit(5000);

    if (matchRefsError) {
      return jsonResponse(
        {
          ok: false,
          message: `Produktvorschläge konnten nicht geprüft werden: ${matchRefsError.message}`,
        },
        500
      );
    }

    const matchRefs = (matchRefsData || []) as MatchRef[];

    let matchRequestItemRefs: RequestItemRef[] = [];

    const matchRequestItemIds = uniqueStrings(
      matchRefs.map((match) => match.request_item_id)
    );

    if (matchRequestItemIds.length > 0) {
      const { data: itemRefsData, error: itemRefsError } = await supabase
        .from("school_request_items")
        .select("id, request_id")
        .in("id", matchRequestItemIds)
        .limit(5000);

      if (itemRefsError) {
        return jsonResponse(
          {
            ok: false,
            message: `Listenpositionen zu Produktvorschlägen konnten nicht geprüft werden: ${itemRefsError.message}`,
          },
          500
        );
      }

      matchRequestItemRefs = (itemRefsData || []) as RequestItemRef[];
    }

    const requestIdsFromOfferItems = uniqueStrings(
      offerRefs.map((offerRef) => offerRef.request_id)
    );

    const requestIdsFromMatches = uniqueStrings(
      matchRequestItemRefs.map((itemRef) => itemRef.request_id)
    );

    const allRequestIds = uniqueStrings([
      ...requestIdsFromOfferItems,
      ...requestIdsFromMatches,
    ]);

    const requestById = new Map<string, RequestRef>();

    if (allRequestIds.length > 0) {
      const { data: requestsData, error: requestsError } = await supabase
        .from("school_requests")
        .select("id, request_number, status, offer_status, fulfillment_status")
        .in("id", allRequestIds)
        .limit(5000);

      if (requestsError) {
        return jsonResponse(
          {
            ok: false,
            message: `Vorgänge konnten nicht geprüft werden: ${requestsError.message}`,
          },
          500
        );
      }

      for (const requestRow of (requestsData || []) as RequestRef[]) {
        requestById.set(requestRow.id, requestRow);
      }
    }

    const requestIdByItemId = new Map<string, string>();

    for (const itemRef of matchRequestItemRefs) {
      if (!itemRef.id || !itemRef.request_id) continue;
      requestIdByItemId.set(itemRef.id, itemRef.request_id);
    }

    const activeOfferRequestIds = uniqueStrings(
      offerRefs
        .filter((offerRef) => {
          if (!offerRef.request_id) return false;
          return isActiveRequest(requestById.get(offerRef.request_id));
        })
        .map((offerRef) => offerRef.request_id)
    );

    const activeMatchRequestIds = uniqueStrings(
      matchRefs
        .map((matchRef) => {
          if (!matchRef.request_item_id) return null;
          return requestIdByItemId.get(matchRef.request_item_id) || null;
        })
        .filter((requestId): requestId is string => Boolean(requestId))
        .filter((requestId) => isActiveRequest(requestById.get(requestId)))
    );

    const activeRequestIds = uniqueStrings([
      ...activeOfferRequestIds,
      ...activeMatchRequestIds,
    ]);

    if (activeRequestIds.length > 0) {
      const labels = activeRequestIds
        .slice(0, 5)
        .map((requestId) => getRequestLabel(requestById.get(requestId), requestId))
        .join(", ");

      return jsonResponse(
        {
          ok: false,
          message:
            `Dieses Produkt kann noch nicht gelöscht werden, weil es in aktiven Vorgängen verwendet wird: ${labels}. ` +
            `Schließe/archiviere diese Vorgänge zuerst oder setze das Produkt nur auf inaktiv.`,
        },
        409
      );
    }

    const { error: aliasDeleteError } = await supabase
      .from("school_product_aliases")
      .delete()
      .eq("product_id", productId);

    if (aliasDeleteError) {
      return jsonResponse(
        {
          ok: false,
          message: `Produkt-Aliase konnten nicht gelöscht werden: ${aliasDeleteError.message}`,
        },
        500
      );
    }

    const { error: matchDeleteError } = await supabase
      .from("school_request_matches")
      .delete()
      .eq("product_id", productId);

    if (matchDeleteError) {
      return jsonResponse(
        {
          ok: false,
          message: `Alte Produktvorschläge konnten nicht gelöst werden: ${matchDeleteError.message}`,
        },
        500
      );
    }

    const { error: offerUnlinkError } = await supabase
      .from("school_offer_items")
      .update({
        product_id: null,
      })
      .eq("product_id", productId);

    if (offerUnlinkError) {
      return jsonResponse(
        {
          ok: false,
          message:
            `Historische Paketpositionen konnten nicht vom Produkt gelöst werden: ${offerUnlinkError.message}. ` +
            `Falls product_id in school_offer_items nicht nullable ist, sollte dieses Produkt stattdessen deaktiviert werden.`,
        },
        500
      );
    }

    const { error: productDeleteError } = await supabase
      .from("school_products")
      .delete()
      .eq("id", productId);

    if (productDeleteError) {
      return jsonResponse(
        {
          ok: false,
          message: `Produkt konnte nicht gelöscht werden: ${productDeleteError.message}`,
        },
        500
      );
    }

    return jsonResponse({
      ok: true,
      productName,
      productSku,
      message: productSku
        ? `Produkt „${productName}“ (${productSku}) wurde gelöscht. Historische Paketpositionen bleiben ohne direkte Prüfung erhalten.`
        : `Produkt „${productName}“ wurde gelöscht. Historische Paketpositionen bleiben ohne direkte Prüfung erhalten.`,
    });
  } catch (error) {
    console.error("Admin product delete error:", error);

    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Produkt konnte nicht gelöscht werden.",
      },
      500
    );
  }
}