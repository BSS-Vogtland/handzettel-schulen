/*
 * INVOICE_TAX_V2_ALLOCATOR_V1
 *
 * Deterministische Verteilung der Lexware-kompatiblen
 * Steuersatz-Gesamtsummen auf einzelne Rechnungspositionen.
 *
 * Vorgehen:
 *
 * 1. Bruttobeträge je Steuersatz summieren.
 * 2. Netto einmal aus der gesamten Steuersatz-Bruttosumme berechnen.
 * 3. Für jede Position einen zunächst abgerundeten Netto-Centbetrag bilden.
 * 4. Die Differenz zum Steuersatz-Gesamtnetto centweise verteilen.
 *
 * Dadurch gilt:
 *
 * - Summe Positionsbrutto = Steuersatz-Brutto
 * - Summe Positionsnetto = Steuersatz-Netto
 * - Summe Positionssteuer = Steuersatz-Steuer
 */

import {
  centsToAmount,
  parseMoneyToCents,
  sumCents,
  type InvoiceTaxMoneyInput,
} from "@/lib/tax-v2/money";

import {
  calculateExactNetFraction,
  calculateNetFromGrossCents,
} from "@/lib/tax-v2/rounding";

export const INVOICE_TAX_V2_ALLOCATOR_VERSION =
  "invoice-tax-v2-allocator-v1" as const;

export type SupportedInvoiceTaxRateV2 =
  | 7
  | 19;

export type InvoiceTaxV2EntryKind =
  | "product"
  | "book_cover"
  | "regular_shipping"
  | "book_shipping"
  | "discount"
  | "other";

export type InvoiceTaxV2AllocationInput = {
  key: string;

  kind:
    InvoiceTaxV2EntryKind;

  taxRatePercentage:
    SupportedInvoiceTaxRateV2;

  grossAmount:
    InvoiceTaxMoneyInput;

  metadata?:
    Record<string, unknown>;
};

export type InvoiceTaxV2AllocatedEntry = {
  key: string;

  kind:
    InvoiceTaxV2EntryKind;

  taxRatePercentage:
    SupportedInvoiceTaxRateV2;

  grossAmount:
    number;

  netAmount:
    number;

  taxAmount:
    number;

  allocation: {
    truncatedNetAmount:
      number;

    netAdjustmentCents:
      number;

    exactNetRemainderNumerator:
      string;

    exactNetRemainderDenominator:
      string;

    allocationOrder:
      number | null;
  };

  metadata:
    Record<string, unknown> | null;
};

export type InvoiceTaxV2RateAllocation = {
  taxRatePercentage:
    SupportedInvoiceTaxRateV2;

  entryCount:
    number;

  grossAmount:
    number;

  netAmount:
    number;

  taxAmount:
    number;

  roundingAdjustmentCents:
    number;

  entries:
    InvoiceTaxV2AllocatedEntry[];
};

export type InvoiceTaxV2AllocationResult = {
  version:
    typeof INVOICE_TAX_V2_ALLOCATOR_VERSION;

  rates:
    InvoiceTaxV2RateAllocation[];

  total: {
    grossAmount:
      number;

    netAmount:
      number;

    taxAmount:
      number;
  };

  diagnostics: {
    entryCount:
      number;

    taxRateCount:
      number;

    totalRoundingAdjustmentCents:
      number;

    invariants: {
      uniqueKeys:
        boolean;

      everyEntryMoneyIdentityValid:
        boolean;

      everyRateMoneyIdentityValid:
        boolean;

      totalMoneyIdentityValid:
        boolean;

      entrySumsMatchRateSums:
        boolean;
    };
  };
};

export class InvoiceTaxV2AllocatorError
  extends Error {
  readonly code:
    string;

  readonly details:
    Record<string, unknown> | null;

  constructor(
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);

    this.name =
      "InvoiceTaxV2AllocatorError";

    this.code =
      code;

    this.details =
      details ?? null;
  }
}

type NormalizedAllocationEntry = {
  originalIndex:
    number;

  key:
    string;

  kind:
    InvoiceTaxV2EntryKind;

  taxRatePercentage:
    SupportedInvoiceTaxRateV2;

  grossCents:
    bigint;

  metadata:
    Record<string, unknown> | null;
};

type InternalAllocatedEntry = {
  source:
    NormalizedAllocationEntry;

  truncatedNetCents:
    bigint;

  finalNetCents:
    bigint;

  finalTaxCents:
    bigint;

  remainderNumerator:
    bigint;

  remainderDenominator:
    bigint;

  adjustmentCents:
    bigint;

  allocationOrder:
    number | null;
};

