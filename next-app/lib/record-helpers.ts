import { z, ZodError } from "zod";
import { ApiError, safeResponse } from "./security";
import { schemas } from "./workspace-domain";

export const kindSchema = z.enum(Object.keys(schemas) as [string, ...string[]]);
export const requestRevision = z.number().int().min(0);
export const recordId = z.string().trim().min(1).max(80);
export function recordSchema(kind: string): z.ZodTypeAny {
  return (schemas as Record<string,z.ZodTypeAny>)[kind];
}
export async function jsonBody(request: Request) {
  const raw = await request.text();
  if (raw.length > 512 * 1024) throw new ApiError(413, "The request is too large.");
  try { return JSON.parse(raw); }
  catch { throw new ApiError(400, "Invalid JSON."); }
}
export function recordError(error: unknown) {
  if (error instanceof ZodError)
    return Response.json({ error: "Correct the input and try again.",
      details: error.issues.map(issue => ({ field: issue.path.join("."), message: issue.message })) }, { status: 422, headers: { "Cache-Control": "no-store" } });
  return safeResponse(error);
}
