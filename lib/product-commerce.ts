export type ProductCommerceRow = Record<string, unknown>;

export type ProductAvailability =
  | "in_stock"
  | "out_of_stock"
  | "preorder"
  | "backorder";

export type ProductAvailabilityPresentation = {
  label: string;
  description: string;
  canOrder: boolean;
  tone: "green" | "amber" | "red";
};

function cleanString(value: unknown) {
  if (typeof value === "string") {
    const cleaned = value.trim();
    return cleaned || null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function getFirstString(
  product: ProductCommerceRow,
  keys: string[],
) {
  for (const key of keys) {
    const value = cleanString(product[key]);

    if (value) {
      return value;
    }
  }

  return null;
}

function getFirstBoolean(
  product: ProductCommerceRow,
  keys: string[],
) {
  for (const key of keys) {
    const value = product[key];

    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      if (value === 1) return true;
      if (value === 0) return false;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();

      if (
        ["true", "1", "yes", "ja", "available", "in_stock"].includes(
          normalized,
        )
      ) {
        return true;
      }

      if (
        [
          "false",
          "0",
          "no",
          "nein",
          "unavailable",
          "out_of_stock",
        ].includes(normalized)
      ) {
        return false;
      }
    }
  }

  return null;
}

function getFirstNumber(
  product: ProductCommerceRow,
  keys: string[],
) {
  for (const key of keys) {
    const value = product[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Number(
        value.replace(",", ".").replace(/[^\d.-]/g, ""),
      );

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function normalizeAvailabilityValue(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[\s-]+/g, "_");
}

export function getProductAvailabilityDate(
  product: ProductCommerceRow,
) {
  const raw = getFirstString(product, [
    "availability_date",
    "available_from",
    "restock_date",
    "release_date",
    "merchant_availability_date",
  ]);

  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);

  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

export function getProductAvailability(
  product: ProductCommerceRow,
): ProductAvailability {
  /*
   * Nur ausdrücklich für den Shop oder Merchant Center gepflegte Felder
   * dürfen die Bestellbarkeit blockieren.
   *
   * Generische Alt-Felder wie `available`, `availability`,
   * `stock_status` oder `stock_quantity` werden bewusst nicht
   * ausgewertet, weil sie im bestehenden Produktkatalog nicht als
   * verbindliche Lagersteuerung eingeführt wurden.
   */
  const explicit = normalizeAvailabilityValue(
    getFirstString(product, [
      "merchant_availability",
      "shop_availability",
    ]),
  );

  if (
    [
      "out_of_stock",
      "outofstock",
      "unavailable",
      "not_available",
      "nicht_verfuegbar",
      "ausverkauft",
      "nicht_lieferbar",
    ].includes(explicit)
  ) {
    return "out_of_stock";
  }

  if (
    [
      "preorder",
      "pre_order",
      "vorbestellung",
      "vorbestellbar",
    ].includes(explicit)
  ) {
    return getProductAvailabilityDate(product)
      ? "preorder"
      : "out_of_stock";
  }

  if (
    [
      "backorder",
      "back_order",
      "nachbestellung",
      "nachbestellbar",
    ].includes(explicit)
  ) {
    return getProductAvailabilityDate(product)
      ? "backorder"
      : "out_of_stock";
  }

  if (
    [
      "in_stock",
      "instock",
      "available",
      "verfuegbar",
      "lagernd",
      "auf_lager",
      "bestellbar",
      "orderable",
    ].includes(explicit)
  ) {
    return "in_stock";
  }

  const availableFlag = getFirstBoolean(product, [
    "merchant_available",
    "shop_available",
  ]);

  if (availableFlag === false) {
    return "out_of_stock";
  }

  if (availableFlag === true) {
    return "in_stock";
  }

  const stockQuantity = getFirstNumber(product, [
    "merchant_stock_quantity",
    "shop_stock_quantity",
  ]);

  if (stockQuantity !== null) {
    return stockQuantity > 0 ? "in_stock" : "out_of_stock";
  }

  /*
   * Bestehender Shop-Fallback:
   *
   * Sichtbare Produkte mit gültigem Preis werden vom bestehenden Shop
   * und Checkout als bestellbar behandelt.
   *
   * Solange keine ausdrücklich gepflegte Shop- oder
   * Merchant-Verfügbarkeit vorhanden ist, bleibt dieses Verhalten
   * erhalten.
   */
  return "in_stock";
}

export function getProductBrand(
  product: ProductCommerceRow,
) {
  return getFirstString(product, [
    "brand",
    "manufacturer",
    "marke",
    "hersteller",
  ]);
}

export function getProductMpn(
  product: ProductCommerceRow,
) {
  return getFirstString(product, [
    "mpn",
    "manufacturer_part_number",
    "manufacturer_number",
    "manufacturer_sku",
    "hersteller_artikelnummer",
    "herstellernummer",
  ]);
}

function hasValidGtinChecksum(digits: string) {
  const checkDigit = Number(digits[digits.length - 1]);
  const body = digits.slice(0, -1);

  if (!Number.isInteger(checkDigit) || !body) {
    return false;
  }

  let sum = 0;
  let weight = 3;

  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * weight;
    weight = weight === 3 ? 1 : 3;
  }

  const expectedCheckDigit = (10 - (sum % 10)) % 10;
  return expectedCheckDigit === checkDigit;
}

export function getProductGtin(
  product: ProductCommerceRow,
) {
  const raw = getFirstString(product, [
    "gtin",
    "ean",
    "barcode",
    "isbn13",
    "isbn_13",
    "isbn",
  ]);

  if (!raw) {
    return null;
  }

  const digits = raw.replace(/\D/g, "");

  if (
    ![8, 12, 13, 14].includes(digits.length) ||
    !hasValidGtinChecksum(digits)
  ) {
    return null;
  }

  return digits;
}

export function productHasUniqueIdentifiers(
  product: ProductCommerceRow,
) {
  const gtin = getProductGtin(product);
  const brand = getProductBrand(product);
  const mpn = getProductMpn(product);

  return Boolean(gtin || (brand && mpn));
}

export function getSchemaAvailability(
  availability: ProductAvailability,
) {
  switch (availability) {
    case "out_of_stock":
      return "https://schema.org/OutOfStock";
    case "preorder":
      return "https://schema.org/PreOrder";
    case "backorder":
      return "https://schema.org/BackOrder";
    default:
      return "https://schema.org/InStock";
  }
}

export function getAvailabilityPresentation(
  availability: ProductAvailability,
): ProductAvailabilityPresentation {
  switch (availability) {
    case "out_of_stock":
      return {
        label: "Derzeit nicht bestellbar",
        description:
          "Dieser Artikel kann aktuell nicht in den Warenkorb gelegt werden.",
        canOrder: false,
        tone: "red",
      };

    case "preorder":
      return {
        label: "Vorbestellbar",
        description:
          "Du kannst den Artikel jetzt bestellen. Die Auslieferung erfolgt ab dem angegebenen Verfügbarkeitstermin.",
        canOrder: true,
        tone: "amber",
      };

    case "backorder":
      return {
        label: "Bestellbar – längere Lieferzeit",
        description:
          "Du kannst den Artikel bestellen. Die Auslieferung erfolgt nach dem angegebenen Nachliefertermin.",
        canOrder: true,
        tone: "amber",
      };

    default:
      return {
        label: "Online bestellbar",
        description:
          "Du kannst diesen Artikel direkt in den Warenkorb legen.",
        canOrder: true,
        tone: "green",
      };
  }
}