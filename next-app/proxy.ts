import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const nonce = randomBytes(16).toString("base64");
  const scripts = `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`;
  const policy = ["default-src 'self'", scripts, "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:", "img-src 'self' data:", "object-src 'none'",
    "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'"].join("; ");
  const headers = new Headers(request.headers);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!api(?:/|$)|_next/|favicon.ico|mark.svg|templates/).*)"],
};
