import { createHash } from "node:crypto";

export const ADF_VERSION = 1;

export const REQUIRED_DESCRIPTION_SECTIONS = Object.freeze([
  Object.freeze({ key: "objective", title: "Objective" }),
  Object.freeze({ key: "context", title: "Context" }),
  Object.freeze({ key: "approachActivities", title: "Approach/Activities" }),
  Object.freeze({ key: "decisionOutcome", title: "Decision/Outcome" }),
  Object.freeze({ key: "acceptanceCriteria", title: "Acceptance Criteria" }),
]);

const INLINE_NODE_TYPES = new Set([
  "text",
  "inlineCard",
  "hardBreak",
  "mention",
  "emoji",
  "date",
  "status",
]);

const FORBIDDEN_TOOL_WORDING = [
  /\bAI\b/i,
  /\bartificial intelligence\b/i,
  /\bClaude(?:\s+Code)?\b/i,
  /\bCodex\b/i,
  /\bChatGPT\b/i,
  /\bCopilot\b/i,
  /\bCursor\b/i,
  /\bWindsurf\b/i,
  /\blarge language model\b/i,
  /\bLLM\b/i,
  /\bAI[- ](?:generated|assisted|powered)\b/i,
  /\b(?:generated|written|produced)\s+by\s+(?:an?\s+)?(?:AI|agent|assistant|bot)\b/i,
  /\bYouTube\b/i,
  /\btutorials?\b/i,
  /\bcourses?\b/i,
  /\b(?:watched|watching)\s+(?:a\s+)?videos?\b/i,
];

const UNSUPPORTED_MEETING_WORDING =
  /\b(?:meeting|stand-?up|workshop|conference call|sync(?:ed)?\s+with|met\s+with)\b/i;
const UNSUPPORTED_PARTICIPANT_WORDING = [
  /\b(?:we|our|ours|ourselves|us)\b/i,
  /\b(?:the|our)\s+team\b/i,
  /\b(?:met|spoke|talked|discussed|worked|paired|reviewed|walked through|agreed|aligned|coordinated)\s+with\b/i,
  /\b(?:confirmed|requested|provided|approved|reviewed)\s+by\s+[A-Z][a-z]+\b/,
  /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:confirmed|said|asked|agreed|reviewed|joined|provided|approved)\b/,
];
const MARKDOWN_STRUCTURE = /^\s{0,3}(?:#{1,6}\s|[-*+]\s|\d+[.)]\s)/m;
const FIRST_PERSON = /\b(?:I|I'm|I've|I'd|I'll|my|mine|myself|me)\b/i;
const FIRST_PERSON_ELLIPSIS =
  /^(?:Started|Built|Reviewed|Verified|Worked|Found|Got|Mapped|Tested|Documented|Compared|Traced|Confirmed|Reconciled|Updated|Implemented|Configured|Analyzed|Studied|Designed|Created|Completed|Moved|Pivoted|Validated|Scoped|Finished)\b/i;
const JIRA_ISSUE_URL = /^https:\/\/ip-corporation\.atlassian\.net\/browse\/MT-\d+(?:[?#].*)?$/i;
const PLAIN_MARKER_PATTERN = /^\[mdm-op:([a-f0-9]{32})\]$/;
const ZERO_WIDTH_PREFIX = "\u2063";
const ZERO_WIDTH_SUFFIX = "\u2064";
const ZERO_BIT = "\u200b";
const ONE_BIT = "\u200c";

function requireNonEmptyString(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new TypeError(`${label} must be a non-empty string.`);
  return text;
}

function flattenOneLevel(values) {
  const flattened = [];
  for (const value of values) {
    if (Array.isArray(value)) flattened.push(...value);
    else flattened.push(value);
  }
  return flattened;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertInlineNode(node, label = "Inline content") {
  if (!isObject(node) || !INLINE_NODE_TYPES.has(node.type)) {
    throw new TypeError(`${label} must contain native ADF inline nodes or text values.`);
  }
  return node;
}

function assertBlockNode(node, label = "Block content") {
  if (!isObject(node) || typeof node.type !== "string" || node.type === "doc") {
    throw new TypeError(`${label} must contain native ADF block nodes.`);
  }
  return node;
}

function normalizeInlineContent(values) {
  return flattenOneLevel(values).map((value) => {
    if (typeof value === "string" || typeof value === "number") return adfText(String(value));
    return assertInlineNode(value);
  });
}

function normalizeListItem(item, label) {
  if (typeof item === "string" || typeof item === "number") {
    return { type: "listItem", content: [adfParagraph(String(item))] };
  }

  if (isObject(item) && item.type === "listItem") return item;
  if (isObject(item) && item.type === "paragraph") {
    return { type: "listItem", content: [item] };
  }
  if (Array.isArray(item)) {
    const blocks = item.map((block) => assertBlockNode(block, label));
    if (blocks.length === 0) throw new TypeError(`${label} cannot be empty.`);
    return { type: "listItem", content: blocks };
  }

  throw new TypeError(`${label} must be text, a paragraph, a listItem, or an array of ADF blocks.`);
}

function normalizeCell(cell, cellType, label) {
  if (isObject(cell) && cell.type === cellType) return cell;

  let content;
  if (typeof cell === "string" || typeof cell === "number") {
    content = [adfParagraph(String(cell))];
  } else if (isObject(cell) && cell.type === "paragraph") {
    content = [cell];
  } else if (Array.isArray(cell)) {
    content = cell.map((block) => assertBlockNode(block, label));
  } else {
    throw new TypeError(`${label} must be text, a paragraph, or an array of ADF blocks.`);
  }

  if (content.length === 0) throw new TypeError(`${label} cannot be empty.`);
  return { type: cellType, content };
}

function normalizeSectionBlocks(value, title) {
  if (typeof value === "string" || typeof value === "number") {
    return [adfParagraph(String(value))];
  }

  if (isObject(value) && Array.isArray(value.blocks)) {
    if (value.blocks.length === 0) throw new TypeError(`${title} cannot be empty.`);
    return value.blocks.map((block) => assertBlockNode(block, title));
  }

  if (isObject(value) && value.type !== "doc") return [assertBlockNode(value, title)];
  if (Array.isArray(value)) {
    if (value.length === 0) throw new TypeError(`${title} cannot be empty.`);
    return value.map((block) => assertBlockNode(block, title));
  }

  throw new TypeError(
    `${title} must be text, a native ADF block, an array of native ADF blocks, or { blocks }.`
  );
}

function canonicalize(value, inArray = false) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("Operation marker input cannot contain non-finite numbers.");
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === "undefined") return inArray ? null : undefined;
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry, true));
  if (!isObject(value)) {
    throw new TypeError("Operation marker input must be JSON-compatible.");
  }

  const normalized = {};
  for (const key of Object.keys(value).sort()) {
    const child = canonicalize(value[key], false);
    if (child !== undefined) normalized[key] = child;
  }
  return normalized;
}

