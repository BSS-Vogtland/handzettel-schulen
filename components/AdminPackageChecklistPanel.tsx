"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Loader2,
  PackageCheck,
  RefreshCw,
} from "lucide-react";

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
  productImageUrl?: string | null;
  productName?: string | null;
  productSku?: string | null;
};

type UnresolvedItem = {
  id: string;
  title: string;
  originalText: string;
};

type ChecklistResponse = {
  ok: boolean;
  message?: string;
  requestId?: string;
  status?: string;
  createdAt?: string | null;
  completedAt?: string | null;
  canGenerate?: boolean;
  unresolvedCount?: number;
  unresolvedItems?: UnresolvedItem[];
  checkedCount?: number;
  totalCount?: number;
  items?: ChecklistItem[];
};

type AdminPackageChecklistPanelProps = {
  requestId: string;
};

function getStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "not_created":
      return "Noch nicht erzeugt";
    case "created":
      return "Erzeugt";
    case "in_progress":
      return "In PrÃ¼fung";
    case "completed":
      return "Abgeschlossen";
    default:
      return status || "Noch nicht erzeugt";
  }
}

function getItemStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "in_package":
      return "Im Paket";
    case "alternative_selected":
      return "Alternative";
    case "not_available":
      return "Nicht lieferbar";
    case "not_needed":
      return "Nicht nÃ¶tig";
    case "question_required":
      return "RÃ¼ckfrage";
    case "manual_check":
      return "GeprÃ¼ft";
    default:
      return status || "GeprÃ¼ft";
  }
}

function getStatusClasses(status: string | null | undefined) {
  switch (status) {
    case "completed":
      return "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]";
    case "in_progress":
      return "border-[#F1D1A8] bg-[#FFF8EE] text-[#A75B28]";
    case "created":
      return "border-[#C8D8E8] bg-[#EEF4FA] text-[#12395F]";
    default:
      return "border-[#E8DED2] bg-white text-[#52616F]";
  }
}

function getItemStatusClasses(status: string | null | undefined) {
  switch (status) {
    case "in_package":
      return "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]";
    case "alternative_selected":
      return "border-[#C8D8E8] bg-[#EEF4FA] text-[#12395F]";
    case "not_available":
    case "question_required":
      return "border-[#F1D1A8] bg-[#FFF8EE] text-[#A75B28]";
    default:
      return "border-[#E8DED2] bg-white text-[#52616F]";
  }
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return null;

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function splitLines(value: string | null | undefined) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function getOriginalTitle(item: ChecklistItem) {
  return splitLines(item.original_text)[0] || "Listenposition";
}

function getOriginalDetails(item: ChecklistItem) {
  return splitLines(item.original_text).slice(1);
}

function normalizeChecklistText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/Ã¤/g, "ae")
    .replace(/Ã¶/g, "oe")
    .replace(/Ã¼/g, "ue")
    .replace(/ÃŸ/g, "ss")
    .replace(/grÃ¼n/g, "gruen")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getColorFromChecklistText(value: unknown) {
  const text = normalizeChecklistText(value);

  const colors = [
    ["blau", "blau"],
    ["rot", "rot"],
    ["schwarz", "schwarz"],
    ["gruen", "grÃ¼n"],
    ["grun", "grÃ¼n"],
    ["grÃ¼n", "grÃ¼n"],
    ["braun", "braun"],
    ["weiss", "weiÃŸ"],
    ["weiÃŸ", "weiÃŸ"],
    ["gelb", "gelb"],
    ["lila", "lila"],
    ["orange", "orange"],
    ["pink", "pink"],
    ["rosa", "rosa"],
  ];

  for (const [needle, label] of colors) {
    if (text.includes(needle)) return label;
  }

  return "";
}

