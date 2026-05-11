"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  MessageCircle,
  PackageCheck,
  ScanSearch,
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
  insertedItemCount?: number;
  nextStep?: string;
};

type PrepareResponse = {
  ok?: boolean;
  message?: string;
  redirectUrl?: string;
  offerUrl?: string | null;
  analyzeRan?: boolean;
  analyzeMessage?: string | null;
  matchMessage?: string | null;
  itemCount?: number;
  matchCount?: number;
  safeMatchCount?: number;
  autoPreselectedCount?: number;
  needsManualReview?: boolean;
};

type ExtractedWhatsappData = {
  customerName: string;
  email: string;
  phone: string;
  childName: string;
  schoolName: string;
  className: string;
};

const FIELD_LABELS: Record<keyof ExtractedWhatsappData, string> = {
  customerName: "Name",
  email: "E-Mail",
  phone: "Telefon",
  childName: "Kind",
  schoolName: "Schule",
  className: "Klasse",
};

function normalizeLabel(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "");
}

function cleanExtractedValue(value: string) {
  return value
    .replace(/^[\s:：\-–—]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isProbablyPlaceholder(value: string) {
  const text = value.toLowerCase().trim();

  if (!text) return true;

  return (
    text === "name" ||
    text === "e-mail" ||
    text === "email" ||
    text === "telefon" ||
    text === "kind" ||
    text === "schule" ||
    text === "klasse" ||
    text.includes("ich sende die liste") ||
    text.includes("foto/pdf") ||
    text.includes("schreibe sie direkt")
  );
}

function extractLabeledValue(lines: string[], labels: string[]) {
  const normalizedLabels = labels.map(normalizeLabel);

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] || "";
    const line = rawLine.trim();

    if (!line) continue;

    const colonMatch = line.match(/^([^:：]{2,40})[:：](.*)$/);

    if (colonMatch) {
      const label = normalizeLabel(colonMatch[1]);
      const valueAfterColon = cleanExtractedValue(colonMatch[2] || "");

      if (normalizedLabels.includes(label)) {
        if (valueAfterColon && !isProbablyPlaceholder(valueAfterColon)) {
          return valueAfterColon;
        }

        for (
          let nextIndex = index + 1;
          nextIndex < lines.length;
          nextIndex += 1
        ) {
          const nextLine = cleanExtractedValue(lines[nextIndex] || "");

          if (!nextLine) continue;

          const nextLineLooksLikeField = /^([^:：]{2,40})[:：]/.test(nextLine);
          if (nextLineLooksLikeField) break;

          if (!isProbablyPlaceholder(nextLine)) {
            return nextLine;
          }
        }
      }
    }

    const looseMatch = line.match(/^([A-Za-zÄÖÜäöüß\-\s]{2,40})\s+(.*)$/);

    if (looseMatch) {
      const label = normalizeLabel(looseMatch[1]);
      const value = cleanExtractedValue(looseMatch[2] || "");

      if (
        normalizedLabels.includes(label) &&
        value &&
        !isProbablyPlaceholder(value)
      ) {
        return value;
      }
    }
  }

  return "";
}

function extractWhatsappData(text: string): ExtractedWhatsappData {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);

  const phoneMatch =
    text.match(/(?:\+49|0049|0)\s?(?:\(?\d+\)?[\s./-]?){6,}/) ||
    text.match(/\+\d{8,16}/);

  const customerName = extractLabeledValue(lines, [
    "Name",
    "Kundenname",
    "Mutter",
    "Vater",
    "Elternteil",
    "Ansprechpartner",
  ]);

  const labeledEmail = extractLabeledValue(lines, [
    "E-Mail",
    "Email",
    "Mail",
    "E Mail",
    "E-Mail-Adresse",
    "Email-Adresse",
  ]);

  const labeledPhone = extractLabeledValue(lines, [
    "Telefon",
    "Telefonnummer",
    "WhatsApp",
    "Whatsapp",
    "Handy",
    "Mobil",
    "Mobile",
  ]);

  const childName = extractLabeledValue(lines, [
    "Kind",
    "Name des Kindes",
    "Kindname",
    "Schueler",
    "Schülerin",
    "Schüler",
    "Schuelerin",
  ]);

  const schoolName = extractLabeledValue(lines, [
    "Schule",
    "Schulname",
    "Grundschule",
  ]);

  const className = extractLabeledValue(lines, [
    "Klasse",
    "Klassenstufe",
    "Klasse/Stufe",
  ]);

  return {
    customerName,
    email: labeledEmail || emailMatch?.[0]?.trim() || "",
    phone: labeledPhone || phoneMatch?.[0]?.trim() || "",
    childName,
    schoolName,
    className,
  };
}

