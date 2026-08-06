import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const moduleUrl = (path: string) => new URL(path, import.meta.url).href;
const permitCore: typeof import("../app/lib/lexware/lexwareProductionWritePermitCore") =
  await import(moduleUrl("../app/lib/lexware/lexwareProductionWritePermitCore.ts"));
const { evaluateObjectScopedPermitReadiness } = permitCore;

const migration = readFileSync("supabase/migrations/20260806023000_lexware_object_scoped_production_write_permits.sql", "utf8");
const aclFixMigrationPath = "supabase/migrations/20260806114521_fix_lexware_permit_table_acl.sql";
const aclFixMigration = readFileSync(aclFixMigrationPath, "utf8");
const service = readFileSync("app/lib/lexware/lexwareProductionWritePermitService.ts", "utf8");
const permitRoute = readFileSync("app/api/admin/lexware/invoices/[invoiceId]/production-write-permit/route.ts", "utf8");
const activateRoute = readFileSync("app/api/admin/lexware/invoices/[invoiceId]/activate-production-job/route.ts", "utf8");
const claimRoute = readFileSync("app/api/admin/lexware/invoices/[invoiceId]/claim-production-job/route.ts", "utf8");
const processRoute = readFileSync("app/api/admin/lexware/invoices/[invoiceId]/process/route.ts", "utf8");
const processService = readFileSync("app/lib/lexware/lexwareProductionInvoiceProcessService.ts", "utf8");
const processor = readFileSync("app/lib/lexware/lexwareProductionInvoiceProcessorCore.ts", "utf8");
const dryRun = readFileSync("app/lib/lexware/lexwareProductionDryRunService.ts", "utf8");
const maintenance = readFileSync("lib/checkoutMaintenance.ts", "utf8");
const middleware = readFileSync("middleware.ts", "utf8");

function splitTopLevelSqlStatements(source: string) {
  const statements: string[] = [];
  let statement = "";
  let index = 0;
  let state: "normal" | "single" | "double" | "line-comment" | "block-comment" | "dollar" = "normal";
  let blockCommentDepth = 0;
  let dollarTag = "";

  const appendMask = (character: string) => {
    statement += character === "\n" || character === "\r" ? character : " ";
  };

  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1] ?? "";

    if (state === "normal") {
      if (character === "-") {
        if (next === "-") {
          state = "line-comment";
          statement += "  ";
          index += 2;
          continue;
        }
      }
      if (character === "/" && next === "*") {
        state = "block-comment";
        blockCommentDepth = 1;
        statement += "  ";
        index += 2;
        continue;
      }
      if (character === "'") {
        state = "single";
        statement += " ";
        index += 1;
        continue;
      }
      if (character === '"') {
        state = "double";
        statement += " ";
        index += 1;
        continue;
      }
      if (character === "$") {
        const tag = source.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
        if (tag) {
          state = "dollar";
          dollarTag = tag;
          statement += " ".repeat(tag.length);
          index += tag.length;
          continue;
        }
      }
      if (character === ";") {
        if (statement.trim()) statements.push(statement.trim());
        statement = "";
        index += 1;
        continue;
      }
      statement += character;
      index += 1;
      continue;
    }

    if (state === "line-comment") {
      appendMask(character);
      index += 1;
      if (character === "\n") state = "normal";
      continue;
    }

    if (state === "block-comment") {
      if (character === "/" && next === "*") {
        blockCommentDepth += 1;
        statement += "  ";
        index += 2;
        continue;
      }
      if (character === "*" && next === "/") {
        blockCommentDepth -= 1;
        statement += "  ";
        index += 2;
        if (blockCommentDepth === 0) state = "normal";
        continue;
      }
      appendMask(character);
      index += 1;
      continue;
    }

    if (state === "single" || state === "double") {
      const quote = state === "single" ? "'" : '"';
      if (character === quote && next === quote) {
        statement += "  ";
        index += 2;
        continue;
      }
      appendMask(character);
      index += 1;
      if (character === quote) state = "normal";
      continue;
    }

    if (state === "dollar") {
      if (source.startsWith(dollarTag, index)) {
        statement += " ".repeat(dollarTag.length);
        index += dollarTag.length;
        state = "normal";
        dollarTag = "";
        continue;
      }
      appendMask(character);
      index += 1;
    }
  }

  assert.equal(state, "normal", "SQL scanner: comments and quoted sections are terminated");
  if (statement.trim()) statements.push(statement.trim());
  return statements;
}

