/*
 * INVOICE_TAX_V2_SNAPSHOT_V1
 *
 * Persistierbare Snapshot-Schicht oberhalb des
 * Lexware-kompatiblen V2-Steuer-Allocators.
 *
 * Diese Datei:
 *
 * - berechnet keine Produktpreise,
 * - greift nicht auf den Produktkatalog zu,
 * - verteilt Versand oder Rabatte nicht fachlich,
 * - greift nicht auf Supabase zu,
 * - greift nicht auf Lexware zu,
 * - versendet keine E-Mail.
 *
 * Erwartet werden bereits fachlich zugeordnete Bruttoeinträge:
 *
 * - Produkte
 * - Buchhüllen
 * - regulärer Versand
 * - Buchversand
 * - Rabatte
 *
 * Der Allocator übernimmt anschließend:
 *
 * - Steuersatz-Gesamtrundung,
 * - centgenaue Netto-/Steuerverteilung,
 * - Lexware-kompatible Summenbildung.
 */

import {
  allocateInvoiceTaxV2,
  parseMoneyToCents,
  sumCents,
  type InvoiceTaxMoneyInput,
  type InvoiceTaxV2AllocatedEntry,
  type InvoiceTaxV2AllocationInput,
  type InvoiceTaxV2AllocationResult,
  type SupportedInvoiceTaxRateV2,
} from "@/lib/tax-v2";

export const INVOICE_TAX_SNAPSHOT_V2_VERSION =
  "invoice-tax-snapshot-v2" as const;

export const INVOICE_TAX_SNAPSHOT_V2_SOURCE =
  "product_catalog_at_checkout" as const;

export const INVOICE_TAX_SNAPSHOT_V2_ROUNDING_METHOD =
  "gross_tax_rate_total_with_deterministic_line_allocation_v1" as const;

export type InvoiceTaxSnapshotV2Component =
  | "product"
  | "book_cover"
  | "regular_shipping"
  | "book_shipping"
  | "discount";

export type InvoiceTaxSnapshotV2EntryInput = {
  /*
   * Innerhalb des Snapshots eindeutig.
   *
   * Beispiele:
   *
   * product:<invoice-item-id>
   * book-cover:<invoice-item-id>
   * regular-shipping:7
   * discount:19
   */
  key: string;

  component:
    InvoiceTaxSnapshotV2Component;

  taxRatePercentage:
    SupportedInvoiceTaxRateV2;

  /*
   * Produkte, Buchhüllen und Versand:
   * positiver Bruttobetrag.
   *
   * Rabatt:
   * negativer Bruttobetrag.
   */
  grossAmount:
    InvoiceTaxMoneyInput;

  /*
   * Für Produkt- und Buchhüllenpositionen erforderlich.
   *
   * Produkt und zugehörige Buchhülle verwenden denselben itemKey.
   */
  itemKey?:
    string | null;

  productId?:
    string | null;

  productName?:
    string | null;

  quantity?:
    number | string | null;

  isBook?:
    boolean | null;

  metadata?:
    Record<string, unknown>;
};

export type BuildInvoiceTaxSnapshotV2Input = {
  currency?:
    string | null;

  snapshotAt?:
    | string
    | Date
    | null;

  entries:
    InvoiceTaxSnapshotV2EntryInput[];
};

export type InvoiceTaxMoneyV2 = {
  gross: number;
  net: number;
  tax: number;
};

export type InvoiceTaxRatedMoneyV2 =
  InvoiceTaxMoneyV2 & {
    taxRate:
      SupportedInvoiceTaxRateV2;
  };

export type InvoiceTaxItemSnapshotPayloadV2 = {
  tax_rate_snapshot:
    SupportedInvoiceTaxRateV2;

  product_gross_amount_snapshot:
    number;

  product_net_amount_snapshot:
    number;

  product_tax_amount_snapshot:
    number;

  tax_snapshot_source:
    typeof INVOICE_TAX_SNAPSHOT_V2_SOURCE;

  tax_snapshot_version:
    typeof INVOICE_TAX_SNAPSHOT_V2_VERSION;

  tax_snapshot_at:
    string;

  book_cover_tax_rate_snapshot:
    | SupportedInvoiceTaxRateV2
    | null;

  book_cover_net_amount_snapshot:
    | number
    | null;

  book_cover_tax_amount_snapshot:
    | number
    | null;
};

export type InvoiceTaxItemSnapshotV2 = {
  key:
    string;

  productId:
    string;

  productName:
    string;

  quantity:
    number;

  isBook:
    boolean;

  product:
    InvoiceTaxRatedMoneyV2;

  bookCover:
    | InvoiceTaxRatedMoneyV2
    | null;

  snapshotPayload:
    InvoiceTaxItemSnapshotPayloadV2;
};

