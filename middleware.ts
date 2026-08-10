import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "./app/lib/adminAuth";

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
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

const LEXWARE_NO_STORE_ADMIN_ROUTE =
  /^\/api\/admin\/lexware\/invoices\/[^/]+\/(?:production-write-permit|activate-production-job|claim-production-job|expire-production-permit|reissue-production-permit|recover-external-result|pdf-audit|prepare-pdf|enqueue-mail|activate-mail|process-mail)$/;

function requiresNoStoreApiUnauthorizedResponse(pathname: string) {
  return (
    pathname === "/api/admin/paypal/runtime-readiness" ||
    pathname === "/api/admin/lexware/cron/pdfs/trigger-once" ||
    LEXWARE_NO_STORE_ADMIN_ROUTE.test(pathname)
  );
}

function createApiUnauthorizedResponse(pathname: string) {
  const response = NextResponse.json(
    {
      ok: false,
      message: "Admin-Sitzung abgelaufen oder nicht angemeldet.",
    },
    { status: 401 }
  );

  if (requiresNoStoreApiUnauthorizedResponse(pathname)) {
    response.headers.set("Cache-Control", "no-store");
  }

  return response;
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
    return createApiUnauthorizedResponse(pathname);
  }

  return createLoginRedirect(request);
}
