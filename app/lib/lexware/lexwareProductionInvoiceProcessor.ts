import {
  compareLexwareLineSignatureMultisets,
  LexwareLineItemSignatureError,
  parseLexwareReadBackLineItem,
  type LexwareLineItemSignatureInput,
} from "./lexwareLineItemMultisetCore";
import {
  processLexwareProductionInvoiceCore,
  type LexwareInvoicePayloadBuildResult,
  type LexwareInvoiceReadModel,
  type ProcessorDependencies,
  type ProcessorResult,
} from "./lexwareProductionInvoiceProcessorCore";

export type {
  JobTransition,
  LexwareInvoiceCreationState,
  LexwareInvoiceJobStatus,
  LexwareProductionGateResult,
  ProcessorDependencies,
  ProcessorResult,
  ProductionInvoiceJob,
  ProductionInvoiceRecord,
} from "./lexwareProductionInvoiceProcessorCore";

const cents = (value: number | null) => value === null ? null : Math.round(value * 100);

export function compareLexwareOpenInvoiceReadBack(
  invoice: LexwareInvoiceReadModel,
  payload: LexwareInvoicePayloadBuildResult<LexwareLineItemSignatureInput>,
  organizationId: string,
): string[] {
  const differences: string[] = [];
  if (invoice.voucherStatus !== "open") differences.push("voucher_status_not_open");
  if (invoice.organizationId !== organizationId.toLowerCase()) differences.push("organization_mismatch");
  if (invoice.totalPrice.currency !== "EUR") differences.push("currency_not_eur");
  if (invoice.lineItems.length !== payload.payload.lineItems.length) differences.push("line_item_count_mismatch");
  try {
    const lineDifference = compareLexwareLineSignatureMultisets(
      payload.payload.lineItems,
      invoice.lineItems.map(parseLexwareReadBackLineItem),
    );
    if (lineDifference.countMismatch) {
      differences.push(
        `line_item_multiset_mismatch:missing=${lineDifference.missingSignatures.reduce((sum, entry) => sum + entry.count, 0)}:unexpected=${lineDifference.unexpectedSignatures.reduce((sum, entry) => sum + entry.count, 0)}`,
      );
    }
  } catch (error) {
    differences.push(
      error instanceof LexwareLineItemSignatureError
        ? `line_item_invalid:${error.code}`
        : "line_item_invalid",
    );
  }
  if (cents(invoice.totalPrice.totalGrossAmount) !== cents(payload.expected.totalGrossAmount)) differences.push("total_gross_mismatch");
  if (cents(invoice.totalPrice.totalNetAmount) !== cents(payload.expected.totalNetAmount)) differences.push("total_net_mismatch");
  if (cents(invoice.totalPrice.totalTaxAmount) !== cents(payload.expected.totalTaxAmount)) differences.push("total_tax_mismatch");
  for (const rate of [7, 19]) {
    const expected = payload.expected.taxRates.find(entry => entry.taxRatePercentage === rate);
    const actual = invoice.taxAmounts.find(entry => entry.taxRatePercentage === rate);
    if (
      Boolean(expected) !== Boolean(actual)
      || (
        expected
        && actual
        && (
          cents(expected.netAmount) !== cents(actual.netAmount)
          || cents(expected.taxAmount) !== cents(actual.taxAmount)
          || cents(expected.grossAmount) !== ((cents(actual.netAmount) ?? 0) + (cents(actual.taxAmount) ?? 0))
        )
      )
    ) differences.push(`tax_bucket_${rate}_mismatch`);
  }
  if (invoice.paymentTermLabel !== payload.payload.paymentConditions.paymentTermLabel) differences.push("payment_terms_mismatch");
  return differences;
}

export function processLexwareProductionInvoice(
  deps: ProcessorDependencies<LexwareLineItemSignatureInput>,
): Promise<ProcessorResult> {
  return processLexwareProductionInvoiceCore(deps);
}
