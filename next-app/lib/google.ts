import { randomUUID } from "node:crypto";
import {
  createAuthServer,
  NEON_AUTH_SESSION_CHALLENGE_COOKIE_NAME as challenge,
  NEON_AUTH_SESSION_DATA_COOKIE_NAME as sessionData,
  parseSetCookies,
  processAuthMiddleware,
  resolveNeonAuthLogging,
  validateSessionData,
} from "@neon/auth/server";
import type { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { audit, transaction } from "../../server/store.js";
import { createSession, eligibleStatus, rosterFor, type AccountRoster } from "./auth";
import { database } from "./db";
import { ApiError, publicOrigin, type Account } from "./security";

const log = resolveNeonAuthLogging({ logLevel: "silent" });
export const callbackPath = "/api/session/google/callback";
export const stateCookie = "niyam_google";
export const stateCookieOptions = () => ({
  httpOnly: true,
  secure: publicOrigin()?.startsWith("https://") ?? false,
  sameSite: "lax" as const,
  path: callbackPath,
});
const challengeOptions = () => ({ ...stateCookieOptions(), secure: true });

export async function googleStart(response: NextResponse, callback: URL): Promise<string | null> {
  const baseUrl = process.env.NEON_AUTH_URL;
  const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!baseUrl || !cookieSecret) return null;
  const auth = createAuthServer({
    baseUrl, cookieSecret, sameSite: "lax", log,
    context: () => ({
      getCookies: () => "",
      getHeader: () => null,
      getOrigin: () => callback.origin,
      getFramework: () => "nextjs",
      setCookie(name, value, options) {
        if (name === challenge) {
          response.cookies.set(name, value, { ...challengeOptions(), maxAge: options.maxAge ?? 600 });
        }
      },
    }),
  });
  const { data, error } = await auth.signIn.social({
    provider: "google",
    callbackURL: callback.href,
    errorCallbackURL: callback.href,
  });
  if (error || !data?.url) return null;
  const url = new URL(data.url);
  return url.protocol === "https:" || url.origin === callback.origin ? url.href : null;
}

export async function googleIdentity(request: NextRequest, callback: URL) {
  const cookie = request.cookies.get(challenge)?.value;
  const baseUrl = process.env.NEON_AUTH_URL;
  const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!cookie || !baseUrl || !cookieSecret || !callback.searchParams.has("neon_auth_session_verifier"))
    return null;
  const result = await processAuthMiddleware({
    request: new Request(callback, {
      headers: { cookie: challenge + "=" + encodeURIComponent(cookie) },
    }),
    pathname: callbackPath,
    skipRoutes: [callbackPath],
    loginUrl: "/",
    baseUrl, cookieSecret, log,
  });
  if (result.action !== "redirect_oauth") return null;
  const signed = result.cookies.flatMap(parseSetCookies).find(item => item.name === sessionData);
  if (!signed) return null;
  const { valid, payload } = await validateSessionData(signed.value, cookieSecret);
  return valid && payload?.user?.emailVerified === true ? payload.user.email : null;
}

export function clearGoogleCookies(response: NextResponse) {
  response.cookies.set(stateCookie, "", { ...stateCookieOptions(), maxAge: 0 });
  response.cookies.set(challenge, "", { ...challengeOptions(), maxAge: 0 });
  return response;
}

export function linkGoogleAccount(
  request: NextRequest, role: "faculty" | "student", address: string,
): Promise<string | null> {
  return transaction(database(), async (client: PoolClient) => {
    // Serialize roster changes and account linking, always locking workspace before account.
    const { rows: [workspace] } = await client.query<{ data: AccountRoster }>(
      "SELECT data FROM niyam_workspace WHERE id FOR UPDATE",
    );
    if (!workspace) throw new ApiError(503, "Workspace is unavailable.");
    const matches = rosterFor(workspace.data, role)
      .filter(person => person.email?.toLowerCase() === address);
    if (matches.length !== 1) return null;
    const person = matches[0];
    const { rows } = await client.query<Account>(
      "SELECT * FROM niyam_accounts WHERE email=$1 OR (role=$2 AND roster_id=$3) FOR UPDATE",
      [address, role, person.id],
    );
    const account = rows[0];
    if (rows.length > 1 || (account && (
      account.role !== role || (account.roster_id && account.roster_id !== person.id) ||
      !eligibleStatus(account)
    ))) return null;

    const id = account?.id ?? randomUUID();
    if (!account) {
      await client.query(
        `INSERT INTO niyam_accounts(id,email,name,role,status,roster_id,verified_at)
         VALUES ($1,$2,$3,$4,'active',$5,now())`,
        [id, address, person.name, role, person.id],
      );
      await audit(client, id, "account.google_linked", person.id);
    } else if (account.email !== address || account.roster_id !== person.id ||
        account.password_hash || account.status === "pending") {
      await client.query(
        `UPDATE niyam_accounts SET email=$1,status='active',roster_id=$2,password_hash=NULL,
         verified_at=now() WHERE id=$3`,
        [address, person.id, id],
      );
      await client.query("DELETE FROM niyam_sessions WHERE account_id=$1", [id]);
      await client.query("DELETE FROM niyam_account_tokens WHERE account_id=$1", [id]);
      await audit(client, id, "account.google_linked", person.id);
    }
    return createSession(client, request, id);
  });
}
