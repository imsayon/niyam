import { randomBytes, timingSafeEqual, scrypt as derive } from "node:crypto";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { database } from "../../../lib/db";
import { ApiError, checkOrigin, digest, getAccount, googleEnabled, mailEnabled, publicAccount, safeResponse, type Account } from "../../../lib/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const scrypt = promisify(derive);
const maxAge = 12 * 60 * 60;
const adminEmail = "admin.niyam@dsce.edu.in";
const loginInput = z.object({
  email: z.email().max(254).transform(v => v.toLowerCase()),
  password: z.string().min(1).max(128),
  role: z.enum(["admin", "faculty", "student"]).optional(),
});
const attempts = new Map<string, { count: number; until: number }>();
function limit(ip: string) {
  const now = Date.now();
  for (const [key, entry] of attempts) if (entry.until < now) attempts.delete(key);
  if (attempts.size > 5000) throw new ApiError(429, "Try again in a few minutes.");
  const prev = attempts.get(ip) || { count: 0, until: now + 600000 };
  if (++prev.count > 12) throw new ApiError(429, "Try again in a few minutes.");
  attempts.set(ip, prev);
}
async function correctPassword(value: string, stored: string | null | undefined) {
  const fallback = "0000000000000000:" + "00".repeat(64);
  const [salt, hash] = (stored || fallback).split(":");
  const target = Buffer.from(hash, "hex");
  if (target.length !== 64) return false;
  const derived = (await scrypt(value, salt, 64)) as Buffer;
  return timingSafeEqual(derived, target) && !!stored;
}
const json = (data: object, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: NextRequest) {
  try {
    const account = await getAccount(request);
    const google = googleEnabled(), mail = mailEnabled();
    return json({ account: account ? publicAccount(account) : null, adminEmail,
      google, registration: mail && !google, recovery: mail });
  } catch (e) { return safeResponse(e); }
}
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    // Bound parsing independently of TypeScript and the schema.
    const raw = await request.text();
    if (raw.length > 2048) throw new ApiError(413, "The request is too large.");
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new ApiError(400, "Invalid JSON."); }
    const body = loginInput.parse(value);
    limit(request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown");
    const db = database();
    const { rows: [account] } = await db.query<Account>("SELECT * FROM niyam_accounts WHERE email=$1", [body.email]);
    if (!account || !(await correctPassword(body.password, account.password_hash)) ||
        !["active", "pending"].includes(account.status) ||
        (body.role && body.role !== account.role) ||
        (account.role === "admin" && account.email !== adminEmail) ||
        (googleEnabled() && account.role !== "admin")) {
      throw new ApiError(401, "Email or password is incorrect.");
    }
    const token = randomBytes(32).toString("base64url");
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM niyam_sessions WHERE expires_at<now() OR token_hash=$1", [request.cookies.get("niyam")?.value ? digest(request.cookies.get("niyam")!.value) : ""]);
      await client.query("INSERT INTO niyam_sessions VALUES ($1,$2,$3)", [digest(token), account.id, new Date(Date.now() + maxAge * 1000)]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally { client.release(); }
    const response = NextResponse.json({ account: publicAccount(account) }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set("niyam", token, { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "strict", path: "/", maxAge });
    return response;
  } catch (e) {
    if (e instanceof ZodError) return json({ error: "Correct the input and try again.", details: e.issues.map(i => ({field: i.path.join("."), message: i.message})) }, 422);
    return safeResponse(e);
  }
}
export async function DELETE(request: NextRequest) {
  try {
    checkOrigin(request);
    const session = request.cookies.get("niyam")?.value;
    if (session) await database().query("DELETE FROM niyam_sessions WHERE token_hash=$1", [digest(session)]);
    const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set("niyam", "", { httpOnly: true, sameSite: "strict", secure: new URL(request.url).protocol === "https:", path: "/", maxAge: 0 });
    return response;
  } catch (e) { return safeResponse(e); }
}
