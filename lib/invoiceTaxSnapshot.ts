/*
 * INVOICE_TAX_SNAPSHOT_CALCULATOR_V1
 *
 * Reine, deterministische Cent-Berechnung für Rechnungs-Steuersnapshots.
 * Die Datei führt keine Datenbank-, Lexware- oder Mailoperationen aus.
 */

export const INVOICE_TAX_SNAPSHOT_VERSION =
  "invoice-tax-snapshot-v1" as const;

export const INVOICE_TAX_SNAPSHOT_SOURCE =
  "product_catalog_at_checkout" as const;

export const SUPPORTED_INVOICE_TAX_RATES = [
  7,
  19,
] as const;

export type SupportedInvoiceTaxRate =
  (typeof SUPPORTED_INVOICE_TAX_RATES)[number];

export type InvoiceTaxMoneyInput =
  | number
  | string
  | null
  | undefined;

export type InvoiceBookShippingAllocationScope =
  | "book_products_only"
  | "book_products_and_covers";

export type InvoiceDiscountAllocationScope =
  | "products_only"
  | "products_and_book_covers";

export type InvoiceTaxSnapshotItemInput = {
  key: string;
  productId: string;
  productName: string;
  quantity: InvoiceTaxMoneyInput;
  productGrossAmount: InvoiceTaxMoneyInput;
  productTaxRate: InvoiceTaxMoneyInput;
  isBook: boolean;
  bookCoverGrossAmount?: InvoiceTaxMoneyInput;
  bookCoverTaxRate?: InvoiceTaxMoneyInput;
};

export type BuildInvoiceTaxSnapshotInput = {
  currency?: string | null;
  snapshotAt?: string | Date | null;
  items: InvoiceTaxSnapshotItemInput[];
  regularShippingGrossAmount?: InvoiceTaxMoneyInput;
  bookShippingGrossAmount?: InvoiceTaxMoneyInput;
  discountGrossAmount?: InvoiceTaxMoneyInput;
  bookShippingAllocationScope?:
    InvoiceBookShippingAllocationScope | null;
  discountAllocationScope?:
    InvoiceDiscountAllocationScope | null;
};

export type InvoiceTaxMoney = {
  gross: number;
  net: number;
  tax: number;
};

export type InvoiceTaxRatedMoney =
  InvoiceTaxMoney & {
    taxRate: SupportedInvoiceTaxRate;
  };

export type InvoiceTaxItemSnapshotPayload = {
  tax_rate_snapshot: SupportedInvoiceTaxRate;
  product_gross_amount_snapshot: number;
  product_net_amount_snapshot: number;
  product_tax_amount_snapshot: number;
  tax_snapshot_source:
    typeof INVOICE_TAX_SNAPSHOT_SOURCE;
  tax_snapshot_version:
    typeof INVOICE_TAX_SNAPSHOT_VERSION;
  tax_snapshot_at: string;
  book_cover_tax_rate_snapshot:
    | SupportedInvoiceTaxRate
    | null;
  book_cover_net_amount_snapshot:
    | number
    | null;
  book_cover_tax_amount_snapshot:
    | number
    | null;
};

export type InvoiceTaxItemSnapshot = {
  key: string;
  productId: string;
  productName: string;
  quantity: number;
  isBook: boolean;
  product: InvoiceTaxRatedMoney;
  bookCover:
    | InvoiceTaxRatedMoney
    | null;
  snapshotPayload:
    InvoiceTaxItemSnapshotPayload;
};

export type InvoiceTaxRateBreakdown = {
  tax_rate: SupportedInvoiceTaxRate;
  products: InvoiceTaxMoney;
  book_covers: InvoiceTaxMoney;
  regular_shipping: InvoiceTaxMoney;
  book_shipping: InvoiceTaxMoney;
  discount: InvoiceTaxMoney;
  total: InvoiceTaxMoney;
};

export type InvoiceTaxBreakdownSnapshot = {
  version:
    typeof INVOICE_TAX_SNAPSHOT_VERSION;
  source:
    typeof INVOICE_TAX_SNAPSHOT_SOURCE;
  generated_at: string;
  currency: "EUR";
  rounding_method:
    "integer_cent_half_up_with_scoped_reduction_balance_v1";
  allocation_methods: {
    regular_shipping:
      "net_value_all_goods_v1";
    book_shipping:
      | "net_value_book_products_only_v1"
      | "net_value_book_products_and_covers_v1";
    discount:
      | "gross_value_products_only_v1"
      | "gross_value_products_and_book_covers_v1";
  };
  rates: InvoiceTaxRateBreakdown[];
  totals: {
    subtotal: InvoiceTaxMoney;
    regular_shipping: InvoiceTaxMoney;
    book_shipping: InvoiceTaxMoney;
    book_covers: InvoiceTaxMoney;
    discount: InvoiceTaxMoney;
    total: InvoiceTaxMoney;
  };
};

