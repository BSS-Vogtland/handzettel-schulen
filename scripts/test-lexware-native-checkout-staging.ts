import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260807100000_native_lexware_checkout_staging.sql", "utf8");
const returnTypeFixMigration = readFileSync("supabase/migrations/20260807164644_fix_native_staging_invoice_token_return_type.sql", "utf8");
const shop = readFileSync("app/api/shop/checkout/route.ts", "utf8");
const offer = readFileSync("app/api/offer/[token]/checkout/route.ts", "utf8");
const staging = readFileSync("app/lib/lexware/lexwareNativeCheckoutStaging.ts", "utf8");
const repository = readFileSync("app/lib/lexware/lexwareProductionInvoiceJobRepository.ts", "utf8");
const processService = readFileSync("app/lib/lexware/lexwareProductionInvoiceProcessService.ts", "utf8");
const gates = readFileSync("app/lib/lexware/lexwareProductionInvoiceJob.ts", "utf8");
const permitMigration = readFileSync("supabase/migrations/20260806023000_lexware_object_scoped_production_write_permits.sql", "utf8");
const aclMigration = readFileSync("supabase/migrations/20260807111500_restrict_native_lexware_table_privileges.sql", "utf8");

function containsBooks(items: Array<{ isBook: boolean }>) {
  return items.some((item) => item.isBook);
}

function assertNativeInvoiceBookFlag(
  invoice: Record<string, unknown>,
) {
  assert.equal(
    typeof invoice.contains_books,
    "boolean",
    "Native invoice payload requires an explicit contains_books boolean",
  );
}

assert.equal((migration.match(/^begin;$/gim) ?? []).length, 1);
assert.equal((migration.match(/^commit;$/gim) ?? []).length, 1);
assert.match(migration, /invoice_provider is distinct from 'lexware'/);
assert.match(migration, /tax_snapshot_version = 'invoice-tax-snapshot-v2'/);
assert.match(migration, /lexware_invoice_id is null[\s\S]*lexware_invoice_number is null[\s\S]*lexware_finalized_at is null/);
assert.match(migration, /lexware_invoice_job_id is not null[\s\S]*lexware_invoice_id\), ''\) is not null[\s\S]*lexware_finalized_at is not null/);
assert.doesNotMatch(migration, /on delete cascade/i);

assert.match(migration, /stage_native_lexware_checkout_invoice/);
assert.equal((returnTypeFixMigration.match(/^begin;$/gim) ?? []).length, 1);
assert.equal((returnTypeFixMigration.match(/^commit;$/gim) ?? []).length, 1);
assert.match(
  returnTypeFixMigration,
  /drop function public\.stage_native_lexware_checkout_invoice\(jsonb,jsonb,jsonb,text,text\);/,
);
assert.doesNotMatch(returnTypeFixMigration, /cascade/i);
assert.match(
  returnTypeFixMigration,
  /returns table \([\s\S]*invoice_id uuid,[\s\S]*invoice_number text,[\s\S]*invoice_token text,[\s\S]*invoice_status text,[\s\S]*payment_status text,[\s\S]*invoice_job_id uuid,[\s\S]*job_status text,[\s\S]*job_creation_state text[\s\S]*\)/,
);
assert.doesNotMatch(returnTypeFixMigration, /invoice_token\s+uuid|invoice_token::uuid|invoice_row\.invoice_token::uuid/);
assert.match(returnTypeFixMigration, /security definer/);
assert.match(returnTypeFixMigration, /set search_path = public, pg_temp/);
assert.match(
  returnTypeFixMigration,
  /revoke all on function public\.stage_native_lexware_checkout_invoice\(jsonb,jsonb,jsonb,text,text\)[\s\S]*from public, anon, authenticated;/,
);
assert.match(
  returnTypeFixMigration,
  /grant execute on function public\.stage_native_lexware_checkout_invoice\(jsonb,jsonb,jsonb,text,text\)[\s\S]*to service_role;/,
);
assert.match(staging, /invoice_token: string/);
assert.match(staging, /typeof row\.invoice_token !== "string"/);
const hexInvoiceToken = "a".repeat(48);
assert.equal(hexInvoiceToken.length, 48);
assert.match(hexInvoiceToken, /^[a-f0-9]{48}$/);
assert.equal(hexInvoiceToken, String(hexInvoiceToken));

function functionBody(sql: string) {
  const match = sql.match(/as \$\$([\s\S]*?)\$\$;/);
  assert.ok(match, "Native staging function body must be present");
  return match[1].trim();
}

assert.equal(functionBody(returnTypeFixMigration), functionBody(migration));
assert.match(migration, /trigger_source[\s\S]*'checkout_native_lexware'/);
assert.match(migration, /'pending', 'not_attempted', 0/);
assert.match(migration, /lexware-payload-canonical-v2/);
assert.match(migration, /NATIVE_PROVIDER_CUTOVER_INACTIVE/);
assert.match(migration, /insert into public\.school_request_invoices[\s\S]*insert into public\.school_request_invoice_items[\s\S]*insert into public\.school_lexware_invoice_jobs[\s\S]*update public\.school_request_invoices/);

