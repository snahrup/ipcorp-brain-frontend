/**
 * A read-only .xlsx reader, values only.
 *
 * This exists instead of a spreadsheet dependency because the Workbench reads exactly
 * one known workbook and needs exactly one thing from it: the text sitting in each
 * cell. The full-featured libraries cost ~95 transitive packages and carry their own
 * advisories, which is a poor trade for four sheets of plain text.
 *
 * What it deliberately does NOT do: styles, formulas (it reads the cached value), date
 * coercion, charts, or anything write-related. A cell holding a formula returns whatever
 * value Excel last cached for it, which is the same thing `data_only=True` gives you in
 * openpyxl. Correctness is pinned against openpyxl in xlsx-reader.test.mjs.
 *
 * Merged cells need no special handling here: Excel stores a merged region's value on
 * its top-left cell and leaves the rest empty, which is exactly the reading this module
 * wants for the workbook's grouped "Project" column.
 */

import { inflateRawSync } from "node:zlib";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;

export class WorkbookReadError extends Error {
  constructor(message) {
    super(message);
    this.name = "WorkbookReadError";
  }
}

/**
 * Locate the End of Central Directory record. It sits at the very end of the file
 * unless there is a trailing comment, so this scans backward over the largest comment
 * the format allows (65535 bytes) rather than assuming a fixed offset.
 */
function findEndOfCentralDirectory(buffer) {
  const earliest = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= earliest; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  throw new WorkbookReadError(
    "This file has no zip end-of-central-directory record, so it is not a readable .xlsx."
  );
}

/**
 * Every entry in the archive, as a map of entry name to its raw bytes.
 *
 * The local header is re-read for each entry rather than trusting the central
 * directory's copy, because the two disagree on extra-field length often enough that
 * using the central value walks you into the middle of the compressed data.
 */
function readZipEntries(buffer) {
  const eocd = findEndOfCentralDirectory(buffer);

  if (eocd >= 20 && buffer.readUInt32LE(eocd - 20) === ZIP64_LOCATOR_SIGNATURE) {
    throw new WorkbookReadError(
      "This workbook is a zip64 archive, which this reader does not handle."
    );
  }

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      throw new WorkbookReadError(
        `The workbook's directory entry ${index + 1} of ${entryCount} is malformed.`
      );
    }

    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);

    if (buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
      throw new WorkbookReadError(`The workbook entry "${name}" has a malformed local header.`);
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);

    if (method === 0) entries.set(name, Buffer.from(raw));
    else if (method === 8) entries.set(name, inflateRawSync(raw));
    else {
      throw new WorkbookReadError(
        `The workbook entry "${name}" uses compression method ${method}, which this reader does not handle.`
      );
    }

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

const NAMED_ENTITIES = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
]);

function decodeXmlText(value) {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    const named = NAMED_ENTITIES.get(body);
    return named === undefined ? match : named;
  });
}

/**
 * Element patterns for the four tags this reader reads.
 *
 * The self-closing branch has to come FIRST in each alternation. An empty-but-styled
 * `<row r="1"/>` or `<c r="B4" s="7"/>` is everywhere in a formatted workbook, and if
 * the open-tag branch is tried first it matches the self-closing tag too, then its lazy
 * body runs forward to the NEXT closing tag and swallows that element's content. The
 * symptom is values silently shifted onto the wrong row, which is exactly the kind of
 * quiet wrongness this module cannot afford.
 */
const ROW_PATTERN = /<row\b([^>]*?)\/>|<row\b([^>]*?)>([\s\S]*?)<\/row>/g;
const CELL_PATTERN = /<c\b([^>]*?)\/>|<c\b([^>]*?)>([\s\S]*?)<\/c>/g;
const SHARED_ITEM_PATTERN = /<si\b([^>]*?)\/>|<si\b([^>]*?)>([\s\S]*?)<\/si>/g;
const TEXT_PATTERN = /<t\b([^>]*?)\/>|<t\b([^>]*?)>([\s\S]*?)<\/t>/g;
const VALUE_PATTERN = /<v\b(?:[^>]*?)>([\s\S]*?)<\/v>/;

/**
 * Concatenate every `<t>` run inside a chunk of XML.
 *
 * A single string may be split across several formatted runs (<r><t>bold</t></r>...),
 * which happens whenever part of a cell is styled differently. The cell's value is the
 * whole sentence, not its first fragment.
 */
function readTextRuns(xml) {
  let value = "";
  for (const piece of xml.matchAll(TEXT_PATTERN)) value += decodeXmlText(piece[3] ?? "");
  return value;
}

/** The shared string table, in index order. */
function readSharedStrings(entries) {
  const xml = entries.get("xl/sharedStrings.xml");
  if (!xml) return [];
  const text = xml.toString("utf8");
  const strings = [];
  for (const item of text.matchAll(SHARED_ITEM_PATTERN)) {
    strings.push(readTextRuns(item[3] ?? ""));
  }
  return strings;
}

