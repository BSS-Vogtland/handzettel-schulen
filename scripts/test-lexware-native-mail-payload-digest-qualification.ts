import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20260810010000_qualify_native_mail_payload_digest.sql", import.meta.url),
  "utf8",
);
const wrapper = readFileSync(
  new URL("../supabase/migrations/20260809190000_native_lexware_pdf_delivery_pipeline.sql", import.meta.url),
  "utf8",
);

assert.equal((migration.match(/create or replace function/gi) ?? []).length, 1, "one replaced function");
assert.match(migration, /public\.enqueue_school_lexware_invoice_mail_job\s*\(/);
assert.match(migration, /security definer\s+set search_path\s*=\s*public,\s*pg_temp/i);
assert.doesNotMatch(migration, /set search_path\s*=\s*[^;\n]*extensions/i);
assert.equal((migration.match(/extensions\.digest\s*\(/g) ?? []).length, 1, "qualified digest exactly once");
assert.doesNotMatch(migration, /(?<![.\w])digest\s*\(/);
assert.match(migration, /p_mail_payload_snapshot::text,\s*'sha256'/s);
assert.match(migration, /encode\s*\([\s\S]*extensions\.digest[\s\S]*'hex'\s*\)/);

const first = JSON.stringify({ schemaVersion: "native-lexware-mail-v1", invoiceNumber: "TEST", total: "0,01 €" });
const same = JSON.stringify({ schemaVersion: "native-lexware-mail-v1", invoiceNumber: "TEST", total: "0,01 €" });
const different = JSON.stringify({ schemaVersion: "native-lexware-mail-v1", invoiceNumber: "TEST-2", total: "0,01 €" });
const hash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
assert.equal(hash(first), hash(same), "A same payload same hash");
assert.match(hash(first), /^[a-f0-9]{64}$/, "B lowercase SHA-256 hex");
assert.notEqual(hash(first), hash(different), "C different payload different hash");

assert.match(migration, /'lexware-invoice-mail-v1:'\s*\|\|\s*invoice_job_row\.id::text/s, "D idempotency unchanged");
assert.match(migration, /mail_job_row\.mail_payload_sha256\s*<>\s*generated_payload_hash/, "E stored hash comparison unchanged");
assert.match(migration, /p_mail_payload_snapshot::text/, "F JSON text representation unchanged");
assert.match(migration, /else 'waiting_for_activation'/, "H manual enqueue remains waiting");
assert.match(migration, /desired_status,\s*0,/s, "I attempt count zero");
assert.doesNotMatch(migration, /locked_at\s*=|smtp_attempt_started_at\s*=|sendLexware|smtp|nodemailer/i, "J-M no lock, marker, SMTP or mail");
assert.match(migration, /on conflict \(invoice_job_id\) do nothing/, "N duplicate contract unchanged");
assert.match(migration, /Absender-E-Mail ist ungültig/, "O sender guard unchanged");
assert.match(migration, /Empfänger-E-Mail ist ungültig/, "P recipient guard unchanged");
assert.match(wrapper, /NATIVE_MAIL_PDF_NOT_READY/, "Q PDF-not-ready guard remains in unchanged wrapper");
assert.match(wrapper, /m:=public\.enqueue_school_lexware_invoice_mail_job/, "wrapper call unchanged");
assert.match(wrapper, /security definer set search_path=public,pg_temp/i, "wrapper security unchanged");
assert.match(wrapper, /lexware_pdf_storage_bucket=i\.lexware_pdf_storage_bucket/, "wrapper PDF copy unchanged");

assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated/i);
assert.match(migration, /grant execute on function[\s\S]*to service_role/i);
assert.doesNotMatch(migration, /execute\s+format|\bexecute\s+immediate|cascade/i);

console.log("PASS A-Q: qualified native mail payload digest; security, hash and enqueue contracts unchanged.");
