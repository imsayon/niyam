import { read, utils } from "xlsx";
import { validateSpreadsheetArchive } from "./document-domain.js";
import { classifyRows } from "./import-classifier.js";
import { HttpError } from "./store.js";

const xlsHeader = Buffer.from("d0cf11e0a1b11ae1", "hex");

function decodeText(buffer) {
  const marker = buffer.length >= 2 ? buffer.readUInt16BE(0) : 0;
  if (marker === 0xfffe || marker === 0xfeff)
    return new TextDecoder(marker === 0xfffe ? "utf-16le" : "utf-16be").decode(buffer);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

export async function readTabularDocument(fileName, buffer) {
  const extension = fileName.split(".").at(-1).toLowerCase();
  let input = buffer;
  let text;
  let rows = [];

  if (extension === "xlsx") {
    await validateSpreadsheetArchive(fileName, buffer);
  } else if (extension === "xls") {
    if (!buffer.subarray(0, 8).equals(xlsHeader) && !(buffer[0] === 0x09 && buffer[1] <= 0x08))
      throw new HttpError(422, "Select a valid XLS workbook.");
  } else if (extension === "csv" || extension === "txt") {
    input = decodeText(buffer);
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(input))
      throw new HttpError(422, "Select a plain-text or CSV document.");
    if (extension === "txt") {
      if (input.length > 25000)
        throw new HttpError(413, "Split the text into smaller documents.");
      text = input;
      if (!text.split(/\r?\n/, 1)[0].includes("\t"))
        return { rows, classification: classifyRows(fileName, rows), text };
    }
  } else {
    throw new HttpError(415, "Select a CSV, Excel, or TXT document.");
  }

  let sheet;
  try {
    const book = read(input, {
      type: typeof input === "string" ? "string" : "buffer",
      sheets: 0,
      sheetRows: 252,
    });
    sheet = book.Sheets[book.SheetNames[0]];
    if (sheet?.["!ref"]) {
      const range = utils.decode_range(sheet["!ref"]);
      if (range.e.c - range.s.c >= 128)
        throw new HttpError(413, "Use at most 128 columns in an import.");
      rows = utils.sheet_to_json(sheet, { defval: "" });
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(422, "The spreadsheet could not be read.");
  }
  if (rows.length > 250)
    throw new HttpError(413, "Split imports into batches of at most 250 rows.");
  if (Buffer.byteLength(JSON.stringify(rows)) > 500 * 1024)
    throw new HttpError(413, "Split the spreadsheet into smaller imports.");
  return { rows, classification: classifyRows(fileName, rows), text };
}
