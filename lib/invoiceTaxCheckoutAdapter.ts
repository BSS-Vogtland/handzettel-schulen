/*
 * INVOICE_TAX_CHECKOUT_ADAPTER_V1
 *
 * Gemeinsamer, reiner Adapter zwischen:
 * - Handzettel-Checkout
 * - Shop-Checkout
 * - Admin-Rechnungserstellung
 * - zentralem Steuer-Snapshot-Rechner
 *
 * Keine Datenbankzugriffe.
 * Keine Lexware-Zugriffe.
 * Kein Mailversand.
 */

import {
  buildInvoiceTaxSnapshot,
  type InvoiceBookShippingAllocationScope,
  type InvoiceDiscountAllocationScope,
  type InvoiceTaxMoneyInput,
  type InvoiceTaxSnapshotResult,
  type SupportedInvoiceTaxRate,
} from "@/lib/invoiceTaxSnapshot";

export const INVOICE_TAX_CHECKOUT_ADAPTER_VERSION =
  "invoice-tax-checkout-adapter-v1" as const;

const MAX_MONEY_CENTS =
  10_000_000_000;

export type CheckoutTaxCatalogProduct = {
  id: string;
  taxRate: InvoiceTaxMoneyInput;
  isBook: boolean;
  active?: boolean | null;
};

export type CheckoutTaxLineInput = {
  key: string;

  productId:
    | string
    | null
    | undefined;

  productName: string;

  quantity: InvoiceTaxMoneyInput;

  unitPriceGross:
    InvoiceTaxMoneyInput;

  isBookSnapshot?:
    | boolean
    | null;

  bookCoverSelected?:
    | boolean
    | null;

  bookCoverUnitPriceGross?:
    InvoiceTaxMoneyInput;

  /*
   * Optionaler positionsbezogener Buchhüllen-Steuersatz.
   *
   * Er darf nur gesetzt werden, wenn die Buchhülle ausgewählt ist.
   * Falls zusätzlich ein globaler Buchhüllen-Steuersatz übergeben
   * wird, müssen beide Werte übereinstimmen.
   */
  bookCoverTaxRate?:
    InvoiceTaxMoneyInput;
};

export type CheckoutTaxGrossComponent =
  | "subtotal"
  | "regular_shipping"
  | "book_shipping"
  | "book_covers"
  | "discount"
  | "total";

export type CheckoutTaxExpectedGrossAmounts =
  Partial<
    Record<
      CheckoutTaxGrossComponent,
      InvoiceTaxMoneyInput
    >
  >;

export type BuildCheckoutInvoiceTaxSnapshotInput = {
  currency?: string | null;

  snapshotAt?:
    | string
    | Date
    | null;

  lines:
    CheckoutTaxLineInput[];

  products:
    CheckoutTaxCatalogProduct[];

  regularShippingGrossAmount?:
    InvoiceTaxMoneyInput;

  bookShippingGrossAmount?:
    InvoiceTaxMoneyInput;

  discountGrossAmount?:
    InvoiceTaxMoneyInput;

  /*
   * Kein Buchhüllen-Steuersatz wird automatisch angenommen.
   *
   * Sobald mindestens eine Buchhülle ausgewählt ist, muss entweder
   * hier oder direkt an jeder betroffenen Position ein zulässiger
   * Steuersatz angegeben werden.
   */
  bookCoverTaxRate?:
    InvoiceTaxMoneyInput;

  bookShippingAllocationScope?:
    | InvoiceBookShippingAllocationScope
    | null;

  discountAllocationScope?:
    | InvoiceDiscountAllocationScope
    | null;

  /*
   * Vergleichswerte aus der bisherigen Checkout-Berechnung.
   *
   * Damit kann vor der Checkout-Integration nachgewiesen werden,
   * dass die neue Steuerberechnung dieselben Bruttosummen verwendet.
   */
  expectedGrossAmounts?:
    CheckoutTaxExpectedGrossAmounts;

  /*
   * Wenn true, führt jede Abweichung eines übergebenen
   * Erwartungswertes zu einem Fehler.
   */
  requireExpectedGrossAmountsMatch?:
    boolean;
};

