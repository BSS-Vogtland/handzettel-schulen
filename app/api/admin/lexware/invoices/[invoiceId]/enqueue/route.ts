import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import {
  enqueueLexwareProductionInvoiceJob,
  LEXWARE_MANUAL_ENQUEUE_CONFIRMATION,
  LexwareProductionInvoiceJobRepositoryError,
} from "@/app/lib/lexware/lexwareProductionInvoiceJobRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store" };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  const { invoiceId } = await params;
  if (!UUID_PATTERN.test(invoiceId)) {
    return NextResponse.json({ ok: false, message: "Ungültige Rechnungs-ID." }, { status: 400, headers: HEADERS });
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 1_024) {
    return NextResponse.json({ ok: false, message: "Requestbody ist zu groß." }, { status: 413, headers: HEADERS });
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, message: "Ungültiger JSON-Requestbody." }, { status: 400, headers: HEADERS }); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "confirmation") || (body as { confirmation?: unknown }).confirmation !== LEXWARE_MANUAL_ENQUEUE_CONFIRMATION) {
    return NextResponse.json({ ok: false, message: "Die ausdrückliche Bestätigungsphrase fehlt oder ist ungültig." }, { status: 400, headers: HEADERS });
  }

  try {
    const result = await enqueueLexwareProductionInvoiceJob(invoiceId);
    return NextResponse.json({
      ok: true,
      enqueued: result.createdNewJob,
      reusedExistingJob: result.reusedExistingJob,
      invoiceId,
      invoiceJobId: result.invoiceJobId,
      jobStatus: result.jobStatus,
      creationState: result.creationState,
      payloadSha256: result.payloadSha256,
      idempotencyKey: result.idempotencyKey,
      writeOperationsPerformed: result.createdNewJob || result.linkedInvoice,
      databaseWritesPerformed: Number(result.createdNewJob) + Number(result.linkedInvoice) + Number(result.createdNewJob),
      lexwareReadRequestsPerformed: 0,
      lexwareWriteRequestsPerformed: 0,
      mailOperationsPerformed: 0,
    }, { headers: HEADERS });
  } catch (error) {
    const conflict = error instanceof LexwareProductionInvoiceJobRepositoryError && /CONFLICT|MISMATCH/.test(error.code);
    return NextResponse.json({
      ok: false,
      enqueued: false,
      invoiceId,
      writeOperationsPerformed: false,
      databaseWritesPerformed: 0,
      lexwareReadRequestsPerformed: 0,
      lexwareWriteRequestsPerformed: 0,
      mailOperationsPerformed: 0,
      code: error instanceof LexwareProductionInvoiceJobRepositoryError ? error.code : "INVOICE_JOB_ENQUEUE_FAILED",
      message: error instanceof Error ? error.message : "Lexware-Rechnungsjob konnte nicht vorbereitet werden.",
    }, { status: conflict ? 409 : 422, headers: HEADERS });
  }
}
