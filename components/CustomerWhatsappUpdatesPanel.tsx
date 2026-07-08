"use client";

import { useState } from "react";

type CustomerWhatsappUpdatesPanelProps = {
  token: string;
  requestNumber?: string | null;
  initialEnabled: boolean;
  businessWhatsappUrl: string;
};

async function readJson(response: Response) {
  const raw = await response.text();

  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function CustomerWhatsappUpdatesPanel({
  token,
  requestNumber,
  initialEnabled,
  businessWhatsappUrl,
}: CustomerWhatsappUpdatesPanelProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function updateEnabled(nextEnabled: boolean) {
    setEnabled(nextEnabled);
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(
        "/api/customer/requests/" + encodeURIComponent(token) + "/whatsapp-updates",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            enabled: nextEnabled,
          }),
        }
      );

      const payload = await readJson(response);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || "Einstellung konnte nicht gespeichert werden.");
      }

      setMessage(
        nextEnabled
          ? "WhatsApp-Updates sind aktiviert."
          : "WhatsApp-Updates sind abgewählt."
      );
    } catch (error) {
      setEnabled(!nextEnabled);
      setMessage(
        error instanceof Error
          ? error.message
          : "Einstellung konnte nicht gespeichert werden."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-[26px] border border-[#D8C8B8] bg-[#FFFDF9] p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
            Updates per WhatsApp
          </p>

          <h3 className="mt-1 text-lg font-black text-[#102A43]">
            Wir informieren Dich zum Paketwunsch per WhatsApp.
          </h3>

          <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
            Diese Option ist vorausgewählt, damit Du wichtige Hinweise zu Deinem
            Paketwunsch schneller bekommst. Du kannst sie jederzeit abwählen.
          </p>

          {requestNumber ? (
            <p className="mt-2 text-xs font-bold text-[#A75B28]">
              Anfrage: {requestNumber}
            </p>
          ) : null}
        </div>

        <label className="flex min-w-[260px] cursor-pointer items-center gap-3 rounded-2xl border border-[#D8C8B8] bg-white px-4 py-3 text-sm font-black text-[#102A43]">
          <input
            type="checkbox"
            checked={enabled}
            disabled={saving}
            onChange={(event) => updateEnabled(event.target.checked)}
            className="h-5 w-5"
          />
          WhatsApp-Updates erhalten
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        {enabled && businessWhatsappUrl ? (
          <a
            href={businessWhatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#2F7D50] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
          >
            WhatsApp-Chat öffnen
          </a>
        ) : null}

        <p className="text-xs font-bold leading-5 text-[#52616F]">
          Es wird nichts automatisch versendet. WhatsApp öffnet nur mit vorbereitetem Text.
        </p>
      </div>

      {message ? (
        <p
          className={
            "mt-3 rounded-2xl px-4 py-3 text-sm font-bold " +
            (message.includes("konnte")
              ? "bg-[#FFF1F1] text-[#B5282D]"
              : "bg-[#F0FFF6] text-[#2F7D50]")
          }
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