export type CheckoutTaxLineResult = {
  key: string;
  productId: string;
  productName: string;

  quantity: number;

  unitPriceGross: number;
  productGrossAmount: number;

  catalogTaxRate:
    SupportedInvoiceTaxRate;

  catalogIsBook: boolean;

  isBookSnapshot:
    | boolean
    | null;

  bookCoverSelected: boolean;

  bookCoverUnitPriceGross:
    number;

  bookCoverGrossAmount:
    number;

  bookCoverTaxRate:
    | SupportedInvoiceTaxRate
    | null;

  invoiceItemSnapshotPayload:
    InvoiceTaxSnapshotResult["items"][number]["snapshotPayload"];

  calculatedProductTax: {
    gross: number;
    net: number;
    tax: number;
  };

  calculatedBookCoverTax:
    | {
        gross: number;
        net: number;
        tax: number;
      }
    | null;
};

export type CheckoutTaxGrossAmounts = {
  subtotal: number;
  regular_shipping: number;
  book_shipping: number;
  book_covers: number;
  discount: number;
  total: number;
};

export type CheckoutTaxGrossComparison = {
  provided: boolean;

  expected:
    | number
    | null;

  calculated: number;

  difference:
    | number
    | null;

  matches:
    | boolean
    | null;
};

export type CheckoutTaxGrossComparisons =
  Record<
    CheckoutTaxGrossComponent,
    CheckoutTaxGrossComparison
  >;

export type CheckoutInvoiceTaxSnapshotResult = {
  adapterVersion:
    typeof INVOICE_TAX_CHECKOUT_ADAPTER_VERSION;

  snapshotAt: string;

  currency: "EUR";

  lines:
    CheckoutTaxLineResult[];

  grossAmounts:
    CheckoutTaxGrossAmounts;

  grossComparisons:
    CheckoutTaxGrossComparisons;

  expectedGrossAmountsProvided:
    boolean;

  allProvidedGrossAmountsMatch:
    boolean;

  taxSnapshot:
    InvoiceTaxSnapshotResult;
};

export class InvoiceTaxCheckoutAdapterError extends Error {
  readonly code: string;

  readonly details:
    | Record<string, unknown>
    | null;

  constructor(
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);

    this.name =
      "InvoiceTaxCheckoutAdapterError";

    this.code =
      code;

    this.details =
      details ?? null;
  }
}

type NormalizedCatalogProduct = {
  id: string;

  taxRate:
    SupportedInvoiceTaxRate;

  isBook: boolean;

  active:
    | boolean
    | null;
};

type NormalizedCheckoutLine = {
  key: string;

  productId: string;

  productName: string;

  quantity: number;

  unitPriceGrossCents: number;

  productGrossCents: number;

  catalogTaxRate:
    SupportedInvoiceTaxRate;

  catalogIsBook: boolean;

  isBookSnapshot:
    | boolean
    | null;

  bookCoverSelected: boolean;

  bookCoverUnitPriceGrossCents:
    number;

  bookCoverGrossCents:
    number;

  bookCoverTaxRate:
    | SupportedInvoiceTaxRate
    | null;
};

function fail(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): never {
  throw new InvoiceTaxCheckoutAdapterError(
    code,
    message,
    details,
  );
}

function cleanText(
  value: unknown,
) {
  const text =
    String(value ?? "").trim();

  return text.length > 0
    ? text
    : null;
}

function normalizeTaxRate(
  value: InvoiceTaxMoneyInput,
  label: string,
): SupportedInvoiceTaxRate {
  const parsed =
    Number(value);

  if (parsed === 7) {
    return 7;
  }

  if (parsed === 19) {
    return 19;
  }

  fail(
    "UNSUPPORTED_TAX_RATE",
    `${label} muss 7 oder 19 Prozent betragen.`,
    {
      label,
      value,
    },
  );
}

function normalizeOptionalTaxRate(
  value: InvoiceTaxMoneyInput,
  label: string,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  return normalizeTaxRate(
    value,
    label,
  );
}

