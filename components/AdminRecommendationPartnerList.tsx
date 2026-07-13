"use client";

import type { RecommendationPartner } from "@/app/lib/recommendations/types";
import { Edit3, Loader2, Power, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  initialPartners: RecommendationPartner[];
  initialError?: string | null;
  initialMessage?: string | null;
};

type Feedback = { type: "success" | "error"; message: string } | null;

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  const text = await response.text();
  if (!text) return null;

  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "–"
    : new Intl.DateTimeFormat("de-DE", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function targetLabel(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return value.length > 48 ? `${value.slice(0, 45)}…` : value;
  }
}

function commissionLabel(partner: RecommendationPartner) {
  if (!partner.commission_type || partner.commission_value === null) return "Nicht hinterlegt";
  const numeric = Number(partner.commission_value);
  const value = Number.isFinite(numeric)
    ? numeric.toLocaleString("de-DE", { maximumFractionDigits: 2 })
    : String(partner.commission_value);
  return partner.commission_type === "percentage"
    ? `${value} %`
    : `${value} ${partner.currency}`;
}

export default function AdminRecommendationPartnerList({
  initialPartners,
  initialError,
  initialMessage,
}: Props) {
  const router = useRouter();
  const [activeOverrides, setActiveOverrides] = useState<Record<string, boolean>>({});
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(
    initialError
      ? { type: "error", message: initialError }
      : initialMessage
        ? { type: "success", message: initialMessage }
        : null,
  );

  const partners = initialPartners
    .filter((partner) => !deletedIds.includes(partner.id))
    .map((partner) =>
      Object.prototype.hasOwnProperty.call(activeOverrides, partner.id)
        ? { ...partner, active: activeOverrides[partner.id] }
        : partner,
    );

  async function toggleActive(partner: RecommendationPartner) {
    if (pendingId) return;
    setPendingId(partner.id);
    setFeedback(null);

    try {
      const response = await fetch(
        `/api/admin/recommendation-partners/${encodeURIComponent(partner.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            active: !partner.active,
            currentProjectKey: partner.project_key,
          }),
        },
      );
      const payload = await readJson(response);
      if (!response.ok || payload?.ok !== true) {
        throw new Error(
          typeof payload?.message === "string"
            ? payload.message
            : "Der Aktivstatus konnte nicht geändert werden.",
        );
      }

      setActiveOverrides((current) => ({
        ...current,
        [partner.id]: !partner.active,
      }));
      setFeedback({
        type: "success",
        message: partner.active
          ? `${partner.name} wurde deaktiviert.`
          : `${partner.name} wurde aktiviert.`,
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Der Aktivstatus konnte nicht geändert werden.",
      });
    } finally {
      setPendingId(null);
    }
  }

  async function deletePartner(partner: RecommendationPartner) {
    if (pendingId) return;
    const confirmed = window.confirm(
      `Empfehlungspartner „${partner.name}“ wirklich löschen?\n\nBei vorhandenen Kategoriezuordnungen wird das Löschen verhindert.`,
    );
    if (!confirmed) return;

    setPendingId(partner.id);
    setFeedback(null);

    try {
      const query = new URLSearchParams({ project_key: partner.project_key });
      const response = await fetch(
        `/api/admin/recommendation-partners/${encodeURIComponent(partner.id)}?${query}`,
        { method: "DELETE", cache: "no-store" },
      );
      const payload = await readJson(response);
      if (!response.ok || payload?.ok !== true) {
        throw new Error(
          typeof payload?.message === "string"
            ? payload.message
            : "Der Empfehlungspartner konnte nicht gelöscht werden.",
        );
      }

      setDeletedIds((current) => [...current, partner.id]);
      setFeedback({ type: "success", message: `${partner.name} wurde gelöscht.` });
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Der Empfehlungspartner konnte nicht gelöscht werden.",
      });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="grid gap-4">
      {feedback ? (
        <div
          role="status"
          className={
            "rounded-2xl border px-4 py-3 text-sm font-bold leading-6 " +
            (feedback.type === "error"
              ? "border-[#F3B3B3] bg-[#FFF1F1] text-[#9F1D1D]"
              : "border-[#B8DEC1] bg-[#F2FFF4] text-[#1E6B32]")
          }
        >
          {feedback.message}
        </div>
      ) : null}

      {partners.length === 0 && !initialError ? (
        <div className="rounded-[28px] border border-dashed border-[#D8C8B8] bg-white p-8 text-center">
          <p className="text-lg font-black text-[#102A43]">Keine Partner gefunden</p>
          <p className="mt-2 text-sm font-semibold text-[#52616F]">
            Passe die Filter an oder lege den ersten Empfehlungspartner an.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {partners.map((partner) => {
            const pending = pendingId === partner.id;
            return (
              <article
                key={partner.id}
                className="rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm"
              >
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-black text-[#102A43]">{partner.name}</h2>
                      <span
                        className={
                          "rounded-full px-3 py-1 text-xs font-black " +
                          (partner.active
                            ? "bg-[#EAF8E8] text-[#2E7D32]"
                            : "bg-[#F1F3F5] text-[#697985]")
                        }
                      >
                        {partner.active ? "Aktiv" : "Inaktiv"}
                      </span>
                      <span className="rounded-full bg-[#EEF4FA] px-3 py-1 text-xs font-black text-[#12395F]">
                        {partner.project_key}
                      </span>
                    </div>

                    <p className="mt-2 break-all text-sm font-bold text-[#A75B28]">/{partner.slug}</p>
                    {partner.description ? (
                      <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
                        {partner.description}
                      </p>
                    ) : null}

                    <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="rounded-2xl bg-[#FBF7F0] p-3">
                        <dt className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">Ziel</dt>
                        <dd className="mt-1 break-all text-sm font-bold text-[#102A43]">{targetLabel(partner.target_url)}</dd>
                      </div>
                      <div className="rounded-2xl bg-[#FBF7F0] p-3">
                        <dt className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">Zuordnung</dt>
                        <dd className="mt-1 text-sm font-bold text-[#102A43]">{partner.attribution_days} Tage</dd>
                      </div>
                      <div className="rounded-2xl bg-[#FBF7F0] p-3">
                        <dt className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">Provision</dt>
                        <dd className="mt-1 text-sm font-bold text-[#102A43]">{commissionLabel(partner)}</dd>
                      </div>
                      <div className="rounded-2xl bg-[#FBF7F0] p-3 sm:col-span-2 lg:col-span-3">
                        <dt className="text-xs font-black uppercase tracking-[0.12em] text-[#A75B28]">Zeitpunkte</dt>
                        <dd className="mt-1 text-xs font-bold leading-5 text-[#52616F]">
                          Erstellt: {formatDate(partner.created_at)} · Aktualisiert: {formatDate(partner.updated_at)}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="grid min-w-[210px] gap-2">
                    <Link
                      href={`/admin/empfehlungspartner/${encodeURIComponent(partner.id)}?project_key=${encodeURIComponent(partner.project_key)}`}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-4 text-sm font-black text-white transition hover:brightness-110"
                    >
                      <Edit3 className="h-4 w-4" />
                      Bearbeiten
                    </Link>
                    <button
                      type="button"
                      onClick={() => void toggleActive(partner)}
                      disabled={Boolean(pendingId)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-black text-[#102A43] transition hover:bg-[#FBF7F0] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                      {partner.active ? "Deaktivieren" : "Aktivieren"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deletePartner(partner)}
                      disabled={Boolean(pendingId)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[#F1B5B5] bg-[#FFF5F5] px-4 text-sm font-black text-[#9F1D1D] transition hover:bg-[#FFE8E8] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 className="h-4 w-4" />
                      Löschen
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
