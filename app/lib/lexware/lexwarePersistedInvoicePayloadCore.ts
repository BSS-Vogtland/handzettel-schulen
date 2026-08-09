import type { LexwareInvoicePayloadBuildResult } from "./lexwareProductionInvoiceProcessorCore";

function validatePaymentConditions(
  value: Record<string, unknown>,
): asserts value is Record<string, unknown> & { paymentTermLabel: string } {
  if (typeof value.paymentTermLabel !== "string") throw new Error("PERSISTED_PAYLOAD_INVALID");
}

export function parsePersistedLexwareInvoicePayload<TLineItem extends Record<string, unknown>>(
  value: unknown,
  validateLineItem: (value: unknown) => TLineItem,
): LexwareInvoicePayloadBuildResult<TLineItem> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PERSISTED_PAYLOAD_INVALID");
  const row = value as Record<string, unknown>;
  if (!row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)
      || !row.expected || typeof row.expected !== "object" || Array.isArray(row.expected)) {
    throw new Error("PERSISTED_PAYLOAD_INVALID");
  }
  const payload = row.payload as Record<string, unknown>;
  const expected = row.expected as Record<string, unknown>;
  if (!Array.isArray(payload.lineItems)
      || !payload.paymentConditions || typeof payload.paymentConditions !== "object" || Array.isArray(payload.paymentConditions)
      || typeof expected.totalGrossAmount !== "number" || typeof expected.totalNetAmount !== "number"
      || typeof expected.totalTaxAmount !== "number" || !Array.isArray(expected.taxRates)) {
    throw new Error("PERSISTED_PAYLOAD_INVALID");
  }
  const paymentConditions = payload.paymentConditions as Record<string, unknown>;
  validatePaymentConditions(paymentConditions);
  const preservedLineItems = payload.lineItems.map((lineItem) => {
    validateLineItem(lineItem);
    return lineItem as TLineItem;
  });
  const taxRates = expected.taxRates.map((bucket) => {
    if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) throw new Error("PERSISTED_PAYLOAD_INVALID");
    const rate = bucket as Record<string, unknown>;
    if (typeof rate.taxRatePercentage !== "number" || typeof rate.grossAmount !== "number"
        || typeof rate.netAmount !== "number" || typeof rate.taxAmount !== "number") throw new Error("PERSISTED_PAYLOAD_INVALID");
    return { taxRatePercentage: rate.taxRatePercentage, grossAmount: rate.grossAmount, netAmount: rate.netAmount, taxAmount: rate.taxAmount };
  });
  return {
    payload: {
      ...payload,
      lineItems: preservedLineItems,
      paymentConditions,
    },
    expected: {
      totalGrossAmount: expected.totalGrossAmount,
      totalNetAmount: expected.totalNetAmount,
      totalTaxAmount: expected.totalTaxAmount,
      taxRates,
    },
  };
}