export type InvoiceTaxRateBreakdownV2 = {
  tax_rate:
    SupportedInvoiceTaxRateV2;

  products:
    InvoiceTaxMoneyV2;

  book_covers:
    InvoiceTaxMoneyV2;

  regular_shipping:
    InvoiceTaxMoneyV2;

  book_shipping:
    InvoiceTaxMoneyV2;

  /*
   * Rabatt wird hier wie in V1 positiv ausgewiesen.
   *
   * Im Allocator wird er als negativer Eintrag verarbeitet.
   */
  discount:
    InvoiceTaxMoneyV2;

  total:
    InvoiceTaxMoneyV2;
};

export type InvoiceTaxBreakdownSnapshotV2 = {
  version:
    typeof INVOICE_TAX_SNAPSHOT_V2_VERSION;

  source:
    typeof INVOICE_TAX_SNAPSHOT_V2_SOURCE;

  generated_at:
    string;

  currency:
    "EUR";

  rounding_method:
    typeof INVOICE_TAX_SNAPSHOT_V2_ROUNDING_METHOD;

  allocation_methods: {
    regular_shipping:
      "preallocated_by_checkout_adapter_v2";

    book_shipping:
      "preallocated_by_checkout_adapter_v2";

    discount:
      "preallocated_by_checkout_adapter_v2";
  };

  rates:
    InvoiceTaxRateBreakdownV2[];

  totals: {
    subtotal:
      InvoiceTaxMoneyV2;

    regular_shipping:
      InvoiceTaxMoneyV2;

    book_shipping:
      InvoiceTaxMoneyV2;

    book_covers:
      InvoiceTaxMoneyV2;

    discount:
      InvoiceTaxMoneyV2;

    total:
      InvoiceTaxMoneyV2;
  };
};

export type InvoiceTaxSnapshotPayloadV2 = {
  tax_snapshot_status:
    "complete";

  tax_snapshot_source:
    typeof INVOICE_TAX_SNAPSHOT_V2_SOURCE;

  tax_snapshot_version:
    typeof INVOICE_TAX_SNAPSHOT_V2_VERSION;

  tax_snapshot_at:
    string;

  tax_breakdown_snapshot:
    InvoiceTaxBreakdownSnapshotV2;

  subtotal_net_amount_snapshot:
    number;

  subtotal_tax_amount_snapshot:
    number;

  shipping_net_amount_snapshot:
    number;

  shipping_tax_amount_snapshot:
    number;

  book_shipping_net_amount_snapshot:
    number;

  book_shipping_tax_amount_snapshot:
    number;

  book_cover_net_amount_snapshot:
    number;

  book_cover_tax_amount_snapshot:
    number;

  discount_net_amount_snapshot:
    number;

  discount_tax_amount_snapshot:
    number;

  total_net_amount_snapshot:
    number;

  total_tax_amount_snapshot:
    number;
};

export type InvoiceTaxSnapshotV2Result = {
  version:
    typeof INVOICE_TAX_SNAPSHOT_V2_VERSION;

  source:
    typeof INVOICE_TAX_SNAPSHOT_V2_SOURCE;

  snapshotAt:
    string;

  currency:
    "EUR";

  items:
    InvoiceTaxItemSnapshotV2[];

  breakdown:
    InvoiceTaxBreakdownSnapshotV2;

  invoiceSnapshotPayload:
    InvoiceTaxSnapshotPayloadV2;

  allocator:
    InvoiceTaxV2AllocationResult;

  diagnostics: {
    inputEntryCount:
      number;

    itemCount:
      number;

    rateCount:
      number;

    allInvariantsPassed:
      boolean;

    invariants: {
      uniqueInputKeys:
        boolean;

      everyProductHasItemData:
        boolean;

      everyCoverHasProduct:
        boolean;

      componentSumsMatchAllocator:
        boolean;

      rateSumsMatchAllocator:
        boolean;

      itemProductSumsMatchSubtotal:
        boolean;

      itemCoverSumsMatchBookCovers:
        boolean;

      totalMoneyIdentityValid:
        boolean;
    };
  };
};

export class InvoiceTaxSnapshotV2Error
  extends Error {
  readonly code:
    string;

  readonly details:
    Record<string, unknown> | null;

  constructor(
    code: string,
    message: string,
    details?:
      Record<string, unknown>,
  ) {
    super(message);

    this.name =
      "InvoiceTaxSnapshotV2Error";

    this.code =
      code;

    this.details =
      details ??
      null;
  }
}

type NormalizedSnapshotEntry = {
  originalIndex:
    number;

  key:
    string;

  component:
    InvoiceTaxSnapshotV2Component;

  taxRatePercentage:
    SupportedInvoiceTaxRateV2;

  grossAmount:
    InvoiceTaxMoneyInput;

  itemKey:
    string | null;

  productId:
    string | null;

  productName:
    string | null;

  quantity:
    number | null;

  isBook:
    boolean;

  metadata:
    Record<string, unknown> | null;
};

