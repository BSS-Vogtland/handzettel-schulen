import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  calculateBookCommerceSummary,
  getBookCommerceLineSnapshot,
  roundBookCommerceMoney,
  toBookCommerceNumber,
} from "@/lib/bookCommerce";
import {
  buildCheckoutInvoiceTaxSnapshot,
  InvoiceTaxCheckoutAdapterError,
  type CheckoutInvoiceTaxSnapshotResult,
} from "@/lib/invoiceTaxCheckoutAdapter";
import { InvoiceTaxSnapshotError } from "@/lib/invoiceTaxSnapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

type SchoolRequestRow = {
  id: string;
  request_number: string | null;
  status: string | null;
  offer_status: string | null;
};

type OfferItemRow = {
  id: string;
  product_id: string | null;
  product_name: string;
  product_sku: string | null;
  product_price: number | string | null;
  quantity: number | string | null;
  unit: string | null;

  is_book_snapshot: boolean | null;
  book_isbn13_snapshot: string | null;

  book_cover_selected: boolean | null;
  book_cover_unit_price: number | string | null;
};

type ProductBookRow = {
  id: string;

  tax_rate: number | string | null;
  is_book: boolean | null;
  book_isbn13: string | null;
  ean: string | null;
};

type TaxPreviewSuccess = {
  status: "matched";
  adapterVersion: string;
  snapshotAt: string;
  allProvidedGrossAmountsMatch: true;
  grossAmounts: CheckoutInvoiceTaxSnapshotResult["grossAmounts"];
  grossComparisons: CheckoutInvoiceTaxSnapshotResult["grossComparisons"];
  taxBreakdown: CheckoutInvoiceTaxSnapshotResult["taxSnapshot"]["breakdown"];
};

type TaxPreviewFailure = {
  status: "blocked";
  error: {
    name: string;
    code: string | null;
    message: string;
    details: Record<string, unknown> | null;
  };
};

type TaxPreviewResult =
  | TaxPreviewSuccess
  | TaxPreviewFailure;

const REGULAR_SHIPPING_AMOUNT = 5.95;

/*
 * Separat verkaufte BuchhÃƒÂ¼llen sind keine BÃƒÂ¼cher.
 *
 * Bis eine eigene Katalog- oder Konfigurationsquelle besteht,
 * wird die BuchhÃƒÂ¼lle deshalb ausdrÃƒÂ¼cklich mit dem deutschen
 * Regelsteuersatz behandelt.
 *
 * Die Policy ist bewusst als benannte Konstante angelegt und
 * kann spÃƒÂ¤ter zentral geÃƒÂ¤ndert oder durch ein Datenbankfeld
 * ersetzt werden.
 */
const BOOK_COVER_TAX_RATE = 19 as const;

function getSupabaseAdmin() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase-Umgebungsvariablen fehlen. PrÃƒÂ¼fe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function isRequestAlreadyOrdered(
  requestRow: SchoolRequestRow,
) {
  return (
    requestRow.status === "confirmed" ||
    requestRow.offer_status === "confirmed"
  );
}

function serializeTaxPreviewError(
  error: unknown,
): TaxPreviewFailure {
  if (
    error instanceof
      InvoiceTaxCheckoutAdapterError ||
    error instanceof
      InvoiceTaxSnapshotError
  ) {
    return {
      status: "blocked",
      error: {
        name: error.name,
        code: error.code,
        message: error.message,
        details: error.details,
      },
    };
  }

  return {
    status: "blocked",
    error: {
      name:
        error instanceof Error
          ? error.name
          : "UnknownError",

      code: null,

      message:
        error instanceof Error
          ? error.message
          : "Die parallele SteuerprÃƒÂ¼fung ist mit einem unbekannten Fehler fehlgeschlagen.",

      details: null,
    },
  };
}