const firstSqlKeyword = (statement: string) =>
  statement.match(/^([A-Za-z]+|\\\S+)/)?.[1]?.toUpperCase() ?? "";
const forbiddenStatementKeywords = new Set([
  "INSERT", "UPDATE", "DELETE", "MERGE", "COPY", "TRUNCATE",
  "CREATE", "ALTER", "DROP", "DO", "CALL",
]);
const containsForbiddenStatement = (source: string) =>
  splitTopLevelSqlStatements(source).some((statement) =>
    forbiddenStatementKeywords.has(firstSqlKeyword(statement))
  );

const normalizedAclFix = aclFixMigration.replace(/\s+/g, " ").trim().toLowerCase();
const aclFixStatements = splitTopLevelSqlStatements(aclFixMigration);
const aclFixStatementKeywords = aclFixStatements.map(firstSqlKeyword);
assert.ok(aclFixMigrationPath > "supabase/migrations/20260806023000_lexware_object_scoped_production_write_permits.sql", "ACL A: additive migration has a later timestamp");
assert.equal((aclFixMigration.match(/^begin;$/gim) ?? []).length, 1, "ACL B: exactly one BEGIN");
assert.equal((aclFixMigration.match(/^commit;$/gim) ?? []).length, 1, "ACL B: exactly one COMMIT");
assert.deepEqual(aclFixStatementKeywords, ["BEGIN", "REVOKE", "REVOKE", "GRANT", "COMMIT"], "ACL C: only the expected transaction and ACL statements exist");
assert.equal(containsForbiddenStatement(aclFixMigration), false, "ACL D: no data mutation or other forbidden statement");
assert.doesNotMatch(aclFixMigration, /\bcascade\b/i, "ACL E: no CASCADE");
assert.ok(normalizedAclFix.includes("revoke delete, truncate, references, trigger, maintain on table public.school_lexware_production_write_permits from service_role;"), "ACL F: all five excess service_role privileges are revoked");
assert.ok(normalizedAclFix.includes("revoke all on table public.school_lexware_production_write_permits from public, anon, authenticated;"), "ACL G: public roles remain fully revoked");
assert.ok(normalizedAclFix.includes("grant select, insert, update on table public.school_lexware_production_write_permits to service_role;"), "ACL H: exact required service_role privileges are granted");
assert.equal((normalizedAclFix.match(/\bgrant\b/g) ?? []).length, 1, "ACL I: no additional grant is intended");
assert.doesNotMatch(aclFixMigration, /\b(owner\s+to|alter\s+owner)\b/i, "ACL J: owner unchanged");
assert.doesNotMatch(aclFixMigration, /default\s+privileges/i, "ACL K: default privileges unchanged");
assert.doesNotMatch(aclFixMigration, /\b(function|procedure|rpc|permit_state|claim|processor)\b/i, "ACL L: no permit, RPC, claim or processor logic");
assert.doesNotMatch(aclFixMigration, /\b(mail|invoice_provider|production_write_enabled|automatic_mail_enabled)\b/i, "ACL M: no mail, provider or gate changes");
assert.match(normalizedAclFix, /^begin;[\s\S]*commit;$/, "ACL N: ACL correction is transactional");
assert.equal((normalizedAclFix.match(/public\.school_lexware_production_write_permits/g) ?? []).length, 3, "ACL O: every ACL statement targets only the permit table");

