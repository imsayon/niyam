import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { database } from "./db";
export type Role = "admin" | "faculty" | "student";
export interface Account {
  id: string; name: string; email: string; role: Role;
  status: "pending" | "active" | "rejected" | "disabled";
  roster_id: string | null; password_hash: string | null;
}
export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
export function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export const googleEnabled = () => !!(
  process.env.NEON_AUTH_URL && process.env.NEON_AUTH_COOKIE_SECRET &&
  (process.env.PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL)
);
export const mailEnabled = () => !!(
  process.env.SMTP_URL && process.env.MAIL_FROM &&
  (process.env.PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL)
);
export async function getAccount(request: NextRequest): Promise<Account | null> {
  const token = request.cookies.get("niyam")?.value;
  if (!token || !/^[\w-]{43}$/.test(token)) return null;
  // Mirror accounts.js query exactly: revoked rosters and status changes
  // invalidate sessions even when the session row itself still exists.
  const { rows: [account] } = await database().query<Account>(
    `SELECT a.* FROM niyam_sessions s JOIN niyam_accounts a ON a.id=s.account_id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND a.status IN ('active','pending')
      AND (
        (a.password_hash IS NOT NULL AND (a.role='admin' OR NOT $2::boolean))
        OR (a.password_hash IS NULL AND EXISTS (
          SELECT 1 FROM niyam_workspace w,
            jsonb_array_elements(w.data->(CASE a.role WHEN 'faculty' THEN 'faculty' ELSE 'students' END)) person
          WHERE person->>'id'=a.roster_id AND lower(person->>'email')=a.email
        ))
      )`, [digest(token), googleEnabled()],
  );
  return account || null;
}
export async function requireRole(request: NextRequest, ...roles: Role[]): Promise<Account> {
  const account = await getAccount(request);
  if (!account) throw new ApiError(401, "Sign in to continue.");
  if (account.status !== "active") throw new ApiError(403, "Your account is awaiting approval.");
  if (roles.length && !roles.includes(account.role)) throw new ApiError(403, "Your role cannot perform this action.");
  return account;
}
export function checkOrigin(request: NextRequest): void {
  const expected = process.env.PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL || new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" ||
      (origin && origin !== expected && origin !== process.env.DEV_ORIGIN)) {
    throw new ApiError(403, "This request must come from Niyam.");
  }
}
export function safeResponse(error: unknown): Response {
  if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  // Do not expose SQL/config/provider exception details.
  console.error("Niyam native API error", error instanceof Error ? error.name : "unknown");
  return Response.json({ error: "An unexpected server error occurred." }, { status: 500, headers: { "Cache-Control": "no-store" } });
}
export function publicAccount(account: Account) {
  return { id: account.id, name: account.name, email: account.email, role: account.role,
    status: account.status, rosterId: account.roster_id, passwordLogin: account.password_hash != null };
}
