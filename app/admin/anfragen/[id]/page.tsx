import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileText,
  Mail,
  PackageCheck,
  Phone,
  RefreshCw,
  School,
  ShoppingBasket,
  Sparkles,
  User,
  Wrench,
} from "lucide-react";
import AdminManualOfferItemForm from "@/components/AdminManualOfferItemForm";
import AdminAddRequestItemForm from "@/components/AdminAddRequestItemForm";
import AdminResolveRequestItemButton from "@/components/AdminResolveRequestItemButton";
import AdminDeleteOfferItemButton from "@/components/AdminDeleteOfferItemButton";
import AdminDeleteRequestItemButton from "@/components/AdminDeleteRequestItemButton";
import AdminEditOfferItemForm from "@/components/AdminEditOfferItemForm";
import AdminOfferItemSpecialInstructionsForm from "@/components/AdminOfferItemSpecialInstructionsForm";
import CopyOfferLinkButton from "@/components/CopyOfferLinkButton";
import AdminSendOfferUpdateMailButton from "@/components/AdminSendOfferUpdateMailButton";
import AdminWhatsappUpdateButton from "@/components/AdminWhatsappUpdateButton";
import AdminRequestPhoneEditor from "@/components/AdminRequestPhoneEditor";
import AdminOfferWorkflowStatus from "@/components/AdminOfferWorkflowStatus";
import AdminFulfillmentPanel from "@/components/AdminFulfillmentPanel";
import AdminInvoicePaymentPanel from "@/components/AdminInvoicePaymentPanel";
import AdminRematchRequestButton from "@/components/AdminRematchRequestButton";
import AdminReanalyzeRequestButton from "@/components/AdminReanalyzeRequestButton";
import AdminStrongReanalyzeRequestButton from "@/components/AdminStrongReanalyzeRequestButton";
import AdminAdoptSafeMatchesButton from "@/components/AdminAdoptSafeMatchesButton";
import AdminAcceptMatchButton from "@/components/AdminAcceptMatchButton";
import AdminOfferRecommendationsPanel from "@/components/AdminOfferRecommendationsPanel";
import AdminRequestItemQuestionForm from "@/components/AdminRequestItemQuestionForm";
import AdminResolveQuestionButton from "@/components/AdminResolveQuestionButton";
import AdminPackageChecklistPanel from "@/components/AdminPackageChecklistPanel";
import AdminRequestChildCreateForm from "@/components/AdminRequestChildCreateForm";
import AdminCustomerPresenceBadge from "@/components/AdminCustomerPresenceBadge";
import AdminScrollToPackageChecklist from "@/components/AdminScrollToPackageChecklist";
import RestoreRequestButton from "@/components/RestoreRequestButton";
import { getLeadSourceBadgeClass, getLeadSourceLabel } from "@/lib/lead-source";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

type SchoolRequest = {
  id: string;
  request_number: string | null;
  source: string | null;
  status: string | null;
  customer_name: string | null;
  child_name: string | null;
  school_name: string | null;
  class_name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  offer_token: string | null;
  whatsapp_updates_enabled?: boolean | null;
  whatsapp_updates_requested_at?: string | null;
  whatsapp_updates_opted_out_at?: string | null;
  whatsapp_updates_last_admin_opened_at?: string | null;
  ai_status: string | null;
  offer_status: string | null;

  fulfillment_method?: string | null;
  fulfillment_status?: string | null;
  picking_status?: string | null;
  shipping_cost_status?: string | null;
  pickup_location_label?: string | null;
  pickup_address_snapshot?: string | null;
  pickup_maps_url_snapshot?: string | null;
  confirmed_at?: string | null;
  picking_started_at?: string | null;
  picked_at?: string | null;
  packed_at?: string | null;
  shipped_at?: string | null;
  picked_up_at?: string | null;

  invoice_status?: string | null;
  payment_status?: string | null;
  selected_payment_method?: string | null;
  latest_invoice_id?: string | null;
  invoice_sent_at?: string | null;
  payment_received_at?: string | null;
  payment_due_at?: string | null;
  cash_pickup_due_at?: string | null;
  shipping_amount?: number | string | null;
  invoice_total_amount?: number | string | null;

  cash_on_pickup_allowed?: boolean | null;
  cash_on_pickup_allowed_at?: string | null;
  cash_on_pickup_allowed_note?: string | null;
  cash_on_pickup_allowed_by?: string | null;

  is_active?: boolean | null;
  archived_at?: string | null;
  archive_reason?: string | null;
  archived_previous_status?: string | null;
  restored_at?: string | null;

  created_at: string | null;
  updated_at: string | null;
};