type ItemGroup = {
  itemKey:
    string;

  product:
    {
      source:
        NormalizedSnapshotEntry;

      allocated:
        InvoiceTaxV2AllocatedEntry;
    } | null;

  bookCover:
    {
      source:
        NormalizedSnapshotEntry;

      allocated:
        InvoiceTaxV2AllocatedEntry;
    } | null;
};

const SUPPORTED_COMPONENTS =
  new Set<InvoiceTaxSnapshotV2Component>([
    "product",
    "book_cover",
    "regular_shipping",
    "book_shipping",
    "discount",
  ]);

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value ===
      "object" &&
    value !==
      null &&
    !Array.isArray(value)
  );
}

function cleanText(
  value: unknown,
) {
  const text =
    String(
      value ??
      "",
    ).trim();

  return text.length > 0
    ? text
    : null;
}

function fail(
  code: string,
  message: string,
  details?:
    Record<string, unknown>,
): never {
  throw new InvoiceTaxSnapshotV2Error(
    code,
    message,
    details,
  );
}

function normalizeCurrency(
  value: unknown,
): "EUR" {
  const currency =
    cleanText(value)
      ?.toUpperCase() ||
    "EUR";

  if (
    currency !==
    "EUR"
  ) {
    fail(
      "CURRENCY_NOT_SUPPORTED",
      "Der Steuer-Snapshot V2 unterstützt ausschließlich EUR.",
      {
        receivedCurrency:
          currency,
      },
    );
  }

  return "EUR";
}

function normalizeSnapshotAt(
  value:
    BuildInvoiceTaxSnapshotV2Input["snapshotAt"],
) {
  if (
    value instanceof
    Date
  ) {
    if (
      !Number.isFinite(
        value.getTime(),
      )
    ) {
      fail(
        "SNAPSHOT_AT_INVALID",
        "Der Snapshot-Zeitpunkt ist ungültig.",
      );
    }

    return value.toISOString();
  }

  const text =
    cleanText(value);

  if (!text) {
    return new Date()
      .toISOString();
  }

  const timestamp =
    Date.parse(text);

  if (
    !Number.isFinite(
      timestamp,
    )
  ) {
    fail(
      "SNAPSHOT_AT_INVALID",
      "Der Snapshot-Zeitpunkt ist ungültig.",
      {
        snapshotAt:
          text,
      },
    );
  }

  return new Date(
    timestamp,
  ).toISOString();
}

function requireComponent(
  value: unknown,
  key: string,
): InvoiceTaxSnapshotV2Component {
  const component =
    cleanText(value) as
      | InvoiceTaxSnapshotV2Component
      | null;

  if (
    !component ||
    !SUPPORTED_COMPONENTS.has(
      component,
    )
  ) {
    fail(
      "COMPONENT_INVALID",
      `Der Snapshot-Eintrag ${key} besitzt keine gültige Komponente.`,
      {
        key,
        receivedComponent:
          value,
      },
    );
  }

  return component;
}

function requireTaxRate(
  value: unknown,
  key: string,
): SupportedInvoiceTaxRateV2 {
  const parsed =
    Number(value);

  if (
    parsed !== 7 &&
    parsed !== 19
  ) {
    fail(
      "TAX_RATE_NOT_SUPPORTED",
      `Der Snapshot-Eintrag ${key} besitzt keinen unterstützten Steuersatz.`,
      {
        key,
        receivedTaxRate:
          value,
      },
    );
  }

  return parsed;
}

function normalizeQuantity(
  value: unknown,
  key: string,
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
      "QUANTITY_INVALID",
      `Die Menge des Snapshot-Eintrags ${key} muss eine ganze Zahl zwischen 1 und 9999 sein.`,
      {
        key,
        receivedQuantity:
          value,
      },
    );
  }

  return parsed;
}

