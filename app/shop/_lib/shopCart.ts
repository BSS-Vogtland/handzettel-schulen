export type ShopCartItem = {
  productId: string;
  name: string;
  sku: string | null;
  price: number;
  imageUrl: string | null;
  quantity: number;
  category: string | null;
  format: string | null;
  color: string | null;
  lineature: string | null;
  sourceType?: "shop" | "reorder_from_school_list";
  sourceRequestId?: string | null;
  sourceOfferItemId?: string | null;
  sourceRequestItemId?: string | null;
};

export const SHOP_CART_KEY = "handzettel_schulen_shop_cart_v1";

export function readShopCart(): ShopCartItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(SHOP_CART_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => normalizeCartItem(item))
      .filter((item): item is ShopCartItem => Boolean(item));
  } catch {
    return [];
  }
}

export function writeShopCart(items: ShopCartItem[]) {
  if (typeof window === "undefined") {
    return;
  }

  const cleanedItems = items
    .map((item) => normalizeCartItem(item))
    .filter((item): item is ShopCartItem => Boolean(item));

  window.localStorage.setItem(SHOP_CART_KEY, JSON.stringify(cleanedItems));
  window.dispatchEvent(new Event("shop-cart-updated"));
}

export function clearShopCart() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(SHOP_CART_KEY);
  window.dispatchEvent(new Event("shop-cart-updated"));
}

export function getShopCartCount(items: ShopCartItem[]): number {
  return items.reduce((sum, item) => {
    return sum + item.quantity;
  }, 0);
}

export function getShopCartSubtotal(items: ShopCartItem[]): number {
  return items.reduce((sum, item) => {
    return sum + item.price * item.quantity;
  }, 0);
}

export function formatShopPrice(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export function addShopCartItem(item: ShopCartItem): ShopCartItem[] {
  const currentCart = readShopCart();
  const normalizedItem = normalizeCartItem(item);

  if (!normalizedItem) {
    return currentCart;
  }

  const existingItem = currentCart.find((cartItem) => {
    return cartItem.productId === normalizedItem.productId;
  });

  let nextCart: ShopCartItem[];

  if (existingItem) {
    nextCart = currentCart.map((cartItem) => {
      if (cartItem.productId !== normalizedItem.productId) {
        return cartItem;
      }

      return {
        ...cartItem,
        quantity: cartItem.quantity + normalizedItem.quantity,
      };
    });
  } else {
    nextCart = [...currentCart, normalizedItem];
  }

  writeShopCart(nextCart);

  return nextCart;
}

export function updateShopCartItemQuantity(
  productId: string,
  quantity: number,
): ShopCartItem[] {
  const currentCart = readShopCart();

  if (!productId) {
    return currentCart;
  }

  const safeQuantity = Math.max(0, Math.min(99, Math.floor(quantity)));

  const nextCart =
    safeQuantity <= 0
      ? currentCart.filter((item) => item.productId !== productId)
      : currentCart.map((item) => {
          if (item.productId !== productId) {
            return item;
          }

          return {
            ...item,
            quantity: safeQuantity,
          };
        });

  writeShopCart(nextCart);

  return nextCart;
}

export function removeShopCartItem(productId: string): ShopCartItem[] {
  const currentCart = readShopCart();

  if (!productId) {
    return currentCart;
  }

  const nextCart = currentCart.filter((item) => item.productId !== productId);

  writeShopCart(nextCart);

  return nextCart;
}

function normalizeCartItem(rawItem: unknown): ShopCartItem | null {
  if (!rawItem || typeof rawItem !== "object") {
    return null;
  }

  const item = rawItem as Partial<ShopCartItem>;

  const productId =
    typeof item.productId === "string" && item.productId.trim().length > 0
      ? item.productId.trim()
      : null;

  const name =
    typeof item.name === "string" && item.name.trim().length > 0
      ? item.name.trim()
      : "Unbenanntes Produkt";

  if (!productId) {
    return null;
  }

  const price =
    typeof item.price === "number" && Number.isFinite(item.price)
      ? Math.max(0, item.price)
      : 0;

  const quantity =
    typeof item.quantity === "number" && Number.isFinite(item.quantity)
      ? Math.max(1, Math.min(99, Math.floor(item.quantity)))
      : 1;

  return {
    productId,
    name,
    sku: normalizeNullableString(item.sku),
    price,
    imageUrl: normalizeNullableString(item.imageUrl),
    quantity,
    category: normalizeNullableString(item.category),
    format: normalizeNullableString(item.format),
    color: normalizeNullableString(item.color),
    lineature: normalizeNullableString(item.lineature),
    sourceType:
      item.sourceType === "reorder_from_school_list"
        ? "reorder_from_school_list"
        : "shop",
    sourceRequestId: normalizeNullableString(item.sourceRequestId),
    sourceOfferItemId: normalizeNullableString(item.sourceOfferItemId),
    sourceRequestItemId: normalizeNullableString(item.sourceRequestItemId),
  };
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length > 0 ? trimmedValue : null;
}