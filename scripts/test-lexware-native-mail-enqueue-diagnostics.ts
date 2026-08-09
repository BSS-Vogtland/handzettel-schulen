import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const diagnostics = await import(pathToFileURL(resolve(root,
  "app/lib/lexware/lexwareNativeMailEnqueueDiagnostics.ts")).href);
const wrapped = (stage: (typeof diagnostics.NATIVE_MAIL_ENQUEUE_STAGES)[number], error: unknown) =>
  new diagnostics.NativeMailEnqueueStageError(stage, error);

assert.deepEqual(diagnostics.classifyNativeMailEnqueueError(wrapped("sender_resolve",
  new Error("SMTP_SENDER_CONFIGURATION_INVALID"))), { reason:"NATIVE_MAIL_SENDER_INVALID",stage:"sender_resolve" }, "B");
assert.deepEqual(diagnostics.classifyNativeMailEnqueueError(wrapped("rpc_execution",{code:"23505",message:"private"})),
  {reason:"NATIVE_MAIL_ALREADY_EXISTS",stage:"rpc_execution"},"C");
assert.deepEqual(diagnostics.classifyNativeMailEnqueueError(wrapped("rpc_execution",{code:"23514",message:"private"})),
  {reason:"NATIVE_MAIL_DB_CONSTRAINT_BLOCKED",stage:"rpc_execution"},"D");
assert.deepEqual(diagnostics.classifyNativeMailEnqueueError(wrapped("rpc_execution",{
  code:"P0001",message:"NATIVE_MAIL_PDF_NOT_READY",
})),{reason:"NATIVE_MAIL_PDF_BINDING_MISMATCH",stage:"rpc_execution"},"E");
assert.deepEqual(diagnostics.classifyNativeMailEnqueueError(wrapped("rpc_execution",{
  code:"P0001",message:"private unknown database message",
})),{reason:"NATIVE_MAIL_UNKNOWN_BLOCKER",stage:"rpc_execution"},"F");
assert.deepEqual(diagnostics.classifyNativeMailEnqueueError(new Error("unknown")),
  {reason:"NATIVE_MAIL_UNKNOWN_BLOCKER",stage:"rpc_execution"},"G");
assert.deepEqual(diagnostics.classifyNativeMailEnqueueError(wrapped("manual_gate",
  new Error("AUTOMATIC_MAIL_MUST_REMAIN_DISABLED"))),
  {reason:"NATIVE_MAIL_RUNTIME_GATE_BLOCKED",stage:"manual_gate"},"M/O");

const sensitiveError={code:"P0001",message:"kunde@example.test 28b3574f-8f7b-4244-8b83-cbd1d6cba376 select * secret"};
const publicDiagnosis=diagnostics.classifyNativeMailEnqueueError(wrapped("rpc_execution",sensitiveError));
const serialized=JSON.stringify(publicDiagnosis);
assert.doesNotMatch(serialized,/kunde|@|28b3574f|select\s|secret|P0001/i,"H-L");

let attempts=0;
await assert.rejects(()=>diagnostics.runNativeMailEnqueueStage("rpc_execution",async()=>{
  attempts+=1;throw sensitiveError;
}),diagnostics.NativeMailEnqueueStageError,"P");
assert.equal(attempts,1,"P no retry");

const route=await readFile(resolve(root,"app/api/admin/lexware/invoices/[invoiceId]/enqueue-mail/route.ts"),"utf8");
const service=await readFile(resolve(root,"app/lib/lexware/lexwareProductionMailProcessor.ts"),"utf8");
assert.match(route,/status:\s*409/,"N");
assert.match(route,/reason:\s*diagnosis\.reason,\s*stage:\s*diagnosis\.stage/,"H/M");
assert.doesNotMatch(route,/error\.(message|details|hint|code)|JSON\.stringify\(error\)|console\./,"H-L");
assert.match(service,/runNativeMailEnqueueStage\("manual_gate"/,"M manual gate");
assert.match(service,/runNativeMailEnqueueStage\("invoice_load"/,"M invoice load");
assert.match(service,/runNativeMailEnqueueStage\("snapshot_build"/,"M snapshot build");
assert.match(service,/runNativeMailEnqueueStage\("sender_resolve"/,"M sender resolve");
assert.match(service,/runNativeMailEnqueueStage\("rpc_execution"/,"M rpc execution");
assert.doesNotMatch(service,/createTransport|sendMail\(/,"Q/R");
assert.equal((service.match(/enqueue_native_lexware_invoice_mail_job_manual/g)??[]).length,1,"A/P one RPC path");
console.log("PASS A-R: sanitized native mail enqueue diagnostics; no database, SMTP or mail operations.");
