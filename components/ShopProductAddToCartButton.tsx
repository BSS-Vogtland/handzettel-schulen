"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addShopCartItem } from "@/app/shop/_lib/shopCart";

type ShopProductAddToCartButtonProps = {
  productId: string | number | null;
  productName: string | null;
  productSku?: string | null;
  productPrice?: number | string | null;
  productImageUrl?: string | null;
  quantity?: number | string | null;
  category?: string | null;
  format?: string | null;
  color?: string | null;
  lineature?: string | null;
  buttonLabel?: string;
};

function normalizeString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function normalizeNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(",", ".").replace(/[^\d.-]/g, ""));

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function normalizeQuantity(value: unknown) {
  const parsed = normalizeNumber(value, 1);
  return Math.max(1, Math.min(99, Math.floor(parsed)));
}

export default function ShopProductAddToCartButton({
  productId,
  productName,
  productSku = null,
  productPrice = 0,
  productImageUrl = null,
  quantity = 1,
  category = null,
  format = null,
  color = null,
  lineature = null,
  buttonLabel = "In den Warenkorb",
}: ShopProductAddToCartButtonProps) {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);

  const safeProductId = normalizeString(productId);
  const safeProductName = normalizeString(productName) || "Schulmaterial";
  const safeProductPrice = Math.max(0, normalizeNumber(productPrice, 0));
  const canAdd = Boolean(safeProductId) && safeProductPrice > 0;

  function handleAddToCart() {
    if (!safeProductId || !canAdd || isAdding) {
      return;
    }

    setIsAdding(true);

    addShopCartItem({
      productId: safeProductId,
      name: safeProductName,
      sku: normalizeString(productSku),
      price: safeProductPrice,
      imageUrl: normalizeString(productImageUrl),
      quantity: normalizeQuantity(quantity),
      category: normalizeString(category),
      format: normalizeString(format),
      color: normalizeString(color),
      lineature: normalizeString(lineature),
      sourceType: "shop",
      sourceRequestId: null,
      sourceOfferItemId: null,
      sourceRequestItemId: null,
    });

    router.push("/shop/warenkorb");
  }

  return (
    <button
      type="button"
      onClick={handleAddToCart}
      disabled={!canAdd || isAdding}
      className="inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#172033] px-5 py-4 text-sm font-black text-white shadow-sm transition hover:bg-[#9b2f23] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isAdding ? "Wird hinzugefügt ..." : buttonLabel}
    </button>
  );
}
