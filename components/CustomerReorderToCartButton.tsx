"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  addShopCartItem,
  getShopCartCount,
} from "@/app/shop/_lib/shopCart";

type CustomerReorderToCartButtonProps = {
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
  sourceRequestId?: string | null;
  sourceOfferItemId?: string | number | null;
  sourceRequestItemId?: string | number | null;
  buttonLabel?: string;
  redirectToCart?: boolean;
};

function normalizeString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmedValue = value.trim();
    return trimmedValue.length > 0 ? trimmedValue : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function normalizeNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalizedValue = value.replace(",", ".").replace(/[^\d.-]/g, "");
    const parsedValue = Number(normalizedValue);

    if (Number.isFinite(parsedValue)) {
      return parsedValue;
    }
  }

  return fallback;
}

function normalizeQuantity(value: unknown): number {
  const parsedQuantity = normalizeNumber(value, 1);

  return Math.max(1, Math.min(99, Math.floor(parsedQuantity)));
}

export default function CustomerReorderToCartButton({
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
  sourceRequestId = null,
  sourceOfferItemId = null,
  sourceRequestItemId = null,
  buttonLabel = "Artikel nachkaufen",
  redirectToCart = false,
}: CustomerReorderToCartButtonProps) {
  const router = useRouter();
  const [isAdded, setIsAdded] = useState(false);
  const [cartCount, setCartCount] = useState<number | null>(null);

  const safeProductId = normalizeString(productId);
  const safeProductName = normalizeString(productName) || "Schulmaterial";
  const safeProductSku = normalizeString(productSku);
  const safeProductPrice = Math.max(0, normalizeNumber(productPrice, 0));
  const safeQuantity = normalizeQuantity(quantity);

  const canAddToCart = Boolean(safeProductId);

  function handleAddToCart() {
    if (!safeProductId) {
      return;
    }

    const nextCart = addShopCartItem({
      productId: safeProductId,
      name: safeProductName,
      sku: safeProductSku,
      price: safeProductPrice,
      imageUrl: normalizeString(productImageUrl),
      quantity: safeQuantity,
      category: normalizeString(category),
      format: normalizeString(format),
      color: normalizeString(color),
      lineature: normalizeString(lineature),
      sourceType: "reorder_from_school_list",
      sourceRequestId: normalizeString(sourceRequestId),
      sourceOfferItemId: normalizeString(sourceOfferItemId),
      sourceRequestItemId: normalizeString(sourceRequestItemId),
    });

    setCartCount(getShopCartCount(nextCart));
    setIsAdded(true);

    window.setTimeout(() => {
      setIsAdded(false);
    }, 2600);

    if (redirectToCart) {
      router.push("/shop/warenkorb");
    }
  }

  if (!canAddToCart) {
    return null;
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleAddToCart}
        className="inline-flex w-full items-center justify-center rounded-2xl bg-[#172033] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#9b2f23] sm:w-auto"
      >
        {isAdded ? "In den Warenkorb gelegt" : buttonLabel}
      </button>

      {isAdded ? (
        <p className="mt-2 text-sm font-bold text-[#246b3a]">
          Der Artikel wurde zum Shop-Warenkorb hinzugefügt
          {cartCount !== null ? ` · ${cartCount} Artikel im Warenkorb` : ""}.
        </p>
      ) : null}
    </div>
  );
}