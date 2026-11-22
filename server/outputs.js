import { requireRole } from "./accounts.js";
import { aiConfiguration } from "./ai-config.js";
import { institutionConfiguration } from "./institution-config.js";
import { writeReportPdf } from "./report-pdf.js";
import {
  aiHistory, askAi, checkAiRateLimit, clearAiHistory, configureAi, extractAi, reportCsv, selectReport,
} from "./output-domain.js";

export { gemini } from "./output-domain.js";

export function outputApi(app, db) {
  const calls = new Map();
  function aiAccess(req, roles = [], cooldown) {
    const account = requireRole(req, ...roles);
    checkAiRateLimit(calls, account.id, cooldown);
    return account;
  }
  app.get("/api/ai/status", async (req, res) => {
    requireRole(req);
    const { key, model } = await aiConfiguration(db);
    res.json({ enabled: !!key, model });
  });
  app.post("/api/ai/config", async (req, res) => {
    const account = aiAccess(req, ["admin"]);
    res.json(await configureAi(db, account, req.body));
  });
  app.get("/api/ai/history", async (req, res) => {
    const account = requireRole(req);
    res.json(await aiHistory(db, account.id));
  });
  app.delete("/api/ai/history", async (req, res) => {
    const account = requireRole(req);
    res.json(await clearAiHistory(db, account.id));
  });
  app.post("/api/ai/ask", async (req, res) => {
    const account = aiAccess(req, [], 800);
    res.json(await askAi(db, account, req.body));
  });
  app.post("/api/ai/extract", async (req, res) => {
    aiAccess(req, ["admin"]);
    res.json(await extractAi(db, req.body));
  });
  app.get("/api/export/:event/:kind.:format", async (req, res) => {
    const account = requireRole(req, "admin", "faculty", "student");
    const report = await selectReport(db, account, req.params, req.query.run);
    res.attachment("Niyam-" + report.kind + "." + report.format);
    if (report.format === "csv")
      return res.type("text/csv").send(reportCsv(report));
    const institution = await institutionConfiguration(db);
    writeReportPdf(res, { institution, ...report });
  });
}
