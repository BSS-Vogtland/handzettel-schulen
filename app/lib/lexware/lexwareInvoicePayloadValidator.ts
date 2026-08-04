import type {
  LexwareInvoiceCreatePayload,
  LexwareInvoicePayloadBuildResult,
  LexwareInvoicePayloadLineItem,
} from "@/app/lib/lexware/lexwareInvoicePayloadBuilder";

import type {
  SupportedInvoiceTaxRate,
} from "@/lib/invoiceTaxSnapshot";

/*
 * LEXWARE_INVOICE_PAYLOAD_VALIDATOR_V1
 *
 * Unabhängige Validierung eines bereits erzeugten
 * Lexware-Rechnungspayloads.
 *
 * Diese Datei:
 * - führt keine Lexware-Anfrage aus,
 * - schreibt nicht nach Supabase,
 * - erzeugt keine Rechnung,
 * - versendet keine E-Mail.
 */

export const LEXWARE_INVOICE_PAYLOAD_VALIDATOR_VERSION =
  "lexware-invoice-payload-validator-v1" as const;

const MAX_LEXWARE_LINE_ITEMS =
  300;

const MAX_NAME_LENGTH =
  255;

const MAX_UNIT_NAME_LENGTH =
  40;

const MAX_DESCRIPTION_LENGTH =
  1_000;

const MAX_TEXT_LENGTH =
  1_000;

const MAX_QUANTITY =
  9_999;

const SUPPORTED_TAX_RATES =
  new Set<number>([
    7,
    19,
  ]);

type TaxAccumulator = {
  taxRatePercentage:
    SupportedInvoiceTaxRate;

  grossCents: number;
  netCents: number;
  taxCents: number;
};

export type LexwareInvoicePayloadValidationCheck = {
  name: string;
  passed: boolean;
  message: string;

  details?:
    Record<string, unknown>;
};

export type LexwareInvoicePayloadValidationResult = {
  version:
    typeof LEXWARE_INVOICE_PAYLOAD_VALIDATOR_VERSION;

  valid: boolean;

  checks:
    LexwareInvoicePayloadValidationCheck[];

  failedChecks:
    LexwareInvoicePayloadValidationCheck[];

  calculated: {
    lineItemCount: number;

    totalGrossAmount: number;
    totalNetAmount: number;
    totalTaxAmount: number;

    taxRates: Array<{
      taxRatePercentage:
        SupportedInvoiceTaxRate;

      grossAmount: number;
      netAmount: number;
      taxAmount: number;
    }>;
  };
};

export class LexwareInvoicePayloadValidationError
  extends Error {
  readonly code: string;

  readonly validation:
    LexwareInvoicePayloadValidationResult;

  constructor(
    code: string,
    message: string,
    validation:
      LexwareInvoicePayloadValidationResult,
  ) {
    super(message);

    this.name =
      "LexwareInvoicePayloadValidationError";

    this.code =
      code;

    this.validation =
      validation;
  }
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

function amountToCents(
  value: unknown,
) {
  const normalized =
    typeof value === "string"
      ? value
          .trim()
          .replace(",", ".")
      : value;

  const parsed =
    Number(normalized);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.round(
    (
      parsed +
      (
        parsed >= 0
          ? Number.EPSILON
          : -Number.EPSILON
      )
    ) * 100,
  );
}

function centsToAmount(
  cents: number,
) {
  return cents / 100;
}

function isValidIsoDateTime(
  value: unknown,
) {
  const text =
    cleanText(value);

  if (!text) {
    return false;
  }

  return Number.isFinite(
    Date.parse(text),
  );
}

function isPositiveQuantity(
  value: unknown,
) {
  const parsed =
    Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed <= 0 ||
    parsed > MAX_QUANTITY
  ) {
    return false;
  }

  /*
   * Lexware-Mengen werden hier auf höchstens
   * vier Nachkommastellen begrenzt.
   */
  return (
    Math.round(
      parsed * 10_000,
    ) ===
    parsed * 10_000
  );
}

