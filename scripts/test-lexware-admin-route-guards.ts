import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const moduleUrl = (path: string) => new URL(path, import.meta.url).href;
const guards: typeof import("../app/lib/adminMutationRequestGuard") =
  await import(moduleUrl("../app/lib/adminMutationRequestGuard.ts"));
const { AdminMutationRequestError, hasExactConfirmation, hasSameRequestOrigin, readLimitedJsonBody } = guards;
const url = "https://example.test/api/admin/lexware/invoices/00000000-0000-4000-8000-000000000001/enqueue";
const request = (body: string, headers: HeadersInit = {}) => new Request(url, { method: "POST", body, headers });

assert.equal(hasSameRequestOrigin(request("{}")), false); console.log("A PASS");
assert.equal(hasSameRequestOrigin(request("{}", { origin: "https://evil.test" })), false); console.log("B PASS");
assert.equal(hasSameRequestOrigin(request("{}", { referer: "https://evil.test/x" })), false); console.log("C PASS");
assert.equal(hasSameRequestOrigin(request("{}", { referer: "https://example.test/admin" })), true); console.log("D PASS");
assert.equal(hasSameRequestOrigin(request("{}", { origin: "https://example.test" })), true); console.log("E PASS");
await assert.rejects(() => readLimitedJsonBody(request(JSON.stringify({ confirmation: "x", padding: "x".repeat(1100) }), { "content-length": "1200" }), 1024), (error: unknown) => error instanceof AdminMutationRequestError && error.code === "BODY_TOO_LARGE"); console.log("F PASS");
await assert.rejects(() => readLimitedJsonBody(request(JSON.stringify({ padding: "ä".repeat(600) })), 1024), (error: unknown) => error instanceof AdminMutationRequestError && error.code === "BODY_TOO_LARGE"); console.log("G PASS");
assert.equal(hasExactConfirmation({ confirmation: "x", extra: true }, "x"), false); console.log("H PASS");
assert.equal(hasExactConfirmation({ confirmation: "wrong" }, "x"), false); console.log("I PASS");
assert.deepEqual(await readLimitedJsonBody(request('{"confirmation":"x"}'), 1024), { confirmation: "x" }); console.log("J PASS");

for (const path of [
  "app/api/admin/lexware/invoices/[invoiceId]/enqueue/route.ts",
  "app/api/admin/lexware/invoices/[invoiceId]/process/route.ts",
]) {
  const source = readFileSync(path, "utf8");
  assert.match(source, /requireAdminApiSession/);
  assert.match(source, /hasSameRequestOrigin/);
  assert.match(source, /readLimitedJsonBody\(request, 1_024\)/);
  assert.doesNotMatch(source, /request\.json\s*\(/);
}
console.log("PASS A-J: guards and actual UTF-8 body limit; no database or external operations.");
