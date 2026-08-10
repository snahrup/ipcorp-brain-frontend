const SECRET_KEY_RE =
  /(^|[_-])(token|cookie|password|secret|authorization|auth|credential|api[_-]?key|access[_-]?key|private[_-]?key)$/i;
const MAX_STRING_LENGTH = 4_000;
const MAX_ARRAY_LENGTH = 50;
const MAX_OBJECT_KEYS = 80;

export class WorkbenchAgentError extends Error {
  constructor(status, message, code = "workbench_agent_error", details) {
    super(message);
    this.name = "WorkbenchAgentError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

export function sanitizeForClient(value, seen = new WeakSet()) {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}... [truncated]`
      : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "object") {
    return String(value);
  }
  if (seen.has(value)) {
    return "[circular]";
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeForClient(item, seen));
  }
  const result = {};
  for (const key of Object.keys(value).slice(0, MAX_OBJECT_KEYS)) {
    if (key !== "requestToken" && SECRET_KEY_RE.test(key)) {
      result[key] = "[redacted]";
      continue;
    }
    result[key] = sanitizeForClient(value[key], seen);
  }
  return result;
}

export function okToolResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(sanitizeForClient(value)) }],
  };
}

export function errorPayload(error) {
  if (error instanceof WorkbenchAgentError) {
    return {
      ok: false,
      code: error.code,
      error: error.message,
      details: sanitizeForClient(error.details),
    };
  }
  return {
    ok: false,
    code: "unexpected_error",
    error: error instanceof Error ? error.message : "Unexpected Workbench agent error.",
  };
}

export async function readJsonBody(request, maxBytes = 256 * 1024) {
  let total = 0;
  const chunks = [];
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new WorkbenchAgentError(413, "Request body is too large.", "body_too_large");
    }
    chunks.push(chunk);
  }
  if (!chunks.length) {
    return {};
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new WorkbenchAgentError(400, "Request body must be valid JSON.", "invalid_json");
  }
}

export function sendJson(response, status, payload, origin, allowedOrigins = new Set()) {
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.writeHead(status);
  response.end(JSON.stringify(sanitizeForClient(payload)));
  return true;
}

export function writeNdjson(response, event) {
  response.write(`${JSON.stringify(sanitizeForClient(event))}\n`);
}
