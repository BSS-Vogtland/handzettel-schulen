import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReminderEventRow = {
  id: string;
  project_id: string | null;
  reminder_type: string;
  reminder_date_local: string;
  reminder_time_local: string;
  timezone: string;
  status: string;
  recipient_email: string | null;
  recipient_name: string | null;
  post_ids: string[];
  open_review_count: number;
  approved_count: number;
  published_count: number;
  payload: PublishingReminderPayload | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type PublishingReminderPayload = {
  project?: {
    id?: string;
    name?: string;
  };
  now?: {
    local_date?: string;
    local_time?: string;
    local_weekday?: string;
    server_iso?: string;
    matched_reminder_time?: string;
  };
  summary?: {
    posts_due_today?: number;
    open_reviews?: number;
    approved_waiting_for_posting?: number;
    already_published?: number;
  };
  publishing_posts?: PublishingReminderPost[];
  ready_to_publish_posts?: PublishingReminderPost[];
  blocked_publish_posts?: PublishingReminderPost[];
  overdue_posts?: PublishingReminderPost[];
  due_today_posts?: PublishingReminderPost[];
};

type PublishingReminderPost = {
  id: string;
  topic?: string | null;
  status?: string | null;
  review_status?: string | null;
  scheduled_at?: string | null;
  publish_date_local?: string | null;
  publish_weekday_local?: string | null;
  publish_time_local?: string | null;
  reminder_date_local?: string | null;
  reminder_weekday_local?: string | null;
  is_overdue?: boolean;
  is_due_today?: boolean;
  has_image?: boolean;
  is_review_approved?: boolean;
  is_publishable?: boolean;
  blocked_reason?: string | null;
  review_url?: string | null;
  posting_url?: string | null;
};

const REMINDER_TYPE = "publishing_reminder";

function getSmtpConfig() {
  const host =
    process.env.SMTP_HOST ||
    process.env.MAIL_HOST ||
    process.env.EMAIL_SERVER_HOST;

  const portRaw =
    process.env.SMTP_PORT ||
    process.env.MAIL_PORT ||
    process.env.EMAIL_SERVER_PORT ||
    "587";

  const user =
    process.env.SMTP_USER ||
    process.env.MAIL_USER ||
    process.env.EMAIL_SERVER_USER;

  const pass =
    process.env.SMTP_PASS ||
    process.env.MAIL_PASS ||
    process.env.EMAIL_SERVER_PASSWORD;

  const from =
    process.env.SMTP_FROM ||
    process.env.MAIL_FROM ||
    process.env.EMAIL_FROM ||
    user;

  const port = Number(portRaw);

  if (!host || !user || !pass || !from || Number.isNaN(port)) {
    throw new Error(
      "SMTP-Konfiguration fehlt. Benötigt werden SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS und SMTP_FROM oder passende MAIL_*/EMAIL_*-Variablen."
    );
  }

  return {
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
    from,
  };
}

function assertCronAccess(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return;
  }

  const url = new URL(request.url);
  const secretFromQuery = url.searchParams.get("secret");
  const authHeader = request.headers.get("authorization");
  const expectedAuthHeader = `Bearer ${cronSecret}`;

  if (secretFromQuery === cronSecret || authHeader === expectedAuthHeader) {
    return;
  }

  throw new Error("Nicht autorisiert. CRON_SECRET fehlt oder ist falsch.");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getProjectName(event: ReminderEventRow) {
  return event.payload?.project?.name || "SocialPilot";
}

function getPublishingPosts(event: ReminderEventRow) {
  const posts = event.payload?.publishing_posts;

  if (!Array.isArray(posts)) return [];

  return posts.filter((post) => post && post.id);
}

function getReadyToPublishPosts(event: ReminderEventRow) {
  const posts = event.payload?.ready_to_publish_posts;

  if (!Array.isArray(posts)) return [];

  return posts.filter((post) => post && post.id);
}

function getBlockedPublishPosts(event: ReminderEventRow) {
  const posts = event.payload?.blocked_publish_posts;

  if (!Array.isArray(posts)) return [];

  return posts.filter((post) => post && post.id);
}

function buildSubject(event: ReminderEventRow) {
  const projectName = getProjectName(event);
  const count = getPublishingPosts(event).length || event.approved_count || 0;

  if (count === 1) {
    return `${projectName}: 1 Social-Beitrag muss veröffentlicht werden`;
  }

  return `${projectName}: ${count} Social-Beiträge müssen veröffentlicht werden`;
}

function formatPostDate(post: PublishingReminderPost) {
  const date = [post.publish_weekday_local, post.publish_date_local]
    .filter(Boolean)
    .join(" ");

  const time = post.publish_time_local ? `um ${post.publish_time_local}` : "";

  return [date, time].filter(Boolean).join(" ");
}

function buildTextEmail(event: ReminderEventRow) {
  const projectName = getProjectName(event);
  const recipientName = event.recipient_name?.trim();
  const readyPosts = getReadyToPublishPosts(event);
  const blockedPosts = getBlockedPublishPosts(event);
  const greeting = recipientName ? `Hallo ${recipientName},` : "Hallo,";

  const lines = [
    greeting,
    "",
    `für ${projectName} gibt es SocialPilot-Beiträge, die heute fällig oder überfällig sind.`,
    "",
    `Reminder: ${event.reminder_date_local} um ${event.reminder_time_local} (${event.timezone})`,
    `Veröffentlichbar: ${readyPosts.length}`,
    `Blockiert: ${blockedPosts.length}`,
    "",
  ];

  if (readyPosts.length > 0) {
    lines.push("Veröffentlichbare Beiträge:");

    for (const post of readyPosts) {
      lines.push("");
      lines.push(`- ${post.topic || "Ohne Titel"}`);
      lines.push(`  Geplant: ${formatPostDate(post) || "—"}`);
      lines.push(`  Posting öffnen: ${post.posting_url || "—"}`);
    }

    lines.push("");
  }

  if (blockedPosts.length > 0) {
    lines.push("Blockierte Beiträge:");

    for (const post of blockedPosts) {
      lines.push("");
      lines.push(`- ${post.topic || "Ohne Titel"}`);
      lines.push(`  Geplant: ${formatPostDate(post) || "—"}`);
      lines.push(`  Grund: ${post.blocked_reason || "Blockiert"}`);
      lines.push(`  Review öffnen: ${post.review_url || "—"}`);
      lines.push(`  Posting öffnen: ${post.posting_url || "—"}`);
    }

    lines.push("");
  }

  lines.push(
    "Bitte veröffentliche die passenden Beiträge manuell auf den Plattformen und markiere sie danach im SocialPilot als veröffentlicht."
  );
  lines.push("");
  lines.push("Viele Grüße");
  lines.push("SocialPilot");

  return lines.join("\n");
}

function buildPostCardHtml(post: PublishingReminderPost, mode: "ready" | "blocked") {
  const topic = escapeHtml(post.topic || "Ohne Titel");
  const dateText = escapeHtml(formatPostDate(post) || "—");
  const postingUrl = post.posting_url || "";
  const reviewUrl = post.review_url || "";
  const blockedReason = post.blocked_reason || "";

  const badge =
    mode === "ready"
      ? `<span style="display:inline-block;background:#dcfce7;color:#166534;border:1px solid #bbf7d0;border-radius:999px;padding:4px 9px;font-size:12px;font-weight:700;">veröffentlichbar</span>`
      : `<span style="display:inline-block;background:#fef3c7;color:#92400e;border:1px solid #fde68a;border-radius:999px;padding:4px 9px;font-size:12px;font-weight:700;">blockiert</span>`;

  return `
    <div style="border:1px solid #e2e8f0;border-radius:14px;padding:16px;margin:14px 0;background:#ffffff;">
      <div style="margin:0 0 8px;">${badge}</div>
      <h3 style="margin:0 0 6px;font-size:18px;color:#0f172a;">${topic}</h3>
      <p style="margin:6px 0 0;color:#64748b;font-size:14px;">Geplant: ${dateText}</p>
      ${
        mode === "blocked"
          ? `<p style="margin:8px 0 0;color:#92400e;font-size:14px;"><strong>Grund:</strong> ${escapeHtml(blockedReason || "Blockiert")}</p>`
          : ""
      }
      <p style="margin:14px 0 0;">
        ${
          postingUrl
            ? `<a href="${escapeHtml(
                postingUrl
              )}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:10px;font-weight:700;">Posting öffnen</a>`
            : ""
        }
        ${
          reviewUrl
            ? `<a href="${escapeHtml(
                reviewUrl
              )}" style="display:inline-block;margin-left:8px;color:#0f172a;text-decoration:underline;font-weight:600;">Review öffnen</a>`
            : ""
        }
      </p>
    </div>
  `;
}

function buildHtmlEmail(event: ReminderEventRow) {
  const projectName = escapeHtml(getProjectName(event));
  const recipientName = event.recipient_name?.trim();
  const readyPosts = getReadyToPublishPosts(event);
  const blockedPosts = getBlockedPublishPosts(event);

  const greeting = recipientName
    ? `Hallo ${escapeHtml(recipientName)},`
    : "Hallo,";

  const readyHtml =
    readyPosts.length > 0
      ? readyPosts.map((post) => buildPostCardHtml(post, "ready")).join("")
      : `<div style="border:1px solid #e2e8f0;border-radius:14px;padding:16px;margin:14px 0;background:#f8fafc;color:#475569;">Keine sofort veröffentlichbaren Beiträge.</div>`;

  const blockedHtml =
    blockedPosts.length > 0
      ? blockedPosts.map((post) => buildPostCardHtml(post, "blocked")).join("")
      : "";

  return `
    <!doctype html>
    <html lang="de">
      <head>
        <meta charset="utf-8" />
        <title>${projectName} Publishing-Erinnerung</title>
      </head>
      <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
        <div style="max-width:760px;margin:0 auto;padding:28px 18px;">
          <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;padding:24px;">
            <p style="margin:0 0 14px;font-size:16px;">${greeting}</p>

            <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#0f172a;">
              SocialPilot Publishing-Erinnerung
            </h1>

            <p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#334155;">
              Für <strong>${projectName}</strong> gibt es Social-Media-Beiträge, die heute fällig oder überfällig sind.
            </p>

            <div style="background:#f1f5f9;border-radius:14px;padding:14px;margin:18px 0;color:#334155;font-size:14px;">
              <div><strong>Reminder:</strong> ${escapeHtml(
                event.reminder_date_local
              )} um ${escapeHtml(event.reminder_time_local)} (${escapeHtml(
                event.timezone
              )})</div>
              <div><strong>Veröffentlichbar:</strong> ${readyPosts.length}</div>
              <div><strong>Blockiert:</strong> ${blockedPosts.length}</div>
            </div>

            <h2 style="margin:22px 0 8px;font-size:18px;color:#0f172a;">Veröffentlichbare Beiträge</h2>
            ${readyHtml}

            ${
              blockedPosts.length > 0
                ? `<h2 style="margin:22px 0 8px;font-size:18px;color:#0f172a;">Blockierte Beiträge</h2>${blockedHtml}`
                : ""
            }

            <p style="margin:22px 0 0;font-size:15px;line-height:1.6;color:#475569;">
              Bitte veröffentliche die passenden Beiträge manuell auf den Plattformen und markiere sie danach im SocialPilot als veröffentlicht.
            </p>

            <p style="margin:18px 0 0;font-size:15px;color:#475569;">
              Viele Grüße<br />
              SocialPilot
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}

