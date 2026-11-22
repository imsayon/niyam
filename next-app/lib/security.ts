import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "../../server/store.js";
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
export function publicOrigin(): string | null {
  const origin = process.env.PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL;
  return origin ? new URL(origin).origin : null;
}
export const googleEnabled = () => !!(
  process.env.NEON_AUTH_URL && process.env.NEON_AUTH_COOKIE_SECRET &&
  publicOrigin()
);
export const mailEnabled = () => !!(
  process.env.SMTP_URL && process.env.MAIL_FROM &&
  publicOrigin()
);
export function getAccount(request: NextRequest): Promise<Account | null> {
  return getAccountFromToken(request.cookies.get("niyam")?.value);
}
export async function getAccountFromToken(token: string | undefined): Promise<Account | null> {
  if (!token || !/^[\w-]{43}$/.test(token)) return null;
  // Mirror accounts.js query exactly: revoked rosters and status changes
  // invalidate sessions even when the session row itself still exists.
  const { rows: [account] } = await database().query<Account>(
    `SELECT a.* FROM niyam_sessions s JOIN niyam_accounts a ON a.id=s.account_id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND a.status IN ('active','pending')
      AND (
        (a.password_hash IS NOT NULL AND (a.role='admin' OR NOT $2::boolean))
        OR (a.password_hash IS NULL AND a.role IN ('faculty','student') AND EXISTS (
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
  const expected = publicOrigin() || new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" ||
      (origin && origin !== expected && origin !== process.env.DEV_ORIGIN)) {
    throw new ApiError(403, "This request must come from Niyam.");
  }
}
export const noStore = { "Cache-Control": "no-store" };
export function safeResponse(error: unknown): Response {
  if (error instanceof ZodError) {
    const details = error.issues.map(issue => ({ field: issue.path.join("."), message: issue.message }));
    return Response.json({ error: "Correct the input and try again.", details }, { status: 422, headers: noStore });
  }
  if (error instanceof ApiError || error instanceof HttpError) {
    const details = error instanceof HttpError ? error.details : undefined;
    return Response.json({ error: error.message, details }, { status: error.status, headers: noStore });
  }
  console.error("Niyam native API error", error instanceof Error ? error.name : "unknown");
  return Response.json({ error: "An unexpected server error occurred." }, { status: 500, headers: noStore });
}
export function publicAccount(account: Account) {
  return { id: account.id, name: account.name, email: account.email, role: account.role,
    status: account.status, rosterId: account.roster_id, passwordLogin: account.password_hash != null };
}
