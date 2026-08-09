import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20260810023000_synchronize_native_invoice_mail_status.sql", import.meta.url),
  "utf8",
);
const processor = readFileSync(
  new URL("../app/lib/lexware/lexwareProductionMailProcessor.ts", import.meta.url),
  "utf8",
);

assert.equal((migration.match(/create or replace function/gi) ?? []).length, 1, "one Completion RPC only");
assert.match(migration, /public\.complete_native_lexware_invoice_mail_send\s*\(/);
assert.match(migration, /security definer\s+set search_path\s*=\s*public,\s*pg_temp/i);

assert.match(migration, /status\s*=\s*'sent'/, "A mail job sent");
assert.match(migration, /invoice_mail_status\s*=\s*'sent'/, "B invoice sent");
assert.match(migration, /invoice_mail_sent_at\s*=\s*completed_at/, "C invoice sent timestamp");
assert.match(migration, /sent_at\s*=\s*completed_at[\s\S]*smtp_attempt_completed_at\s*=\s*completed_at/, "D shared completion time");
assert.match(migration, /begin;[\s\S]*update public\.school_lexware_invoice_mail_jobs[\s\S]*update public\.school_request_invoices[\s\S]*commit;/, "E one transaction");
assert.match(migration, /if not found then\s*raise exception 'NATIVE_MAIL_SEND_COMPLETE_INVOICE_UPDATE_BLOCKED'/, "F invoice failure rolls transaction back");

assert.equal((processor.match(/return sendClaimedMailAtMostOnce\s*\(/g) ?? []).length, 1, "G one SMTP path");
assert.match(processor, /before\.status === "sent" \|\| before\.delivery_state === "definitely_sent"/, "H already sent not reclaimed");
assert.match(migration, /mail_job_row\.status = 'sent'[\s\S]*return mail_job_row/, "H idempotent completed contract");

for (const forbidden of ["ambiguous_send", "definitely_not_sent", "retry", "manual_review"]) {
  assert.doesNotMatch(migration, new RegExp(`invoice_mail_status\\s*=\\s*'sent'[\\s\\S]{0,200}${forbidden}`), `I-L ${forbidden} cannot mark invoice sent`);
}

assert.doesNotMatch(migration, /requestInvoiceMailService|generateRequestInvoicePdf|legacy_internal/, "M legacy path unchanged");
assert.match(migration, /mail_job_row\.pdf_sha256 is distinct from invoice_row\.lexware_pdf_sha256/, "N PDF hash bound");
assert.match(migration, /mail_job_row\.attachment_filename_snapshot is distinct from invoice_row\.lexware_pdf_filename/, "N attachment bound");
assert.doesNotMatch(migration, /lexware_automatic_mail_enabled|automaticMailEnabled/, "O automatic mail gate unchanged");

assert.match(migration, /mail_job\.attempt_count = p_attempt_count/);
assert.match(migration, /mail_job\.locked_by = p_locked_by/);
assert.match(migration, /mail_job\.delivery_state = 'send_started'/);
assert.match(migration, /mail_job\.transport_message_id = p_message_id/);
assert.match(migration, /invoice_job\.request_id = invoice_row\.request_id/);
assert.match(migration, /invoice_job_row\.trigger_source <> 'checkout_native_lexware'/);
assert.match(migration, /NATIVE_MAIL_COMPLETION_ALREADY_SENT_INVOICE_STALE/, "stale production case remains explicit and mail-free");

assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated/i);
assert.match(migration, /grant execute on function[\s\S]*to service_role/i);
assert.doesNotMatch(migration, /sendMail|nodemailer|createTransport|fetch\s*\(|createFinalInvoice|cascade|execute\s+format/i);

console.log("PASS A-O: native mail completion atomically synchronizes invoice status without another send path.");
