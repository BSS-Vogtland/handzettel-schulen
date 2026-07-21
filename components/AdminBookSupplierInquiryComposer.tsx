"use client";

import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Loader2,
  Mail,
  PackagePlus,
  Save,
  Search,
  Send,
  Settings,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type BookData = {
  requestedIsbn: string;
  isbn10: string | null;
  isbn13: string | null;
  title: string | null;
  subtitle: string | null;
  authors: string[];
  publisher: string | null;
  publishedDate: string | null;
  coverUrl: string | null;
};

type SearchResponse = {
  ok?: boolean;
  message?: string;
  book?: BookData;
};

type SupplierPartner = {
  id: string;
  name: string;
  email: string | null;
  contact_person: string | null;
  phone: string | null;
};

type DraftItem = {
  isbn: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  publisher: string | null;
  publishedDate: string | null;
  coverUrl: string | null;
  quantity: number;
};

type CreateInquiryResponse = {
  ok?: boolean;
  sent?: boolean;
  warning?: string | null;
  message?: string;
  inquiry?: {
    id: string;
    inquiryNumber: string;
  };
};

const STORAGE_KEY = "handzettel-book-supplier-inquiry-draft-v1";

function normalizeIsbn(value: string) {
  return value
    .toUpperCase()
    .replace(/[^0-9X]/g, "")
    .slice(0, 13);
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export default function AdminBookSupplierInquiryComposer() {
  const [partnerName, setPartnerName] = useState("Vogtländische Buchhandlung");
  const [partnerEmail, setPartnerEmail] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [partnerPhone, setPartnerPhone] = useState("");

  const [isbn, setIsbn] = useState("");
  const [foundBook, setFoundBook] = useState<BookData | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [adminNote, setAdminNote] = useState("");

  const [isLoadingPartner, setIsLoadingPartner] = useState(true);
  const [isSavingPartner, setIsSavingPartner] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createdInquiry, setCreatedInquiry] = useState<{
    id: string;
    inquiryNumber: string;
    sent: boolean;
  } | null>(null);

  const totalQuantity = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items],
  );

  useEffect(() => {
    try {
      const rawDraft = window.localStorage.getItem(STORAGE_KEY);

      if (rawDraft) {
        const parsed = JSON.parse(rawDraft) as {
          items?: DraftItem[];
          adminNote?: string;
        };

        if (Array.isArray(parsed.items)) {
          setItems(parsed.items);
        }

        if (typeof parsed.adminNote === "string") {
          setAdminNote(parsed.adminNote);
        }
      }
    } catch {
      // Ein defekter lokaler Entwurf blockiert die Oberfläche nicht.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          items,
          adminNote,
        }),
      );
    } catch {
      // LocalStorage ist nur Komfort, nicht Teil des Kernworkflows.
    }
  }, [items, adminNote]);

  useEffect(() => {
    async function loadPartner() {
      setIsLoadingPartner(true);

      try {
        const response = await fetch("/api/admin/book-supplier/partner", {
          method: "GET",
          cache: "no-store",
        });

        const payload = (await response.json()) as {
          ok?: boolean;
          message?: string;
          partner?: SupplierPartner;
        };

        if (!response.ok || !payload.ok || !payload.partner) {
          throw new Error(
            payload.message || "Die Partnerdaten konnten nicht geladen werden.",
          );
        }

        setPartnerName(payload.partner.name || "");
        setPartnerEmail(payload.partner.email || "");
        setContactPerson(payload.partner.contact_person || "");
        setPartnerPhone(payload.partner.phone || "");
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Die Partnerdaten konnten nicht geladen werden.",
        );
      } finally {
        setIsLoadingPartner(false);
      }
    }

    void loadPartner();
  }, []);

  async function savePartner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSavingPartner) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSavingPartner(true);

    try {
      const response = await fetch("/api/admin/book-supplier/partner", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: partnerName,
          email: partnerEmail,
          contactPerson,
          phone: partnerPhone,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
        partner?: SupplierPartner;
      };

      if (!response.ok || !payload.ok || !payload.partner) {
        throw new Error(
          payload.message ||
            "Die Partnerdaten konnten nicht gespeichert werden.",
        );
      }

      setSuccessMessage("Die Partnerdaten wurden gespeichert.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Die Partnerdaten konnten nicht gespeichert werden.",
      );
    } finally {
      setIsSavingPartner(false);
    }
  }

  async function searchBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSearching) return;

    const normalized = normalizeIsbn(isbn);

    setErrorMessage(null);
    setSuccessMessage(null);
    setCreatedInquiry(null);
    setFoundBook(null);

    if (normalized.length !== 10 && normalized.length !== 13) {
      setErrorMessage("Bitte gib eine vollständige ISBN-10 oder ISBN-13 ein.");
      return;
    }

    setIsSearching(true);

    try {
      const response = await fetch(
        `/api/admin/products/isbn-search?isbn=${encodeURIComponent(
          normalized,
        )}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      const payload = (await response.json()) as SearchResponse;

      if (!response.ok || !payload.ok || !payload.book) {
        throw new Error(
          payload.message || "Zu dieser ISBN wurde kein Buch gefunden.",
        );
      }

      setIsbn(normalized);
      setFoundBook(payload.book);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Die ISBN-Suche konnte nicht ausgeführt werden.",
      );
    } finally {
      setIsSearching(false);
    }
  }

  function addFoundBook() {
    if (!foundBook) return;

    const normalizedIsbn = normalizeIsbn(
      foundBook.isbn13 || foundBook.requestedIsbn,
    );

    if (!normalizedIsbn || !clean(foundBook.title)) {
      setErrorMessage(
        "Das gefundene Buch enthält keine vollständige ISBN oder keinen Titel.",
      );
      return;
    }

    setItems((current) => {
      const existingIndex = current.findIndex(
        (item) => item.isbn === normalizedIsbn,
      );

      if (existingIndex >= 0) {
        return current.map((item, index) =>
          index === existingIndex
            ? {
                ...item,
                quantity: item.quantity + 1,
              }
            : item,
        );
      }

      return [
        ...current,
        {
          isbn: normalizedIsbn,
          title: clean(foundBook.title),
          subtitle: clean(foundBook.subtitle) || null,
          authors: Array.isArray(foundBook.authors)
            ? foundBook.authors.map(clean).filter(Boolean)
            : [],
          publisher: clean(foundBook.publisher) || null,
          publishedDate: clean(foundBook.publishedDate) || null,
          coverUrl: clean(foundBook.coverUrl) || null,
          quantity: 1,
        },
      ];
    });

    setSuccessMessage(
      `„${clean(foundBook.title)}“ wurde zur Sammelanfrage hinzugefügt.`,
    );
    setFoundBook(null);
    setIsbn("");
  }

  function updateQuantity(isbnValue: string, quantity: number) {
    const safeQuantity = Math.max(1, Math.min(999, Math.trunc(quantity || 1)));

    setItems((current) =>
      current.map((item) =>
        item.isbn === isbnValue
          ? {
              ...item,
              quantity: safeQuantity,
            }
          : item,
      ),
    );
  }

  function removeItem(isbnValue: string) {
    setItems((current) => current.filter((item) => item.isbn !== isbnValue));
  }

  function clearDraft() {
    setItems([]);
    setAdminNote("");
    setFoundBook(null);
    setCreatedInquiry(null);
    setErrorMessage(null);
    setSuccessMessage("Der lokale Entwurf wurde geleert.");
  }

  async function createInquiry(sendNow: boolean) {
    if (isCreating) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setCreatedInquiry(null);

    if (items.length === 0) {
      setErrorMessage(
        "Füge zuerst mindestens ein Buch zur Sammelanfrage hinzu.",
      );
      return;
    }

    if (sendNow && !partnerEmail.trim()) {
      setErrorMessage(
        "Hinterlege zuerst die E-Mail-Adresse der Vogtländischen Buchhandlung.",
      );
      return;
    }

    setIsCreating(true);

    try {
      const response = await fetch("/api/admin/book-supplier/inquiries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          adminNote,
          sendNow,
          items,
        }),
      });

      const payload = (await response.json()) as CreateInquiryResponse;

      if (!response.ok || !payload.ok || !payload.inquiry) {
        throw new Error(
          payload.message || "Die Sammelanfrage konnte nicht erstellt werden.",
        );
      }

      setCreatedInquiry({
        id: payload.inquiry.id,
        inquiryNumber: payload.inquiry.inquiryNumber,
        sent: Boolean(payload.sent),
      });

      setItems([]);
      setAdminNote("");
      setFoundBook(null);
      setIsbn("");

      setSuccessMessage(
        payload.warning ||
          (payload.sent
            ? `Die Anfrage ${payload.inquiry.inquiryNumber} wurde erstellt und versendet.`
            : `Die Anfrage ${payload.inquiry.inquiryNumber} wurde als Entwurf gespeichert.`),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Die Sammelanfrage konnte nicht erstellt werden.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section className="rounded-[32px] border border-[#C8D8E8] bg-[#EEF4FA] p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#12395F]">
            <Mail className="h-3.5 w-3.5" />
            Vogtländische Buchhandlung
          </div>

          <h2 className="mt-3 text-2xl font-black text-[#102A43]">
            Sammelanfrage zur Verfügbarkeit
          </h2>

          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
            Suche mehrere ISBNs, sammle die Bücher und sende anschließend eine
            strukturierte Verfügbarkeitsanfrage an die Buchhandlung.
          </p>
        </div>

        <Link
          href="/admin/buchhandlung/anfragen"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#12395F] shadow-sm ring-1 ring-[#C8D8E8] transition hover:bg-[#F5FAFD]"
        >
          <BookOpen className="h-4 w-4" />
          Anfragen öffnen
        </Link>
      </div>

      {errorMessage ? (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#F0B7BA] bg-[#FFF1F1] p-4 text-[#9F1D24]">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm font-bold leading-6">{errorMessage}</p>
        </div>
      ) : null}

      {successMessage ? (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] p-4 text-[#2F7D50]">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-bold leading-6">{successMessage}</p>

            {createdInquiry ? (
              <Link
                href={`/admin/buchhandlung/anfragen/${createdInquiry.id}`}
                className="mt-2 inline-flex font-black underline"
              >
                {createdInquiry.inquiryNumber} öffnen
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      <details className="mt-5 rounded-[26px] border border-[#C8D8E8] bg-white p-4">
        <summary className="flex cursor-pointer items-center gap-2 font-black text-[#102A43]">
          <Settings className="h-4 w-4" />
          Partnerdaten und E-Mail-Adresse
        </summary>

        <form onSubmit={savePartner} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-black">Buchhandlung*</span>
            <input
              value={partnerName}
              onChange={(event) => setPartnerName(event.target.value)}
              disabled={isLoadingPartner}
              className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 font-semibold outline-none focus:border-[#B5282D]"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-black">
              E-Mail-Adresse*
            </span>
            <input
              type="email"
              value={partnerEmail}
              onChange={(event) => setPartnerEmail(event.target.value)}
              disabled={isLoadingPartner}
              placeholder="bestellung@buchhandlung.de"
              className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 font-semibold outline-none focus:border-[#B5282D]"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-black">
              Ansprechpartner
            </span>
            <input
              value={contactPerson}
              onChange={(event) => setContactPerson(event.target.value)}
              disabled={isLoadingPartner}
              className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 font-semibold outline-none focus:border-[#B5282D]"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-black">Telefon</span>
            <input
              value={partnerPhone}
              onChange={(event) => setPartnerPhone(event.target.value)}
              disabled={isLoadingPartner}
              className="min-h-12 w-full rounded-2xl border border-[#D8C8B8] bg-white px-4 font-semibold outline-none focus:border-[#B5282D]"
            />
          </label>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={isSavingPartner || isLoadingPartner}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#102A43] px-4 py-3 text-sm font-black text-white disabled:opacity-60"
            >
              {isSavingPartner ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Partnerdaten speichern
            </button>
          </div>
        </form>
      </details>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-[26px] border border-[#C8D8E8] bg-white p-4 sm:p-5">
          <h3 className="text-lg font-black text-[#102A43]">ISBN suchen</h3>

          <form
            onSubmit={searchBook}
            className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]"
          >
            <input
              value={isbn}
              onChange={(event) => setIsbn(normalizeIsbn(event.target.value))}
              placeholder="ISBN-10 oder ISBN-13"
              autoComplete="off"
              className="min-h-13 rounded-2xl border border-[#D8C8B8] bg-white px-4 text-lg font-black tracking-[0.06em] outline-none focus:border-[#B5282D]"
            />

            <button
              type="submit"
              disabled={isSearching}
              className="inline-flex min-h-13 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 font-black text-white disabled:opacity-60"
            >
              {isSearching ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Search className="h-5 w-5" />
              )}
              Suchen
            </button>
          </form>

          {foundBook ? (
            <article className="mt-4 rounded-[24px] border border-[#E8DED2] bg-[#FBF7F0] p-4">
              <div className="flex gap-4">
                <div className="h-28 w-20 shrink-0 overflow-hidden rounded-xl border border-[#E8DED2] bg-white">
                  {foundBook.coverUrl ? (
                    <img
                      src={foundBook.coverUrl}
                      alt={foundBook.title || "Buchcover"}
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[#A75B28]">
                      <BookOpen className="h-6 w-6" />
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <p className="font-black text-[#102A43]">
                    {foundBook.title || "Buchtitel nicht angegeben"}
                  </p>

                  {foundBook.subtitle ? (
                    <p className="mt-1 text-sm font-semibold text-[#52616F]">
                      {foundBook.subtitle}
                    </p>
                  ) : null}

                  <p className="mt-2 text-xs font-bold uppercase tracking-[0.08em] text-[#A75B28]">
                    ISBN {foundBook.isbn13 || foundBook.requestedIsbn}
                  </p>

                  {foundBook.publisher ? (
                    <p className="mt-1 text-sm font-semibold text-[#52616F]">
                      {foundBook.publisher}
                    </p>
                  ) : null}
                </div>
              </div>

              <button
                type="button"
                onClick={addFoundBook}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[#102A43] px-4 py-3 text-sm font-black text-white"
              >
                <PackagePlus className="h-4 w-4" />
                Zur Sammelanfrage hinzufügen
              </button>
            </article>
          ) : null}
        </div>

        <div className="rounded-[26px] border border-[#C8D8E8] bg-white p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-black text-[#102A43]">
                Aktuelle Sammelanfrage
              </h3>
              <p className="mt-1 text-sm font-semibold text-[#52616F]">
                {items.length} ISBN · {totalQuantity} Exemplar(e)
              </p>
            </div>

            {items.length > 0 ? (
              <button
                type="button"
                onClick={clearDraft}
                className="inline-flex items-center gap-2 text-xs font-black text-[#B5282D]"
              >
                <Trash2 className="h-4 w-4" />
                Leeren
              </button>
            ) : null}
          </div>

          {items.length > 0 ? (
            <div className="mt-4 space-y-3">
              {items.map((item) => (
                <article
                  key={item.isbn}
                  className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-20 w-14 shrink-0 overflow-hidden rounded-lg border border-[#E8DED2] bg-white">
                      {item.coverUrl ? (
                        <img
                          src={item.coverUrl}
                          alt={item.title}
                          className="h-full w-full object-contain p-1"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[#A75B28]">
                          <BookOpen className="h-4 w-4" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="font-black text-[#102A43]">{item.title}</p>
                      <p className="mt-1 text-xs font-bold text-[#52616F]">
                        ISBN {item.isbn}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-sm font-black">
                          Menge
                          <input
                            type="number"
                            min={1}
                            max={999}
                            value={item.quantity}
                            onChange={(event) =>
                              updateQuantity(
                                item.isbn,
                                Number(event.target.value),
                              )
                            }
                            className="h-10 w-20 rounded-xl border border-[#D8C8B8] bg-white px-3 text-center font-black"
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() => removeItem(item.isbn)}
                          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#F0B7BA] bg-white px-3 text-xs font-black text-[#B5282D]"
                        >
                          <Trash2 className="h-4 w-4" />
                          Entfernen
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}

              <label className="block">
                <span className="mb-2 block text-sm font-black text-[#102A43]">
                  Hinweis an die Buchhandlung
                </span>
                <textarea
                  value={adminNote}
                  onChange={(event) => setAdminNote(event.target.value)}
                  rows={4}
                  placeholder="Optionaler Hinweis zur Sammelanfrage"
                  className="w-full rounded-2xl border border-[#D8C8B8] bg-white p-4 font-semibold outline-none focus:border-[#B5282D]"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void createInquiry(false)}
                  disabled={isCreating}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#C8D8E8] bg-white px-4 py-3 text-sm font-black text-[#12395F] disabled:opacity-60"
                >
                  {isCreating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Als Entwurf speichern
                </button>

                <button
                  type="button"
                  onClick={() => void createInquiry(true)}
                  disabled={isCreating}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-4 py-3 text-sm font-black text-white disabled:opacity-60"
                >
                  {isCreating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Speichern und senden
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-[#C8D8E8] bg-[#F5FAFD] p-6 text-center">
              <BookOpen className="mx-auto h-7 w-7 text-[#12395F]" />
              <p className="mt-2 font-black text-[#102A43]">
                Noch keine Bücher gesammelt
              </p>
              <p className="mt-1 text-sm font-semibold text-[#52616F]">
                Suche links eine ISBN und füge das Buch hinzu.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