function normalizeEntries(
  entries:
    InvoiceTaxSnapshotV2EntryInput[],
) {
  if (
    !Array.isArray(entries) ||
    entries.length === 0
  ) {
    fail(
      "ENTRIES_EMPTY",
      "Der Steuer-Snapshot V2 benötigt mindestens einen Eintrag.",
    );
  }

  if (
    entries.length > 5_000
  ) {
    fail(
      "TOO_MANY_ENTRIES",
      "Der Steuer-Snapshot V2 enthält ungewöhnlich viele Einträge.",
      {
        entryCount:
          entries.length,
      },
    );
  }

  const seenKeys =
    new Set<string>();

  return entries.map(
    (
      rawEntry,
      originalIndex,
    ): NormalizedSnapshotEntry => {
      if (
        !isRecord(rawEntry)
      ) {
        fail(
          "ENTRY_INVALID",
          `Der Snapshot-Eintrag ${originalIndex + 1} besitzt kein gültiges Objektformat.`,
          {
            originalIndex,
          },
        );
      }

      const entry =
        rawEntry as unknown as
          InvoiceTaxSnapshotV2EntryInput;

      const key =
        cleanText(entry.key);

      if (!key) {
        fail(
          "ENTRY_KEY_MISSING",
          `Der Snapshot-Eintrag ${originalIndex + 1} besitzt keinen Schlüssel.`,
          {
            originalIndex,
          },
        );
      }

      if (
        seenKeys.has(key)
      ) {
        fail(
          "ENTRY_KEY_DUPLICATE",
          `Der Snapshot-Schlüssel ${key} ist mehrfach vorhanden.`,
          {
            key,
          },
        );
      }

      seenKeys.add(key);

      const component =
        requireComponent(
          entry.component,
          key,
        );

      const taxRatePercentage =
        requireTaxRate(
          entry.taxRatePercentage,
          key,
        );

      /*
       * Frühzeitige Geldvalidierung.
       *
       * Die endgültige Verarbeitung erfolgt danach
       * weiterhin im zentralen V2-Allocator.
       */
      const grossCents =
        parseMoneyToCents(
          entry.grossAmount,
          {
            fieldName:
              "grossAmount",
            entryKey:
              key,
          },
        );

      if (
        component ===
          "discount" &&
        grossCents > 0n
      ) {
        fail(
          "DISCOUNT_MUST_BE_NEGATIVE",
          `Der Rabatt-Eintrag ${key} muss als negativer Bruttobetrag übergeben werden.`,
          {
            key,
            grossAmount:
              entry.grossAmount,
          },
        );
      }

      if (
        component !==
          "discount" &&
        grossCents < 0n
      ) {
        fail(
          "NON_DISCOUNT_MUST_NOT_BE_NEGATIVE",
          `Der Snapshot-Eintrag ${key} darf keinen negativen Bruttobetrag besitzen.`,
          {
            key,
            component,
            grossAmount:
              entry.grossAmount,
          },
        );
      }

      const itemKey =
        cleanText(
          entry.itemKey,
        );

      const isItemComponent =
        component ===
          "product" ||
        component ===
          "book_cover";

      if (
        isItemComponent &&
        !itemKey
      ) {
        fail(
          "ITEM_KEY_REQUIRED",
          `Für den Snapshot-Eintrag ${key} fehlt der zugehörige Positionsschlüssel.`,
          {
            key,
            component,
          },
        );
      }

      if (
        !isItemComponent &&
        itemKey
      ) {
        fail(
          "ITEM_KEY_NOT_ALLOWED",
          `Der Snapshot-Eintrag ${key} darf keinen Positionsschlüssel besitzen.`,
          {
            key,
            component,
            itemKey,
          },
        );
      }

      const productId =
        cleanText(
          entry.productId,
        );

      const productName =
        cleanText(
          entry.productName,
        );

      const quantity =
        component ===
          "product"
          ? normalizeQuantity(
              entry.quantity,
              key,
            )
          : null;

      if (
        component ===
          "product" &&
        (
          !productId ||
          !productName
        )
      ) {
        fail(
          "PRODUCT_DATA_REQUIRED",
          `Für den Produkt-Snapshot ${key} fehlen Produkt-ID oder Produktname.`,
          {
            key,
            productId,
            productName,
          },
        );
      }

      return {
        originalIndex,
        key,
        component,
        taxRatePercentage,
        grossAmount:
          entry.grossAmount,
        itemKey,
        productId,
        productName,
        quantity,
        isBook:
          entry.isBook ===
          true,
        metadata:
          isRecord(
            entry.metadata,
          )
            ? {
                ...entry.metadata,
              }
            : null,
      };
    },
  );
}

function toAllocatorKind(
  component:
    InvoiceTaxSnapshotV2Component,
) {
  switch (component) {
    case "product":
      return "product" as const;

    case "book_cover":
      return "book_cover" as const;

    case "regular_shipping":
      return "regular_shipping" as const;

    case "book_shipping":
      return "book_shipping" as const;

    case "discount":
      return "discount" as const;
  }
}

function toAllocatorInputs(
  entries:
    NormalizedSnapshotEntry[],
): InvoiceTaxV2AllocationInput[] {
  return entries.map(
    (entry) => ({
      key:
        entry.key,

      kind:
        toAllocatorKind(
          entry.component,
        ),

      taxRatePercentage:
        entry.taxRatePercentage,

      grossAmount:
        entry.grossAmount,

      metadata: {
        component:
          entry.component,

        itemKey:
          entry.itemKey,

        productId:
          entry.productId,

        productName:
          entry.productName,

        quantity:
          entry.quantity,

        isBook:
          entry.isBook,

        originalIndex:
          entry.originalIndex,

        ...(
          entry.metadata ||
          {}
        ),
      },
    }),
  );
}

function emptyMoney(): InvoiceTaxMoneyV2 {
  return {
    gross:
      0,
    net:
      0,
    tax:
      0,
  };
}