function splitGrossCents(
  grossCents: number,
  taxRate:
    SupportedInvoiceTaxRate,
) {
  const absoluteGrossCents =
    Math.abs(grossCents);

  const absoluteNetCents =
    Math.round(
      (
        absoluteGrossCents *
        100
      ) /
      (
        100 +
        taxRate
      ),
    );

  const absoluteTaxCents =
    absoluteGrossCents -
    absoluteNetCents;

  const sign =
    grossCents < 0
      ? -1
      : 1;

  return {
    grossCents,

    netCents:
      absoluteNetCents *
      sign,

    taxCents:
      absoluteTaxCents *
      sign,
  };
}

function pushCheck(
  checks:
    LexwareInvoicePayloadValidationCheck[],

  name: string,
  passed: boolean,
  message: string,

  details?:
    Record<string, unknown>,
) {
  checks.push({
    name,
    passed,
    message,

    ...(
      details
        ? {
            details,
          }
        : {}
    ),
  });
}

function validateAddress(
  payload:
    LexwareInvoiceCreatePayload,

  checks:
    LexwareInvoicePayloadValidationCheck[],
) {
  const address =
    payload.address;

  pushCheck(
    checks,
    "addressExists",
    Boolean(address),
    "Eine Rechnungsadresse ist vorhanden.",
  );

  pushCheck(
    checks,
    "addressNamePresent",
    Boolean(
      cleanText(
        address?.name,
      ),
    ),
    "Der Name des Rechnungsempfängers ist vorhanden.",
  );

  pushCheck(
    checks,
    "addressNameLengthValid",
    Boolean(
      cleanText(
        address?.name,
      ) &&
      address.name.length <=
        MAX_NAME_LENGTH
    ),
    `Der Name des Rechnungsempfängers ist höchstens ${MAX_NAME_LENGTH} Zeichen lang.`,
    {
      actualLength:
        address?.name?.length ??
        0,
    },
  );

  pushCheck(
    checks,
    "addressStreetPresent",
    Boolean(
      cleanText(
        address?.street,
      ),
    ),
    "Die Straße der Rechnungsadresse ist vorhanden.",
  );

  pushCheck(
    checks,
    "addressZipPresent",
    Boolean(
      cleanText(
        address?.zip,
      ),
    ),
    "Die Postleitzahl der Rechnungsadresse ist vorhanden.",
  );

  pushCheck(
    checks,
    "addressCityPresent",
    Boolean(
      cleanText(
        address?.city,
      ),
    ),
    "Der Ort der Rechnungsadresse ist vorhanden.",
  );

  pushCheck(
    checks,
    "addressCountryIsGermany",
    address?.countryCode ===
      "DE",
    "Der Ländercode der Rechnungsadresse ist DE.",
    {
      actualCountryCode:
        address?.countryCode ??
        null,
    },
  );
}

