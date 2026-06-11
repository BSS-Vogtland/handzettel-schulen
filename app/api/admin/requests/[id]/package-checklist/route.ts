import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type RequestItem = {
  id: string;
  raw_text: string | null;
  normalized_name: string | null;
  quantity: number | string | null;
  category: string | null;
  product_type?: string | null;
  format: string | null;
  color: string | null;
  lineature: string | null;
  notes: string | null;
  status: string | null;
  admin_resolution_status?: string | null;
  admin_resolution_note?: string | null;
};

type OfferItem = {
  id: string;
  request_id: string;
  request_item_id: string | null;
  product_id: string | null;
  product_name: string;
  product_sku: string | null;
  product_price: number | string | null;
  quantity: number | string | null;
  unit: string | null;
  source: string | null;
  status: string | null;
  notes: string | null;
};

type ChecklistItem = {
  id: string;
  request_id: string;
  request_item_id: string | null;
  offer_item_id: string | null;
  original_text: string | null;
  resolved_text: string | null;
  status: string;
  is_checked: boolean;
  note: string | null;
  checked_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const RESOLVED_ADMIN_STATUSES = new Set([
  "in_package",
  "alternative_selected",
  "not_available",
  "not_needed",
  "question_required",
  "manual_check",
]);

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

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function toNumber(value: unknown, fallback = 1) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getRequestItemTitle(item: RequestItem) {
  return (
    cleanText(item.normalized_name) ||
    cleanText(item.raw_text) ||
    "Unbekannte Listenposition"
  );
}

function getRequestItemOriginalText(item: RequestItem) {
  const facts: string[] = [];

  facts.push(`${toNumber(item.quantity, 1)}x ${getRequestItemTitle(item)}`);

  if (item.format) facts.push(`Format: ${item.format}`);
  if (item.lineature) facts.push(`Lineatur: ${item.lineature}`);
  if (item.color) facts.push(`Farbe: ${item.color}`);
  if (item.notes) facts.push(`Hinweis: ${item.notes}`);

  return facts.join(" · ");
}

function getOfferItemText(item: OfferItem) {
  const parts: string[] = [];

  parts.push(`${toNumber(item.quantity, 1)}x ${item.product_name}`);

  if (item.product_sku) parts.push(`Art.-Nr.: ${item.product_sku}`);
  if (item.notes) parts.push(`Hinweis: ${item.notes}`);

  return parts.join(" · ");
}

function getStatusLabel(status: string) {
  switch (status) {
    case "in_package":
      return "Im Paket";
    case "alternative_selected":
      return "Alternative gewählt";
    case "not_available":
      return "Nicht lieferbar";
    case "not_needed":
      return "Nicht benötigt";
    case "question_required":
      return "Rückfrage nötig";
    case "manual_check":
      return "Manuell geprüft";
    default:
      return status || "Manuell geprüft";
  }
}

function isRequestItemResolved(item: RequestItem, offerItems: OfferItem[]) {
  const linkedOfferItems = offerItems.filter(
    (offerItem) => offerItem.request_item_id === item.id
  );

  if (linkedOfferItems.length > 0) return true;

  const adminStatus = cleanText(item.admin_resolution_status);

  if (RESOLVED_ADMIN_STATUSES.has(adminStatus)) return true;

  return false;
}

function buildChecklistRows(input: {
  requestItems: RequestItem[];
  offerItems: OfferItem[];
}) {
  const rows: Array<{
    request_item_id: string | null;
    offer_item_id: string | null;
    original_text: string | null;
    resolved_text: string | null;
    status: string;
  }> = [];

  const usedOfferItemIds = new Set<string>();

  for (const item of input.requestItems) {
    const linkedOfferItems = input.offerItems.filter(
      (offerItem) => offerItem.request_item_id === item.id
    );

    for (const offerItem of linkedOfferItems) {
      usedOfferItemIds.add(offerItem.id);
    }

    const adminStatus = cleanText(item.admin_resolution_status);

    if (linkedOfferItems.length > 0) {
      rows.push({
        request_item_id: item.id,
        offer_item_id: linkedOfferItems[0]?.id || null,
        original_text: getRequestItemOriginalText(item),
        resolved_text: linkedOfferItems.map(getOfferItemText).join("\n"),
        status: "in_package",
      });

      continue;
    }

    rows.push({
      request_item_id: item.id,
      offer_item_id: null,
      original_text: getRequestItemOriginalText(item),
      resolved_text:
        cleanText(item.admin_resolution_note) ||
        getStatusLabel(adminStatus || "manual_check"),
      status: adminStatus || "manual_check",
    });
  }

  if (input.requestItems.length === 0) {
    for (const offerItem of input.offerItems) {
      rows.push({
        request_item_id: null,
        offer_item_id: offerItem.id,
        original_text: "Keine erkannte Listenposition vorhanden",
        resolved_text: getOfferItemText(offerItem),
        status: "manual_check",
      });
    }

    return rows;
  }

  for (const offerItem of input.offerItems) {
    if (usedOfferItemIds.has(offerItem.id)) continue;
    if (offerItem.request_item_id) continue;

    rows.push({
      request_item_id: null,
      offer_item_id: offerItem.id,
      original_text: "Zusätzlich manuell ergänzt",
      resolved_text: getOfferItemText(offerItem),
      status: "manual_check",
    });
  }

  return rows;
}

async function loadChecklistData(requestId: string) {
  const supabase = getSupabaseAdmin();

  const [
    { data: requestData, error: requestError },
    { data: requestItemsData, error: requestItemsError },
    { data: offerItemsData, error: offerItemsError },
    { data: checklistItemsData, error: checklistItemsError },
  ] = await Promise.all([
    supabase
      .from("school_requests")
      .select(
        "id, package_checklist_status, package_checklist_created_at, package_checklist_completed_at"
      )
      .eq("id", requestId)
      .maybeSingle(),

    supabase
      .from("school_request_items")
      .select("*")
      .eq("request_id", requestId)
      .order("created_at", { ascending: true }),

    supabase
      .from("school_offer_items")
      .select("*")
      .eq("request_id", requestId)
      .order("created_at", { ascending: true }),

    supabase
      .from("school_package_checklist_items")
      .select("*")
      .eq("request_id", requestId)
      .order("created_at", { ascending: true }),
  ]);

  if (requestError) {
    throw new Error(`Anfrage konnte nicht geladen werden: ${requestError.message}`);
  }

  if (!requestData) {
    return {
      notFound: true as const,
    };
  }

  if (requestItemsError) {
    throw new Error(
      `Listenpositionen konnten nicht geladen werden: ${requestItemsError.message}`
    );
  }

  if (offerItemsError) {
    throw new Error(
      `Paketpositionen konnten nicht geladen werden: ${offerItemsError.message}`
    );
  }

  if (checklistItemsError) {
    throw new Error(
      `Checkliste konnte nicht geladen werden: ${checklistItemsError.message}`
    );
  }

  const requestItems = (requestItemsData || []) as RequestItem[];
  const offerItems = (offerItemsData || []) as OfferItem[];
  const checklistItems = (checklistItemsData || []) as ChecklistItem[];

  const unresolvedItems = requestItems
    .filter((item) => !isRequestItemResolved(item, offerItems))
    .map((item) => ({
      id: item.id,
      title: getRequestItemTitle(item),
      originalText: getRequestItemOriginalText(item),
    }));

  const canGenerate =
    unresolvedItems.length === 0 &&
    (requestItems.length > 0 || offerItems.length > 0);

  const checkedCount = checklistItems.filter((item) => item.is_checked).length;
  const totalCount = checklistItems.length;

  return {
    notFound: false as const,
    request: requestData,
    requestItems,
    offerItems,
    checklistItems,
    unresolvedItems,
    canGenerate,
    checkedCount,
    totalCount,
  };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const requestId = cleanText(id);

    if (!requestId) {
      return NextResponse.json(
        { ok: false, message: "Keine Anfrage-ID übergeben." },
        { status: 400 }
      );
    }

    const data = await loadChecklistData(requestId);

    if (data.notFound) {
      return NextResponse.json(
        { ok: false, message: "Anfrage wurde nicht gefunden." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      requestId,
      status: data.request.package_checklist_status || "not_created",
      createdAt: data.request.package_checklist_created_at || null,
      completedAt: data.request.package_checklist_completed_at || null,
      canGenerate: data.canGenerate,
      unresolvedCount: data.unresolvedItems.length,
      unresolvedItems: data.unresolvedItems,
      checkedCount: data.checkedCount,
      totalCount: data.totalCount,
      items: data.checklistItems,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Checkliste konnte nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const requestId = cleanText(id);

    if (!requestId) {
      return NextResponse.json(
        { ok: false, message: "Keine Anfrage-ID übergeben." },
        { status: 400 }
      );
    }

    const data = await loadChecklistData(requestId);

    if (data.notFound) {
      return NextResponse.json(
        { ok: false, message: "Anfrage wurde nicht gefunden." },
        { status: 404 }
      );
    }

    if (!data.canGenerate) {
      return NextResponse.json(
        {
          ok: false,
          message:
            data.unresolvedItems.length > 0
              ? `Die Checkliste kann noch nicht erzeugt werden. Es sind noch ${data.unresolvedItems.length} Listenpositionen offen.`
              : "Die Checkliste kann noch nicht erzeugt werden, weil keine Listen- oder Paketpositionen vorhanden sind.",
          unresolvedCount: data.unresolvedItems.length,
          unresolvedItems: data.unresolvedItems,
        },
        { status: 409 }
      );
    }

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    const existingByRequestItemId = new Map<string, ChecklistItem>();
    const existingByOfferItemId = new Map<string, ChecklistItem>();

    for (const item of data.checklistItems) {
      if (item.request_item_id) {
        existingByRequestItemId.set(item.request_item_id, item);
      }

      if (!item.request_item_id && item.offer_item_id) {
        existingByOfferItemId.set(item.offer_item_id, item);
      }
    }

    const rows = buildChecklistRows({
      requestItems: data.requestItems,
      offerItems: data.offerItems,
    });

    for (const row of rows) {
      const existing = row.request_item_id
        ? existingByRequestItemId.get(row.request_item_id)
        : row.offer_item_id
          ? existingByOfferItemId.get(row.offer_item_id)
          : null;

      if (existing) {
        const { error } = await supabase
          .from("school_package_checklist_items")
          .update({
            offer_item_id: row.offer_item_id,
            original_text: row.original_text,
            resolved_text: row.resolved_text,
            status: row.status,
            updated_at: now,
          })
          .eq("id", existing.id);

        if (error) {
          throw new Error(
            `Checklistenposition konnte nicht aktualisiert werden: ${error.message}`
          );
        }

        continue;
      }

      const { error } = await supabase
        .from("school_package_checklist_items")
        .insert({
          request_id: requestId,
          request_item_id: row.request_item_id,
          offer_item_id: row.offer_item_id,
          original_text: row.original_text,
          resolved_text: row.resolved_text,
          status: row.status,
          is_checked: false,
          note: null,
          checked_at: null,
          created_at: now,
          updated_at: now,
        });

      if (error) {
        throw new Error(
          `Checklistenposition konnte nicht erstellt werden: ${error.message}`
        );
      }
    }

    const nextStatus =
      data.request.package_checklist_status === "completed"
        ? "completed"
        : "created";

    const { error: requestUpdateError } = await supabase
      .from("school_requests")
      .update({
        package_checklist_status: nextStatus,
        package_checklist_created_at:
          data.request.package_checklist_created_at || now,
        updated_at: now,
      })
      .eq("id", requestId);

    if (requestUpdateError) {
      throw new Error(
        `Checklistenstatus konnte nicht gespeichert werden: ${requestUpdateError.message}`
      );
    }

    const refreshed = await loadChecklistData(requestId);

    if (refreshed.notFound) {
      return NextResponse.json(
        { ok: false, message: "Anfrage wurde nach Erzeugung nicht gefunden." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Digitale Paketwunsch-Checkliste wurde erzeugt.",
      status: refreshed.request.package_checklist_status || "created",
      checkedCount: refreshed.checkedCount,
      totalCount: refreshed.totalCount,
      items: refreshed.checklistItems,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Checkliste konnte nicht erzeugt werden.",
      },
      { status: 500 }
    );
  }
}