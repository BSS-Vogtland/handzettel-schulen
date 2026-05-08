import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

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

function getSiteUrl(request: Request) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin
  );
}

export async function GET(request: Request, context: RouteContext) {
  const { token } = await context.params;
  const invoiceToken = String(token || "").trim();

  try {
    if (invoiceToken) {
      const supabase = getSupabaseAdmin();

      const { data: invoiceData } = await supabase
        .from("school_request_invoices")
        .select("id, request_id, paypal_order_id, total_amount, currency")
        .eq("invoice_token", invoiceToken)
        .maybeSingle();

      if (invoiceData) {
        await supabase.from("school_request_payment_events").insert({
          invoice_id: invoiceData.id,
          request_id: invoiceData.request_id,
          event_type: "paypal_payment_cancelled",
          payment_method: "paypal",
          payment_provider: "paypal",
          amount: invoiceData.total_amount,
          currency: invoiceData.currency || "EUR",
          provider_reference: invoiceData.paypal_order_id,
          provider_status: "cancelled_by_customer",
          message: "Der Kunde hat die PayPal-Zahlung abgebrochen.",
          created_at: new Date().toISOString(),
        });

        await supabase.from("school_request_events").insert({
          request_id: invoiceData.request_id,
          event_type: "paypal_payment_cancelled",
          title: "PayPal-Zahlung abgebrochen",
          message: "Der Kunde hat die PayPal-Zahlung abgebrochen.",
          created_at: new Date().toISOString(),
        });
      }
    }
  } catch (error) {
    console.error("PayPal cancel log error:", error);
  }

  return NextResponse.redirect(
    `${getSiteUrl(request)}/rechnung/${invoiceToken}?paypal=cancelled`
  );
}