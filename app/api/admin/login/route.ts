import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  getAdminSessionMaxAgeSeconds,
  validateAdminCredentials,
} from "@/app/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getSafeNextUrl(value: unknown) {
  const next = String(value || "/admin").trim();

  if (!next.startsWith("/")) return "/admin";
  if (next.startsWith("//")) return "/admin";
  if (next.startsWith("/api/")) return "/admin";
  if (next === "/admin/login") return "/admin";

  return next;
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    let username = "";
    let password = "";
    let next = "/admin";

    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => null);
      username = String(body?.username || "").trim();
      password = String(body?.password || "");
      next = getSafeNextUrl(body?.next);
    } else {
      const formData = await request.formData();
      username = String(formData.get("username") || "").trim();
      password = String(formData.get("password") || "");
      next = getSafeNextUrl(formData.get("next"));
    }

    const isValid = validateAdminCredentials({ username, password });

    if (!isValid) {
      return jsonResponse(
        {
          ok: false,
          message: "Benutzername oder Passwort ist falsch.",
        },
        401
      );
    }

    const token = await createAdminSessionToken(username);

    const response = jsonResponse({
      ok: true,
      message: "Anmeldung erfolgreich.",
      next,
    });

    response.cookies.set({
      name: ADMIN_SESSION_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: getAdminSessionMaxAgeSeconds(),
    });

    return response;
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Anmeldung konnte nicht verarbeitet werden.",
      },
      500
    );
  }
}