function plainOperationMarker(operationIdentity) {
  const identity =
    typeof operationIdentity === "string"
      ? requireNonEmptyString(operationIdentity, "operationIdentity")
      : canonicalize(operationIdentity);
  if (isObject(identity) && Object.keys(identity).length === 0) {
    throw new TypeError("operationIdentity cannot be an empty object.");
  }
  const digest = createHash("sha256")
    .update(JSON.stringify({ namespace: "ipcorp-mdm-reconcile", identity }))
    .digest("hex")
    .slice(0, 32);
  return `[mdm-op:${digest}]`;
}

function encodeInvisible(value) {
  const bytes = Buffer.from(value, "utf8");
  let encoded = ZERO_WIDTH_PREFIX;
  for (const byte of bytes) {
    for (let bit = 7; bit >= 0; bit -= 1) {
      encoded += byte & (1 << bit) ? ONE_BIT : ZERO_BIT;
    }
  }
  return `${encoded}${ZERO_WIDTH_SUFFIX}`;
}

function decodeInvisible(value) {
  if (
    typeof value !== "string" ||
    !value.startsWith(ZERO_WIDTH_PREFIX) ||
    !value.endsWith(ZERO_WIDTH_SUFFIX)
  ) {
    return null;
  }
  const payload = value.slice(ZERO_WIDTH_PREFIX.length, -ZERO_WIDTH_SUFFIX.length);
  if (!payload || /[^\u200b\u200c]/u.test(payload) || payload.length % 8 !== 0) return null;

  const bytes = [];
  for (let offset = 0; offset < payload.length; offset += 8) {
    let byte = 0;
    for (const bit of payload.slice(offset, offset + 8)) {
      byte = (byte << 1) | (bit === ONE_BIT ? 1 : 0);
    }
    bytes.push(byte);
  }
  return Buffer.from(bytes).toString("utf8");
}

function textValues(node, values = []) {
  if (node == null) return values;
  if (Array.isArray(node)) {
    for (const child of node) textValues(child, values);
    return values;
  }
  if (!isObject(node)) return values;
  if (node.type === "text" && typeof node.text === "string") values.push(node.text);
  if (Array.isArray(node.content)) textValues(node.content, values);
  return values;
}

