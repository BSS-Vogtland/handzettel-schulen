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
import AdminDeleteOfferItemButton from "@/components/AdminDeleteOfferItemButton";
import AdminEditOfferItemForm from "@/components/AdminEditOfferItemForm";
import CopyOfferLinkButton from "@/components/CopyOfferLinkButton";
import AdminSendOfferUpdateMailButton from "@/components/AdminSendOfferUpdateMailButton";
import AdminSendRequestReceivedMailButton from "@/components/AdminSendRequestReceivedMailButton";
import AdminOfferWorkflowStatus from "@/components/AdminOfferWorkflowStatus";
import AdminFulfillmentPanel from "@/components/AdminFulfillmentPanel";
import AdminInvoicePaymentPanel from "@/components/AdminInvoicePaymentPanel";
import AdminRematchRequestButton from "@/components/AdminRematchRequestButton";
import AdminReanalyzeRequestButton from "@/components/AdminReanalyzeRequestButton";
import AdminAdoptSafeMatchesButton from "@/components/AdminAdoptSafeMatchesButton";
import AdminRequestItemQuestionForm from "@/components/AdminRequestItemQuestionForm";
import AdminResolveQuestionButton from "@/components/AdminResolveQuestionButton";

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

  created_at: string | null;
  updated_at: string | null;
};

type RequestFile = {
  id: string;
  request_id: string;
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
  created_at: string | null;
  updated_at: string | null;
};

type EventRow = {
  id: string;
  request_id: string;
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
  if (!value) return "—";

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatFileSize(size: number | null) {
  if (!size) return "—";

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
      return "Analyse läuft";
    case "analysis_done":
      return "Analyse fertig";
    case "manual_review":
      return "Manuelle Prüfung";
    case "offer_created":
      return "Angebot erstellt";
    case "offer_sent":
      return "Angebot gesendet";
    case "confirmed":
      return "Bestätigt";
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
      return "Produktvorschläge erstellt";
    case "offer_created":
      return "Angebot erstellt";
    case "offer_sent":
      return "Angebot gesendet";
    case "customer_selection":
      return "Kundenauswahl";
    case "manual_review":
      return "Manuelle Prüfung";
    case "confirmed":
      return "Bestätigt";
    default:
      return status || "—";
  }
}

function getAiStatusLabel(status: string | null) {
  switch (status) {
    case "pending":
      return "Offen";
    case "running":
      return "Läuft";
    case "done":
      return "Fertig";
    case "error":
      return "Fehler";
    case "manual_review":
      return "Manuelle Prüfung";
    case "missing_file":
      return "Datei fehlt";
    case "unsupported_file_type":
      return "Dateityp nicht unterstützt";
    case "no_items_detected":
      return "Keine Positionen erkannt";
    default:
      return status || "—";
  }
}

function getRequestItemTitle(item: RequestItem) {
  return item.normalized_name || item.raw_text || "Unbekannte Position";
}

