import express from "express";
import { requireRole } from "./accounts.js";
import { classifyRows } from "./import-classifier.js";
import {
  classificationInput, docxType, documentName, extractDocx,
  maxDocumentBytes, validateSpreadsheetArchive, xlsxType,
} from "./document-domain.js";

export { extractDocx };

export function documentApi(app) {
  app.post("/api/import/docx", express.raw({ type: docxType, limit: maxDocumentBytes }), async (req, res) => {
    requireRole(req, "admin");
    res.json(await extractDocx(documentName(req.get("x-document-name")), req.body));
  });
  app.post("/api/import/archive-check", express.raw({ type: xlsxType, limit: maxDocumentBytes }), async (req, res) => {
    requireRole(req, "admin");
    await validateSpreadsheetArchive(documentName(req.get("x-document-name")), req.body);
    res.json({ ok: true });
  });
  app.post("/api/import/classify", (req, res) => {
    requireRole(req, "admin");
    const { fileName, rows } = classificationInput.parse(req.body);
    res.json(classifyRows(fileName, rows));
  });
}
