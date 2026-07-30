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
  createLexwareTestDraftInvoice,
  LEXWARE_TEST_DRAFT_WRITE_CONFIRMATION,
  LexwareInvoiceWriteError,
} from "@/app/lib/lexware/lexwareInvoiceWriteClient";

import {
  supabaseServer,
} from "@/lib/supabase/server";

/*
 * LEXWARE_CREATE_TEST_DRAFT_ROUTE_V1
 *
 * Diese Route:
 * - ist ausschließlich für den isolierten Lexware-Testmandanten gedacht,
 * - lädt eine bereits vorhandene lokale Rechnung,
 * - erzeugt daraus den Lexware-Payload,
 * - validiert den Payload vollständig,
 * - erzeugt danach genau einen Lexware-Rechnungsentwurf,
 * - finalisiert die Rechnung ausdrücklich NICHT,
 * - schreibt keinerlei Lexware-Daten zurück nach Supabase,
 * - versendet keine E-Mail,
 * - verändert die lokale Rechnung nicht.
 *
 * WICHTIG:
 * Ein erfolgreicher POST erzeugt tatsächlich einen Entwurf
 * im konfigurierten Lexware-Testmandanten.
 */

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const ROUTE_VERSION =
  "lexware-create-test-draft-route-v1";

const NO_STORE_HEADERS = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, max-age=0",
};

type CreateTestDraftRequestBody = {
  invoiceNumber?: unknown;
  confirmation?: unknown;
};

type InvoiceLookupResult = {
  invoice:
    LocalLexwareInvoiceSnapshot;

  items:
    LocalLexwareInvoiceItemSnapshot[];
};

type RouteFailureKind =
  | "request"
  | "database"
  | "payload_builder"
  | "payload_validator"
  | "lexware_write"
  | "unknown";

type RouteFailure = {
  kind:
    RouteFailureKind;

  code:
    string;

  message:
    string;

  details:
    Record<string, unknown> |
    null;
};

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

function createRouteError(
  code: string,
  message: string,
  details?:
    Record<string, unknown>,
) {
  const error =
    new Error(
      message,
    ) as Error & {
      code?: string;
      details?: Record<string, unknown>;
    };

  error.name =
    "LexwareCreateTestDraftRouteError";

  error.code =
    code;

  error.details =
    details;

  return error;
}

async function readJsonBody(
  request:
    NextRequest,
): Promise<CreateTestDraftRequestBody> {
  const contentType =
    request.headers
      .get(
        "content-type",
      )
      ?.toLowerCase() ||
    "";

  if (
    !contentType.includes(
      "application/json",
    )
  ) {
    throw createRouteError(
      "LEXWARE_TEST_DRAFT_CONTENT_TYPE_INVALID",
      "Der Request muss Content-Type application/json verwenden.",
      {
        receivedContentType:
          contentType ||
          null,
      },
    );
  }

  let body:
    unknown;

  try {
    body =
      await request.json();
  } catch {
    throw createRouteError(
      "LEXWARE_TEST_DRAFT_JSON_INVALID",
      "Der Request-Body enthält kein gültiges JSON.",
    );
  }

  if (
    typeof body !==
      "object" ||
    body ===
      null ||
    Array.isArray(
      body,
    )
  ) {
    throw createRouteError(
      "LEXWARE_TEST_DRAFT_BODY_INVALID",
      "Der Request-Body muss ein JSON-Objekt sein.",
    );
  }

  return body as
    CreateTestDraftRequestBody;
}