function parseMoneyToCents(
  value: InvoiceTaxMoneyInput,
  label: string,
  options?: {
    defaultCents?: number;
    allowZero?: boolean;
  },
) {
  const defaultCents =
    options?.defaultCents ?? 0;

  const allowZero =
    options?.allowZero ?? true;

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    if (
      defaultCents === 0 &&
      !allowZero
    ) {
      fail(
        "MONEY_VALUE_REQUIRED",
        `${label} muss größer als 0 sein.`,
        {
          label,
        },
      );
    }

    return defaultCents;
  }

  const normalized =
    typeof value === "string"
      ? value
          .trim()
          .replace(",", ".")
      : value;

  const parsed =
    Number(normalized);

  if (!Number.isFinite(parsed)) {
    fail(
      "INVALID_MONEY_VALUE",
      `${label} ist kein gültiger Geldbetrag.`,
      {
        label,
        value,
      },
    );
  }

  if (parsed < 0) {
    fail(
      "NEGATIVE_MONEY_VALUE",
      `${label} darf nicht negativ sein.`,
      {
        label,
        value: parsed,
      },
    );
  }

  const cents =
    Math.round(
      (
        parsed +
        Number.EPSILON
      ) *
        100,
    );

  if (
    cents === 0 &&
    !allowZero
  ) {
    fail(
      "ZERO_MONEY_VALUE",
      `${label} muss größer als 0 sein.`,
      {
        label,
      },
    );
  }

  if (
    !Number.isSafeInteger(cents) ||
    cents > MAX_MONEY_CENTS
  ) {
    fail(
      "MONEY_VALUE_TOO_LARGE",
      `${label} überschreitet das technische Sicherheitslimit.`,
      {
        label,
        cents,
      },
    );
  }

  return cents;
}

function parseOptionalExpectedMoneyToCents(
  value: InvoiceTaxMoneyInput,
  label: string,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  return parseMoneyToCents(
    value,
    label,
    {
      allowZero:
        true,
    },
  );
}

function normalizeQuantity(
  value: InvoiceTaxMoneyInput,
  label: string,
) {
  const parsed =
    Number(value);

  if (
    !Number.isFinite(parsed) ||
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > 9_999
  ) {
    fail(
      "INVALID_QUANTITY",
      `${label} muss eine ganze Zahl zwischen 1 und 9999 sein.`,
      {
        label,
        value,
      },
    );
  }

  return parsed;
}

function multiplyCents(
  unitCents: number,
  quantity: number,
  label: string,
) {
  const totalCents =
    unitCents * quantity;

  if (
    !Number.isSafeInteger(
      totalCents,
    ) ||
    totalCents < 0 ||
    totalCents >
      MAX_MONEY_CENTS
  ) {
    fail(
      "LINE_TOTAL_TOO_LARGE",
      `${label} überschreitet das technische Sicherheitslimit.`,
      {
        unitCents,
        quantity,
        totalCents,
      },
    );
  }

  return totalCents;
}

function centsToAmount(
  cents: number,
) {
  return cents / 100;
}

function amountToCents(
  amount: number,
) {
  return Math.round(
    (
      amount +
      Number.EPSILON
    ) *
      100,
  );
}

function normalizeCatalogProducts(
  products: CheckoutTaxCatalogProduct[],
) {
  if (!Array.isArray(products)) {
    fail(
      "INVALID_PRODUCT_COLLECTION",
      "Die Produktdaten müssen als Liste übergeben werden.",
    );
  }

  const productById =
    new Map<
      string,
      NormalizedCatalogProduct
    >();

  for (const product of products) {
    const id =
      cleanText(product.id);

    if (!id) {
      fail(
        "CATALOG_PRODUCT_ID_MISSING",
        "Ein Katalogprodukt besitzt keine Produkt-ID.",
      );
    }

    if (
      productById.has(id)
    ) {
      fail(
        "DUPLICATE_CATALOG_PRODUCT",
        `Das Katalogprodukt ${id} wurde mehrfach übergeben.`,
        {
          productId:
            id,
        },
      );
    }

    productById.set(
      id,
      {
        id,

        taxRate:
          normalizeTaxRate(
            product.taxRate,
            `Umsatzsteuersatz des Produkts ${id}`,
          ),

        isBook:
          product.isBook ===
          true,

        active:
          typeof product.active ===
          "boolean"
            ? product.active
            : null,
      },
    );
  }

  return productById;
}

