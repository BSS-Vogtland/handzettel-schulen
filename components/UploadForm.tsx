"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Loader2,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";

type UploadResponse = {
  ok?: boolean;
  message?: string;
  offerUrl?: string;
  token?: string;
  offerToken?: string;
  requestId?: string;
  requestNumber?: string;
};

const MAX_FILE_SIZE_MB = 20;
const ACCEPTED_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export default function UploadForm() {
  const router = useRouter();

  const [customerName, setCustomerName] = useState("");
  const [childName, setChildName] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [className, setClassName] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const filePreviewLabel = useMemo(() => {
    if (!file) return "JPG, PNG, WEBP oder PDF hochladen";

    return `${file.name} · ${formatFileSize(file.size)}`;
  }, [file]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] || null;

    setErrorMessage(null);
    setSuccessMessage(null);

    if (!selectedFile) {
      setFile(null);
      return;
    }

    if (!ACCEPTED_FILE_TYPES.includes(selectedFile.type)) {
      setFile(null);
      setErrorMessage(
        "Bitte lade eine Schulmaterialliste als JPG, PNG, WEBP oder PDF hoch."
      );
      event.target.value = "";
      return;
    }

    const maxBytes = MAX_FILE_SIZE_MB * 1024 * 1024;

    if (selectedFile.size > maxBytes) {
      setFile(null);
      setErrorMessage(
        `Die Datei ist zu groß. Bitte lade maximal ${MAX_FILE_SIZE_MB} MB hoch.`
      );
      event.target.value = "";
      return;
    }

    setFile(selectedFile);
  }

  function removeFile() {
    setFile(null);
    setErrorMessage(null);
    setSuccessMessage(null);

    const input = document.getElementById(
      "school-list-file"
    ) as HTMLInputElement | null;

    if (input) {
      input.value = "";
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    if (!file) {
      setErrorMessage("Bitte lade zuerst Deine Schulmaterialliste hoch.");
      return;
    }

    if (!customerName.trim()) {
      setErrorMessage("Bitte gib Deinen Namen ein.");
      return;
    }

    if (!childName.trim()) {
      setErrorMessage("Bitte gib den Namen Deines Kindes ein.");
      return;
    }

    if (!contact.trim()) {
      setErrorMessage(
        "Bitte gib eine E-Mail-Adresse oder Telefonnummer an, damit wir Dich erreichen können."
      );
      return;
    }

    const formData = new FormData();

    formData.append("file", file);
    formData.append("customerName", customerName.trim());
    formData.append("customer_name", customerName.trim());
    formData.append("childName", childName.trim());
    formData.append("child_name", childName.trim());
    formData.append("schoolName", schoolName.trim());
    formData.append("school_name", schoolName.trim());
    formData.append("className", className.trim());
    formData.append("class_name", className.trim());
    formData.append("contact", contact.trim());
    formData.append("email", contact.trim());
    formData.append("phone", contact.trim());
    formData.append("message", message.trim());
    formData.append("source", "website_upload");

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const rawText = await response.text();

      let payload: UploadResponse | null = null;

      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch {
        throw new Error(
          "Die Upload-Route hat keine JSON-Antwort geliefert. Prüfe bitte zusätzlich das Terminal."
        );
      }

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message ||
            "Die Liste konnte nicht hochgeladen werden. Prüfe bitte zusätzlich das Terminal."
        );
      }

      setSuccessMessage(
        "Deine Liste wurde hochgeladen. Du wirst jetzt zur Auswertung weitergeleitet."
      );

      const nextUrl =
        payload.offerUrl ||
        (payload.token ? `/angebot/${payload.token}` : null) ||
        (payload.offerToken ? `/angebot/${payload.offerToken}` : null);

      if (!nextUrl) {
        throw new Error(
          "Die Anfrage wurde erstellt, aber es wurde kein Angebotslink zurückgegeben."
        );
      }

      router.push(nextUrl);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Die Liste konnte nicht hochgeladen werden."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[34px] border border-[#E8DED2] bg-white p-5 shadow-[0_18px_45px_rgba(16,42,67,0.10)] sm:p-7"
    >
      <div className="mb-6">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#A75B28]">
          <UploadCloud className="h-3.5 w-3.5" />
          Liste hochladen
        </div>

        <h2 className="text-2xl font-black tracking-tight text-[#102A43] sm:text-3xl">
          Schulmaterialliste hochladen
        </h2>

        <p className="mt-3 text-sm leading-6 text-[#52616F] sm:text-base">
          Lade die Liste als Foto oder PDF hoch. Danach kommst Du direkt zur
          Auswertung und kannst passende Produkte selbst auswählen.
        </p>
      </div>

      <div className="grid gap-5">
        <div>
          <label
            htmlFor="school-list-file"
            className="group flex cursor-pointer flex-col items-center justify-center rounded-[28px] border-2 border-dashed border-[#D8C8B8] bg-[#FBF7F0] px-5 py-8 text-center transition hover:border-[#B5282D] hover:bg-[#FFF8F4]"
          >
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-[#B5282D] shadow-sm transition group-hover:scale-105">
              <UploadCloud className="h-8 w-8" />
            </div>

            <span className="text-lg font-black text-[#102A43]">
              {file ? "Datei ausgewählt" : "Liste auswählen"}
            </span>

            <span className="mt-2 max-w-md text-sm leading-6 text-[#52616F]">
              {filePreviewLabel}
            </span>

            <span className="mt-3 rounded-full bg-white px-3 py-1 text-xs font-bold text-[#A75B28]">
              Max. {MAX_FILE_SIZE_MB} MB
            </span>

            <input
              id="school-list-file"
              name="file"
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>

          {file ? (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-[#E8DED2] bg-white px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
                  <FileText className="h-5 w-5" />
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#102A43]">
                    {file.name}
                  </p>
                  <p className="text-xs font-semibold text-[#52616F]">
                    {formatFileSize(file.size)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={removeFile}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FBF7F0] text-[#B5282D] transition hover:bg-[#FFECEC]"
                aria-label="Datei entfernen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="customerName"
              className="mb-2 block text-sm font-black text-[#102A43]"
            >
              Dein Name*
            </label>
            <input
              id="customerName"
              name="customerName"
              type="text"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="z. B. Maria Müller"
              className="min-h-14 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            />
          </div>

          <div>
            <label
              htmlFor="childName"
              className="mb-2 block text-sm font-black text-[#102A43]"
            >
              Name des Kindes*
            </label>
            <input
              id="childName"
              name="childName"
              type="text"
              value={childName}
              onChange={(event) => setChildName(event.target.value)}
              placeholder="z. B. Martin"
              className="min-h-14 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="schoolName"
              className="mb-2 block text-sm font-black text-[#102A43]"
            >
              Schule
            </label>
            <input
              id="schoolName"
              name="schoolName"
              type="text"
              value={schoolName}
              onChange={(event) => setSchoolName(event.target.value)}
              placeholder="z. B. Grundschule Musterstadt"
              className="min-h-14 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            />
          </div>

          <div>
            <label
              htmlFor="className"
              className="mb-2 block text-sm font-black text-[#102A43]"
            >
              Klasse
            </label>
            <input
              id="className"
              name="className"
              type="text"
              value={className}
              onChange={(event) => setClassName(event.target.value)}
              placeholder="z. B. 1a"
              className="min-h-14 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="contact"
            className="mb-2 block text-sm font-black text-[#102A43]"
          >
            E-Mail oder Telefonnummer*
          </label>
          <input
            id="contact"
            name="contact"
            type="text"
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            placeholder="Damit wir Dich erreichen können"
            className="min-h-14 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
          />
        </div>

        <div>
          <label
            htmlFor="message"
            className="mb-2 block text-sm font-black text-[#102A43]"
          >
            Bemerkung
          </label>
          <textarea
            id="message"
            name="message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Optional: Hinweise zu besonderen Wünschen, Abholung oder Rückfragen"
            rows={4}
            className="w-full resize-y rounded-2xl border border-[#D8C8B8] bg-white px-4 py-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
          />
        </div>

        {errorMessage ? (
          <div className="rounded-2xl border border-[#F0C7C7] bg-[#FFF5F5] px-4 py-3 text-sm font-semibold text-[#B5282D]">
            {errorMessage}
          </div>
        ) : null}

        {successMessage ? (
          <div className="flex items-start gap-3 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] px-4 py-3 text-sm font-semibold text-[#2F7D50]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="group flex min-h-[72px] w-full items-center justify-center gap-3 rounded-[26px] bg-[#B5282D] px-6 py-5 text-center text-lg font-black leading-tight text-white shadow-[0_18px_35px_rgba(181,40,45,0.28)] transition hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70 sm:text-xl"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin" />
              Liste wird hochgeladen …
            </>
          ) : (
            <>
              Liste hochladen & zur Auswertung
              <ArrowRight className="h-6 w-6 transition group-hover:translate-x-1" />
            </>
          )}
        </button>

        <div className="flex items-center justify-center gap-2 text-center text-xs font-semibold text-[#52616F]">
          <ShieldCheck className="h-4 w-4 text-[#2F7D50]" />
          Deine Daten werden vertraulich behandelt.
        </div>
      </div>
    </form>
  );
}