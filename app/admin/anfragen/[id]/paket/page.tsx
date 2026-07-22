import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ImageIcon,
  PackageCheck,
  RefreshCw,
  School,
  ShoppingBasket,
  User,
} from "lucide-react";
import AdminAcceptMatchButton from "@/components/AdminAcceptMatchButton";
import AdminDeleteOfferItemButton from "@/components/AdminDeleteOfferItemButton";
import AdminEditOfferItemForm from "@/components/AdminEditOfferItemForm";
import AdminManualOfferItemForm from "@/components/AdminManualOfferItemForm";
import AdminResolveRequestItemButton from "@/components/AdminResolveRequestItemButton";
import { isRequestItemResolvedForWorkflow } from "@/lib/requestWorkflowBlocking";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

type SchoolRequest = {
  id: string;
  request_number: string | null;
  customer_name: string | null;
  child_name: string | null;
  school_name: string | null;
  class_name: string | null;
  status: string | null;
  offer_status: string | null;
  created_at: string | null;
};

type RequestChild = {
  id: string;
  request_id: string;
  sort_order: number | string | null;
  label: string | null;
  child_name: string | null;
  school_name: string | null;
  class_name: string | null;
  is_active: boolean | null;
  created_at: string | null;
};

type RequestFile = {
  id: string;
  request_id: string;
  child_id?: string | null;
  created_at: string | null;
  sort_order?: number | string | null;
  file_order?: number | string | null;
  file_index?: number | string | null;
};

type RequestItem = {
  id: string;
  request_id: string;
  child_id?: string | null;
  raw_text: string | null;
  normalized_name: string | null;
  quantity: number | string | null;
  status: string | null;
  admin_resolution_status?: string | null;
  created_at: string | null;
  updated_at: string | null;

  request_file_id?: string | null;
  file_id?: string | null;
  source_file_id?: string | null;
  upload_file_id?: string | null;

  sort_order?: number | string | null;
  source_index?: number | string | null;
  line_index?: number | string | null;
  position_index?: number | string | null;
  source_position?: number | string | null;
  item_index?: number | string | null;

  page_number?: number | string | null;
  page_index?: number | string | null;
  source_page?: number | string | null;
  file_order?: number | string | null;
  file_index?: number | string | null;
};

type RequestMatch = {
  id: string;
  request_item_id: string;
  product_id: string | null;
  product_name: string | null;
  product_sku: string | null;
  product_price: number | string | null;
  match_score: number | string | null;
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
  created_at: string | null;
  updated_at: string | null;
};

type ProductRow = {
  id: string;
  image_styled_url?: string | null;
  image_url?: string | null;
  image_original_url?: string | null;
  product_image_url?: string | null;
  image?: string | null;
  photo_url?: string | null;
  picture_url?: string | null;
};

