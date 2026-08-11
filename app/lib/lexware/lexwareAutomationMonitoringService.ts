import "server-only";
import vercelConfiguration from "@/vercel.json";
import { supabaseServer } from "@/lib/supabase/server";
import { buildLexwareAutomationMonitoring, type MonitoringJob } from "./lexwareAutomationMonitoringCore";

type DatabaseRow = Record<string, unknown>;
function text(row: DatabaseRow, key: string): string | null { return typeof row[key] === "string" ? row[key] as string : null; }
function toJob(row: DatabaseRow, withDeliveryState = false): MonitoringJob { return { status: text(row, "status") ?? "unknown", deliveryState: withDeliveryState ? text(row, "delivery_state") : null, createdAt: text(row, "created_at") ?? "", updatedAt: text(row, "updated_at"), completedAt: text(row, "completed_at") ?? text(row, "sent_at") ?? text(row, "external_write_completed_at"), nextAttemptAt: text(row, "next_attempt_at"), lockedAt: text(row, "locked_at"), lockExpiresAt: text(row, "lock_expires_at") }; }

export async function loadLexwareAutomationMonitoring() {
  const [settingsResult, invoiceResult, pdfResult, mailResult] = await Promise.all([
    supabaseServer.from("business_runtime_settings").select("invoice_provider_after,lexware_production_write_enabled,lexware_automatic_mail_enabled").eq("id", "default").single(),
    supabaseServer.from("school_lexware_invoice_jobs").select("status,created_at,updated_at,next_attempt_at,locked_at,lock_expires_at,external_write_completed_at").eq("trigger_source", "checkout_native_lexware"),
    supabaseServer.from("school_lexware_invoice_pdf_delivery_jobs").select("status,created_at,updated_at,completed_at,locked_at,lock_expires_at"),
    supabaseServer.from("school_lexware_invoice_mail_jobs").select("status,delivery_state,created_at,updated_at,next_attempt_at,locked_at,lock_expires_at,sent_at"),
  ]);
  const error = settingsResult.error ?? invoiceResult.error ?? pdfResult.error ?? mailResult.error;
  if (error || !settingsResult.data) throw new Error("LEXWARE_AUTOMATION_MONITORING_LOAD_FAILED");
  const settings = settingsResult.data as DatabaseRow;
  return buildLexwareAutomationMonitoring({ now: new Date().toISOString(), providerAfter: text(settings, "invoice_provider_after"), productionWriteEnabled: settings.lexware_production_write_enabled === true, automaticMailEnabled: settings.lexware_automatic_mail_enabled === true, configuredCrons: (vercelConfiguration.crons ?? []).map((cron) => ({ path: cron.path, schedule: cron.schedule })), pipelines: { invoice: (invoiceResult.data ?? []).map((row) => toJob(row as DatabaseRow)), pdf: (pdfResult.data ?? []).map((row) => toJob(row as DatabaseRow)), mail: (mailResult.data ?? []).map((row) => toJob(row as DatabaseRow, true)) } });
}