function validateLineItem(
  lineItem:
    LexwareInvoicePayloadLineItem,

  index: number,

  checks:
    LexwareInvoicePayloadValidationCheck[],

  accumulatorByRate:
    Map<
      SupportedInvoiceTaxRate,
      TaxAccumulator
    >,
) {
  const positionNumber =
    index + 1;

  const prefix =
    `lineItem${positionNumber}`;

  pushCheck(
    checks,
    `${prefix}TypeValid`,
    lineItem.type ===
      "custom",
    `Position ${positionNumber} verwendet den Typ custom.`,
    {
      actualType:
        lineItem.type,
    },
  );

  const name =
    cleanText(
      lineItem.name,
    );

  pushCheck(
    checks,
    `${prefix}NamePresent`,
    Boolean(name),
    `Position ${positionNumber} besitzt einen Namen.`,
  );

  pushCheck(
    checks,
    `${prefix}NameLengthValid`,
    Boolean(
      name &&
      name.length <=
        MAX_NAME_LENGTH
    ),
    `Der Name von Position ${positionNumber} ist höchstens ${MAX_NAME_LENGTH} Zeichen lang.`,
    {
      actualLength:
        lineItem.name?.length ??
        0,
    },
  );

  const description =
    cleanText(
      lineItem.description,
    );

  pushCheck(
    checks,
    `${prefix}DescriptionLengthValid`,
    !description ||
    description.length <=
      MAX_DESCRIPTION_LENGTH,
    `Die Beschreibung von Position ${positionNumber} ist höchstens ${MAX_DESCRIPTION_LENGTH} Zeichen lang.`,
    {
      actualLength:
        description?.length ??
        0,
    },
  );

  const quantityValid =
    isPositiveQuantity(
      lineItem.quantity,
    );

  pushCheck(
    checks,
    `${prefix}QuantityValid`,
    quantityValid,
    `Die Menge von Position ${positionNumber} ist positiv und technisch zulässig.`,
    {
      quantity:
        lineItem.quantity,
    },
  );

  const unitName =
    cleanText(
      lineItem.unitName,
    );

  pushCheck(
    checks,
    `${prefix}UnitNamePresent`,
    Boolean(unitName),
    `Position ${positionNumber} besitzt eine Einheit.`,
  );

  pushCheck(
    checks,
    `${prefix}UnitNameLengthValid`,
    Boolean(
      unitName &&
      unitName.length <=
        MAX_UNIT_NAME_LENGTH
    ),
    `Die Einheit von Position ${positionNumber} ist höchstens ${MAX_UNIT_NAME_LENGTH} Zeichen lang.`,
    {
      actualLength:
        lineItem.unitName?.length ??
        0,
    },
  );

  pushCheck(
    checks,
    `${prefix}CurrencyIsEur`,
    lineItem.unitPrice
      ?.currency ===
      "EUR",
    `Position ${positionNumber} verwendet EUR.`,
    {
      actualCurrency:
        lineItem.unitPrice
          ?.currency ??
        null,
    },
  );

  const grossUnitCents =
    amountToCents(
      lineItem.unitPrice
        ?.grossAmount,
    );

  pushCheck(
    checks,
    `${prefix}GrossUnitAmountValid`,
    grossUnitCents !==
      null &&
    grossUnitCents !==
      0,
    `Position ${positionNumber} besitzt einen gültigen Brutto-Einzelpreis.`,
    {
      grossAmount:
        lineItem.unitPrice
          ?.grossAmount ??
        null,
    },
  );

  const taxRateRaw =
    Number(
      lineItem.unitPrice
        ?.taxRatePercentage,
    );

  const taxRateValid =
    SUPPORTED_TAX_RATES.has(
      taxRateRaw,
    );

  pushCheck(
    checks,
    `${prefix}TaxRateValid`,
    taxRateValid,
    `Position ${positionNumber} verwendet 7 % oder 19 % Umsatzsteuer.`,
    {
      taxRatePercentage:
        lineItem.unitPrice
          ?.taxRatePercentage ??
        null,
    },
  );

  pushCheck(
    checks,
    `${prefix}DiscountPercentageValid`,
    lineItem.discountPercentage ===
      0,
    `Position ${positionNumber} verwendet keinen zusätzlichen Lexware-Positionsrabatt.`,
    {
      discountPercentage:
        lineItem.discountPercentage,
    },
  );

  if (
    !quantityValid ||
    grossUnitCents ===
      null ||
    grossUnitCents ===
      0 ||
    !taxRateValid
  ) {
    return;
  }

  const quantity =
    Number(
      lineItem.quantity,
    );

  const lineGrossCents =
    Math.round(
      grossUnitCents *
      quantity,
    );

  const taxRate =
    taxRateRaw as
      SupportedInvoiceTaxRate;

  const split =
    splitGrossCents(
      lineGrossCents,
      taxRate,
    );

  const current =
    accumulatorByRate.get(
      taxRate,
    ) || {
      taxRatePercentage:
        taxRate,

      grossCents:
        0,

      netCents:
        0,

      taxCents:
        0,
    };

  current.grossCents +=
    split.grossCents;

  current.netCents +=
    split.netCents;

  current.taxCents +=
    split.taxCents;

  accumulatorByRate.set(
    taxRate,
    current,
  );
}

function compareMoney(
  actualCents: number,
  expectedValue: unknown,
) {
  const expectedCents =
    amountToCents(
      expectedValue,
    );

  return {
    expectedCents,

    matches:
      expectedCents !==
        null &&
      actualCents ===
        expectedCents,
  };
}