async function loadPendingReminderEvents(limit: number) {
  const { data, error } = await supabaseServer
    .from("social_reminder_events")
    .select("*")
    .eq("reminder_type", REMINDER_TYPE)
    .eq("status", "pending")
    .not("recipient_email", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  return ((data || []) as ReminderEventRow[]).filter(
    (event) =>
      event.approved_count > 0 ||
      event.open_review_count > 0 ||
      getPublishingPosts(event).length > 0
  );
}

async function markEventSent(eventId: string) {
  const { data, error } = await supabaseServer
    .from("social_reminder_events")
    .update({
      status: "sent",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)
    .eq("status", "pending")
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  return data as ReminderEventRow;
}

async function markEventFailed(eventId: string, message: string) {
  const { data, error } = await supabaseServer
    .from("social_reminder_events")
    .update({
      status: "failed",
      error_message: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)
    .eq("status", "pending")
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  return data as ReminderEventRow;
}

export async function GET(request: Request) {
  try {
    assertCronAccess(request);

    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get("limit") || "5");
    const dryRun = url.searchParams.get("dryRun") === "1";

    const limit = Number.isFinite(limitParam)
      ? Math.max(1, Math.min(20, Math.floor(limitParam)))
      : 5;

    const pendingEvents = await loadPendingReminderEvents(limit);

    if (pendingEvents.length === 0) {
      return NextResponse.json({
        ok: true,
        mode: dryRun ? "publishing_dry_run" : "publishing_send",
        action: "nothing_to_send",
        message:
          "Keine pending Publishing-Reminder-Events zum Versenden gefunden.",
        summary: {
          pending_events_found: 0,
          sent: 0,
          failed: 0,
        },
      });
    }

    const smtpConfig = getSmtpConfig();

    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: smtpConfig.auth,
    });

    const results: Array<{
      event_id: string;
      recipient_email: string | null;
      status: "dry_run" | "sent" | "failed";
      message: string;
    }> = [];

    for (const event of pendingEvents) {
      try {
        if (!event.recipient_email) {
          throw new Error("Keine Empfänger-E-Mail hinterlegt.");
        }

        const subject = buildSubject(event);
        const text = buildTextEmail(event);
        const html = buildHtmlEmail(event);

        if (dryRun) {
          results.push({
            event_id: event.id,
            recipient_email: event.recipient_email,
            status: "dry_run",
            message:
              "Dry-Run: Publishing-Mail wurde nicht versendet und Event nicht verändert.",
          });

          continue;
        }

        await transporter.sendMail({
          from: smtpConfig.from,
          to: event.recipient_email,
          subject,
          text,
          html,
        });

        await markEventSent(event.id);

        results.push({
          event_id: event.id,
          recipient_email: event.recipient_email,
          status: "sent",
          message: "Publishing-Reminder-Mail wurde versendet.",
        });
      } catch (eventError) {
        const message =
          eventError instanceof Error
            ? eventError.message
            : "Unbekannter Fehler beim Publishing-Mailversand.";

        if (!dryRun) {
          await markEventFailed(event.id, message);
        }

        results.push({
          event_id: event.id,
          recipient_email: event.recipient_email,
          status: "failed",
          message,
        });
      }
    }

    const sent = results.filter((result) => result.status === "sent").length;
    const failed = results.filter((result) => result.status === "failed").length;
    const dryRunCount = results.filter(
      (result) => result.status === "dry_run"
    ).length;

    return NextResponse.json({
      ok: failed === 0,
      mode: dryRun ? "publishing_dry_run" : "publishing_send",
      action: dryRun ? "preview_send" : "processed",
      message: dryRun
        ? "Publishing-Dry-Run abgeschlossen. Es wurden keine Mails versendet und keine Events verändert."
        : "Pending Publishing-Reminder-Events wurden verarbeitet.",
      summary: {
        pending_events_found: pendingEvents.length,
        sent,
        failed,
        dry_run: dryRunCount,
      },
      results,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Versenden der Publishing-Reminder.";

    return NextResponse.json(
      {
        ok: false,
        mode: "publishing_send",
        message,
      },
      { status: 500 }
    );
  }
}
