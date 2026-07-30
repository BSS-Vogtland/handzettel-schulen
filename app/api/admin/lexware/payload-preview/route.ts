import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  requireAdminApiSession,
} from "@/app/lib/adminApiAuth";

import {
  buildLexwareInvoicePayload,
  LexwareInvoicePayloadError,
  type LocalLexwareInvoiceItemSnapshot,
  type LocalLexwareInvoiceSnapshot,
} from "@/app/lib/lexware/lexwareInvoicePayloadBuilder";

import {
  LexwareInvoicePayloadValidationError,
  requireValidLexwareInvoicePayload,
} from "@/app/lib/lexware/lexwareInvoicePayloadValidator";

import {
  supabaseServer,
} from "@/lib/supabase/server";

/*
 * LEXWARE_INVOICE_PAYLOAD_PREVIEW_READ_ONLY_V2
 *
 * Diese Route:
 * - liest eine vorhandene lokale Rechnung,
 * - liest ihre unveränderlichen Positions- und Steuersnapshots,
 * - erzeugt den späteren Lexware-Request-Payload,
 * - validiert den erzeugten Payload unabhängig,
 * - führt KEINEN Lexware-Aufruf aus,
 * - schreibt NICHT nach Supabase,
 * - erzeugt KEINE Rechnung,
 * - versendet KEINE E-Mail.
 */

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const ROUTE_VERSION =
  "lexware-invoice-payload-preview-read-only-v2";

const DEFAULT_TEST_INVOICE_NUMBER =
  "HSR-2026-00008";

const NO_STORE_HEADERS = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, max-age=0",
};

type InvoiceLookupResult = {
  invoice:
    LocalLexwareInvoiceSnapshot;

  items:
    LocalLexwareInvoiceItemSnapshot[];
};

type PreviewFailureKind =
  | "payload_builder"
  | "payload_validator"
  | "database"
  | "unknown";

type PreviewFailure = {
  kind:
    PreviewFailureKind;

  code: string;
  message: string;

  details:
    | Record<string, unknown>
    | null;
};

function cleanText(
  value: unknown,
) {
  const text =
    String(value ?? "").trim();

  return text.length > 0
    ? text
    : null;
}