type ChildGroup = {
  id: string;
  label: string;
  schoolName: string | null;
  className: string | null;
  items: RequestItem[];
  offerItems: OfferItem[];
  openItems: RequestItem[];
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase Umgebungsvariablen fehlen. Prüfe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY.",
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
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toSortableNumber(value: unknown) {
  const parsed = toNumber(value, Number.POSITIVE_INFINITY);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function toTimestamp(value: string | null | undefined) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function formatMoney(value: unknown) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(toNumber(value, 0));
}

function getChildId(row: unknown) {
  const record = row as {
    child_id?: string | null;
  };

  return cleanText(record.child_id);
}

function getRequestItemTitle(item: RequestItem) {
  return (
    cleanText(item.raw_text) ||
    cleanText(item.normalized_name) ||
    "Unbekannte Listenposition"
  );
}

function getChildLabel(child: RequestChild, index: number) {
  return (
    cleanText(child.label) ||
    cleanText(child.child_name) ||
    `Kind ${index + 1}`
  );
}

function getLinkedFileId(item: RequestItem) {
  return (
    cleanText(item.request_file_id) ||
    cleanText(item.file_id) ||
    cleanText(item.source_file_id) ||
    cleanText(item.upload_file_id)
  );
}

function getExplicitFileOrder(row: RequestItem | RequestFile) {
  return Math.min(
    toSortableNumber(row.file_order),
    toSortableNumber(row.file_index),
  );
}

function getPageOrder(item: RequestItem) {
  return Math.min(
    toSortableNumber(item.page_number),
    toSortableNumber(item.page_index),
    toSortableNumber(item.source_page),
  );
}

function getSourcePosition(item: RequestItem) {
  return Math.min(
    toSortableNumber(item.source_position),
    toSortableNumber(item.position_index),
    toSortableNumber(item.line_index),
    toSortableNumber(item.source_index),
    toSortableNumber(item.item_index),
    toSortableNumber(item.sort_order),
  );
}

function compareNumber(left: number, right: number) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function getProductImageUrl(product: ProductRow | null | undefined) {
  if (!product) return null;

  return (
    cleanText(product.image_styled_url) ||
    cleanText(product.image_url) ||
    cleanText(product.image_original_url) ||
    cleanText(product.product_image_url) ||
    cleanText(product.image) ||
    cleanText(product.photo_url) ||
    cleanText(product.picture_url)
  );
}

function compareMatches(left: RequestMatch, right: RequestMatch) {
  const scoreDifference =
    toNumber(right.match_score, 0) - toNumber(left.match_score, 0);

  if (scoreDifference !== 0) return scoreDifference;

  const nameComparison = String(left.product_name || "").localeCompare(
    String(right.product_name || ""),
    "de",
    {
      numeric: true,
      sensitivity: "base",
    },
  );

  if (nameComparison !== 0) return nameComparison;

  return String(left.id).localeCompare(String(right.id), "de", {
    numeric: true,
    sensitivity: "base",
  });
}

function getOperationalPackageStatus(
  requestItemsCount: number,
  offerItemsCount: number,
  openItemsCount: number,
) {
  if (requestItemsCount === 0) {
    return {
      label: "Keine Listenpositionen",
      classes: "border-[#E8DED2] bg-white text-[#52616F]",
    };
  }

  if (openItemsCount > 0) {
    return {
      label: `${openItemsCount} Position(en) offen`,
      classes: "border-[#F1D1A8] bg-[#FFF8EE] text-[#A75B28]",
    };
  }

  if (offerItemsCount === 0) {
    return {
      label: "Paket noch leer",
      classes: "border-[#F1D1A8] bg-[#FFF8EE] text-[#A75B28]",
    };
  }

  return {
    label: "Paket vollständig",
    classes: "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]",
  };
}

function getOfferStatusLabel(status: string | null) {
  switch (status) {
    case "not_created":
      return "Noch nicht erstellt";
    case "matching_done":
      return "Produktvorschläge erstellt";
    case "offer_created":
      return "Paketwunsch erstellt";
    case "offer_sent":
      return "Paketwunsch gesendet";
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

function ProductImage({
  imageUrl,
  alt,
}: {
  imageUrl: string | null;
  alt: string;
}) {
  return (
    <div className="flex h-24 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#D6E7EF] bg-white sm:h-28 sm:w-24">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={alt}
          className="h-full w-full object-contain p-1.5"
        />
      ) : (
        <ImageIcon className="h-6 w-6 text-[#8EA1B1]" />
      )}
    </div>
  );
}

export default async function AdminPackageWorkspacePage({ params }: Params) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: requestData, error: requestError } = await supabase
    .from("school_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (requestError) {
    throw new Error(
      `Anfrage konnte nicht geladen werden: ${requestError.message}`,
    );
  }

  if (!requestData) {
    notFound();
  }

  const request = requestData as SchoolRequest;

  const [
    { data: childrenData, error: childrenError },
    { data: filesData, error: filesError },
    { data: itemsData, error: itemsError },
    { data: offerItemsData, error: offerItemsError },
  ] = await Promise.all([
    supabase
      .from("school_request_children")
      .select("*")
      .eq("request_id", request.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),

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
  ]);

  if (childrenError) {
    throw new Error(
      `Kinder/Gruppen konnten nicht geladen werden: ${childrenError.message}`,
    );
  }

  if (filesError) {
    throw new Error(
      `Dateireihenfolge konnte nicht geladen werden: ${filesError.message}`,
    );
  }

  if (itemsError) {
    throw new Error(
      `Listenpositionen konnten nicht geladen werden: ${itemsError.message}`,
    );
  }

  if (offerItemsError) {
    throw new Error(
      `Paketpositionen konnten nicht geladen werden: ${offerItemsError.message}`,
    );
  }

  const children = (childrenData || []) as RequestChild[];
  const requestFiles = (filesData || []) as RequestFile[];
  const requestItems = (itemsData || []) as RequestItem[];
  const offerItems = (offerItemsData || []) as OfferItem[];

  const fileOrderById = new Map<string, number>();

  requestFiles.forEach((file, index) => {
    const explicitOrder = Math.min(
      getExplicitFileOrder(file),
      toSortableNumber(file.sort_order),
    );

    fileOrderById.set(
      file.id,
      Number.isFinite(explicitOrder) ? explicitOrder : index + 1,
    );
  });

  const compareRequestItems = (left: RequestItem, right: RequestItem) => {
    const leftLinkedFileOrder = fileOrderById.get(getLinkedFileId(left) || "");
    const rightLinkedFileOrder = fileOrderById.get(
      getLinkedFileId(right) || "",
    );

    const leftFileOrder = Number.isFinite(leftLinkedFileOrder)
      ? leftLinkedFileOrder!
      : getExplicitFileOrder(left);
    const rightFileOrder = Number.isFinite(rightLinkedFileOrder)
      ? rightLinkedFileOrder!
      : getExplicitFileOrder(right);

    const fileComparison = compareNumber(leftFileOrder, rightFileOrder);
    if (fileComparison !== 0) return fileComparison;

    const pageComparison = compareNumber(
      getPageOrder(left),
      getPageOrder(right),
    );
    if (pageComparison !== 0) return pageComparison;

    const sourceComparison = compareNumber(
      getSourcePosition(left),
      getSourcePosition(right),
    );
    if (sourceComparison !== 0) return sourceComparison;

    const createdComparison = compareNumber(
      toTimestamp(left.created_at),
      toTimestamp(right.created_at),
    );
    if (createdComparison !== 0) return createdComparison;

    return String(left.id).localeCompare(String(right.id), "de", {
      numeric: true,
      sensitivity: "base",
    });
  };

  const sortedRequestItems = [...requestItems].sort(compareRequestItems);
  const requestItemById = new Map(
    sortedRequestItems.map((item) => [item.id, item]),
  );
  const requestItemOrderById = new Map(
    sortedRequestItems.map((item, index) => [item.id, index]),
  );

  const compareOfferItems = (left: OfferItem, right: OfferItem) => {
    const leftSourceOrder = left.request_item_id
      ? requestItemOrderById.get(left.request_item_id)
      : undefined;
    const rightSourceOrder = right.request_item_id
      ? requestItemOrderById.get(right.request_item_id)
      : undefined;

    const sourceComparison = compareNumber(
      leftSourceOrder ?? Number.POSITIVE_INFINITY,
      rightSourceOrder ?? Number.POSITIVE_INFINITY,
    );

    if (sourceComparison !== 0) return sourceComparison;

    const createdComparison = compareNumber(
      toTimestamp(left.created_at),
      toTimestamp(right.created_at),
    );

    if (createdComparison !== 0) return createdComparison;

    return String(left.id).localeCompare(String(right.id), "de", {
      numeric: true,
      sensitivity: "base",
    });
  };

  const sortedOfferItems = [...offerItems].sort(compareOfferItems);

  const requestItemIds = sortedRequestItems.map((item) => item.id);
  let matches: RequestMatch[] = [];

  if (requestItemIds.length > 0) {
    const { data: matchesData, error: matchesError } = await supabase
      .from("school_request_matches")
      .select("*")
      .in("request_item_id", requestItemIds)
      .order("match_score", { ascending: false })
      .order("created_at", { ascending: true });

    if (matchesError) {
      throw new Error(
        `Produktvorschläge konnten nicht geladen werden: ${matchesError.message}`,
      );
    }

    matches = (matchesData || []) as RequestMatch[];
  }

  const matchesByRequestItemId = new Map<string, RequestMatch[]>();
  const matchById = new Map<string, RequestMatch>();

  for (const match of matches) {
    matchById.set(match.id, match);

    const current = matchesByRequestItemId.get(match.request_item_id) || [];
    current.push(match);
    matchesByRequestItemId.set(
      match.request_item_id,
      current.sort(compareMatches),
    );
  }

  const productIds = Array.from(
    new Set(
      [
        ...sortedOfferItems.map((item) => item.product_id),
        ...matches.map((match) => match.product_id),
      ].filter(Boolean) as string[],
    ),
  );

  const productById = new Map<string, ProductRow>();

  if (productIds.length > 0) {
    const { data: productsData, error: productsError } = await supabase
      .from("school_products")
      .select("*")
      .in("id", productIds);

    if (productsError) {
      throw new Error(
        `Produktbilder konnten nicht geladen werden: ${productsError.message}`,
      );
    }

    for (const product of (productsData || []) as ProductRow[]) {
      productById.set(product.id, product);
    }
  }

  const linkedRequestItemIds = new Set(
    sortedOfferItems
      .map((item) => cleanText(item.request_item_id))
      .filter(Boolean) as string[],
  );

  const openItems = sortedRequestItems.filter(
    (item) =>
      !isRequestItemResolvedForWorkflow(
        item,
        linkedRequestItemIds.has(item.id),
      ),
  );

  const buildGroup = (
    groupId: string,
    label: string,
    schoolName: string | null,
    className: string | null,
    childId: string | null,
  ): ChildGroup => {
    const requestItemBelongsToGroup = (item: RequestItem) => {
      if (children.length === 0) return true;
      return getChildId(item) === childId;
    };

    const offerItemBelongsToGroup = (item: OfferItem) => {
      if (children.length === 0) return true;

      const directChildId = getChildId(item);

      if (directChildId) {
        return directChildId === childId;
      }

      const linkedRequestItem = item.request_item_id
        ? requestItemById.get(item.request_item_id) || null
        : null;

      return getChildId(linkedRequestItem) === childId;
    };

    const groupItems = sortedRequestItems.filter(requestItemBelongsToGroup);
    const groupOfferItems = sortedOfferItems.filter(offerItemBelongsToGroup);
    const groupOpenItems = openItems.filter(requestItemBelongsToGroup);

    return {
      id: groupId,
      label,
      schoolName,
      className,
      items: groupItems,
      offerItems: groupOfferItems,
      openItems: groupOpenItems,
    };
  };

  const groups: ChildGroup[] =
    children.length > 0
      ? children.map((child, index) =>
          buildGroup(
            child.id,
            getChildLabel(child, index),
            cleanText(child.school_name) || cleanText(request.school_name),
            cleanText(child.class_name) || cleanText(request.class_name),
            child.id,
          ),
        )
      : [
          buildGroup(
            "fallback",
            cleanText(request.child_name) || "Kind 1",
            cleanText(request.school_name),
            cleanText(request.class_name),
            null,
          ),
        ];

  if (children.length > 0) {
    const hasUnassignedRows =
      sortedRequestItems.some((item) => !getChildId(item)) ||
      sortedOfferItems.some((item) => {
        if (getChildId(item)) return false;

        const linkedRequestItem = item.request_item_id
          ? requestItemById.get(item.request_item_id) || null
          : null;

        return !getChildId(linkedRequestItem);
      });

    if (hasUnassignedRows) {
      groups.push(
        buildGroup(
          "unassigned",
          "Allgemein / keinem Kind zugeordnet",
          cleanText(request.school_name),
          cleanText(request.class_name),
          null,
        ),
      );
    }
  }

  const selectedTotal = sortedOfferItems.reduce(
    (sum, item) =>
      sum +
      toNumber(item.quantity, 1) * toNumber(item.product_price, 0),
    0,
  );

  const packageStatus = getOperationalPackageStatus(
    sortedRequestItems.length,
    sortedOfferItems.length,
    openItems.length,
  );

  const manualOfferChildOptions = children.map((child, index) => ({
    id: child.id,
    label: getChildLabel(child, index),
  }));

  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 rounded-[28px] border border-[#E8DED2] bg-white p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href={`/admin/anfragen/${request.id}`}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#D6E7EF] bg-white px-4 py-3 text-sm font-black text-[#12395F] transition hover:border-[#12395F] hover:bg-[#F5FAFD]"
            >
              <ArrowLeft className="h-4 w-4" />
              Zur vollständigen Anfrage
            </Link>

            <a
              href={`/admin/anfragen/${request.id}/paket`}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#102A43] px-4 py-3 text-sm font-black text-white transition hover:brightness-110"
            >
              <RefreshCw className="h-4 w-4" />
              Aktualisieren
            </a>
          </div>

          <p className="text-sm font-bold text-[#52616F]">
            Reduzierte operative Ansicht · dieselben Paketdaten und API-Routen
          </p>
        </div>

        <header className="rounded-[34px] border border-[#E8DED2] bg-white p-5 shadow-[0_18px_45px_rgba(16,42,67,0.08)] sm:p-7">
          <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-[#F0FFF6] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
                <PackageCheck className="h-3.5 w-3.5" />
                Paket-Arbeitsbereich
              </div>

              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                Anfrage {request.request_number || request.id}
              </h1>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-[#FBF7F0] p-4">
                  <div className="flex items-center gap-2 text-[#A75B28]">
                    <User className="h-4 w-4" />
                    <p className="text-xs font-black uppercase">Kunde</p>
                  </div>
                  <p className="mt-2 font-black">
                    {request.customer_name || "Nicht angegeben"}
                  </p>
                </div>

                <div className="rounded-2xl bg-[#FBF7F0] p-4">
                  <div className="flex items-center gap-2 text-[#A75B28]">
                    <School className="h-4 w-4" />
                    <p className="text-xs font-black uppercase">Schule</p>
                  </div>
                  <p className="mt-2 font-black">
                    {request.school_name || "Nicht angegeben"}
                  </p>
                </div>

                <div className="rounded-2xl bg-[#FBF7F0] p-4">
                  <div className="flex items-center gap-2 text-[#A75B28]">
                    <ShoppingBasket className="h-4 w-4" />
                    <p className="text-xs font-black uppercase">
                      Workflowstatus
                    </p>
                  </div>
                  <p className="mt-2 font-black">
                    {getOfferStatusLabel(request.offer_status)}
                  </p>
                </div>
              </div>
            </div>

            <aside className="rounded-[28px] border border-[#D6E7EF] bg-[#F5FAFD] p-5">
              <p className="text-xs font-black uppercase tracking-[0.15em] text-[#12395F]">
                Arbeitsstand
              </p>

              <div
                className={`mt-3 rounded-2xl border px-4 py-3 text-center font-black ${packageStatus.classes}`}
              >
                {packageStatus.label}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-2xl bg-white p-3">
                  <p className="text-xs font-black text-[#52616F]">Paket</p>
                  <p className="mt-1 text-2xl font-black">
                    {sortedOfferItems.length}
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-3">
                  <p className="text-xs font-black text-[#52616F]">Offen</p>
                  <p className="mt-1 text-2xl font-black text-[#A75B28]">
                    {openItems.length}
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-3">
                  <p className="text-xs font-black text-[#52616F]">Wert</p>
                  <p className="mt-1 text-lg font-black">
                    {formatMoney(selectedTotal)}
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </header>

        <div className="sticky top-3 z-20 rounded-[24px] border border-[#C8D8E8] bg-white/95 p-3 shadow-lg backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-[#F0FFF6] px-3 py-1 text-sm font-black text-[#2F7D50]">
                {sortedOfferItems.length} Paketposition(en)
              </span>
              <span className="rounded-full bg-[#FFF8EE] px-3 py-1 text-sm font-black text-[#A75B28]">
                {openItems.length} offen
              </span>
            </div>

            <p className="text-lg font-black">
              Paketwert: {formatMoney(selectedTotal)}
            </p>
          </div>
        </div>

        <div className="grid gap-7">
          {groups.map((group) => {
            const sourceIndexById = new Map(
              group.items.map((item, index) => [item.id, index + 1]),
            );

            return (
              <section
                key={group.id}
                className="rounded-[34px] border border-[#D6E7EF] bg-white p-4 shadow-sm sm:p-6"
              >
                <div className="flex flex-col gap-3 border-b border-[#E8DED2] pb-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.15em] text-[#12395F]">
                      Kind / Listengruppe
                    </p>
                    <h2 className="mt-1 text-2xl font-black">{group.label}</h2>
                    <p className="mt-1 font-semibold text-[#52616F]">
                      {[group.schoolName, group.className ? `Klasse ${group.className}` : null]
                        .filter(Boolean)
                        .join(" · ") || "Keine Schul- oder Klassenangabe"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-[#F0FFF6] px-3 py-1 text-xs font-black text-[#2F7D50]">
                      {group.offerItems.length} im Paket
                    </span>
                    <span className="rounded-full bg-[#FFF8EE] px-3 py-1 text-xs font-black text-[#A75B28]">
                      {group.openItems.length} offen
                    </span>
                  </div>
                </div>

                <section
                  id={`package-checklist-${group.id}`}
                  className="scroll-mt-28 pt-5"
                >
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F0FFF6] text-[#2F7D50]">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#2F7D50]">
                        Abschnitt 1
                      </p>
                      <h3 className="text-xl font-black">
                        Bereits im Paketwunsch
                      </h3>
                    </div>
                  </div>

                  {group.offerItems.length > 0 ? (
                    <div className="grid gap-3">
                      {group.offerItems.map((offerItem) => {
                        const sourceItem = offerItem.request_item_id
                          ? requestItemById.get(offerItem.request_item_id) || null
                          : null;
                        const sourceIndex = sourceItem
                          ? sourceIndexById.get(sourceItem.id) || null
                          : null;
                        const sourceMatch = offerItem.match_id
                          ? matchById.get(offerItem.match_id) || null
                          : null;
                        const productId =
                          cleanText(offerItem.product_id) ||
                          cleanText(sourceMatch?.product_id);
                        const productImage = productId
                          ? getProductImageUrl(productById.get(productId))
                          : null;
                        const quantity = toNumber(offerItem.quantity, 1);
                        const unitPrice = toNumber(
                          offerItem.product_price,
                          0,
                        );

                        return (
                          <article
                            key={offerItem.id}
                            className="rounded-[26px] border border-[#BFE3CD] bg-[#F8FFFB] p-4"
                          >
                            <div className="grid gap-4 lg:grid-cols-[100px_1fr_auto] lg:items-start">
                              <ProductImage
                                imageUrl={productImage}
                                alt={offerItem.product_name}
                              />

                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#2F7D50]">
                                    {sourceIndex
                                      ? String(sourceIndex).padStart(2, "0")
                                      : "MAN"}
                                  </span>

                                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#52616F]">
                                    Menge {quantity}
                                  </span>
                                </div>

                                <p className="mt-3 whitespace-pre-wrap text-sm font-black leading-6 text-[#102A43]">
                                  „
                                  {sourceItem
                                    ? getRequestItemTitle(sourceItem)
                                    : "Manuell ergänzte Paketposition"}
                                  “
                                </p>

                                <h4 className="mt-2 text-lg font-black">
                                  {offerItem.product_name}
                                </h4>

                                <p className="mt-1 text-xs font-bold text-[#52616F]">
                                  {offerItem.product_sku
                                    ? `Art.-Nr.: ${offerItem.product_sku}`
                                    : "Ohne Art.-Nr."}
                                </p>

                                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                                  <span className="font-bold text-[#52616F]">
                                    Menge: {quantity}
                                    {offerItem.unit
                                      ? ` ${offerItem.unit}`
                                      : ""}
                                  </span>
                                  <span className="font-bold text-[#52616F]">
                                    {formatMoney(unitPrice)} / Stück
                                  </span>
                                  <span className="font-black text-[#102A43]">
                                    Gesamt:{" "}
                                    {formatMoney(quantity * unitPrice)}
                                  </span>
                                </div>
                              </div>

                              <div className="flex min-w-[220px] flex-col gap-2 lg:items-end">
                                <AdminEditOfferItemForm
                                  requestId={request.id}
                                  itemId={offerItem.id}
                                  productId={offerItem.product_id}
                                  productName={offerItem.product_name}
                                  productSku={offerItem.product_sku}
                                  productPrice={offerItem.product_price}
                                  quantity={offerItem.quantity}
                                  unit={offerItem.unit}
                                  notes={offerItem.notes}
                                  buttonLabel="Menge / Produkt ändern"
                                />

                                <AdminDeleteOfferItemButton
                                  requestId={request.id}
                                  itemId={offerItem.id}
                                  productName={offerItem.product_name}
                                />
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="rounded-2xl border border-dashed border-[#BFE3CD] bg-[#F8FFFB] p-5 text-sm font-bold text-[#52616F]">
                      Für dieses Kind befinden sich noch keine Produkte im
                      Paketwunsch.
                    </p>
                  )}
                </section>

                <section className="mt-7 border-t border-[#E8DED2] pt-6">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FFF8EE] text-[#A75B28]">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                        Abschnitt 2
                      </p>
                      <h3 className="text-xl font-black">
                        Noch offene Positionen
                      </h3>
                    </div>
                  </div>

                  {group.openItems.length > 0 ? (
                    <div className="grid gap-4">
                      {group.openItems.map((item) => {
                        const sourceIndex =
                          sourceIndexById.get(item.id) || null;
                        const itemMatches = (
                          matchesByRequestItemId.get(item.id) || []
                        )
                          .filter(
                            (match) =>
                              !sortedOfferItems.some(
                                (offerItem) =>
                                  offerItem.match_id === match.id,
                              ),
                          )
                          .slice(0, 3);

                        return (
                          <article
                            key={item.id}
                            className="rounded-[26px] border border-[#F1D1A8] bg-[#FFF8EE] p-4"
                          >
                            <div className="flex flex-col gap-4">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#A75B28]">
                                    {sourceIndex
                                      ? String(sourceIndex).padStart(2, "0")
                                      : "?"}
                                  </span>
                                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#52616F]">
                                    Listenmenge: {toNumber(item.quantity, 1)}
                                  </span>
                                </div>

                                <p className="mt-3 whitespace-pre-wrap text-base font-black leading-7">
                                  „{getRequestItemTitle(item)}“
                                </p>

                                <p className="mt-2 font-bold text-[#A75B28]">
                                  Noch kein Produkt im Paket
                                </p>
                              </div>

                              {itemMatches.length > 0 ? (
                                <div className="grid gap-2">
                                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                                    Vorhandene Vorschläge
                                  </p>

                                  {itemMatches.map((match) => {
                                    const imageUrl = match.product_id
                                      ? getProductImageUrl(
                                          productById.get(match.product_id),
                                        )
                                      : null;

                                    return (
                                      <div
                                        key={match.id}
                                        className="grid gap-3 rounded-2xl border border-[#E8DED2] bg-white p-3 sm:grid-cols-[70px_1fr_auto] sm:items-center"
                                      >
                                        <ProductImage
                                          imageUrl={imageUrl}
                                          alt={
                                            match.product_name ||
                                            "Produktvorschlag"
                                          }
                                        />

                                        <div>
                                          <p className="font-black">
                                            {match.product_name ||
                                              "Unbekanntes Produkt"}
                                          </p>
                                          <p className="mt-1 text-xs font-bold text-[#52616F]">
                                            {match.product_sku
                                              ? `Art.-Nr.: ${match.product_sku} · `
                                              : ""}
                                            {formatMoney(match.product_price)}
                                          </p>
                                        </div>

                                        <AdminAcceptMatchButton
                                          requestId={request.id}
                                          matchId={match.id}
                                          label="Übernehmen"
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : null}

                              <div className="grid gap-3 border-t border-[#F1D1A8] pt-4 lg:grid-cols-[1fr_auto] lg:items-start">
                                <AdminManualOfferItemForm
                                  requestId={request.id}
                                  requestItemId={item.id}
                                  childOptions={manualOfferChildOptions}
                                  defaultChildId={getChildId(item)}
                                  defaultProductName={
                                    item.normalized_name || item.raw_text
                                  }
                                  defaultQuantity={item.quantity}
                                  buttonLabel="Produkt suchen / manuell ergänzen"
                                  preservePageAfterSave
                                  successAnchorId={`package-checklist-${group.id}`}
                                />

                                <AdminResolveRequestItemButton
                                  requestId={request.id}
                                  requestItemId={item.id}
                                  resolutionStatus="customer_supplies_self"
                                  buttonLabel="Kunde besorgt selbst"
                                  confirmMessage={`Soll „${getRequestItemTitle(
                                    item,
                                  )}“ wirklich als „Kunde besorgt selbst“ markiert werden?`}
                                  className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-[#D8C8B8] bg-white px-4 py-3 text-sm font-black text-[#102A43] transition hover:border-[#12395F] hover:bg-[#F5FAFD] lg:w-auto"
                                />
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] p-5 text-[#2F7D50]">
                      <CheckCircle2 className="h-5 w-5 shrink-0" />
                      <p className="font-black">
                        Für dieses Kind sind keine offenen Listenpositionen
                        vorhanden.
                      </p>
                    </div>
                  )}
                </section>
              </section>
            );
          })}
        </div>
      </section>
    </main>
  );
}
