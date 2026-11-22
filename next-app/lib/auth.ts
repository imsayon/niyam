import { randomBytes, scrypt as derive, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { promisify } from "node:util";
import { NextResponse, type NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { z } from "zod";
import { ApiError, digest, noStore, publicAccount, publicOrigin, type Account } from "./security";

const scrypt = promisify(derive);
const sessionAge = 12 * 60 * 60;
const attempts = new Map<string, { count: number; until: number }>();
const activeStatuses = new Set<Account["status"]>(["active", "pending"]);

export const adminEmail = "admin.niyam@dsce.edu.in";
export const emailSchema = z.email().max(254).transform(value => value.toLowerCase());
export const passwordSchema = z.string().min(12).max(128);
export const rosterRole = z.enum(["faculty", "student"]);
export const tokenSchema = z.string().regex(/^[\w-]{43}$/);
export const newToken = () => randomBytes(32).toString("base64url");

interface RosterPerson {
  id: string;
  name: string;
  email?: string;
}

export type AccountRoster = { faculty: RosterPerson[]; students: RosterPerson[] };
export function rosterFor(data: AccountRoster, role: z.infer<typeof rosterRole>) {
  return (role === "faculty" ? data.faculty : data.students) ?? [];
}

export function eligibleStatus(account: Account): boolean {
  return activeStatuses.has(account.status);
}

export function limitAuth(request: NextRequest, action: string): void {
  // Render's managed ingress sets this header. Caller-supplied forwarding chains are ignored.
  const candidate = process.env.RENDER === "true" ? request.headers.get("cf-connecting-ip") : null;
  const ip = candidate && isIP(candidate) ? candidate : "unknown";
  const key = action + ":" + ip;
  const now = Date.now();
  for (const [address, entry] of attempts) if (entry.until <= now) attempts.delete(address);
  if (attempts.size >= 5000 && !attempts.has(key))
    throw new ApiError(429, "Try again in a few minutes.");
  const entry = attempts.get(key) ?? { count: 0, until: now + 10 * 60 * 1000 };
  if (++entry.count > 12) throw new ApiError(429, "Try again in a few minutes.");
  attempts.set(key, entry);
}

export async function hashPassword(value: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(value, salt, 64)) as Buffer;
  return salt + ":" + hash.toString("hex");
}

export async function correctPassword(value: string, stored: string | null | undefined): Promise<boolean> {
  const [salt, hash] = (stored ?? "").split(":");
  const valid = !!salt && /^[a-f0-9]{128}$/i.test(hash ?? "");
  const target = valid ? Buffer.from(hash, "hex") : Buffer.alloc(64);
  const candidate = (await scrypt(value, valid ? salt : "0000000000000000", 64)) as Buffer;
  return timingSafeEqual(candidate, target) && valid;
}

export async function createSession(client: PoolClient, request: NextRequest, accountId: string) {
  const value = newToken();
  const previous = request.cookies.get("niyam")?.value;
  await client.query(
    "DELETE FROM niyam_sessions WHERE expires_at<now() OR token_hash=$1",
    [previous ? digest(previous) : ""],
  );
  await client.query("INSERT INTO niyam_sessions VALUES ($1,$2,$3)", [
    digest(value), accountId, new Date(Date.now() + sessionAge * 1000),
  ]);
  return value;
}

export function writeSessionCookie(response: NextResponse, request: NextRequest, value: string) {
  response.cookies.set("niyam", value, {
    httpOnly: true,
    secure: (publicOrigin() ?? request.url).startsWith("https://"),
    sameSite: "strict",
    path: "/",
    maxAge: value ? sessionAge : 0,
  });
  return response;
}

export function sessionResponse(request: NextRequest, account: Account, value: string) {
  return writeSessionCookie(
    NextResponse.json({ account: publicAccount(account) }, { headers: noStore }),
    request, value,
  );
}
