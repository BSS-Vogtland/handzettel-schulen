import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: ["/admin/:path*"],
};

function getUnauthorizedResponse() {
  return new NextResponse("Admin-Bereich geschützt.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Handzettel-Schulen Admin"',
    },
  });
}

function safeCompare(a: string, b: string) {
  if (a.length !== b.length) return false;

  let result = 0;

  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return result === 0;
}

export function middleware(request: NextRequest) {
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

  const authHeader = request.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return getUnauthorizedResponse();
  }

  const encodedCredentials = authHeader.replace("Basic ", "");

  let decodedCredentials = "";

  try {
    decodedCredentials = atob(encodedCredentials);
  } catch {
    return getUnauthorizedResponse();
  }

  const separatorIndex = decodedCredentials.indexOf(":");

  if (separatorIndex === -1) {
    return getUnauthorizedResponse();
  }

  const username = decodedCredentials.slice(0, separatorIndex);
  const password = decodedCredentials.slice(separatorIndex + 1);

  const usernameMatches = safeCompare(username, adminUser);
  const passwordMatches = safeCompare(password, adminPassword);

  if (!usernameMatches || !passwordMatches) {
    return getUnauthorizedResponse();
  }

  return NextResponse.next();
}