export function validateLexwareInvoicePayload(
  buildResult:
    LexwareInvoicePayloadBuildResult,
): LexwareInvoicePayloadValidationResult {
  const checks:
    LexwareInvoicePayloadValidationCheck[] =
      [];

  const payload =
    buildResult.payload;

  pushCheck(
    checks,
    "payloadExists",
    Boolean(payload),
    "Ein Lexware-Payload ist vorhanden.",
  );

  pushCheck(
    checks,
    "archivedIsFalse",
    payload.archived ===
      false,
    "Die neue Lexware-Rechnung wird nicht archiviert angelegt.",
  );

  pushCheck(
    checks,
    "voucherDateValid",
    isValidIsoDateTime(
      payload.voucherDate,
    ),
    "Das Rechnungsdatum ist ein gültiger ISO-Zeitpunkt.",
    {
      voucherDate:
        payload.voucherDate,
    },
  );

  pushCheck(
    checks,
    "titleCorrect",
    payload.title ===
      "Rechnung",
    "Der Belegtitel lautet Rechnung.",
    {
      title:
        payload.title,
    },
  );

  pushCheck(
    checks,
    "introductionPresent",
    Boolean(
      cleanText(
        payload.introduction,
      ),
    ),
    "Der Einleitungstext ist vorhanden.",
  );

  pushCheck(
    checks,
    "introductionLengthValid",
    Boolean(
      cleanText(
        payload.introduction,
      ) &&
      payload.introduction.length <=
        MAX_TEXT_LENGTH
    ),
    `Der Einleitungstext ist höchstens ${MAX_TEXT_LENGTH} Zeichen lang.`,
    {
      actualLength:
        payload.introduction
          ?.length ??
        0,
    },
  );

  pushCheck(
    checks,
    "remarkPresent",
    Boolean(
      cleanText(
        payload.remark,
      ),
    ),
    "Die Nachbemerkung ist vorhanden.",
  );

  pushCheck(
    checks,
    "remarkLengthValid",
    Boolean(
      cleanText(
        payload.remark,
      ) &&
      payload.remark.length <=
        MAX_TEXT_LENGTH
    ),
    `Die Nachbemerkung ist höchstens ${MAX_TEXT_LENGTH} Zeichen lang.`,
    {
      actualLength:
        payload.remark
          ?.length ??
        0,
    },
  );

  validateAddress(
    payload,
    checks,
  );

  pushCheck(
    checks,
    "totalCurrencyIsEur",
    payload.totalPrice
      ?.currency ===
      "EUR",
    "Die Gesamtwährung ist EUR.",
    {
      actualCurrency:
        payload.totalPrice
          ?.currency ??
        null,
    },
  );

  pushCheck(
    checks,
    "taxTypeIsGross",
    payload.taxConditions
      ?.taxType ===
      "gross",
    "Die Rechnung verwendet die Bruttoberechnung.",
    {
      actualTaxType:
        payload.taxConditions
          ?.taxType ??
        null,
    },
  );

  const paymentTermLabel =
    cleanText(
      payload.paymentConditions
        ?.paymentTermLabel,
    );

  pushCheck(
    checks,
    "paymentTermLabelPresent",
    Boolean(
      paymentTermLabel,
    ),
    "Die Zahlungsbedingung besitzt einen Text.",
  );

  const paymentTermDuration =
    Number(
      payload.paymentConditions
        ?.paymentTermDuration,
    );

  pushCheck(
    checks,
    "paymentTermDurationValid",
    Number.isInteger(
      paymentTermDuration,
    ) &&
    paymentTermDuration >=
      0 &&
    paymentTermDuration <=
      365,
    "Das Zahlungsziel liegt zwischen 0 und 365 Tagen.",
    {
      paymentTermDuration,
    },
  );

  const shippingType =
    payload.shippingConditions
      ?.shippingType;

  pushCheck(
    checks,
    "shippingTypeValid",
    shippingType ===
      "delivery" ||
    shippingType ===
      "none",
    "Die Lieferbedingung ist delivery oder none.",
    {
      shippingType:
        shippingType ??
        null,
    },
  );

  if (
    shippingType ===
    "delivery"
  ) {
    pushCheck(
      checks,
      "shippingDateValid",
      isValidIsoDateTime(
        payload.shippingConditions
          .shippingDate,
      ),
      "Das Lieferdatum ist ein gültiger ISO-Zeitpunkt.",
      {
        shippingDate:
          payload
            .shippingConditions
            .shippingDate,
      },
    );
  }

  const lineItems =
    Array.isArray(
      payload.lineItems,
    )
      ? payload.lineItems
      : [];

  pushCheck(
    checks,
    "lineItemsPresent",
    lineItems.length >
      0,
    "Der Payload besitzt mindestens eine Rechnungsposition.",
    {
      lineItemCount:
        lineItems.length,
    },
  );

  pushCheck(
    checks,
    "lineItemCountWithinLimit",
    lineItems.length <=
      MAX_LEXWARE_LINE_ITEMS,
    `Der Payload besitzt höchstens ${MAX_LEXWARE_LINE_ITEMS} Rechnungspositionen.`,
    {
      lineItemCount:
        lineItems.length,
    },
  );

  pushCheck(
    checks,
    "lineItemCountMatchesBuilderMetadata",
    lineItems.length ===
      buildResult.metadata
        .lineItemCount,
    "Die Positionsanzahl stimmt mit den Builder-Metadaten überein.",
    {
      payloadLineItemCount:
        lineItems.length,

      metadataLineItemCount:
        buildResult.metadata
          .lineItemCount,
    },
  );

  const accumulatorByRate =
    new Map<
      SupportedInvoiceTaxRate,
      TaxAccumulator
    >();

  lineItems.forEach(
    (
      lineItem,
      index,
    ) => {
      validateLineItem(
        lineItem,
        index,
        checks,
        accumulatorByRate,
      );
    },
  );

  const calculatedTaxRates =
    Array.from(
      accumulatorByRate.values(),
    )
      .sort(
        (
          left,
          right,
        ) =>
          left.taxRatePercentage -
          right.taxRatePercentage,
      );

  const totalGrossCents =
    calculatedTaxRates.reduce(
      (
        sum,
        entry,
      ) =>
        sum +
        entry.grossCents,
      0,
    );

  const totalNetCents =
    calculatedTaxRates.reduce(
      (
        sum,
        entry,
      ) =>
        sum +
        entry.netCents,
      0,
    );

  const totalTaxCents =
    calculatedTaxRates.reduce(
      (
        sum,
        entry,
      ) =>
        sum +
        entry.taxCents,
      0,
    );

  pushCheck(
    checks,
    "calculatedTotalNotNegative",
    totalGrossCents >=
      0,
    "Der berechnete Rechnungs-Gesamtbetrag ist nicht negativ.",
    {
      totalGrossAmount:
        centsToAmount(
          totalGrossCents,
        ),
    },
  );

  pushCheck(
    checks,
    "calculatedMoneyIdentityValid",
    totalNetCents +
      totalTaxCents ===
      totalGrossCents,
    "Gesamtnetto plus Gesamtsteuer entspricht Gesamtbrutto.",
    {
      totalGrossAmount:
        centsToAmount(
          totalGrossCents,
        ),

      totalNetAmount:
        centsToAmount(
          totalNetCents,
        ),

      totalTaxAmount:
        centsToAmount(
          totalTaxCents,
        ),
    },
  );

  const grossComparison =
    compareMoney(
      totalGrossCents,
      buildResult.expected
        .totalGrossAmount,
    );

  pushCheck(
    checks,
    "totalGrossMatchesExpected",
    grossComparison.matches,
    "Der berechnete Gesamtbruttobetrag stimmt mit dem Steuer-Snapshot überein.",
    {
      calculated:
        centsToAmount(
          totalGrossCents,
        ),

      expected:
        buildResult.expected
          .totalGrossAmount,
    },
  );

  const netComparison =
    compareMoney(
      totalNetCents,
      buildResult.expected
        .totalNetAmount,
    );

  pushCheck(
    checks,
    "totalNetMatchesExpected",
    netComparison.matches,
    "Der berechnete Gesamtnettobetrag stimmt mit dem Steuer-Snapshot überein.",
    {
      calculated:
        centsToAmount(
          totalNetCents,
        ),

      expected:
        buildResult.expected
          .totalNetAmount,
    },
  );

  const taxComparison =
    compareMoney(
      totalTaxCents,
      buildResult.expected
        .totalTaxAmount,
    );

  pushCheck(
    checks,
    "totalTaxMatchesExpected",
    taxComparison.matches,
    "Der berechnete Gesamtsteuerbetrag stimmt mit dem Steuer-Snapshot überein.",
    {
      calculated:
        centsToAmount(
          totalTaxCents,
        ),

      expected:
        buildResult.expected
          .totalTaxAmount,
    },
  );

  for (
    const expectedRate of
    buildResult.expected.taxRates
  ) {
    const actualRate =
      accumulatorByRate.get(
        expectedRate
          .taxRatePercentage,
      );

    const prefix =
      `taxRate${expectedRate.taxRatePercentage}`;

    pushCheck(
      checks,
      `${prefix}Present`,
      Boolean(
        actualRate,
      ),
      `Der Steuerbereich ${expectedRate.taxRatePercentage} % ist im Payload vorhanden.`,
    );

    if (!actualRate) {
      continue;
    }

    pushCheck(
      checks,
      `${prefix}GrossMatches`,
      amountToCents(
        expectedRate
          .grossAmount,
      ) ===
        actualRate.grossCents,
      `Der Bruttobetrag des Steuerbereichs ${expectedRate.taxRatePercentage} % stimmt überein.`,
      {
        calculated:
          centsToAmount(
            actualRate.grossCents,
          ),

        expected:
          expectedRate
            .grossAmount,
      },
    );

    pushCheck(
      checks,
      `${prefix}NetMatches`,
      amountToCents(
        expectedRate
          .netAmount,
      ) ===
        actualRate.netCents,
      `Der Nettobetrag des Steuerbereichs ${expectedRate.taxRatePercentage} % stimmt überein.`,
      {
        calculated:
          centsToAmount(
            actualRate.netCents,
          ),

        expected:
          expectedRate
            .netAmount,
      },
    );

    pushCheck(
      checks,
      `${prefix}TaxMatches`,
      amountToCents(
        expectedRate
          .taxAmount,
      ) ===
        actualRate.taxCents,
      `Der Steuerbetrag des Steuerbereichs ${expectedRate.taxRatePercentage} % stimmt überein.`,
      {
        calculated:
          centsToAmount(
            actualRate.taxCents,
          ),

        expected:
          expectedRate
            .taxAmount,
      },
    );
  }

  const expectedTaxRateSet =
    new Set(
      buildResult.expected
        .taxRates
        .map(
          (entry) =>
            entry
              .taxRatePercentage,
        ),
    );

  const unexpectedTaxRates =
    calculatedTaxRates
      .map(
        (entry) =>
          entry
            .taxRatePercentage,
      )
      .filter(
        (taxRate) =>
          !expectedTaxRateSet.has(
            taxRate,
          ),
      );

  pushCheck(
    checks,
    "noUnexpectedTaxRates",
    unexpectedTaxRates.length ===
      0,
    "Der Payload enthält keine unerwarteten Steuerbereiche.",
    {
      unexpectedTaxRates,
    },
  );

  const failedChecks =
    checks.filter(
      (check) =>
        check.passed !==
        true,
    );

  return {
    version:
      LEXWARE_INVOICE_PAYLOAD_VALIDATOR_VERSION,

    valid:
      failedChecks.length ===
      0,

    checks,

    failedChecks,

    calculated: {
      lineItemCount:
        lineItems.length,

      totalGrossAmount:
        centsToAmount(
          totalGrossCents,
        ),

      totalNetAmount:
        centsToAmount(
          totalNetCents,
        ),

      totalTaxAmount:
        centsToAmount(
          totalTaxCents,
        ),

      taxRates:
        calculatedTaxRates.map(
          (entry) => ({
            taxRatePercentage:
              entry
                .taxRatePercentage,

            grossAmount:
              centsToAmount(
                entry
                  .grossCents,
              ),

            netAmount:
              centsToAmount(
                entry
                  .netCents,
              ),

            taxAmount:
              centsToAmount(
                entry
                  .taxCents,
              ),
          }),
        ),
    },
  };
}

export function requireValidLexwareInvoicePayload(
  buildResult:
    LexwareInvoicePayloadBuildResult,
) {
  const validation =
    validateLexwareInvoicePayload(
      buildResult,
    );

  if (!validation.valid) {
    throw new LexwareInvoicePayloadValidationError(
      "LEXWARE_INVOICE_PAYLOAD_INVALID",
      `Der Lexware-Rechnungspayload ist ungültig. ${validation.failedChecks.length} Prüfung(en) sind fehlgeschlagen.`,
      validation,
    );
  }

  return validation;
}
