import type { NextRequest } from "next/server";
import { readTabularDocument } from "../../../../../server/tabular-document.js";
import { documentUpload } from "../../../../lib/document-upload";
import { noStore, safeResponse } from "../../../../lib/security";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { name, bytes } = await documentUpload(request);
    return Response.json(await readTabularDocument(name, bytes), { headers: noStore });
  } catch (error) {
    return safeResponse(error);
  }
}
