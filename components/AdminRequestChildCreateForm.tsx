"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type AdminRequestChildCreateFormProps = {
  requestId: string;
};

type ApiResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
};

export default function AdminRequestChildCreateForm({
  requestId,
}: AdminRequestChildCreateFormProps) {
  const router = useRouter();
  const [childName, setChildName] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [className, setClassName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSaving) return;

    try {
      setIsSaving(true);
      setMessage(null);

      const response = await fetch(
        `/api/admin/requests/${encodeURIComponent(requestId)}/children`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            childName,
            schoolName,
            className,
          }),
        }
      );

      const rawText = await response.text();
      let result: ApiResponse = {};

      try {
        result = rawText ? (JSON.parse(rawText) as ApiResponse) : {};
      } catch {
        result = {
          ok: false,
          error: "Die Serverantwort konnte nicht gelesen werden.",
        };
      }

      if (!response.ok || result.ok === false) {
        throw new Error(
          result.error || result.message || "Das Kind konnte nicht angelegt werden."
        );
      }

      setChildName("");
      setSchoolName("");
      setClassName("");
      setMessage(result.message || "Kind wurde angelegt.");

      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Das Kind konnte nicht angelegt werden."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[24px] border border-[#E8DED2] bg-white p-4"
    >
      <div className="mb-3">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
          Kind hinzufügen
        </p>
        <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
          Lege ein weiteres Kind für diese Anfrage an. Die konkrete Zuordnung
          von Dateien und Positionen folgt im nächsten Schritt.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-sm font-bold text-[#102A43]">
          Kind / Label
          <input
            value={childName}
            onChange={(event) => setChildName(event.target.value)}
            placeholder="z. B. Kind 2 oder Emma"
            className="min-h-11 rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] px-4 py-2 text-sm font-semibold outline-none focus:border-[#B5282D]"
          />
        </label>

        <label className="grid gap-1 text-sm font-bold text-[#102A43]">
          Klasse
          <input
            value={className}
            onChange={(event) => setClassName(event.target.value)}
            placeholder="z. B. 4a"
            className="min-h-11 rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] px-4 py-2 text-sm font-semibold outline-none focus:border-[#B5282D]"
          />
        </label>

        <label className="grid gap-1 text-sm font-bold text-[#102A43]">
          Schule
          <input
            value={schoolName}
            onChange={(event) => setSchoolName(event.target.value)}
            placeholder="optional"
            className="min-h-11 rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] px-4 py-2 text-sm font-semibold outline-none focus:border-[#B5282D]"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {message ? (
          <p className="text-sm font-bold text-[#52616F]">{message}</p>
        ) : (
          <p className="text-sm font-semibold text-[#52616F]">
            Beispiel: Kind 1, Kind 2 oder konkreter Name.
          </p>
        )}

        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#102A43] px-5 py-2 text-sm font-black text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {isSaving ? "Speichert..." : "Kind anlegen"}
        </button>
      </div>
    </form>
  );
}
