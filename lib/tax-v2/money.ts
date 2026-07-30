/*
 * INVOICE_TAX_V2_MONEY_V1
 *
 * Centgenaue Geldverarbeitung für den parallelen
 * Lexware-kompatiblen Steuer-Snapshot V2.
 *
 * Intern werden ausschließlich bigint-Centbeträge verwendet.
 *
 * Diese Datei:
 * - greift nicht auf Supabase zu,
 * - greift nicht auf Lexware zu,
 * - verändert keine Rechnung,
 * - führt keine Seiteneffekte aus.
 */

export const INVOICE_TAX_V2_MONEY_VERSION =
  "invoice-tax-v2-money-v1" as const;

export type InvoiceTaxMoneyInput =
  | number
  | string;

export const MAX_ABSOLUTE_MONEY_CENTS =
  10_000_000_000_000n;

export class InvoiceTaxV2MoneyError
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
      "InvoiceTaxV2MoneyError";

    this.code =
      code;

    this.details =
      details ?? null;
  }
}

function normalizeMoneyInput(
  value: InvoiceTaxMoneyInput,
) {
  const raw =
    typeof value === "number"
      ? String(value)
      : value;

  return raw
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
}

export function parseMoneyToCents(
  value: InvoiceTaxMoneyInput,
  context?: {
    fieldName?: string;
    entryKey?: string;
  },
): bigint {
  const fieldName =
    context?.fieldName ??
    "money";

  const entryKey =
    context?.entryKey ??
    null;

  if (
    typeof value === "number" &&
    !Number.isFinite(value)
  ) {
    throw new InvoiceTaxV2MoneyError(
      "MONEY_VALUE_NOT_FINITE",
      `Der Geldwert ${fieldName} ist keine endliche Zahl.`,
      {
        fieldName,
        entryKey,
        receivedValue:
          String(value),
      },
    );
  }

  const normalized =
    normalizeMoneyInput(value);

  if (
    !/^-?\d+(?:\.\d{1,2})?$/.test(
      normalized,
    )
  ) {
    throw new InvoiceTaxV2MoneyError(
      "MONEY_VALUE_INVALID",
      `Der Geldwert ${fieldName} besitzt kein gültiges Centformat.`,
      {
        fieldName,
        entryKey,
        receivedValue:
          value,
        normalizedValue:
          normalized,
      },
    );
  }

  const negative =
    normalized.startsWith("-");

  const unsigned =
    negative
      ? normalized.slice(1)
      : normalized;

  const [
    eurosPart,
    decimalPart = "",
  ] =
    unsigned.split(".");

  const centsPart =
    decimalPart.padEnd(
      2,
      "0",
    );

  const absoluteCents =
    BigInt(eurosPart) *
      100n +
    BigInt(centsPart);

  const signedCents =
    negative
      ? -absoluteCents
      : absoluteCents;

  if (
    signedCents >
      MAX_ABSOLUTE_MONEY_CENTS ||
    signedCents <
      -MAX_ABSOLUTE_MONEY_CENTS
  ) {
    throw new InvoiceTaxV2MoneyError(
      "MONEY_VALUE_OUT_OF_RANGE",
      `Der Geldwert ${fieldName} überschreitet den zulässigen Bereich.`,
      {
        fieldName,
        entryKey,
        receivedValue:
          value,
        cents:
          signedCents.toString(),
      },
    );
  }

  return signedCents;
}

export function centsToAmount(
  cents: bigint,
): number {
  const numericCents =
    Number(cents);

  if (
    !Number.isSafeInteger(
      numericCents,
    )
  ) {
    throw new InvoiceTaxV2MoneyError(
      "MONEY_RESULT_OUT_OF_SAFE_RANGE",
      "Ein berechneter Centbetrag liegt außerhalb des sicheren JavaScript-Zahlenbereichs.",
      {
        cents:
          cents.toString(),
      },
    );
  }

  return numericCents / 100;
}

export function sumCents(
  values: readonly bigint[],
): bigint {
  return values.reduce(
    (
      sum,
      value,
    ) =>
      sum + value,
    0n,
  );
}

export function absoluteCents(
  value: bigint,
): bigint {
  return value < 0n
    ? -value
    : value;
}

export function centsHaveSameSign(
  left: bigint,
  right: bigint,
) {
  if (
    left === 0n ||
    right === 0n
  ) {
    return true;
  }

  return (
    left < 0n
  ) ===
    (
      right < 0n
    );
}

export function centsEqual(
  left: bigint,
  right: bigint,
) {
  return left === right;
}

export function amountEqualsCents(
  amount: InvoiceTaxMoneyInput,
  cents: bigint,
) {
  return (
    parseMoneyToCents(
      amount,
    ) === cents
  );
}

export function formatCentsForDiagnostics(
  cents: bigint,
) {
  const negative =
    cents < 0n;

  const absolute =
    negative
      ? -cents
      : cents;

  const euros =
    absolute / 100n;

  const centPart =
    (
      absolute % 100n
    )
      .toString()
      .padStart(
        2,
        "0",
      );

  return `${
    negative
      ? "-"
      : ""
  }${euros.toString()}.${centPart}`;
}