export type LexwareLineItemSignatureInput = {
  type: unknown;
  quantity: unknown;
  unitName: unknown;
  unitPrice: {
    currency: unknown;
    grossAmount: unknown;
    taxRatePercentage: unknown;
  } | null;
  discountPercentage: unknown;
};

export type LexwareReadBackLineItemInput =
  LexwareLineItemSignatureInput & {
    lineItemAmount: unknown;
  };

export type LexwareLineItemMultisetDifference = {
  missingSignatures: Array<{ signature: string; count: number }>;
  unexpectedSignatures: Array<{ signature: string; count: number }>;
  countMismatch: boolean;
};

export class LexwareLineItemSignatureError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "LexwareLineItemSignatureError";
    this.code = code;
  }
}

const fail = (code: string, message: string): never => {
  throw new LexwareLineItemSignatureError(code, message);
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseLexwarePayloadLineItem(value: unknown): LexwareLineItemSignatureInput {
  if (!isRecord(value)) {
    return fail("LEXWARE_LINE_INVALID", "Die Lexware-Position ist kein Objekt.");
  }
  const requiredFields = [
    "type",
    "quantity",
    "unitName",
    "unitPrice",
    "discountPercentage",
  ];
  if (requiredFields.some((field) => !(field in value))) {
    return fail("LEXWARE_LINE_REQUIRED_FIELD_MISSING", "Die Lexware-Position ist unvollständig.");
  }
  const unitPriceValue = value.unitPrice;
  if (!isRecord(unitPriceValue)) {
    return fail("LEXWARE_LINE_UNIT_PRICE_MISSING", "unitPrice fehlt.");
  }
  const requiredUnitPriceFields = [
    "currency",
    "grossAmount",
    "taxRatePercentage",
  ];
  if (requiredUnitPriceFields.some((field) => !(field in unitPriceValue))) {
    return fail("LEXWARE_LINE_UNIT_PRICE_INVALID", "unitPrice ist unvollständig.");
  }
  return {
    type: value.type,
    quantity: value.quantity,
    unitName: value.unitName,
    unitPrice: {
      currency: unitPriceValue.currency,
      grossAmount: unitPriceValue.grossAmount,
      taxRatePercentage: unitPriceValue.taxRatePercentage,
    },
    discountPercentage: value.discountPercentage,
  };
}

export function parseLexwareReadBackLineItem(value: unknown): LexwareReadBackLineItemInput {
  if (!isRecord(value) || !("lineItemAmount" in value)) {
    return fail("LEXWARE_LINE_REQUIRED_FIELD_MISSING", "Die Lexware-Position ist unvollständig.");
  }
  const payloadLineItem = parseLexwarePayloadLineItem(value);
  return {
    ...payloadLineItem,
    lineItemAmount: value.lineItemAmount,
  };
}

function decimalText(value: unknown, field: string) {
  if (typeof value !== "string" && typeof value !== "number") {
    return fail("LEXWARE_LINE_DECIMAL_MISSING", `${field} fehlt.`);
  }
  const text = String(value).trim();
  if (!/^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) {
    return fail("LEXWARE_LINE_DECIMAL_INVALID", `${field} ist kein kanonischer Dezimalwert.`);
  }
  return text;
}

export function parseLexwareScaledDecimal(
  value: unknown,
  scale: number,
  field: string,
) {
  const text = decimalText(value, field);
  const negative = text.startsWith("-");
  const unsigned = text.replace(/^[+-]/, "");
  const [whole, fraction = ""] = unsigned.split(".");
  if (fraction.length > scale && /[1-9]/.test(fraction.slice(scale))) {
    return fail("LEXWARE_LINE_DECIMAL_PRECISION_INVALID", `${field} besitzt zu viele Dezimalstellen.`);
  }
  const scaled = BigInt(whole) * (10n ** BigInt(scale))
    + BigInt((fraction.slice(0, scale) + "0".repeat(scale)).slice(0, scale) || "0");
  return negative && scaled !== 0n ? -scaled : scaled;
}

function requiredText(value: unknown, field: string) {
  if (typeof value !== "string") {
    return fail("LEXWARE_LINE_TEXT_MISSING", `${field} fehlt.`);
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return fail("LEXWARE_LINE_TEXT_INVALID", `${field} ist leer.`);
  }
  return normalized;
}

function normalizeUnit(value: unknown) {
  return requiredText(value, "unitName").toLocaleLowerCase("de-DE");
}

export function buildCanonicalLexwareLineSignature(
  line: LexwareLineItemSignatureInput,
) {
  if (!line.unitPrice) {
    return fail("LEXWARE_LINE_UNIT_PRICE_MISSING", "unitPrice fehlt.");
  }
  const type = requiredText(line.type, "type").toLowerCase();
  const quantity = parseLexwareScaledDecimal(line.quantity, 4, "quantity");
  if (quantity <= 0n) {
    return fail("LEXWARE_LINE_QUANTITY_INVALID", "quantity muss positiv sein.");
  }
  const currency = requiredText(line.unitPrice.currency, "currency").toUpperCase();
  if (currency !== "EUR") {
    return fail("LEXWARE_LINE_CURRENCY_INVALID", "currency muss EUR sein.");
  }
  const grossUnitAmount = parseLexwareScaledDecimal(
    line.unitPrice.grossAmount,
    4,
    "unitPrice.grossAmount",
  );
  const taxRate = parseLexwareScaledDecimal(
    line.unitPrice.taxRatePercentage,
    2,
    "unitPrice.taxRatePercentage",
  );
  if (taxRate < 0n) {
    return fail("LEXWARE_LINE_TAX_RATE_INVALID", "taxRatePercentage darf nicht negativ sein.");
  }
  const discount = parseLexwareScaledDecimal(
    line.discountPercentage,
    2,
    "discountPercentage",
  );
  if (discount < 0n || discount > 10_000n) {
    return fail("LEXWARE_LINE_DISCOUNT_INVALID", "discountPercentage liegt außerhalb 0 bis 100 Prozent.");
  }
  return [
    `t:${type.length}:${type}`,
    `q:${quantity}`,
    `u:${normalizeUnit(line.unitName).length}:${normalizeUnit(line.unitName)}`,
    "c:3:EUR",
    `g:${grossUnitAmount}`,
    `r:${taxRate}`,
    `d:${discount}`,
  ].join("|");
}

export function validateLexwareReadBackLineAmount(
  line: LexwareReadBackLineItemInput,
) {
  if (!line.unitPrice) {
    return fail("LEXWARE_LINE_UNIT_PRICE_MISSING", "unitPrice fehlt.");
  }
  const grossUnitAmount = parseLexwareScaledDecimal(
    line.unitPrice.grossAmount,
    4,
    "unitPrice.grossAmount",
  );
  const lineItemAmount = parseLexwareScaledDecimal(
    line.lineItemAmount,
    2,
    "lineItemAmount",
  );
  if (
    (grossUnitAmount > 0n && lineItemAmount < 0n)
    || (grossUnitAmount < 0n && lineItemAmount > 0n)
    || (grossUnitAmount === 0n && lineItemAmount !== 0n)
  ) {
    return fail(
      "LEXWARE_LINE_AMOUNT_SIGN_MISMATCH",
      "Vorzeichen von unitPrice.grossAmount und lineItemAmount widersprechen sich.",
    );
  }
  return lineItemAmount;
}

export function buildLexwareLineSignatureMultiset(
  lines: LexwareLineItemSignatureInput[],
  options: { validateReadBackLineAmounts?: boolean } = {},
) {
  const multiset = new Map<string, number>();
  for (const line of lines) {
    if (options.validateReadBackLineAmounts) {
      validateLexwareReadBackLineAmount(parseLexwareReadBackLineItem(line));
    }
    const signature = buildCanonicalLexwareLineSignature(line);
    multiset.set(signature, (multiset.get(signature) ?? 0) + 1);
  }
  return multiset;
}

export function compareLexwareLineSignatureMultisets(
  expectedLines: LexwareLineItemSignatureInput[],
  actualLines: LexwareReadBackLineItemInput[],
): LexwareLineItemMultisetDifference {
  const expected = buildLexwareLineSignatureMultiset(expectedLines);
  const actual = buildLexwareLineSignatureMultiset(actualLines, {
    validateReadBackLineAmounts: true,
  });
  const missingSignatures: Array<{ signature: string; count: number }> = [];
  const unexpectedSignatures: Array<{ signature: string; count: number }> = [];
  for (const [signature, expectedCount] of expected) {
    const actualCount = actual.get(signature) ?? 0;
    if (actualCount < expectedCount) {
      missingSignatures.push({ signature, count: expectedCount - actualCount });
    }
  }
  for (const [signature, actualCount] of actual) {
    const expectedCount = expected.get(signature) ?? 0;
    if (actualCount > expectedCount) {
      unexpectedSignatures.push({ signature, count: actualCount - expectedCount });
    }
  }
  return {
    missingSignatures,
    unexpectedSignatures,
    countMismatch: missingSignatures.length > 0 || unexpectedSignatures.length > 0,
  };
}