const SUPPORTED_ENTRY_KINDS =
  new Set<InvoiceTaxV2EntryKind>([
    "product",
    "book_cover",
    "regular_shipping",
    "book_shipping",
    "discount",
    "other",
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
    throw new InvoiceTaxV2AllocatorError(
      "TAX_RATE_NOT_SUPPORTED",
      `Die Position ${key} besitzt keinen unterstützten Steuersatz.`,
      {
        key,
        receivedTaxRate:
          value,
        supportedTaxRates: [
          7,
          19,
        ],
      },
    );
  }

  return parsed;
}

function requireEntryKind(
  value: unknown,
  key: string,
): InvoiceTaxV2EntryKind {
  const kind =
    cleanText(
      value,
    ) as
      | InvoiceTaxV2EntryKind
      | null;

  if (
    !kind ||
    !SUPPORTED_ENTRY_KINDS.has(
      kind,
    )
  ) {
    throw new InvoiceTaxV2AllocatorError(
      "ENTRY_KIND_INVALID",
      `Die Position ${key} besitzt keinen gültigen Eintragstyp.`,
      {
        key,
        receivedKind:
          value,
      },
    );
  }

  return kind;
}

function normalizeInputs(
  inputs:
    readonly InvoiceTaxV2AllocationInput[],
) {
  if (
    !Array.isArray(inputs)
  ) {
    throw new InvoiceTaxV2AllocatorError(
      "ALLOCATION_INPUT_INVALID",
      "Die Steuerpositionen müssen als Array übergeben werden.",
    );
  }

  if (
    inputs.length === 0
  ) {
    throw new InvoiceTaxV2AllocatorError(
      "ALLOCATION_INPUT_EMPTY",
      "Für die Steuerberechnung ist mindestens eine Position erforderlich.",
    );
  }

  const seenKeys =
    new Set<string>();

  return inputs.map(
    (
      rawInput,
      originalIndex,
    ): NormalizedAllocationEntry => {
      if (
        !isRecord(rawInput)
      ) {
        throw new InvoiceTaxV2AllocatorError(
          "ALLOCATION_ENTRY_INVALID",
          `Die Steuerposition ${originalIndex + 1} besitzt kein gültiges Objektformat.`,
          {
            originalIndex,
          },
        );
      }

      const input =
        rawInput as unknown as
          InvoiceTaxV2AllocationInput;

      const key =
        cleanText(
          input.key,
        );

      if (!key) {
        throw new InvoiceTaxV2AllocatorError(
          "ALLOCATION_ENTRY_KEY_MISSING",
          `Die Steuerposition ${originalIndex + 1} besitzt keinen Schlüssel.`,
          {
            originalIndex,
          },
        );
      }

      if (
        key.length > 255
      ) {
        throw new InvoiceTaxV2AllocatorError(
          "ALLOCATION_ENTRY_KEY_TOO_LONG",
          `Der Schlüssel ${key} ist zu lang.`,
          {
            key,
            actualLength:
              key.length,
          },
        );
      }

      if (
        seenKeys.has(key)
      ) {
        throw new InvoiceTaxV2AllocatorError(
          "ALLOCATION_ENTRY_KEY_DUPLICATE",
          `Der Schlüssel ${key} ist innerhalb der Rechnung nicht eindeutig.`,
          {
            key,
          },
        );
      }

      seenKeys.add(key);

      const kind =
        requireEntryKind(
          input.kind,
          key,
        );

      const taxRatePercentage =
        requireTaxRate(
          input.taxRatePercentage,
          key,
        );

      const grossCents =
        parseMoneyToCents(
          input.grossAmount,
          {
            fieldName:
              "grossAmount",

            entryKey:
              key,
          },
        );

      if (
        kind === "discount" &&
        grossCents > 0n
      ) {
        throw new InvoiceTaxV2AllocatorError(
          "DISCOUNT_GROSS_AMOUNT_POSITIVE",
          `Der Rabatt ${key} darf keinen positiven Bruttobetrag besitzen.`,
          {
            key,
            grossAmount:
              input.grossAmount,
          },
        );
      }

      if (
        kind !== "discount" &&
        grossCents < 0n
      ) {
        throw new InvoiceTaxV2AllocatorError(
          "NON_DISCOUNT_GROSS_AMOUNT_NEGATIVE",
          `Die Position ${key} darf nur als Rabatt einen negativen Bruttobetrag besitzen.`,
          {
            key,
            kind,
            grossAmount:
              input.grossAmount,
          },
        );
      }

      return {
        originalIndex,
        key,
        kind,
        taxRatePercentage,
        grossCents,

        metadata:
          isRecord(
            input.metadata,
          )
            ? {
                ...input.metadata,
              }
            : null,
      };
    },
  );
}