function resolveBookCoverTaxRate(
  line: CheckoutTaxLineInput,
  productName: string,
  lineSelected: boolean,
  globalBookCoverTaxRate:
    | SupportedInvoiceTaxRate
    | null,
) {
  const lineBookCoverTaxRate =
    normalizeOptionalTaxRate(
      line.bookCoverTaxRate,
      `Buchhüllen-Steuersatz der Position ${productName}`,
    );

  if (!lineSelected) {
    if (
      lineBookCoverTaxRate !==
      null
    ) {
      fail(
        "BOOK_COVER_TAX_RATE_WITHOUT_SELECTION",
        `Für ${productName} ist ein Buchhüllen-Steuersatz gesetzt, obwohl keine Buchhülle ausgewählt ist.`,
        {
          key:
            cleanText(line.key),
        },
      );
    }

    return null;
  }

  if (
    lineBookCoverTaxRate !==
      null &&
    globalBookCoverTaxRate !==
      null &&
    lineBookCoverTaxRate !==
      globalBookCoverTaxRate
  ) {
    fail(
      "BOOK_COVER_TAX_RATE_POLICY_MISMATCH",
      `Der positionsbezogene Buchhüllen-Steuersatz für ${productName} widerspricht dem globalen Vorschausteuersatz.`,
      {
        lineTaxRate:
          lineBookCoverTaxRate,

        globalTaxRate:
          globalBookCoverTaxRate,
      },
    );
  }

  const resolvedTaxRate =
    lineBookCoverTaxRate ??
    globalBookCoverTaxRate;

  if (
    resolvedTaxRate ===
    null
  ) {
    fail(
      "BOOK_COVER_TAX_RATE_REQUIRED",
      `Für die ausgewählte Buchhülle zu ${productName} muss ein Steuersatz ausdrücklich angegeben werden.`,
      {
        key:
          cleanText(line.key),
      },
    );
  }

  return resolvedTaxRate;
}

function normalizeCheckoutLines(
  lines: CheckoutTaxLineInput[],
  productById: Map<
    string,
    NormalizedCatalogProduct
  >,
  globalBookCoverTaxRate:
    | SupportedInvoiceTaxRate
    | null,
) {
  if (
    !Array.isArray(lines) ||
    lines.length === 0
  ) {
    fail(
      "NO_CHECKOUT_LINES",
      "Für den Checkout-Steuersnapshot ist mindestens eine Position erforderlich.",
    );
  }

  if (lines.length > 5_000) {
    fail(
      "TOO_MANY_CHECKOUT_LINES",
      "Der Checkout enthält ungewöhnlich viele Positionen.",
      {
        lineCount:
          lines.length,
      },
    );
  }

  const seenKeys =
    new Set<string>();

  const normalizedLines:
    NormalizedCheckoutLine[] = [];

  for (const line of lines) {
    const key =
      cleanText(line.key);

    if (!key) {
      fail(
        "CHECKOUT_LINE_KEY_MISSING",
        "Jede Checkout-Position benötigt einen eindeutigen Schlüssel.",
      );
    }

    if (seenKeys.has(key)) {
      fail(
        "DUPLICATE_CHECKOUT_LINE_KEY",
        `Der Checkout-Positionsschlüssel ${key} ist mehrfach vorhanden.`,
        {
          key,
        },
      );
    }

    seenKeys.add(key);

    const productId =
      cleanText(
        line.productId,
      );

    if (!productId) {
      fail(
        "CHECKOUT_PRODUCT_ID_MISSING",
        `Für die Position ${key} fehlt die Produkt-ID.`,
        {
          key,
        },
      );
    }

    const productName =
      cleanText(
        line.productName,
      );

    if (!productName) {
      fail(
        "CHECKOUT_PRODUCT_NAME_MISSING",
        `Für die Position ${key} fehlt der Produktname.`,
        {
          key,
          productId,
        },
      );
    }

    const product =
      productById.get(
        productId,
      );

    if (!product) {
      fail(
        "CATALOG_PRODUCT_NOT_FOUND",
        `Das Produkt ${productName} wurde nicht im übergebenen Produktkatalog gefunden.`,
        {
          key,
          productId,
        },
      );
    }

    if (
      product.active ===
      false
    ) {
      fail(
        "CATALOG_PRODUCT_INACTIVE",
        `Das Produkt ${productName} ist deaktiviert und darf nicht abgerechnet werden.`,
        {
          key,
          productId,
        },
      );
    }

    const quantity =
      normalizeQuantity(
        line.quantity,
        `Menge der Position ${productName}`,
      );

    const unitPriceGrossCents =
      parseMoneyToCents(
        line.unitPriceGross,
        `Brutto-Einzelpreis der Position ${productName}`,
        {
          allowZero:
            false,
        },
      );

    const productGrossCents =
      multiplyCents(
        unitPriceGrossCents,
        quantity,
        `Brutto-Gesamtbetrag der Position ${productName}`,
      );

    const isBookSnapshot =
      typeof line.isBookSnapshot ===
      "boolean"
        ? line.isBookSnapshot
        : null;

    if (
      isBookSnapshot !==
        null &&
      isBookSnapshot !==
        product.isBook
    ) {
      fail(
        "BOOK_IDENTITY_SNAPSHOT_MISMATCH",
        `Der gespeicherte Buchstatus der Position ${productName} stimmt nicht mit dem aktuellen Katalogprodukt überein.`,
        {
          key,
          productId,

          snapshotIsBook:
            isBookSnapshot,

          catalogIsBook:
            product.isBook,
        },
      );
    }

    const bookCoverSelected =
      line.bookCoverSelected ===
      true;

    if (
      bookCoverSelected &&
      product.isBook !== true
    ) {
      fail(
        "BOOK_COVER_ON_NON_BOOK_PRODUCT",
        `Für ${productName} ist eine Buchhülle ausgewählt, obwohl das Katalogprodukt kein Buch ist.`,
        {
          key,
          productId,
        },
      );
    }

    const bookCoverUnitPriceGrossCents =
      bookCoverSelected
        ? parseMoneyToCents(
            line.bookCoverUnitPriceGross,
            `Brutto-Einzelpreis der Buchhülle zu ${productName}`,
            {
              allowZero:
                false,
            },
          )
        : 0;

    const bookCoverGrossCents =
      bookCoverSelected
        ? multiplyCents(
            bookCoverUnitPriceGrossCents,
            quantity,
            `Brutto-Gesamtbetrag der Buchhülle zu ${productName}`,
          )
        : 0;

    const bookCoverTaxRate =
      resolveBookCoverTaxRate(
        line,
        productName,
        bookCoverSelected,
        globalBookCoverTaxRate,
      );

    normalizedLines.push({
      key,
      productId,
      productName,
      quantity,
      unitPriceGrossCents,
      productGrossCents,

      catalogTaxRate:
        product.taxRate,

      catalogIsBook:
        product.isBook,

      isBookSnapshot,

      bookCoverSelected,

      bookCoverUnitPriceGrossCents,

      bookCoverGrossCents,

      bookCoverTaxRate,
    });
  }

  return normalizedLines;
}

