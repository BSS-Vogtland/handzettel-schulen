type SupportedInvoiceTaxSnapshotVersion =
  | "invoice-tax-snapshot-v1"
  | "invoice-tax-snapshot-v2";

type InvoiceRow = Record<string, any>;
type InvoiceItemRow = Record<string, any>;
type InvoiceTaxBreakdownSnapshotV2 = Record<string, any>;

function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toMoneyCents(
  value: unknown,
) {
  return Math.round(
    (
      toNumber(value, 0) +
      Number.EPSILON
    ) * 100,
  );
}

function toRequiredMoneyCents(
  value: unknown,
  label: string,
) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    !Number.isFinite(
      Number(
        String(value).replace(",", "."),
      ),
    )
  ) {
    throw new Error(
      `${label}: Gespeicherter Geldwert fehlt oder ist ungültig.`,
    );
  }

  return toMoneyCents(value);
}

function snapshotTimesMatch(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  if (!left || !right) return false;

  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  return (
    Number.isFinite(leftTime) &&
    Number.isFinite(rightTime) &&
    leftTime === rightTime
  );
}

function assertMoneyIdentity(params: {
  gross: unknown;
  net: unknown;
  tax: unknown;
  label: string;
}) {
  const grossCents =
    toRequiredMoneyCents(
      params.gross,
      `${params.label} Brutto`,
    );

  const netCents =
    toRequiredMoneyCents(
      params.net,
      `${params.label} Netto`,
    );

  const taxCents =
    toRequiredMoneyCents(
      params.tax,
      `${params.label} Umsatzsteuer`,
    );

  if (
    netCents + taxCents !==
    grossCents
  ) {
    throw new Error(
      `${params.label}: Netto plus Umsatzsteuer entspricht nicht Brutto.`,
    );
  }
}

function isSupportedInvoiceTaxSnapshotVersion(
  value: unknown,
): value is SupportedInvoiceTaxSnapshotVersion {
  return (
    value === "invoice-tax-snapshot-v1" ||
    value === "invoice-tax-snapshot-v2"
  );
}

