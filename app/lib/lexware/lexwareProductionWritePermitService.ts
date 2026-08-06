import "server-only";

import { supabaseServer } from "@/lib/supabase/server";
import { parseLexwareProductionClaim } from "./lexwareProductionClaimCore";
import { parseLexwareProductionWritePermit } from "./lexwareProductionWritePermitCore";

const first = (value: unknown) => Array.isArray(value) ? value[0] : value;
const fail = (message: string): never => { throw new Error(message); };

export async function loadLexwareProductionWritePermit(invoiceId: string) {
  const { data, error } = await supabaseServer.from("school_lexware_production_write_permits")
    .select("id,invoice_id,request_id,job_id,target_organization_id,payload_hash_version,payload_sha256,permit_state,expires_at,claim_id")
    .eq("invoice_id", invoiceId).in("permit_state", ["issued", "activated", "claimed"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return null;
    throw new Error("LEXWARE_PRODUCTION_PERMIT_LOAD_FAILED");
  }
  return data ? parseLexwareProductionWritePermit(data) : null;
}

export async function issueLexwareProductionWritePermit(invoiceId: string) {
  const { data: invoice, error: invoiceError } = await supabaseServer.from("school_request_invoices")
    .select("id,request_id,lexware_invoice_job_id").eq("id", invoiceId).single();
  if (invoiceError || !invoice?.request_id || !invoice.lexware_invoice_job_id) throw new Error("LEXWARE_PERMIT_INVOICE_NOT_READY");
  const { data: job, error: jobError } = await supabaseServer.from("school_lexware_invoice_jobs")
    .select("id,target_organization_id,payload_hash_version,payload_sha256").eq("id", invoice.lexware_invoice_job_id).single();
  if (jobError || !job) throw new Error("LEXWARE_PERMIT_JOB_NOT_READY");
  const { data, error } = await supabaseServer.rpc("issue_school_lexware_production_write_permit", {
    p_invoice_id: invoice.id,
    p_request_id: invoice.request_id,
    p_job_id: job.id,
    p_target_organization_id: job.target_organization_id,
    p_payload_hash_version: job.payload_hash_version,
    p_payload_sha256: job.payload_sha256,
    p_expires_in_minutes: 10,
    p_created_by_admin_id: "admin_session",
  });
  if (error) fail(error.message || "LEXWARE_PERMIT_ISSUE_FAILED");
  const row = first(data) as Record<string, unknown> | null;
  if (!row || typeof row.permit_id !== "string" || typeof row.permit_state !== "string" || typeof row.expires_at !== "string") throw new Error("LEXWARE_PERMIT_ISSUE_RESULT_INVALID");
  return { permitId: row.permit_id, permitState: row.permit_state, expiresAt: row.expires_at };
}

export async function activateLexwareProductionWritePermit(invoiceId: string, permitId: string) {
  const { data, error } = await supabaseServer.rpc("activate_school_lexware_production_write_permit", {
    p_invoice_id: invoiceId, p_permit_id: permitId,
  });
  if (error) fail(error.message || "LEXWARE_PERMIT_ACTIVATION_FAILED");
  const row = first(data) as Record<string, unknown> | null;
  if (!row || row.permit_state !== "activated" || row.job_status !== "pending" || row.attempt_count !== 0) {
    throw new Error("LEXWARE_PERMIT_ACTIVATION_RESULT_INVALID");
  }
  return { permitId: row.permit_id as string, permitState: "activated" as const, jobStatus: "pending" as const, attemptCount: 0 };
}

export async function claimLexwareProductionJobWithPermit(invoiceId: string, permitId: string) {
  const { data, error } = await supabaseServer.rpc("claim_school_lexware_invoice_job_with_permit", {
    p_invoice_id: invoiceId, p_permit_id: permitId,
    p_locked_by: `admin-permit:${invoiceId}`, p_lock_duration_seconds: 300,
  });
  if (error) fail(error.message || "LEXWARE_PERMIT_CLAIM_FAILED");
  const row = first(data) as Record<string, unknown> | null;
  if (!row || row.permit_state !== "claimed" || typeof row.claim_id !== "string") throw new Error("LEXWARE_PERMIT_CLAIM_RESULT_INVALID");
  const claim = parseLexwareProductionClaim(row);
  return { permitId: row.permit_id as string, claimId: row.claim_id, permitState: "claimed" as const, claim };
}

export async function completeLexwareProductionWritePermit(invoiceId: string, permitId: string, claimId: string) {
  const { data, error } = await supabaseServer.rpc("complete_school_lexware_production_write_permit", {
    p_invoice_id: invoiceId, p_permit_id: permitId, p_claim_id: claimId,
  });
  if (error) fail(error.message || "LEXWARE_PERMIT_COMPLETION_FAILED");
  const row = first(data) as Record<string, unknown> | null;
  if (!row || (row.permit_state !== "consumed" && row.permit_state !== "manual_review")) throw new Error("LEXWARE_PERMIT_COMPLETION_RESULT_INVALID");
  return { permitState: row.permit_state as "consumed" | "manual_review" };
}
