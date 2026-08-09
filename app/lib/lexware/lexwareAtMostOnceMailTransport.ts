import "server-only";

import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import {
  resolveLexwareMailSenderAddress,
  resolveLexwareMailTransportConfiguration,
  type LexwareMailTransportConfiguration,
} from "./lexwareProductionDeliveryCore";

export function readLexwareMailSenderAddress() {
  return resolveLexwareMailSenderAddress(process.env);
}

export function readLexwareMailTransportConfiguration(): LexwareMailTransportConfiguration {
  return resolveLexwareMailTransportConfiguration(process.env);
}

export async function sendLexwareInvoiceMailAtMostOnce(
  options: Mail.Options & { messageId: string },
  configuration = readLexwareMailTransportConfiguration(),
) {
  const transporter = nodemailer.createTransport({
    host: configuration.host,
    port: configuration.port,
    secure: configuration.port === 465,
    requireTLS: configuration.port === 587,
    auth: { user: configuration.user, pass: configuration.pass },
    pool: false,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    tls: { servername: configuration.host, minVersion: "TLSv1.2" },
  } as SMTPTransport.Options);
  const result = await transporter.sendMail({ ...options, from: options.from || configuration.from });
  return { ...result, messageId: options.messageId };
}