export function validateInvoiceTaxSnapshot(
  invoice: InvoiceRow,
  invoiceItems: InvoiceItemRow[],
) {
  /*
   * INVOICE_PDF_TAX_SNAPSHOT_READ_MODEL_V1
   *
   * Die PDF ist ausschließlich ein read-only Verbraucher
   * des beim Checkout gespeicherten Steuer-Snapshots.
   *
   * Keine aktuellen Produktdaten.
   * Keine erneute Steuerberechnung.
   * Keine stillen Standardwerte.
   */
  if (
    invoice.tax_snapshot_status !==
    "complete"
  ) {
    throw new Error(
      `Die Rechnung ${
        invoice.invoice_number || invoice.id
      } besitzt keinen vollständigen Steuer-Snapshot und darf nicht als PDF erzeugt werden.`,
    );
  }

  if (
    invoice.tax_snapshot_source !==
    "product_catalog_at_checkout"
  ) {
    throw new Error(
      "Die Steuer-Snapshot-Quelle der Rechnung ist ungültig.",
    );
  }

  const taxSnapshotVersion =
    invoice.tax_snapshot_version;

  if (
    !isSupportedInvoiceTaxSnapshotVersion(
      taxSnapshotVersion,
    )
  ) {
    throw new Error(
      "Die Steuer-Snapshot-Version der Rechnung wird von der PDF-Erzeugung nicht unterstützt.",
    );
  }

  if (
    !invoice.tax_snapshot_at
  ) {
    throw new Error(
      "Der Zeitpunkt des Steuer-Snapshots fehlt.",
    );
  }

  const breakdown =
    invoice.tax_breakdown_snapshot;

  if (
    !breakdown ||
    breakdown.version !==
      taxSnapshotVersion ||
    breakdown.source !==
      invoice.tax_snapshot_source ||
    !snapshotTimesMatch(
      breakdown.generated_at,
      invoice.tax_snapshot_at,
    ) ||
    breakdown.currency !== "EUR" ||
    !Array.isArray(
      breakdown.rates,
    )
  ) {
    throw new Error(
      "Die gespeicherte Steueraufschlüsselung ist unvollständig oder widersprüchlich.",
    );
  }

  if (
    taxSnapshotVersion ===
    "invoice-tax-snapshot-v2"
  ) {
    const v2Breakdown =
      breakdown as InvoiceTaxBreakdownSnapshotV2;

    if (
      v2Breakdown.rounding_method !==
        "gross_tax_rate_total_with_deterministic_line_allocation_v1" ||
      v2Breakdown.allocation_methods
        ?.regular_shipping !==
        "preallocated_by_checkout_adapter_v2" ||
      v2Breakdown.allocation_methods
        ?.book_shipping !==
        "preallocated_by_checkout_adapter_v2" ||
      v2Breakdown.allocation_methods
        ?.discount !==
        "preallocated_by_checkout_adapter_v2"
    ) {
      throw new Error(
        "Die V2-Rundungs- oder Allokationsmetadaten der Rechnung sind ungültig.",
      );
    }
  }

  const supportedRates =
    new Set([7, 19]);

  let rateGrossCents = 0;
  let rateNetCents = 0;
  let rateTaxCents = 0;

  for (
    const rate of
    breakdown.rates
  ) {
    if (
      !supportedRates.has(
        rate.tax_rate,
      )
    ) {
      throw new Error(
        `Nicht unterstützter Umsatzsteuersatz im Rechnungssnapshot: ${rate.tax_rate} %.`,
      );
    }

    assertMoneyIdentity({
      gross:
        rate.total.gross,

      net:
        rate.total.net,

      tax:
        rate.total.tax,

      label:
        `Steuerbereich ${rate.tax_rate} %`,
    });

    rateGrossCents += toRequiredMoneyCents(
      rate.total.gross,
      `Steuerbereich ${rate.tax_rate} % Brutto`,
    );
    rateNetCents += toRequiredMoneyCents(
      rate.total.net,
      `Steuerbereich ${rate.tax_rate} % Netto`,
    );
    rateTaxCents += toRequiredMoneyCents(
      rate.total.tax,
      `Steuerbereich ${rate.tax_rate} % Umsatzsteuer`,
    );
  }

  assertMoneyIdentity({
    gross:
      breakdown.totals.subtotal.gross,

    net:
      breakdown.totals.subtotal.net,

    tax:
      breakdown.totals.subtotal.tax,

    label:
      "Produkt-Zwischensumme",
  });

  assertMoneyIdentity({
    gross:
      breakdown.totals
        .regular_shipping
        .gross,

    net:
      breakdown.totals
        .regular_shipping
        .net,

    tax:
      breakdown.totals
        .regular_shipping
        .tax,

    label:
      "Versandpauschale",
  });

  assertMoneyIdentity({
    gross:
      breakdown.totals
        .book_shipping
        .gross,

    net:
      breakdown.totals
        .book_shipping
        .net,

    tax:
      breakdown.totals
        .book_shipping
        .tax,

    label:
      "Buchversand",
  });

  assertMoneyIdentity({
    gross:
      breakdown.totals
        .book_covers
        .gross,

    net:
      breakdown.totals
        .book_covers
        .net,

    tax:
      breakdown.totals
        .book_covers
        .tax,

    label:
      "Buchhüllen",
  });

  assertMoneyIdentity({
    gross:
      breakdown.totals
        .discount
        .gross,

    net:
      breakdown.totals
        .discount
        .net,

    tax:
      breakdown.totals
        .discount
        .tax,

    label:
      "Rabatt",
  });

  assertMoneyIdentity({
    gross:
      breakdown.totals.total.gross,

    net:
      breakdown.totals.total.net,

    tax:
      breakdown.totals.total.tax,

    label:
      "Rechnungsgesamtbetrag",
  });

  const totalGrossCents = toRequiredMoneyCents(
    breakdown.totals.total.gross,
    "Rechnungsgesamtbetrag Brutto",
  );
  const totalNetCents = toRequiredMoneyCents(
    breakdown.totals.total.net,
    "Rechnungsgesamtbetrag Netto",
  );
  const totalTaxCents = toRequiredMoneyCents(
    breakdown.totals.total.tax,
    "Rechnungsgesamtbetrag Umsatzsteuer",
  );

  if (
    rateGrossCents !== totalGrossCents ||
    rateNetCents !== totalNetCents ||
    rateTaxCents !== totalTaxCents
  ) {
    throw new Error(
      "Die Summe der Steuerbereiche stimmt nicht mit dem Rechnungsgesamtbetrag überein.",
    );
  }

  const componentKeys = [
    "subtotal",
    "regular_shipping",
    "book_shipping",
    "book_covers",
  ] as const;
  const componentGrossCents = componentKeys.reduce(
    (sum, key) => sum + toRequiredMoneyCents(
      breakdown.totals[key].gross,
      `${key} Brutto`,
    ),
    0,
  ) - toRequiredMoneyCents(
    breakdown.totals.discount.gross,
    "discount Brutto",
  );
  const componentNetCents = componentKeys.reduce(
    (sum, key) => sum + toRequiredMoneyCents(
      breakdown.totals[key].net,
      `${key} Netto`,
    ),
    0,
  ) - toRequiredMoneyCents(
    breakdown.totals.discount.net,
    "discount Netto",
  );
  const componentTaxCents = componentKeys.reduce(
    (sum, key) => sum + toRequiredMoneyCents(
      breakdown.totals[key].tax,
      `${key} Umsatzsteuer`,
    ),
    0,
  ) - toRequiredMoneyCents(
    breakdown.totals.discount.tax,
    "discount Umsatzsteuer",
  );

  if (
    componentGrossCents !== totalGrossCents ||
    componentNetCents !== totalNetCents ||
    componentTaxCents !== totalTaxCents
  ) {
    throw new Error(
      "Die Summe der Steuerkomponenten stimmt nicht mit dem Rechnungsgesamtbetrag überein.",
    );
  }

  if (
    toMoneyCents(
      breakdown.totals.total.gross,
    ) !==
    toMoneyCents(
      invoice.total_amount,
    )
  ) {
    throw new Error(
      "Der Gesamtbruttobetrag des Steuer-Snapshots stimmt nicht mit der Rechnung überein.",
    );
  }

  if (
    toMoneyCents(
      breakdown.totals.total.net,
    ) !==
    toMoneyCents(
      invoice.total_net_amount_snapshot,
    ) ||
    toMoneyCents(
      breakdown.totals.total.tax,
    ) !==
    toMoneyCents(
      invoice.total_tax_amount_snapshot,
    )
  ) {
    throw new Error(
      "Die Gesamtnetto- oder Umsatzsteuerwerte widersprechen der gespeicherten Steueraufschlüsselung.",
    );
  }

  if (
    invoiceItems.length === 0
  ) {
    throw new Error(
      "Die Rechnung besitzt keine Rechnungspositionen.",
    );
  }

  let productGrossCents = 0;
  let productNetCents = 0;
  let productTaxCents = 0;

  let coverGrossCents = 0;
  let coverNetCents = 0;
  let coverTaxCents = 0;

  for (
    const item of
    invoiceItems
  ) {
    const itemLabel =
      item.product_name ||
      item.id;

    const taxRate =
      Number(
        item.tax_rate_snapshot,
      );

    if (
      taxRate !== 7 &&
      taxRate !== 19
    ) {
      throw new Error(
        `Für die Rechnungsposition ${itemLabel} fehlt ein gültiger Steuersatz.`,
      );
    }

    if (
      item.tax_snapshot_source !==
        invoice.tax_snapshot_source ||
      item.tax_snapshot_version !==
        invoice.tax_snapshot_version ||
      !snapshotTimesMatch(
        item.tax_snapshot_at,
        invoice.tax_snapshot_at,
      )
    ) {
      throw new Error(
        `Die Snapshot-Metadaten der Rechnungsposition ${itemLabel} stimmen nicht mit der Rechnung überein.`,
      );
    }

    assertMoneyIdentity({
      gross:
        item.product_gross_amount_snapshot,

      net:
        item.product_net_amount_snapshot,

      tax:
        item.product_tax_amount_snapshot,

      label:
        `Rechnungsposition ${itemLabel}`,
    });

    productGrossCents +=
      toMoneyCents(
        item.product_gross_amount_snapshot,
      );

    productNetCents +=
      toMoneyCents(
        item.product_net_amount_snapshot,
      );

    productTaxCents +=
      toMoneyCents(
        item.product_tax_amount_snapshot,
      );

    const coverGross =
      toMoneyCents(
        item.book_cover_total_price,
      );

    const coverNet =
      toMoneyCents(
        item.book_cover_net_amount_snapshot,
      );

    const coverTax =
      toMoneyCents(
        item.book_cover_tax_amount_snapshot,
      );

    if (coverGross > 0) {
      if (
        Number(
          item.book_cover_tax_rate_snapshot,
        ) !== 19
      ) {
        throw new Error(
          `Die Buchhülle zu ${itemLabel} besitzt keinen gültigen Steuersatz von 19 %.`,
        );
      }

      if (
        coverNet + coverTax !==
        coverGross
      ) {
        throw new Error(
          `Buchhülle zu ${itemLabel}: Netto plus Umsatzsteuer entspricht nicht Brutto.`,
        );
      }
    } else if (
      coverNet !== 0 ||
      coverTax !== 0
    ) {
      throw new Error(
        `Die nicht berechnete Buchhülle zu ${itemLabel} besitzt unerwartete Steuerwerte.`,
      );
    }

    coverGrossCents +=
      coverGross;

    coverNetCents +=
      coverNet;

    coverTaxCents +=
      coverTax;
  }

  if (
    productGrossCents !==
      toMoneyCents(
        breakdown.totals
          .subtotal
          .gross,
      ) ||
    productNetCents !==
      toMoneyCents(
        breakdown.totals
          .subtotal
          .net,
      ) ||
    productTaxCents !==
      toMoneyCents(
        breakdown.totals
          .subtotal
          .tax,
      )
  ) {
    throw new Error(
      "Die Summe der Produkt-Positionssnapshots stimmt nicht mit dem Rechnungssnapshot überein.",
    );
  }

  if (
    coverGrossCents !==
      toMoneyCents(
        breakdown.totals
          .book_covers
          .gross,
      ) ||
    coverNetCents !==
      toMoneyCents(
        breakdown.totals
          .book_covers
          .net,
      ) ||
    coverTaxCents !==
      toMoneyCents(
        breakdown.totals
          .book_covers
          .tax,
      )
  ) {
    throw new Error(
      "Die Summe der Buchhüllen-Snapshots stimmt nicht mit dem Rechnungssnapshot überein.",
    );
  }

  return breakdown;
}
