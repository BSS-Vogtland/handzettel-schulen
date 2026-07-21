import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PARTNER_SLUG = "vogtlaendische-buchhandlung";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function getPartner() {
  const { data, error } = await supabaseServer
    .from("book_supplier_partners")
    .select("*")
    .eq("slug", PARTNER_SLUG)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Partnerdaten konnten nicht geladen werden: ${error.message}`,
    );
  }

  if (data) {
    return data;
  }

  const { data: created, error: createError } = await supabaseServer
    .from("book_supplier_partners")
    .insert({
      slug: PARTNER_SLUG,
      name: "Vogtländische Buchhandlung",
      is_active: true,
    })
    .select("*")
    .single();

  if (createError) {
    throw new Error(
      `Partnerdatensatz konnte nicht angelegt werden: ${createError.message}`,
    );
  }

  return created;
}

export async function GET() {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const partner = await getPartner();

    return NextResponse.json({
      ok: true,
      partner,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die Partnerdaten konnten nicht geladen werden.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const body = (await request.json()) as {
      name?: unknown;
      email?: unknown;
      contactPerson?: unknown;
      phone?: unknown;
    };

    const name = clean(body.name);
    const email = clean(body.email);
    const contactPerson = clean(body.contactPerson);
    const phone = clean(body.phone);

    if (!name) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte gib den Namen der Buchhandlung ein.",
        },
        { status: 400 },
      );
    }

    if (email && !isEmail(email)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte gib eine gültige E-Mail-Adresse ein.",
        },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseServer
      .from("book_supplier_partners")
      .upsert(
        {
          slug: PARTNER_SLUG,
          name,
          email: email || null,
          contact_person: contactPerson || null,
          phone: phone || null,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "slug",
        },
      )
      .select("*")
      .single();

    if (error) {
      throw new Error(
        `Partnerdaten konnten nicht gespeichert werden: ${error.message}`,
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Die Partnerdaten wurden gespeichert.",
      partner: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die Partnerdaten konnten nicht gespeichert werden.",
      },
      { status: 500 },
    );
  }
}