async function loadInvoiceSnapshot(
  invoiceNumber: string,
): Promise<InvoiceLookupResult> {
  const {
    data: invoiceData,
    error: invoiceError,
  } =
    await supabaseServer
      .from(
        "school_request_invoices",
      )
      .select(
        [
          "id",
          "request_id",
          "invoice_number",
          "invoice_provider",
          "invoice_cutover_version",
          "selected_payment_method",
          "fulfillment_method_snapshot",
          "billing_name_snapshot",
          "billing_street_snapshot",
          "billing_postal_code_snapshot",
          "billing_city_snapshot",
          "customer_email_snapshot",
          "child_name_snapshot",
          "school_name_snapshot",
          "class_name_snapshot",
          "customer_note",
          "admin_note",
          "subtotal_amount",
          "shipping_amount",
          "book_shipping_amount",
          "book_cover_amount",
          "discount_amount",
          "total_amount",
          "currency",
          "tax_snapshot_status",
          "tax_snapshot_source",
          "tax_snapshot_version",
          "tax_snapshot_at",
          "tax_breakdown_snapshot",
          "total_net_amount_snapshot",
          "total_tax_amount_snapshot",
          "created_at",
        ].join(", "),
      )
      .eq(
        "invoice_number",
        invoiceNumber,
      )
      .maybeSingle();

  if (invoiceError) {
    const error =
      new Error(
        "Die lokale Rechnung konnte nicht geladen werden: " +
          invoiceError.message,
      );

    error.name =
      "LexwarePayloadPreviewDatabaseError";

    throw error;
  }

  if (!invoiceData) {
    const error =
      new Error(
        `Die Rechnung ${invoiceNumber} wurde nicht gefunden.`,
      );

    error.name =
      "LexwarePayloadPreviewDatabaseError";

    throw error;
  }

  const invoice =
    invoiceData as unknown as
      LocalLexwareInvoiceSnapshot;

  const {
    data: itemData,
    error: itemError,
  } =
    await supabaseServer
      .from(
        "school_request_invoice_items",
      )
      .select(
        [
          "id",
          "invoice_id",
          "product_id",
          "product_name",
          "product_sku",
          "quantity",
          "unit",
          "unit_price",
          "total_price",
          "tax_rate_snapshot",
          "product_gross_amount_snapshot",
          "product_net_amount_snapshot",
          "product_tax_amount_snapshot",
          "tax_snapshot_source",
          "tax_snapshot_version",
          "tax_snapshot_at",
          "is_book_snapshot",
          "book_isbn13_snapshot",
          "book_cover_selected",
          "book_cover_name_snapshot",
          "book_cover_quantity",
          "book_cover_unit_price",
          "book_cover_total_price",
          "book_cover_tax_rate_snapshot",
          "book_cover_net_amount_snapshot",
          "book_cover_tax_amount_snapshot",
          "source",
          "notes",
          "created_at",
        ].join(", "),
      )
      .eq(
        "invoice_id",
        invoice.id,
      )
      .order(
        "created_at",
        {
          ascending:
            true,
        },
      );

  if (itemError) {
    const error =
      new Error(
        "Die Rechnungspositionen konnten nicht geladen werden: " +
          itemError.message,
      );

    error.name =
      "LexwarePayloadPreviewDatabaseError";

    throw error;
  }

  const items =
    (
      itemData || []
    ) as unknown as
      LocalLexwareInvoiceItemSnapshot[];

  if (items.length === 0) {
    const error =
      new Error(
        `Die Rechnung ${invoiceNumber} besitzt keine Rechnungspositionen.`,
      );

    error.name =
      "LexwarePayloadPreviewDatabaseError";

    throw error;
  }

  return {
    invoice,
    items,
  };
}

function getErrorPayload(
  error: unknown,
): PreviewFailure {
  if (
    error instanceof
    LexwareInvoicePayloadError
  ) {
    return {
      kind:
        "payload_builder",

      code:
        error.code,

      message:
        error.message,

      details:
        error.details,
    };
  }

  if (
    error instanceof
    LexwareInvoicePayloadValidationError
  ) {
    return {
      kind:
        "payload_validator",

      code:
        error.code,

      message:
        error.message,

      details: {
        version:
          error.validation
            .version,

        valid:
          error.validation
            .valid,

        failedCheckCount:
          error.validation
            .failedChecks
            .length,

        failedChecks:
          error.validation
            .failedChecks,

        calculated:
          error.validation
            .calculated,
      },
    };
  }

  if (
    error instanceof Error &&
    error.name ===
      "LexwarePayloadPreviewDatabaseError"
  ) {
    return {
      kind:
        "database",

      code:
        "LEXWARE_PAYLOAD_PREVIEW_DATABASE_ERROR",

      message:
        error.message,

      details:
        null,
    };
  }

  return {
    kind:
      "unknown",

    code:
      "LEXWARE_PAYLOAD_PREVIEW_FAILED",

    message:
      error instanceof Error
        ? error.message
        : "Der Lexware-Payload konnte nicht erzeugt werden.",

    details:
      null,
  };
}

function getFailureStatus(
  failure:
    PreviewFailure,
) {
  if (
    failure.kind ===
      "payload_builder" ||
    failure.kind ===
      "payload_validator"
  ) {
    return 422;
  }

  if (
    failure.kind ===
    "database"
  ) {
    return 500;
  }

  return 500;
}