function requireValidRequestBody(
  body:
    CreateTestDraftRequestBody,
) {
  const invoiceNumber =
    cleanText(
      body.invoiceNumber,
    );

  const confirmation =
    cleanText(
      body.confirmation,
    );

  if (!invoiceNumber) {
    throw createRouteError(
      "LEXWARE_TEST_DRAFT_INVOICE_NUMBER_MISSING",
      "Die lokale Rechnungsnummer fehlt.",
    );
  }

  if (
    invoiceNumber.length >
    100
  ) {
    throw createRouteError(
      "LEXWARE_TEST_DRAFT_INVOICE_NUMBER_TOO_LONG",
      "Die lokale Rechnungsnummer ist zu lang.",
      {
        actualLength:
          invoiceNumber.length,
      },
    );
  }

  if (
    confirmation !==
    LEXWARE_TEST_DRAFT_WRITE_CONFIRMATION
  ) {
    throw createRouteError(
      "LEXWARE_TEST_DRAFT_CONFIRMATION_INVALID",
      "Die Bestätigungsphrase für den Lexware-Testentwurf fehlt oder ist ungültig.",
      {
        requiredConfirmation:
          LEXWARE_TEST_DRAFT_WRITE_CONFIRMATION,
      },
    );
  }

  return {
    invoiceNumber,

    confirmation:
      LEXWARE_TEST_DRAFT_WRITE_CONFIRMATION,
  };
}

async function loadInvoiceSnapshot(
  invoiceNumber:
    string,
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
        ].join(
          ", ",
        ),
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
      "LexwareCreateTestDraftDatabaseError";

    throw error;
  }

  if (!invoiceData) {
    const error =
      new Error(
        `Die lokale Rechnung ${invoiceNumber} wurde nicht gefunden.`,
      );

    error.name =
      "LexwareCreateTestDraftDatabaseError";

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
        ].join(
          ", ",
        ),
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
      "LexwareCreateTestDraftDatabaseError";

    throw error;
  }

  const items =
    (
      itemData ||
      []
    ) as unknown as
      LocalLexwareInvoiceItemSnapshot[];

  if (
    items.length ===
    0
  ) {
    const error =
      new Error(
        `Die lokale Rechnung ${invoiceNumber} besitzt keine Rechnungspositionen.`,
      );

    error.name =
      "LexwareCreateTestDraftDatabaseError";

    throw error;
  }

  return {
    invoice,
    items,
  };
}

function getErrorPayload(
  error:
    unknown,
): RouteFailure {
  if (
    error instanceof
      Error &&
    error.name ===
      "LexwareCreateTestDraftRouteError"
  ) {
    const typedError =
      error as Error & {
        code?: string;
        details?: Record<string, unknown>;
      };

    return {
      kind:
        "request",

      code:
        typedError.code ||
        "LEXWARE_TEST_DRAFT_REQUEST_INVALID",

      message:
        typedError.message,

      details:
        typedError.details ||
        null,
    };
  }

  if (
    error instanceof
      Error &&
    error.name ===
      "LexwareCreateTestDraftDatabaseError"
  ) {
    return {
      kind:
        "database",

      code:
        "LEXWARE_TEST_DRAFT_DATABASE_ERROR",

      message:
        error.message,

      details:
        null,
    };
  }

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
    error instanceof
    LexwareInvoiceWriteError
  ) {
    return {
      kind:
        "lexware_write",

      code:
        error.code,

      message:
        error.message,

      details: {
        mode:
          error.mode,

        resourcePath:
          error.resourcePath,

        httpStatus:
          error.httpStatus,

        retryAfterSeconds:
          error.retryAfterSeconds,

        responsePayload:
          error.responsePayload,
      },
    };
  }

  return {
    kind:
      "unknown",

    code:
      "LEXWARE_TEST_DRAFT_CREATION_FAILED",

    message:
      error instanceof Error
        ? error.message
        : "Der Lexware-Testentwurf konnte nicht erzeugt werden.",

    details:
      null,
  };
}

function getFailureStatus(
  failure:
    RouteFailure,
) {
  if (
    failure.kind ===
    "request"
  ) {
    return 400;
  }

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
    "lexware_write"
  ) {
    if (
      failure.code ===
      "LEXWARE_TEST_WRITE_ENVIRONMENT_UNSAFE"
    ) {
      return 503;
    }

    const lexwareStatus =
      Number(
        failure.details
          ?.httpStatus,
      );

    if (
      Number.isInteger(
        lexwareStatus,
      ) &&
      lexwareStatus >=
        400 &&
      lexwareStatus <=
        599
    ) {
      return lexwareStatus;
    }

    return 502;
  }

  return 500;
}