function comparePositiveAdjustment(
  left:
    InternalAllocatedEntry,

  right:
    InternalAllocatedEntry,
) {
  /*
   * Größter positiver Rest erhält zuerst
   * einen zusätzlichen Netto-Cent.
   */
  if (
    left.remainderNumerator !==
    right.remainderNumerator
  ) {
    return left.remainderNumerator >
      right.remainderNumerator
      ? -1
      : 1;
  }

  if (
    left.source.originalIndex !==
    right.source.originalIndex
  ) {
    return (
      left.source.originalIndex -
      right.source.originalIndex
    );
  }

  return left.source.key.localeCompare(
    right.source.key,
    "de",
  );
}

function compareNegativeAdjustment(
  left:
    InternalAllocatedEntry,

  right:
    InternalAllocatedEntry,
) {
  /*
   * Kleinster beziehungsweise negativster Rest
   * verliert zuerst einen Netto-Cent.
   */
  if (
    left.remainderNumerator !==
    right.remainderNumerator
  ) {
    return left.remainderNumerator <
      right.remainderNumerator
      ? -1
      : 1;
  }

  if (
    left.source.originalIndex !==
    right.source.originalIndex
  ) {
    return (
      left.source.originalIndex -
      right.source.originalIndex
    );
  }

  return left.source.key.localeCompare(
    right.source.key,
    "de",
  );
}

function bigintToSafeNumber(
  value: bigint,
  fieldName: string,
) {
  const numeric =
    Number(value);

  if (
    !Number.isSafeInteger(
      numeric,
    )
  ) {
    throw new InvoiceTaxV2AllocatorError(
      "ALLOCATION_NUMBER_OUT_OF_RANGE",
      `Der berechnete Wert ${fieldName} liegt außerhalb des sicheren Zahlenbereichs.`,
      {
        fieldName,
        value:
          value.toString(),
      },
    );
  }

  return numeric;
}

