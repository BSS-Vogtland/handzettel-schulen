import "server-only";

import {
  buildEligibleLocalInvoice,
  LexwareProductionInvoiceJobRepositoryError,
} from "./lexwareProductionInvoiceJobRepository";
import type {
  LocalLexwareInvoiceItemSnapshot,
  LocalLexwareInvoiceSnapshot,
} from "./lexwareInvoicePayloadBuilder";

type RpcClient = {
  rpc(name: string, parameters: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: { message?: string } | null;
  }>;
};

type NativeInvoiceInput = LocalLexwareInvoiceSnapshot & {
  id: string;
  invoice_status: string;
  payment_status: string;
  lexware_invoice_job_id?: null;
};

type NativeStagingRow = {
  invoice_id: string;
  invoice_number: string;
  invoice_token: string;
  invoice_status: string;
  payment_status: string;
  invoice_job_id: string;
  job_status: "pending";
  job_creation_state: "not_attempted";
};

function parseResult(value: unknown): NativeStagingRow {
  const row = (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | null;
  if (!row
      || typeof row.invoice_id !== "string"
      || typeof row.invoice_number !== "string"
      || typeof row.invoice_token !== "string"
      || typeof row.invoice_job_id !== "string"
      || row.job_status !== "pending"
      || row.job_creation_state !== "not_attempted") {
    throw new LexwareProductionInvoiceJobRepositoryError(
      "NATIVE_CHECKOUT_STAGING_RESULT_INVALID",
      "Die atomare native Lexware-Vorbereitung lieferte kein gültiges Ergebnis.",
    );
  }
  return row as NativeStagingRow;
}

export async function stageNativeLexwareCheckoutInvoice(input: {
  client: RpcClient;
  invoice: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
}) {
  const prepared = buildEligibleLocalInvoice({
    invoice: input.invoice as NativeInvoiceInput,
    items: input.items as LocalLexwareInvoiceItemSnapshot[],
  });
  const { data, error } = await input.client.rpc(
    "stage_native_lexware_checkout_invoice",
    {
      p_invoice: input.invoice,
      p_items: input.items,
      p_payload_snapshot: prepared.built,
      p_payload_sha256: prepared.payloadSha256,
      p_payload_hash_version: prepared.payloadHashVersion,
    },
  );
  if (error) {
    throw new LexwareProductionInvoiceJobRepositoryError(
      "NATIVE_CHECKOUT_STAGING_FAILED",
      error.message || "Native Lexware-Rechnung und Job konnten nicht atomar vorbereitet werden.",
    );
  }
  const result = parseResult(data);
  if (result.invoice_id !== input.invoice.id) {
    throw new LexwareProductionInvoiceJobRepositoryError(
      "NATIVE_CHECKOUT_STAGING_IDENTITY_MISMATCH",
      "Das atomare Ergebnis gehört nicht zur vorbereiteten Rechnung.",
    );
  }
  return result;
}
