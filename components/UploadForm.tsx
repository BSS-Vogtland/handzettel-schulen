"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";

type UploadResponse = {
  ok?: boolean;
  message?: string;
  offerUrl?: string;
  redirectUrl?: string;
  token?: string;
  offerToken?: string;
  requestId?: string;
  requestNumber?: string;
};

type ChildUploadFormState = {
  id: string;
  childName: string;
  schoolName: string;
  className: string;
  file: File | null;
};

const MAX_FILE_SIZE_MB = 20;
const ACCEPTED_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

const DISCOVERY_SOURCE_OPTIONS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "google", label: "Google" },
  { value: "flyer_aushang", label: "Flyer/Aushang" },
  { value: "empfehlung", label: "Empfehlung" },
] as const;

function createChildState(index: number): ChildUploadFormState {
  return {
    id: `child-${Date.now()}-${Math.random().toString(16).slice(2)}-${index}`,
    childName: "",
    schoolName: "",
    className: "",
    file: null,
  };
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function getStoredLeadSource() {
  if (typeof window === "undefined") return "website";

  try {
    return window.localStorage.getItem("hds_lead_source") || "website";
  } catch {
    return "website";
  }
}

function getFileInputId(childId: string) {
  return `school-list-file-${childId}`;
}

function TrustItem({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] px-3 py-3 text-sm font-semibold leading-5 text-[#52616F]">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2F7D50]" />
      <span>{text}</span>
    </div>
  );
}

export default function UploadForm() {
  const router = useRouter();

  const [customerName, setCustomerName] = useState("");
  const [children, setChildren] = useState<ChildUploadFormState[]>([
    createChildState(1),
  ]);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [discoverySource, setDiscoverySource] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const uploadedChildCount = useMemo(
    () => children.filter((child) => child.file).length,
    [children]
  );

  function updateChild(
    childId: string,
    patch: Partial<Omit<ChildUploadFormState, "id">>
  ) {
    setChildren((current) =>
      current.map((child) =>
        child.id === childId ? { ...child, ...patch } : child
      )
    );
  }

  function addChild() {
    setChildren((current) => [...current, createChildState(current.length + 1)]);
  }

  function removeChild(childId: string) {
    setErrorMessage(null);
    setSuccessMessage(null);

    setChildren((current) => {
      if (current.length <= 1) return current;

      return current.filter((child) => child.id !== childId);
    });
  }

  function handleChildFileChange(
    childId: string,
    event: ChangeEvent<HTMLInputElement>
  ) {
    const selectedFile = event.target.files?.[0] || null;

    setErrorMessage(null);
    setSuccessMessage(null);

    if (!selectedFile) {
      updateChild(childId, { file: null });
      return;
    }

    if (!ACCEPTED_FILE_TYPES.includes(selectedFile.type)) {
      updateChild(childId, { file: null });
      setErrorMessage(
        "Bitte lade die Schulmaterialliste als JPG, PNG, WEBP oder PDF hoch."
      );
      event.target.value = "";
      return;
    }

    const maxBytes = MAX_FILE_SIZE_MB * 1024 * 1024;

    if (selectedFile.size > maxBytes) {
      updateChild(childId, { file: null });
      setErrorMessage(
        `Die Datei ist zu gross. Bitte lade maximal ${MAX_FILE_SIZE_MB} MB hoch.`
      );
      event.target.value = "";
      return;
    }

    updateChild(childId, { file: selectedFile });
  }

  function removeChildFile(childId: string) {
    updateChild(childId, { file: null });
    setErrorMessage(null);
    setSuccessMessage(null);

    const input = document.getElementById(
      getFileInputId(childId)
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

    const normalizedChildren = children.map((child, index) => ({
      ...child,
      label: child.childName.trim() || `Kind ${index + 1}`,
      childName: child.childName.trim(),
      schoolName: child.schoolName.trim(),
      className: child.className.trim(),
    }));

    if (normalizedChildren.every((child) => !child.file)) {
      setErrorMessage(
        "Bitte lade mindestens eine Schulmaterialliste fuer ein Kind hoch."
      );
      return;
    }

    if (!customerName.trim()) {
      setErrorMessage("Bitte gib Deinen Namen ein.");
      return;
    }

    const firstChildWithoutName = normalizedChildren.find(
      (child) => child.file && !child.childName
    );

    if (firstChildWithoutName) {
      setErrorMessage(
        "Bitte gib fuer jede hochgeladene Liste den Namen des Kindes ein."
      );
      return;
    }

    if (!email.trim()) {
      setErrorMessage("Bitte gib Deine E-Mail-Adresse ein.");
      return;
    }

    if (!isValidEmail(email)) {
      setErrorMessage("Bitte gib eine gueltige E-Mail-Adresse ein.");
      return;
    }

    if (!discoverySource) {
      setErrorMessage(
        "Bitte w\u00e4hle aus, wie Du auf uns aufmerksam geworden bist."
      );
      return;
    }

    const cleanEmail = email.trim();
    const cleanPhone = phone.trim();
    const firstUploadedChild =
      normalizedChildren.find((child) => child.file) || normalizedChildren[0];

    const formData = new FormData();

    formData.append("customerName", customerName.trim());
    formData.append("customer_name", customerName.trim());

    formData.append("childName", firstUploadedChild.childName);
    formData.append("child_name", firstUploadedChild.childName);
    formData.append("schoolName", firstUploadedChild.schoolName);
    formData.append("school_name", firstUploadedChild.schoolName);
    formData.append("className", firstUploadedChild.className);
    formData.append("class_name", firstUploadedChild.className);

    formData.append("email", cleanEmail);
    formData.append("customer_email", cleanEmail);
    formData.append("contact", cleanEmail);

    formData.append("phone", cleanPhone);
    formData.append("customer_phone", cleanPhone);

    formData.append("message", message.trim());
    formData.append("source", getStoredLeadSource());
    formData.append("discoverySource", discoverySource);
    formData.append("discovery_source", discoverySource);

    formData.append(
      "children",
      JSON.stringify(
        normalizedChildren.map((child, index) => ({
          clientId: child.id,
          label: child.label,
          childName: child.childName,
          schoolName: child.schoolName,
          className: child.className,
          sortOrder: index + 1,
          hasFile: Boolean(child.file),
          fileFieldKey: `childFile_${child.id}`,
        }))
      )
    );

    for (const child of normalizedChildren) {
      if (!child.file) continue;

      formData.append(`childFile_${child.id}`, child.file);


    }

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
          "Die Upload-Route hat keine JSON-Antwort geliefert. Pruefe bitte zusaetzlich das Terminal."
        );
      }

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message ||
            "Die Liste konnte nicht hochgeladen werden. Pruefe bitte zusaetzlich das Terminal."
        );
      }

      setSuccessMessage(
        "Deine Liste wurde hochgeladen. Du wirst jetzt zum naechsten Schritt weitergeleitet."
      );

      const nextUrl =
        payload.offerUrl ||
        payload.redirectUrl ||
        (payload.token ? `/angebot/${payload.token}` : null) ||
        (payload.offerToken ? `/angebot/${payload.offerToken}` : null);

      if (!nextUrl) {
        throw new Error(
          "Die Anfrage wurde erstellt, aber es wurde kein Angebotslink zurueckgegeben."
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
          Sicherer Upload
        </div>

        <h2 className="text-2xl font-black tracking-tight text-[#102A43] sm:text-3xl">
          Materiallisten hochladen
        </h2>

        <p className="mt-3 text-sm leading-6 text-[#52616F] sm:text-base">
          Lade fuer jedes Kind die passende Schulmaterialliste hoch. Du kannst
          mehrere Kinder in einer Anfrage erfassen.
        </p>
      </div>

      <div className="mb-5 rounded-[24px] border border-[#F1D1A8] bg-[#FFF8EE] p-4 text-sm font-bold leading-6 text-[#A75B28]">
        <p className="font-black text-[#102A43]">
          Mit dem Upload bestellst Du noch nichts.
        </p>
        <p className="mt-1">
          Du bekommst zuerst eine Auswertung und entscheidest danach selbst, ob
          Du Deinen Paketwunsch absendest.
        </p>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <TrustItem text="Deine Listen werden vertraulich behandelt." />
        <TrustItem text="Jedes Kind bekommt eine eigene Zusammenfassung." />
        <TrustItem text="Unklare Artikel werden persoenlich geprueft." />
        <TrustItem text="Zahlung erfolgt erst nach Rechnung." />
      </div>

      <div className="grid gap-5">
        <div className="rounded-[26px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
          <h3 className="text-lg font-black text-[#102A43]">
            Deine Kontaktdaten
          </h3>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
                placeholder="z. B. Maria Mueller"
                className="min-h-14 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-black text-[#102A43]"
              >
                E-Mail-Adresse*
              </label>
              <input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="z. B. name@email.de"
                className="min-h-14 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
              />
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="phone"
                className="mb-2 block text-sm font-black text-[#102A43]"
              >
                Telefonnummer
                <span className="font-semibold text-[#52616F]"> optional</span>
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="Optional fuer Rueckfragen"
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
                placeholder="Optional: Hinweise zu besonderen Wuenschen, Abholung oder Rueckfragen"
                rows={3}
                className="w-full resize-y rounded-2xl border border-[#D8C8B8] bg-white px-4 py-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
              />
            </div>
          </div>
        </div>

        <section className="rounded-[26px] border border-[#E8DED2] bg-white p-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                Kinder und Listen
              </p>
              <h3 className="mt-1 text-xl font-black text-[#102A43]">
                Pro Kind eine Liste hochladen
              </h3>
              <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                Wenn Du mehrere Kinder hast, fuege sie hier hinzu. So koennen
                wir die Listen direkt getrennt auswerten.
              </p>
            </div>

            <div className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] px-4 py-3 text-sm font-black text-[#102A43]">
              {uploadedChildCount}/{children.length} Liste
              {children.length === 1 ? "" : "n"}
            </div>
          </div>

          <div className="grid gap-4">
            {children.map((child, index) => {
              const fileInputId = getFileInputId(child.id);
              const filePreviewLabel = child.file
                ? `Datei gespeichert - ${formatFileSize(child.file.size)}`
                : "JPG, PNG, WEBP oder PDF hochladen";

              return (
                <article
                  key={child.id}
                  className="rounded-[26px] border border-[#E8DED2] bg-[#FBF7F0] p-4"
                >
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                        Kind {index + 1}
                      </p>
                      <h4 className="text-lg font-black text-[#102A43]">
                        {child.childName.trim() || `Kind ${index + 1}`}
                      </h4>
                    </div>

                    {children.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeChild(child.id)}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-[#F0C7C7] bg-white px-4 py-2 text-sm font-black text-[#B5282D] transition hover:bg-[#FFF1F1]"
                      >
                        <Trash2 className="h-4 w-4" />
                        Entfernen
                      </button>
                    ) : null}
                  </div>

                  <div className="grid gap-4">
                    <div className="grid gap-4">
                      <div>
                        <label
                          htmlFor={`childName-${child.id}`}
                          className="mb-2 block text-sm font-black text-[#102A43]"
                        >
                          Name des Kindes*
                        </label>
                        <input
                          id={`childName-${child.id}`}
                          type="text"
                          value={child.childName}
                          onChange={(event) =>
                            updateChild(child.id, {
                              childName: event.target.value,
                            })
                          }
                          placeholder="z. B. Emma"
                          className="min-h-14 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
                        />
                      </div>

                      <div className="grid gap-4">
                        <div>
                          <label
                            htmlFor={`className-${child.id}`}
                            className="mb-2 block text-sm font-black text-[#102A43]"
                          >
                            Klasse
                          </label>
                          <input
                            id={`className-${child.id}`}
                            type="text"
                            value={child.className}
                            onChange={(event) =>
                              updateChild(child.id, {
                                className: event.target.value,
                              })
                            }
                            placeholder="z. B. 2a"
                            className="min-h-14 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor={`schoolName-${child.id}`}
                            className="mb-2 block text-sm font-black text-[#102A43]"
                          >
                            Schule
                          </label>
                          <input
                            id={`schoolName-${child.id}`}
                            type="text"
                            value={child.schoolName}
                            onChange={(event) =>
                              updateChild(child.id, {
                                schoolName: event.target.value,
                              })
                            }
                            placeholder="z. B. Grundschule"
                            className="min-h-14 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 text-sm font-semibold text-[#102A43] outline-none transition placeholder:text-[#9AA7B2] focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor={fileInputId}
                        className="group flex min-h-[170px] cursor-pointer flex-col items-center justify-center rounded-[28px] border-2 border-dashed border-[#D8C8B8] bg-white px-5 py-7 text-center transition hover:border-[#B5282D] hover:bg-[#FFF8F4]"
                      >
                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-[#FBF7F0] text-[#B5282D] shadow-sm transition group-hover:scale-105">
                          <UploadCloud className="h-7 w-7" />
                        </div>

                        <span className="text-lg font-black text-[#102A43]">
                          {child.file
                            ? "Liste ausgewaehlt"
                            : "Liste fuer dieses Kind auswaehlen"}
                        </span>

                        <span className="mt-2 max-w-md text-sm leading-6 text-[#52616F]">
                          {filePreviewLabel}
                        </span>

                        <span className="mt-3 rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-bold text-[#A75B28]">
                          Max. {MAX_FILE_SIZE_MB} MB
                        </span>

                        <input
                          id={fileInputId}
                          type="file"
                          accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                          onChange={(event) =>
                            handleChildFileChange(child.id, event)
                          }
                          className="sr-only"
                        />
                      </label>

                      {child.file ? (
                        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-[#E8DED2] bg-white px-4 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
                              <FileText className="h-5 w-5" />
                            </div>

                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-[#102A43]">
                                {child.file.name}
                              </p>
                              <p className="text-xs font-semibold text-[#52616F]">
                                {formatFileSize(child.file.size)}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeChildFile(child.id)}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FBF7F0] text-[#B5282D] transition hover:bg-[#FFECEC]"
                            aria-label="Datei entfernen"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <button
            type="button"
            onClick={addChild}
            className="mt-4 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#D8C8B8] bg-white px-5 py-3 text-sm font-black text-[#102A43] transition hover:border-[#B5282D] hover:text-[#B5282D]"
          >
            <Plus className="h-4 w-4" />
            Weiteres Kind hinzufuegen
          </button>
        </section>

        <section className="rounded-[26px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Kurze Pflichtangabe
            </p>
            <h3 className="mt-1 text-xl font-black text-[#102A43]">
              Wie bist Du auf uns aufmerksam geworden?*
            </h3>
            <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
              Bitte w\u00e4hle einen Kanal aus. So sehen wir, welche Wege wirklich funktionieren.
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DISCOVERY_SOURCE_OPTIONS.map((option) => {
              const isSelected = discoverySource === option.value;

              return (
                <label
                  key={option.value}
                  className={`flex min-h-12 cursor-pointer items-center justify-center rounded-2xl border px-4 py-3 text-sm font-black transition ${
                    isSelected
                      ? "border-[#B5282D] bg-[#B5282D] text-white shadow-sm"
                      : "border-[#D8C8B8] bg-white text-[#102A43] hover:border-[#B5282D] hover:bg-[#FFF8F4]"
                  }`}
                >
                  <input
                    type="radio"
                    name="discoverySource"
                    value={option.value}
                    checked={isSelected}
                    onChange={() => {
                      setDiscoverySource(option.value);
                      setErrorMessage(null);
                    }}
                    className="sr-only"
                    required
                  />
                  {option.label}
                </label>
              );
            })}
          </div>
        </section>

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
              Listen werden hochgeladen ...
            </>
          ) : (
            <>
              1. Schritt - Liste hochladen
              <ArrowRight className="h-6 w-6 transition group-hover:translate-x-1" />
            </>
          )}
        </button>

        <div className="flex items-center justify-center gap-2 text-center text-xs font-semibold text-[#52616F]">
          <ShieldCheck className="h-4 w-4 text-[#2F7D50]" />
          Vertraulich. Keine automatische Bestellung durch den Upload.
        </div>
      </div>
    </form>
  );
}