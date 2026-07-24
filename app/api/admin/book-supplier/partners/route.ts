import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { supabaseServer } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function createUniqueSlug(name: string) {
  const base = slugify(name) || `partner-${Date.now()}`;
  let candidate = base;

  for (let index = 2; index < 500; index += 1) {
    const { data, error } = await supabaseServer
      .from("book_supplier_partners")
      .select("id")
      .eq("slug", candidate)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Partnerkennung konnte nicht geprüft werden: ${error.message}`,
      );
    }

    if (!data) {
      return candidate;
    }

    candidate = `${base}-${index}`;
  }

  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function GET() {
  const unauthorized = await requireAdminApiSession();

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { data, error } = await supabaseServer
      .from("book_supplier_partners")
      .select("*")
      .order("is_active", {
        ascending: false,
      })
      .order("name", {
        ascending: true,
      });

    if (error) {
      throw new Error(
        `Buchhandelspartner konnten nicht geladen werden: ${error.message}`,
      );
    }

    return NextResponse.json({
      ok: true,
      partners: data || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Die Buchhandelspartner konnten nicht geladen werden.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApiSession();

  if (unauthorized) {
    return unauthorized;
  }

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
        {
          status: 400,
        },
      );
    }

    if (email && !isEmail(email)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte gib eine gültige E-Mail-Adresse ein.",
        },
        {
          status: 400,
        },
      );
    }

    const slug = await createUniqueSlug(name);

    const { data, error } = await supabaseServer
      .from("book_supplier_partners")
      .insert({
        slug,
        name,
        email: email || null,
        contact_person: contactPerson || null,
        phone: phone || null,
        is_active: true,
      })
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(
        `Buchhandelspartner konnte nicht angelegt werden: ${
          error?.message || "unbekannter Fehler"
        }`,
      );
    }

    return NextResponse.json({
      ok: true,
      message: `${name} wurde als Buchhandelspartner angelegt.`,
      partner: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Der Buchhandelspartner konnte nicht angelegt werden.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function PUT(request: Request) {
  const unauthorized = await requireAdminApiSession();

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const body = (await request.json()) as {
      id?: unknown;
      name?: unknown;
      email?: unknown;
      contactPerson?: unknown;
      phone?: unknown;
      isActive?: unknown;
    };

    const id = clean(body.id);
    const name = clean(body.name);
    const email = clean(body.email);
    const contactPerson = clean(body.contactPerson);
    const phone = clean(body.phone);
    const isActive = body.isActive !== false;

    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          message: "Die Partner-ID fehlt.",
        },
        {
          status: 400,
        },
      );
    }

    if (!name) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte gib den Namen der Buchhandlung ein.",
        },
        {
          status: 400,
        },
      );
    }

    if (email && !isEmail(email)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Bitte gib eine gültige E-Mail-Adresse ein.",
        },
        {
          status: 400,
        },
      );
    }

    const { data, error } = await supabaseServer
      .from("book_supplier_partners")
      .update({
        name,
        email: email || null,
        contact_person: contactPerson || null,
        phone: phone || null,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      throw new Error(
        `Partnerdaten konnten nicht gespeichert werden: ${error.message}`,
      );
    }

    if (!data) {
      return NextResponse.json(
        {
          ok: false,
          message: "Der Buchhandelspartner wurde nicht gefunden.",
        },
        {
          status: 404,
        },
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
      {
        status: 500,
      },
    );
  }
}