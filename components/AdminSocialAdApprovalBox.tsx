"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";

const REQUIRED_CONFIRMATION = "ICH BESTÄTIGE DAS WERBEBUDGET";

type ApiResponse = {
  ok?: boolean;
  message?: string;
};

export default function AdminSocialAdApprovalBox({
  campaignId,
  isAlreadyApproved,
}: {
  campaignId: string;
  isAlreadyApproved: boolean;
}) {
  const router = useRouter();
  const [isApproving, setIsApproving] = useState(false);
  const [approvedByName, setApprovedByName] = useState("");
  const [approvedByEmail, setApprovedByEmail] = useState("");
  const [confirmationText, setConfirmationText] = useState("");

  async function handleApprove() {
    if (isApproving || isAlreadyApproved) return;

    if (!approvedByName.trim()) {
      window.alert("Bitte gib den Namen der freigebenden Person ein.");
      return;
    }

    if (confirmationText !== REQUIRED_CONFIRMATION) {
      window.alert(`Bitte bestätige exakt mit: ${REQUIRED_CONFIRMATION}`);
      return;
    }

    const confirmed = window.confirm(
      "Diese Kampagne wird als budgetfreigegeben markiert. Später kann eine API-Anbindung auf Grundlage dieser Freigabe Werbebudget beim verbundenen Werbekonto ausgeben. Fortfahren?"
    );

    if (!confirmed) return;

    setIsApproving(true);

    try {
      const response = await fetch(
        `/api/admin/social/ads/${campaignId}/approve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            approved_by_name: approvedByName,
            approved_by_email: approvedByEmail,
            confirmation_text: confirmationText,
          }),
        }
      );

      const json = (await response.json()) as ApiResponse;

      if (!response.ok || !json.ok) {
        window.alert(json.message || "Kampagne konnte nicht freigegeben werden.");
        return;
      }

      window.alert(json.message || "Kampagne wurde freigegeben.");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler bei der Freigabe.";

      window.alert(message);
    } finally {
      setIsApproving(false);
    }
  }

  if (isAlreadyApproved) {
    return (
      <section className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-700">
            <ShieldCheck className="h-6 w-6" />
          </div>

          <div>
            <h2 className="text-xl font-black text-emerald-900">
              Kampagne ist freigegeben
            </h2>
            <p className="mt-2 text-sm font-bold leading-6 text-emerald-800">
              Das Budget wurde bestätigt. Eine spätere API-Ausspielung darf nur
              auf Grundlage dieser gespeicherten Freigabe erfolgen.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5 shadow-sm sm:p-7">
      <div className="mb-5">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-800">
          <ShieldCheck className="h-4 w-4" />
          Budgetfreigabe
        </div>

        <h2 className="mt-4 text-2xl font-black text-amber-950">
          Werbebudget aktiv freigeben
        </h2>

        <p className="mt-2 text-sm font-bold leading-6 text-amber-900">
          Diese Freigabe ist der Schutzmechanismus. Ohne diese Bestätigung darf
          später keine Kampagne automatisch über Meta, Google oder TikTok
          gestartet werden.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-black text-amber-950">
            Name der freigebenden Person
          </label>
          <input
            value={approvedByName}
            onChange={(event) => setApprovedByName(event.target.value)}
            className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10"
            placeholder="Vorname Nachname"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-amber-950">
            E-Mail optional
          </label>
          <input
            value={approvedByEmail}
            onChange={(event) => setApprovedByEmail(event.target.value)}
            className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10"
            placeholder="name@firma.de"
          />
        </div>
      </div>

      <div className="mt-5">
        <label className="mb-2 block text-sm font-black text-amber-950">
          Bestätigungstext
        </label>

        <p className="mb-2 text-xs font-bold leading-5 text-amber-900">
          Bitte exakt eingeben:
        </p>

        <code className="mb-3 block rounded-2xl bg-white px-4 py-3 text-sm font-black text-amber-900">
          {REQUIRED_CONFIRMATION}
        </code>

        <input
          value={confirmationText}
          onChange={(event) => setConfirmationText(event.target.value)}
          className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10"
          placeholder={REQUIRED_CONFIRMATION}
        />
      </div>

      <button
        type="button"
        onClick={handleApprove}
        disabled={isApproving}
        className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-700 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isApproving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ShieldCheck className="h-4 w-4" />
        )}
        {isApproving ? "Freigabe wird gespeichert ..." : "Budget freigeben"}
      </button>
    </section>
  );
}