/** "BC7" -> 55 (zero-based column index). */
export function columnIndexFromRef(ref) {
  const letters = /^([A-Z]+)/.exec(ref)?.[1];
  if (!letters) return -1;
  let index = 0;
  for (const character of letters) index = index * 26 + (character.charCodeAt(0) - 64);
  return index - 1;
}

/** Sheet name to its part name, resolved through the workbook relationships. */
function readSheetIndex(entries) {
  const workbook = entries.get("xl/workbook.xml")?.toString("utf8");
  const rels = entries.get("xl/_rels/workbook.xml.rels")?.toString("utf8");
  if (!workbook || !rels) {
    throw new WorkbookReadError("This workbook is missing its sheet index.");
  }

  const targetById = new Map();
  for (const rel of rels.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const id = /\bId="([^"]+)"/.exec(rel[1])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(rel[1])?.[1];
    if (!id || !target) continue;
    const normalized = target.replace(/^\/?xl\//, "").replace(/^\//, "");
    targetById.set(id, `xl/${normalized}`);
  }

  const sheets = new Map();
  for (const sheet of workbook.matchAll(/<sheet\b([^>]*)\/>/g)) {
    const name = /\bname="([^"]*)"/.exec(sheet[1])?.[1];
    const relationId = /\br:id="([^"]+)"/.exec(sheet[1])?.[1];
    if (!name || !relationId) continue;
    const part = targetById.get(relationId);
    if (part) sheets.set(decodeXmlText(name), part);
  }
  return sheets;
}

/**
 * One sheet as a dense array of rows, each row a dense array of cell strings.
 *
 * Rows and columns that Excel omitted because they are empty are filled back in, so a
 * caller can index by position without every sheet needing its own gap handling. A cell
 * with no value reads as an empty string, never undefined.
 */
function readSheet(entries, part, sharedStrings) {
  const xml = entries.get(part);
  if (!xml) throw new WorkbookReadError(`The workbook is missing its "${part}" sheet data.`);
  const text = xml.toString("utf8");

  const rows = [];
  let widest = 0;

  for (const row of text.matchAll(ROW_PATTERN)) {
    const attributes = row[1] ?? row[2] ?? "";
    const body = row[3] ?? "";
    const declared = Number.parseInt(/\br="(\d+)"/.exec(attributes)?.[1] ?? "", 10);
    const rowIndex = Number.isFinite(declared) ? declared - 1 : rows.length;

    const cells = [];
    for (const cell of body.matchAll(CELL_PATTERN)) {
      const cellAttributes = cell[1] ?? cell[2] ?? "";
      const cellBody = cell[3] ?? "";
      const ref = /\br="([A-Z]+\d+)"/.exec(cellAttributes)?.[1];
      const type = /\bt="([^"]+)"/.exec(cellAttributes)?.[1] ?? "n";
      const column = ref ? columnIndexFromRef(ref) : cells.length;

      let value = "";
      if (type === "inlineStr") {
        value = readTextRuns(cellBody);
      } else {
        // <v> holds the stored value; for a formula cell that is Excel's cached result,
        // which is the same thing openpyxl's data_only mode returns.
        const stored = VALUE_PATTERN.exec(cellBody)?.[1];
        if (stored !== undefined) {
          if (type === "s") {
            const index = Number.parseInt(stored, 10);
            value = sharedStrings[index] ?? "";
          } else {
            value = decodeXmlText(stored);
          }
        }
      }

      while (cells.length < column) cells.push("");
      cells[column] = value;
    }

    while (rows.length < rowIndex) rows.push([]);
    rows[rowIndex] = cells;
    if (cells.length > widest) widest = cells.length;
  }

  for (const row of rows) while (row.length < widest) row.push("");
  return rows;
}

/**
 * Read a workbook from bytes.
 *
 * Returns { sheetNames, sheets } where `sheets` maps each sheet name to its rows. The
 * order of `sheetNames` is the order the tabs appear in Excel, which the crosswalk
 * relies on to present programs the way a reader sees them in the file itself.
 */
export function readWorkbook(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new WorkbookReadError("The workbook is empty or unreadable.");
  }
  if (buffer.readUInt32LE(0) !== LOCAL_SIGNATURE) {
    throw new WorkbookReadError(
      "This file does not start with a zip header, so it is not a readable .xlsx. A OneDrive placeholder that has not downloaded yet looks like this."
    );
  }

  const entries = readZipEntries(buffer);
  const sharedStrings = readSharedStrings(entries);
  const index = readSheetIndex(entries);

  const sheets = new Map();
  for (const [name, part] of index) sheets.set(name, readSheet(entries, part, sharedStrings));
  return { sheetNames: [...index.keys()], sheets };
}