assert.equal(containsForbiddenStatement("GRANT SELECT, INSERT, UPDATE ON TABLE public.foo TO service_role;"), false, "Scanner A: ACL privilege names are not DML");
assert.equal(containsForbiddenStatement("REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.foo FROM service_role;"), false, "Scanner B: revoked privilege names are not statements");
assert.equal(containsForbiddenStatement("UPDATE public.foo SET value = 1;"), true, "Scanner C: UPDATE statement is blocked");
assert.equal(containsForbiddenStatement("INSERT INTO public.foo(value) VALUES (1);"), true, "Scanner D: INSERT statement is blocked");
assert.equal(containsForbiddenStatement("DELETE FROM public.foo;"), true, "Scanner E: DELETE statement is blocked");
assert.equal(containsForbiddenStatement("MERGE INTO public.foo USING public.bar ON true WHEN MATCHED THEN DELETE;"), true, "Scanner F: MERGE statement is blocked");
assert.equal(containsForbiddenStatement("-- UPDATE public.foo SET value = 1;\nGRANT SELECT ON TABLE public.foo TO service_role;"), false, "Scanner G: comments are ignored");
assert.equal(containsForbiddenStatement("GRANT SELECT ON TABLE public.foo TO service_role; SELECT 'UPDATE public.foo SET value = 1;';"), false, "Scanner H: string literals are ignored");
assert.deepEqual(aclFixStatementKeywords.filter((keyword) => keyword === "BEGIN" || keyword === "COMMIT"), ["BEGIN", "COMMIT"], "Scanner I: exactly one outer transaction remains required");
assert.equal(aclFixStatements.filter((statement) => /\bON\s+TABLE\s+public[.]school_lexware_production_write_permits\b/i.test(statement)).length, 3, "Scanner J: every ACL statement targets the expected table");

