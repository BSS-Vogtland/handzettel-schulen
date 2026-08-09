import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const core=await import(pathToFileURL(resolve(root,"app/lib/lexware/lexwareProductionDeliveryCore.ts")).href);
const standardEnvironment={SMTP_HOST:"smtp.example.test",SMTP_PORT:"587",SMTP_USER:"user",SMTP_PASS:"pass",SMTP_FROM:"invoice@example.test"};
assert.equal(core.resolveLexwareMailSenderAddress({SMTP_FROM:"invoice@example.test"}),"invoice@example.test","A sender only");
assert.equal(core.resolveLexwareMailSenderAddress({...standardEnvironment,IONOS_SMTP_FROM:"fallback@example.test"}),"invoice@example.test","B standard sender precedence");
assert.deepEqual(core.resolveLexwareSenderMailbox({SMTP_FROM:"BSS Vogtland <invoice@example.test>"}),{
  email:"invoice@example.test",displayName:"BSS Vogtland",transportFrom:"BSS Vogtland <invoice@example.test>",
},"B formatted mailbox");
assert.deepEqual(core.resolveLexwareSenderMailbox({SMTP_FROM:'"BSS Vogtland" <invoice@example.test>'}),{
  email:"invoice@example.test",displayName:"BSS Vogtland",transportFrom:'"BSS Vogtland" <invoice@example.test>',
},"C quoted mailbox");
assert.equal(/[<>]|BSS/.test(core.resolveLexwareMailSenderAddress({SMTP_FROM:"BSS Vogtland <invoice@example.test>"})),false,
  "D/E snapshot contains only bare address");
assert.throws(()=>core.resolveLexwareMailSenderAddress({}),/SMTP_SENDER_CONFIGURATION_INCOMPLETE/,"C missing sender");
for(const invalidSender of ["invalid","Only a name","Name <invalid>","Name <mail@example.test",">mail@example.test<",
  "first@example.test, second@example.test","Name <mail @example.test>","Name <mail@example.test>\r\nBcc: other@example.test"]){
  assert.throws(()=>core.resolveLexwareSenderMailbox({SMTP_FROM:invalidSender}),/SMTP_SENDER_CONFIGURATION_INVALID/,
    `G/H invalid sender: ${JSON.stringify(invalidSender)}`);
}
assert.deepEqual(core.resolveLexwareMailTransportConfiguration(standardEnvironment),{
  host:"smtp.example.test",port:587,user:"user",pass:"pass",from:"invoice@example.test",
},"D standard SMTP contract");
assert.deepEqual(core.resolveLexwareMailTransportConfiguration({
  IONOS_SMTP_HOST:"smtp.ionos.test",IONOS_SMTP_PORT:"465",IONOS_SMTP_USER:"user",IONOS_SMTP_PASSWORD:"pass",IONOS_SMTP_FROM:"invoice@example.test",
}),{host:"smtp.ionos.test",port:465,user:"user",pass:"pass",from:"invoice@example.test"},"E IONOS fallback");
assert.equal(core.resolveLexwareMailTransportConfiguration({...standardEnvironment,SMTP_FROM:"BSS Vogtland <invoice@example.test>"}).from,
  "BSS Vogtland <invoice@example.test>","F transport display name retained");
assert.throws(()=>core.resolveLexwareMailTransportConfiguration({SMTP_FROM:"invoice@example.test"}),/SMTP_CONFIGURATION_INCOMPLETE/,"F missing credentials");
assert.throws(()=>core.resolveLexwareMailTransportConfiguration({...standardEnvironment,SMTP_PORT:"25"}),/SMTP_CONFIGURATION_INVALID/,"G invalid transport");
const pdf=new Uint8Array(Buffer.from(`%PDF-${"x".repeat(200)}`));
const verified=core.validateLexwarePdf(pdf,"application/pdf; charset=binary");
assert.match(verified.sha256,/^[a-f0-9]{64}$/,"A/G");
assert.equal(verified.sizeBytes,pdf.byteLength,"C");
const path=core.buildLexwarePdfStoragePath({organizationId:"org-1",lexwareInvoiceId:"external-1",sha256:verified.sha256});
assert.equal(path,`lexware-invoices/org-1/external-1/${verified.sha256}.pdf`,"D/E");
assert.equal(/marius|@|kunde|rechnungstoken/i.test(path),false,"F");
assert.throws(()=>core.validateLexwarePdf(pdf,"text/html"),/CONTENT_TYPE/,"K/X");
assert.throws(()=>core.validateLexwarePdf(new Uint8Array(200),"application/pdf"),/SIGNATURE/,"I");
const metadata={bucket:core.LEXWARE_PDF_BUCKET,path,sha256:verified.sha256,sizeBytes:verified.sizeBytes,
  contentType:"application/pdf" as const,filename:"Rechnung_RE0004.pdf",fetchedAt:"2026-08-09T12:00:00Z",storedAt:"2026-08-09T12:00:01Z"};
