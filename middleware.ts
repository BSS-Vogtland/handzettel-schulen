import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "./app/lib/adminAuth";

export const config = {
  matcher: ["/admin/:path*"],
};

function isLoginOrLogoutPath(pathname: string) {
  return (
    pathname === "/admin/login" ||
    pathname.startsWith("/admin/login/") ||
    pathname === "/api/admin/login" ||
    pathname === "/api/admin/logout"
  );
}

function createLoginRedirect(request: NextRequest) {
  const loginUrl = new URL("/admin/login", request.url);
  const targetPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  loginUrl.searchParams.set("next", targetPath);

  return NextResponse.redirect(loginUrl);
}

function createApiUnauthorizedResponse() {
  return NextResponse.json(
    {
      ok: false,
      message: "Admin-Sitzung abgelaufen oder nicht angemeldet.",
    },
    { status: 401 }
  );
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (isLoginOrLogoutPath(pathname)) {
    return NextResponse.next();
  }

  const adminUser = process.env.ADMIN_USER;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminUser || !adminPassword) {
    return new NextResponse(
      "Admin-Zugang ist nicht konfiguriert. Bitte ADMIN_USER und ADMIN_PASSWORD setzen.",
      {
        status: 500,
      }
    );
  }

  const sessionToken = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const isAuthenticated = await verifyAdminSessionToken(sessionToken);

  if (isAuthenticated) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/admin/")) {
    return createApiUnauthorizedResponse();
  }

  return createLoginRedirect(request);
}
