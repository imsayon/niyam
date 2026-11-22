import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { institutionConfiguration } from "../../../../../../server/institution-config.js";
import { reportCsv, selectReport } from "../../../../../../server/output-domain.js";
import { createReportPdf } from "../../../../../../server/report-pdf.js";
import { database } from "../../../../../lib/db";
import { ApiError, noStore, requireRole, safeResponse } from "../../../../../lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ event: string; report: string }> }) {
  try {
    const account = await requireRole(request);
    const { event, report } = await context.params;
    const extension = report.lastIndexOf(".");
    if (extension < 1 || extension === report.length - 1)
      throw new ApiError(404, "API endpoint not found.");
    const params = { event, kind: report.slice(0, extension), format: report.slice(extension + 1) };
    const db = database();
    const runs = request.nextUrl.searchParams.getAll("run");
    const result = await selectReport(db, account, params, runs.length > 1 ? runs : runs[0]);
    const csv = result.format === "csv";
    const headers = {
      ...noStore,
      "Content-Disposition": 'attachment; filename="Niyam-' + result.kind + "." + result.format + '"',
      "Content-Type": csv ? "text/csv; charset=utf-8" : "application/pdf",
    };
    if (csv) return new Response(reportCsv(result), { headers });
    const institution = await institutionConfiguration(db);
    const document = createReportPdf({ institution, ...result });
    return new Response(Readable.toWeb(document) as ReadableStream<Uint8Array>, { headers });
  } catch (error) {
    return safeResponse(error);
  }
}