function allocateRateGroup(
  entries:
    NormalizedAllocationEntry[],

  taxRatePercentage:
    SupportedInvoiceTaxRateV2,
): InvoiceTaxV2RateAllocation {
  if (
    entries.length === 0
  ) {
    throw new InvoiceTaxV2AllocatorError(
      "RATE_GROUP_EMPTY",
      `Für den Steuersatz ${taxRatePercentage} % wurden keine Positionen übergeben.`,
      {
        taxRatePercentage,
      },
    );
  }

  const internalEntries:
    InternalAllocatedEntry[] =
      entries.map(
        (entry) => {
          const fraction =
            calculateExactNetFraction(
              entry.grossCents,
              taxRatePercentage,
            );

          return {
            source:
              entry,

            truncatedNetCents:
              fraction.truncatedNetCents,

            finalNetCents:
              fraction.truncatedNetCents,

            finalTaxCents:
              entry.grossCents -
              fraction.truncatedNetCents,

            remainderNumerator:
              fraction.remainderNumerator,

            remainderDenominator:
              fraction.denominator,

            adjustmentCents:
              0n,

            allocationOrder:
              null,
          };
        },
      );

  const grossCents =
    sumCents(
      entries.map(
        (entry) =>
          entry.grossCents,
      ),
    );

  /*
   * Lexware-kompatibler Zielwert:
   *
   * Der Nettobetrag wird aus der gesamten Bruttosumme
   * dieses Steuersatzes einmal berechnet.
   */
  const targetNetCents =
    calculateNetFromGrossCents(
      grossCents,
      taxRatePercentage,
    );

  const targetTaxCents =
    grossCents -
    targetNetCents;

  const truncatedNetTotalCents =
    sumCents(
      internalEntries.map(
        (entry) =>
          entry.truncatedNetCents,
      ),
    );

  const roundingAdjustmentCents =
    targetNetCents -
    truncatedNetTotalCents;

  if (
    roundingAdjustmentCents !==
    0n
  ) {
    const direction =
      roundingAdjustmentCents > 0n
        ? 1n
        : -1n;

    const sortedEntries =
      [
        ...internalEntries,
      ].sort(
        direction > 0n
          ? comparePositiveAdjustment
          : compareNegativeAdjustment,
      );

    let remaining =
      roundingAdjustmentCents > 0n
        ? roundingAdjustmentCents
        : -roundingAdjustmentCents;

    let cursor =
      0;

    let allocationOrder =
      1;

    while (
      remaining > 0n
    ) {
      const target =
        sortedEntries[
          cursor %
          sortedEntries.length
        ];

      target.finalNetCents +=
        direction;

      target.adjustmentCents +=
        direction;

      if (
        target.allocationOrder ===
        null
      ) {
        target.allocationOrder =
          allocationOrder;
      }

      target.finalTaxCents =
        target.source.grossCents -
        target.finalNetCents;

      allocationOrder +=
        1;

      cursor +=
        1;

      remaining -=
        1n;
    }
  }

  for (
    const entry of
    internalEntries
  ) {
    entry.finalTaxCents =
      entry.source.grossCents -
      entry.finalNetCents;
  }

  const allocatedNetCents =
    sumCents(
      internalEntries.map(
        (entry) =>
          entry.finalNetCents,
      ),
    );

  const allocatedTaxCents =
    sumCents(
      internalEntries.map(
        (entry) =>
          entry.finalTaxCents,
      ),
    );

  if (
    allocatedNetCents !==
    targetNetCents
  ) {
    throw new InvoiceTaxV2AllocatorError(
      "RATE_NET_ALLOCATION_MISMATCH",
      `Die verteilten Nettobeträge für ${taxRatePercentage} % stimmen nicht mit dem Steuersatz-Gesamtwert überein.`,
      {
        taxRatePercentage,

        expectedNetCents:
          targetNetCents.toString(),

        actualNetCents:
          allocatedNetCents.toString(),

        roundingAdjustmentCents:
          roundingAdjustmentCents.toString(),
      },
    );
  }

  if (
    allocatedTaxCents !==
    targetTaxCents
  ) {
    throw new InvoiceTaxV2AllocatorError(
      "RATE_TAX_ALLOCATION_MISMATCH",
      `Die verteilten Steuerbeträge für ${taxRatePercentage} % stimmen nicht mit dem Steuersatz-Gesamtwert überein.`,
      {
        taxRatePercentage,

        expectedTaxCents:
          targetTaxCents.toString(),

        actualTaxCents:
          allocatedTaxCents.toString(),
      },
    );
  }

  if (
    allocatedNetCents +
      allocatedTaxCents !==
    grossCents
  ) {
    throw new InvoiceTaxV2AllocatorError(
      "RATE_MONEY_IDENTITY_INVALID",
      `Netto plus Steuer entspricht für ${taxRatePercentage} % nicht dem Bruttobetrag.`,
      {
        taxRatePercentage,

        grossCents:
          grossCents.toString(),

        netCents:
          allocatedNetCents.toString(),

        taxCents:
          allocatedTaxCents.toString(),
      },
    );
  }

  const publicEntries:
    InvoiceTaxV2AllocatedEntry[] =
      internalEntries
        .sort(
          (
            left,
            right,
          ) =>
            left.source.originalIndex -
            right.source.originalIndex,
        )
        .map(
          (entry) => ({
            key:
              entry.source.key,

            kind:
              entry.source.kind,

            taxRatePercentage:
              entry.source
                .taxRatePercentage,

            grossAmount:
              centsToAmount(
                entry.source
                  .grossCents,
              ),

            netAmount:
              centsToAmount(
                entry.finalNetCents,
              ),

            taxAmount:
              centsToAmount(
                entry.finalTaxCents,
              ),

            allocation: {
              truncatedNetAmount:
                centsToAmount(
                  entry.truncatedNetCents,
                ),

              netAdjustmentCents:
                bigintToSafeNumber(
                  entry.adjustmentCents,
                  "netAdjustmentCents",
                ),

              exactNetRemainderNumerator:
                entry.remainderNumerator
                  .toString(),

              exactNetRemainderDenominator:
                entry.remainderDenominator
                  .toString(),

              allocationOrder:
                entry.allocationOrder,
            },

            metadata:
              entry.source.metadata,
          }),
        );

  return {
    taxRatePercentage,

    entryCount:
      publicEntries.length,

    grossAmount:
      centsToAmount(
        grossCents,
      ),

    netAmount:
      centsToAmount(
        allocatedNetCents,
      ),

    taxAmount:
      centsToAmount(
        allocatedTaxCents,
      ),

    roundingAdjustmentCents:
      bigintToSafeNumber(
        roundingAdjustmentCents,
        "roundingAdjustmentCents",
      ),

    entries:
      publicEntries,
  };
}