function normalizeRelatedIssueUrls(urls) {
  if (!Array.isArray(urls)) throw new TypeError("relatedIssueUrls must be an array.");
  const unique = [];
  const seen = new Set();
  for (const value of urls) {
    const url = requireNonEmptyString(value, "Related Jira issue URL");
    if (!JIRA_ISSUE_URL.test(url)) {
      throw new TypeError(`Related Jira issue URL is outside the MT board: ${url}`);
    }
    const normalized = url.replace(/[?#].*$/, "");
    if (!seen.has(normalized)) {
      seen.add(normalized);
      unique.push(normalized);
    }
  }
  return unique;
}

function assertSteveNarrative(narrative, evidence) {
  if (narrative.includes("—")) {
    throw new TypeError("Jira comments cannot contain em dashes.");
  }
  if (MARKDOWN_STRUCTURE.test(narrative)) {
    throw new TypeError("Jira comments must be flowing paragraphs, not headers or lists.");
  }
  for (const pattern of FORBIDDEN_TOOL_WORDING) {
    if (pattern.test(narrative)) {
      throw new TypeError(
        "Jira comments cannot mention AI, private tools, tutorials, or automated authorship."
      );
    }
  }

  if (UNSUPPORTED_MEETING_WORDING.test(narrative) && evidence?.meetingVerified !== true) {
    throw new TypeError("Meeting claims require explicit supporting evidence.");
  }
  if (
    UNSUPPORTED_PARTICIPANT_WORDING.some((pattern) => pattern.test(narrative)) &&
    evidence?.participantClaimsVerified !== true
  ) {
    throw new TypeError(
      "Participant or collaborative claims require explicit supporting evidence."
    );
  }
  if (!FIRST_PERSON.test(narrative) && !FIRST_PERSON_ELLIPSIS.test(narrative)) {
    throw new TypeError("Jira comments must use Steve's first-person conversational voice.");
  }
}

export function isNativeAdfDocument(value) {
  return (
    isObject(value) &&
    value.type === "doc" &&
    value.version === ADF_VERSION &&
    Array.isArray(value.content)
  );
}

export function adfDoc(content) {
  if (!Array.isArray(content) || content.length === 0) {
    throw new TypeError("ADF document content must be a non-empty array.");
  }
  return {
    version: ADF_VERSION,
    type: "doc",
    content: content.map((block) => assertBlockNode(block, "ADF document content")),
  };
}

export function adfText(value, { strong = false, emphasis = false } = {}) {
  const node = { type: "text", text: requireNonEmptyString(value, "ADF text") };
  const marks = [];
  if (strong) marks.push({ type: "strong" });
  if (emphasis) marks.push({ type: "em" });
  if (marks.length > 0) node.marks = marks;
  return node;
}

export function adfStrong(value) {
  return adfText(value, { strong: true });
}

export function adfEmphasis(value) {
  return adfText(value, { emphasis: true });
}

export function adfParagraph(...content) {
  const normalized = normalizeInlineContent(content);
  if (normalized.length === 0) throw new TypeError("ADF paragraphs cannot be empty.");
  return { type: "paragraph", content: normalized };
}

export function adfHeading(level, ...content) {
  if (!Number.isInteger(level) || level < 1 || level > 6) {
    throw new TypeError("ADF heading level must be an integer from 1 through 6.");
  }
  const normalized = normalizeInlineContent(content);
  if (normalized.length === 0) throw new TypeError("ADF headings cannot be empty.");
  return { type: "heading", attrs: { level }, content: normalized };
}

export function adfBulletList(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new TypeError("ADF bullet lists require at least one item.");
  }
  return {
    type: "bulletList",
    content: items.map((item, index) => normalizeListItem(item, `Bullet item ${index + 1}`)),
  };
}

export function adfOrderedList(items, { order = 1 } = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new TypeError("ADF ordered lists require at least one item.");
  }
  if (!Number.isInteger(order) || order < 1) {
    throw new TypeError("ADF ordered list order must be a positive integer.");
  }
  return {
    type: "orderedList",
    attrs: { order },
    content: items.map((item, index) => normalizeListItem(item, `Ordered item ${index + 1}`)),
  };
}

export function adfTable({ headers, rows }) {
  if (!Array.isArray(headers) || headers.length === 0) {
    throw new TypeError("ADF tables require at least one header.");
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new TypeError("ADF tables require at least one data row.");
  }

  const width = headers.length;
  const tableRows = [
    {
      type: "tableRow",
      content: headers.map((header, index) =>
        normalizeCell(header, "tableHeader", `Table header ${index + 1}`)
      ),
    },
  ];

  for (const [rowIndex, row] of rows.entries()) {
    if (!Array.isArray(row) || row.length !== width) {
      throw new TypeError(`Table row ${rowIndex + 1} must contain exactly ${width} cells.`);
    }
    tableRows.push({
      type: "tableRow",
      content: row.map((cell, cellIndex) =>
        normalizeCell(cell, "tableCell", `Table row ${rowIndex + 1}, cell ${cellIndex + 1}`)
      ),
    });
  }

  return { type: "table", content: tableRows };
}

