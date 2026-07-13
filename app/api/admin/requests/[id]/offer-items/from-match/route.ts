import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { updateAdminRequestWorkflowState } from "@/lib/adminRequestWorkflow";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type RequestBody = {
  matchId?: string;
};

type MatchRow = {
  id: string;
  request_item_id: string;
  product_id: string | null;
  product_name: string | null;
  product_sku: string | null;
  product_price: number | null;
  match_score: number | null;
  match_reason: string | null;
};

type RequestItemRow = {
  id: string;
  request_id: string;
  quantity: number | null;
  raw_text: string;
  normalized_name: string | null;
};

export async function POST(request: Request, context: RouteContext) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { ok: false, message: "Keine Anfrage-ID übergeben." },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const matchId = body.matchId;

    if (!matchId) {
      return NextResponse.json(
        { ok: false, message: "Keine Match-ID übergeben." },
        { status: 400 }
      );
    }

    const { data: matchData, error: matchError } = await supabaseServer
      .from("school_request_matches")
      .select(
        `
        id,
        request_item_id,
        product_id,
        product_name,
        product_sku,
        product_price,
        match_score,
        match_reason
      `
      )
      .eq("id", matchId)
      .single();

    if (matchError || !matchData) {
      return NextResponse.json(
        {
          ok: false,
          message:
            matchError?.message ||
            "Der Produktvorschlag wurde nicht gefunden.",
        },
        { status: 404 }
      );
    }

    const match = matchData as MatchRow;

    const { data: itemData, error: itemError } = await supabaseServer
      .from("school_request_items")
      .select(
        `
        id,
        request_id,
        quantity,
        raw_text,
        normalized_name
      `
      )
      .eq("id", match.request_item_id)
      .eq("request_id", id)
      .single();

    if (itemError || !itemData) {
      return NextResponse.json(
        {
          ok: false,
          message:
            itemError?.message ||
            "Die erkannte Listenposition wurde nicht gefunden.",
        },
        { status: 404 }
      );
    }

    const item = itemData as RequestItemRow;

    if (!match.product_name) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Dieser Produktvorschlag hat keinen Produktnamen und kann nicht übernommen werden.",
        },
        { status: 400 }
      );
    }

    await supabaseServer
      .from("school_request_matches")
      .update({ selected: false })
      .eq("request_item_id", item.id);

    await supabaseServer
      .from("school_request_matches")
      .update({ selected: true })
      .eq("id", match.id);

    const quantity = item.quantity && item.quantity > 0 ? item.quantity : 1;

    const { data: existingOfferItem, error: existingError } =
      await supabaseServer
        .from("school_offer_items")
        .select("id")
        .eq("match_id", match.id)
        .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Bestehende Angebotsposition konnte nicht geprüft werden: ${existingError.message}`,
        },
        { status: 500 }
      );
    }

    if (existingOfferItem?.id) {
      const { error: updateError } = await supabaseServer
        .from("school_offer_items")
        .update({
          request_id: id,
          request_item_id: item.id,
          product_id: match.product_id,
          product_name: match.product_name,
          product_sku: match.product_sku,
          product_price: match.product_price,
          quantity,
          source: "match",
          status: "draft",
          notes: `Übernommen aus: ${
            item.normalized_name || item.raw_text
          }`,
        })
        .eq("id", existingOfferItem.id);

      if (updateError) {
        return NextResponse.json(
          {
            ok: false,
            message: `Angebotsposition konnte nicht aktualisiert werden: ${updateError.message}`,
          },
          { status: 500 }
        );
      }
    } else {
      const { error: insertError } = await supabaseServer
        .from("school_offer_items")
        .insert({
          request_id: id,
          request_item_id: item.id,
          match_id: match.id,
          product_id: match.product_id,
          product_name: match.product_name,
          product_sku: match.product_sku,
          product_price: match.product_price,
          quantity,
          source: "match",
          status: "draft",
          notes: `Übernommen aus: ${
            item.normalized_name || item.raw_text
          }`,
        });

      if (insertError) {
        return NextResponse.json(
          {
            ok: false,
            message: `Angebotsposition konnte nicht gespeichert werden: ${insertError.message}`,
          },
          { status: 500 }
        );
      }
    }
    await updateAdminRequestWorkflowState(supabaseServer, id);

    await supabaseServer.from("school_request_events").insert({
      request_id: id,
      event_type: "offer_item_added",
      title: "Produkt ins Angebot übernommen",
      description: `${match.product_name} wurde als Angebotsposition gespeichert.`,
    });

    return NextResponse.json({
      ok: true,
      message: "Produkt wurde ins Angebot übernommen.",
    });
  } catch (error) {
    console.error("Fehler beim Übernehmen des Produktvorschlags:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Beim Übernehmen des Produktvorschlags ist ein unerwarteter Fehler aufgetreten.",
      },
      { status: 500 }
    );
  }
}