function moneyToCents(
  money:
    InvoiceTaxMoneyV2,
) {
  return {
    gross:
      parseMoneyToCents(
        money.gross,
      ),

    net:
      parseMoneyToCents(
        money.net,
      ),

    tax:
      parseMoneyToCents(
        money.tax,
      ),
  };
}

function centsToMoney(
  gross:
    bigint,
  net:
    bigint,
  tax:
    bigint,
): InvoiceTaxMoneyV2 {
  const toAmount =
    (value: bigint) => {
      const numeric =
        Number(value);

      if (
        !Number.isSafeInteger(
          numeric,
        )
      ) {
        fail(
          "MONEY_RESULT_OUT_OF_RANGE",
          "Ein berechneter Snapshot-Betrag liegt außerhalb des sicheren Zahlenbereichs.",
          {
            cents:
              value.toString(),
          },
        );
      }

      return numeric /
        100;
    };

  return {
    gross:
      toAmount(gross),

    net:
      toAmount(net),

    tax:
      toAmount(tax),
  };
}

function addMoney(
  values:
    InvoiceTaxMoneyV2[],
) {
  const gross =
    sumCents(
      values.map(
        (value) =>
          moneyToCents(value)
            .gross,
      ),
    );

  const net =
    sumCents(
      values.map(
        (value) =>
          moneyToCents(value)
            .net,
      ),
    );

  const tax =
    sumCents(
      values.map(
        (value) =>
          moneyToCents(value)
            .tax,
      ),
    );

  return centsToMoney(
    gross,
    net,
    tax,
  );
}

function negateAllocatedMoney(
  entry:
    InvoiceTaxV2AllocatedEntry,
): InvoiceTaxMoneyV2 {
  return {
    gross:
      Math.abs(
        entry.grossAmount,
      ),

    net:
      Math.abs(
        entry.netAmount,
      ),

    tax:
      Math.abs(
        entry.taxAmount,
      ),
  };
}

function allocatedEntryToMoney(
  entry:
    InvoiceTaxV2AllocatedEntry,
): InvoiceTaxMoneyV2 {
  return {
    gross:
      entry.grossAmount,

    net:
      entry.netAmount,

    tax:
      entry.taxAmount,
  };
}

function moneyEquals(
  left:
    InvoiceTaxMoneyV2,

  right:
    InvoiceTaxMoneyV2,
) {
  const leftCents =
    moneyToCents(left);

  const rightCents =
    moneyToCents(right);

  return (
    leftCents.gross ===
      rightCents.gross &&
    leftCents.net ===
      rightCents.net &&
    leftCents.tax ===
      rightCents.tax
  );
}

function assertMoneyIdentity(
  money:
    InvoiceTaxMoneyV2,

  label:
    string,
) {
  const cents =
    moneyToCents(
      money,
    );

  if (
    cents.net +
      cents.tax !==
    cents.gross
  ) {
    fail(
      "MONEY_IDENTITY_INVALID",
      `${label}: Netto plus Steuer entspricht nicht Brutto.`,
      {
        money,
      },
    );
  }
}

function groupAllocatedEntries(
  normalizedEntries:
    NormalizedSnapshotEntry[],

  allocator:
    InvoiceTaxV2AllocationResult,
) {
  const sourceByKey =
    new Map(
      normalizedEntries.map(
        (entry) => [
          entry.key,
          entry,
        ] as const,
      ),
    );

  const allocatedEntries =
    allocator.rates.flatMap(
      (rate) =>
        rate.entries,
    );

  const groups =
    new Map<
      string,
      ItemGroup
    >();

  for (
    const allocated of
    allocatedEntries
  ) {
    const source =
      sourceByKey.get(
        allocated.key,
      );

    if (!source) {
      fail(
        "ALLOCATOR_ENTRY_SOURCE_MISSING",
        `Für den Allocator-Eintrag ${allocated.key} fehlt der ursprüngliche Snapshot-Eintrag.`,
        {
          key:
            allocated.key,
        },
      );
    }

    if (
      source.component !==
        "product" &&
      source.component !==
        "book_cover"
    ) {
      continue;
    }

    const itemKey =
      source.itemKey;

    if (!itemKey) {
      fail(
        "ALLOCATOR_ITEM_KEY_MISSING",
        `Für den Allocator-Eintrag ${allocated.key} fehlt der Positionsschlüssel.`,
        {
          key:
            allocated.key,
        },
      );
    }

    const group =
      groups.get(itemKey) || {
        itemKey,
        product:
          null,
        bookCover:
          null,
      };

    if (
      source.component ===
      "product"
    ) {
      if (group.product) {
        fail(
          "DUPLICATE_PRODUCT_ENTRY",
          `Für die Rechnungsposition ${itemKey} existieren mehrere Produkt-Steuereinträge.`,
          {
            itemKey,
          },
        );
      }

      group.product = {
        source,
        allocated,
      };
    } else {
      if (group.bookCover) {
        fail(
          "DUPLICATE_BOOK_COVER_ENTRY",
          `Für die Rechnungsposition ${itemKey} existieren mehrere Buchhüllen-Steuereinträge.`,
          {
            itemKey,
          },
        );
      }

      group.bookCover = {
        source,
        allocated,
      };
    }

    groups.set(
      itemKey,
      group,
    );
  }

  return {
    sourceByKey,
    allocatedEntries,
    groups,
  };
}

