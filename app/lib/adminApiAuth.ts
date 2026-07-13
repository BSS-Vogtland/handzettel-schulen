import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from "@/app/lib/adminAuth";

export async function requireAdminApiSession(): Promise<NextResponse | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const isAuthenticated = await verifyAdminSessionToken(sessionToken);

  if (isAuthenticated) return null;

  return NextResponse.json(
    {
      ok: false,
      message: "Admin-Sitzung abgelaufen oder nicht angemeldet.",
    },
    { status: 401 }
  );
}