function buildTaxPreview(params: {
  snapshotAt: string;

  offerItems: OfferItemRow[];

  productById: Map<
    string,
    ProductBookRow
  >;

  subtotalAmount: number;

  regularShippingAmount: number;

  bookShippingAmount: number;

  bookCoverAmount: number;

  totalAmount: number;
}): TaxPreviewResult {
  try {
    const products =
      Array.from(
        params.productById.values(),
      ).map((product) => ({
        id: product.id,

        taxRate:
          product.tax_rate,

        isBook:
          product.is_book === true,

        /*
         * school_products besitzt derzeit keine einheitliche
         * is_active-Spalte. Bereits im Paket enthaltene und
         * erfolgreich geladene Katalogprodukte werden für diese
         * read-only Parallelvalidierung als aktiv behandelt.
         */
        active:
          true,
      }));

    const lines =
      params.offerItems.map(
        (item) => ({
          key:
            item.id,

          productId:
            item.product_id,

          productName:
            item.product_name,

          quantity:
            Math.max(
              1,
              Math.trunc(
                toBookCommerceNumber(
                  item.quantity,
                  1,
                ),
              ),
            ),

          unitPriceGross:
            roundBookCommerceMoney(
              toBookCommerceNumber(
                item.product_price,
                0,
              ),
            ),

          isBookSnapshot:
            item.is_book_snapshot,

          bookCoverSelected:
            item.book_cover_selected ===
            true,

          bookCoverUnitPriceGross:
            item.book_cover_unit_price,
        }),
      );

    const result =
      buildCheckoutInvoiceTaxSnapshot({
        currency:
          "EUR",

        snapshotAt:
          params.snapshotAt,

        lines,

        products,

        regularShippingGrossAmount:
          params.regularShippingAmount,

        bookShippingGrossAmount:
          params.bookShippingAmount,

        discountGrossAmount:
          0,

        bookCoverTaxRate:
          BOOK_COVER_TAX_RATE,

        /*
         * Buchversand wird anhand der steuerlichen Werte
         * der Buchprodukte aufgeteilt.
         *
         * BuchhÃƒÂ¼llen bleiben eigenstÃƒÂ¤ndige Nebenprodukte
         * mit ihrem eigenen Steuersatz.
         */
        bookShippingAllocationScope:
          "book_products_only",

        discountAllocationScope:
          "products_only",

        expectedGrossAmounts: {
          subtotal:
            params.subtotalAmount,

          regular_shipping:
            params.regularShippingAmount,

          book_shipping:
            params.bookShippingAmount,

          book_covers:
            params.bookCoverAmount,

          discount:
            0,

          total:
            params.totalAmount,
        },

        requireExpectedGrossAmountsMatch:
          true,
      });

    return {
      status:
        "matched",

      adapterVersion:
        result.adapterVersion,

      snapshotAt:
        result.snapshotAt,

      allProvidedGrossAmountsMatch:
        true,

      grossAmounts:
        result.grossAmounts,

      grossComparisons:
        result.grossComparisons,

      taxBreakdown:
        result.taxSnapshot.breakdown,
    };
  } catch (error) {
    return serializeTaxPreviewError(
      error,
    );
  }
}

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  try {
    const { token } =
      await context.params;

    const offerToken =
      cleanString(token);

    if (!offerToken) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Kein Paketwunsch-Token ÃƒÂ¼bergeben.",
        },
        {
          status: 400,
        },
      );
    }

    const supabase =
      getSupabaseAdmin();

    const {
      data: requestData,
      error: requestError,
    } =
      await supabase
        .from("school_requests")
        .select(
          [
            "id",
            "request_number",
            "status",
            "offer_status",
          ].join(", "),
        )
        .eq(
          "offer_token",
          offerToken,
        )
        .maybeSingle();

    if (requestError) {
      return NextResponse.json(
        {
          ok: false,
          message:
            `Der Paketwunsch konnte nicht geladen werden: ${requestError.message}`,
        },
        {
          status: 500,
        },
      );
    }

    if (!requestData) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Der Paketwunsch wurde nicht gefunden.",
        },
        {
          status: 404,
        },
      );
    }

    const requestRow =
      requestData as unknown as
        SchoolRequestRow;

    if (
      isRequestAlreadyOrdered(
        requestRow,
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Dieser Paketwunsch wurde bereits verbindlich bestellt.",
        },
        {
          status: 409,
        },
      );
    }

    const {
      data: offerItemsData,
      error: offerItemsError,
    } =
      await supabase
        .from(
          "school_offer_items",
        )
        .select(
          [
            "id",
            "product_id",
            "product_name",
            "product_sku",
            "product_price",
            "quantity",
            "unit",
            "is_book_snapshot",
            "book_isbn13_snapshot",
            "book_cover_selected",
            "book_cover_unit_price",
          ].join(", "),
        )
        .eq(
          "request_id",
          requestRow.id,
        )
        .order(
          "created_at",
          {
            ascending: true,
          },
        );

    if (offerItemsError) {
      return NextResponse.json(
        {
          ok: false,
          message:
            `Die Paketpositionen konnten nicht geladen werden: ${offerItemsError.message}`,
        },
        {
          status: 500,
        },
      );
    }

    const offerItems =
      (
        offerItemsData || []
      ) as unknown as
        OfferItemRow[];

    if (
      offerItems.length === 0
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Der Paketwunsch enthÃƒÂ¤lt noch keine Produkte.",
        },
        {
          status: 409,
        },
      );
    }

    const productIds =
      Array.from(
        new Set(
          offerItems
            .map(
              (item) =>
                item.product_id,
            )
            .filter(
              (
                productId,
              ): productId is string =>
                Boolean(productId),
            ),
        ),
      );

    const productById =
      new Map<
        string,
        ProductBookRow
      >();

    if (
      productIds.length > 0
    ) {
      const {
        data: productData,
        error: productError,
      } =
        await supabase
          .from(
            "school_products",
          )
          .select(
            [
              "id",
              "tax_rate",
              "is_book",
              "book_isbn13",
              "ean",
            ].join(", "),
          )
          .in(
            "id",
            productIds,
          );

      if (productError) {
        return NextResponse.json(
          {
            ok: false,
            message:
              `Die Produkt- und Steuerinformationen konnten nicht geladen werden: ${productError.message}`,
          },
          {
            status: 500,
          },
        );
      }

      for (
        const product of
        (
          productData || []
        ) as unknown as
          ProductBookRow[]
      ) {
        productById.set(
          product.id,
          product,
        );
      }
    }

    const commerceLines =
      offerItems.map(
        (item) => {
          const product =
            item.product_id
              ? productById.get(
                  item.product_id,
                ) || null
              : null;

          return {
            quantity:
              item.quantity,

            is_book_snapshot:
              item.is_book_snapshot,

            book_isbn13_snapshot:
              item.book_isbn13_snapshot,

            is_book:
              product?.is_book ??
              null,

            book_isbn13:
              product?.book_isbn13 ||
              product?.ean ||
              null,

            book_cover_selected:
              item.book_cover_selected,

            book_cover_unit_price:
              item.book_cover_unit_price,
          };
        },
      );

    const pickupBookSummary =
      calculateBookCommerceSummary(
        commerceLines,
        "pickup",
      );

    const shippingBookSummary =
      calculateBookCommerceSummary(
        commerceLines,
        "shipping",
      );

    const subtotalAmount =
      roundBookCommerceMoney(
        offerItems.reduce(
          (
            sum,
            item,
          ) => {
            const quantity =
              Math.max(
                1,
                Math.trunc(
                  toBookCommerceNumber(
                    item.quantity,
                    1,
                  ),
                ),
              );

            const unitPrice =
              toBookCommerceNumber(
                item.product_price,
                0,
              );

            return (
              sum +
              quantity *
                unitPrice
            );
          },
          0,
        ),
      );

    const items =
      offerItems.map(
        (
          item,
          index,
        ) => {
          const product =
            item.product_id
              ? productById.get(
                  item.product_id,
                ) || null
              : null;

          const quantity =
            Math.max(
              1,
              Math.trunc(
                toBookCommerceNumber(
                  item.quantity,
                  1,
                ),
              ),
            );

          const unitPrice =
            roundBookCommerceMoney(
              toBookCommerceNumber(
                item.product_price,
                0,
              ),
            );

          const productTotal =
            roundBookCommerceMoney(
              quantity *
                unitPrice,
            );

          const bookSnapshot =
            getBookCommerceLineSnapshot({
              quantity,

              is_book_snapshot:
                item.is_book_snapshot,

              book_isbn13_snapshot:
                item.book_isbn13_snapshot,

              is_book:
                product?.is_book ??
                null,

              book_isbn13:
                product?.book_isbn13 ||
                product?.ean ||
                null,

              book_cover_selected:
                item.book_cover_selected,

              book_cover_unit_price:
                item.book_cover_unit_price,
            });

          return {
            id:
              item.id,

            position:
              index + 1,

            productId:
              item.product_id,

            productName:
              item.product_name,

            productSku:
              item.product_sku,

            quantity,

            unit:
              item.unit ||
              "Stk.",

            unitPrice,

            productTotal,

            isBook:
              bookSnapshot
                .isBookSnapshot,

            bookIsbn13:
              bookSnapshot
                .bookIsbn13Snapshot,

            bookCoverSelected:
              bookSnapshot
                .bookCoverSelected,

            bookCoverName:
              bookSnapshot
                .bookCoverNameSnapshot,

            bookCoverQuantity:
              bookSnapshot
                .bookCoverQuantity,

            bookCoverUnitPrice:
              bookSnapshot
                .bookCoverUnitPrice,

            bookCoverTotal:
              bookSnapshot
                .bookCoverTotalPrice,
          };
        },
      );

    const pickupTotal =
      roundBookCommerceMoney(
        subtotalAmount +
          pickupBookSummary
            .bookCoverAmount,
      );

    const shippingTotal =
      roundBookCommerceMoney(
        subtotalAmount +
          REGULAR_SHIPPING_AMOUNT +
          shippingBookSummary
            .bookShippingAmount +
          shippingBookSummary
            .bookCoverAmount,
      );

    /*
     * Beide Steuerberechnungen erhalten denselben Zeitpunkt.
     * Dadurch bleiben Abholung und Versand innerhalb einer
     * Preview-Anfrage reproduzierbar vergleichbar.
     */
    const taxSnapshotAt =
      new Date().toISOString();

    /*
     * Diese Berechnungen sind ausschlieÃƒÅ¸lich parallel lesend.
     *
     * Sie verÃƒÂ¤ndern weder die bisherige Preisberechnung noch
     * die Checkout-Antwortfelder unter "pricing".
     *
     * Ein Adapterfehler wird als Diagnose zurÃƒÂ¼ckgegeben, ohne
     * den bestehenden Checkout bereits zu blockieren.
     */
    const pickupTaxPreview =
      buildTaxPreview({
        snapshotAt:
          taxSnapshotAt,

        offerItems,

        productById,

        subtotalAmount,

        regularShippingAmount:
          0,

        bookShippingAmount:
          0,

        bookCoverAmount:
          pickupBookSummary
            .bookCoverAmount,

        totalAmount:
          pickupTotal,
      });

    const shippingTaxPreview =
      buildTaxPreview({
        snapshotAt:
          taxSnapshotAt,

        offerItems,

        productById,

        subtotalAmount,

        regularShippingAmount:
          REGULAR_SHIPPING_AMOUNT,

        bookShippingAmount:
          shippingBookSummary
            .bookShippingAmount,

        bookCoverAmount:
          shippingBookSummary
            .bookCoverAmount,

        totalAmount:
          shippingTotal,
      });

    return NextResponse.json({
      ok: true,

      request: {
        id:
          requestRow.id,

        requestNumber:
          requestRow
            .request_number,
      },

      items,

      /*
       * Bestehende Preisantwort:
       * unverÃƒÂ¤ndert fÃƒÂ¼hrend.
       */
      pricing: {
        subtotalAmount,

        containsBooks:
          pickupBookSummary
            .containsBooks,

        bookPositionCount:
          pickupBookSummary
            .bookPositionCount,

        bookQuantity:
          pickupBookSummary
            .bookQuantity,

        bookCoverPositionCount:
          pickupBookSummary
            .bookCoverPositionCount,

        bookCoverQuantity:
          pickupBookSummary
            .bookCoverQuantity,

        bookCoverAmount:
          pickupBookSummary
            .bookCoverAmount,

        regularShippingAmount:
          REGULAR_SHIPPING_AMOUNT,

        bookShippingAmountForShipping:
          shippingBookSummary
            .bookShippingAmount,

        pickupTotal,

        shippingTotal,
      },

      /*
       * Neue parallele Diagnose.
       *
       * Diese Daten sind noch nicht die verbindliche
       * Rechnungsgrundlage und werden nirgendwo gespeichert.
       */
      taxPreview: {
        mode:
          "read_only_parallel_validation",

        bookCoverTaxPolicy: {
          taxRate:
            BOOK_COVER_TAX_RATE,

          source:
            "explicit_checkout_preview_policy",

          description:
            "Separat berechnete BuchhÃƒÂ¼llen werden vorlÃƒÂ¤ufig mit dem deutschen Regelsteuersatz behandelt.",
        },

        pickup:
          pickupTaxPreview,

        shipping:
          shippingTaxPreview,
      },
    });
  } catch (error) {
    console.error(
      "Handzettel checkout preview error:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,

        message:
          error instanceof Error
            ? error.message
            : "Die PreisÃƒÂ¼bersicht konnte nicht geladen werden.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      message:
        "Diese Route kann nur per GET genutzt werden.",
    },
    {
      status: 405,
    },
  );
}