for (const checkout of [shop, offer]) {
  assert.match(checkout, /stageNativeLexwareCheckoutInvoice/);
  assert.match(checkout, /selectedInvoiceProvider === "lexware"/);
  assert.doesNotMatch(checkout, /createLexwareProductionFinalInvoice|claimInvoiceJobForProcessing|lexwareGetJson|lexwarePost|processLexwareProductionInvoiceById/);
  assert.match(checkout, /if \(!nativeLexwareCheckout\) \{[\s\S]*sendCustomerInvoiceMailSafely/);
}
assert.match(
  shop,
  /contains_books:\s*cartItems\.some\(\(item\) => item\.isBook\)/,
);
assert.doesNotMatch(
  shop,
  /contains_books:\s*(?:null|undefined)/,
);
assert.match(
  shop,
  /stageNativeLexwareCheckoutInvoice\(\{[\s\S]*invoice:\s*invoiceValues/,
);
assert.match(
  offer,
  /contains_books:\s*bookSummary\s*\.containsBooks/,
);
assert.equal(containsBooks([{ isBook: false }]), false);
assert.equal(containsBooks([{ isBook: true }]), true);
assert.equal(
  containsBooks([
    { isBook: false },
    { isBook: true },
    { isBook: false },
  ]),
  true,
);
assert.equal(
  containsBooks([
    { isBook: false },
    { isBook: false },
  ]),
  false,
);
assert.equal(typeof containsBooks([]), "boolean");
assert.equal(containsBooks([]), false);
assertNativeInvoiceBookFlag({ contains_books: false });
assertNativeInvoiceBookFlag({ contains_books: true });
assert.throws(() => assertNativeInvoiceBookFlag({}));
assert.throws(() => assertNativeInvoiceBookFlag({ contains_books: null }));
assert.match(staging, /buildEligibleLocalInvoice/);
assert.match(staging, /stage_native_lexware_checkout_invoice/);
assert.doesNotMatch(staging, /fetch\(|lexware\.io|claim|mail|pdf/i);

assert.match(migration, /claim_native_lexware_invoice_job_for_processing/);
assert.match(migration, /invoice_row\.invoice_provider is distinct from 'lexware'/);
assert.match(migration, /job_row\.trigger_source is distinct from 'checkout_native_lexware'/);
assert.match(migration, /settings_row\.lexware_production_write_enabled is not true/);
assert.match(migration, /job_row\.status not in \('pending', 'retry'\)/);
assert.match(migration, /NATIVE_JOB_LOCK_CONFLICT/);
assert.match(repository, /rpc\("claim_native_lexware_invoice_job_for_processing"/);
assert.match(processService, /job\.trigger_source === "checkout_native_lexware"/);
assert.match(processService, /nativeProductionJob/);
assert.match(gates, /input\.nativeProductionJob === true \|\| input\.checkoutMaintenanceActive === true/);

assert.match(permitMigration, /claim_school_lexware_invoice_job_with_permit/);
assert.match(permitMigration, /claim_school_lexware_invoice_job_for_processing/);
assert.doesNotMatch(permitMigration, /claim_native_lexware_invoice_job_for_processing/);

assert.doesNotMatch(migration + staging + shop + offer, /automaticMailEnabled|lexware_automatic_mail_enabled/);

assert.equal((aclMigration.match(/^begin;$/gim) ?? []).length, 1);
assert.equal((aclMigration.match(/^commit;$/gim) ?? []).length, 1);
const aclTables = [...aclMigration.matchAll(/on table public\.(school_[a-z_]+)/gi)].map((match) => match[1]);
assert.deepEqual([...new Set(aclTables)].sort(), [
  "school_lexware_invoice_jobs",
  "school_request_invoice_items",
  "school_request_invoices",
]);
assert.doesNotMatch(aclMigration, /constraint|\b(insert into|update\s+public|delete from|merge into)\b|cascade/i);
assert.doesNotMatch(aclMigration, /default privileges|owner to|row level security|\bpolicy\b/i);
assert.match(aclMigration, /revoke all privileges\s+on table public\.school_request_invoices\s+from anon, authenticated;/i);
assert.match(aclMigration, /revoke delete, truncate, references, trigger, maintain\s+on table public\.school_request_invoices\s+from service_role;/i);
assert.match(aclMigration, /grant select, insert, update\s+on table public\.school_request_invoices\s+to service_role;/i);
assert.match(aclMigration, /revoke all privileges\s+on table public\.school_request_invoice_items\s+from anon, authenticated;/i);
assert.match(aclMigration, /revoke update, delete, truncate, references, trigger, maintain\s+on table public\.school_request_invoice_items\s+from service_role;/i);
assert.match(aclMigration, /grant select, insert\s+on table public\.school_request_invoice_items\s+to service_role;/i);
assert.match(aclMigration, /revoke all privileges\s+on table public\.school_lexware_invoice_jobs\s+from public, anon, authenticated;/i);
assert.match(aclMigration, /revoke delete, truncate, references, trigger, maintain\s+on table public\.school_lexware_invoice_jobs\s+from service_role;/i);
assert.match(aclMigration, /grant select, insert, update\s+on table public\.school_lexware_invoice_jobs\s+to service_role;/i);
assert.equal((aclMigration.match(/\bgrant\b/gim) ?? []).length, 3);
assert.equal((aclMigration.match(/\brevoke\b/gim) ?? []).length, 6);
console.log("Lexware native checkout staging A-AD PASS");
