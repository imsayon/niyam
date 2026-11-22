import type { NextRequest } from "next/server";
import { docxType, extractDocx } from "../../../../../server/document-domain.js";
import { documentUpload } from "../../../../lib/document-upload";
import { noStore, safeResponse } from "../../../../lib/security";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { name, bytes } = await documentUpload(request, docxType);
    return Response.json(await extractDocx(name, bytes), { headers: noStore });
  } catch (error) {
    return safeResponse(error);
  }
}