function sumCents(
  values: number[],
) {
  const total =
    values.reduce(
      (
        sum,
        value,
      ) =>
        sum + value,
      0,
    );

  if (
    !Number.isSafeInteger(total) ||
    total < 0 ||
    total > MAX_MONEY_CENTS
  ) {
    fail(
      "COMPONENT_TOTAL_TOO_LARGE",
      "Eine Rechnungskomponente überschreitet das technische Sicherheitslimit.",
      {
        total,
      },
    );
  }

  return total;
}

function buildGrossComparison(
  component:
    CheckoutTaxGrossComponent,
  calculatedCents: number,
  expectedInput:
    InvoiceTaxMoneyInput,
): CheckoutTaxGrossComparison {
  const expectedCents =
    parseOptionalExpectedMoneyToCents(
      expectedInput,
      `Erwarteter Bruttobetrag ${component}`,
    );

  if (
    expectedCents ===
    null
  ) {
    return {
      provided:
        false,

      expected:
        null,

      calculated:
        centsToAmount(
          calculatedCents,
        ),

      difference:
        null,

      matches:
        null,
    };
  }

  const differenceCents =
    calculatedCents -
    expectedCents;

  return {
    provided:
      true,

    expected:
      centsToAmount(
        expectedCents,
      ),

    calculated:
      centsToAmount(
        calculatedCents,
      ),

    difference:
      centsToAmount(
        differenceCents,
      ),

    matches:
      differenceCents ===
      0,
  };
}