function getDetectedSummary(data: ExtractedWhatsappData) {
  return Object.entries(data)
    .filter(([, value]) => String(value || "").trim().length > 0)
    .map(([key, value]) => ({
      label: FIELD_LABELS[key as keyof ExtractedWhatsappData],
      value,
    }));
}

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
  const [isPreparing, setIsPreparing] = useState(false);

  const [result, setResult] = useState<ImportResponse | null>(null);
  const [prepareResult, setPrepareResult] = useState<PrepareResponse | null>(
    null
  );

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [extractMessage, setExtractMessage] = useState<string | null>(null);
  const [detectedData, setDetectedData] = useState<ExtractedWhatsappData | null>(
    null
  );

  function resetMessages() {
    setResult(null);
    setPrepareResult(null);
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
    setPrepareResult(null);
    setErrorMessage(null);
    setExtractMessage(null);
    setDetectedData(null);
  }

  function handleExtractFromText() {
    resetMessages();

    if (!whatsappText.trim()) {
      setDetectedData(null);
      setExtractMessage(null);
      setErrorMessage(
        "Bitte füge zuerst den WhatsApp-Text ein. Danach können die Kundendaten daraus übernommen werden."
      );
      return;
    }

    const extracted = extractWhatsappData(whatsappText);
    const detectedSummary = getDetectedSummary(extracted);

    if (detectedSummary.length === 0) {
      setDetectedData(extracted);
      setExtractMessage(null);
      setErrorMessage(
        "Es wurden keine Kundendaten erkannt. Prüfe, ob im WhatsApp-Text Angaben wie Name:, E-Mail:, Telefon:, Kind:, Schule: und Klasse: enthalten sind."
      );
      return;
    }

    setCustomerName((current) => current.trim() || extracted.customerName);
    setEmail((current) => current.trim() || extracted.email);
    setPhone((current) => current.trim() || extracted.phone);
    setChildName((current) => current.trim() || extracted.childName);
    setSchoolName((current) => current.trim() || extracted.schoolName);
    setClassName((current) => current.trim() || extracted.className);

    setDetectedData(extracted);
    setErrorMessage(null);
    setExtractMessage(
      `${detectedSummary.length} Angabe${
        detectedSummary.length === 1 ? "" : "n"
      } erkannt und in leere Felder übernommen. Bitte prüfe die Daten vor dem Speichern.`
    );
  }

  async function handlePrepareWhatsappRequest() {
    if (!result?.requestId || isPreparing) return;

    setIsPreparing(true);
    setErrorMessage(null);
    setPrepareResult(null);

    try {
      const response = await fetch(
        `/api/admin/requests/${result.requestId}/prepare-whatsapp`,
        {
          method: "POST",
        }
      );

      const rawText = await response.text();

      let payload: PrepareResponse | null = null;

      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch {
        throw new Error(
          "Die Vorbereitungs-Route hat keine JSON-Antwort geliefert. Prüfe bitte zusätzlich das Terminal."
        );
      }

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message ||
            "Die WhatsApp-Anfrage konnte nicht vorbereitet werden."
        );
      }

      setPrepareResult(payload);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Die WhatsApp-Anfrage konnte nicht vorbereitet werden."
      );
    } finally {
      setIsPreparing(false);
    }
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

  const detectedSummary = detectedData ? getDetectedSummary(detectedData) : [];

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
                WhatsApp geschickt hat. Nach dem Import wird der Kundenlink noch
                nicht automatisch versendet. Erst bereitest Du die Liste und den
                Paketwunsch vor.
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
                    Der Link wird nicht sofort beim Import versendet. Erst nach
                    Vorbereitung des Paketwunsches.
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
                  <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <label className="block text-sm font-black text-[#102A43]">
                      WhatsApp-Text / geschriebene Liste
                    </label>

                    <button
                      type="button"
                      onClick={handleExtractFromText}
                      className="inline-flex min-h-10 w-fit items-center justify-center gap-2 rounded-2xl bg-[#1FA855] px-4 py-2 text-sm font-black text-white shadow-sm transition hover:brightness-110"
                    >
                      <ScanSearch className="h-4 w-4" />
                      Daten aus Text übernehmen
                    </button>
                  </div>

                  <textarea
                    value={whatsappText}
                    onChange={(event) => {
                      setWhatsappText(event.target.value);
                      setExtractMessage(null);
                      setDetectedData(null);
                    }}
                    rows={9}
                    placeholder={`Hier den WhatsApp-Text einfügen, z. B.

Name: Maria Müller
E-Mail: maria@example.de
Telefon: +49 173 3157671
Kind: Mia
Schule: Grundschule Beispiel
Klasse: 1a

1x Schreibheft A5 Lineatur 1
2x Umschlag A5 rot
1x Schnellhefter blau`}
                    className="w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 py-3 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
                  />

                  <div className="mt-2 grid gap-2">
                    <p className="text-xs font-semibold text-[#52616F]">
                      Wenn keine Datei vorhanden ist, wird der Text als erkannte
                      Listenpositionen übernommen.
                    </p>

                    <p className="text-xs font-semibold text-[#52616F]">
                      Tipp: Erst WhatsApp-Text einfügen, dann{" "}
                      <span className="font-black text-[#1FA855]">
                        „Daten aus Text übernehmen“
                      </span>{" "}
                      klicken und die Felder oben prüfen.
                    </p>
                  </div>
                </div>

                {extractMessage ? (
                  <div className="rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] px-4 py-3 text-sm font-bold text-[#2F7D50]">
                    {extractMessage}
                  </div>
                ) : null}

                {detectedSummary.length > 0 ? (
                  <div className="rounded-[24px] border border-[#BFE3CD] bg-[#F0FFF6] p-4">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
                      Erkannte Angaben
                    </p>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {detectedSummary.map((item) => (
                        <div
                          key={item.label}
                          className="rounded-2xl bg-white px-4 py-3 text-sm"
                        >
                          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#2F7D50]">
                            {item.label}
                          </p>
                          <p className="mt-1 font-black text-[#102A43]">
                            {item.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

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
                  <div className="min-w-0 flex-1">
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

                    <div className="mt-4 rounded-2xl border border-[#BFE3CD] bg-white p-4 text-[#102A43]">
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
                        Nächster Schritt
                      </p>
                      <p className="mt-1 text-sm font-bold leading-6 text-[#52616F]">
                        Jetzt die Liste auswerten, Produktvorschläge erzeugen
                        und sichere Treffer automatisch in den Paketwunsch legen.
                      </p>

                      <button
                        type="button"
                        onClick={handlePrepareWhatsappRequest}
                        disabled={isPreparing || Boolean(prepareResult?.ok)}
                        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[#1FA855] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
                      >
                        {isPreparing ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Liste wird vorbereitet …
                          </>
                        ) : prepareResult?.ok ? (
                          <>
                            <CheckCircle2 className="h-4 w-4" />
                            Paketwunsch vorbereitet
                          </>
                        ) : (
                          <>
                            <PackageCheck className="h-4 w-4" />
                            Liste auswerten & Paketwunsch vorbereiten
                          </>
                        )}
                      </button>
                    </div>

                    {prepareResult?.ok ? (
                      <div className="mt-4 rounded-2xl border border-[#BFE3CD] bg-white p-4 text-sm font-semibold leading-6 text-[#52616F]">
                        <p className="font-black text-[#2F7D50]">
                          {prepareResult.message ||
                            "Die WhatsApp-Liste wurde vorbereitet."}
                        </p>

                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <p>
                            Erkannte Positionen:{" "}
                            <span className="font-black text-[#102A43]">
                              {prepareResult.itemCount ?? "—"}
                            </span>
                          </p>
                          <p>
                            Produktvorschläge:{" "}
                            <span className="font-black text-[#102A43]">
                              {prepareResult.matchCount ?? "—"}
                            </span>
                          </p>
                          <p>
                            Sichere Treffer:{" "}
                            <span className="font-black text-[#102A43]">
                              {prepareResult.safeMatchCount ?? "—"}
                            </span>
                          </p>
                          <p>
                            Im Paket vorausgewählt:{" "}
                            <span className="font-black text-[#102A43]">
                              {prepareResult.autoPreselectedCount ?? "—"}
                            </span>
                          </p>
                        </div>
                      </div>
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
                disabled={isSaving || Boolean(result?.ok)}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Anfrage wird angelegt …
                  </>
                ) : result?.ok ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Anfrage angelegt
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
                disabled={isSaving || isPreparing}
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