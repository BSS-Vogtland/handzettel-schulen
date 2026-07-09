"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type AdminRequestPhoneEditorProps = {
  requestId: string;
  initialPhone?: string | null;
};

function getErrorMessage(payload: unknown) {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof (payload as { message?: unknown }).message === "string"
  ) {
    return (payload as { message: string }).message;
  }

  return "Die Telefonnummer konnte nicht gespeichert werden.";
}

export default function AdminRequestPhoneEditor({
  requestId,
  initialPhone,
}: AdminRequestPhoneEditorProps) {
  const router = useRouter();

  const [phone, setPhone] = useState(initialPhone ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const initialValue = initialPhone ?? "";
  const hasChanges = phone !== initialValue;

  async function handleSave() {
    if (saving) {
      return;
    }

    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/requests/${encodeURIComponent(requestId)}/contact`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            phone,
          }),
        }
      );

      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        throw new Error(getErrorMessage(payload));
      }

      setMessage("Telefonnummer gespeichert.");
      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Die Telefonnummer konnte nicht gespeichert werden."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="mt-3 block rounded-2xl border border-[#E7D5BE] bg-[#FFFDF8] p-3">
      <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-[#8A5A2B]">
        Telefonnummer korrigieren
      </span>

      <span className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          type="tel"
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value);
            setMessage(null);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleSave();
            }
          }}
          placeholder="z. B. +49162..."
          className="min-w-0 flex-1 rounded-xl border border-[#D8C1A5] bg-white px-3 py-2 text-sm text-[#2F2118] outline-none transition focus:border-[#A75B28] focus:ring-2 focus:ring-[#A75B28]/20"
        />

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !hasChanges}
          className="rounded-xl bg-[#A75B28] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#8F4D22] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Speichert..." : "Speichern"}
        </button>
      </span>

      <span className="mt-2 block text-xs text-[#7A6A58]">
        Keine automatische Korrektur: Nummer bewusst manuell prüfen, z. B. +4949162... zu +49162...
      </span>

      {message ? (
        <span className="mt-2 block text-xs font-semibold text-emerald-700">
          {message}
        </span>
      ) : null}

      {error ? (
        <span className="mt-2 block text-xs font-semibold text-red-700">
          {error}
        </span>
      ) : null}
    </span>
  );
}