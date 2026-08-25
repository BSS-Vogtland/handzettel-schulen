import { NextResponse } from "next/server";
import { isPayPalPaymentsEnabled } from "@/app/lib/paypalPaymentsGate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const paypalPaymentsEnabled = await isPayPalPaymentsEnabled();

  return NextResponse.json(
    { paypalPaymentsEnabled },
    { headers: { "Cache-Control": "no-store" } },
  );
}
