import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { limitAuth, newToken, rosterRole } from "../../../../lib/auth";
import { callbackPath, googleStart, stateCookie, stateCookieOptions } from "../../../../lib/google";
import { jsonBody } from "../../../../lib/record-helpers";
import { ApiError, checkOrigin, googleEnabled, noStore, publicOrigin, safeResponse } from "../../../../lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const origin = publicOrigin();
    if (!origin || !googleEnabled()) throw new ApiError(404, "API endpoint not found.");
    limitAuth(request, "google");
    const { role } = z.object({ role: rosterRole }).parse(await jsonBody(request, 2048));
    const state = newToken();
    const callback = new URL(callbackPath, origin);
    callback.searchParams.set("role", role);
    callback.searchParams.set("state", state);
    const response = new NextResponse();
    const url = await googleStart(response, callback);
    if (!url) throw new ApiError(502, "Google sign-in is temporarily unavailable.");
    response.cookies.set(stateCookie, role + "." + state, { ...stateCookieOptions(), maxAge: 600 });
    const result = NextResponse.json({ url }, { headers: noStore });
    for (const cookie of response.cookies.getAll()) result.cookies.set(cookie);
    return result;
  } catch (error) {
    return safeResponse(error);
  }
}