function buildItemSnapshots(
  groups:
    Map<string, ItemGroup>,

  snapshotAt:
    string,
) {
  const items:
    InvoiceTaxItemSnapshotV2[] =
      [];

  for (
    const group of
    groups.values()
  ) {
    if (!group.product) {
      fail(
        "BOOK_COVER_WITHOUT_PRODUCT",
        `Die Rechnungsposition ${group.itemKey} besitzt eine Buchhülle, aber keinen Produkt-Steuereintrag.`,
        {
          itemKey:
            group.itemKey,
        },
      );
    }

    const productSource =
      group.product.source;

    const productAllocated =
      group.product.allocated;

    if (
      !productSource.productId ||
      !productSource.productName ||
      !productSource.quantity
    ) {
      fail(
        "PRODUCT_SNAPSHOT_DATA_INCOMPLETE",
        `Die Produktdaten der Rechnungsposition ${group.itemKey} sind unvollständig.`,
        {
          itemKey:
            group.itemKey,
        },
      );
    }

    const product:
      InvoiceTaxRatedMoneyV2 = {
        taxRate:
          productAllocated
            .taxRatePercentage,

        gross:
          productAllocated
            .grossAmount,

        net:
          productAllocated
            .netAmount,

        tax:
          productAllocated
            .taxAmount,
      };

    const bookCover:
      InvoiceTaxRatedMoneyV2 |
      null =
        group.bookCover
          ? {
              taxRate:
                group.bookCover
                  .allocated
                  .taxRatePercentage,

              gross:
                group.bookCover
                  .allocated
                  .grossAmount,

              net:
                group.bookCover
                  .allocated
                  .netAmount,

              tax:
                group.bookCover
                  .allocated
                  .taxAmount,
            }
          : null;

    assertMoneyIdentity(
      product,
      `Produktposition ${productSource.productName}`,
    );

    if (bookCover) {
      assertMoneyIdentity(
        bookCover,
        `Buchhülle zu ${productSource.productName}`,
      );
    }

    items.push({
      key:
        group.itemKey,

      productId:
        productSource.productId,

      productName:
        productSource.productName,

      quantity:
        productSource.quantity,

      isBook:
        productSource.isBook,

      product,

      bookCover,

      snapshotPayload: {
        tax_rate_snapshot:
          product.taxRate,

        product_gross_amount_snapshot:
          product.gross,

        product_net_amount_snapshot:
          product.net,

        product_tax_amount_snapshot:
          product.tax,

        tax_snapshot_source:
          INVOICE_TAX_SNAPSHOT_V2_SOURCE,

        tax_snapshot_version:
          INVOICE_TAX_SNAPSHOT_V2_VERSION,

        tax_snapshot_at:
          snapshotAt,

        book_cover_tax_rate_snapshot:
          bookCover?.taxRate ??
          null,

        book_cover_net_amount_snapshot:
          bookCover?.net ??
          null,

        book_cover_tax_amount_snapshot:
          bookCover?.tax ??
          null,
      },
    });
  }

  return items;
}

function buildRateBreakdowns(
  normalizedEntries:
    NormalizedSnapshotEntry[],

  allocator:
    InvoiceTaxV2AllocationResult,
) {
  const componentByKey =
    new Map(
      normalizedEntries.map(
        (entry) => [
          entry.key,
          entry.component,
        ] as const,
      ),
    );

  return allocator.rates.map(
    (
      rate,
    ): InvoiceTaxRateBreakdownV2 => {
      const entriesByComponent =
        (
          component:
            InvoiceTaxSnapshotV2Component,
        ) =>
          rate.entries.filter(
            (entry) =>
              componentByKey.get(
                entry.key,
              ) ===
              component,
          );

      const products =
        addMoney(
          entriesByComponent(
            "product",
          ).map(
            allocatedEntryToMoney,
          ),
        );

      const bookCovers =
        addMoney(
          entriesByComponent(
            "book_cover",
          ).map(
            allocatedEntryToMoney,
          ),
        );

      const regularShipping =
        addMoney(
          entriesByComponent(
            "regular_shipping",
          ).map(
            allocatedEntryToMoney,
          ),
        );

      const bookShipping =
        addMoney(
          entriesByComponent(
            "book_shipping",
          ).map(
            allocatedEntryToMoney,
          ),
        );

      const discount =
        addMoney(
          entriesByComponent(
            "discount",
          ).map(
            negateAllocatedMoney,
          ),
        );

      const positiveComponents =
        addMoney([
          products,
          bookCovers,
          regularShipping,
          bookShipping,
        ]);

      const positiveCents =
        moneyToCents(
          positiveComponents,
        );

      const discountCents =
        moneyToCents(
          discount,
        );

      const total =
        centsToMoney(
          positiveCents.gross -
            discountCents.gross,

          positiveCents.net -
            discountCents.net,

          positiveCents.tax -
            discountCents.tax,
        );

      const allocatorTotal:
        InvoiceTaxMoneyV2 = {
          gross:
            rate.grossAmount,

          net:
            rate.netAmount,

          tax:
            rate.taxAmount,
        };

      if (
        !moneyEquals(
          total,
          allocatorTotal,
        )
      ) {
        fail(
          "RATE_COMPONENT_SUM_MISMATCH",
          `Die Komponentensummen für ${rate.taxRatePercentage} % stimmen nicht mit dem Allocator-Ergebnis überein.`,
          {
            taxRatePercentage:
              rate.taxRatePercentage,

            componentTotal:
              total,

            allocatorTotal,
          },
        );
      }

      return {
        tax_rate:
          rate.taxRatePercentage,

        products,

        book_covers:
          bookCovers,

        regular_shipping:
          regularShipping,

        book_shipping:
          bookShipping,

        discount,

        total,
      };
    },
  );
}

