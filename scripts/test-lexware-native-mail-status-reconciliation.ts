import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20260810100000_reconcile_native_lexware_invoice_mail_status.sql", import.meta.url),
  "utf8",
);
const completionMigration = readFileSync(
  new URL("../supabase/migrations/20260810023000_synchronize_native_invoice_mail_status.sql", import.meta.url),
  "utf8",
);

type InvoiceState = {
  status: string;
  attemptCount: number;
  lastAttemptAt: string | null;
  sentAt: string | null;
  messageId: string | null;
  lastError: string | null;
};
type MailJobState = {
  status: string;
  deliveryState: string;
  attemptCount: number;
  lastAttemptAt: string;
  sentAt: string | null;
  messageId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  locked: boolean;
  error: string | null;
  review: string | null;
  pdfMatches: boolean;
  bindingMatches: boolean;
};

const deliveredMailJob: MailJobState = {
  status: "sent",
  deliveryState: "definitely_sent",
  attemptCount: 1,
  lastAttemptAt: "2026-08-10T00:00:00.000Z",
  sentAt: "2026-08-10T00:00:01.000Z",
  messageId: "message-id",
  startedAt: "2026-08-10T00:00:00.500Z",
  completedAt: "2026-08-10T00:00:01.000Z",
  locked: false,
  error: null,
  review: null,
  pdfMatches: true,
  bindingMatches: true,
};
const staleInvoice: InvoiceState = {
  status: "waiting_for_activation",
  attemptCount: 0,
  lastAttemptAt: null,
  sentAt: null,
  messageId: null,
  lastError: null,
};

function reconcile(invoice: InvoiceState, mailJob: MailJobState) {
  const before = structuredClone(mailJob);
  if (
    mailJob.status !== "sent" ||
    mailJob.deliveryState !== "definitely_sent" ||
    mailJob.sentAt === null ||
    mailJob.messageId === null ||
    mailJob.startedAt === null ||
    mailJob.completedAt === null ||
    mailJob.locked ||
    mailJob.error !== null ||
    mailJob.review !== null ||
    !mailJob.pdfMatches ||
    !mailJob.bindingMatches
  ) throw new Error("BLOCKED");

  const expected: InvoiceState = {
    status: "sent",
    attemptCount: mailJob.attemptCount,
    lastAttemptAt: mailJob.lastAttemptAt,
    sentAt: mailJob.sentAt,
    messageId: mailJob.messageId,
    lastError: null,
  };
  if (JSON.stringify(invoice) === JSON.stringify(expected)) return { invoice, mailJob, smtpCalls: 0 };
  if (invoice.status !== "waiting_for_activation" || invoice.sentAt !== null) throw new Error("BLOCKED");
  return { invoice: expected, mailJob: before, smtpCalls: 0 };
}

const recovered = reconcile(staleInvoice, deliveredMailJob);
assert.equal(recovered.invoice.status, "sent", "A/B RE0003 stale state becomes sent");
assert.equal(recovered.invoice.sentAt, deliveredMailJob.sentAt, "C exact sent_at copied");
assert.equal(recovered.invoice.messageId, deliveredMailJob.messageId, "D exact Message-ID copied");
assert.equal(recovered.invoice.attemptCount, deliveredMailJob.attemptCount, "E attempt count copied");
assert.deepEqual(recovered.mailJob, deliveredMailJob, "F mail job unchanged");
assert.equal(recovered.smtpCalls, 0, "G/H no SMTP or mail");
assert.throws(() => reconcile(staleInvoice, { ...deliveredMailJob, deliveryState: "ambiguous_send" }), /BLOCKED/, "I ambiguous blocked");
assert.throws(() => reconcile(staleInvoice, { ...deliveredMailJob, status: "manual_review", review: "review" }), /BLOCKED/, "J manual review blocked");
assert.throws(() => reconcile(staleInvoice, { ...deliveredMailJob, pdfMatches: false }), /BLOCKED/, "K PDF mismatch blocked");
assert.throws(() => reconcile(staleInvoice, { ...deliveredMailJob, bindingMatches: false }), /BLOCKED/, "L wrong binding blocked");
assert.deepEqual(reconcile(recovered.invoice, deliveredMailJob), recovered, "M exact synchronization is idempotent");

assert.equal((migration.match(/create or replace function/gi) ?? []).length, 1);
assert.match(migration, /public\.reconcile_native_lexware_invoice_mail_status\s*\(/);
assert.match(migration, /returns public\.school_request_invoices/);
assert.match(migration, /security definer\s+set search_path\s*=\s*public,\s*pg_temp/i);
assert.match(migration, /from public, anon, authenticated/i, "N restricted roles revoked");
assert.match(migration, /to service_role/i, "N service role execute only");
assert.doesNotMatch(migration, /cascade|sendMail|nodemailer|createTransport|fetch\s*\(|http_|createFinalInvoice|claim_native|reclaim_native/i);
assert.equal((migration.match(/update public\.school_request_invoices/gi) ?? []).length, 1, "only Invoice mutates");
assert.equal((migration.match(/update public\.school_lexware_invoice_mail_jobs/gi) ?? []).length, 0, "Mailjob never mutates");
assert.match(migration, /invoice_mail_sent_at\s*=\s*mail_job_row\.sent_at/);
assert.match(migration, /invoice_mail_message_id\s*=\s*mail_job_row\.transport_message_id/);
assert.match(migration, /invoice_mail_attempt_count\s*=\s*mail_job_row\.attempt_count/);
assert.match(migration, /mail_job_row\.smtp_attempt_started_at is null/);
assert.match(migration, /mail_job_row\.smtp_attempt_completed_at is null/);
assert.match(migration, /mail_job_row\.manual_review_reason is not null/);
assert.match(migration, /mail_job_row\.pdf_sha256 is distinct from p_pdf_sha256/);
assert.match(migration, /mail_job_row\.attachment_filename_snapshot is distinct from p_attachment_filename/);
assert.match(migration, /invoice_job\.status = 'succeeded'/);
assert.match(migration, /invoice_job\.creation_state = 'definitely_created'/);

assert.match(completionMigration, /status\s*=\s*'sent'/, "O normal completion retained");
assert.match(completionMigration, /invoice_mail_status\s*=\s*'sent'/, "O normal Invoice completion retained");
assert.doesNotMatch(completionMigration, /reconcile_native_lexware_invoice_mail_status/, "O normal completion unchanged");

console.log("PASS A-O: delivered native mail status reconciliation is object-bound, idempotent, and mail-free.");
