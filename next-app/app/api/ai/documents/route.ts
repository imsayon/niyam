import { createHash, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { extractDocx } from "../../../../../server/document-domain.js";
import { readPdfText } from "../../../../../server/pdf-text.js";
import { readTabularDocument } from "../../../../../server/tabular-document.js";
import { documentUpload } from "../../../../lib/document-upload";
import { database } from "../../../../lib/db";
import { noStore, requireRole, safeResponse, checkOrigin, ApiError } from "../../../../lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function evidence(result: { text?: string; rows?: Array<Record<string, unknown>> }) {
  if (result.text) return String(result.text).slice(0, 25000);
  return (result.rows || []).map((row, index) => {
    const source = row.source as { fileName?: string; table?: number; row?: number } | undefined;
    const where = source?.table ? "table " + source.table + ", row " + source.row : "row " + (index + 1);
    return where + ": " + JSON.stringify(row);
  }).join("\n").slice(0, 25000);
}
export async function GET(request: NextRequest) {
  try {
    const account = await requireRole(request, "admin");
    const { rows } = await database().query(
      "SELECT id,file_name AS \"fileName\",created_at AS \"createdAt\",length(extracted_text) AS \"characters\" FROM niyam_ai_documents WHERE account_id=$1 ORDER BY created_at DESC LIMIT 25",
      [account.id],
    );
    return Response.json({ documents: rows }, { headers: noStore });
  } catch (error) { return safeResponse(error); }
}
export async function POST(request: NextRequest) {
  try {
    const { name, bytes } = await documentUpload(request);
    const extension = name.split(".").at(-1)?.toLowerCase();
    let result: { text?: string; rows?: Array<Record<string, unknown>> };
    if (extension === "docx") result = await extractDocx(name, bytes);
    else if (extension === "pdf") result = await readPdfText(name, bytes);
    else if (["csv", "xls", "xlsx", "txt"].includes(extension || ""))
      result = await readTabularDocument(name, bytes);
    else throw new ApiError(415, "Attach a DOCX, PDF, CSV, XLS/XLSX, or TXT document.");
    const text = evidence(result);
    if (!text.trim()) throw new ApiError(422, "No searchable content was extracted from the document.");
    const account = await requireRole(request, "admin");
    const db = database();
    const { rows: [usage] } = await db.query(
      "SELECT count(*)::int AS total FROM niyam_ai_documents WHERE account_id=$1", [account.id],
    );
    const digest = createHash("sha256").update(text).digest("hex");
    const existing = await db.query(
      "SELECT id FROM niyam_ai_documents WHERE account_id=$1 AND content_hash=$2", [account.id, digest],
    );
    if (usage.total >= 25 && !existing.rowCount)
      throw new ApiError(413, "Remove an existing saved document before adding more than 25.");
    const { rows: [saved] } = await db.query(
      \`INSERT INTO niyam_ai_documents(id,account_id,file_name,content_hash,extracted_text)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (account_id,content_hash)
       DO UPDATE SET file_name=EXCLUDED.file_name,created_at=now() RETURNING id\`,
      [randomUUID(), account.id, name, digest, text],
    );
    await db.query(
      "INSERT INTO niyam_audit(actor,action,target) VALUES ($1,'ai.document_attached',$2)",
      [account.id, saved.id],
    );
    return Response.json({ id: saved.id, fileName: name, characters: text.length,
      summary: "Document indexed for Ask Niyam. It was NOT imported into the examination roster." },
      { status: 201, headers: noStore });
  } catch (error) { return safeResponse(error); }
}
export async function DELETE(request: NextRequest) {
  try {
    checkOrigin(request);
    const account = await requireRole(request, "admin");
    const db = database();
    const { rowCount } = await db.query("DELETE FROM niyam_ai_documents WHERE account_id=$1", [account.id]);
    await db.query(
      "INSERT INTO niyam_audit(actor,action,target) VALUES ($1,'ai.documents_cleared',$2)",
      [account.id, String(rowCount || 0)],
    );
    return Response.json({ ok: true, removed: rowCount || 0 }, { headers: noStore });
  } catch (error) { return safeResponse(error); }
}
