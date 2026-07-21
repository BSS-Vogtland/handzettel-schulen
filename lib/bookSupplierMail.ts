import nodemailer from "nodemailer";

type SupplierPartner = {
  name: string;
  email: string | null;
  contact_person: string | null;
};

type SupplierInquiry = {
  inquiry_number: string;
  response_token: string;
  admin_note: string | null;
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
    clean(process.env.NEXT_PUBLIC_SITE_URL) || clean(process.env.SITE_URL);

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const productionHost = clean(process.env.VERCEL_PROJECT_PRODUCTION_URL);

  if (productionHost) {
    return `https://${productionHost}`.replace(/\/+$/, "");
  }

  return "https://www.handzettel-schulen.de";
}

function getMailConfig() {
  const host = clean(process.env.SMTP_HOST) || clean(process.env.EMAIL_HOST);

  const user =
    clean(process.env.SMTP_USER) ||
    clean(process.env.SMTP_USERNAME) ||
    clean(process.env.EMAIL_USER);

  const pass =
    clean(process.env.SMTP_PASS) ||
    clean(process.env.SMTP_PASSWORD) ||
    clean(process.env.EMAIL_PASS);

  const port = Number(
    clean(process.env.SMTP_PORT) || clean(process.env.EMAIL_PORT) || "465",
  );

  if (!host || !user || !pass || !Number.isFinite(port)) {
    throw new Error(
      "SMTP-Konfiguration unvollständig. Prüfe SMTP_HOST, SMTP_PORT, SMTP_USER und SMTP_PASS.",
    );
  }

  const explicitSecure = clean(process.env.SMTP_SECURE).toLowerCase();

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
    from: clean(process.env.SMTP_FROM) || clean(process.env.MAIL_FROM) || user,
    fromName: clean(process.env.SMTP_FROM_NAME) || "Handzettel-Schulen.de",
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

function getAvailabilityLabel(status: string | null | undefined) {
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
    default:
      return "Keine Angabe";
  }
}

export async function sendBookSupplierInquiryMail(params: {
  partner: SupplierPartner;
  inquiry: SupplierInquiry;
  items: SupplierInquiryItem[];
}) {
  const recipient = clean(params.partner.email);

  if (!recipient) {
    throw new Error(
      "Bei der Vogtländischen Buchhandlung ist noch keine E-Mail-Adresse hinterlegt.",
    );
  }

  const responseUrl = `${getSiteUrl()}/lieferantenportal/buchanfrage/${encodeURIComponent(
    params.inquiry.response_token,
  )}`;

  const rowsHtml = params.items
    .map((item) => {
      const details = [
        item.subtitle,
        item.authors?.length ? item.authors.join(", ") : null,
        item.publisher,
      ]
        .filter(Boolean)
        .map(escapeHtml)
        .join("<br />");

      return `
        <tr>
          <td style="padding:12px;border-bottom:1px solid #E8DED2;font-weight:700;">
            ${escapeHtml(item.isbn)}
          </td>
          <td style="padding:12px;border-bottom:1px solid #E8DED2;">
            <strong>${escapeHtml(item.title)}</strong>
            ${
              details
                ? `<div style="margin-top:4px;color:#52616F;font-size:13px;">${details}</div>`
                : ""
            }
          </td>
          <td style="padding:12px;border-bottom:1px solid #E8DED2;text-align:center;font-weight:700;">
            ${item.requested_quantity}
          </td>
        </tr>
      `;
    })
    .join("");

  const textRows = params.items
    .map(
      (item, index) =>
        `${index + 1}. ${item.requested_quantity} × ${item.title}\nISBN: ${item.isbn}`,
    )
    .join("\n\n");

  const greeting = params.partner.contact_person
    ? `Guten Tag ${params.partner.contact_person},`
    : "Guten Tag,";

  await sendMail({
    to: recipient,
    subject: `Verfügbarkeitsanfrage ${params.inquiry.inquiry_number}`,
    text: `${greeting}

bitte prüfen Sie die Verfügbarkeit der folgenden Schulbücher:

${textRows}

Rückmeldung strukturiert erfassen:
${responseUrl}

${
  params.inquiry.admin_note ? `Hinweis:\n${params.inquiry.admin_note}\n\n` : ""
}Vielen Dank.

Handzettel-Schulen.de`,
    html: `
      <div style="margin:0;padding:24px;background:#FBF7F0;font-family:Arial,Helvetica,sans-serif;color:#102A43;">
        <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #E8DED2;border-radius:24px;overflow:hidden;">
          <div style="padding:24px 28px;background:#102A43;color:#ffffff;">
            <div style="font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#F1D1A8;">
              Handzettel-Schulen.de
            </div>
            <h1 style="margin:8px 0 0;font-size:26px;">
              Verfügbarkeitsanfrage ${escapeHtml(params.inquiry.inquiry_number)}
            </h1>
          </div>

          <div style="padding:28px;">
            <p style="font-size:16px;line-height:1.6;margin:0 0 18px;">
              ${escapeHtml(greeting)}
            </p>

            <p style="font-size:16px;line-height:1.6;margin:0 0 22px;">
              bitte prüfen Sie die Verfügbarkeit der folgenden Schulbücher.
            </p>

            <table style="width:100%;border-collapse:collapse;border:1px solid #E8DED2;border-radius:16px;overflow:hidden;">
              <thead>
                <tr style="background:#FBF7F0;">
                  <th style="padding:12px;text-align:left;">ISBN</th>
                  <th style="padding:12px;text-align:left;">Titel</th>
                  <th style="padding:12px;text-align:center;">Menge</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>

            ${
              params.inquiry.admin_note
                ? `<div style="margin-top:22px;padding:16px;border:1px solid #F1D1A8;background:#FFF8EE;border-radius:16px;">
                    <strong>Hinweis:</strong><br />
                    ${escapeHtml(params.inquiry.admin_note)}
                  </div>`
                : ""
            }

            <div style="margin-top:26px;">
              <a
                href="${escapeHtml(responseUrl)}"
                style="display:inline-block;padding:15px 22px;border-radius:14px;background:#B5282D;color:#ffffff;text-decoration:none;font-weight:800;"
              >
                Verfügbarkeit melden
              </a>
            </div>

            <p style="margin:24px 0 0;color:#52616F;font-size:13px;line-height:1.5;">
              Der Link ist ausschließlich für diese Anfrage gültig.
            </p>
          </div>
        </div>
      </div>
    `,
  });
}