export type InvoiceTaxSnapshotPayload = {
  tax_snapshot_status: "complete";
  tax_snapshot_source:
    typeof INVOICE_TAX_SNAPSHOT_SOURCE;
  tax_snapshot_version:
    typeof INVOICE_TAX_SNAPSHOT_VERSION;
  tax_snapshot_at: string;
  tax_breakdown_snapshot:
    InvoiceTaxBreakdownSnapshot;
  subtotal_net_amount_snapshot: number;
  subtotal_tax_amount_snapshot: number;
  shipping_net_amount_snapshot: number;
  shipping_tax_amount_snapshot: number;
  book_shipping_net_amount_snapshot: number;
  book_shipping_tax_amount_snapshot: number;
  book_cover_net_amount_snapshot: number;
  book_cover_tax_amount_snapshot: number;
  discount_net_amount_snapshot: number;
  discount_tax_amount_snapshot: number;
  total_net_amount_snapshot: number;
  total_tax_amount_snapshot: number;
};

export type InvoiceTaxSnapshotResult = {
  version:
    typeof INVOICE_TAX_SNAPSHOT_VERSION;
  source:
    typeof INVOICE_TAX_SNAPSHOT_SOURCE;
  snapshotAt: string;
  currency: "EUR";
  items: InvoiceTaxItemSnapshot[];
  breakdown:
    InvoiceTaxBreakdownSnapshot;
  invoiceSnapshotPayload:
    InvoiceTaxSnapshotPayload;
};

export class InvoiceTaxSnapshotError extends Error {
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
      "InvoiceTaxSnapshotError";

    this.code =
      code;

    this.details =
      details ?? null;
  }
}

type MoneyCents = {
  grossCents: number;
  netCents: number;
  taxCents: number;
};

type NormalizedItem = {
  key: string;
  productId: string;
  productName: string;
  quantity: number;
  isBook: boolean;
  productTaxRate:
    SupportedInvoiceTaxRate;
  productMoney: MoneyCents;
  bookCoverTaxRate:
    | SupportedInvoiceTaxRate
    | null;
  bookCoverMoney:
    | MoneyCents
    | null;
};

type RateAccumulator = {
  taxRate: SupportedInvoiceTaxRate;
  products: MoneyCents;
  bookCovers: MoneyCents;
  regularShippingBasisNetCents: number;
  bookProductShippingBasisNetCents: number;
  bookRelatedShippingBasisNetCents: number;
  productDiscountBasisGrossCents: number;
  productAndCoverDiscountBasisGrossCents: number;
};

const MAX_MONEY_CENTS =
  100_000_000_00;

