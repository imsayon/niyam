import { inflateRaw } from "node:zlib";
import { promisify } from "node:util";
import { z } from "zod";
import { HttpError } from "./store.js";
import { classifyDocx, classifyRows } from "./import-classifier.js";

const inflateRawAsync = promisify(inflateRaw);
export const docxType =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const xlsxType =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const maxDocumentBytes = 10 * 1024 * 1024;
const maxExpanded = 50 * 1024 * 1024;
const maxXmlBytes = 8 * 1024 * 1024;
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++)
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(value) {
  let crc = 0xffffffff;
  for (const byte of value) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function archiveEntries(buffer, requiredEntry, all = false) {
  if (!Buffer.isBuffer(buffer) || buffer.length > maxDocumentBytes)
    throw new HttpError(413, "Use a file smaller than 10 MB.");
  let end = -1;
  for (
    let offset = buffer.length - 22;
    offset >= Math.max(0, buffer.length - 65557);
    offset--
  )
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      end = offset;
      break;
    }
  if (end < 0) throw new HttpError(422, "The archive directory is invalid.");
  if (
    all &&
    (end + 22 + buffer.readUInt16LE(end + 20) !== buffer.length ||
      buffer.indexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]), end + 1) !== -1)
  )
    throw new HttpError(422, "The archive directory is invalid.");
  const disk = buffer.readUInt16LE(end + 4);
  const directoryDisk = buffer.readUInt16LE(end + 6);
  const count = buffer.readUInt16LE(end + 10);
  const size = buffer.readUInt32LE(end + 12);
  const start = buffer.readUInt32LE(end + 16);
  if (
    disk !== 0 ||
    directoryDisk !== 0 ||
    count === 0xffff ||
    count > 1000 ||
    start + size > end
  )
    throw new HttpError(422, "The archive is unsupported or malformed.");
  let cursor = start;
  let expanded = 0;
  let found = null;
  const entries = [];
  for (let index = 0; index < count; index++) {
    if (
      cursor + 46 > start + size ||
      buffer.readUInt32LE(cursor) !== 0x02014b50
    )
      throw new HttpError(422, "The archive directory is invalid.");
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > start + size || flags & 1 || uncompressedSize === 0xffffffff)
      throw new HttpError(422, "The archive contains an unsupported entry.");
    expanded += uncompressedSize;
    if (expanded > maxExpanded)
      throw new HttpError(413, "The archive expands beyond the 50 MB limit.");
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    if (name === requiredEntry || all) {
      if (all) rejectZip64(buffer, cursor + 46 + nameLength, extraLength);
      const entry = { name, flags, method, crc, compressedSize, uncompressedSize, localOffset };
      if (name === requiredEntry) found = entry;
      if (all) entries.push(entry);
    }
    cursor = next;
  }
  if (!found)
    throw new HttpError(422, "The expected document content is missing.");
  if (found.uncompressedSize > maxXmlBytes)
    throw new HttpError(413, "The document content exceeds the 8 MB limit.");
  return all ? entries.map((entry) => localEntry(buffer, entry, start, all)) : localEntry(buffer, found, start);
}

function rejectZip64(buffer, start, length) {
  const end = start + length;
  for (let offset = start; offset < end;) {
    if (offset + 4 > end || buffer.readUInt16LE(offset) === 1)
      throw new HttpError(422, "The archive contains an unsupported entry.");
    offset += 4 + buffer.readUInt16LE(offset + 2);
    if (offset > end)
      throw new HttpError(422, "The archive contains an unsupported entry.");
  }
}

