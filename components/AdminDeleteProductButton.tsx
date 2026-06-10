"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

type AdminDeleteProductButtonProps = {
  productId: string;
  productName: string;
};

type DeleteProductResponse = {
  ok?: boolean;
  message?: string;
  productName?: string;
};

export default function AdminDeleteProductButton({
  productId,
  productName,
}: AdminDeleteProductButtonProps) {
  const router = useRouter();

  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleDelete() {
    if (isDeleting) return;

    const firstConfirm = window.confirm(
      `Produkt wirklich löschen?\n\n${productName}\n\nDas ist nur möglich, wenn das Produkt noch nicht in Anfragen, Matches oder Paketwünschen verwendet wurde.`
    );

    if (!firstConfirm) return;

    const typed = window.prompt(
      `Zur Sicherheit bitte exakt LÖSCHEN eingeben, um dieses Produkt zu löschen:\n\n${productName}`
    );

    if (typed !== "LÖSCHEN") {
      setMessage("Löschen abgebrochen. Sicherheitsbestätigung war nicht korrekt.");
      return;
    }

    setIsDeleting(true);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/admin/products/${encodeURIComponent(productId)}/delete`,
        {
          method: "DELETE",
        }
      );

      const rawText = await response.text();

      let payload: DeleteProductResponse | null = null;

      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch {
        throw new Error(
          "Die Lösch-Route hat keine JSON-Antwort geliefert. Bitte Terminal/Vercel-Logs prüfen."
        );
      }

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || "Produkt konnte nicht gelöscht werden.");
      }

      window.alert(payload.message || "Produkt wurde gelöscht.");
      router.refresh();
    } catch (error) {
      const errorText =
        error instanceof Error
          ? error.message
          : "Produkt konnte nicht gelöscht werden.";

      setMessage(errorText);
      window.alert(errorText);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        className="inline-flex w-full min-h-11 items-center justify-center gap-2 rounded-2xl border border-[#F0C7C7] bg-[#FFF5F5] px-4 py-3 text-sm font-black text-[#B5282D] transition hover:bg-[#FFECEC] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isDeleting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Wird gelöscht …
          </>
        ) : (
          <>
            <Trash2 className="h-4 w-4" />
            Produkt löschen
          </>
        )}
      </button>

      {message ? (
        <p className="mt-2 rounded-2xl border border-[#F0C7C7] bg-white px-3 py-2 text-xs font-bold leading-5 text-[#B5282D]">
          {message}
        </p>
      ) : null}
    </div>
  );
}