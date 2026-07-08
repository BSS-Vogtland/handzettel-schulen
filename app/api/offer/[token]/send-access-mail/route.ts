import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sendOfferAccessMailForRequest } from "@/lib/offerAccessMail";

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

function cleanToken(value: string) {
  const raw = String(value || "").trim();

  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw;
  }
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    const offerToken = cleanToken(token);

    if (!offerToken) {
return NextResponse.json(
        {
          ok: false,
          status: "not_found",
          message: "Token fehlt.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: requestRow, error } = await supabase
      .from("school_requests")
      .select("id")
      .eq("offer_token", offerToken)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          status: "error",
          message: error.message,
        },
        { status: 500 }
      );
    }

    if (!requestRow?.id) {
      return NextResponse.json(
        {
          ok: false,
          status: "not_found",
          message: "Anfrage wurde nicht gefunden.",
        },
        { status: 404 }
      );
    }

    const result = await sendOfferAccessMailForRequest({
      supabase,
      requestId: requestRow.id,
      allowBeforeDue: false,
    });

    return NextResponse.json(result, {
      status: result.status === "error" ? 500 : 200,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Link-Mail konnte nicht ausgelöst werden.",
      },
      { status: 500 }
    );
  }
}
