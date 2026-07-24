"use client";

import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  BOOK_COVER_NAME,
  BOOK_COVER_UNIT_PRICE,
  normalizeBookCommerceQuantity,
  roundBookCommerceMoney,
  toBookCommerceNumber,
} from "@/lib/bookCommerce";

type CustomerBookCoverOptionProps = {
  token: string;
  itemId: string;
  productName: string;
  quantity?: number | string | null;
  initialSelected?: boolean | null;
  initialUnitPrice?: number | string | null;
  disabled?: boolean;
};

type BookCoverResponse = {
  ok?: boolean;
  message?: string;
  bookCover?: {
    selected?: boolean;
    name?: string;
    quantity?: number;
    unitPrice?: number;
    totalPrice?: number;
  };
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(roundBookCommerceMoney(value));
}

export default function CustomerBookCoverOption({
  token,
  itemId,
  productName,
  quantity,
  initialSelected = false,
  initialUnitPrice,
  disabled = false,
}: CustomerBookCoverOptionProps) {
  const router = useRouter();

  const normalizedQuantity = useMemo(
    () => normalizeBookCommerceQuantity(quantity),
    [quantity],
  );

  const initialNormalizedUnitPrice = useMemo(() => {
    const storedPrice = toBookCommerceNumber(
      initialUnitPrice,
      BOOK_COVER_UNIT_PRICE,
    );

    return storedPrice > 0
      ? roundBookCommerceMoney(storedPrice)
      : BOOK_COVER_UNIT_PRICE;
  }, [initialUnitPrice]);

  const [isSelected, setIsSelected] = useState(
    initialSelected === true,
  );

  const [unitPrice, setUnitPrice] = useState(
    initialNormalizedUnitPrice,
  );

  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] =
    useState<string | null>(null);
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const totalPrice = useMemo(
    () =>
      isSelected
        ? roundBookCommerceMoney(
            normalizedQuantity * unitPrice,
          )
        : 0,
    [isSelected, normalizedQuantity, unitPrice],
  );

  async function updateSelection(nextSelected: boolean) {
    if (disabled || isSaving) {
      return;
    }

    setIsSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/offer/${encodeURIComponent(
          token,
        )}/items/${encodeURIComponent(
          itemId,
        )}/book-cover`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            selected: nextSelected,
          }),
        },
      );

      const rawText = await response.text();

      let payload: BookCoverResponse | null = null;

      try {
        payload = rawText
          ? (JSON.parse(rawText) as BookCoverResponse)
          : null;
      } catch {
        throw new Error(
          "Die Buchhüllen-Auswahl hat keine gültige Antwort geliefert.",
        );
      }

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message ||
            "Die Buchhüllen-Auswahl konnte nicht gespeichert werden.",
        );
      }

      const savedSelected =
        payload.bookCover?.selected === true;

      const savedUnitPrice = toBookCommerceNumber(
        payload.bookCover?.unitPrice,
        BOOK_COVER_UNIT_PRICE,
      );

      setIsSelected(savedSelected);
      setUnitPrice(
        savedUnitPrice > 0
          ? roundBookCommerceMoney(savedUnitPrice)
          : BOOK_COVER_UNIT_PRICE,
      );

      setSuccessMessage(
        payload.message ||
          (savedSelected
            ? `${BOOK_COVER_NAME} wurde hinzugefügt.`
            : `${BOOK_COVER_NAME} wurde entfernt.`),
      );

      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Die Buchhüllen-Auswahl konnte nicht gespeichert werden.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section
      className={
        isSelected
          ? "mt-4 rounded-[24px] border border-[#BFE3CD] bg-[#F0FFF6] p-4"
          : "mt-4 rounded-[24px] border border-[#D6E7EF] bg-[#F5FAFD] p-4"
      }
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={
              isSelected
                ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#2F7D50]"
                : "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#12395F]"
            }
          >
            <BookOpen className="h-5 w-5" />
          </div>

          <div className="min-w-0">
            <p
              className={
                isSelected
                  ? "text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]"
                  : "text-xs font-black uppercase tracking-[0.16em] text-[#12395F]"
              }
            >
              Optional
            </p>

            <h4 className="mt-1 text-base font-black text-[#102A43]">
              {BOOK_COVER_NAME}
            </h4>

            <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
              Wir legen für jedes ausgewählte Buchexemplar eine
              passende Schutzhülle bei.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#52616F]">
                {formatMoney(unitPrice)} je Exemplar
              </span>

              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#52616F]">
                {normalizedQuantity} Buch
                {normalizedQuantity === 1 ? "" : "exemplare"}
              </span>

              {isSelected ? (
                <span className="rounded-full bg-[#2F7D50] px-3 py-1 text-xs font-black text-white">
                  Gesamt {formatMoney(totalPrice)}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            void updateSelection(!isSelected);
          }}
          disabled={disabled || isSaving}
          aria-pressed={isSelected}
          className={
            isSelected
              ? "inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl border border-[#BFE3CD] bg-white px-4 py-3 text-sm font-black text-[#2F7D50] transition hover:bg-[#F7FFFA] disabled:cursor-not-allowed disabled:opacity-60"
              : "inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-4 py-3 text-sm font-black text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          }
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Wird gespeichert …
            </>
          ) : isSelected ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Ausgewählt
            </>
          ) : (
            <>
              <Check className="h-4 w-4" />
              Buchhülle hinzufügen
            </>
          )}
        </button>
      </div>

      {isSelected ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#BFE3CD] bg-white px-4 py-3 text-sm font-semibold leading-6 text-[#2F7D50]">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />

          <p>
            Für „{productName}“ werden{" "}
            <span className="font-black">
              {normalizedQuantity} passende Buchhülle
              {normalizedQuantity === 1 ? "" : "n"}
            </span>{" "}
            vorgemerkt.
          </p>
        </div>
      ) : (
        <p className="mt-4 text-xs font-semibold leading-5 text-[#52616F]">
          Die Buchhülle ist nicht vorausgewählt und wird nur berechnet,
          wenn Du sie ausdrücklich hinzufügst.
        </p>
      )}

      {successMessage ? (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-[#BFE3CD] bg-white px-4 py-3 text-sm font-bold text-[#2F7D50]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-[#F0C7C7] bg-[#FFF5F5] px-4 py-3 text-sm font-bold leading-6 text-[#B5282D]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      ) : null}
    </section>
  );
}