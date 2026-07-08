"use client";

import { useState } from "react";
import CustomerOfferItemNoteForm from "@/components/CustomerOfferItemNoteForm";

type CustomerOptionalOfferItemNoteFormProps = {
  token: string;
  itemId: string;
  productName: string;
  initialNote?: string;
  disabled?: boolean;
};

export default function CustomerOptionalOfferItemNoteForm({
  token,
  itemId,
  productName,
  initialNote = "",
  disabled = false,
}: CustomerOptionalOfferItemNoteFormProps) {
  const [isOpen, setIsOpen] = useState(Boolean(initialNote));

  if (disabled && !initialNote) {
    return null;
  }

  return (
    <div className="mt-3 rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-3">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 text-left text-sm font-black text-[#102A43]"
      >
        <span>
          {initialNote ? "Hinweis anzeigen / ändern" : "Optionalen Hinweis hinzufügen"}
        </span>
        <span className="text-xs font-black text-[#A75B28]">
          {isOpen ? "Ausblenden" : "Einblenden"}
        </span>
      </button>

      {isOpen ? (
        <div className="mt-3">
          <CustomerOfferItemNoteForm
            token={token}
            itemId={itemId}
            productName={productName}
            initialNote={initialNote}
            disabled={disabled}
          />
        </div>
      ) : null}
    </div>
  );
}