export function buildInvoiceTaxSnapshotV2(
  input:
    BuildInvoiceTaxSnapshotV2Input,
): InvoiceTaxSnapshotV2Result {
  if (
    !isRecord(input)
  ) {
    fail(
      "INPUT_INVALID",
      "Die Eingabe für den Steuer-Snapshot V2 besitzt kein gültiges Objektformat.",
    );
  }

  const currency =
    normalizeCurrency(
      input.currency,
    );

  const snapshotAt =
    normalizeSnapshotAt(
      input.snapshotAt,
    );

  const normalizedEntries =
    normalizeEntries(
      input.entries,
    );

  const allocator =
    allocateInvoiceTaxV2(
      toAllocatorInputs(
        normalizedEntries,
      ),
    );

  const {
    allocatedEntries,
    groups,
  } =
    groupAllocatedEntries(
      normalizedEntries,
      allocator,
    );

  const items =
    buildItemSnapshots(
      groups,
      snapshotAt,
    );

  const rates =
    buildRateBreakdowns(
      normalizedEntries,
      allocator,
    );

  const subtotal =
    addMoney(
      rates.map(
        (rate) =>
          rate.products,
      ),
    );

  const regularShipping =
    addMoney(
      rates.map(
        (rate) =>
          rate.regular_shipping,
      ),
    );

  const bookShipping =
    addMoney(
      rates.map(
        (rate) =>
          rate.book_shipping,
      ),
    );

  const bookCovers =
    addMoney(
      rates.map(
        (rate) =>
          rate.book_covers,
      ),
    );

  const discount =
    addMoney(
      rates.map(
        (rate) =>
          rate.discount,
      ),
    );

  const total =
    addMoney(
      rates.map(
        (rate) =>
          rate.total,
      ),
    );

  const allocatorTotal:
    InvoiceTaxMoneyV2 = {
      gross:
        allocator.total
          .grossAmount,

      net:
        allocator.total
          .netAmount,

      tax:
        allocator.total
          .taxAmount,
  };

  if (
    !moneyEquals(
      total,
      allocatorTotal,
    )
  ) {
    fail(
      "TOTAL_COMPONENT_SUM_MISMATCH",
      "Die Rechnungskomponenten stimmen nicht mit dem Gesamtwert des V2-Allocators überein.",
      {
        componentTotal:
          total,

        allocatorTotal,
      },
    );
  }

  const itemProductMoney =
    addMoney(
      items.map(
        (item) => ({
          gross:
            item.product.gross,

          net:
            item.product.net,

          tax:
            item.product.tax,
        }),
      ),
    );

  const itemCoverMoney =
    addMoney(
      items
        .filter(
          (
            item,
          ) =>
            item.bookCover !==
            null,
        )
        .map(
          (item) => ({
            gross:
              item.bookCover
                ?.gross ??
              0,

            net:
              item.bookCover
                ?.net ??
              0,

            tax:
              item.bookCover
                ?.tax ??
              0,
          }),
        ),
    );

  const uniqueInputKeys =
    new Set(
      normalizedEntries.map(
        (entry) =>
          entry.key,
      ),
    ).size ===
    normalizedEntries.length;

  const everyProductHasItemData =
    normalizedEntries
      .filter(
        (entry) =>
          entry.component ===
          "product",
      )
      .every(
        (entry) =>
          Boolean(
            entry.itemKey &&
            entry.productId &&
            entry.productName &&
            entry.quantity,
          ),
      );

  const everyCoverHasProduct =
    Array.from(
      groups.values(),
    ).every(
      (group) =>
        !group.bookCover ||
        Boolean(
          group.product,
        ),
    );

  const componentSumsMatchAllocator =
    moneyEquals(
      total,
      allocatorTotal,
    );

  const rateSumsMatchAllocator =
    rates.every(
      (rate) => {
        const allocatorRate =
          allocator.rates.find(
            (entry) =>
              entry.taxRatePercentage ===
              rate.tax_rate,
          );

        return Boolean(
          allocatorRate &&
          moneyEquals(
            rate.total,
            {
              gross:
                allocatorRate.grossAmount,

              net:
                allocatorRate.netAmount,

              tax:
                allocatorRate.taxAmount,
            },
          ),
        );
      },
    );

  const itemProductSumsMatchSubtotal =
    moneyEquals(
      itemProductMoney,
      subtotal,
    );

  const itemCoverSumsMatchBookCovers =
    moneyEquals(
      itemCoverMoney,
      bookCovers,
    );

  const totalCents =
    moneyToCents(
      total,
    );

  const totalMoneyIdentityValid =
    totalCents.net +
      totalCents.tax ===
    totalCents.gross;

  const invariants = {
    uniqueInputKeys,

    everyProductHasItemData,

    everyCoverHasProduct,

    componentSumsMatchAllocator,

    rateSumsMatchAllocator,

    itemProductSumsMatchSubtotal,

    itemCoverSumsMatchBookCovers,

    totalMoneyIdentityValid,
  };

  const failedInvariants =
    Object.entries(
      invariants,
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
    failedInvariants.length >
    0
  ) {
    fail(
      "SNAPSHOT_INVARIANT_FAILED",
      "Der Steuer-Snapshot V2 verletzt mindestens eine interne Konsistenzregel.",
      {
        failedInvariants,
      },
    );
  }

  assertMoneyIdentity(
    subtotal,
    "Produkt-Zwischensumme",
  );

  assertMoneyIdentity(
    regularShipping,
    "Regulärer Versand",
  );

  assertMoneyIdentity(
    bookShipping,
    "Buchversand",
  );

  assertMoneyIdentity(
    bookCovers,
    "Buchhüllen",
  );

  assertMoneyIdentity(
    discount,
    "Rabatt",
  );

  assertMoneyIdentity(
    total,
    "Rechnungsgesamtbetrag",
  );

  const breakdown:
    InvoiceTaxBreakdownSnapshotV2 = {
      version:
        INVOICE_TAX_SNAPSHOT_V2_VERSION,

      source:
        INVOICE_TAX_SNAPSHOT_V2_SOURCE,

      generated_at:
        snapshotAt,

      currency,

      rounding_method:
        INVOICE_TAX_SNAPSHOT_V2_ROUNDING_METHOD,

      allocation_methods: {
        regular_shipping:
          "preallocated_by_checkout_adapter_v2",

        book_shipping:
          "preallocated_by_checkout_adapter_v2",

        discount:
          "preallocated_by_checkout_adapter_v2",
      },

      rates,

      totals: {
        subtotal,

        regular_shipping:
          regularShipping,

        book_shipping:
          bookShipping,

        book_covers:
          bookCovers,

        discount,

        total,
      },
    };

  return {
    version:
      INVOICE_TAX_SNAPSHOT_V2_VERSION,

    source:
      INVOICE_TAX_SNAPSHOT_V2_SOURCE,

    snapshotAt,

    currency,

    items,

    breakdown,

    invoiceSnapshotPayload: {
      tax_snapshot_status:
        "complete",

      tax_snapshot_source:
        INVOICE_TAX_SNAPSHOT_V2_SOURCE,

      tax_snapshot_version:
        INVOICE_TAX_SNAPSHOT_V2_VERSION,

      tax_snapshot_at:
        snapshotAt,

      tax_breakdown_snapshot:
        breakdown,

      subtotal_net_amount_snapshot:
        subtotal.net,

      subtotal_tax_amount_snapshot:
        subtotal.tax,

      shipping_net_amount_snapshot:
        regularShipping.net,

      shipping_tax_amount_snapshot:
        regularShipping.tax,

      book_shipping_net_amount_snapshot:
        bookShipping.net,

      book_shipping_tax_amount_snapshot:
        bookShipping.tax,

      book_cover_net_amount_snapshot:
        bookCovers.net,

      book_cover_tax_amount_snapshot:
        bookCovers.tax,

      discount_net_amount_snapshot:
        discount.net,

      discount_tax_amount_snapshot:
        discount.tax,

      total_net_amount_snapshot:
        total.net,

      total_tax_amount_snapshot:
        total.tax,
    },

    allocator,

    diagnostics: {
      inputEntryCount:
        normalizedEntries.length,

      itemCount:
        items.length,

      rateCount:
        rates.length,

      allInvariantsPassed:
        true,

      invariants,
    },
  };
}