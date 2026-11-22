import { z } from "zod";
import { schemas } from "../../server/workspace-domain.js";
import { ApiError } from "./security";

export { id as recordId, revision as requestRevision } from "../../server/workspace-domain.js";

type RecordKind = keyof typeof schemas;
export const kindSchema = z.enum(Object.keys(schemas) as RecordKind[]);
export function recordSchema(kind: RecordKind) {
  return schemas[kind];
}

export async function readBytes(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new ApiError(413, "The request is too large.");
  if (!request.body) return Buffer.alloc(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return Buffer.concat(chunks, bytes);
      bytes += value.byteLength;
      if (bytes > limit) {
        void reader.cancel().catch(() => {});
        throw new ApiError(413, "The request is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

export async function jsonBody(request: Request, limit = 512 * 1024): Promise<unknown> {
  const bytes = await readBytes(request, limit);
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { throw new ApiError(400, "Invalid JSON."); }
}