const noStoreMatcher = middleware.match(
  /const LEXWARE_NO_STORE_ADMIN_ROUTE =\s*(\/\^[^\r\n]+\/[a-z]*);/,
);
assert.ok(noStoreMatcher, "middleware defines the object-scoped Lexware no-store matcher");
const matcherLiteral = noStoreMatcher[1];
const matcherSeparator = matcherLiteral.lastIndexOf("/");
const lexwareNoStoreAdminRoute = new RegExp(
  matcherLiteral.slice(1, matcherSeparator),
  matcherLiteral.slice(matcherSeparator + 1),
);
const invoiceId = "22222222-2222-4222-8222-222222222222";
for (const action of [
  "production-write-permit",
  "activate-production-job",
  "claim-production-job",
]) {
  assert.equal(
    lexwareNoStoreAdminRoute.test(`/api/admin/lexware/invoices/${invoiceId}/${action}`),
    true,
    `${action}: unauthenticated middleware 401 receives no-store`,
  );
}
assert.equal(
  lexwareNoStoreAdminRoute.test("/api/admin/lexware/runtime-readiness"),
  false,
  "unrelated admin routes retain their existing cache contract",
);
assert.match(middleware, /NextResponse[.]json\([\s\S]*?\{ status: 401 \}/, "unauthenticated API response remains 401 JSON");
assert.match(middleware, /requiresNoStoreApiUnauthorizedResponse\(pathname\)[\s\S]*?headers[.]set\("Cache-Control", "no-store"\)/);
assert.doesNotMatch(middleware, /Cache-Control[^\r\n]*(?:public|s-maxage)/i, "sensitive 401 contract is never public or shared-cacheable");
assert.match(middleware, /verifyAdminSessionToken\(sessionToken\)[\s\S]*?createApiUnauthorizedResponse\(pathname\)/, "admin authentication remains before the route response");
assert.match(middleware, /pathname === "\/api\/admin\/paypal\/runtime-readiness"/, "PayPal readiness remains in the no-store contract");

for (const identity of ["invoice_id", "request_id", "job_id"]) assert.match(migration, new RegExp(identity));
assert.match(migration, /invoice_row\.request_id is distinct from p_request_id/); // A-C
assert.match(migration, /invoice_row\.lexware_invoice_job_id is distinct from job_row\.id/); // D
assert.match(migration, /PERMIT_ORGANIZATION_MISMATCH/); // E
assert.match(migration, /PERMIT_PAYLOAD_MISMATCH/); // F
assert.match(migration, /lexware-payload-canonical-v2/); // G
assert.match(migration, /PERMIT_EXTERNAL_IDENTITY_PRESENT/); // H
assert.match(migration, /job_row\.attempt_count <> 0/); // I
assert.match(migration, /PERMIT_JOB_LOCKED/); // J
assert.match(migration, /one_active_per_job/); // K
assert.match(migration, /ACTIVATION_PERMIT_EXPIRED/); // L
assert.match(migration, /status='pending'/); assert.match(migration, /permit_state='activated'/); // M
const activationFunction = migration.slice(migration.indexOf("activate_school_lexware_production_write_permit"), migration.indexOf("claim_school_lexware_invoice_job_with_permit"));
assert.doesNotMatch(activationFunction, /claim_school_lexware_invoice_job_for_processing|attempt_count\s*=|locked_at\s*=|lexware\.io/); // N-O
assert.match(migration, /permit_row\.permit_state <> 'activated'/); // P
assert.match(migration, /permit_state='claimed'/); assert.doesNotMatch(claimRoute, /processLexwareProductionInvoiceById|createLexwareProductionFinalInvoice/); // Q
assert.match(migration, /claim_row\.attempt_count <> 1/); // R
assert.match(migration, /claim_school_lexware_invoice_job_for_processing\(/); // S
assert.match(processRoute, /FINALIZE_SINGLE_LEXWARE_INVOICE/); assert.match(processRoute, /claimId,confirmation,permitId/); // T
assert.match(processor, /postCount: 1/); assert.match(processService, /loadPreclaimedClaim/); // U
assert.match(processor, /creation_state_unknown/); assert.match(processService, /manual_review/); // V
assert.match(migration, /permit_state=target_state, consumed_at=now_value/); // W
assert.match(migration, /permit_row\.permit_state<>'claimed'/); // X
for (const source of [migration, service, permitRoute, activateRoute, claimRoute]) assert.doesNotMatch(source, /sendMail|mailTransport|school_lexware_invoice_mail_jobs.*insert/); // Y
assert.doesNotMatch(migration, /update\s+public\.school_request_invoices\s+set\s+invoice_provider/i); // Z
assert.match(processService, /objectScopedProductionPermitValid/); assert.doesNotMatch(processService, /lexware_production_write_enabled:\s*true/); // AA
assert.match(maintenance, /CHECKOUT_MAINTENANCE_ACTIVE = false/); // AB
assert.match(migration, /permit_row\.job_id <> job_row\.id/); // AC
assert.match(processService, /permitContext \?/); assert.match(processRoute, /: undefined/); // AD
assert.match(migration, /enable row level security/); assert.match(migration, /grant execute[\s\S]*to service_role/); // AE
assert.equal((migration.match(/security definer/g) ?? []).length, 4); assert.equal((migration.match(/set search_path = public, pg_temp/g) ?? []).length, 4); // AF
assert.doesNotMatch(migration, /on delete cascade|drop table|drop function/i); // AG
assert.doesNotMatch(migration, /execute\s+(format|immediate)|execute\s+[^;]+\s+using|\|\|\s*'select/i); // AH
for (const counter of ["lexwareReadRequestsPerformed: 0", "lexwareWriteRequestsPerformed: 0", "databaseWritesPerformed: 0", "mailOperationsPerformed: 0"]) assert.match(dryRun, new RegExp(counter)); // AI
for (const contract of ["admin_manual_enqueue", "waiting_for_activation", "not_attempted", "attempt_count <> 0", "lexware-payload-canonical-v2"]) assert.ok(migration.includes(contract)); // AJ

const permit = {
  id: "11111111-1111-4111-8111-111111111111",
  invoiceId: "22222222-2222-4222-8222-222222222222",
  requestId: "33333333-3333-4333-8333-333333333333",
  jobId: "44444444-4444-4444-8444-444444444444",
  targetOrganizationId: "55555555-5555-4555-8555-555555555555",
  payloadHashVersion: "lexware-payload-canonical-v2",
  payloadSha256: "a".repeat(64),
  state: "activated" as const,
  expiresAt: "2026-08-06T03:00:00.000Z",
  claimId: null,
};
const ready = evaluateObjectScopedPermitReadiness({ permit, invoiceId: permit.invoiceId, requestId: permit.requestId,
  jobId: permit.jobId, targetOrganizationId: permit.targetOrganizationId, payloadHashVersion: permit.payloadHashVersion,
  payloadSha256: permit.payloadSha256, jobStatus: "pending", attemptCount: 0, technicalPreviewReady: true,
  now: "2026-08-06T02:00:00.000Z" });
assert.equal(ready.objectScopedClaimReady, true);
assert.equal(evaluateObjectScopedPermitReadiness({ ...{
  permit, invoiceId: permit.invoiceId, requestId: permit.requestId, jobId: permit.jobId,
  targetOrganizationId: permit.targetOrganizationId, payloadHashVersion: permit.payloadHashVersion,
  payloadSha256: permit.payloadSha256, jobStatus: "pending", attemptCount: 0, technicalPreviewReady: true,
  now: "2026-08-06T04:00:00.000Z",
} }).objectScopedClaimReady, false);

console.log("PASS A-AJ: object-scoped permit; no database, Lexware, mail, checkout or environment operations.");
