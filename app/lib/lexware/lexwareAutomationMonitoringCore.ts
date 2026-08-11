export const LEXWARE_AUTOMATION_SCHEDULE_INTERVAL_MS = 2 * 60 * 1000;
export const LEXWARE_AUTOMATION_LOCK_LEASE_MS = 5 * 60 * 1000;
export const LEXWARE_AUTOMATION_ATTENTION_AFTER_MS = 2 * LEXWARE_AUTOMATION_SCHEDULE_INTERVAL_MS;
export const LEXWARE_AUTOMATION_OVERDUE_AFTER_MS = LEXWARE_AUTOMATION_LOCK_LEASE_MS + 2 * LEXWARE_AUTOMATION_SCHEDULE_INTERVAL_MS;

export const LEXWARE_AUTOMATION_CRONS = {
  invoices: { path: "/api/cron/lexware/invoices", schedule: "*/2 * * * *" },
  pdfs: { path: "/api/cron/lexware/pdfs", schedule: "1-59/2 * * * *" },
  mailOrchestration: { path: "/api/cron/lexware/mail-orchestration", schedule: "*/2 * * * *" },
  mailProcess: { path: "/api/cron/lexware/mail-process", schedule: "1-59/2 * * * *" },
} as const;

export type AutomationTone = "green" | "yellow" | "red";
export type PipelineName = "invoice" | "pdf" | "mail";
export type MonitoringJob = { status: string; deliveryState?: string | null; createdAt: string; updatedAt?: string | null; completedAt?: string | null; nextAttemptAt?: string | null; lockedAt?: string | null; lockExpiresAt?: string | null };
export type MonitoringInput = { now: string; providerAfter: string | null; productionWriteEnabled: boolean; automaticMailEnabled: boolean; configuredCrons: Array<{ path: string; schedule: string }>; pipelines: Record<PipelineName, MonitoringJob[]> };
export type PipelineMonitoring = { counts: Record<string, number>; deliveryStates: Record<string, number>; activeLocks: number; staleLocks: number; oldestOpenAt: string | null; oldestOpenAgeMs: number | null; lastSucceededAt: string | null; tone: AutomationTone };

const PIPELINE_STATUSES: Record<PipelineName, readonly string[]> = {
  invoice: ["pending", "processing", "retry", "manual_review", "succeeded"],
  pdf: ["pending", "processing", "retry", "manual_review", "succeeded"],
  mail: ["waiting_for_activation", "pending", "processing", "retry", "manual_review", "sent"],
};
const OPEN_STATUSES = new Set(["waiting_for_activation", "pending", "retry"]);

function timestamp(value: string | null | undefined): number | null { if (!value) return null; const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : null; }
function newest(values: Array<string | null | undefined>): string | null { return values.reduce<string | null>((result, value) => { const candidate = timestamp(value); const current = timestamp(result); return candidate !== null && (current === null || candidate > current) ? value ?? null : result; }, null); }

export function buildLexwareAutomationMonitoring(input: MonitoringInput) {
  const now = timestamp(input.now) ?? Date.now();
  const cronChecks = Object.fromEntries(Object.entries(LEXWARE_AUTOMATION_CRONS).map(([key, expected]) => [key, input.configuredCrons.some((cron) => cron.path === expected.path && cron.schedule === expected.schedule)])) as Record<keyof typeof LEXWARE_AUTOMATION_CRONS, boolean>;
  const pipelines = Object.fromEntries((Object.keys(input.pipelines) as PipelineName[]).map((name) => {
    const jobs = input.pipelines[name];
    const counts = Object.fromEntries(PIPELINE_STATUSES[name].map((status) => [status, jobs.filter((job) => job.status === status).length]));
    const deliveryStates = jobs.reduce<Record<string, number>>((result, job) => { if (job.deliveryState) result[job.deliveryState] = (result[job.deliveryState] ?? 0) + 1; return result; }, {});
    const activeLocks = jobs.filter((job) => { const expiry = timestamp(job.lockExpiresAt); return Boolean(job.lockedAt) && expiry !== null && expiry > now; }).length;
    const staleLocks = jobs.filter((job) => { const expiry = timestamp(job.lockExpiresAt); return Boolean(job.lockedAt) && expiry !== null && expiry <= now; }).length;
    const open = jobs.filter((job) => OPEN_STATUSES.has(job.status));
    const oldestOpenAt = open.reduce<string | null>((result, job) => { const candidate = timestamp(job.createdAt); const current = timestamp(result); return candidate !== null && (current === null || candidate < current) ? job.createdAt : result; }, null);
    const oldest = timestamp(oldestOpenAt);
    const oldestOpenAgeMs = oldest === null ? null : Math.max(0, now - oldest);
    const lastSucceededAt = newest(jobs.filter((job) => job.status === "succeeded" || job.status === "sent").map((job) => job.completedAt ?? job.updatedAt));
    const red = (counts.manual_review ?? 0) > 0 || (deliveryStates.ambiguous_send ?? 0) > 0 || staleLocks > 0 || (oldestOpenAgeMs !== null && oldestOpenAgeMs > LEXWARE_AUTOMATION_OVERDUE_AFTER_MS);
    const yellow = (counts.retry ?? 0) > 0 || (oldestOpenAgeMs !== null && oldestOpenAgeMs > LEXWARE_AUTOMATION_ATTENTION_AFTER_MS);
    const value: PipelineMonitoring = { counts, deliveryStates, activeLocks, staleLocks, oldestOpenAt, oldestOpenAgeMs, lastSucceededAt, tone: red ? "red" : yellow ? "yellow" : "green" };
    return [name, value];
  })) as Record<PipelineName, PipelineMonitoring>;
  const cronsReady = Object.values(cronChecks).every(Boolean);
  const gatesReady = input.providerAfter === "lexware" && input.productionWriteEnabled && input.automaticMailEnabled;
  const pipelineTones = Object.values(pipelines).map((pipeline) => pipeline.tone);
  const tone: AutomationTone = !cronsReady || !gatesReady || pipelineTones.includes("red") ? "red" : pipelineTones.includes("yellow") ? "yellow" : "green";
  return { checkedAt: input.now, tone, automationActive: cronsReady && gatesReady, gates: { providerAfter: input.providerAfter, productionWriteEnabled: input.productionWriteEnabled, automaticMailEnabled: input.automaticMailEnabled, ready: gatesReady }, crons: cronChecks, pipelines, thresholds: { scheduleIntervalMs: LEXWARE_AUTOMATION_SCHEDULE_INTERVAL_MS, attentionAfterMs: LEXWARE_AUTOMATION_ATTENTION_AFTER_MS, overdueAfterMs: LEXWARE_AUTOMATION_OVERDUE_AFTER_MS, lockLeaseMs: LEXWARE_AUTOMATION_LOCK_LEASE_MS } };
}