export async function sendBookSupplierResponseNotification(params: {
  partner: SupplierPartner;
  inquiry: SupplierInquiry;
  items: SupplierInquiryItem[];
}) {
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
        `Status: ${getAvailabilityLabel(item.availability_status)}`,
        item.available_quantity !== null &&
        item.available_quantity !== undefined
          ? `Verfügbare Menge: ${item.available_quantity}`
          : null,
        item.lead_time_days !== null && item.lead_time_days !== undefined
          ? `Lieferzeit: ${item.lead_time_days} Tage`
          : null,
        item.available_from ? `Verfügbar ab: ${item.available_from}` : null,
        item.reservation_until
          ? `Reserviert bis: ${item.reservation_until}`
          : null,
        item.supplier_note ? `Notiz: ${item.supplier_note}` : null,
      ]
        .filter(Boolean)
        .join(" · ");

      return `<li style="margin-bottom:12px;"><strong>${escapeHtml(
        item.title,
      )}</strong><br />ISBN ${escapeHtml(
        item.isbn,
      )}<br />${escapeHtml(details)}</li>`;
    })
    .join("");

  await sendMail({
    to: recipient,
    subject: `Rückmeldung zu ${params.inquiry.inquiry_number}`,
    text: `Die ${params.partner.name} hat die Verfügbarkeitsanfrage ${params.inquiry.inquiry_number} beantwortet.`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#102A43;">
        <h1>Rückmeldung zu ${escapeHtml(params.inquiry.inquiry_number)}</h1>
        <p>Die ${escapeHtml(
          params.partner.name,
        )} hat die Verfügbarkeit aktualisiert.</p>
        <ul>${rows}</ul>
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
      "Bei der Vogtländischen Buchhandlung ist noch keine E-Mail-Adresse hinterlegt.",
    );
  }

  const responseUrl = `${getSiteUrl()}/lieferantenportal/buchauftrag/${encodeURIComponent(
    params.order.response_token,
  )}`;

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
          <td style="padding:12px;border-bottom:1px solid #E8DED2;font-weight:700;">
            ${escapeHtml(item.isbn)}
          </td>
          <td style="padding:12px;border-bottom:1px solid #E8DED2;">
            <strong>${escapeHtml(item.title)}</strong>
            ${
              details
                ? `<div style="margin-top:4px;color:#52616F;font-size:13px;">${details}</div>`
                : ""
            }
          </td>
          <td style="padding:12px;border-bottom:1px solid #E8DED2;text-align:center;font-weight:800;">
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
    subject: `Verbindlicher Buchauftrag ${params.order.order_number}`,
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
      <div style="margin:0;padding:24px;background:#FBF7F0;font-family:Arial,Helvetica,sans-serif;color:#102A43;">
        <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #E8DED2;border-radius:24px;overflow:hidden;">
          <div style="padding:24px 28px;background:#102A43;color:#ffffff;">
            <div style="font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#F1D1A8;">
              Handzettel-Schulen.de
            </div>
            <h1 style="margin:8px 0 0;font-size:26px;">
              Verbindlicher Buchauftrag ${escapeHtml(
                params.order.order_number,
              )}
            </h1>
          </div>

          <div style="padding:28px;">
            <p style="font-size:16px;line-height:1.6;margin:0 0 18px;">
              ${escapeHtml(greeting)}
            </p>

            <p style="font-size:16px;line-height:1.6;margin:0 0 22px;">
              hiermit bestellen wir verbindlich die folgenden Titel.
            </p>

            <div style="margin-bottom:22px;padding:16px;border:1px solid #C8D8E8;background:#EEF4FA;border-radius:16px;">
              <div><strong>Auftragsnummer:</strong> ${escapeHtml(
                params.order.order_number,
              )}</div>
              <div style="margin-top:6px;"><strong>Verfügbarkeitsanfrage:</strong> ${escapeHtml(
                params.sourceInquiryNumber,
              )}</div>
              <div style="margin-top:6px;"><strong>Abwicklung:</strong> ${escapeHtml(
                getFulfillmentLabel(
                  params.order.fulfillment_method,
                ),
              )}</div>
              ${
                customerReference
                  ? `<div style="margin-top:6px;"><strong>Interne Referenz:</strong> ${escapeHtml(
                      customerReference,
                    )}</div>`
                  : ""
              }
            </div>

            <table style="width:100%;border-collapse:collapse;border:1px solid #E8DED2;border-radius:16px;overflow:hidden;">
              <thead>
                <tr style="background:#FBF7F0;">
                  <th style="padding:12px;text-align:left;">ISBN</th>
                  <th style="padding:12px;text-align:left;">Titel</th>
                  <th style="padding:12px;text-align:center;">Menge</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>

            ${
              params.order.admin_note
                ? `<div style="margin-top:22px;padding:16px;border:1px solid #F1D1A8;background:#FFF8EE;border-radius:16px;">
                    <strong>Hinweis:</strong><br />
                    ${escapeHtml(params.order.admin_note)}
                  </div>`
                : ""
            }

            <div style="margin-top:26px;">
              <a
                href="${escapeHtml(responseUrl)}"
                style="display:inline-block;padding:15px 22px;border-radius:14px;background:#B5282D;color:#ffffff;text-decoration:none;font-weight:800;"
              >
                Auftrag bestätigen
              </a>
            </div>

            <p style="margin:24px 0 0;color:#52616F;font-size:13px;line-height:1.5;">
              Der Link ist ausschließlich für diesen Auftrag gültig.
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

      return `<li style="margin-bottom:12px;"><strong>${escapeHtml(
        item.title,
      )}</strong><br />ISBN ${escapeHtml(
        item.isbn,
      )}<br />${escapeHtml(details)}</li>`;
    })
    .join("");

  await sendMail({
    to: recipient,
    subject: `Rückmeldung zu Buchauftrag ${params.order.order_number}`,
    text: `Die ${params.partner.name} hat den Buchauftrag ${params.order.order_number} aktualisiert.`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#102A43;">
        <h1>Rückmeldung zu ${escapeHtml(
          params.order.order_number,
        )}</h1>
        <p>Die ${escapeHtml(
          params.partner.name,
        )} hat den verbindlichen Buchauftrag aktualisiert.</p>
        <ul>${rows}</ul>
      </div>
    `,
  });
}