function getSubjectFromHefterText(value: unknown) {
  const text = String(value || "");
  const match = text.match(/(?:fÃ¼r|fuer)\s+[â€ž"â€œ]?([^"â€â€ž(]+)[â€œ"]?/i);

  if (!match?.[1]) return "";

  return match[1]
    .replace(/\s+mit\s+.*$/i, "")
    .replace(/\s+einheften.*$/i, "")
    .replace(/[.,;:]+$/g, "")
    .trim();
}

function getUnresolvedDisplayTitle(item: UnresolvedItem) {
  const title = String(item.title || "").trim();
  const originalText = String(item.originalText || "").trim();
  const combined = `${originalText} ${title}`;
  const normalizedCombined = normalizeChecklistText(combined);
  const normalizedTitle = normalizeChecklistText(title);

  const hasOriginalHefter =
    normalizedCombined.includes(" hefter ") ||
    normalizedCombined.startsWith("hefter ") ||
    normalizedCombined.includes("schnellhefter");

  const titleLooksLikeMappe =
    normalizedTitle.startsWith("mappe ") || normalizedTitle === "mappe";

  if (hasOriginalHefter && titleLooksLikeMappe) {
    const subject = getSubjectFromHefterText(originalText);
    const color = getColorFromChecklistText(combined);

    return ["Hefter", subject, color].filter(Boolean).join(" ");
  }

  return title || originalText || "Offene Position";
}
function getResolvedTitle(item: ChecklistItem) {
  return (
    item.productName ||
    splitLines(item.resolved_text)[0] ||
    "Keine Paketposition hinterlegt"
  );
}

function getResolvedDetails(item: ChecklistItem) {
  const lines = splitLines(item.resolved_text);
  const details = lines.slice(1);

  if (item.productSku && !details.some((line) => line.includes(item.productSku || ""))) {
    details.unshift(`Art.-Nr.: ${item.productSku}`);
  }

  return details;
}

export default function AdminPackageChecklistPanel({
  requestId,
}: AdminPackageChecklistPanelProps) {
  const router = useRouter();

  const [data, setData] = useState<ChecklistResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  async function loadChecklist() {
    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/admin/requests/${requestId}/package-checklist`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const result = (await response.json()) as ChecklistResponse;

      setData(result);

      if (!response.ok || !result.ok) {
        setMessage(result.message || "Checkliste konnte nicht geladen werden.");
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Checkliste konnte nicht geladen werden."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadChecklist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  const items = data?.items || [];
  const unresolvedItems = data?.unresolvedItems || [];
  const unresolvedLimit = 8;
  const [showAllUnresolvedItems, setShowAllUnresolvedItems] = useState(false);
  const visibleUnresolvedItems = showAllUnresolvedItems
    ? unresolvedItems
    : unresolvedItems.slice(0, unresolvedLimit);
  const hiddenUnresolvedItemsCount = Math.max(
    0,
    unresolvedItems.length - unresolvedLimit
  );
  const status = data?.status || "not_created";
  const checkedCount = data?.checkedCount || 0;
  const totalCount = data?.totalCount || 0;
  const progressPercent =
    totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;
  const isCompleted = status === "completed";
  const canComplete = totalCount > 0 && checkedCount === totalCount && !isCompleted;

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.is_checked !== b.is_checked) return a.is_checked ? 1 : -1;
      return String(a.created_at || "").localeCompare(String(b.created_at || ""));
    });
  }, [items]);

  async function generateChecklist() {
    setMessage(null);

    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/admin/requests/${requestId}/package-checklist`,
          {
            method: "POST",
          }
        );

        const result = (await response.json()) as ChecklistResponse;

        if (!response.ok || !result.ok) {
          setMessage(result.message || "Checkliste konnte nicht erzeugt werden.");
          setData((current) => ({
            ...(current || {}),
            ...result,
          }));
          return;
        }

        setMessage(result.message || "Checkliste wurde erzeugt.");
        await loadChecklist();
        router.refresh();
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Checkliste konnte nicht erzeugt werden."
        );
      }
    });
  }

  async function toggleItem(item: ChecklistItem, isChecked: boolean) {
    setMessage(null);

    setData((current) => {
      if (!current?.items) return current;

      const nextItems = current.items.map((currentItem) =>
        currentItem.id === item.id
          ? {
              ...currentItem,
              is_checked: isChecked,
              checked_at: isChecked ? new Date().toISOString() : null,
            }
          : currentItem
      );

      return {
        ...current,
        items: nextItems,
        checkedCount: nextItems.filter((currentItem) => currentItem.is_checked)
          .length,
        totalCount: nextItems.length,
      };
    });

    try {
      const response = await fetch(
        `/api/admin/requests/${requestId}/package-checklist/items/${item.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            isChecked,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.ok) {
        setMessage(result.message || "Position konnte nicht gespeichert werden.");
        await loadChecklist();
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Position konnte nicht gespeichert werden."
      );
      await loadChecklist();
    }
  }

  async function saveNote(item: ChecklistItem, note: string) {
    setMessage(null);

    try {
      const response = await fetch(
        `/api/admin/requests/${requestId}/package-checklist/items/${item.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            note,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.ok) {
        setMessage(result.message || "Notiz konnte nicht gespeichert werden.");
        await loadChecklist();
        return;
      }

      setData((current) => {
        if (!current?.items) return current;

        return {
          ...current,
          items: current.items.map((currentItem) =>
            currentItem.id === item.id ? { ...currentItem, note } : currentItem
          ),
        };
      });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Notiz konnte nicht gespeichert werden."
      );
      await loadChecklist();
    }
  }

  async function completeChecklist() {
    setMessage(null);

    if (!window.confirm("Paketwunsch-Checkliste wirklich abschlieÃŸen?")) {
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/admin/requests/${requestId}/package-checklist/complete`,
          {
            method: "POST",
          }
        );

        const result = await response.json();

        if (!response.ok || !result.ok) {
          setMessage(result.message || "Checkliste konnte nicht abgeschlossen werden.");
          return;
        }

        setMessage(result.message || "Checkliste wurde abgeschlossen.");
        await loadChecklist();
        router.refresh();
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Checkliste konnte nicht abgeschlossen werden."
        );
      }
    });
  }

  return (
    <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
            <ClipboardCheck className="h-5 w-5" />
          </div>

          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Interne PrÃ¼fung
            </p>

            <h2 className="text-xl font-black text-[#102A43]">
              Paketwunsch-Checkliste
            </h2>

            <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
              KurzprÃ¼fung vor dem Versand der Paketwunsch-Mail: Listenposition,
              Paketprodukt, Bild, abhaken.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          <span
            className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-black ${getStatusClasses(
              status
            )}`}
          >
            {getStatusLabel(status)}
          </span>

          {data?.completedAt ? (
            <span className="text-xs font-bold text-[#52616F]">
              Abgeschlossen: {formatDateTime(data.completedAt)}
            </span>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 rounded-2xl bg-[#FBF7F0] p-4 text-sm font-bold text-[#52616F]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checkliste wird geladen...
        </div>
      ) : null}

      {message ? (
        <div className="mb-4 rounded-2xl border border-[#F1D1A8] bg-[#FFF8EE] p-4 text-sm font-bold leading-6 text-[#A75B28]">
          {message}
        </div>
      ) : null}

      {!isLoading && items.length === 0 ? (
        <div className="rounded-[28px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
          {data?.canGenerate ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-black text-[#102A43]">
                  Alle Listenpositionen sind bearbeitet.
                </p>
                <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                  Die digitale Checkliste kann jetzt erzeugt werden.
                </p>
              </div>

              <button
                type="button"
                onClick={generateChecklist}
                disabled={isPending}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#102A43] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ClipboardList className="h-4 w-4" />
                )}
                Digitale Checkliste erzeugen
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[#A75B28]">
                  <AlertTriangle className="h-5 w-5" />
                </div>

                <div>
                  <p className="font-black text-[#102A43]">
                    Checkliste noch nicht verfÃ¼gbar.
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                    Die Checkliste kann erst erzeugt werden, wenn alle erkannten
                    Listenpositionen bearbeitet wurden oder automatisch im Paketwunsch
                    liegen.
                  </p>
                </div>
              </div>

              {unresolvedItems.length > 0 ? (
                <div className="rounded-2xl border border-[#F1D1A8] bg-white p-4">
                  <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                    Noch offen: {unresolvedItems.length}
                  </p>

                  <div className="grid gap-2">
                    {visibleUnresolvedItems.map((item) => (
                      <a
                        key={item.id}
                        href={`#position-${item.id}`}
                        className="block rounded-xl bg-[#FBF7F0] px-3 py-2 text-sm font-bold text-[#52616F] transition hover:bg-[#FFF1F1] hover:text-[#B5282D]"
                      >
                        {item.originalText || item.title}
                      </a>
                    ))}
                  </div>

                  {hiddenUnresolvedItemsCount > 0 ? (
                    <li>
                      <button
                        type="button"
                        onClick={() =>
                          setShowAllUnresolvedItems((current) => !current)
                        }
                        className="inline-flex w-full items-center justify-center rounded-2xl border border-[#D8C8B8] bg-white px-4 py-3 text-sm font-black text-[#102A43] transition hover:bg-[#FBF7F0]"
                      >
                        {showAllUnresolvedItems
                          ? "Weniger offene Positionen anzeigen"
                          : `+ ${hiddenUnresolvedItemsCount} weitere offene Positionen anzeigen`}
                      </button>
                    </li>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {!isLoading && items.length > 0 ? (
        <div className="space-y-4">
          <div className="rounded-[24px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black text-[#102A43]">
                  {checkedCount} von {totalCount} Positionen geprÃ¼ft
                </p>
                <p className="mt-1 text-xs font-bold text-[#52616F]">
                  Fortschritt: {progressPercent} %
                </p>
              </div>

              <div className="h-3 w-full overflow-hidden rounded-full bg-white sm:max-w-xs">
                <div
                  className="h-full rounded-full bg-[#2F7D50] transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            {sortedItems.map((item) => {
              const originalTitle = getOriginalTitle(item);
              const originalDetails = getOriginalDetails(item);
              const resolvedTitle = getResolvedTitle(item);
              const resolvedDetails = getResolvedDetails(item);

              return (
                <article
                  key={item.id}
                  className={`rounded-[24px] border p-4 transition ${
                    item.is_checked
                      ? "border-[#BFE3CD] bg-[#F0FFF6]"
                      : "border-[#E8DED2] bg-[#FBF7F0]"
                  }`}
                >
                  <div className="grid gap-4 lg:grid-cols-[1fr_120px_230px] lg:items-start">
                    <label className="flex min-w-0 cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={item.is_checked}
                        disabled={isCompleted}
                        onChange={(event) => toggleItem(item, event.target.checked)}
                        className="mt-1 h-5 w-5 shrink-0 rounded border-[#D8C8B8] text-[#2F7D50]"
                      />

                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-black ${getItemStatusClasses(
                              item.status
                            )}`}
                          >
                            {getItemStatusLabel(item.status)}
                          </span>

                          {item.is_checked ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-black text-[#2F7D50]">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              geprÃ¼ft
                            </span>
                          ) : null}
                        </div>

                        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                          Listenposition
                        </p>

                        <p className="mt-1 text-base font-black leading-6 text-[#102A43]">
                          {originalTitle}
                        </p>

                        {originalDetails.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {originalDetails.slice(0, 4).map((detail) => (
                              <span
                                key={detail}
                                className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#52616F]"
                              >
                                {detail}
                              </span>
                            ))}
                          </div>
                        ) : null}

                        <div className="mt-4 rounded-2xl border border-[#D8E8D8] bg-white p-3">
                          <p className="mb-1 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
                            <PackageCheck className="h-3.5 w-3.5" />
                            Paket
                          </p>

                          <p className="text-sm font-black leading-6 text-[#102A43]">
                            {resolvedTitle}
                          </p>

                          {resolvedDetails.length > 0 ? (
                            <p className="mt-1 text-xs font-semibold leading-5 text-[#52616F]">
                              {resolvedDetails.slice(0, 2).join(" Â· ")}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </label>

                    <div className="flex h-[110px] w-[110px] items-center justify-center overflow-hidden rounded-3xl border border-[#E8DED2] bg-white">
                      {item.productImageUrl ? (
                        <Image
                          src={item.productImageUrl}
                          alt={resolvedTitle}
                          width={110}
                          height={110}
                          unoptimized
                          className="h-full w-full object-contain p-2"
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-[#A75B28]">
                          <PackageCheck className="h-7 w-7" />
                          <span className="text-center text-[10px] font-black uppercase tracking-[0.12em]">
                            Kein Bild
                          </span>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                        Kurznotiz
                      </label>

                      <textarea
                        defaultValue={item.note || ""}
                        disabled={isCompleted}
                        onBlur={(event) => saveNote(item, event.target.value)}
                        placeholder="Optional..."
                        className="mt-2 min-h-[92px] w-full rounded-2xl border border-[#E8DED2] bg-white px-3 py-2 text-sm font-semibold text-[#102A43] outline-none transition focus:border-[#A75B28] disabled:opacity-70"
                      />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={loadChecklist}
              disabled={isPending}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#D8C8B8] bg-white px-4 py-3 text-sm font-black text-[#102A43] transition hover:bg-[#FBF7F0] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" />
              Neu laden
            </button>

            {!isCompleted ? (
              <button
                type="button"
                onClick={completeChecklist}
                disabled={!canComplete || isPending}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#2F7D50] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                PrÃ¼fung abschlieÃŸen
              </button>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] px-4 py-3 text-sm font-black text-[#2F7D50]">
                <CheckCircle2 className="h-4 w-4" />
                PrÃ¼fung abgeschlossen
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