export async function POST(
  request:
    NextRequest,
) {
  const unauthorized =
    await requireAdminApiSession();

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const body =
      await readJsonBody(
        request,
      );

    const {
      invoiceNumber,
      confirmation,
    } =
      requireValidRequestBody(
        body,
      );

    /*
     * Schritt 1:
     * Bereits vorhandenen lokalen Rechnungssnapshot laden.
     *
     * Es findet dabei keine Datenbankänderung statt.
     */
    const {
      invoice,
      items,
    } =
      await loadInvoiceSnapshot(
        invoiceNumber,
      );

    /*
     * Schritt 2:
     * Deterministischen Lexware-Payload erzeugen.
     */
    const buildResult =
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
     * Schritt 3:
     * Payload unabhängig validieren.
     *
     * Bei nur einer fehlgeschlagenen Prüfung
     * wird kein Lexware-Aufruf ausgeführt.
     */
    const validation =
      requireValidLexwareInvoicePayload(
        buildResult,
      );

    /*
     * Schritt 4:
     * Tatsächlichen Entwurf im isolierten
     * Lexware-Testmandanten erzeugen.
     *
     * finalize muss ausdrücklich false bleiben.
     */
    const writeResult =
      await createLexwareTestDraftInvoice({
        payload:
          buildResult.payload,

        finalize:
          false,

        confirmation,
      });

    /*
     * Es wird bewusst keine Lexware-ID
     * in Supabase gespeichert.
     *
     * Diese Route dient ausschließlich
     * dem ersten kontrollierten API-Test.
     */
    return NextResponse.json(
      {
        ok:
          true,

        testWritePerformed:
          true,

        lexwareRequestsPerformed:
          1,

        databaseReadsPerformed:
          true,

        databaseWritesPerformed:
          0,

        mailOperationsPerformed:
          0,

        invoiceFinalized:
          false,

        version:
          ROUTE_VERSION,

        completedAt:
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
            buildResult.version,

          metadata:
            buildResult.metadata,

          expected:
            buildResult.expected,
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

          calculated:
            validation
              .calculated,
        },

        lexware: {
          clientVersion:
            writeResult.version,

          mode:
            writeResult.mode,

          finalize:
            writeResult.finalize,

          request: {
            method:
              writeResult
                .request
                .method,

            resourcePath:
              writeResult
                .request
                .resourcePath,

            organizationId:
              writeResult
                .request
                .organizationId,
          },

          response:
            writeResult.response,

          createdAt:
            writeResult.createdAt,
        },
      },
      {
        status:
          201,

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
      "lexware_create_test_draft_failed",
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

        testWritePerformed:
          false,

        databaseWritesPerformed:
          0,

        mailOperationsPerformed:
          0,

        invoiceFinalized:
          false,

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

export async function GET() {
  const unauthorized =
    await requireAdminApiSession();

  if (unauthorized) {
    return unauthorized;
  }

  return NextResponse.json(
    {
      ok:
        false,

      testWritePerformed:
        false,

      databaseWritesPerformed:
        0,

      mailOperationsPerformed:
        0,

      invoiceFinalized:
        false,

      version:
        ROUTE_VERSION,

      message:
        "Diese Route erzeugt ausschließlich über einen ausdrücklich bestätigten POST einen Lexware-Testentwurf.",

      requiredRequest: {
        method:
          "POST",

        contentType:
          "application/json",

        body: {
          invoiceNumber:
            "HSR-2026-00008",

          confirmation:
            LEXWARE_TEST_DRAFT_WRITE_CONFIRMATION,
        },
      },
    },
    {
      status:
        405,

      headers: {
        ...NO_STORE_HEADERS,

        Allow:
          "POST",
      },
    },
  );
}