import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sendOfferAccessMailForRequest } from "@/lib/offerAccessMail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase Umgebungsvariablen fehlen. Prüfe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function isAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET || "";
  const url = new URL(request.url);
  const secretFromQuery = url.searchParams.get("secret") || "";
  const authHeader = request.headers.get("authorization") || "";
  const expectedAuthHeader = `Bearer ${cronSecret}`;

  return Boolean(cronSecret) && (
    secretFromQuery === cronSecret ||
    authHeader === expectedAuthHeader
  );
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Nicht autorisiert.",
      },
      { status: 401 }
    );
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: dueRequests, error } = await supabase
    .from("school_requests")
    .select("id, offer_access_mail_due_at")
    .not("offer_access_mail_due_at", "is", null)
    .is("offer_access_mail_sent_at", null)
    .lte("offer_access_mail_due_at", now)
    .order("offer_access_mail_due_at", { ascending: true })
    .limit(25);

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error.message,
      },
      { status: 500 }
    );
  }

  const results = [];

  for (const row of dueRequests || []) {
    const result = await sendOfferAccessMailForRequest({
      supabase,
      requestId: row.id,
      allowBeforeDue: false,
    });

    results.push(result);
  }

  return NextResponse.json({
    ok: true,
    checked: dueRequests?.length || 0,
    sent: results.filter((result) => result.status === "sent").length,
    results,
  });
}