function localEntry(buffer, entry, start, strict = false) {
  if (![0, 8].includes(entry.method))
    throw new HttpError(
      422,
      "The document uses an unsupported compression method.",
    );
  if (
    entry.localOffset + 30 > start ||
    buffer.readUInt32LE(entry.localOffset) !== 0x04034b50
  )
    throw new HttpError(422, "The document content is malformed.");
  const offset = entry.localOffset;
  const localName = buffer.readUInt16LE(offset + 26);
  const localExtra = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + localName + localExtra;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > start || dataEnd > buffer.length)
    throw new HttpError(422, "The document content is truncated.");
  if (strict) {
    const sizesMatch = buffer.readUInt32LE(offset + 18) === entry.compressedSize &&
      buffer.readUInt32LE(offset + 22) === entry.uncompressedSize;
    const usesDescriptor = !!(entry.flags & 8);
    if (
      buffer.readUInt16LE(offset + 6) !== entry.flags ||
      buffer.readUInt16LE(offset + 8) !== entry.method ||
      buffer.toString("utf8", offset + 30, offset + 30 + localName) !== entry.name ||
      (!sizesMatch && !(usesDescriptor && entry.method === 8 &&
        buffer.readUInt32LE(offset + 18) === 0 &&
        buffer.readUInt32LE(offset + 22) === 0))
    )
      throw new HttpError(422, "The archive entry metadata is inconsistent.");
    rejectZip64(buffer, offset + 30 + localName, localExtra);
  }
  return { ...entry, dataStart, dataEnd };
}

function decodeXml(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) =>
      String.fromCodePoint(parseInt(code, 16)),
    );
}

