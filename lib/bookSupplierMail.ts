import nodemailer from "nodemailer";

type SupplierPartner = {
  name: string;
  email: string | null;
  contact_person: string | null;
};

type SupplierInquiry = {
  id?: string;
  inquiry_number: string;
  response_token: string;
  admin_note: string | null;
  supplier_note?: string | null;
  status?: string | null;
};

type SupplierInquiryItem = {
  isbn: string;
  title: string;
  subtitle: string | null;
  authors: string[] | null;
  publisher: string | null;
  requested_quantity: number;

  availability_status?: string | null;
  available_quantity?: number | null;
  lead_time_days?: number | null;
  available_from?: string | null;
  reservation_until?: string | null;
  supplier_note?: string | null;

  linked_product_id?: string | null;

  proposed_price_gross?: number | null;
  proposed_tax_rate?: number | null;
  price_source?: string | null;

  price_confirmation_status?: string | null;
  confirmed_price_gross?: number | null;
  confirmed_tax_rate?: number | null;
  price_confirmed_at?: string | null;
  price_applied_to_product_at?: string | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function escapeHtml(value: unknown) {
  return clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getSiteUrl() {
  const configured =
    clean(process.env.NEXT_PUBLIC_SITE_URL) ||
    clean(process.env.SITE_URL);

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const productionHost = clean(
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  );

  if (productionHost) {
    return `https://${productionHost}`.replace(/\/+$/, "");
  }

  return "https://www.handzettel-schulen.de";
}

function getMailConfig() {
  const host =
    clean(process.env.SMTP_HOST) ||
    clean(process.env.EMAIL_HOST);

  const user =
    clean(process.env.SMTP_USER) ||
    clean(process.env.SMTP_USERNAME) ||
    clean(process.env.EMAIL_USER);

  const pass =
    clean(process.env.SMTP_PASS) ||
    clean(process.env.SMTP_PASSWORD) ||
    clean(process.env.EMAIL_PASS);

  const port = Number(
    clean(process.env.SMTP_PORT) ||
      clean(process.env.EMAIL_PORT) ||
      "465",
  );

  if (!host || !user || !pass || !Number.isFinite(port)) {
    throw new Error(
      "SMTP-Konfiguration unvollständig. Prüfe SMTP_HOST, SMTP_PORT, SMTP_USER und SMTP_PASS.",
    );
  }

  const explicitSecure = clean(
    process.env.SMTP_SECURE,
  ).toLowerCase();

  return {
    host,
    port,
    secure:
      explicitSecure === "true"
        ? true
        : explicitSecure === "false"
          ? false
          : port === 465,
    user,
    pass,
    from:
      clean(process.env.SMTP_FROM) ||
      clean(process.env.MAIL_FROM) ||
      user,
    fromName:
      clean(process.env.SMTP_FROM_NAME) ||
      "Handzettel-Schulen.de",
  };
}

async function sendMail(params: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const config = getMailConfig();

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  await transporter.sendMail({
    from: `"${config.fromName}" <${config.from}>`,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
  });
}

function normalizePrice(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed * 100) / 100;
}

function formatPrice(value: unknown) {
  const price = normalizePrice(value);

  if (price === null) {
    return "Nicht angegeben";
  }

  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(price);
}

function formatTaxRate(value: unknown) {
  const taxRate = Number(value);

  if (taxRate !== 7 && taxRate !== 19) {
    return "Nicht angegeben";
  }

  return `${taxRate} %`;
}

function getAvailabilityLabel(
  status: string | null | undefined,
) {
  switch (status) {
    case "in_store":
      return "Im Laden verfügbar";

    case "orderable":
      return "Bestellbar";

    case "partially_available":
      return "Teilweise verfügbar";

    case "unavailable":
      return "Nicht verfügbar";

    case "checking":
      return "Noch zu prüfen";

    case "pending":
      return "Noch nicht beantwortet";

    default:
      return "Keine Angabe";
  }
}

function getPriceStatusLabel(
  status: string | null | undefined,
) {
  switch (status) {
    case "confirmed":
      return "Preis und USt. bestätigt";

    case "changed":
      return "Preis oder USt. geändert";

    case "pending":
      return "Preisprüfung offen";

    default:
      return "Keine Preisprüfung";
  }
}

function getPriceStatusColor(
  status: string | null | undefined,
) {
  switch (status) {
    case "confirmed":
      return {
        border: "#BFE3CD",
        background: "#F0FFF6",
        text: "#2F7D50",
      };

    case "changed":
      return {
        border: "#F1D1A8",
        background: "#FFF8EE",
        text: "#8A4A1F",
      };

    default:
      return {
        border: "#C8D8E8",
        background: "#F5FAFD",
        text: "#12395F",
      };
  }
}

function buildBibliographicDetails(
  item: SupplierInquiryItem,
) {
  return [
    item.subtitle,
    item.authors?.length
      ? item.authors.join(", ")
      : null,
    item.publisher,
  ].filter(Boolean);
}

export async function sendBookSupplierInquiryMail(params: {
  partner: SupplierPartner;
  inquiry: SupplierInquiry;
  items: SupplierInquiryItem[];
}) {
  const recipient = clean(params.partner.email);

  if (!recipient) {
    throw new Error(
      `Für ${params.partner.name} ist noch keine E-Mail-Adresse hinterlegt.`,
    );
  }

  const responseUrl =
    `${getSiteUrl()}/lieferantenportal/buchanfrage/` +
    encodeURIComponent(params.inquiry.response_token);

  const rowsHtml = params.items
    .map((item) => {
      const bibliographicDetails =
        buildBibliographicDetails(item)
          .map(escapeHtml)
          .join("<br />");

      const proposedPrice = formatPrice(
        item.proposed_price_gross,
      );

      const proposedTaxRate = formatTaxRate(
        item.proposed_tax_rate,
      );

      const priceSource =
        clean(item.price_source) ||
        "Nicht angegeben";

      return `
        <tr>
          <td
            style="
              padding:12px;
              border-bottom:1px solid #E8DED2;
              vertical-align:top;
              font-weight:700;
              white-space:nowrap;
            "
          >
            ${escapeHtml(item.isbn)}
          </td>

          <td
            style="
              padding:12px;
              border-bottom:1px solid #E8DED2;
              vertical-align:top;
            "
          >
            <strong>${escapeHtml(item.title)}</strong>

            ${
              bibliographicDetails
                ? `
                  <div
                    style="
                      margin-top:4px;
                      color:#52616F;
                      font-size:13px;
                      line-height:1.5;
                    "
                  >
                    ${bibliographicDetails}
                  </div>
                `
                : ""
            }
          </td>

          <td
            style="
              padding:12px;
              border-bottom:1px solid #E8DED2;
              text-align:center;
              vertical-align:top;
              font-weight:700;
            "
          >
            ${item.requested_quantity}
          </td>

          <td
            style="
              padding:12px;
              border-bottom:1px solid #E8DED2;
              vertical-align:top;
            "
          >
            <strong>${escapeHtml(proposedPrice)}</strong>

            <div
              style="
                margin-top:4px;
                color:#52616F;
                font-size:13px;
              "
            >
              USt. ${escapeHtml(proposedTaxRate)}
            </div>

            <div
              style="
                margin-top:4px;
                color:#7B8792;
                font-size:12px;
                line-height:1.4;
              "
            >
              ${escapeHtml(priceSource)}
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  const textRows = params.items
    .map((item, index) => {
      const details = [
        `${index + 1}. ${item.requested_quantity} × ${item.title}`,
        `ISBN: ${item.isbn}`,
        `Preisvorschlag: ${formatPrice(
          item.proposed_price_gross,
        )}`,
        `Umsatzsteuer: ${formatTaxRate(
          item.proposed_tax_rate,
        )}`,
        `Preisquelle: ${
          clean(item.price_source) ||
          "Nicht angegeben"
        }`,
      ];

      return details.join("\n");
    })
    .join("\n\n");

  const greeting = params.partner.contact_person
    ? `Guten Tag ${params.partner.contact_person},`
    : "Guten Tag,";

  await sendMail({
    to: recipient,
    subject:
      `Buchanfrage ${params.inquiry.inquiry_number}: ` +
      "Verfügbarkeit, Preis und USt. prüfen",

    text: `${greeting}

bitte prüfen Sie für die folgenden Schulbücher:

- die Verfügbarkeit,
- die lieferbare Menge,
- den gebundenen Bruttoverkaufspreis,
- den zutreffenden Umsatzsteuersatz.

${textRows}

Preis und Umsatzsteuer können je Position bestätigt oder korrigiert werden.

Rückmeldung strukturiert erfassen:
${responseUrl}

${
  params.inquiry.admin_note
    ? `Hinweis:\n${params.inquiry.admin_note}\n\n`
    : ""
}Vielen Dank.

Handzettel-Schulen.de`,

    html: `
      <div
        style="
          margin:0;
          padding:24px;
          background:#FBF7F0;
          font-family:Arial,Helvetica,sans-serif;
          color:#102A43;
        "
      >
        <div
          style="
            max-width:860px;
            margin:0 auto;
            background:#ffffff;
            border:1px solid #E8DED2;
            border-radius:24px;
            overflow:hidden;
          "
        >
          <div
            style="
              padding:24px 28px;
              background:#102A43;
              color:#ffffff;
            "
          >
            <div
              style="
                font-size:13px;
                font-weight:800;
                letter-spacing:.12em;
                text-transform:uppercase;
                color:#F1D1A8;
              "
            >
              Handzettel-Schulen.de
            </div>

            <h1
              style="
                margin:8px 0 0;
                font-size:26px;
                line-height:1.25;
              "
            >
              Buchanfrage
              ${escapeHtml(params.inquiry.inquiry_number)}
            </h1>

            <p
              style="
                margin:8px 0 0;
                color:#DCE7F0;
                font-size:15px;
                line-height:1.5;
              "
            >
              Verfügbarkeit, Preis und Umsatzsteuer prüfen
            </p>
          </div>

          <div style="padding:28px;">
            <p
              style="
                font-size:16px;
                line-height:1.6;
                margin:0 0 18px;
              "
            >
              ${escapeHtml(greeting)}
            </p>

            <p
              style="
                font-size:16px;
                line-height:1.6;
                margin:0 0 18px;
              "
            >
              bitte prüfen Sie für die folgenden Schulbücher
              die Verfügbarkeit sowie den gebundenen
              Bruttoverkaufspreis und den zutreffenden
              Umsatzsteuersatz.
            </p>

            <div
              style="
                margin-bottom:22px;
                padding:16px;
                border:1px solid #C8D8E8;
                background:#EEF4FA;
                border-radius:16px;
                font-size:14px;
                line-height:1.6;
              "
            >
              <strong>Preisprüfung je Position:</strong><br />
              Der vorgeschlagene Preis und Umsatzsteuersatz
              können bestätigt oder korrigiert werden.
            </div>

            <div style="overflow-x:auto;">
              <table
                style="
                  width:100%;
                  min-width:720px;
                  border-collapse:collapse;
                  border:1px solid #E8DED2;
                "
              >
                <thead>
                  <tr style="background:#FBF7F0;">
                    <th
                      style="
                        padding:12px;
                        text-align:left;
                        border-bottom:1px solid #E8DED2;
                      "
                    >
                      ISBN
                    </th>

                    <th
                      style="
                        padding:12px;
                        text-align:left;
                        border-bottom:1px solid #E8DED2;
                      "
                    >
                      Titel
                    </th>

                    <th
                      style="
                        padding:12px;
                        text-align:center;
                        border-bottom:1px solid #E8DED2;
                      "
                    >
                      Menge
                    </th>

                    <th
                      style="
                        padding:12px;
                        text-align:left;
                        border-bottom:1px solid #E8DED2;
                      "
                    >
                      Preis / USt.
                    </th>
                  </tr>
                </thead>

                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>

            ${
              params.inquiry.admin_note
                ? `
                  <div
                    style="
                      margin-top:22px;
                      padding:16px;
                      border:1px solid #F1D1A8;
                      background:#FFF8EE;
                      border-radius:16px;
                      line-height:1.6;
                    "
                  >
                    <strong>Hinweis:</strong><br />
                    ${escapeHtml(params.inquiry.admin_note)}
                  </div>
                `
                : ""
            }

            <div style="margin-top:26px;">
              <a
                href="${escapeHtml(responseUrl)}"
                style="
                  display:inline-block;
                  padding:15px 22px;
                  border-radius:14px;
                  background:#B5282D;
                  color:#ffffff;
                  text-decoration:none;
                  font-weight:800;
                "
              >
                Verfügbarkeit, Preis und USt. prüfen
              </a>
            </div>

            <p
              style="
                margin:24px 0 0;
                color:#52616F;
                font-size:13px;
                line-height:1.5;
              "
            >
              Der Link ist ausschließlich für diese Anfrage
              gültig. Zwischenstände können gespeichert und
              später ergänzt werden.
            </p>
          </div>
        </div>
      </div>
    `,
  });
}

export async function sendBookSupplierResponseNotification(
  params: {
    partner: SupplierPartner;
    inquiry: SupplierInquiry;
    items: SupplierInquiryItem[];
  },
) {
  const recipient =
    clean(process.env.BOOK_SUPPLIER_ADMIN_EMAIL) ||
    clean(process.env.CONTACT_EMAIL) ||
    clean(process.env.SMTP_USER) ||
    clean(process.env.EMAIL_USER);

  if (!recipient) {
    return;
  }

  const availabilityAnsweredCount =
    params.items.filter(
      (item) =>
        clean(item.availability_status) !== "" &&
        item.availability_status !== "pending",
    ).length;

  const priceAnsweredCount =
    params.items.filter(
      (item) =>
        item.price_confirmation_status === "confirmed" ||
        item.price_confirmation_status === "changed",
    ).length;

  const changedPriceCount =
    params.items.filter(
      (item) =>
        item.price_confirmation_status === "changed",
    ).length;

  const fullyAnsweredCount =
    params.items.filter(
      (item) =>
        item.availability_status !== "pending" &&
        (item.price_confirmation_status === "confirmed" ||
          item.price_confirmation_status === "changed"),
    ).length;

  const adminUrl = params.inquiry.id
    ? `${getSiteUrl()}/admin/buchhandlung/anfragen/${encodeURIComponent(
        params.inquiry.id,
      )}`
    : null;

  const rowsHtml = params.items
    .map((item, index) => {
      const priceStatus = clean(
        item.price_confirmation_status,
      );

      const statusColors =
        getPriceStatusColor(priceStatus);

      const proposedPrice = formatPrice(
        item.proposed_price_gross,
      );

      const proposedTaxRate = formatTaxRate(
        item.proposed_tax_rate,
      );

      const confirmedPrice =
        priceStatus === "confirmed" ||
        priceStatus === "changed"
          ? formatPrice(item.confirmed_price_gross)
          : "Noch offen";

      const confirmedTaxRate =
        priceStatus === "confirmed" ||
        priceStatus === "changed"
          ? formatTaxRate(item.confirmed_tax_rate)
          : "Noch offen";

      const availabilityDetails = [
        item.available_quantity !== null &&
        item.available_quantity !== undefined
          ? `Verfügbare Menge: ${item.available_quantity}`
          : null,

        item.lead_time_days !== null &&
        item.lead_time_days !== undefined
          ? `Lieferzeit: ${item.lead_time_days} Tage`
          : null,

        item.available_from
          ? `Verfügbar ab: ${item.available_from}`
          : null,

        item.reservation_until
          ? `Reserviert bis: ${item.reservation_until}`
          : null,
      ].filter(Boolean);

      return `
        <div
          style="
            margin-bottom:16px;
            padding:18px;
            border:1px solid #E8DED2;
            border-radius:18px;
            background:#ffffff;
          "
        >
          <div
            style="
              color:#A75B28;
              font-size:12px;
              font-weight:800;
              letter-spacing:.1em;
              text-transform:uppercase;
            "
          >
            Position ${index + 1}
          </div>

          <h2
            style="
              margin:6px 0 0;
              color:#102A43;
              font-size:18px;
              line-height:1.35;
            "
          >
            ${escapeHtml(item.title)}
          </h2>

          <div
            style="
              margin-top:6px;
              color:#52616F;
              font-size:13px;
              line-height:1.5;
            "
          >
            ISBN ${escapeHtml(item.isbn)}
            · Angefragt: ${item.requested_quantity}
          </div>

          <div
            style="
              margin-top:14px;
              display:block;
              padding:14px;
              border:1px solid #D6E7EF;
              border-radius:14px;
              background:#F5FAFD;
            "
          >
            <div
              style="
                color:#12395F;
                font-size:12px;
                font-weight:800;
                text-transform:uppercase;
              "
            >
              Verfügbarkeit
            </div>

            <div
              style="
                margin-top:5px;
                color:#102A43;
                font-weight:800;
              "
            >
              ${escapeHtml(
                getAvailabilityLabel(
                  item.availability_status,
                ),
              )}
            </div>

            ${
              availabilityDetails.length > 0
                ? `
                  <div
                    style="
                      margin-top:6px;
                      color:#52616F;
                      font-size:13px;
                      line-height:1.6;
                    "
                  >
                    ${availabilityDetails
                      .map(escapeHtml)
                      .join("<br />")}
                  </div>
                `
                : ""
            }
          </div>

          <div
            style="
              margin-top:12px;
              padding:14px;
              border:1px solid ${statusColors.border};
              border-radius:14px;
              background:${statusColors.background};
            "
          >
            <div
              style="
                color:${statusColors.text};
                font-size:12px;
                font-weight:800;
                text-transform:uppercase;
              "
            >
              ${escapeHtml(
                getPriceStatusLabel(priceStatus),
              )}
            </div>

            <table
              style="
                width:100%;
                margin-top:8px;
                border-collapse:collapse;
              "
            >
              <tr>
                <td
                  style="
                    width:50%;
                    padding:4px 8px 4px 0;
                    vertical-align:top;
                  "
                >
                  <div
                    style="
                      color:#52616F;
                      font-size:12px;
                      font-weight:700;
                    "
                  >
                    Vorgeschlagen
                  </div>

                  <div
                    style="
                      margin-top:3px;
                      color:#102A43;
                      font-weight:800;
                    "
                  >
                    ${escapeHtml(proposedPrice)}
                  </div>

                  <div
                    style="
                      margin-top:2px;
                      color:#52616F;
                      font-size:13px;
                    "
                  >
                    USt. ${escapeHtml(proposedTaxRate)}
                  </div>
                </td>

                <td
                  style="
                    width:50%;
                    padding:4px 0 4px 8px;
                    vertical-align:top;
                  "
                >
                  <div
                    style="
                      color:#52616F;
                      font-size:12px;
                      font-weight:700;
                    "
                  >
                    Bestätigt
                  </div>

                  <div
                    style="
                      margin-top:3px;
                      color:#102A43;
                      font-weight:800;
                    "
                  >
                    ${escapeHtml(confirmedPrice)}
                  </div>

                  <div
                    style="
                      margin-top:2px;
                      color:#52616F;
                      font-size:13px;
                    "
                  >
                    USt. ${escapeHtml(confirmedTaxRate)}
                  </div>
                </td>
              </tr>
            </table>

            <div
              style="
                margin-top:8px;
                color:#52616F;
                font-size:12px;
                line-height:1.5;
              "
            >
              Preisquelle:
              ${escapeHtml(
                clean(item.price_source) ||
                  "Nicht angegeben",
              )}

              ${
                item.price_applied_to_product_at
                  ? "<br />Der bestätigte Wert wurde in das verknüpfte Produkt übernommen."
                  : item.linked_product_id
                    ? "<br />Das Produkt ist verknüpft; die Preisprüfung ist noch nicht übernommen."
                    : "<br />Kein Produkt verknüpft."
              }
            </div>
          </div>

          ${
            item.supplier_note
              ? `
                <div
                  style="
                    margin-top:12px;
                    padding:12px;
                    border:1px solid #E8DED2;
                    border-radius:14px;
                    background:#FBF7F0;
                    color:#52616F;
                    font-size:13px;
                    line-height:1.6;
                  "
                >
                  <strong>Partnerhinweis:</strong><br />
                  ${escapeHtml(item.supplier_note)}
                </div>
              `
              : ""
          }
        </div>
      `;
    })
    .join("");

  const textRows = params.items
    .map((item, index) => {
      const priceStatus =
        item.price_confirmation_status;

      const lines = [
        `${index + 1}. ${item.title}`,
        `ISBN: ${item.isbn}`,
        `Verfügbarkeit: ${getAvailabilityLabel(
          item.availability_status,
        )}`,
        `Preisstatus: ${getPriceStatusLabel(
          priceStatus,
        )}`,
        `Vorschlag: ${formatPrice(
          item.proposed_price_gross,
        )} / USt. ${formatTaxRate(
          item.proposed_tax_rate,
        )}`,
        `Bestätigt: ${
          priceStatus === "confirmed" ||
          priceStatus === "changed"
            ? formatPrice(item.confirmed_price_gross)
            : "Noch offen"
        } / USt. ${
          priceStatus === "confirmed" ||
          priceStatus === "changed"
            ? formatTaxRate(item.confirmed_tax_rate)
            : "Noch offen"
        }`,
      ];

      if (
        item.available_quantity !== null &&
        item.available_quantity !== undefined
      ) {
        lines.push(
          `Verfügbare Menge: ${item.available_quantity}`,
        );
      }

      if (
        item.lead_time_days !== null &&
        item.lead_time_days !== undefined
      ) {
        lines.push(
          `Lieferzeit: ${item.lead_time_days} Tage`,
        );
      }

      if (item.supplier_note) {
        lines.push(
          `Partnerhinweis: ${item.supplier_note}`,
        );
      }

      return lines.join("\n");
    })
    .join("\n\n");

  await sendMail({
    to: recipient,

    subject:
      `Rückmeldung zu ${params.inquiry.inquiry_number}: ` +
      `${fullyAnsweredCount}/${params.items.length} vollständig`,

    text: `${params.partner.name} hat die Buchanfrage ${params.inquiry.inquiry_number} aktualisiert.

Verfügbarkeit beantwortet: ${availabilityAnsweredCount}/${params.items.length}
Preis und USt. geprüft: ${priceAnsweredCount}/${params.items.length}
Vollständig beantwortet: ${fullyAnsweredCount}/${params.items.length}
Geänderte Preise oder Steuersätze: ${changedPriceCount}

${textRows}

${
  params.inquiry.supplier_note
    ? `Allgemeine Rückmeldung:\n${params.inquiry.supplier_note}\n\n`
    : ""
}${
  adminUrl
    ? `Admin-Detailansicht:\n${adminUrl}\n`
    : ""
}`,

    html: `
      <div
        style="
          margin:0;
          padding:24px;
          background:#FBF7F0;
          font-family:Arial,Helvetica,sans-serif;
          color:#102A43;
        "
      >
        <div
          style="
            max-width:820px;
            margin:0 auto;
            background:#ffffff;
            border:1px solid #E8DED2;
            border-radius:24px;
            overflow:hidden;
          "
        >
          <div
            style="
              padding:24px 28px;
              background:#102A43;
              color:#ffffff;
            "
          >
            <div
              style="
                font-size:13px;
                font-weight:800;
                letter-spacing:.12em;
                text-transform:uppercase;
                color:#F1D1A8;
              "
            >
              Buchhandlungsrückmeldung
            </div>

            <h1
              style="
                margin:8px 0 0;
                font-size:26px;
                line-height:1.25;
              "
            >
              ${escapeHtml(params.inquiry.inquiry_number)}
            </h1>

            <p
              style="
                margin:8px 0 0;
                color:#DCE7F0;
                font-size:15px;
              "
            >
              ${escapeHtml(params.partner.name)}
            </p>
          </div>

          <div style="padding:28px;">
            <p
              style="
                margin:0 0 20px;
                font-size:16px;
                line-height:1.6;
              "
            >
              ${escapeHtml(params.partner.name)} hat
              Verfügbarkeit, Preis oder Umsatzsteuer der
              Buchanfrage aktualisiert.
            </p>

            <table
              style="
                width:100%;
                border-collapse:separate;
                border-spacing:8px;
                margin:-8px;
              "
            >
              <tr>
                <td
                  style="
                    width:25%;
                    padding:14px;
                    border:1px solid #D6E7EF;
                    border-radius:14px;
                    background:#F5FAFD;
                    text-align:center;
                  "
                >
                  <div
                    style="
                      color:#12395F;
                      font-size:11px;
                      font-weight:800;
                      text-transform:uppercase;
                    "
                  >
                    Positionen
                  </div>

                  <div
                    style="
                      margin-top:5px;
                      font-size:22px;
                      font-weight:800;
                    "
                  >
                    ${params.items.length}
                  </div>
                </td>

                <td
                  style="
                    width:25%;
                    padding:14px;
                    border:1px solid #D6E7EF;
                    border-radius:14px;
                    background:#F5FAFD;
                    text-align:center;
                  "
                >
                  <div
                    style="
                      color:#12395F;
                      font-size:11px;
                      font-weight:800;
                      text-transform:uppercase;
                    "
                  >
                    Verfügbarkeit
                  </div>

                  <div
                    style="
                      margin-top:5px;
                      font-size:22px;
                      font-weight:800;
                    "
                  >
                    ${availabilityAnsweredCount}/${params.items.length}
                  </div>
                </td>

                <td
                  style="
                    width:25%;
                    padding:14px;
                    border:1px solid #F1D1A8;
                    border-radius:14px;
                    background:#FFF8EE;
                    text-align:center;
                  "
                >
                  <div
                    style="
                      color:#8A4A1F;
                      font-size:11px;
                      font-weight:800;
                      text-transform:uppercase;
                    "
                  >
                    Preis / USt.
                  </div>

                  <div
                    style="
                      margin-top:5px;
                      font-size:22px;
                      font-weight:800;
                    "
                  >
                    ${priceAnsweredCount}/${params.items.length}
                  </div>
                </td>

                <td
                  style="
                    width:25%;
                    padding:14px;
                    border:1px solid #BFE3CD;
                    border-radius:14px;
                    background:#F0FFF6;
                    text-align:center;
                  "
                >
                  <div
                    style="
                      color:#2F7D50;
                      font-size:11px;
                      font-weight:800;
                      text-transform:uppercase;
                    "
                  >
                    Vollständig
                  </div>

                  <div
                    style="
                      margin-top:5px;
                      font-size:22px;
                      font-weight:800;
                    "
                  >
                    ${fullyAnsweredCount}/${params.items.length}
                  </div>
                </td>
              </tr>
            </table>

            ${
              changedPriceCount > 0
                ? `
                  <div
                    style="
                      margin-top:22px;
                      padding:15px;
                      border:1px solid #F1D1A8;
                      border-radius:14px;
                      background:#FFF8EE;
                      color:#8A4A1F;
                      font-size:14px;
                      font-weight:700;
                      line-height:1.5;
                    "
                  >
                    ${changedPriceCount} Position(en) enthalten
                    einen geänderten Preis oder Umsatzsteuersatz.
                  </div>
                `
                : ""
            }

            <div style="margin-top:24px;">
              ${rowsHtml}
            </div>

            ${
              params.inquiry.supplier_note
                ? `
                  <div
                    style="
                      margin-top:22px;
                      padding:16px;
                      border:1px solid #BFE3CD;
                      background:#F0FFF6;
                      border-radius:16px;
                      line-height:1.6;
                    "
                  >
                    <strong>Allgemeine Rückmeldung:</strong><br />
                    ${escapeHtml(
                      params.inquiry.supplier_note,
                    )}
                  </div>
                `
                : ""
            }

            ${
              adminUrl
                ? `
                  <div style="margin-top:26px;">
                    <a
                      href="${escapeHtml(adminUrl)}"
                      style="
                        display:inline-block;
                        padding:15px 22px;
                        border-radius:14px;
                        background:#102A43;
                        color:#ffffff;
                        text-decoration:none;
                        font-weight:800;
                      "
                    >
                      Anfrage im Admin öffnen
                    </a>
                  </div>
                `
                : ""
            }
          </div>
        </div>
      </div>
    `,
  });
}

type SupplierOrder = {
  order_number: string;
  response_token: string;
  customer_reference: string | null;
  fulfillment_method: string;
  admin_note: string | null;
};

type SupplierOrderItem = {
  isbn: string;
  title: string;
  subtitle: string | null;
  authors: string[] | null;
  publisher: string | null;
  quantity: number;
  supplier_status?: string | null;
  accepted_quantity?: number | null;
  supplier_note?: string | null;
};

function getOrderStatusLabel(
  status: string | null | undefined,
) {
  switch (status) {
    case "accepted":
      return "Angenommen";

    case "partially_accepted":
      return "Teilweise angenommen";

    case "unavailable":
      return "Nicht lieferbar";

    case "ready":
      return "Zur Abholung bereit";

    default:
      return "Noch nicht beantwortet";
  }
}

function getFulfillmentLabel(
  method: string | null | undefined,
) {
  return method === "delivery"
    ? "Lieferung an Handzettel-Schulen.de"
    : "Abholung bei der Buchhandlung";
}

export async function sendBookSupplierOrderMail(params: {
  partner: SupplierPartner;
  order: SupplierOrder;
  sourceInquiryNumber: string;
  items: SupplierOrderItem[];
}) {
  const recipient = clean(params.partner.email);

  if (!recipient) {
    throw new Error(
      `Für ${params.partner.name} ist noch keine E-Mail-Adresse hinterlegt.`,
    );
  }

  const responseUrl =
    `${getSiteUrl()}/lieferantenportal/buchauftrag/` +
    encodeURIComponent(params.order.response_token);

  const rowsHtml = params.items
    .map((item) => {
      const details = [
        item.subtitle,
        item.authors?.length
          ? item.authors.join(", ")
          : null,
        item.publisher,
      ]
        .filter(Boolean)
        .map(escapeHtml)
        .join("<br />");

      return `
        <tr>
          <td
            style="
              padding:12px;
              border-bottom:1px solid #E8DED2;
              font-weight:700;
            "
          >
            ${escapeHtml(item.isbn)}
          </td>

          <td
            style="
              padding:12px;
              border-bottom:1px solid #E8DED2;
            "
          >
            <strong>${escapeHtml(item.title)}</strong>

            ${
              details
                ? `
                  <div
                    style="
                      margin-top:4px;
                      color:#52616F;
                      font-size:13px;
                    "
                  >
                    ${details}
                  </div>
                `
                : ""
            }
          </td>

          <td
            style="
              padding:12px;
              border-bottom:1px solid #E8DED2;
              text-align:center;
              font-weight:800;
            "
          >
            ${item.quantity}
          </td>
        </tr>
      `;
    })
    .join("");

  const textRows = params.items
    .map(
      (item, index) =>
        `${index + 1}. ${item.quantity} × ${item.title}\nISBN: ${item.isbn}`,
    )
    .join("\n\n");

  const greeting = params.partner.contact_person
    ? `Guten Tag ${params.partner.contact_person},`
    : "Guten Tag,";

  const customerReference = clean(
    params.order.customer_reference,
  );

  await sendMail({
    to: recipient,

    subject:
      `Verbindlicher Buchauftrag ` +
      params.order.order_number,

    text: `${greeting}

hiermit bestellen wir verbindlich die folgenden Titel:

${textRows}

Auftragsnummer: ${params.order.order_number}
Bezug zur Verfügbarkeitsanfrage: ${params.sourceInquiryNumber}
Abwicklung: ${getFulfillmentLabel(
      params.order.fulfillment_method,
    )}
${
  customerReference
    ? `Interne Referenz: ${customerReference}\n`
    : ""
}${
  params.order.admin_note
    ? `Hinweis:\n${params.order.admin_note}\n\n`
    : ""
}Auftrag bestätigen:
${responseUrl}

Vielen Dank.

Handzettel-Schulen.de`,

    html: `
      <div
        style="
          margin:0;
          padding:24px;
          background:#FBF7F0;
          font-family:Arial,Helvetica,sans-serif;
          color:#102A43;
        "
      >
        <div
          style="
            max-width:760px;
            margin:0 auto;
            background:#ffffff;
            border:1px solid #E8DED2;
            border-radius:24px;
            overflow:hidden;
          "
        >
          <div
            style="
              padding:24px 28px;
              background:#102A43;
              color:#ffffff;
            "
          >
            <div
              style="
                font-size:13px;
                font-weight:800;
                letter-spacing:.12em;
                text-transform:uppercase;
                color:#F1D1A8;
              "
            >
              Handzettel-Schulen.de
            </div>

            <h1
              style="
                margin:8px 0 0;
                font-size:26px;
              "
            >
              Verbindlicher Buchauftrag
              ${escapeHtml(params.order.order_number)}
            </h1>
          </div>

          <div style="padding:28px;">
            <p
              style="
                font-size:16px;
                line-height:1.6;
                margin:0 0 18px;
              "
            >
              ${escapeHtml(greeting)}
            </p>

            <p
              style="
                font-size:16px;
                line-height:1.6;
                margin:0 0 22px;
              "
            >
              hiermit bestellen wir verbindlich die
              folgenden Titel.
            </p>

            <div
              style="
                margin-bottom:22px;
                padding:16px;
                border:1px solid #C8D8E8;
                background:#EEF4FA;
                border-radius:16px;
              "
            >
              <div>
                <strong>Auftragsnummer:</strong>
                ${escapeHtml(params.order.order_number)}
              </div>

              <div style="margin-top:6px;">
                <strong>Verfügbarkeitsanfrage:</strong>
                ${escapeHtml(params.sourceInquiryNumber)}
              </div>

              <div style="margin-top:6px;">
                <strong>Abwicklung:</strong>
                ${escapeHtml(
                  getFulfillmentLabel(
                    params.order.fulfillment_method,
                  ),
                )}
              </div>

              ${
                customerReference
                  ? `
                    <div style="margin-top:6px;">
                      <strong>Interne Referenz:</strong>
                      ${escapeHtml(customerReference)}
                    </div>
                  `
                  : ""
              }
            </div>

            <table
              style="
                width:100%;
                border-collapse:collapse;
                border:1px solid #E8DED2;
              "
            >
              <thead>
                <tr style="background:#FBF7F0;">
                  <th
                    style="
                      padding:12px;
                      text-align:left;
                    "
                  >
                    ISBN
                  </th>

                  <th
                    style="
                      padding:12px;
                      text-align:left;
                    "
                  >
                    Titel
                  </th>

                  <th
                    style="
                      padding:12px;
                      text-align:center;
                    "
                  >
                    Menge
                  </th>
                </tr>
              </thead>

              <tbody>
                ${rowsHtml}
              </tbody>
            </table>

            ${
              params.order.admin_note
                ? `
                  <div
                    style="
                      margin-top:22px;
                      padding:16px;
                      border:1px solid #F1D1A8;
                      background:#FFF8EE;
                      border-radius:16px;
                    "
                  >
                    <strong>Hinweis:</strong><br />
                    ${escapeHtml(params.order.admin_note)}
                  </div>
                `
                : ""
            }

            <div style="margin-top:26px;">
              <a
                href="${escapeHtml(responseUrl)}"
                style="
                  display:inline-block;
                  padding:15px 22px;
                  border-radius:14px;
                  background:#B5282D;
                  color:#ffffff;
                  text-decoration:none;
                  font-weight:800;
                "
              >
                Auftrag bestätigen
              </a>
            </div>

            <p
              style="
                margin:24px 0 0;
                color:#52616F;
                font-size:13px;
                line-height:1.5;
              "
            >
              Der Link ist ausschließlich für diesen
              Auftrag gültig.
            </p>
          </div>
        </div>
      </div>
    `,
  });
}

export async function sendBookSupplierOrderResponseNotification(
  params: {
    partner: SupplierPartner;
    order: SupplierOrder;
    items: SupplierOrderItem[];
  },
) {
  const recipient =
    clean(process.env.BOOK_SUPPLIER_ADMIN_EMAIL) ||
    clean(process.env.CONTACT_EMAIL) ||
    clean(process.env.SMTP_USER) ||
    clean(process.env.EMAIL_USER);

  if (!recipient) {
    return;
  }

  const rows = params.items
    .map((item) => {
      const details = [
        `Status: ${getOrderStatusLabel(
          item.supplier_status,
        )}`,

        item.accepted_quantity !== null &&
        item.accepted_quantity !== undefined
          ? `Bestätigte Menge: ${item.accepted_quantity}`
          : null,

        item.supplier_note
          ? `Notiz: ${item.supplier_note}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");

      return `
        <li style="margin-bottom:12px;">
          <strong>${escapeHtml(item.title)}</strong>
          <br />
          ISBN ${escapeHtml(item.isbn)}
          <br />
          ${escapeHtml(details)}
        </li>
      `;
    })
    .join("");

  await sendMail({
    to: recipient,

    subject:
      `Rückmeldung zu Buchauftrag ` +
      params.order.order_number,

    text:
      `${params.partner.name} hat den Buchauftrag ` +
      `${params.order.order_number} aktualisiert.`,

    html: `
      <div
        style="
          font-family:Arial,Helvetica,sans-serif;
          color:#102A43;
        "
      >
        <h1>
          Rückmeldung zu
          ${escapeHtml(params.order.order_number)}
        </h1>

        <p>
          ${escapeHtml(params.partner.name)} hat den
          verbindlichen Buchauftrag aktualisiert.
        </p>

        <ul>
          ${rows}
        </ul>
      </div>
    `,
  });
}