export async function GET(
  request: NextRequest,
) {
  const unauthorized =
    await requireAdminApiSession();

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const requestUrl =
      new URL(
        request.url,
      );

    const invoiceNumber =
      cleanText(
        requestUrl
          .searchParams
          .get(
            "invoiceNumber",
          ),
      ) ||
      DEFAULT_TEST_INVOICE_NUMBER;

    const {
      invoice,
      items,
    } =
      await loadInvoiceSnapshot(
        invoiceNumber,
      );

    /*
     * Reine Transformation:
     *
     * Kein Netzwerkaufruf.
     * Keine Datenbankänderung.
     * Kein Lexware-Write.
     */
    const result =
      buildLexwareInvoicePayload({
        invoice,
        items,

        paymentTermDays:
          7,

        introduction:
          "Deine bestellten Schulmaterialien stellen wir Dir hiermit in Rechnung.",

        remark:
          "Vielen Dank für Deine Bestellung bei Handzettel-Schulen.de.",
      });

    /*
     * Unabhängige zweite Prüfung des erzeugten Payloads.
     *
     * Der spätere Write-Client darf nur einen Payload verwenden,
     * der diese Prüfung vollständig bestanden hat.
     */
    const validation =
      requireValidLexwareInvoicePayload(
        result,
      );

    return NextResponse.json(
      {
        ok:
          true,

        readOnly:
          true,

        writeOperationsPerformed:
          false,

        lexwareRequestsPerformed:
          0,

        databaseWritesPerformed:
          0,

        version:
          ROUTE_VERSION,

        checkedAt:
          new Date()
            .toISOString(),

        localInvoice: {
          id:
            invoice.id,

          invoiceNumber:
            invoice
              .invoice_number,

          invoiceProvider:
            invoice
              .invoice_provider,

          invoiceCutoverVersion:
            invoice
              .invoice_cutover_version,

          selectedPaymentMethod:
            invoice
              .selected_payment_method,

          fulfillmentMethod:
            invoice
              .fulfillment_method_snapshot,

          taxSnapshotStatus:
            invoice
              .tax_snapshot_status,

          taxSnapshotSource:
            invoice
              .tax_snapshot_source,

          taxSnapshotVersion:
            invoice
              .tax_snapshot_version,

          taxSnapshotAt:
            invoice
              .tax_snapshot_at,

          itemCount:
            items.length,
        },

        builder: {
          version:
            result.version,

          metadata:
            result.metadata,

          expected:
            result.expected,
        },

        validator: {
          version:
            validation.version,

          valid:
            validation.valid,

          checkCount:
            validation
              .checks
              .length,

          failedCheckCount:
            validation
              .failedChecks
              .length,

          failedChecks:
            validation
              .failedChecks,

          calculated:
            validation
              .calculated,
        },

        payload:
          result.payload,
      },
      {
        status:
          200,

        headers:
          NO_STORE_HEADERS,
      },
    );
  } catch (error) {
    const failure =
      getErrorPayload(
        error,
      );

    console.error(
      "lexware_invoice_payload_preview_failed",
      {
        kind:
          failure.kind,

        code:
          failure.code,

        message:
          failure.message,

        details:
          failure.details,
      },
    );

    return NextResponse.json(
      {
        ok:
          false,

        readOnly:
          true,

        writeOperationsPerformed:
          false,

        lexwareRequestsPerformed:
          0,

        databaseWritesPerformed:
          0,

        version:
          ROUTE_VERSION,

        error:
          failure,
      },
      {
        status:
          getFailureStatus(
            failure,
          ),

        headers:
          NO_STORE_HEADERS,
      },
    );
  }
}

export async function POST() {
  const unauthorized =
    await requireAdminApiSession();

  if (unauthorized) {
    return unauthorized;
  }

  return NextResponse.json(
    {
      ok:
        false,

      readOnly:
        true,

      writeOperationsPerformed:
        false,

      lexwareRequestsPerformed:
        0,

      databaseWritesPerformed:
        0,

      version:
        ROUTE_VERSION,

      message:
        "Diese Route ist ausschließlich read-only und kann nur per GET verwendet werden.",
    },
    {
      status:
        405,

      headers: {
        ...NO_STORE_HEADERS,

        Allow:
          "GET",
      },
    },
  );
}