import { NextResponse, type NextRequest } from "next/server";
import { emailSchema, rosterRole, tokenSchema, writeSessionCookie } from "../../../../../lib/auth";
import {
  callbackPath, clearGoogleCookies, googleIdentity, linkGoogleAccount, stateCookie,
} from "../../../../../lib/google";
import { ApiError, googleEnabled, noStore, publicOrigin, safeResponse } from "../../../../../lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const origin = publicOrigin();
    if (!origin || !googleEnabled()) throw new ApiError(404, "API endpoint not found.");
    const callback = new URL(callbackPath + request.nextUrl.search, origin);
    const roles = callback.searchParams.getAll("role");
    const states = callback.searchParams.getAll("state");
    const selected = rosterRole.safeParse(roles.length === 1 ? roles[0] : null);
    const state = tokenSchema.safeParse(states.length === 1 ? states[0] : null);
    const role = selected.data ?? "student";
    const redirect = (error?: "retry" | "roster") => clearGoogleCookies(new NextResponse(null, {
      status: 303,
      headers: { ...noStore, Location: error ? "/?role=" + role + "&signIn=" + error : "/" },
    }));
    if (!selected.success || !state.success ||
        request.cookies.get(stateCookie)?.value !== role + "." + state.data)
      return redirect("retry");

    const verified = emailSchema.safeParse(await googleIdentity(request, callback));
    if (!verified.success) return redirect("retry");
    const value = await linkGoogleAccount(request, role, verified.data);
    return value ? writeSessionCookie(redirect(), request, value) : redirect("roster");
  } catch (error) {
    return safeResponse(error);
  }
}