function textFromXml(xml) {
  return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((match) => decodeXml(match[1]))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDocumentXml(xml) {
  const body = xml.match(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/)?.[1];
  if (!body) throw new HttpError(422, "The Word document body is invalid.");
  const paragraphs = [];
  const tables = [];
  let headings = [];
  const blocks = /<w:p\b[^>]*>[\s\S]*?<\/w:p>|<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g;
  for (const match of body.matchAll(blocks)) {
    if (match[0].startsWith("<w:p")) {
      const paragraph = textFromXml(match[0]);
      if (paragraph) {
        paragraphs.push(paragraph);
        headings.push(paragraph);
      }
      continue;
    }
    const rows = [];
    const spans = [];
    for (const row of match[0].matchAll(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g)) {
      const parts = [...row[1].matchAll(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g)];
      const cells = parts.map((cell) => textFromXml(cell[1]).slice(0, 300));
      if (cells.length > 40)
        throw new HttpError(413, "A table has too many columns.");
      rows.push(cells);
      spans.push(
        parts.map((cell) =>
          Math.min(
            40,
            Math.max(
              1,
              Number(cell[1].match(/<w:gridSpan\b[^>]*w:val="(\d+)"/)?.[1]) ||
                1,
            ),
          ),
        ),
      );
      if (rows.length > 100)
        throw new HttpError(413, "A table has too many rows.");
    }
    tables.push({ rows, spans, heading: headings.join(" ") });
    headings = [];
    if (tables.length > 32)
      throw new HttpError(413, "The document has too many tables.");
  }
  const cells = tables.reduce(
    (sum, table) =>
      sum + table.rows.reduce((count, row) => count + row.length, 0),
    0,
  );
  if (cells > 20000 || paragraphs.join(" ").length > 100000)
    throw new HttpError(413, "The document contains too much extracted text.");
  return { paragraphs, tables };
}

function source(fileName, table, row, column) {
  return { fileName, table, row, ...(column ? { column } : {}) };
}

function historicalBatchRows(fileName, document, classification) {
  const rows = [];
  document.tables.forEach((table, tableIndex) => {
    const batch = table.heading
      .match(/\bbatch[\s:#–-]*([A-Z]\s*\d{1,2})\b/i)?.[1]
      ?.replace(/\s/g, "")
      .toUpperCase();
    const header = table.rows[0].map((value) => value.toLowerCase().trim());
    const idColumn = header.indexOf("usn");
    const nameColumn = header.indexOf("name");
    table.rows.slice(1).forEach((cells, rowIndex) => {
      if (!cells.some((cell) => cell.trim())) return;
      rows.push({
        type: "historical-lab-batch",
        year: classification.term,
        semester: classification.semester,
        section: batch?.[0] || "",
        batch: batch || "",
        studentId: cells[idColumn]?.replace(/\s/g, "").toUpperCase() || "",
        studentName: cells[nameColumn]?.trim() || "",
        historical: true,
        candidatePool: false,
        source: source(fileName, tableIndex + 1, rowIndex + 2),
      });
    });
  });
  return rows;
}

function timetableRows(fileName, document, classification) {
  const rows = [];
  const courseCode = (value) =>
    value
      ?.match(/\b\d{1,2}\s*[A-Z]{2,8}\s*\d(?:\s*\d){1,3}[A-Z]?\b/i)?.[0]
      .replace(/\s/g, "")
      .toUpperCase();
  for (let gridIndex = 0; gridIndex < document.tables.length; gridIndex += 2) {
    const grid = document.tables[gridIndex];
    const legend = document.tables[gridIndex + 1];
    const section = grid.heading
      .match(/\bsem(?:ester)?\s*:\s*(?:[IVX ]+|\d{1,2}\s*)([A-Z])\b/i)?.[1]
      ?.toUpperCase();
    const roomLabel = grid.heading
      .match(/\broom\s*no\s*:\s*((?:[A-Z]+\s*)?\d(?:\s*\d){1,3}[A-Z]?)/i)?.[1]
      ?.replace(/\s+/g, " ")
      .trim();
    legend.rows.slice(1).forEach((cells, rowIndex) => {
      const codeColumn = cells.findIndex(
        (cell, index) => index > 0 && courseCode(cell),
      );
      if (codeColumn < 0) return;
      rows.push({
        type: "course",
        term: classification.term || undefined,
        semester: classification.semester || undefined,
        section,
        courseCode: courseCode(cells[codeColumn]),
        courseName: cells[codeColumn + 1] || undefined,
        facultySuggestion:
          [cells[codeColumn + 3], cells[codeColumn + 2]]
            .filter(Boolean)
            .join(" · ")
            .slice(0, 150) || undefined,
        candidatePool: false,
        source: source(fileName, gridIndex + 2, rowIndex + 2),
      });
    });
    const periods = grid.rows[0].flatMap((period, index) =>
      Array.from({ length: grid.spans[0][index] }, () => period),
    );
    grid.rows.slice(1).forEach((cells, rowIndex) => {
      const day = cells[0]?.trim();
      if (!day) return;
      let offset = grid.spans[rowIndex + 1][0];
      cells.slice(1).forEach((entry, columnIndex) => {
        const count = grid.spans[rowIndex + 1][columnIndex + 1];
        const period = [
          ...new Set(periods.slice(offset, offset + count).filter(Boolean)),
        ]
          .join(" / ")
          .slice(0, 40);
        offset += count;
        const value = entry.trim();
        if (!value) return;
        rows.push({
          type: "teaching",
          term: classification.term || undefined,
          semester: classification.semester || undefined,
          section,
          courseCode: courseCode(value),
          day,
          period: period || undefined,
          roomLabel,
          entry: value,
          candidatePool: false,
          source: source(
            fileName,
            gridIndex + 1,
            rowIndex + 2,
            columnIndex + 2,
          ),
        });
      });
    });
  }
  return rows;
}

function genericRows(fileName, document) {
  const rows = [];
  document.tables.forEach((table, tableIndex) =>
    table.rows.forEach((cells, rowIndex) => {
      if (!cells.some((cell) => cell.trim())) return;
      rows.push({
        ...Object.fromEntries(
          cells.map((value, index) => [`column${index + 1}`, value]),
        ),
        source: source(fileName, tableIndex + 1, rowIndex + 1),
      });
    }),
  );
  if (rows.length > 250)
    throw new HttpError(
      413,
      "Split this document into batches of at most 250 rows.",
    );
  return rows;
}

function tabularDocument(fileName, document) {
  const rows = [];
  const types = new Set();
  for (const {
    rows: [headers, ...body],
  } of document.tables) {
    if (
      !headers?.length ||
      !body.length ||
      new Set(headers).size !== headers.length
    )
      return null;
    const records = body
      .filter((cells) => cells.some(Boolean))
      .map((cells) =>
        Object.fromEntries(
          headers
            .filter(Boolean)
            .map((header) => [header, cells[headers.indexOf(header)] || ""]),
        ),
      );
    types.add(classifyRows(fileName, records).destination);
    rows.push(...records);
  }
  if (types.size !== 1 || types.has(null) || !rows.length) return null;
  if (rows.length > 250)
    throw new HttpError(
      413,
      "Split this document into batches of at most 250 rows.",
    );
  return { rows, classification: classifyRows(fileName, rows) };
}

export function extractDocx(fileName, buffer) {
  if (!/\.docx$/i.test(fileName))
    throw new HttpError(415, "Select a DOCX Word document.");
  const entry = archiveEntries(buffer, "word/document.xml");
  const compressed = buffer.subarray(entry.dataStart, entry.dataEnd);
  const xml =
    entry.method === 0
      ? compressed
      : awaitInflate(compressed, entry.uncompressedSize);
  return Promise.resolve(xml).then((bytes) => {
    if (bytes.length !== entry.uncompressedSize || crc32(bytes) !== entry.crc)
      throw new HttpError(
        422,
        "The Word document content failed integrity checks.",
      );
    const document = parseDocumentXml(bytes.toString("utf8"));
    const classification = classifyDocx(document.paragraphs, document.tables);
    if (classification.manualOverrideRequired) {
      const structured = tabularDocument(fileName, document);
      if (structured) return structured;
    }
    let rows;
    if (classification.destination === "references")
      rows =
        classification.referenceType === "historical-lab-batch"
          ? historicalBatchRows(fileName, document, classification)
          : timetableRows(fileName, document, classification);
    else rows = genericRows(fileName, document);
    if (rows.length > 250)
      throw new HttpError(413, "Split this document into batches of at most 250 rows.");
    const conflicts = [];
    const seen = new Map();
    rows.forEach((row) => {
      if (row.type !== "historical-lab-batch" || !row.studentId) return;
      const key = row.studentId.trim().toUpperCase();
      const first = seen.get(key);
      if (first)
        conflicts.push({
          table: row.source.table,
          row: row.source.row,
          message:
            "Duplicate historical student identifier. Compare with table " +
            first.table +
            ", row " +
            first.row +
            " before committing.",
        });
      else seen.set(key, row.source);
    });
    return {
      classification: { ...classification, conflicts },
      rows,
    };
  });
}

function awaitInflate(compressed, size, limit = maxXmlBytes) {
  return inflateRawAsync(compressed, {
    maxOutputLength: Math.min(limit, size),
  }).catch(() => {
    throw new HttpError(422, "The Word document content is invalid.");
  });
}

export function documentName(header) {
  let value;
  try {
    value = decodeURIComponent(header || "");
  } catch {
    throw new HttpError(422, "The uploaded file name is invalid.");
  }
  value = value.split(/[\\/]/).at(-1).trim();
  if (!value || value.length > 180)
    throw new HttpError(422, "The uploaded file name is invalid.");
  return value;
}

export async function validateSpreadsheetArchive(name, buffer) {
  if (!/\.xlsx$/i.test(name))
    throw new HttpError(415, "Select an XLSX workbook.");
  const entries = archiveEntries(buffer, "xl/workbook.xml", true);
  for (const entry of entries) {
    const compressed = buffer.subarray(entry.dataStart, entry.dataEnd);
    const bytes = entry.method === 0
      ? compressed
      : await awaitInflate(compressed, Math.max(1, entry.uncompressedSize), maxExpanded);
    if (bytes.length !== entry.uncompressedSize || crc32(bytes) !== entry.crc)
      throw new HttpError(422, "The workbook content failed integrity checks.");
  }
}

export const classificationInput = z.object({
  fileName: z.string().trim().min(1).max(180),
  rows: z.array(z.record(z.string(), z.unknown())).max(250).optional(),
});
