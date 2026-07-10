import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

type SmtpCandidate = {
  label: string;
  host: string;
  port: number;
  secure: boolean;
  requireTLS?: boolean;
};

function getEnv(keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function getEnvNumber(keys: string[]) {
  const value = getEnv(keys);

  if (!value) return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getEnvBoolean(keys: string[]) {
  const value = getEnv(keys);

  if (!value) return null;

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "ja", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "nein", "n"].includes(normalized)) return false;

  return null;
}

function getSmtpHost() {
  return (
    getEnv([
      "SMTP_HOST",
      "SMTP_SERVER",
      "EMAIL_SERVER_HOST",
      "EMAIL_HOST",
      "MAIL_HOST",
      "IONOS_SMTP_HOST",
    ]) || "smtp.ionos.de"
  );
}

function getSmtpUser() {
  return getEnv([
    "SMTP_USER",
    "SMTP_USERNAME",
    "SMTP_AUTH_USER",
    "EMAIL_SERVER_USER",
    "EMAIL_USER",
    "MAIL_USER",
    "IONOS_SMTP_USER",
  ]);
}

function getSmtpPassword() {
  return getEnv([
    "SMTP_PASS",
    "SMTP_PASSWORD",
    "SMTP_AUTH_PASS",
    "EMAIL_SERVER_PASSWORD",
    "EMAIL_PASSWORD",
    "MAIL_PASSWORD",
    "IONOS_SMTP_PASSWORD",
  ]);
}

function getDefaultFrom() {
  return getEnv([
    "SMTP_FROM",
    "EMAIL_FROM",
    "MAIL_FROM",
    "IONOS_SMTP_FROM",
    "ADMIN_MAIL_FROM",
  ]);
}

function buildCandidates(host: string): SmtpCandidate[] {
  const envPort = getEnvNumber([
    "SMTP_PORT",
    "EMAIL_SERVER_PORT",
    "EMAIL_PORT",
    "MAIL_PORT",
    "IONOS_SMTP_PORT",
  ]);

  const envSecure = getEnvBoolean([
    "SMTP_SECURE",
    "EMAIL_SERVER_SECURE",
    "EMAIL_SECURE",
    "MAIL_SECURE",
    "IONOS_SMTP_SECURE",
  ]);

  const candidates: SmtpCandidate[] = [];

  if (envPort) {
    candidates.push({
      label: `env:${envPort}`,
      host,
      port: envPort,
      secure: envSecure ?? envPort === 465,
      requireTLS: envPort === 587 ? true : undefined,
    });
  }

  candidates.push(
    {
      label: "ionos-starttls-587",
      host,
      port: 587,
      secure: false,
      requireTLS: true,
    },
    {
      label: "ionos-ssl-465",
      host,
      port: 465,
      secure: true,
    }
  );

  const unique = new Map<string, SmtpCandidate>();

  for (const candidate of candidates) {
    unique.set(
      `${candidate.host}:${candidate.port}:${candidate.secure}`,
      candidate
    );
  }

  return Array.from(unique.values());
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    const details = error as Error & {
      code?: string;
      command?: string;
      response?: string;
      responseCode?: number;
      errno?: number;
      syscall?: string;
    };

    return [
      details.message,
      details.code ? `code=${details.code}` : null,
      details.command ? `command=${details.command}` : null,
      details.responseCode ? `responseCode=${details.responseCode}` : null,
      details.response ? `response=${details.response}` : null,
      details.errno ? `errno=${details.errno}` : null,
      details.syscall ? `syscall=${details.syscall}` : null,
    ]
      .filter(Boolean)
      .join(" | ");
  }

  return String(error);
}

export async function sendMailReliable(options: Mail.Options) {
  const host = getSmtpHost();
  const user = getSmtpUser();
  const pass = getSmtpPassword();
  const defaultFrom = getDefaultFrom() || user;

  if (!user || !pass) {
    throw new Error(
      "SMTP-Zugangsdaten fehlen. Erwartet werden SMTP_USER/SMTP_PASS oder kompatible EMAIL_/MAIL_/IONOS_-ENV-Namen."
    );
  }

  const candidates = buildCandidates(host);
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      console.log("smtp_send_attempt", {
        label: candidate.label,
        host: candidate.host,
        port: candidate.port,
        secure: candidate.secure,
        requireTLS: candidate.requireTLS === true,
        user,
      });

      const transportOptions = {
        host: candidate.host,
        port: candidate.port,
        secure: candidate.secure,
        requireTLS: candidate.requireTLS,
        auth: {
          user,
          pass,
        },
        pool: false,
        family: 4,
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 30000,
        tls: {
          servername: candidate.host,
          minVersion: "TLSv1.2",
        },
      } as SMTPTransport.Options;

      const transporter = nodemailer.createTransport(transportOptions);

      const result = await transporter.sendMail({
        ...options,
        from: options.from || defaultFrom || user,
      });

      console.log("smtp_send_success", {
        label: candidate.label,
        host: candidate.host,
        port: candidate.port,
        secure: candidate.secure,
        messageId: result.messageId,
        accepted: result.accepted,
        rejected: result.rejected,
      });

      return result;
    } catch (error) {
      const formatted = formatError(error);

      errors.push(`${candidate.label}: ${formatted}`);

      console.error("smtp_send_attempt_failed", {
        label: candidate.label,
        host: candidate.host,
        port: candidate.port,
        secure: candidate.secure,
        error: formatted,
      });
    }
  }

  throw new Error(`SMTP-Versand fehlgeschlagen. Versuche: ${errors.join(" || ")}`);
}