core.verifyStoredPdf(pdf,metadata); assert.throws(()=>core.verifyStoredPdf(pdf,{...metadata,sha256:"0".repeat(64)}),/MISMATCH|INVALID/,"H/W");
const messageId=core.buildDeterministicMailMessageId({mailJobId:"job",idempotencyKey:"key",pdfSha256:verified.sha256});
assert.equal(messageId,core.buildDeterministicMailMessageId({mailJobId:"job",idempotencyKey:"key",pdfSha256:verified.sha256}),"AA");
const events:string[]=[];let sends=0;
const base={pdf,metadata,messageId,validateTransport:()=>{},markSendStarted:async()=>{events.push("started");},
 send:async(id:string)=>{sends++;events.push("smtp");return{messageId:id};},complete:async()=>{events.push("sent");},
 recordDefiniteFailure:async()=>{events.push("retry");},recordAmbiguous:async()=>{events.push("manual_review");}};
assert.equal((await core.sendClaimedMailAtMostOnce(base)).outcome,"sent","Z/AB");assert.equal(sends,1,"Z");assert.deepEqual(events,["started","smtp","sent"],"Y");
events.length=0;sends=0;assert.equal((await core.sendClaimedMailAtMostOnce({...base,validateTransport:()=>{throw new Error("bad config");}})).outcome,"definite_not_sent","AC");assert.equal(sends,0,"AC");
assert.deepEqual(events,["retry"],"AC no send marker before transport validation");
events.length=0;sends=0;assert.equal((await core.sendClaimedMailAtMostOnce({...base,send:async()=>{sends++;throw new Error("timeout");}})).outcome,"ambiguous_send","AD/AE");assert.equal(sends,1,"AD");

const migration=await readFile(resolve(root,"supabase/migrations/20260809190000_native_lexware_pdf_delivery_pipeline.sql"),"utf8");
const storage=await readFile(resolve(root,"app/lib/lexware/lexwareProductionPdfStorage.ts"),"utf8");
const processor=await readFile(resolve(root,"app/lib/lexware/lexwareProductionMailProcessor.ts"),"utf8");
const adminPdf=await readFile(resolve(root,"app/api/admin/requests/[id]/invoice/pdf/route.ts"),"utf8");
const middleware=await readFile(resolve(root,"middleware.ts"),"utf8");
const routes=["prepare-pdf","enqueue-mail","activate-mail","process-mail"];
assert.match(migration,/public\.school_request_invoices_lexware_pdf_storage_complete|school_request_invoices_lexware_pdf_storage_complete/,"H/I");
assert.match(migration,/security definer set search_path=public,pg_temp/gi,"AS");assert.match(migration,/revoke all on function/gi,"AR/AT");
assert.doesNotMatch(migration,/execute\s+format\([^)]*(insert|update|delete)/i,"AH");
assert.match(storage,/providerGetCount: 0/,"J");assert.match(storage,/getLexwareInvoicePdf\("production"/,"A/B");assert.doesNotMatch(storage,/\.from\("school_request_invoices"\)\s*\.update/s,"H");
assert.match(adminPdf,/invoice_provider === "lexware"/,"M");assert.match(adminPdf,/loadStoredNativeLexwarePdf/ ,"N");assert.match(adminPdf,/generateRequestInvoicePdf/ ,"L");
assert.match(processor,/enqueue_native_lexware_invoice_mail_job_manual/,"O/Q");assert.match(processor,/activate_native_lexware_invoice_mail_job/,"R");assert.match(processor,/claim_native_lexware_invoice_mail_job/,"S/T/U");
assert.match(processor,/loadStoredNativeLexwarePdf/,"V/AK");assert.doesNotMatch(processor,/createFinalInvoice|finalize_native|requestInvoicePdf/,"AH/AI/AJ");
assert.match(processor,/AUTOMATIC_MAIL_MUST_REMAIN_DISABLED/,"P/AZ");assert.match(migration,/manual_review/,"AD/AE");assert.match(migration,/attempt_count<max_attempts/,"AG");
assert.match(processor,/runNativeMailEnqueueStage\("sender_resolve",\s*readLexwareMailSenderAddress\)/,
  "manual enqueue sender snapshot only");
assert.doesNotMatch(processor,/enqueueNativeLexwareInvoiceMail[\s\S]*?const configuration = readLexwareMailTransportConfiguration/,
  "manual enqueue does not require SMTP transport credentials");
assert.match(processor,/transportConfiguration = readLexwareMailTransportConfiguration\(\)/,"transport validated before marker");
assert.match(processor,/sendLexwareInvoiceMailAtMostOnce\([\s\S]*?,transportConfiguration\)/,"validated transport reused for send");
for(const route of routes){const source=await readFile(resolve(root,`app/api/admin/lexware/invoices/[invoiceId]/${route}/route.ts`),"utf8");assert.match(source,/requireAdminApiSession/,`AN ${route}`);assert.match(source,/hasSameRequestOrigin/,`AM ${route}`);assert.match(source,/Cache-Control"\s*:\s*"no-store/,`AO ${route}`);assert.doesNotMatch(source,/console\.|process\.env/,`AP/AQ ${route}`);assert.match(middleware,new RegExp(route),`AN middleware ${route}`);}
assert.doesNotMatch(processor,/\.update\(/,"CAS only");assert.doesNotMatch(storage,/getPublicUrl/,"private storage");
console.log("PASS A-AZ: native Lexware PDF storage and manual at-most-once mail delivery contracts.");