function fail(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): never {
  throw new InvoiceTaxSnapshotError(
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

function roundHalfUpBigInt(
  numerator: bigint,
  denominator: bigint,
) {
  if (denominator <= BigInt(0)) {
    fail(
      "INVALID_DIVISOR",
      "Der Divisor muss größer als 0 sein.",
    );
  }

  const quotient =
    numerator / denominator;

  const remainder =
    numerator % denominator;

  return remainder * BigInt(2) >= denominator
    ? quotient + BigInt(1)
    : quotient;
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
      );
    }

    return defaultCents;
  }

  const normalized =
    typeof value === "string"
      ? value.trim().replace(",", ".")
      : value;

  const parsed =
    Number(normalized);

  if (!Number.isFinite(parsed)) {
    fail(
      "INVALID_MONEY_VALUE",
      `${label} ist kein gültiger Geldbetrag.`,
      {
        label,
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
      (parsed + Number.EPSILON) * 100,
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

  if (cents > MAX_MONEY_CENTS) {
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

function requirePositiveInteger(
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

function requireSupportedTaxRate(
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

function splitGrossCents(
  grossCents: number,
  taxRate: SupportedInvoiceTaxRate,
): MoneyCents {
  const netCents = Number(
    roundHalfUpBigInt(
      BigInt(grossCents) * BigInt(100),
      BigInt(100 + taxRate),
    ),
  );

  const taxCents =
    grossCents - netCents;

  return {
    grossCents,
    netCents,
    taxCents,
  };
}

function emptyMoneyCents(): MoneyCents {
  return {
    grossCents: 0,
    netCents: 0,
    taxCents: 0,
  };
}

function addMoneyCents(
  left: MoneyCents,
  right: MoneyCents,
): MoneyCents {
  return {
    grossCents:
      left.grossCents +
      right.grossCents,

    netCents:
      left.netCents +
      right.netCents,

    taxCents:
      left.taxCents +
      right.taxCents,
  };
}

function applyGrossReductionCents(
  positiveMoney: MoneyCents,
  reductionGrossCents: number,
  taxRate: SupportedInvoiceTaxRate,
  label: string,
): {
  reduction: MoneyCents;
  total: MoneyCents;
} {
  validateMoneyIdentity(
    positiveMoney,
    `${label}: Ausgangsbetrag`,
  );

  if (
    !Number.isSafeInteger(
      reductionGrossCents,
    ) ||
    reductionGrossCents < 0
  ) {
    fail(
      "INVALID_GROSS_REDUCTION",
      `${label}: Der Bruttoabzug ist ungültig.`,
      {
        reductionGrossCents,
      },
    );
  }

  if (
    reductionGrossCents >
    positiveMoney.grossCents
  ) {
    fail(
      "REDUCTION_EXCEEDS_GROSS",
      `${label}: Der Bruttoabzug überschreitet den vorhandenen Bruttobetrag.`,
      {
        positiveMoney,
        reductionGrossCents,
      },
    );
  }

  if (reductionGrossCents === 0) {
    return {
      reduction:
        emptyMoneyCents(),

      total: {
        ...positiveMoney,
      },
    };
  }

  const remainingGrossCents =
    positiveMoney.grossCents -
    reductionGrossCents;

  const standardRemainingMoney =
    splitGrossCents(
      remainingGrossCents,
      taxRate,
    );

  /*
   * Zeilenweise gerundete Produktwerte können sich um einzelne
   * Cent von einer erneuten Aufteilung der gesamten Steuersumme
   * unterscheiden.
   *
   * Der verbleibende Nettobetrag wird deshalb auf den Bereich
   * begrenzt, in dem weder der vorhandene Netto- noch der
   * vorhandene Steuerbetrag überschritten wird.
   */
  const minimumRemainingNetCents =
    Math.max(
      0,
      remainingGrossCents -
      positiveMoney.taxCents,
    );

  const maximumRemainingNetCents =
    Math.min(
      positiveMoney.netCents,
      remainingGrossCents,
    );

  if (
    minimumRemainingNetCents >
    maximumRemainingNetCents
  ) {
    fail(
      "REDUCTION_ROUNDING_RANGE_INVALID",
      `${label}: Für die Rundung konnte kein gültiger Netto-/Steuerbereich ermittelt werden.`,
      {
        positiveMoney,
        reductionGrossCents,
        remainingGrossCents,
        minimumRemainingNetCents,
        maximumRemainingNetCents,
      },
    );
  }

  const remainingNetCents =
    Math.max(
      minimumRemainingNetCents,
      Math.min(
        maximumRemainingNetCents,
        standardRemainingMoney.netCents,
      ),
    );

  const remainingTaxCents =
    remainingGrossCents -
    remainingNetCents;

  const total: MoneyCents = {
    grossCents:
      remainingGrossCents,

    netCents:
      remainingNetCents,

    taxCents:
      remainingTaxCents,
  };

  const reduction: MoneyCents = {
    grossCents:
      reductionGrossCents,

    netCents:
      positiveMoney.netCents -
      remainingNetCents,

    taxCents:
      positiveMoney.taxCents -
      remainingTaxCents,
  };

  if (
    total.grossCents < 0 ||
    total.netCents < 0 ||
    total.taxCents < 0 ||
    reduction.grossCents < 0 ||
    reduction.netCents < 0 ||
    reduction.taxCents < 0
  ) {
    fail(
      "NEGATIVE_TAX_BUCKET",
      `${label}: Die Rundungsbalance würde einen negativen Betrag erzeugen.`,
      {
        positiveMoney,
        reduction,
        total,
      },
    );
  }

  validateMoneyIdentity(
    reduction,
    `${label}: Abzug`,
  );

  validateMoneyIdentity(
    total,
    `${label}: Restbetrag`,
  );

  if (
    reduction.grossCents +
      total.grossCents !==
    positiveMoney.grossCents ||
    reduction.netCents +
      total.netCents !==
    positiveMoney.netCents ||
    reduction.taxCents +
      total.taxCents !==
    positiveMoney.taxCents
  ) {
    fail(
      "REDUCTION_BALANCE_MISMATCH",
      `${label}: Abzug und Restbetrag ergeben nicht mehr den Ausgangsbetrag.`,
      {
        positiveMoney,
        reduction,
        total,
      },
    );
  }

  return {
    reduction,
    total,
  };
}

function centsToAmount(
  cents: number,
) {
  return cents / 100;
}

function toPublicMoney(
  money: MoneyCents,
): InvoiceTaxMoney {
  return {
    gross:
      centsToAmount(
        money.grossCents,
      ),

    net:
      centsToAmount(
        money.netCents,
      ),

    tax:
      centsToAmount(
        money.taxCents,
      ),
  };
}

function validateMoneyIdentity(
  money: MoneyCents,
  label: string,
) {
  if (
    money.netCents +
      money.taxCents !==
    money.grossCents
  ) {
    fail(
      "MONEY_IDENTITY_FAILED",
      `${label}: Netto plus Steuer entspricht nicht Brutto.`,
      {
        money,
      },
    );
  }
}

function allocateCentsByWeight(
  totalCents: number,
  weights: Array<{
    taxRate: SupportedInvoiceTaxRate;
    weightCents: number;
  }>,
  label: string,
) {
  const result =
    new Map<SupportedInvoiceTaxRate, number>();

  for (
    const taxRate of
    SUPPORTED_INVOICE_TAX_RATES
  ) {
    result.set(taxRate, 0);
  }

  if (totalCents === 0) {
    return result;
  }

  const positiveWeights =
    weights.filter(
      (entry) =>
        entry.weightCents > 0,
    );

  const totalWeight =
    positiveWeights.reduce(
      (
        sum,
        entry,
      ) =>
        sum + entry.weightCents,
      0,
    );

  if (
    positiveWeights.length === 0 ||
    totalWeight <= 0
  ) {
    fail(
      "MISSING_ALLOCATION_BASIS",
      `${label} kann ohne positive Zuordnungsbasis nicht verteilt werden.`,
      {
        totalCents,
        weights,
      },
    );
  }

  const denominator =
    BigInt(totalWeight);

  const allocations =
    positiveWeights.map(
      (entry) => {
        const numerator =
          BigInt(totalCents) *
          BigInt(entry.weightCents);

        const baseCents =
          Number(
            numerator / denominator,
          );

        const remainder =
          numerator % denominator;

        return {
          ...entry,
          baseCents,
          remainder,
        };
      },
    );

  const baseSum =
    allocations.reduce(
      (
        sum,
        entry,
      ) =>
        sum + entry.baseCents,
      0,
    );

  let remainingCents =
    totalCents - baseSum;

  allocations.sort(
    (
      left,
      right,
    ) => {
      if (
        left.remainder >
        right.remainder
      ) {
        return -1;
      }

      if (
        left.remainder <
        right.remainder
      ) {
        return 1;
      }

      return (
        left.taxRate -
        right.taxRate
      );
    },
  );

  for (
    let index = 0;
    remainingCents > 0;
    index += 1
  ) {
    const target =
      allocations[
        index % allocations.length
      ];

    target.baseCents += 1;
    remainingCents -= 1;
  }

  for (const entry of allocations) {
    result.set(
      entry.taxRate,
      entry.baseCents,
    );
  }

  const allocatedSum =
    Array.from(
      result.values(),
    ).reduce(
      (
        sum,
        value,
      ) =>
        sum + value,
      0,
    );

  if (allocatedSum !== totalCents) {
    fail(
      "ALLOCATION_SUM_MISMATCH",
      `${label} wurde nicht vollständig verteilt.`,
      {
        totalCents,
        allocatedSum,
      },
    );
  }

  return result;
}

function normalizeSnapshotAt(
  value: string | Date | null | undefined,
) {
  const date =
    value instanceof Date
      ? new Date(value.getTime())
      : value
        ? new Date(value)
        : new Date();

  if (!Number.isFinite(date.getTime())) {
    fail(
      "INVALID_SNAPSHOT_TIMESTAMP",
      "Der Zeitpunkt des Steuer-Snapshots ist ungültig.",
    );
  }

  return date.toISOString();
}

function makeRateAccumulator(
  taxRate: SupportedInvoiceTaxRate,
): RateAccumulator {
  return {
    taxRate,
    products:
      emptyMoneyCents(),
    bookCovers:
      emptyMoneyCents(),
    regularShippingBasisNetCents: 0,
    bookProductShippingBasisNetCents: 0,
    bookRelatedShippingBasisNetCents: 0,
    productDiscountBasisGrossCents: 0,
    productAndCoverDiscountBasisGrossCents: 0,
  };
}

function sumRateMoney(
  values: MoneyCents[],
) {
  return values.reduce(
    (
      sum,
      value,
    ) =>
      addMoneyCents(
        sum,
        value,
      ),
    emptyMoneyCents(),
  );
}

function normalizeItem(
  input: InvoiceTaxSnapshotItemInput,
  seenKeys: Set<string>,
): NormalizedItem {
  const key =
    cleanText(input.key);

  const productId =
    cleanText(input.productId);

  const productName =
    cleanText(input.productName);

  if (!key) {
    fail(
      "ITEM_KEY_MISSING",
      "Jede Steuerposition benötigt einen eindeutigen Schlüssel.",
    );
  }

  if (seenKeys.has(key)) {
    fail(
      "DUPLICATE_ITEM_KEY",
      `Der Steuerpositionsschlüssel ${key} ist mehrfach vorhanden.`,
      {
        key,
      },
    );
  }

  seenKeys.add(key);

  if (!productId) {
    fail(
      "PRODUCT_ID_MISSING",
      `Für die Position ${key} fehlt die Produkt-ID.`,
      {
        key,
      },
    );
  }

  if (!productName) {
    fail(
      "PRODUCT_NAME_MISSING",
      `Für die Position ${key} fehlt der Produktname.`,
      {
        key,
      },
    );
  }

  const quantity =
    requirePositiveInteger(
      input.quantity,
      `Menge der Position ${productName}`,
    );

  const productTaxRate =
    requireSupportedTaxRate(
      input.productTaxRate,
      `Umsatzsteuersatz der Position ${productName}`,
    );

  const productGrossCents =
    parseMoneyToCents(
      input.productGrossAmount,
      `Bruttobetrag der Position ${productName}`,
      {
        allowZero: false,
      },
    );

  const productMoney =
    splitGrossCents(
      productGrossCents,
      productTaxRate,
    );

  const bookCoverGrossCents =
    parseMoneyToCents(
      input.bookCoverGrossAmount,
      `Buchhüllen-Bruttobetrag der Position ${productName}`,
      {
        defaultCents: 0,
        allowZero: true,
      },
    );

  let bookCoverTaxRate:
    | SupportedInvoiceTaxRate
    | null = null;

  let bookCoverMoney:
    | MoneyCents
    | null = null;

  if (bookCoverGrossCents > 0) {
    if (input.isBook !== true) {
      fail(
        "BOOK_COVER_ON_NON_BOOK_ITEM",
        `Die Position ${productName} enthält eine Buchhülle, ist aber nicht als Buch markiert.`,
        {
          key,
          productId,
        },
      );
    }

    bookCoverTaxRate =
      requireSupportedTaxRate(
        input.bookCoverTaxRate,
        `Umsatzsteuersatz der Buchhülle zu ${productName}`,
      );

    bookCoverMoney =
      splitGrossCents(
        bookCoverGrossCents,
        bookCoverTaxRate,
      );
  } else if (
    input.bookCoverTaxRate !== null &&
    input.bookCoverTaxRate !== undefined &&
    input.bookCoverTaxRate !== ""
  ) {
    fail(
      "BOOK_COVER_RATE_WITHOUT_AMOUNT",
      `Für ${productName} ist ein Buchhüllen-Steuersatz ohne Buchhüllenbetrag gesetzt.`,
      {
        key,
        productId,
      },
    );
  }

  validateMoneyIdentity(
    productMoney,
    `Produktposition ${productName}`,
  );

  if (bookCoverMoney) {
    validateMoneyIdentity(
      bookCoverMoney,
      `Buchhülle zu ${productName}`,
    );
  }

  return {
    key,
    productId,
    productName,
    quantity,
    isBook:
      input.isBook === true,
    productTaxRate,
    productMoney,
    bookCoverTaxRate,
    bookCoverMoney,
  };
}

export function roundInvoiceTaxMoney(
  value: InvoiceTaxMoneyInput,
) {
  return centsToAmount(
    parseMoneyToCents(
      value,
      "Geldbetrag",
      {
        defaultCents: 0,
        allowZero: true,
      },
    ),
  );
}

export function buildInvoiceTaxSnapshot(
  input: BuildInvoiceTaxSnapshotInput,
): InvoiceTaxSnapshotResult {
  const currency =
    cleanText(
      input.currency || "EUR",
    )?.toUpperCase();

  if (currency !== "EUR") {
    fail(
      "UNSUPPORTED_CURRENCY",
      "Die Steuer-Snapshot-Berechnung unterstützt derzeit ausschließlich EUR.",
      {
        currency,
      },
    );
  }

  if (
    !Array.isArray(input.items) ||
    input.items.length === 0
  ) {
    fail(
      "NO_TAX_ITEMS",
      "Für den Steuer-Snapshot ist mindestens eine Rechnungsposition erforderlich.",
    );
  }

  if (input.items.length > 5_000) {
    fail(
      "TOO_MANY_TAX_ITEMS",
      "Der Steuer-Snapshot enthält ungewöhnlich viele Positionen.",
      {
        itemCount:
          input.items.length,
      },
    );
  }

  const snapshotAt =
    normalizeSnapshotAt(
      input.snapshotAt,
    );

  const seenKeys =
    new Set<string>();

  const items =
    input.items.map(
      (item) =>
        normalizeItem(
          item,
          seenKeys,
        ),
    );

  const regularShippingGrossCents =
    parseMoneyToCents(
      input.regularShippingGrossAmount,
      "Reguläre Versandkosten",
      {
        defaultCents: 0,
        allowZero: true,
      },
    );

  const bookShippingGrossCents =
    parseMoneyToCents(
      input.bookShippingGrossAmount,
      "Buchversandkosten",
      {
        defaultCents: 0,
        allowZero: true,
      },
    );

  const discountGrossCents =
    parseMoneyToCents(
      input.discountGrossAmount,
      "Rabattbetrag",
      {
        defaultCents: 0,
        allowZero: true,
      },
    );

  const accumulators =
    new Map<
      SupportedInvoiceTaxRate,
      RateAccumulator
    >();

  for (
    const taxRate of
    SUPPORTED_INVOICE_TAX_RATES
  ) {
    accumulators.set(
      taxRate,
      makeRateAccumulator(taxRate),
    );
  }

  for (const item of items) {
    const productAccumulator =
      accumulators.get(
        item.productTaxRate,
      );

    if (!productAccumulator) {
      fail(
        "PRODUCT_RATE_BUCKET_MISSING",
        `Für ${item.productTaxRate} Prozent fehlt der Produkt-Steuerbereich.`,
      );
    }

    productAccumulator.products =
      addMoneyCents(
        productAccumulator.products,
        item.productMoney,
      );

    productAccumulator.regularShippingBasisNetCents +=
      item.productMoney.netCents;

    productAccumulator.productDiscountBasisGrossCents +=
      item.productMoney.grossCents;

    productAccumulator.productAndCoverDiscountBasisGrossCents +=
      item.productMoney.grossCents;

    if (item.isBook) {
      productAccumulator.bookProductShippingBasisNetCents +=
        item.productMoney.netCents;

      productAccumulator.bookRelatedShippingBasisNetCents +=
        item.productMoney.netCents;
    }

    if (
      item.bookCoverMoney &&
      item.bookCoverTaxRate
    ) {
      const coverAccumulator =
        accumulators.get(
          item.bookCoverTaxRate,
        );

      if (!coverAccumulator) {
        fail(
          "COVER_RATE_BUCKET_MISSING",
          `Für ${item.bookCoverTaxRate} Prozent fehlt der Buchhüllen-Steuerbereich.`,
        );
      }

      coverAccumulator.bookCovers =
        addMoneyCents(
          coverAccumulator.bookCovers,
          item.bookCoverMoney,
        );

      coverAccumulator.regularShippingBasisNetCents +=
        item.bookCoverMoney.netCents;

      coverAccumulator.bookRelatedShippingBasisNetCents +=
        item.bookCoverMoney.netCents;

      coverAccumulator.productAndCoverDiscountBasisGrossCents +=
        item.bookCoverMoney.grossCents;
    }
  }

  const subtotalMoney =
    sumRateMoney(
      Array.from(
        accumulators.values(),
      ).map(
        (entry) =>
          entry.products,
      ),
    );

  const bookCoverMoney =
    sumRateMoney(
      Array.from(
        accumulators.values(),
      ).map(
        (entry) =>
          entry.bookCovers,
      ),
    );

  const bookShippingAllocationScope =
    input.bookShippingAllocationScope ??
    (bookShippingGrossCents === 0
      ? "book_products_only"
      : null);

  if (
    bookShippingGrossCents > 0 &&
    bookShippingAllocationScope !==
      "book_products_only" &&
    bookShippingAllocationScope !==
      "book_products_and_covers"
  ) {
    fail(
      "BOOK_SHIPPING_SCOPE_REQUIRED",
      "Für positive Buchversandkosten muss die Zuordnungsbasis ausdrücklich festgelegt werden.",
    );
  }

  const discountAllocationScope =
    input.discountAllocationScope ??
    (discountGrossCents === 0
      ? "products_only"
      : null);

  if (
    discountGrossCents > 0 &&
    discountAllocationScope !==
      "products_only" &&
    discountAllocationScope !==
      "products_and_book_covers"
  ) {
    fail(
      "DISCOUNT_SCOPE_REQUIRED",
      "Für einen positiven Rabatt muss der Rabattumfang ausdrücklich festgelegt werden.",
    );
  }

  const discountBasisGrossCents =
    discountAllocationScope ===
    "products_and_book_covers"
      ? subtotalMoney.grossCents +
        bookCoverMoney.grossCents
      : subtotalMoney.grossCents;

  if (
    discountGrossCents >
    discountBasisGrossCents
  ) {
    fail(
      "DISCOUNT_EXCEEDS_ELIGIBLE_GROSS",
      "Der Rabattbetrag darf die ausdrücklich rabattfähige Bruttosumme nicht überschreiten.",
      {
        discountGross:
          centsToAmount(
            discountGrossCents,
          ),
        eligibleGross:
          centsToAmount(
            discountBasisGrossCents,
          ),
        discountAllocationScope,
      },
    );
  }

  const regularShippingAllocation =
    allocateCentsByWeight(
      regularShippingGrossCents,
      Array.from(
        accumulators.values(),
      ).map(
        (entry) => ({
          taxRate:
            entry.taxRate,
          weightCents:
            entry.regularShippingBasisNetCents,
        })),
      "Reguläre Versandkosten",
    );

  const bookShippingAllocation =
    allocateCentsByWeight(
      bookShippingGrossCents,
      Array.from(
        accumulators.values(),
      ).map(
        (entry) => ({
          taxRate:
            entry.taxRate,
          weightCents:
            bookShippingAllocationScope ===
            "book_products_and_covers"
              ? entry.bookRelatedShippingBasisNetCents
              : entry.bookProductShippingBasisNetCents,
        })),
      "Buchversandkosten",
    );

  const discountAllocation =
    allocateCentsByWeight(
      discountGrossCents,
      Array.from(
        accumulators.values(),
      ).map(
        (entry) => ({
          taxRate:
            entry.taxRate,
          weightCents:
            discountAllocationScope ===
            "products_and_book_covers"
              ? entry.productAndCoverDiscountBasisGrossCents
              : entry.productDiscountBasisGrossCents,
        })),
      "Rabattbetrag",
    );

  const rateBreakdowns:
    InvoiceTaxRateBreakdown[] = [];

  const rateTotalsCents:
    MoneyCents[] = [];

  const regularShippingMoneyByRate:
    MoneyCents[] = [];

  const bookShippingMoneyByRate:
    MoneyCents[] = [];

  const discountMoneyByRate:
    MoneyCents[] = [];

  for (
    const taxRate of
    SUPPORTED_INVOICE_TAX_RATES
  ) {
    const accumulator =
      accumulators.get(taxRate);

    if (!accumulator) {
      fail(
        "RATE_BUCKET_MISSING",
        `Der Steuerbereich ${taxRate} Prozent fehlt.`,
      );
    }

    const regularShippingMoney =
      splitGrossCents(
        regularShippingAllocation.get(
          taxRate,
        ) || 0,
        taxRate,
      );

    const bookShippingMoneyForRate =
      splitGrossCents(
        bookShippingAllocation.get(
          taxRate,
        ) || 0,
        taxRate,
      );

    /*
     * Der Rabatt darf nur die ausdrücklich rabattfähigen
     * Komponenten reduzieren.
     *
     * Regulärer Versand und Buchversand bleiben immer
     * außerhalb der Rabattbasis.
     *
     * Buchhüllen gehören nur bei
     * products_and_book_covers zur Rabattbasis.
     */
    const discountEligibleMoney =
      discountAllocationScope ===
      "products_and_book_covers"
        ? addMoneyCents(
            accumulator.products,
            accumulator.bookCovers,
          )
        : accumulator.products;

    const nonDiscountedMoney =
      discountAllocationScope ===
      "products_and_book_covers"
        ? sumRateMoney([
            regularShippingMoney,
            bookShippingMoneyForRate,
          ])
        : sumRateMoney([
            accumulator.bookCovers,
            regularShippingMoney,
            bookShippingMoneyForRate,
          ]);

    validateMoneyIdentity(
      discountEligibleMoney,
      `Rabattfähige Komponenten ${taxRate} Prozent`,
    );

    validateMoneyIdentity(
      nonDiscountedMoney,
      `Nicht rabattierte Komponenten ${taxRate} Prozent`,
    );

    const grossReduction =
      applyGrossReductionCents(
        discountEligibleMoney,
        discountAllocation.get(
          taxRate,
        ) || 0,
        taxRate,
        `Rabatt ${taxRate} Prozent`,
      );

    const discountMoney =
      grossReduction.reduction;

    const totalForRate =
      addMoneyCents(
        grossReduction.total,
        nonDiscountedMoney,
      );

    validateMoneyIdentity(
      regularShippingMoney,
      `Regulärer Versand ${taxRate} Prozent`,
    );

    validateMoneyIdentity(
      bookShippingMoneyForRate,
      `Buchversand ${taxRate} Prozent`,
    );

    validateMoneyIdentity(
      discountMoney,
      `Rabatt ${taxRate} Prozent`,
    );

    validateMoneyIdentity(
      totalForRate,
      `Gesamtsumme ${taxRate} Prozent`,
    );

    regularShippingMoneyByRate.push(
      regularShippingMoney,
    );

    bookShippingMoneyByRate.push(
      bookShippingMoneyForRate,
    );

    discountMoneyByRate.push(
      discountMoney,
    );

    rateTotalsCents.push(
      totalForRate,
    );

    rateBreakdowns.push({
      tax_rate:
        taxRate,
      products:
        toPublicMoney(
          accumulator.products,
        ),
      book_covers:
        toPublicMoney(
          accumulator.bookCovers,
        ),
      regular_shipping:
        toPublicMoney(
          regularShippingMoney,
        ),
      book_shipping:
        toPublicMoney(
          bookShippingMoneyForRate,
        ),
      discount:
        toPublicMoney(
          discountMoney,
        ),
      total:
        toPublicMoney(
          totalForRate,
        ),
    });
  }

  const regularShippingMoney =
    sumRateMoney(
      regularShippingMoneyByRate,
    );

  const bookShippingMoneyTotal =
    sumRateMoney(
      bookShippingMoneyByRate,
    );

  const discountMoneyTotal =
    sumRateMoney(
      discountMoneyByRate,
    );

  const totalMoney =
    sumRateMoney(
      rateTotalsCents,
    );

  const expectedTotalGrossCents =
    subtotalMoney.grossCents +
    bookCoverMoney.grossCents +
    regularShippingMoney.grossCents +
    bookShippingMoneyTotal.grossCents -
    discountMoneyTotal.grossCents;

  if (
    totalMoney.grossCents !==
    expectedTotalGrossCents
  ) {
    fail(
      "TOTAL_GROSS_MISMATCH",
      "Die berechnete Gesamtbruttosumme stimmt nicht mit den Rechnungskomponenten überein.",
      {
        calculatedGrossCents:
          totalMoney.grossCents,
        expectedGrossCents:
          expectedTotalGrossCents,
      },
    );
  }

  validateMoneyIdentity(
    subtotalMoney,
    "Produkt-Warenwert",
  );

  validateMoneyIdentity(
    bookCoverMoney,
    "Buchhüllen",
  );

  validateMoneyIdentity(
    regularShippingMoney,
    "Reguläre Versandkosten",
  );

  validateMoneyIdentity(
    bookShippingMoneyTotal,
    "Buchversandkosten",
  );

  validateMoneyIdentity(
    discountMoneyTotal,
    "Rabatt",
  );

  validateMoneyIdentity(
    totalMoney,
    "Rechnungsgesamtbetrag",
  );

  if (
    regularShippingMoney.grossCents !==
    regularShippingGrossCents
  ) {
    fail(
      "REGULAR_SHIPPING_ALLOCATION_MISMATCH",
      "Die regulären Versandkosten wurden nicht vollständig aufgeteilt.",
    );
  }

  if (
    bookShippingMoneyTotal.grossCents !==
    bookShippingGrossCents
  ) {
    fail(
      "BOOK_SHIPPING_ALLOCATION_MISMATCH",
      "Die Buchversandkosten wurden nicht vollständig aufgeteilt.",
    );
  }

  if (
    discountMoneyTotal.grossCents !==
    discountGrossCents
  ) {
    fail(
      "DISCOUNT_ALLOCATION_MISMATCH",
      "Der Rabatt wurde nicht vollständig aufgeteilt.",
    );
  }

  const publicSubtotal =
    toPublicMoney(
      subtotalMoney,
    );

  const publicRegularShipping =
    toPublicMoney(
      regularShippingMoney,
    );

  const publicBookShipping =
    toPublicMoney(
      bookShippingMoneyTotal,
    );

  const publicBookCovers =
    toPublicMoney(
      bookCoverMoney,
    );

  const publicDiscount =
    toPublicMoney(
      discountMoneyTotal,
    );

  const publicTotal =
    toPublicMoney(
      totalMoney,
    );

  const breakdown:
    InvoiceTaxBreakdownSnapshot = {
      version:
        INVOICE_TAX_SNAPSHOT_VERSION,
      source:
        INVOICE_TAX_SNAPSHOT_SOURCE,
      generated_at:
        snapshotAt,
      currency:
        "EUR",
      rounding_method:
        "integer_cent_half_up_with_scoped_reduction_balance_v1",
      allocation_methods: {
        regular_shipping:
          "net_value_all_goods_v1",
        book_shipping:
          bookShippingAllocationScope ===
          "book_products_and_covers"
            ? "net_value_book_products_and_covers_v1"
            : "net_value_book_products_only_v1",
        discount:
          discountAllocationScope ===
          "products_and_book_covers"
            ? "gross_value_products_and_book_covers_v1"
            : "gross_value_products_only_v1",
      },
      rates:
        rateBreakdowns,
      totals: {
        subtotal:
          publicSubtotal,
        regular_shipping:
          publicRegularShipping,
        book_shipping:
          publicBookShipping,
        book_covers:
          publicBookCovers,
        discount:
          publicDiscount,
        total:
          publicTotal,
      },
    };

  const itemSnapshots:
    InvoiceTaxItemSnapshot[] =
      items.map(
        (item) => {
          const product = {
            taxRate:
              item.productTaxRate,
            ...toPublicMoney(
              item.productMoney,
            ),
          };

          const bookCover =
            item.bookCoverMoney &&
            item.bookCoverTaxRate
              ? {
                  taxRate:
                    item.bookCoverTaxRate,
                  ...toPublicMoney(
                    item.bookCoverMoney,
                  ),
                }
              : null;

          return {
            key:
              item.key,
            productId:
              item.productId,
            productName:
              item.productName,
            quantity:
              item.quantity,
            isBook:
              item.isBook,
            product,
            bookCover,
            snapshotPayload: {
              tax_rate_snapshot:
                item.productTaxRate,
              product_gross_amount_snapshot:
                product.gross,
              product_net_amount_snapshot:
                product.net,
              product_tax_amount_snapshot:
                product.tax,
              tax_snapshot_source:
                INVOICE_TAX_SNAPSHOT_SOURCE,
              tax_snapshot_version:
                INVOICE_TAX_SNAPSHOT_VERSION,
              tax_snapshot_at:
                snapshotAt,
              book_cover_tax_rate_snapshot:
                bookCover?.taxRate ?? null,
              book_cover_net_amount_snapshot:
                bookCover?.net ?? null,
              book_cover_tax_amount_snapshot:
                bookCover?.tax ?? null,
            },
          };
        },
      );

  return {
    version:
      INVOICE_TAX_SNAPSHOT_VERSION,
    source:
      INVOICE_TAX_SNAPSHOT_SOURCE,
    snapshotAt,
    currency:
      "EUR",
    items:
      itemSnapshots,
    breakdown,
    invoiceSnapshotPayload: {
      tax_snapshot_status:
        "complete",
      tax_snapshot_source:
        INVOICE_TAX_SNAPSHOT_SOURCE,
      tax_snapshot_version:
        INVOICE_TAX_SNAPSHOT_VERSION,
      tax_snapshot_at:
        snapshotAt,
      tax_breakdown_snapshot:
        breakdown,
      subtotal_net_amount_snapshot:
        publicSubtotal.net,
      subtotal_tax_amount_snapshot:
        publicSubtotal.tax,
      shipping_net_amount_snapshot:
        publicRegularShipping.net,
      shipping_tax_amount_snapshot:
        publicRegularShipping.tax,
      book_shipping_net_amount_snapshot:
        publicBookShipping.net,
      book_shipping_tax_amount_snapshot:
        publicBookShipping.tax,
      book_cover_net_amount_snapshot:
        publicBookCovers.net,
      book_cover_tax_amount_snapshot:
        publicBookCovers.tax,
      discount_net_amount_snapshot:
        publicDiscount.net,
      discount_tax_amount_snapshot:
        publicDiscount.tax,
      total_net_amount_snapshot:
        publicTotal.net,
      total_tax_amount_snapshot:
        publicTotal.tax,
    },
  };
}