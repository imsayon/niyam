import type { NextRequest } from "next/server";
import { documentName, maxDocumentBytes } from "../../server/document-domain.js";
import { readBytes } from "./record-helpers";
import { ApiError, checkOrigin, requireRole } from "./security";

export async function documentUpload(request: NextRequest, contentType = "application/octet-stream") {
  checkOrigin(request);
  await requireRole(request, "admin");
  const name = documentName(request.headers.get("x-document-name"));
  const sentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (sentType !== contentType) throw new ApiError(415, "The upload format is unsupported.");
  return { name, bytes: await readBytes(request, maxDocumentBytes) };
}