export function allocateInvoiceTaxV2(
  inputs:
    readonly InvoiceTaxV2AllocationInput[],
): InvoiceTaxV2AllocationResult {
  const normalizedInputs =
    normalizeInputs(
      inputs,
    );

  const rates:
    InvoiceTaxV2RateAllocation[] =
      (
        [
          7,
          19,
        ] as const
      )
        .map(
          (taxRatePercentage) => {
            const entries =
              normalizedInputs.filter(
                (entry) =>
                  entry.taxRatePercentage ===
                  taxRatePercentage,
              );

            if (
              entries.length === 0
            ) {
              return null;
            }

            return allocateRateGroup(
              entries,
              taxRatePercentage,
            );
          },
        )
        .filter(
          (
            rate,
          ): rate is InvoiceTaxV2RateAllocation =>
            rate !== null,
        );

  const allEntries =
    rates.flatMap(
      (rate) =>
        rate.entries,
    );

  const totalGrossCents =
    sumCents(
      rates.map(
        (rate) =>
          parseMoneyToCents(
            rate.grossAmount,
          ),
      ),
    );

  const totalNetCents =
    sumCents(
      rates.map(
        (rate) =>
          parseMoneyToCents(
            rate.netAmount,
          ),
      ),
    );

  const totalTaxCents =
    sumCents(
      rates.map(
        (rate) =>
          parseMoneyToCents(
            rate.taxAmount,
          ),
      ),
    );

  const entryGrossCents =
    sumCents(
      allEntries.map(
        (entry) =>
          parseMoneyToCents(
            entry.grossAmount,
          ),
      ),
    );

  const entryNetCents =
    sumCents(
      allEntries.map(
        (entry) =>
          parseMoneyToCents(
            entry.netAmount,
          ),
      ),
    );

  const entryTaxCents =
    sumCents(
      allEntries.map(
        (entry) =>
          parseMoneyToCents(
            entry.taxAmount,
          ),
      ),
    );

  const uniqueKeys =
    new Set(
      allEntries.map(
        (entry) =>
          entry.key,
      ),
    ).size ===
    allEntries.length;

  const everyEntryMoneyIdentityValid =
    allEntries.every(
      (entry) => {
        const gross =
          parseMoneyToCents(
            entry.grossAmount,
          );

        const net =
          parseMoneyToCents(
            entry.netAmount,
          );

        const tax =
          parseMoneyToCents(
            entry.taxAmount,
          );

        return (
          net + tax ===
          gross
        );
      },
    );

  const everyRateMoneyIdentityValid =
    rates.every(
      (rate) => {
        const gross =
          parseMoneyToCents(
            rate.grossAmount,
          );

        const net =
          parseMoneyToCents(
            rate.netAmount,
          );

        const tax =
          parseMoneyToCents(
            rate.taxAmount,
          );

        return (
          net + tax ===
          gross
        );
      },
    );

  const totalMoneyIdentityValid =
    totalNetCents +
      totalTaxCents ===
    totalGrossCents;

  const entrySumsMatchRateSums =
    entryGrossCents ===
      totalGrossCents &&
    entryNetCents ===
      totalNetCents &&
    entryTaxCents ===
      totalTaxCents;

  const invariants = {
    uniqueKeys,

    everyEntryMoneyIdentityValid,

    everyRateMoneyIdentityValid,

    totalMoneyIdentityValid,

    entrySumsMatchRateSums,
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
    throw new InvoiceTaxV2AllocatorError(
      "ALLOCATION_INVARIANT_FAILED",
      "Die Steuerverteilung verletzt mindestens eine interne Summenregel.",
      {
        failedInvariants,
      },
    );
  }

  return {
    version:
      INVOICE_TAX_V2_ALLOCATOR_VERSION,

    rates,

    total: {
      grossAmount:
        centsToAmount(
          totalGrossCents,
        ),

      netAmount:
        centsToAmount(
          totalNetCents,
        ),

      taxAmount:
        centsToAmount(
          totalTaxCents,
        ),
    },

    diagnostics: {
      entryCount:
        allEntries.length,

      taxRateCount:
        rates.length,

      totalRoundingAdjustmentCents:
        rates.reduce(
          (
            sum,
            rate,
          ) =>
            sum +
            rate.roundingAdjustmentCents,
          0,
        ),

      invariants,
    },
  };
}