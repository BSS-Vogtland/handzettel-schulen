/*
 * INVOICE_TAX_V2_ROUNDING_V1
 *
 * Deterministische Ganzzahl- und Steuer-Rundungsfunktionen.
 *
 * Diese Datei arbeitet ausschließlich mit bigint.
 */

import {
  absoluteCents,
} from "@/lib/tax-v2/money";

export const INVOICE_TAX_V2_ROUNDING_VERSION =
  "invoice-tax-v2-rounding-v1" as const;

export class InvoiceTaxV2RoundingError
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
      "InvoiceTaxV2RoundingError";

    this.code =
      code;

    this.details =
      details ?? null;
  }
}

function requireValidTaxRate(
  taxRatePercentage: number,
) {
  if (
    !Number.isInteger(
      taxRatePercentage,
    ) ||
    taxRatePercentage < 0 ||
    taxRatePercentage > 100
  ) {
    throw new InvoiceTaxV2RoundingError(
      "TAX_RATE_INVALID",
      "Der Steuersatz muss eine ganze Zahl zwischen 0 und 100 sein.",
      {
        taxRatePercentage,
      },
    );
  }
}

/*
 * Rundet einen ganzzahligen Bruch kaufmännisch
 * auf die nächste Ganzzahl.
 *
 * Exakt halbe Werte werden vom Nullpunkt weg gerundet.
 */
export function divideAndRoundHalfAwayFromZero(
  numerator: bigint,
  denominator: bigint,
): bigint {
  if (
    denominator <= 0n
  ) {
    throw new InvoiceTaxV2RoundingError(
      "ROUNDING_DENOMINATOR_INVALID",
      "Der Nenner der Rundungsberechnung muss größer als null sein.",
      {
        numerator:
          numerator.toString(),

        denominator:
          denominator.toString(),
      },
    );
  }

  const negative =
    numerator < 0n;

  const absoluteNumerator =
    absoluteCents(
      numerator,
    );

  const quotient =
    absoluteNumerator /
    denominator;

  const remainder =
    absoluteNumerator %
    denominator;

  const shouldRoundUp =
    remainder * 2n >=
    denominator;

  const roundedAbsolute =
    shouldRoundUp
      ? quotient + 1n
      : quotient;

  return negative
    ? -roundedAbsolute
    : roundedAbsolute;
}

export function calculateNetFromGrossCents(
  grossCents: bigint,
  taxRatePercentage: number,
): bigint {
  requireValidTaxRate(
    taxRatePercentage,
  );

  const denominator =
    BigInt(
      100 +
      taxRatePercentage,
    );

  return divideAndRoundHalfAwayFromZero(
    grossCents * 100n,
    denominator,
  );
}

export function calculateTaxFromGrossCents(
  grossCents: bigint,
  taxRatePercentage: number,
): bigint {
  const netCents =
    calculateNetFromGrossCents(
      grossCents,
      taxRatePercentage,
    );

  return grossCents -
    netCents;
}

export function splitGrossCentsByTaxRate(
  grossCents: bigint,
  taxRatePercentage: number,
) {
  const netCents =
    calculateNetFromGrossCents(
      grossCents,
      taxRatePercentage,
    );

  const taxCents =
    grossCents -
    netCents;

  return {
    grossCents,
    netCents,
    taxCents,
  };
}

export function calculateExactNetFraction(
  grossCents: bigint,
  taxRatePercentage: number,
) {
  requireValidTaxRate(
    taxRatePercentage,
  );

  const numerator =
    grossCents * 100n;

  const denominator =
    BigInt(
      100 +
      taxRatePercentage,
    );

  /*
   * BigInt-Division kürzt in Richtung null.
   * Der Rest besitzt dasselbe Vorzeichen wie der Zähler.
   */
  const truncatedNetCents =
    numerator /
    denominator;

  const remainderNumerator =
    numerator %
    denominator;

  const roundedNetCents =
    divideAndRoundHalfAwayFromZero(
      numerator,
      denominator,
    );

  return {
    numerator,
    denominator,
    truncatedNetCents,
    roundedNetCents,
    remainderNumerator,
  };
}