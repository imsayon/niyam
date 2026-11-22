import type { NextRequest } from "next/server";
import { validateSpreadsheetArchive, xlsxType } from "../../../../../server/document-domain.js";
import { documentUpload } from "../../../../lib/document-upload";
import { noStore, safeResponse } from "../../../../lib/security";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { name, bytes } = await documentUpload(request, xlsxType);
    await validateSpreadsheetArchive(name, bytes);
    return Response.json({ ok: true }, { headers: noStore });
  } catch (error) {
    return safeResponse(error);
  }
}