type RequestChild = {
  id: string;
  request_id: string;
  child_id?: string | null;
  sort_order: number | string | null;
  label: string | null;
  child_name: string | null;
  school_name: string | null;
  class_name: string | null;
  source: string | null;
  notes: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type RequestFile = {
  id: string;
  request_id: string;
  child_id?: string | null;
  file_url: string | null;
  storage_path: string | null;
  original_filename: string | null;
  file_type: string | null;
  file_size: number | null;
  source: string | null;
  created_at: string | null;
};

type RequestItem = {
  id: string;
  request_id: string;
  child_id?: string | null;
  raw_text: string | null;
  normalized_name: string | null;
  quantity: number | string | null;
  product_type?: string | null;
  category: string | null;
  format: string | null;
  color: string | null;
  lineature: string | null;
  notes: string | null;
  confidence: number | string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type RequestMatch = {
  id: string;
  request_item_id: string;
  product_id: string | null;
  product_name: string | null;
  product_sku: string | null;
  product_price: number | string | null;
  match_score: number | string | null;
  match_reason: string | null;
  selected: boolean | null;
  created_at: string | null;
};

type OfferItem = {
  id: string;
  request_id: string;
  child_id?: string | null;
  request_item_id: string | null;
  match_id: string | null;
  product_id: string | null;
  product_name: string;
  product_sku: string | null;
  product_price: number | string | null;
  quantity: number | string | null;
  unit: string | null;
  total_price: number | string | null;
  source: string | null;
  status: string | null;
  notes: string | null;
    customer_note?: string | null;
  customer_note_updated_at?: string | null;
created_at: string | null;
  updated_at: string | null;
};

type EventRow = {
  id: string;
  request_id: string;
  child_id?: string | null;
  event_type?: string | null;
  type?: string | null;
  title?: string | null;
  message: string | null;
  description?: string | null;
  metadata?: unknown;
  created_at: string | null;
};

type RequestItemQuestion = {
  id: string;
  request_id: string;
  child_id?: string | null;
  request_item_id: string | null;
  offer_item_id?: string | null;
  question_text: string;
  answer_text: string | null;
  status: "pending" | "answered" | "resolved" | "cancelled" | string;
  channel: string | null;
  created_by?: string | null;
  created_at: string | null;
  answered_at: string | null;
  resolved_at: string | null;
  cancelled_at?: string | null;
  updated_at?: string | null;
};

const BUCKET_NAME = "school-request-files";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase Umgebungsvariablen fehlen. PrÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼fe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatMoney(value: unknown) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(toNumber(value, 0));
}

function formatDateTime(value: string | null) {
  if (!value) return "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â";

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value: string | null) {
  if (!value) return "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â";

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatFileSize(size: number | null) {
  if (!size) return "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â";

  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function getStatusLabel(status: string | null) {
  switch (status) {
    case "received":
      return "Eingegangen";
    case "analysis_pending":
      return "Analyse offen";
    case "analysis_running":
      return "Analyse lÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¤uft";
    case "analysis_done":
      return "Analyse fertig";
    case "manual_review":
      return "Manuelle PrÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼fung";
    case "offer_created":
      return "Angebot erstellt";
    case "offer_sent":
      return "Angebot gesendet";
    case "confirmed":
      return "BestÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¤tigt";
    case "cancelled":
      return "Abgebrochen";
    default:
      return status || "Unbekannt";
  }
}

function getOfferStatusLabel(status: string | null) {
  switch (status) {
    case "not_created":
      return "Noch nicht erstellt";
    case "matching_done":
      return "ProduktvorschlÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¤ge erstellt";
    case "offer_created":
      return "Angebot erstellt";
    case "offer_sent":
      return "Angebot gesendet";
    case "customer_selection":
      return "Kundenauswahl";
    case "manual_review":
      return "Manuelle PrÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼fung";
    case "confirmed":
      return "BestÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¤tigt";
    default:
      return status || "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â";
  }
}

function getAiStatusLabel(status: string | null) {
  switch (status) {
    case "pending":
      return "Offen";
    case "running":
      return "LÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¤uft";
    case "done":
      return "Fertig";
    case "error":
      return "Fehler";
    case "manual_review":
      return "Manuelle PrÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼fung";
    case "missing_file":
      return "Datei fehlt";
    case "unsupported_file_type":
      return "Dateityp nicht unterstÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼tzt";
    case "no_items_detected":
      return "Keine Positionen erkannt";
    default:
      return status || "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â";
  }
}

function getRequestItemTitle(item: RequestItem) {
  return item.normalized_name || item.raw_text || "Unbekannte Position";
}

function getMatchScoreLabel(score: unknown) {
  const value = toNumber(score, 0);

  if (value >= 85) return "Sehr passend";
  if (value >= 80) return "Fast passend";
  if (value >= 70) return "Passend";
  if (value >= 55) return "MÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¶glich";
  return "PrÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼fen";
}

function getItemKeyFacts(item: RequestItem) {
  const facts: string[] = [];

  facts.push(`Menge: ${toNumber(item.quantity, 1)}`);

  if (item.product_type) facts.push(`Typ: ${item.product_type}`);
  if (item.category) facts.push(`Kategorie: ${item.category}`);
  if (item.format) facts.push(`Format: ${item.format}`);
  if (item.lineature) {
    if (item.lineature === "explicit_zero" || item.lineature === "0") {
      facts.push("Lineatur: 0");
    } else if (item.lineature === "8") {
      facts.push("Lineatur: 8f");
    } else {
      facts.push(`Lineatur: ${item.lineature}`);
    }
  }
  if (item.color) facts.push(`Farbe: ${item.color}`);

  return facts;
}

function getOfferItemSourceLabel(source: string | null) {
  switch (source) {
    case "auto_preselected":
      return "Automatisch vorausgewÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¤hlt";
    case "auto_safe_match":
      return "Sicher automatisch ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼bernommen";
    case "match":
      return "Aus Produktvorschlag ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼bernommen";
    case "admin_manual":
      return "Manuell im Admin ergÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¤nzt";
    case "manual":
      return "Manuell ergÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¤nzt";
    case "customer":
    case "customer_selected":
      return "Vom Kunden gewÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¤hlt";
    default:
      return source || "Unbekannte Quelle";
  }
}
function compareMatchesStable(a: RequestMatch, b: RequestMatch) {
  const scoreDifference =
    toNumber(b.match_score, 0) - toNumber(a.match_score, 0);

  if (scoreDifference !== 0) return scoreDifference;

  const nameComparison = String(a.product_name || "").localeCompare(
    String(b.product_name || ""),
    "de",
    {
      numeric: true,
      sensitivity: "base",
    }
  );

  if (nameComparison !== 0) return nameComparison;

  const skuComparison = String(a.product_sku || "").localeCompare(
    String(b.product_sku || ""),
    "de",
    {
      numeric: true,
      sensitivity: "base",
    }
  );

  if (skuComparison !== 0) return skuComparison;

  return String(a.id).localeCompare(String(b.id), "de", {
    numeric: true,
    sensitivity: "base",
  });
}

function getEventText(event: EventRow) {
  return event.description || event.message || null;
}

function getQuestionStatusLabel(status: string | null) {
  switch (status) {
    case "pending":
      return "Wartet auf Kundenantwort";
    case "answered":
      return "Antwort erhalten";
    case "resolved":
      return "Erledigt";
    case "cancelled":
      return "ZurÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼ckgezogen";
    default:
      return status || "Unbekannt";
  }
}

function getQuestionStatusClasses(status: string | null) {
  switch (status) {
    case "pending":
      return "border-[#F1D1A8] bg-[#FFF8EE] text-[#A75B28]";
    case "answered":
      return "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]";
    case "resolved":
      return "border-[#D6E7EF] bg-[#F5FAFD] text-[#12395F]";
    case "cancelled":
      return "border-[#E8DED2] bg-white text-[#52616F]";
    default:
      return "border-[#E8DED2] bg-white text-[#52616F]";
  }
}

function isArchivedSchoolRequest(request: SchoolRequest) {
  return (
    request.is_active === false ||
    request.status === "archived" ||
    Boolean(request.archived_at)
  );
}

function getArchiveReasonLabel(reason?: string | null) {
  switch (reason) {
    case "auto_unpaid_14_days":
      return "Automatisch archiviert: lÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¤nger als 14 Tage nicht bezahlt";
    default:
      return reason || "Archiviert";
  }
}

function cleanChildText(value: unknown) {
  const text = String(value || "").trim();
  return text.length > 0 ? text : null;
}

const RESOLVED_REQUEST_ITEM_STATUSES = new Set([
  "customer_supplies_self",
  "covered_by_alternative",
  "not_needed",
  "resolved",
  "done",
  "ignored",
]);

function getResolvedRequestItemStatus(item: RequestItem) {
  const record = item as {
    status?: string | null;
    admin_resolution_status?: string | null;
  };

  const adminStatus = String(record.admin_resolution_status || "")
    .trim()
    .toLowerCase();
  const itemStatus = String(record.status || "")
    .trim()
    .toLowerCase();

  if (RESOLVED_REQUEST_ITEM_STATUSES.has(adminStatus)) return adminStatus;
  if (RESOLVED_REQUEST_ITEM_STATUSES.has(itemStatus)) return itemStatus;

  return "";
}

function getResolvedRequestItemLabel(status: string) {
  switch (status) {
    case "customer_supplies_self":
      return "Kunde besorgt selbst";
    case "covered_by_alternative":
      return "Durch Alternative/Sammelposition abgedeckt";
    case "not_needed":
      return "Vom Kunden entfernt";
    case "resolved":
    case "done":
    case "ignored":
      return "Erledigt";
    default:
      return "";
  }
}
function isManualAdminRequestItem(item: RequestItem) {
  return item.status === "manual_admin_added";
}

function getAdminRequestItemTime(item: RequestItem) {
  const parsed = Date.parse(String(item.created_at || ""));

  return Number.isFinite(parsed) ? parsed : 0;
}

function compareAdminRequestItems(a: RequestItem, b: RequestItem) {
  const aIsManual = isManualAdminRequestItem(a);
  const bIsManual = isManualAdminRequestItem(b);

  if (aIsManual !== bIsManual) {
    return aIsManual ? -1 : 1;
  }

  if (aIsManual && bIsManual) {
    return getAdminRequestItemTime(b) - getAdminRequestItemTime(a);
  }

  return getAdminRequestItemTime(a) - getAdminRequestItemTime(b);
}
function getChildRowId(row: unknown) {
  const record = row as { child_id?: string | null };

  return String(record.child_id || "").trim() || null;
}

function getAdminChildLabel(child: RequestChild, index: number) {
  return (
    cleanChildText(child.label) ||
    cleanChildText(child.child_name) ||
    `Kind ${index + 1}`
  );
}

function AdminChildBadge({
  label,
  tone = "blue",
}: {
  label: string;
  tone?: "blue" | "amber";
}) {
  return (
    <span
      className={
        tone === "amber"
          ? "inline-flex w-fit items-center rounded-full border border-[#F1D1A8] bg-[#FFF8EE] px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-[#A75B28]"
          : "inline-flex w-fit items-center rounded-full border border-[#D6E7EF] bg-[#F5FAFD] px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-[#12395F]"
      }
    >
      {label}
    </span>
  );
}

function getAdminChildBadgeLabel(
  row: unknown,
  children: RequestChild[],
  request: SchoolRequest
) {
  const childId = getChildRowId(row);

  if (children.length === 0) {
    return request.child_name || "Kind 1";
  }

  if (!childId) {
    return "Nicht zugeordnet";
  }

  const childIndex = children.findIndex((child) => child.id === childId);
  const child = childIndex >= 0 ? children[childIndex] : null;

  if (!child) {
    return "Unbekanntes Kind";
  }

  return getAdminChildLabel(child, childIndex);
}
function AdminRequestChildrenOverview({
  request,
  children,
  files,
  items,
  offerItems,
  questions,
}: {
  request: SchoolRequest;
  children: RequestChild[];
  files: RequestFile[];
  items: RequestItem[];
  offerItems: OfferItem[];
  questions: RequestItemQuestion[];
}) {
  const hasRealChildren = children.length > 0;

  const fallbackChild = {
    id: "fallback-child",
    request_id: request.id,
    sort_order: 1,
    label: request.child_name || "Kind 1",
    child_name: request.child_name,
    school_name: request.school_name,
    class_name: request.class_name,
    source: "fallback",
    notes: null,
    is_active: true,
  } as RequestChild;

  const activeChildren = hasRealChildren ? children : [fallbackChild];

  const offerItemsByRequestItemId = new Set(
    offerItems
      .map((offerItem) => offerItem.request_item_id)
      .filter(Boolean) as string[]
  );

  const getRequestItemDisplayTitle = (item: RequestItem) => {
    const record = item as unknown as {
      normalized_name?: string | null;
      raw_text?: string | null;
      quantity?: number | string | null;
      format?: string | null;
      color?: string | null;
      lineature?: string | null;
      admin_resolution_status?: string | null;
    };

    return (
      cleanChildText(record.normalized_name) ||
      cleanChildText(record.raw_text) ||
      "Unbekannte Listenposition"
    );
  };

  const getRequestItemMeta = (item: RequestItem) => {
    const record = item as unknown as {
      quantity?: number | string | null;
      format?: string | null;
      color?: string | null;
      lineature?: string | null;
      category?: string | null;
      admin_resolution_status?: string | null;
    };

    return [
      record.quantity ? `Menge: ${record.quantity}` : null,
      cleanChildText(record.category)
        ? `Kategorie: ${cleanChildText(record.category)}`
        : null,
      cleanChildText(record.format) ? `Format: ${cleanChildText(record.format)}` : null,
      cleanChildText(record.color) ? `Farbe: ${cleanChildText(record.color)}` : null,
      cleanChildText(record.lineature)
        ? `Lineatur: ${cleanChildText(record.lineature)}`
        : null,
      cleanChildText(record.admin_resolution_status)
        ? `Status: ${cleanChildText(record.admin_resolution_status)}`
        : null,
    ].filter(Boolean) as string[];
  };

  const getOfferItemTitle = (item: OfferItem) => {
    const record = item as unknown as {
      product_name?: string | null;
      product_sku?: string | null;
    };

    return cleanChildText(record.product_name) || "Unbekanntes Produkt";
  };

  const getOfferItemMeta = (item: OfferItem) => {
    const record = item as unknown as {
      quantity?: number | string | null;
      unit?: string | null;
      product_price?: number | string | null;
      source?: string | null;
      product_sku?: string | null;
    };

    const quantity = Number(record.quantity || 1) || 1;
    const price = Number(record.product_price || 0) || 0;
    const total = quantity * price;

    return [
      `Menge: ${quantity}${record.unit ? ` ${record.unit}` : ""}`,
      price > 0 ? `Summe: ${formatMoney(total)}` : null,
      cleanChildText(record.product_sku)
        ? `Art.-Nr.: ${cleanChildText(record.product_sku)}`
        : null,
      cleanChildText(record.source)
        ? getOfferItemSourceLabel(record.source || null)
        : null,
    ].filter(Boolean) as string[];
  };

  const getFileTitle = (file: RequestFile) => {
    const record = file as unknown as {
      original_filename?: string | null;
      filename?: string | null;
      file_name?: string | null;
      path?: string | null;
    };

    return (
      cleanChildText(record.original_filename) ||
      cleanChildText(record.filename) ||
      cleanChildText(record.file_name) ||
      cleanChildText(record.path) ||
      "Datei ohne Namen"
    );
  };

  const getQuestionTitle = (question: RequestItemQuestion) => {
    const record = question as unknown as {
      question_text?: string | null;
      status?: string | null;
      answer_text?: string | null;
    };

    return cleanChildText(record.question_text) || "RÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼ckfrage ohne Text";
  };

  const childIdByRequestItemId = new Map(
    items.map((item) => [item.id, getChildRowId(item)])
  );

  const getQuestionChildId = (question: RequestItemQuestion) => {
    const directChildId = getChildRowId(question);

    if (directChildId) {
      return directChildId;
    }

    const questionRequestItemId = String(
      question.request_item_id || ""
    ).trim();

    if (!questionRequestItemId) {
      return null;
    }

    return childIdByRequestItemId.get(questionRequestItemId) || null;
  };
  const groups = activeChildren.map((child, index) => {
    const childId = child.id;

    const rowBelongsToChild = (row: unknown) => {
      return hasRealChildren ? getChildRowId(row) === childId : true;
    };

    const childFiles = files.filter(rowBelongsToChild);
    const childItems = items.filter(rowBelongsToChild);
    const childOfferItems = offerItems.filter(rowBelongsToChild);
    const childQuestions = questions.filter((question) => {
      return hasRealChildren ? getQuestionChildId(question) === childId : true;
    });

    const childOpenItems = childItems.filter((item) => {
      const record = item as unknown as {
        id?: string | null;
        admin_resolution_status?: string | null;
      };                    const adminResolutionStatus = getResolvedRequestItemStatus(item);
                    const adminResolutionLabel =
                      getResolvedRequestItemLabel(adminResolutionStatus);
                    const itemIsDone =
                      selectedItems.length > 0 || Boolean(adminResolutionStatus);

                    return (
                      <details
                        id={`position-${item.id}`}
                        key={item.id}
                        open={!itemIsDone}
                        className="scroll-mt-28 rounded-[28px] border border-[#E8DED2] bg-[#FBF7F0] p-4 [&_summary::-webkit-details-marker]:hidden"
                      >
                        <summary className="cursor-pointer list-none">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                              Position {index + 1}
                            </p>

                              <AdminChildBadge
                                label={getAdminChildBadgeLabel(
                                  item,
                                  requestChildren,
                                  request
                                )}
                                tone={getChildRowId(item) ? "blue" : "amber"}
                              />
                            </div>

                            <h3 className="mt-1 text-lg font-black text-[#102A43]">
                              {getRequestItemTitle(item)}
                            </h3>
                            {adminResolutionLabel ? (
                              <div className="mt-2">
                                <span className="inline-flex rounded-full border border-[#BFE3CD] bg-[#F0FFF6] px-3 py-1 text-xs font-black text-[#2F7D50]">
                                  {adminResolutionLabel}
                                </span>
                              </div>
                            ) : null}

                            <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-[#52616F]">
                              {getItemKeyFacts(item).map((fact) => (
                                <span
                                  key={fact}
                                  className="rounded-full bg-white px-3 py-1"
                                >
                                  {fact}
                                </span>
                              ))}
                            </div>
                          </div>

                          {selectedItems.length > 0 ? (
                            <div className="inline-flex items-center gap-2 rounded-full bg-[#F0FFF6] px-3 py-2 text-xs font-black text-[#2F7D50]">
                              <CheckCircle2 className="h-4 w-4" />
                              im Paketwunsch
                            </div>
                          ) : itemMatches.length === 0 ? (
                            <div className="inline-flex items-center gap-2 rounded-full bg-[#FFF8EE] px-3 py-2 text-xs font-black text-[#A75B28]">
                              <AlertTriangle className="h-4 w-4" />
                              manuell prÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼fen
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-xs font-black text-[#52616F]">
                          {itemIsDone ? "Details ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¶ffnen" : "Details einklappen"}
                        </div>
                        {item.status === "manual_admin_added" ? (
                          <AdminDeleteRequestItemButton
                            requestId={request.id}
                            requestItemId={item.id}
                            itemLabel={getRequestItemTitle(item)}
                          />
                        ) : null}
                        </summary>

                        {item.notes ? (
                          <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-xs font-semibold leading-5 text-[#52616F]">
                            {item.notes}
                          </p>
                        ) : null}

                        {adminResolutionStatus ? (
                          <div className="mt-4 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
                                  Position erledigt
                                </p>
                                <p className="mt-1 text-sm font-bold leading-6 text-[#102A43]">
                                  {adminResolutionLabel}
                                </p>
                              </div>

                              <AdminResolveRequestItemButton
                                requestId={request.id}
                                requestItemId={item.id}
                                resolutionStatus="open"
                                buttonLabel="Wieder ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¶ffnen"
                                confirmMessage="Soll diese Position wieder als offen markiert werden?"
                                className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[#BFE3CD] bg-white px-4 py-2 text-xs font-black text-[#2F7D50] transition hover:bg-[#F0FFF6]"
                              />
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-4 rounded-2xl border border-[#E8DED2] bg-white p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                                RÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼ckfragen
                              </p>
                              <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                                Stelle hier eine konkrete RÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼ckfrage zu dieser Listenposition.
                                Die Antwort erscheint danach direkt an dieser Position.
                              </p>
                            </div>

                            <AdminRequestItemQuestionForm
                              requestId={request.id}
                              requestItemId={item.id}
                              itemLabel={getRequestItemTitle(item)}
                            />
                          </div>

                          {itemQuestions.length > 0 ? (
                            <div className="mt-4 grid gap-3">
                              {itemQuestions.map((question) => (
                                <div
                                  key={question.id}
                                  className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4"
                                >
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                      <div className="mb-2 flex flex-wrap items-center gap-2">
                                        <span
                                          className={`rounded-full border px-3 py-1 text-xs font-black ${getQuestionStatusClasses(
                                            question.status
                                          )}`}
                                        >
                                          {getQuestionStatusLabel(question.status)}
                                        </span>

                                        {question.created_at ? (
                                          <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#52616F]">
                                            {formatDateTime(question.created_at)}
                                          </span>
                                        ) : null}
                                      </div>

                                      <p className="text-sm font-black text-[#102A43]">
                                        Frage
                                      </p>
                                      <p className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-6 text-[#52616F]">
                                        {question.question_text}
                                      </p>

                                      {question.answer_text ? (
                                        <div className="mt-3 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] p-3">
                                          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
                                            Kundenantwort
                                          </p>
                                          <p className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-6 text-[#102A43]">
                                            {question.answer_text}
                                          </p>
                                          {question.answered_at ? (
                                            <p className="mt-2 text-xs font-bold text-[#52616F]">
                                              Beantwortet am {formatDateTime(question.answered_at)}
                                            </p>
                                          ) : null}
                                        </div>
                                      ) : null}
                                    </div>

                                    {question.status !== "resolved" &&
                                    question.status !== "cancelled" ? (
                                      <AdminResolveQuestionButton
                                        requestId={request.id}
                                        questionId={question.id}
                                      />
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        {selectedItems.length > 0 ? (
                          <div className="mt-4 grid gap-3">
                            {selectedItems.map((selectedItem) => (
                              <div
                                key={selectedItem.id}
                                className="rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] p-4"
                              >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                  <div>
                                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
                                      Im Paketwunsch
                                    </p>
                                    <p className="mt-1 font-black text-[#102A43]">
                                      {selectedItem.product_name}
                                    </p>
                                    <p className="mt-1 text-xs font-semibold text-[#52616F]">
                                      {selectedItem.product_sku
                                        ? `Art.-Nr.: ${selectedItem.product_sku}`
                                        : "Ohne Art.-Nr."}
                                    </p>
                                  </div>

                                  <div className="text-left sm:text-right">
                                    <p className="text-sm font-bold text-[#52616F]">
                                      Menge: {toNumber(selectedItem.quantity, 1)}
                                    </p>
                                    <p className="text-lg font-black text-[#102A43]">
                                      {formatMoney(
                                        toNumber(selectedItem.quantity, 1) *
                                          toNumber(selectedItem.product_price, 0)
                                      )}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {itemMatches.length > 0 ? (
                          <div className="mt-4 grid gap-3">
                            {itemMatches.map((match) => {
                              const isSelected = offerMatchIds.has(match.id);

                              return (
                                <div
                                  key={match.id}
                                  className={`rounded-2xl border p-4 ${
                                    isSelected
                                      ? "border-[#BFE3CD] bg-[#F0FFF6]"
                                      : "border-[#E8DED2] bg-white"
                                  }`}
                                >
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                      <div className="mb-2 flex flex-wrap items-center gap-2">
                                        <span className="rounded-full bg-[#F0FFF6] px-3 py-1 text-xs font-black text-[#2F7D50]">
                                          {getMatchScoreLabel(match.match_score)} ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â·{" "}
                                          {toNumber(match.match_score, 0)} %
                                        </span>

                                        {isSelected ? (
                                          <span className="rounded-full bg-[#102A43] px-3 py-1 text-xs font-black text-white">
                                            AusgewÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¤hlt
                                          </span>
                                        ) : null}
                                      </div>

                                      <p className="font-black text-[#102A43]">
                                        {match.product_name || "Produktvorschlag"}
                                      </p>

                                      <p className="mt-1 text-xs font-semibold text-[#52616F]">
                                        {match.product_sku
                                          ? `Art.-Nr.: ${match.product_sku}`
                                          : "Ohne Art.-Nr."}
                                      </p>

                                      {match.match_reason ? (
                                        <p className="mt-2 text-xs leading-5 text-[#52616F]">
                                          {match.match_reason}
                                        </p>
                                      ) : null}
                                    </div>

                                    <p className="text-lg font-black text-[#102A43]">
                                      {formatMoney(match.product_price)}

                                      {isSelected ? (
                                        <p className="mt-3 rounded-full bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">
                                          Bereits im Paket
                                        </p>
                                      ) : match.product_id ? (
                                        <div className="mt-3">
                                          <AdminAcceptMatchButton
                                            requestId={request.id}
                                            matchId={match.id}
                                            label="In Paket ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼bernehmen"
                                          />
                                        </div>
                                      ) : null}                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : selectedItems.length === 0 ? (
                          <div className="mt-4 rounded-2xl border border-[#E16B6B] bg-[#FFF1F1] px-5 py-5 text-center">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#C62828] text-xl font-black leading-none text-white">
                                !
                              </div>

                              <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#B42318]">
                                Manuelle PrÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼fung
                              </p>

                              <p className="text-sm font-black leading-6 text-[#8E1C1C]">
                                Kein passender Produktvorschlag vorhanden.
                              </p>
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-4 rounded-2xl border border-[#D8C8B8] bg-white p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
                              <Wrench className="h-4 w-4" />
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                                Manuelle Bearbeitung
                              </p>

                              <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                                Hier kannst Du fÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼r diese erkannte Position
                                jederzeit einen zusÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¤tzlichen oder ersetzenden
                                Artikel in den Paketwunsch ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼bernehmen.
                              </p>

                              {selectedItems.length === 0 && !adminResolutionStatus ? (
                                <div className="mt-4 mb-4 grid gap-2 sm:grid-cols-2">
                                  <AdminResolveRequestItemButton
                                    requestId={request.id}
                                    requestItemId={item.id}
                                    resolutionStatus="customer_supplies_self"
                                    buttonLabel="Kunde besorgt selbst"
                                    confirmMessage="Diese Position als erledigt markieren, weil der Kunde sie selbst besorgt?"
                                    className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-[#D8C8B8] bg-white px-4 py-3 text-sm font-black text-[#102A43] transition hover:border-[#12395F] hover:bg-[#F5FAFD]"
                                  />

                                  <AdminResolveRequestItemButton
                                    requestId={request.id}
                                    requestItemId={item.id}
                                    resolutionStatus="covered_by_alternative"
                                    buttonLabel="Durch Alternative/Sammelposition abgedeckt"
                                    confirmMessage="Diese Position als erledigt markieren, weil sie durch eine Alternative oder Sammelposition abgedeckt ist?"
                                    className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] px-4 py-3 text-sm font-black text-[#2F7D50] transition hover:brightness-105"
                                  />
                                </div>
                              ) : null}

                              <AdminManualOfferItemForm
                                requestId={request.id}
                                requestItemId={item.id}
                                childOptions={manualOfferChildOptions}
                                defaultChildId={getChildRowId(item)}
                                childSelectLabel="Kind fÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼r diese Paketposition"
                                defaultProductName={getRequestItemTitle(item)}
                                defaultQuantity={item.quantity}
                                buttonLabel="Manuell Produkt ergÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¤nzen"
                              />
                            </div>
                          </div>
                        </div>
                      </details>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-[28px] border border-[#F1D1A8] bg-[#FFF8EE] p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#A75B28]">
                      <AlertTriangle className="h-5 w-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                        Manuelle Bearbeitung
                      </p>

                      <h3 className="mt-1 text-xl font-black text-[#102A43]">
                        Noch keine Positionen erkannt.
                      </h3>

                      <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
                        Die automatische Erkennung konnte keine eindeutigen
                        Listenpositionen erstellen. Du kannst trotzdem direkt
                        Produkte in den Paketwunsch legen. Diese Produkte
                        erscheinen anschlieÃƒÆ’Ã†â€™Ãƒâ€¦Ã‚Â¸end auf der Kundenseite und kÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¶nnen
                        dem Kunden per Paketwunsch-Mail geschickt werden.
                      </p>

                      <AdminManualOfferItemForm
                        requestId={request.id}
                        requestItemId={null}
                childOptions={manualOfferChildOptions}
                defaultChildId={
                  manualOfferChildOptions.length === 1
                    ? manualOfferChildOptions[0]?.id || null
                    : null
                }
                childSelectLabel="Kind fÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼r freie Paketposition"
                        defaultProductName=""
                        defaultQuantity={1}
                        buttonLabel="Produkt ohne erkannte Position hinzufÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼gen"
                      />
                    </div>
                  </div>
                </div>
              )}
            </section>

            <AdminOfferRecommendationsPanel requestId={request.id} />

            <section className="rounded-[28px] border border-[#C8D8E8] bg-[#EEF4FA] p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#12395F]">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#12395F]">
                    NÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¤chster Abschnitt
                  </p>
                  <h2 className="mt-1 text-xl font-black text-[#102A43]">
                    Rechnung, Zahlung und Abwicklung
                  </h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
                    Diese Schritte kommen erst nach der fachlichen ProduktprÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼fung.
                    Dadurch bleibt die Detailseite in der gleichen Reihenfolge
                    wie der echte Arbeitsablauf.
                  </p>
                </div>
              </div>
            </section>

            <AdminInvoicePaymentPanel
              requestId={request.id}
              fulfillmentMethod={request.fulfillment_method}
              subtotalAmount={selectedTotal}
              currentShippingAmount={request.shipping_amount}
              currentInvoiceTotalAmount={request.invoice_total_amount}
              invoiceStatus={request.invoice_status}
              paymentStatus={request.payment_status}
              selectedPaymentMethod={request.selected_payment_method}
              cashOnPickupAllowed={request.cash_on_pickup_allowed}
              cashOnPickupAllowedAt={request.cash_on_pickup_allowed_at}
              cashOnPickupAllowedNote={request.cash_on_pickup_allowed_note}
            />

            <div id="picking-abwicklung" className="scroll-mt-8">
              <AdminFulfillmentPanel
                requestId={request.id}
                requestStatus={request.status}
                offerStatus={request.offer_status}
                fulfillmentMethod={request.fulfillment_method}
                fulfillmentStatus={request.fulfillment_status}
                pickingStatus={request.picking_status}
                shippingCostStatus={request.shipping_cost_status}
                selectedPaymentMethod={request.selected_payment_method}
                paymentStatus={request.payment_status}
                pickupLocationLabel={request.pickup_location_label}
                pickupAddressSnapshot={request.pickup_address_snapshot}
                pickupMapsUrlSnapshot={request.pickup_maps_url_snapshot}
                confirmedAt={request.confirmed_at}
                pickingStartedAt={request.picking_started_at}
                pickedAt={request.picked_at}
                packedAt={request.packed_at}
                shippedAt={request.shipped_at}
                pickedUpAt={request.picked_up_at}
                offerItems={offerItems}
              />
            </div>

            <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
                  <FileText className="h-5 w-5" />
                </div>

                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                    Verlauf
                  </p>

                  <h2 className="text-xl font-black text-[#102A43]">
                    Letzte Ereignisse
                  </h2>
                </div>
              </div>

              {events.length > 0 ? (
                <div className="space-y-3">
                  {events.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4"
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <p className="font-black text-[#102A43]">
                          {event.title ||
                            event.event_type ||
                            event.type ||
                            "Ereignis"}
                        </p>

                        <p className="text-xs font-bold text-[#52616F]">
                          {formatDateTime(event.created_at)}
                        </p>
                      </div>

                      {getEventText(event) ? (
                        <p className="mt-2 text-sm leading-6 text-[#52616F]">
                          {getEventText(event)}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl bg-[#FBF7F0] p-4 text-sm font-semibold text-[#52616F]">
                  Noch keine Ereignisse vorhanden.
                </p>
              )}
            </section>
          </section>
        </section>
      </section>
    </main>
  );
}





