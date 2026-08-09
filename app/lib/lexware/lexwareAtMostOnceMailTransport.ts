import "server-only";

import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

export type LexwareMailTransportConfiguration = {
  host: string;
  port: 465 | 587;
  user: string;
  pass: string;
  from: string;
};

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("SMTP_CONFIGURATION_INCOMPLETE");
  return value;
};

export function readLexwareMailTransportConfiguration(): LexwareMailTransportConfiguration {
  const rawPort = Number(process.env.IONOS_SMTP_PORT || 587);
  if (rawPort !== 465 && rawPort !== 587) throw new Error("SMTP_CONFIGURATION_INVALID");
  return {
    host: process.env.IONOS_SMTP_HOST?.trim() || "smtp.ionos.de",
    port: rawPort,
    user: required("IONOS_SMTP_USER"),
    pass: required("IONOS_SMTP_PASSWORD"),
    from: required("IONOS_SMTP_FROM"),
  };
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
