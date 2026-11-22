import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";
import { classifyRows } from "./import-classifier.js";
import { HttpError } from "./store.js";

export async function readPdfText(fileName, buffer) {
  if (!/\.pdf$/i.test(fileName))
    throw new HttpError(415, "Select a PDF document.");
  if (!buffer.subarray(0, 1024).includes("%PDF-"))
    throw new HttpError(422, "The PDF could not be read.");

  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const locate = createRequire(join(process.cwd(), "package.json"));
  const assets = dirname(locate.resolve("pdfjs-dist/package.json"));
  const task = getDocument({
    data: Uint8Array.from(buffer),
    stopAtErrors: true,
    disableFontFace: true,
    useSystemFonts: false,
    useWasm: false,
    standardFontDataUrl: join(assets, "standard_fonts") + sep,
    cMapUrl: join(assets, "cmaps") + sep,
  });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 30)
      throw new HttpError(413, "Use PDFs of at most 30 pages.");

    let text = "";
    let hasText = false;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      text += "\nPage " + pageNumber + "\n";
      let separator = "";
      for await (const { items } of page.streamTextContent()) {
        for (const { str } of items) {
          if (typeof str !== "string") continue;
          if (text.length + separator.length + str.length > 25000)
            throw new HttpError(413, "Split the PDF into smaller documents.");
          text += separator + str;
          separator = " ";
          if (!hasText && str.trim()) hasText = true;
        }
      }
    }
    if (!hasText)
      throw new HttpError(422, "This PDF needs OCR. Export a searchable PDF or spreadsheet.");
    return { rows: [], classification: classifyRows(fileName), text };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error.name === "PasswordException")
      throw new HttpError(422, "Remove the PDF password before importing.");
    throw new HttpError(422, "The PDF could not be read.");
  } finally {
    await task.destroy();
  }
}
