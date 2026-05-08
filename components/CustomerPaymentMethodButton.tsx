"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banknote, CheckCircle2, CreditCard, Loader2 } from "lucide-react";

type PaymentMethod = "paypal" | "bank_transfer" | "cash_on_pickup";

type CustomerPaymentMethodButtonProps = {
  invoiceToken: string;
  paymentMethod: PaymentMethod;
  label: string;
  description: string;
  disabled?: boolean;
  recommended?: boolean;
};

type ApiResponse = {
  ok?: boolean;
  message?: string;
  paymentStatus?: string | null;
  selectedPaymentMethod?: string | null;
  approvalUrl?: string;
};

async function readApiResponse(response: Response): Promise<ApiResponse> {
  const rawText = await response.text();

  try {
    return rawText ? (JSON.parse(rawText) as ApiResponse) : {};
  } catch {
    return {
      ok: false,
      message:
        "Die Zahlungsroute hat keine JSON-Antwort geliefert. Bitte versuche es später erneut.",
    };
  }
}

function getIcon(paymentMethod: PaymentMethod) {
  if (paymentMethod === "paypal") return CreditCard;
  return Banknote;
}

export default function CustomerPaymentMethodButton({
  invoiceToken,
  paymentMethod,
  label,
  description,
  disabled,
  recommended,
}: CustomerPaymentMethodButtonProps) {
  const router = useRouter();

  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const Icon = getIcon(paymentMethod);

  async function handleClick() {
    if (isSaving || disabled) return;

    try {
      setIsSaving(true);
      setFeedback(null);
      setIsSuccess(false);

      if (paymentMethod === "paypal") {
        const response = await fetch(
          `/api/invoice/${invoiceToken}/paypal/create-order`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        const payload = await readApiResponse(response);

        if (!response.ok || !payload.ok || !payload.approvalUrl) {
          throw new Error(
            payload.message || "PayPal-Zahlung konnte nicht gestartet werden."
          );
        }

        setIsSuccess(true);
        setFeedback("Du wirst jetzt zu PayPal weitergeleitet ...");
        window.location.href = payload.approvalUrl;
        return;
      }

      const response = await fetch(`/api/invoice/${invoiceToken}/payment-method`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentMethod,
        }),
      });

      const payload = await readApiResponse(response);

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.message || "Die Zahlungsart konnte nicht gespeichert werden."
        );
      }

      setIsSuccess(true);
      setFeedback(payload.message || "Deine Zahlungsart wurde gespeichert.");
      router.refresh();
    } catch (error) {
      setIsSuccess(false);
      setFeedback(
        error instanceof Error
          ? error.message
          : "Die Zahlungsart konnte nicht gespeichert werden."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className={`rounded-[26px] border bg-white p-4 shadow-sm ${
        recommended
          ? "border-[#BFE3CD]"
          : disabled
          ? "border-[#E8DED2] opacity-50"
          : "border-[#E8DED2]"
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
              recommended
                ? "bg-[#F0FFF6] text-[#2F7D50]"
                : "bg-[#FBF7F0] text-[#A75B28]"
            }`}
          >
            <Icon className="h-5 w-5" />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-black text-[#102A43]">{label}</h3>

              {recommended ? (
                <span className="rounded-full bg-[#F0FFF6] px-3 py-1 text-xs font-black text-[#2F7D50]">
                  Empfohlen
                </span>
              ) : null}

              {disabled ? (
                <span className="rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black text-[#52616F]">
                  Nicht verfügbar
                </span>
              ) : null}
            </div>

            <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
              {description}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleClick}
          disabled={disabled || isSaving}
          className={`inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-black shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
            recommended
              ? "bg-[#B5282D] text-white hover:brightness-110"
              : "bg-[#12395F] text-white hover:brightness-110"
          }`}
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isSuccess ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Icon className="h-4 w-4" />
          )}

          {isSaving
            ? paymentMethod === "paypal"
              ? "Weiterleitung ..."
              : "Speichert..."
            : paymentMethod === "paypal"
            ? "Mit PayPal bezahlen"
            : "Auswählen"}
        </button>
      </div>

      {feedback ? (
        <div
          className={`mt-4 rounded-2xl px-4 py-3 text-sm font-bold leading-6 ${
            isSuccess
              ? "border border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]"
              : "border border-[#F1D1A8] bg-[#FFF8EE] text-[#A75B28]"
          }`}
        >
          {feedback}
        </div>
      ) : null}
    </div>
  );
}