function getMatchScoreLabel(score: unknown) {
  const value = toNumber(score, 0);

  if (value >= 85) return "Sehr passend";
  if (value >= 70) return "Passend";
  if (value >= 55) return "Möglich";
  return "Prüfen";
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
      return "Zurückgezogen";
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

export default async function AdminRequestDetailPage({ params }: Params) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: requestData, error: requestError } = await supabase
    .from("school_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (requestError) {
    throw new Error(`Anfrage konnte nicht geladen werden: ${requestError.message}`);
  }

  if (!requestData) {
    notFound();
  }

  const request = requestData as SchoolRequest;

  const [
    { data: filesData, error: filesError },
    { data: itemsData, error: itemsError },
    { data: offerItemsData, error: offerItemsError },
    { data: questionsData, error: questionsError },
    { data: eventsData, error: eventsError },
  ] = await Promise.all([
    supabase
      .from("school_request_files")
      .select("*")
      .eq("request_id", request.id)
      .order("created_at", { ascending: true }),

    supabase
      .from("school_request_items")
      .select("*")
      .eq("request_id", request.id)
      .order("created_at", { ascending: true }),

    supabase
      .from("school_offer_items")
      .select("*")
      .eq("request_id", request.id)
      .order("created_at", { ascending: true }),

    supabase
      .from("school_request_item_questions")
      .select("*")
      .eq("request_id", request.id)
      .neq("status", "cancelled")
      .order("created_at", { ascending: true }),

    supabase
      .from("school_request_events")
      .select("*")
      .eq("request_id", request.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (filesError) {
    throw new Error(`Dateien konnten nicht geladen werden: ${filesError.message}`);
  }

  if (itemsError) {
    throw new Error(`Positionen konnten nicht geladen werden: ${itemsError.message}`);
  }

  if (offerItemsError) {
    throw new Error(
      `Ausgewählte Produkte konnten nicht geladen werden: ${offerItemsError.message}`
    );
  }

  if (questionsError) {
    throw new Error(
      `Rückfragen konnten nicht geladen werden: ${questionsError.message}`
    );
  }

  if (eventsError) {
    throw new Error(`Events konnten nicht geladen werden: ${eventsError.message}`);
  }

  const files = (filesData || []) as RequestFile[];
  const items = (itemsData || []) as RequestItem[];
  const offerItems = (offerItemsData || []) as OfferItem[];
  const questions = (questionsData || []) as RequestItemQuestion[];
  const events = (eventsData || []) as EventRow[];

  const questionsByRequestItem = new Map<string, RequestItemQuestion[]>();
  const generalQuestions: RequestItemQuestion[] = [];

  for (const question of questions) {
    if (!question.request_item_id) {
      generalQuestions.push(question);
      continue;
    }

    const current = questionsByRequestItem.get(question.request_item_id) || [];
    current.push(question);
    questionsByRequestItem.set(question.request_item_id, current);
  }

  const itemIds = items.map((item) => item.id);

  let matches: RequestMatch[] = [];

  if (itemIds.length > 0) {
    const { data: matchesData, error: matchesError } = await supabase
      .from("school_request_matches")
      .select("*")
      .in("request_item_id", itemIds)
      .order("request_item_id", { ascending: true })
      .order("match_score", { ascending: false })
      .order("product_name", { ascending: true })
      .order("product_sku", { ascending: true })
      .order("id", { ascending: true });

    if (matchesError) {
      throw new Error(
        `Produktvorschläge konnten nicht geladen werden: ${matchesError.message}`
      );
    }

    matches = ((matchesData || []) as RequestMatch[]).sort(compareMatchesStable);
  }

  const matchesByItem = new Map<string, RequestMatch[]>();

  for (const item of items) {
    const itemMatches = matches
      .filter((match) => match.request_item_id === item.id)
      .sort(compareMatchesStable);

    matchesByItem.set(item.id, itemMatches);
  }

  const offerItemsByRequestItem = new Map<string, OfferItem[]>();
  const offerMatchIds = new Set<string>();

  for (const offerItem of offerItems) {
    if (offerItem.match_id) {
      offerMatchIds.add(offerItem.match_id);
    }

    if (offerItem.request_item_id) {
      const current = offerItemsByRequestItem.get(offerItem.request_item_id) || [];
      current.push(offerItem);
      offerItemsByRequestItem.set(offerItem.request_item_id, current);
    }
  }

  const manualReviewItems = items.filter((item) => {
    const selected = offerItemsByRequestItem.get(item.id) || [];
    const itemMatches = matchesByItem.get(item.id) || [];

    return selected.length === 0 && itemMatches.length === 0;
  });

  const manualReviewCount =
    manualReviewItems.length + (items.length === 0 ? 1 : 0);

  const selectedTotal = offerItems.reduce((sum, item) => {
    return sum + toNumber(item.quantity, 1) * toNumber(item.product_price, 0);
  }, 0);

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://www.handzettel-schulen.de";

  const customerOfferUrl = request.offer_token
    ? `${siteUrl}/angebot/${request.offer_token}`
    : null;

  const signedFiles = await Promise.all(
    files.map(async (file) => {
      if (!file.storage_path) {
        return {
          ...file,
          signedUrl: file.file_url || null,
        };
      }

      const { data } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(file.storage_path, 60 * 30);

      return {
        ...file,
        signedUrl: data?.signedUrl || file.file_url || null,
      };
    })
  );

  const refreshedAt = new Date().toISOString();

  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/admin/anfragen"
            className="inline-flex items-center gap-2 text-sm font-black text-[#12395F] transition hover:text-[#B5282D]"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zur Übersicht
          </Link>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href={`/admin/anfragen/${request.id}`}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#102A43] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
            >
              <RefreshCw className="h-4 w-4" />
              Aktualisieren
            </a>

            <AdminReanalyzeRequestButton
              requestId={request.id}
              itemCount={items.length}
              offerItemsCount={offerItems.length}
            />

            <AdminRematchRequestButton
              requestId={request.id}
              itemCount={items.length}
            />

            <AdminAdoptSafeMatchesButton
              requestId={request.id}
              itemCount={items.length}
            />

            {customerOfferUrl ? (
              <>
                <a
                  href={customerOfferUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
                >
                  <Eye className="h-4 w-4" />
                  Kundenseite öffnen
                </a>

                <div className="sm:min-w-[250px]">
                  <CopyOfferLinkButton url={customerOfferUrl} variant="primary" />
                </div>
              </>
            ) : null}
          </div>
        </div>

        <header className="rounded-[34px] border border-[#E8DED2] bg-white p-5 shadow-[0_18px_45px_rgba(16,42,67,0.10)] sm:p-7">
          <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">
                <ClipboardList className="h-3.5 w-3.5" />
                Admin-Detailansicht
              </div>

              <h1 className="text-3xl font-black tracking-tight text-[#102A43] sm:text-4xl">
                Anfrage {request.request_number || request.id}
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#52616F] sm:text-base">
                Diese Detailansicht folgt jetzt dem echten Arbeitsablauf:
                zuerst Anfrage und Kundendaten, dann Materialliste und
                Produktprüfung, danach Paketwunsch-Mail, Rechnung, Zahlung und
                Abwicklung. Spätere Schritte liegen bewusst weiter unten.
              </p>
            </div>

            <div className="rounded-[28px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
              <div className="grid gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-[#52616F]">Anfrage</span>
                  <span className="font-black text-[#102A43]">
                    {getStatusLabel(request.status)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-[#52616F]">KI</span>
                  <span className="font-black text-[#102A43]">
                    {getAiStatusLabel(request.ai_status)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-[#52616F]">Angebot</span>
                  <span className="font-black text-[#102A43]">
                    {getOfferStatusLabel(request.offer_status)}
                  </span>
                </div>

                <div className="h-px bg-[#E8DED2]" />

                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-[#52616F]">Erstellt</span>
                  <span className="font-black text-[#102A43]">
                    {formatDate(request.created_at)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-[#52616F]">Geladen</span>
                  <span className="font-black text-[#102A43]">
                    {formatDateTime(refreshedAt)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F4E9DC] text-[#A75B28]">
              <FileText className="h-5 w-5" />
            </div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Erkannte Positionen
            </p>
            <p className="mt-2 text-3xl font-black">{items.length}</p>
          </div>

          <div className="rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F4E9DC] text-[#A75B28]">
              <Sparkles className="h-5 w-5" />
            </div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Vorschläge
            </p>
            <p className="mt-2 text-3xl font-black">{matches.length}</p>
          </div>

          <div className="rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F4E9DC] text-[#A75B28]">
              <PackageCheck className="h-5 w-5" />
            </div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Paketpositionen
            </p>
            <p className="mt-2 text-3xl font-black">{offerItems.length}</p>
          </div>

          <div className="rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF4E5] text-[#A75B28]">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Manuell prüfen
            </p>
            <p className="mt-2 text-3xl font-black">{manualReviewCount}</p>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <aside className="space-y-6">
            <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                    Kunde
                  </p>
                  <h2 className="font-black text-[#102A43]">
                    {request.customer_name || "Nicht angegeben"}
                  </h2>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="rounded-2xl bg-[#FBF7F0] p-3">
                  <div className="mb-1 flex items-center gap-2 font-black text-[#102A43]">
                    <School className="h-4 w-4 text-[#A75B28]" />
                    Kind / Schule
                  </div>
                  <p className="text-[#52616F]">
                    {request.child_name || "Kind nicht angegeben"}
                  </p>
                  <p className="text-[#52616F]">
                    {request.school_name || "Schule nicht angegeben"}
                    {request.class_name ? ` · Klasse ${request.class_name}` : ""}
                  </p>
                </div>

                <div className="rounded-2xl bg-[#FBF7F0] p-3">
                  <div className="mb-1 flex items-center gap-2 font-black text-[#102A43]">
                    <Mail className="h-4 w-4 text-[#A75B28]" />
                    E-Mail
                  </div>
                  <p className="break-words text-[#52616F]">
                    {request.email || "Nicht angegeben"}
                  </p>
                </div>

                <div className="rounded-2xl bg-[#FBF7F0] p-3">
                  <div className="mb-1 flex items-center gap-2 font-black text-[#102A43]">
                    <Phone className="h-4 w-4 text-[#A75B28]" />
                    Telefon
                  </div>
                  <p className="break-words text-[#52616F]">
                    {request.phone || "Nicht angegeben"}
                  </p>
                </div>

                {request.message ? (
                  <div className="rounded-2xl bg-[#FBF7F0] p-3">
                    <p className="mb-1 font-black text-[#102A43]">Bemerkung</p>
                    <p className="whitespace-pre-wrap text-[#52616F]">
                      {request.message}
                    </p>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                    Datei
                  </p>
                  <h2 className="font-black text-[#102A43]">
                    Hochgeladene Liste
                  </h2>
                </div>
              </div>

              <div className="space-y-3">
                {signedFiles.length > 0 ? (
                  signedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-3"
                    >
                      <p className="font-black text-[#102A43]">
                        {file.original_filename || "Datei"}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-[#52616F]">
                        {formatFileSize(file.file_size)} ·{" "}
                        {file.file_type || "Dateityp unbekannt"}
                      </p>

                      {file.signedUrl ? (
                        <a
                          href={file.signedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#12395F] px-3 py-2 text-xs font-black text-white transition hover:brightness-110"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Datei öffnen
                        </a>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="rounded-2xl bg-[#FBF7F0] p-3 text-sm font-semibold text-[#52616F]">
                    Keine Datei gefunden.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
                  <ShoppingBasket className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                    Paketwunsch
                  </p>
                  <h2 className="font-black text-[#102A43]">
                    Aktuelle Positionen
                  </h2>
                </div>
              </div>

              {offerItems.length > 0 ? (
                <div className="space-y-3">
                  {offerItems.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-3"
                    >
                      <p className="font-black text-[#102A43]">
                        {item.product_name}
                      </p>

                      <p className="mt-1 text-xs font-semibold text-[#52616F]">
                        {item.product_sku
                          ? `Art.-Nr.: ${item.product_sku}`
                          : "Ohne Art.-Nr."}
                      </p>

                      <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                        <span className="font-semibold text-[#52616F]">
                          Menge: {toNumber(item.quantity, 1)}
                        </span>
                        <span className="font-black text-[#102A43]">
                          {formatMoney(
                            toNumber(item.quantity, 1) *
                              toNumber(item.product_price, 0)
                          )}
                        </span>
                      </div>

                      {item.source === "admin_manual" ? (
                        <p className="mt-2 inline-flex rounded-full bg-white px-3 py-1 text-xs font-black text-[#A75B28]">
                          Manuell ergänzt
                        </p>
                      ) : null}

                      <AdminEditOfferItemForm
                        requestId={request.id}
                        itemId={item.id}
                        productName={item.product_name}
                        productSku={item.product_sku}
                        productPrice={item.product_price}
                        quantity={item.quantity}
                        unit={item.unit}
                        notes={item.notes}
                      />

                      <AdminDeleteOfferItemButton
                        requestId={request.id}
                        itemId={item.id}
                        productName={item.product_name}
                      />
                    </div>
                  ))}

                  <div className="rounded-2xl bg-[#102A43] p-4 text-white">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-bold opacity-80">
                        Zwischensumme
                      </span>
                      <span className="text-xl font-black">
                        {formatMoney(selectedTotal)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="rounded-2xl bg-[#FBF7F0] p-3 text-sm font-semibold text-[#52616F]">
                  Noch keine Produkte im Paketwunsch.
                </p>
              )}
            </section>
          </aside>

          <section className="space-y-6">
            <AdminOfferWorkflowStatus
              requestStatus={request.status}
              offerStatus={request.offer_status}
              aiStatus={request.ai_status}
              itemsCount={items.length}
              offerItemsCount={offerItems.length}
              manualReviewItemsCount={manualReviewCount}
              events={events}
              updatedAt={request.updated_at}
            />

            <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
                  <Mail className="h-5 w-5" />
                </div>

                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                    Kundenkommunikation
                  </p>

                  <h2 className="text-xl font-black text-[#102A43]">
                    E-Mails an den Kunden
                  </h2>

                  <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                    Sende zuerst die Eingangsmail, wenn die Liste angekommen ist.
                    Nach der Auswertung und Vorbereitung sendest Du die
                    Paketwunsch-Mail mit dem Link zur Kundenseite.
                  </p>
                </div>
              </div>

              <div className="grid gap-4">
                <AdminSendRequestReceivedMailButton requestId={request.id} />
                <AdminSendOfferUpdateMailButton requestId={request.id} />
              </div>
            </section>

            <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
                  <ClipboardList className="h-5 w-5" />
                </div>

                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                    Erkannte Liste
                  </p>

                  <h2 className="text-xl font-black text-[#102A43]">
                    Positionen, Vorschläge und manuelle Bearbeitung
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-[#52616F]">
                    Unter jeder Position findest Du dauerhaft den Bereich
                    „Manuelle Bearbeitung“. Wenn keine Positionen erkannt
                    wurden, kannst Du trotzdem direkt Produkte in den
                    Paketwunsch übernehmen.
                  </p>
                </div>
              </div>

              {items.length > 0 ? (
                <div className="space-y-5">
                  {items.map((item, index) => {
                    const itemMatches = matchesByItem.get(item.id) || [];
                    const selectedItems = offerItemsByRequestItem.get(item.id) || [];
                    const itemQuestions = questionsByRequestItem.get(item.id) || [];

                    return (
                      <article
                        key={item.id}
                        className="rounded-[28px] border border-[#E8DED2] bg-[#FBF7F0] p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                              Position {index + 1}
                            </p>

                            <h3 className="mt-1 text-lg font-black text-[#102A43]">
                              {getRequestItemTitle(item)}
                            </h3>

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
                              manuell prüfen
                            </div>
                          ) : null}
                        </div>

                        {item.notes ? (
                          <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-xs font-semibold leading-5 text-[#52616F]">
                            {item.notes}
                          </p>
                        ) : null}

                        <div className="mt-4 rounded-2xl border border-[#E8DED2] bg-white p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                                Rückfragen
                              </p>
                              <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                                Stelle hier eine konkrete Rückfrage zu dieser Listenposition.
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
                                          {getMatchScoreLabel(match.match_score)} ·{" "}
                                          {toNumber(match.match_score, 0)} %
                                        </span>

                                        {isSelected ? (
                                          <span className="rounded-full bg-[#102A43] px-3 py-1 text-xs font-black text-white">
                                            Ausgewählt
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
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : selectedItems.length === 0 ? (
                          <div className="mt-4 rounded-2xl border border-[#E8DED2] bg-white p-4 text-sm font-semibold text-[#52616F]">
                            Kein passender Produktvorschlag vorhanden.
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
                                Hier kannst Du für diese erkannte Position
                                jederzeit einen zusätzlichen oder ersetzenden
                                Artikel in den Paketwunsch übernehmen.
                              </p>

                              <AdminManualOfferItemForm
                                requestId={request.id}
                                requestItemId={item.id}
                                defaultProductName={getRequestItemTitle(item)}
                                defaultQuantity={item.quantity}
                                buttonLabel="Manuell Produkt ergänzen"
                              />
                            </div>
                          </div>
                        </div>
                      </article>
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
                        erscheinen anschließend auf der Kundenseite und können
                        dem Kunden per Paketwunsch-Mail geschickt werden.
                      </p>

                      <AdminManualOfferItemForm
                        requestId={request.id}
                        requestItemId={null}
                        defaultProductName=""
                        defaultQuantity={1}
                        buttonLabel="Produkt ohne erkannte Position hinzufügen"
                      />
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-[28px] border border-[#C8D8E8] bg-[#EEF4FA] p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#12395F]">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#12395F]">
                    Nächster Abschnitt
                  </p>
                  <h2 className="mt-1 text-xl font-black text-[#102A43]">
                    Rechnung, Zahlung und Abwicklung
                  </h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
                    Diese Schritte kommen erst nach der fachlichen Produktprüfung.
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