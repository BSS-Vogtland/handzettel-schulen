import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;
  const offerToken = String(token || "").trim();

  if (!offerToken) {
    return NextResponse.json(
      {
        ok: false,
        message: "Kein Paketwunsch-Token übergeben.",
      },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      mode: "checkout_required",
      redirectUrl: `/angebot/${encodeURIComponent(offerToken)}/checkout`,
      message:
        "Der Paketwunsch wird nicht mehr direkt bestätigt. Bitte schließe die Bestellung über den Checkout mit Rechnungsadresse, Übergabeart und Zahlungsart ab.",
    },
    { status: 409 }
  );
}

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      message: "Diese Route ist veraltet. Bitte nutze den Checkout.",
    },
    { status: 405 }
  );
}
