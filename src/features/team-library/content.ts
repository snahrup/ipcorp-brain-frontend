export type InlineContent =
  | { kind: "text"; value: string }
  | { kind: "strong"; children: InlineContent[] }
  | { kind: "emphasis"; children: InlineContent[] }
  | { kind: "strike"; children: InlineContent[] }
  | { kind: "code"; value: string }
  | { kind: "link"; href: string | null; children: InlineContent[] };

export type MarkdownBlock =
  | { kind: "heading"; level: number; content: InlineContent[] }
  | { kind: "paragraph"; content: InlineContent[] }
  | { kind: "blockquote"; content: InlineContent[] }
  | { kind: "unordered-list"; items: InlineContent[][] }
  | { kind: "ordered-list"; items: InlineContent[][] }
  | { kind: "code"; language: string; value: string }
  | { kind: "table"; headers: InlineContent[][]; rows: InlineContent[][][] }
  | { kind: "rule" };

const inlinePattern =
  /(`+)(.+?)\1|\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|<(https?:\/\/[^>]+|mailto:[^>]+)>|\*([^*\n]+)\*|_([^_\n]+)_/g;

function cleanText(value: string) {
  return value.replace(/\\([\\`*_[\]{}()#+\-.!>|])/g, "$1");
}

export function sanitizeMarkdownHref(href: string) {
  const trimmed = href.trim();
  if (trimmed.startsWith("#")) return trimmed;
  try {
    const url = new URL(trimmed);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? trimmed : null;
  } catch {
    return null;
  }
}

export function parseInlineMarkdown(value: string): InlineContent[] {
  const output: InlineContent[] = [];
  let cursor = 0;
  inlinePattern.lastIndex = 0;
  for (const match of value.matchAll(inlinePattern)) {
    const index = match.index ?? 0;
    if (index > cursor) output.push({ kind: "text", value: cleanText(value.slice(cursor, index)) });

    if (match[2] !== undefined) {
      output.push({ kind: "code", value: match[2] });
    } else if (match[3] !== undefined || match[4] !== undefined) {
      output.push({
        kind: "strong",
        children: parseInlineMarkdown(match[3] ?? match[4]),
      });
    } else if (match[5] !== undefined) {
      output.push({ kind: "strike", children: parseInlineMarkdown(match[5]) });
    } else if (match[6] !== undefined) {
      output.push({
        kind: "link",
        href: sanitizeMarkdownHref(match[7]),
        children: parseInlineMarkdown(match[6]),
      });
    } else if (match[8] !== undefined) {
      output.push({
        kind: "link",
        href: sanitizeMarkdownHref(match[8]),
        children: [{ kind: "text", value: match[8].replace(/^mailto:/, "") }],
      });
    } else {
      output.push({
        kind: "emphasis",
        children: parseInlineMarkdown(match[9] ?? match[10] ?? ""),
      });
    }
    cursor = index + match[0].length;
  }
  if (cursor < value.length) output.push({ kind: "text", value: cleanText(value.slice(cursor)) });
  return output.length ? output : [{ kind: "text", value: "" }];
}

function withoutFrontmatter(input: string) {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") return lines;
  const closing = lines.slice(1).findIndex((line) => line.trim() === "---");
  return closing >= 0 ? lines.slice(closing + 2) : lines;
}

function splitTableRow(line: string) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cell = "";
  let escaped = false;
  for (const character of trimmed) {
    if (escaped) {
      cell += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function isTableDivider(line: string) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function startsBlock(lines: string[], index: number) {
  const line = lines[index] || "";
  const next = lines[index + 1] || "";
  return (
    !line.trim() ||
    /^#{1,6}\s+/.test(line) ||
    /^```/.test(line.trim()) ||
    /^>\s?/.test(line) ||
    /^\s*[-+*]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line) ||
    /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line) ||
    (line.includes("|") && isTableDivider(next))
  );
}

export function parseMarkdown(input: string): MarkdownBlock[] {
  const lines = withoutFrontmatter(input);
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.trim().match(/^```([\w+-]*)\s*$/);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ kind: "code", language: fence[1] || "", value: code.join("\n") });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1].length,
        content: parseInlineMarkdown(heading[2]),
      });
      index += 1;
      continue;
    }

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      index += 1;
      continue;
    }

    if (line.includes("|") && isTableDivider(lines[index + 1] || "")) {
      const headers = splitTableRow(line).map(parseInlineMarkdown);
      const rows: InlineContent[][][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(splitTableRow(lines[index]).map(parseInlineMarkdown));
        index += 1;
      }
      blocks.push({ kind: "table", headers, rows });
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ kind: "blockquote", content: parseInlineMarkdown(quote.join(" ")) });
      continue;
    }

    if (/^\s*[-+*]\s+/.test(line)) {
      const items: InlineContent[][] = [];
      while (index < lines.length && /^\s*[-+*]\s+/.test(lines[index])) {
        items.push(parseInlineMarkdown(lines[index].replace(/^\s*[-+*]\s+/, "")));
        index += 1;
      }
      blocks.push({ kind: "unordered-list", items });
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: InlineContent[][] = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(parseInlineMarkdown(lines[index].replace(/^\s*\d+[.)]\s+/, "")));
        index += 1;
      }
      blocks.push({ kind: "ordered-list", items });
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && !startsBlock(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ kind: "paragraph", content: parseInlineMarkdown(paragraph.join(" ")) });
  }

  return blocks;
}

export interface CsvPreviewData {
  headers: string[];
  rows: string[][];
  truncated: boolean;
}

function parseCsvRows(input: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = input.replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"' && quoted && source[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function parseCsv(input: string, rowLimit = 100): CsvPreviewData {
  const [headerRow = [], ...dataRows] = parseCsvRows(input);
  const columnCount = dataRows.reduce(
    (largest, row) => Math.max(largest, row.length),
    headerRow.length
  );
  const headers = Array.from(
    { length: columnCount },
    (_, index) => headerRow[index] || `Column ${index + 1}`
  );
  return {
    headers,
    rows: dataRows.slice(0, rowLimit),
    truncated: dataRows.length > rowLimit,
  };
}