export function adfCodeBlock(code, { language } = {}) {
  const node = {
    type: "codeBlock",
    content: [{ type: "text", text: requireNonEmptyString(code, "ADF code block") }],
  };
  if (language != null && String(language).trim())
    node.attrs = { language: String(language).trim() };
  return node;
}

export function adfInlineCard(url) {
  const normalized = requireNonEmptyString(url, "ADF inline card URL");
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new TypeError(`ADF inline card URL is invalid: ${normalized}`);
  }
  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new TypeError("ADF inline card URL must use HTTP or HTTPS.");
  }
  return { type: "inlineCard", attrs: { url: normalized } };
}

export function preserveNativeAdf(existingAdf, replacementAdf, { replace = false } = {}) {
  if (existingAdf != null && !isNativeAdfDocument(existingAdf)) {
    throw new TypeError("existingAdf must be a native ADF v1 document.");
  }
  if (existingAdf != null && replace !== true) return existingAdf;
  if (!isNativeAdfDocument(replacementAdf)) {
    throw new TypeError("replacementAdf must be a native ADF v1 document.");
  }
  return replacementAdf;
}

export function buildIssueDescription({
  existingAdf = null,
  replaceExisting = false,
  sections = null,
  objective,
  context,
  approachActivities,
  decisionOutcome,
  acceptanceCriteria,
} = {}) {
  if (existingAdf != null && !isNativeAdfDocument(existingAdf)) {
    throw new TypeError("existingAdf must be a native ADF v1 document.");
  }
  if (existingAdf != null && replaceExisting !== true) return existingAdf;

  const values = {
    objective,
    context,
    approachActivities,
    decisionOutcome,
    acceptanceCriteria,
    ...(isObject(sections) ? sections : {}),
  };
  const content = [];
  for (const { key, title } of REQUIRED_DESCRIPTION_SECTIONS) {
    if (values[key] == null) throw new TypeError(`${title} is required.`);
    content.push(adfHeading(2, title), ...normalizeSectionBlocks(values[key], title));
  }
  return adfDoc(content);
}

export function createOperationMarker(operationIdentity, { mode = "plain" } = {}) {
  const plain = plainOperationMarker(operationIdentity);
  if (mode === "plain") return plain;
  if (mode === "invisible") return encodeInvisible(plain);
  throw new TypeError('Operation marker mode must be "plain" or "invisible".');
}

export function hasOperationMarker(adf, operationIdentity, { mode = "any" } = {}) {
  if (!isNativeAdfDocument(adf)) return false;
  const plain = plainOperationMarker(operationIdentity);
  const invisible = encodeInvisible(plain);
  const values = textValues(adf);
  if (mode === "plain") return values.includes(plain);
  if (mode === "invisible") return values.includes(invisible);
  if (mode !== "any")
    throw new TypeError('Operation marker mode must be "plain", "invisible", or "any".');
  return values.some(
    (value) => value === plain || value === invisible || decodeInvisible(value) === plain
  );
}

export function buildSteveComment({
  narrative,
  relatedIssueUrls = [],
  operationIdentity,
  markerMode = "invisible",
  evidence = {},
  existingAdf = null,
  replaceExisting = false,
} = {}) {
  if (existingAdf != null && !isNativeAdfDocument(existingAdf)) {
    throw new TypeError("existingAdf must be a native ADF v1 document.");
  }
  if (existingAdf != null && replaceExisting !== true) return existingAdf;

  const factualNarrative = requireNonEmptyString(narrative, "narrative");
  assertSteveNarrative(factualNarrative, evidence);
  const relatedUrls = normalizeRelatedIssueUrls(relatedIssueUrls);
  const marker = createOperationMarker(operationIdentity, { mode: markerMode });

  const content = factualNarrative
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => adfParagraph(paragraph.replace(/\s*\r?\n\s*/g, " ").trim()));

  if (relatedUrls.length > 0) {
    const relatedContent = [adfText("This connects directly to ")];
    for (const [index, url] of relatedUrls.entries()) {
      if (index > 0) {
        relatedContent.push(adfText(index === relatedUrls.length - 1 ? " and " : ", "));
      }
      relatedContent.push(adfInlineCard(url));
    }
    relatedContent.push(adfText("."));
    content.push(adfParagraph(relatedContent));
  }

  content.push(adfParagraph({ type: "text", text: marker }));
  return adfDoc(content);
}

export function isPlainOperationMarker(value) {
  return typeof value === "string" && PLAIN_MARKER_PATTERN.test(value);
}