export function buildCheckoutInvoiceTaxSnapshot(
  input: BuildCheckoutInvoiceTaxSnapshotInput,
): CheckoutInvoiceTaxSnapshotResult {
  const productById =
    normalizeCatalogProducts(
      input.products,
    );

  const globalBookCoverTaxRate =
    normalizeOptionalTaxRate(
      input.bookCoverTaxRate,
      "Globaler Buchhüllen-Steuersatz",
    );

  const lines =
    normalizeCheckoutLines(
      input.lines,
      productById,
      globalBookCoverTaxRate,
    );

  const regularShippingGrossCents =
    parseMoneyToCents(
      input.regularShippingGrossAmount,
      "Reguläre Versandkosten",
      {
        defaultCents:
          0,

        allowZero:
          true,
      },
    );

  const bookShippingGrossCents =
    parseMoneyToCents(
      input.bookShippingGrossAmount,
      "Buchversandkosten",
      {
        defaultCents:
          0,

        allowZero:
          true,
      },
    );

  const discountGrossCents =
    parseMoneyToCents(
      input.discountGrossAmount,
      "Rabattbetrag",
      {
        defaultCents:
          0,

        allowZero:
          true,
      },
    );

  const subtotalCents =
    sumCents(
      lines.map(
        (line) =>
          line.productGrossCents,
      ),
    );

  const bookCoverCents =
    sumCents(
      lines.map(
        (line) =>
          line.bookCoverGrossCents,
      ),
    );

  const positiveGrossCents =
    subtotalCents +
    regularShippingGrossCents +
    bookShippingGrossCents +
    bookCoverCents;

  if (
    discountGrossCents >
    positiveGrossCents
  ) {
    fail(
      "DISCOUNT_EXCEEDS_INVOICE_GROSS",
      "Der Rabattbetrag überschreitet die positive Bruttosumme der Rechnung.",
      {
        positiveGrossAmount:
          centsToAmount(
            positiveGrossCents,
          ),

        discountGrossAmount:
          centsToAmount(
            discountGrossCents,
          ),
      },
    );
  }

  const totalGrossCents =
    positiveGrossCents -
    discountGrossCents;

  const taxSnapshot =
    buildInvoiceTaxSnapshot({
      currency:
        input.currency,

      snapshotAt:
        input.snapshotAt,

      items:
        lines.map(
          (line) => ({
            key:
              line.key,

            productId:
              line.productId,

            productName:
              line.productName,

            quantity:
              line.quantity,

            productGrossAmount:
              centsToAmount(
                line.productGrossCents,
              ),

            productTaxRate:
              line.catalogTaxRate,

            isBook:
              line.catalogIsBook,

            bookCoverGrossAmount:
              line.bookCoverSelected
                ? centsToAmount(
                    line.bookCoverGrossCents,
                  )
                : undefined,

            bookCoverTaxRate:
              line.bookCoverSelected
                ? line.bookCoverTaxRate
                : undefined,
          }),
        ),

      regularShippingGrossAmount:
        centsToAmount(
          regularShippingGrossCents,
        ),

      bookShippingGrossAmount:
        centsToAmount(
          bookShippingGrossCents,
        ),

      discountGrossAmount:
        centsToAmount(
          discountGrossCents,
        ),

      bookShippingAllocationScope:
        input.bookShippingAllocationScope,

      discountAllocationScope:
        input.discountAllocationScope,
    });

  const calculatedSnapshotTotalCents =
    amountToCents(
      taxSnapshot.breakdown
        .totals
        .total
        .gross,
    );

  if (
    calculatedSnapshotTotalCents !==
    totalGrossCents
  ) {
    fail(
      "CHECKOUT_TAX_TOTAL_MISMATCH",
      "Der Steuerrechner liefert eine andere Gesamtbruttosumme als der Checkout-Adapter.",
      {
        checkoutGrossAmount:
          centsToAmount(
            totalGrossCents,
          ),

        taxSnapshotGrossAmount:
          centsToAmount(
            calculatedSnapshotTotalCents,
          ),
      },
    );
  }

  const calculatedSubtotalCents =
    amountToCents(
      taxSnapshot.breakdown
        .totals
        .subtotal
        .gross,
    );

  const calculatedCoverCents =
    amountToCents(
      taxSnapshot.breakdown
        .totals
        .book_covers
        .gross,
    );

  const calculatedRegularShippingCents =
    amountToCents(
      taxSnapshot.breakdown
        .totals
        .regular_shipping
        .gross,
    );

  const calculatedBookShippingCents =
    amountToCents(
      taxSnapshot.breakdown
        .totals
        .book_shipping
        .gross,
    );

  const calculatedDiscountCents =
    amountToCents(
      taxSnapshot.breakdown
        .totals
        .discount
        .gross,
    );

  const internalComponentChecks = {
    subtotal:
      calculatedSubtotalCents ===
      subtotalCents,

    regularShipping:
      calculatedRegularShippingCents ===
      regularShippingGrossCents,

    bookShipping:
      calculatedBookShippingCents ===
      bookShippingGrossCents,

    bookCovers:
      calculatedCoverCents ===
      bookCoverCents,

    discount:
      calculatedDiscountCents ===
      discountGrossCents,

    total:
      calculatedSnapshotTotalCents ===
      totalGrossCents,
  };

  const failedInternalComponents =
    Object.entries(
      internalComponentChecks,
    )
      .filter(
        (
          [
            ,
            passed,
          ],
        ) =>
          passed !== true,
      )
      .map(
        (
          [
            name,
          ],
        ) =>
          name,
      );

  if (
    failedInternalComponents.length >
    0
  ) {
    fail(
      "CHECKOUT_TAX_COMPONENT_MISMATCH",
      "Mindestens eine Bruttokomponente stimmt nicht zwischen Adapter und Steuerrechner überein.",
      {
        failedComponents:
          failedInternalComponents,

        adapter: {
          subtotal:
            centsToAmount(
              subtotalCents,
            ),

          regularShipping:
            centsToAmount(
              regularShippingGrossCents,
            ),

          bookShipping:
            centsToAmount(
              bookShippingGrossCents,
            ),

          bookCovers:
            centsToAmount(
              bookCoverCents,
            ),

          discount:
            centsToAmount(
              discountGrossCents,
            ),

          total:
            centsToAmount(
              totalGrossCents,
            ),
        },

        calculator: {
          subtotal:
            taxSnapshot.breakdown
              .totals
              .subtotal
              .gross,

          regularShipping:
            taxSnapshot.breakdown
              .totals
              .regular_shipping
              .gross,

          bookShipping:
            taxSnapshot.breakdown
              .totals
              .book_shipping
              .gross,

          bookCovers:
            taxSnapshot.breakdown
              .totals
              .book_covers
              .gross,

          discount:
            taxSnapshot.breakdown
              .totals
              .discount
              .gross,

          total:
            taxSnapshot.breakdown
              .totals
              .total
              .gross,
        },
      },
    );
  }

  const calculatedGrossCents:
    Record<
      CheckoutTaxGrossComponent,
      number
    > = {
      subtotal:
        subtotalCents,

      regular_shipping:
        regularShippingGrossCents,

      book_shipping:
        bookShippingGrossCents,

      book_covers:
        bookCoverCents,

      discount:
        discountGrossCents,

      total:
        totalGrossCents,
    };

  const expectedGrossAmounts =
    input.expectedGrossAmounts ??
    {};

  const grossComparisons =
    {} as CheckoutTaxGrossComparisons;

  const grossComponents:
    CheckoutTaxGrossComponent[] = [
      "subtotal",
      "regular_shipping",
      "book_shipping",
      "book_covers",
      "discount",
      "total",
    ];

  for (
    const component of
    grossComponents
  ) {
    grossComparisons[component] =
      buildGrossComparison(
        component,
        calculatedGrossCents[
          component
        ],
        expectedGrossAmounts[
          component
        ],
      );
  }

  const providedComparisons =
    grossComponents
      .map(
        (component) =>
          grossComparisons[
            component
          ],
      )
      .filter(
        (comparison) =>
          comparison.provided,
      );

  const expectedGrossAmountsProvided =
    providedComparisons.length >
    0;

  const allProvidedGrossAmountsMatch =
    providedComparisons.every(
      (comparison) =>
        comparison.matches ===
        true,
    );

  if (
    input.requireExpectedGrossAmountsMatch ===
      true &&
    !allProvidedGrossAmountsMatch
  ) {
    const mismatches =
      grossComponents
        .filter(
          (component) =>
            grossComparisons[
              component
            ].provided &&
            grossComparisons[
              component
            ].matches !== true,
        )
        .map(
          (component) => ({
            component,

            expected:
              grossComparisons[
                component
              ].expected,

            calculated:
              grossComparisons[
                component
              ].calculated,

            difference:
              grossComparisons[
                component
              ].difference,
          }),
        );

    fail(
      "EXPECTED_CHECKOUT_GROSS_MISMATCH",
      "Die neue Steuerberechnung stimmt nicht mit den erwarteten Checkout-Bruttosummen überein.",
      {
        mismatches,
      },
    );
  }

  const taxItemByKey =
    new Map(
      taxSnapshot.items.map(
        (item) => [
          item.key,
          item,
        ],
      ),
    );

  const lineResults:
    CheckoutTaxLineResult[] =
      lines.map(
        (line) => {
          const taxItem =
            taxItemByKey.get(
              line.key,
            );

          if (!taxItem) {
            fail(
              "TAX_ITEM_RESULT_MISSING",
              `Für die Position ${line.productName} fehlt das Steuerergebnis.`,
              {
                key:
                  line.key,

                productId:
                  line.productId,
              },
            );
          }

          const calculatedLineGrossCents =
            amountToCents(
              taxItem.product.gross,
            );

          if (
            calculatedLineGrossCents !==
            line.productGrossCents
          ) {
            fail(
              "TAX_ITEM_GROSS_MISMATCH",
              `Der Steuerrechner liefert für ${line.productName} einen abweichenden Produktbruttobetrag.`,
              {
                key:
                  line.key,

                adapterGrossAmount:
                  centsToAmount(
                    line.productGrossCents,
                  ),

                calculatorGrossAmount:
                  taxItem.product
                    .gross,
              },
            );
          }

          const calculatedCoverGrossCents =
            taxItem.bookCover
              ? amountToCents(
                  taxItem.bookCover
                    .gross,
                )
              : 0;

          if (
            calculatedCoverGrossCents !==
            line.bookCoverGrossCents
          ) {
            fail(
              "TAX_ITEM_COVER_GROSS_MISMATCH",
              `Der Steuerrechner liefert für die Buchhülle zu ${line.productName} einen abweichenden Bruttobetrag.`,
              {
                key:
                  line.key,

                adapterGrossAmount:
                  centsToAmount(
                    line.bookCoverGrossCents,
                  ),

                calculatorGrossAmount:
                  taxItem.bookCover
                    ?.gross ??
                  0,
              },
            );
          }

          return {
            key:
              line.key,

            productId:
              line.productId,

            productName:
              line.productName,

            quantity:
              line.quantity,

            unitPriceGross:
              centsToAmount(
                line.unitPriceGrossCents,
              ),

            productGrossAmount:
              centsToAmount(
                line.productGrossCents,
              ),

            catalogTaxRate:
              line.catalogTaxRate,

            catalogIsBook:
              line.catalogIsBook,

            isBookSnapshot:
              line.isBookSnapshot,

            bookCoverSelected:
              line.bookCoverSelected,

            bookCoverUnitPriceGross:
              centsToAmount(
                line.bookCoverUnitPriceGrossCents,
              ),

            bookCoverGrossAmount:
              centsToAmount(
                line.bookCoverGrossCents,
              ),

            bookCoverTaxRate:
              line.bookCoverTaxRate,

            invoiceItemSnapshotPayload:
              taxItem.snapshotPayload,

            calculatedProductTax: {
              gross:
                taxItem.product
                  .gross,

              net:
                taxItem.product
                  .net,

              tax:
                taxItem.product
                  .tax,
            },

            calculatedBookCoverTax:
              taxItem.bookCover
                ? {
                    gross:
                      taxItem
                        .bookCover
                        .gross,

                    net:
                      taxItem
                        .bookCover
                        .net,

                    tax:
                      taxItem
                        .bookCover
                        .tax,
                  }
                : null,
          };
        },
      );

  return {
    adapterVersion:
      INVOICE_TAX_CHECKOUT_ADAPTER_VERSION,

    snapshotAt:
      taxSnapshot.snapshotAt,

    currency:
      "EUR",

    lines:
      lineResults,

    grossAmounts: {
      subtotal:
        centsToAmount(
          subtotalCents,
        ),

      regular_shipping:
        centsToAmount(
          regularShippingGrossCents,
        ),

      book_shipping:
        centsToAmount(
          bookShippingGrossCents,
        ),

      book_covers:
        centsToAmount(
          bookCoverCents,
        ),

      discount:
        centsToAmount(
          discountGrossCents,
        ),

      total:
        centsToAmount(
          totalGrossCents,
        ),
    },

    grossComparisons,

    expectedGrossAmountsProvided,

    allProvidedGrossAmountsMatch,

    taxSnapshot,
  };
}