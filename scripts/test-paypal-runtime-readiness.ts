import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

async function main() {
const testDirectory = dirname(fileURLToPath(import.meta.url));
const coreModulePath = resolve(
  testDirectory,
  "../app/lib/paypalRuntimeReadinessCore.ts",
);
const coreModuleUrl = pathToFileURL(coreModulePath);
const { buildPayPalRuntimeReadiness } = await import(coreModuleUrl.href);

const completeLiveInput = {
  environment: "live",
  clientIdConfigured: true,
  clientSecretConfigured: true,
  webhookIdConfigured: true,
  productionSiteUrlConfigured: true,
  checkoutMaintenance: { known: true, value: true },
};

function readiness(
  override: object = {},
) {
  return buildPayPalRuntimeReadiness({ ...completeLiveInput, ...override });
}

type UnsafeCastFinding = {
  file: string;
  line: number;
  column: number;
  castType: "any" | "unknown-chain";
};

function unwrapParentheses(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}

function castParts(node: ts.Node): {
  expression: ts.Expression;
  type: ts.TypeNode;
} | null {
  if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
    return { expression: node.expression, type: node.type };
  }
  return null;
}

function findUnsafeCasts(file: string, source: string): UnsafeCastFinding[] {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const findings: UnsafeCastFinding[] = [];

  function addFinding(node: ts.Node, castType: UnsafeCastFinding["castType"]) {
    const position = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );
    findings.push({
      file,
      line: position.line + 1,
      column: position.character + 1,
      castType,
    });
  }

  function visit(node: ts.Node) {
    const cast = castParts(node);
    if (cast?.type.kind === ts.SyntaxKind.AnyKeyword) {
      addFinding(node, "any");
    }

    if (cast) {
      const innerCast = castParts(unwrapParentheses(cast.expression));
      if (innerCast?.type.kind === ts.SyntaxKind.UnknownKeyword) {
        addFinding(node, "unknown-chain");
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

const live = readiness();
assert.equal(live.ok, true, "A: complete live configuration passes");

const sandbox = readiness({ environment: "sandbox" });
assert.equal(sandbox.runtime.environmentKnown, true, "B: sandbox is known");
assert.equal(sandbox.runtime.environmentIsLive, false, "B: sandbox is not live");

for (const [label, environment] of [
  ["C: missing environment is unknown", null],
  ["D: invalid environment is parsed as unknown", null],
] as const) {
  const result = readiness({ environment });
  assert.equal(result.runtime.environmentKnown, false, label);
  assert.equal(result.runtime.environmentIsLive, null, label);
  assert.equal(result.runtime.liveApiSelected, false, label);
}

assert.equal(readiness({ clientIdConfigured: false }).runtime.clientIdConfigured, false, "E: missing client ID");
assert.equal(readiness({ clientSecretConfigured: false }).runtime.clientSecretConfigured, false, "F: missing client secret");
assert.equal(readiness({ webhookIdConfigured: false }).runtime.webhookIdConfigured, false, "G: missing webhook ID");
assert.equal(live.runtime.productionSiteUrlConfigured, true, "H: exact production site URL");
assert.equal(readiness({ productionSiteUrlConfigured: false }).runtime.productionSiteUrlConfigured, false, "I: differing URL is rejected");
assert.equal(live.runtime.liveApiSelected, true, "J: live selects live API");
assert.equal(sandbox.runtime.liveApiSelected, false, "J: sandbox does not select live API");

const serialized = JSON.stringify(live);
for (const forbidden of ["client-id-value", "client-secret-value", "webhook-id-value"]) {
  assert.equal(serialized.includes(forbidden), false, "K/L: response contains no secret or ID values");
}

for (const counter of [
  live.safety.ordersCreated,
  live.safety.capturesPerformed,
  live.safety.webhooksSent,
  live.safety.databaseWritesPerformed,
  live.safety.mailsSent,
  live.safety.lexwareJobsCreated,
]) {
  assert.equal(counter, 0, "M: safety counters are numeric zero");
  assert.equal(typeof counter, "number", "M: safety counters are numbers");
}

assert.deepEqual(
  readiness({ checkoutMaintenance: { known: true, value: false } }).safety,
  { ...live.safety, checkoutMaintenanceKnown: true, checkoutMaintenance: false },
  "N: known maintenance false is preserved",
);
assert.equal(
  readiness({ checkoutMaintenance: { known: false, value: true } }).safety.checkoutMaintenance,
  null,
  "O: unknown maintenance is null",
);

const routeSource = readFileSync("app/api/admin/paypal/runtime-readiness/route.ts", "utf8");
const coreSource = readFileSync("app/lib/paypalRuntimeReadinessCore.ts", "utf8");
const testSource = readFileSync("scripts/test-paypal-runtime-readiness.ts", "utf8");

assert.deepEqual(findUnsafeCasts("A.ts", "const x = value as any"), [
  { file: "A.ts", line: 1, column: 11, castType: "any" },
]);
assert.deepEqual(
  findUnsafeCasts("B.ts", "const x = value as unknown as Foo").map((finding) => finding.castType),
  ["unknown-chain"],
  "AST B: double unknown cast is detected",
);
for (const [file, source] of [
  ["C.ts", 'const x = "as any"'],
  ["D.ts", String.raw`const x = /as\s+any/`],
  ["E.ts", "// value as any"],
  ["F.ts", 'const message = "as unknown as"'],
  ["G.ts", "const x = value as const"],
  ["H.ts", "const x = value as Foo"],
] as const) {
  assert.deepEqual(findUnsafeCasts(file, source), [], `AST ${file}: no false positive`);
}

assert.match(routeSource, /export async function GET\s*\(/, "P: route exports GET");
assert.doesNotMatch(routeSource, /export async function (POST|PUT|PATCH|DELETE)\s*\(/, "P: route exports only GET");
assert.match(routeSource, /requireAdminApiSession/, "Q: route uses central admin protection");
assert.match(routeSource, /Cache-Control[\s\S]*no-store/, "R: route defines no-store");
assert.match(routeSource, /if \(unauthorized\) return withNoStore\(unauthorized\)/, "R: 401 uses no-store wrapper");
assert.match(routeSource, /return withNoStore\([\s\S]*503/, "R: readiness response including 503 uses no-store wrapper");
assert.doesNotMatch(routeSource, /\bfetch\s*\(/, "S: route makes no external request");
assert.doesNotMatch(routeSource, /from ["'][^"']*paypal[.]ts["']|createPayPalOrder|capturePayPalOrder|getPayPalAccessToken/, "T: route has no PayPal client");
assert.doesNotMatch(routeSource, /supabase|[.]from\s*\(|[.]rpc\s*\(|insert\s*\(|update\s*\(|delete\s*\(/i, "U: route has no database access or mutation");
assert.doesNotMatch(coreSource, /^import\s/m, "V: core has no imports");
assert.doesNotMatch(coreSource, /process[.]env/, "W: core does not read environment variables");

for (const source of [routeSource, coreSource]) {
  assert.doesNotMatch(source, /@ts-ignore|@ts-expect-error|@ts-nocheck/, "X: no TypeScript suppressions");
}
const unsafeCasts = [
  ...findUnsafeCasts("app/api/admin/paypal/runtime-readiness/route.ts", routeSource),
  ...findUnsafeCasts("app/lib/paypalRuntimeReadinessCore.ts", coreSource),
  ...findUnsafeCasts("scripts/test-paypal-runtime-readiness.ts", testSource),
];
assert.deepEqual(
  unsafeCasts.filter((finding) => finding.castType === "any"),
  [],
  "Y: no actual any casts",
);
assert.deepEqual(
  unsafeCasts.filter((finding) => finding.castType === "unknown-chain"),
  [],
  "Z: no actual double assertions through unknown",
);

console.log("PayPal runtime readiness tests passed (A-Z).");
}

main().catch((error: unknown) => {
  console.error(
    "PayPal runtime readiness test failed:",
    error instanceof Error ? error.name : "UNKNOWN_ERROR",
  );
  process.exitCode = 1;
});
