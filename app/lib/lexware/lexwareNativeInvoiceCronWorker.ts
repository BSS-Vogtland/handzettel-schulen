import "server-only";

import { supabaseServer } from "@/lib/supabase/server";
import { processLexwareProductionInvoiceById } from "./lexwareProductionInvoiceProcessService";
import {
  runNativeInvoiceCronWorker,
  type NativeInvoiceCronCandidate,
  type NativeInvoiceCronWorkerResult,
} from "./lexwareNativeInvoiceCronWorkerCore";

const CANDIDATE_SCAN_LIMIT = 25;

export async function processNextNativeLexwareInvoice(): Promise<NativeInvoiceCronWorkerResult> {
  return runNativeInvoiceCronWorker({
    now: Date.now,
    loadCandidates: async () => {
      const { data, error } = await supabaseServer.from("school_lexware_invoice_jobs")
        .select("local_invoice_id,status,creation_state,attempt_count,max_attempts,locked_by,locked_at,lock_expires_at,external_write_started_at,external_write_completed_at,lexware_invoice_id,lexware_invoice_number")
        .eq("trigger_source", "checkout_native_lexware")
        .in("status", ["pending", "retry", "processing"])
        .order("created_at", { ascending: true })
        .limit(CANDIDATE_SCAN_LIMIT);
      if (error) throw new Error("NATIVE_INVOICE_CRON_CANDIDATE_LOAD_FAILED");
      return (data ?? []) as NativeInvoiceCronCandidate[];
    },
    processInvoice: (invoiceId) => processLexwareProductionInvoiceById(invoiceId),
  });
}
