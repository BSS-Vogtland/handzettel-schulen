"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  MessageCircle,
  Send,
  UploadCloud,
} from "lucide-react";

type ImportResponse = {
  ok?: boolean;
  message?: string;
  requestId?: string;
  requestNumber?: string | null;
  offerUrl?: string;
  redirectUrl?: string;
  emailSent?: boolean;
  emailMessage?: string | null;
};

export default function AdminWhatsappImportPage() {
  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [childName, setChildName] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [className, setClassName] = useState("");
  const [whatsappText, setWhatsappText] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function resetMessages() {
    setResult(null);
    setErrorMessage(null);
  }

  function resetForm() {
    setCustomerName("");
    setEmail("");
    setPhone("");
    setChildName("");
    setSchoolName("");
    setClassName("");
    setWhatsappText("");
    setInternalNote("");
    setFile(null);
    setResult(null);
    setErrorMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSaving) return;

    resetMessages();

    const hasText = whatsappText.trim().length > 0;
    const hasFile = Boolean(file);

    if (!hasText && !hasFile) {
      setErrorMessage(
        "Bitte füge entweder den WhatsApp-Text ein oder lade ein Foto/PDF hoch."
      );
      return;
    }

    setIsSaving(true);

    try {
      const formData = new FormData();

      formData.append("customerName", customerName.trim());
      formData.append("email", email.trim());
      formData.append("phone", phone.trim());
      formData.append("childName", childName.trim());
      formData.append("schoolName", schoolName.trim());
      formData.append("className", className.trim());
      formData.append("whatsappText", whatsappText.trim());
      formData.append("internalNote", internalNote.trim());

      if (file) {
        formData.append("file", file);
      }

      const response = await fetch("/api/admin/whatsapp-import", {
        method: "POST",
        body: formData,
      });

      const rawText = await response.text();

      let payload: ImportResponse | null = null;

      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch {
        throw new Error(
          "Die WhatsApp-Import-Route hat keine JSON-Antwort geliefert. Prüfe bitte zusätzlich das Terminal."
        );
      }

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message || "Die WhatsApp-Anfrage konnte nicht angelegt werden."
        );
      }

      setResult(payload);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Die WhatsApp-Anfrage konnte nicht angelegt werden."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/admin"
            className="inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded-2xl border border-[#E8DED2] bg-white px-4 py-3 text-sm font-black text-[#12395F] shadow-sm transition hover:bg-[#EEF4FA]"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zum Admin-Bereich
          </Link>

          <Link
            href="/admin/anfragen"
            className="inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
          >
            <FileText className="h-4 w-4" />
            Anfragen öffnen
          </Link>
        </div>

        <header className="rounded-[34px] border border-[#E8DED2] bg-white p-5 shadow-[0_18px_45px_rgba(16,42,67,0.10)] sm:p-7">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-3xl bg-[#F0FFF6] text-[#1FA855]">
              <MessageCircle className="h-7 w-7" />
            </div>

            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">
                WhatsApp-Import
              </div>

              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                WhatsApp-Liste als Anfrage anlegen
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#52616F] sm:text-base">
                Nutze diese Seite, wenn ein Kunde seine Schulmaterialliste per
                WhatsApp geschickt hat. Du kannst den WhatsApp-Text einfügen,
                ein Foto/PDF hochladen und daraus eine normale Anfrage im System
                erzeugen.
              </p>
            </div>
          </div>
        </header>

        <form
          onSubmit={handleSubmit}
          className="rounded-[34px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7"
        >
          <div className="grid gap-6">
            <section>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">
                Kundendaten
              </p>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-black text-[#102A43]">
                    Name
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    placeholder="z. B. Maria Müller"
                    className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-black text-[#102A43]">
                    E-Mail
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="z. B. maria@example.de"
                    className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
                  />
                  <p className="mt-2 text-xs font-semibold text-[#52616F]">
                    Wenn eine E-Mail vorhanden ist, wird der Angebotslink direkt
                    dorthin gesendet.
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-black text-[#102A43]">
                    WhatsApp / Telefon
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="z. B. +49 173 3157671"
                    className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-black text-[#102A43]">
                    Kind
                  </label>
                  <input
                    type="text"
                    value={childName}
                    onChange={(event) => setChildName(event.target.value)}
                    placeholder="z. B. Mia"
                    className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-black text-[#102A43]">
                    Schule
                  </label>
                  <input
                    type="text"
                    value={schoolName}
                    onChange={(event) => setSchoolName(event.target.value)}
                    placeholder="z. B. Grundschule Beispiel"
                    className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-black text-[#102A43]">
                    Klasse
                  </label>
                  <input
                    type="text"
                    value={className}
                    onChange={(event) => setClassName(event.target.value)}
                    placeholder="z. B. 1a"
                    className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
                  />
                </div>
              </div>
            </section>

            <section>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">
                WhatsApp-Inhalt
              </p>

              <div className="mt-4 grid gap-4">
                <div>
                  <label className="mb-2 block text-sm font-black text-[#102A43]">
                    WhatsApp-Text / geschriebene Liste
                  </label>
                  <textarea
                    value={whatsappText}
                    onChange={(event) => setWhatsappText(event.target.value)}
                    rows={9}
                    placeholder={`Hier den WhatsApp-Text einfügen, z. B.\n\nHallo, hier ist die Liste für Mia.\n1x Schreibheft A5 Lineatur 1\n2x Umschlag A5 rot\n1x Schnellhefter blau`}
                    className="w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 py-3 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
                  />
                  <p className="mt-2 text-xs font-semibold text-[#52616F]">
                    Wenn keine Datei vorhanden ist, wird der Text als erkannte
                    Listenpositionen übernommen.
                  </p>
                </div>

                <div className="rounded-[26px] border border-dashed border-[#D8C8B8] bg-[#FBF7F0] p-4">
                  <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                    <UploadCloud className="h-4 w-4" />
                    Foto / Screenshot / PDF
                  </div>

                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
                    onChange={(event) => {
                      resetMessages();
                      setFile(event.target.files?.[0] || null);
                    }}
                    className="block w-full rounded-2xl border border-[#E8DED2] bg-white px-4 py-3 text-sm font-semibold text-[#102A43] file:mr-4 file:rounded-xl file:border-0 file:bg-[#12395F] file:px-4 file:py-2 file:text-sm file:font-black file:text-white"
                  />

                  {file ? (
                    <div className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-[#52616F]">
                      Ausgewählt:{" "}
                      <span className="font-black text-[#102A43]">
                        {file.name}
                      </span>
                    </div>
                  ) : null}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-black text-[#102A43]">
                    Interne Notiz
                  </label>
                  <textarea
                    value={internalNote}
                    onChange={(event) => setInternalNote(event.target.value)}
                    rows={3}
                    placeholder="Optional: z. B. Kunde hat per WhatsApp Foto geschickt, E-Mail wurde nachgetragen."
                    className="w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 py-3 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
                  />
                </div>
              </div>
            </section>

            {errorMessage ? (
              <div className="rounded-2xl border border-[#F2B8B8] bg-[#FFF1F1] px-4 py-3 text-sm font-bold text-[#B5282D]">
                {errorMessage}
              </div>
            ) : null}

            {result?.ok ? (
              <div className="rounded-[26px] border border-[#BFE3CD] bg-[#F0FFF6] p-5 text-[#2F7D50]">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-black">
                      WhatsApp-Anfrage wurde angelegt.
                    </p>

                    <p className="mt-1 text-sm font-semibold leading-6">
                      {result.requestNumber
                        ? `Anfrage: ${result.requestNumber}`
                        : "Die Anfrage erscheint jetzt in der Admin-Übersicht."}
                    </p>

                    {result.emailMessage ? (
                      <p className="mt-1 text-sm font-semibold leading-6">
                        {result.emailMessage}
                      </p>
                    ) : null}

                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      {result.requestId ? (
                        <Link
                          href={`/admin/anfragen/${result.requestId}`}
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
                        >
                          Anfrage öffnen
                          <ArrowLeft className="h-4 w-4 rotate-180" />
                        </Link>
                      ) : null}

                      <button
                        type="button"
                        onClick={resetForm}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[#BFE3CD] bg-white px-4 py-3 text-sm font-black text-[#2F7D50] shadow-sm transition hover:bg-[#F0FFF6]"
                      >
                        Nächste WhatsApp-Anfrage
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Anfrage wird angelegt …
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    WhatsApp-Anfrage anlegen
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={resetForm}
                disabled={isSaving}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#D8C8B8] bg-white px-5 py-3 text-sm font-black text-[#12395F] shadow-sm transition hover:bg-[#EEF4FA] disabled:cursor-not-allowed disabled:opacity-70"
              >
                Felder leeren
              </button>
            </div>
          </div>
        </form>
      </section>
    </main>
  );
}