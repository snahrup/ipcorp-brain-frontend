import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { stableStringify, WorkbenchAgentError } from "./protocol.mjs";

export const SESSION_COOKIE = "workbench_agent_session";
export const REQUEST_TOKEN_HEADER = "x-workbench-agent-request";

function token(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

function hashReview(toolName, args, target) {
  return createHash("sha256").update(stableStringify({ args, target, toolName })).digest("hex");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseCookies(header) {
  const cookies = {};
  for (const part of String(header || "").split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey) {
      cookies[rawKey] = decodeURIComponent(rawValue.join("="));
    }
  }
  return cookies;
}

export function createOwnerSessionStore(options = {}) {
  const now = options.now || (() => Date.now());
  const ttlMs = options.ttlMs || 8 * 60 * 60 * 1000;
  const reviewTtlMs = options.reviewTtlMs || 10 * 60 * 1000;
  const sessions = new Map();

  function createSession(origin) {
    const id = token();
    const requestToken = token();
    const session = {
      id,
      requestToken,
      origin: origin || "same-origin",
      createdAt: now(),
      expiresAt: now() + ttlMs,
      reviews: new Map(),
    };
    sessions.set(id, session);
    return {
      session,
      cookie: `${SESSION_COOKIE}=${encodeURIComponent(id)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(
        ttlMs / 1000
      )}`,
    };
  }

  function requireSession(request) {
    const cookies = parseCookies(request.headers.cookie);
    const session = sessions.get(cookies[SESSION_COOKIE]);
    if (!session || session.expiresAt <= now()) {
      throw new WorkbenchAgentError(
        401,
        "Owner session is missing or expired.",
        "owner_session_required"
      );
    }
    const requestToken = request.headers[REQUEST_TOKEN_HEADER];
    if (!requestToken || !safeEqual(requestToken, session.requestToken)) {
      throw new WorkbenchAgentError(
        401,
        "Request token is missing or invalid.",
        "request_token_required"
      );
    }
    return session;
  }

  function createReview(session, review) {
    const toolName = String(review.toolName || "").trim();
    if (!toolName) {
      throw new WorkbenchAgentError(400, "A review record needs a tool name.", "invalid_review");
    }
    const id = token(18);
    const record = {
      id,
      sessionId: session.id,
      toolName,
      args: review.args || {},
      target: review.target || {},
      actionKind: review.actionKind || "external-update",
      title: String(review.title || toolName).slice(0, 160),
      summary: String(review.summary || review.title || toolName).slice(0, 500),
      risk: ["low", "medium", "high"].includes(review.risk) ? review.risk : "medium",
      preview: String(review.preview || "").slice(0, 8_000),
      createdAt: now(),
      expiresAt: now() + reviewTtlMs,
      usedAt: null,
      inputHash: hashReview(toolName, review.args || {}, review.target || {}),
    };
    session.reviews.set(id, record);
    return publicReview(record);
  }

  function consumeReview(session, reviewId, toolName, args, target) {
    const record = session.reviews.get(String(reviewId || ""));
    if (!record) {
      throw new WorkbenchAgentError(404, "Review record was not found.", "review_not_found");
    }
    if (record.usedAt) {
      throw new WorkbenchAgentError(409, "Review record was already used.", "review_replay");
    }
    if (record.expiresAt <= now()) {
      throw new WorkbenchAgentError(410, "Review record expired.", "review_expired");
    }
    const checkedToolName = toolName || record.toolName;
    const checkedArgs = args === undefined ? record.args : args;
    const checkedTarget = target === undefined ? record.target : target;
    const nextHash = hashReview(checkedToolName, checkedArgs || {}, checkedTarget || {});
    if (record.toolName !== checkedToolName || !safeEqual(record.inputHash, nextHash)) {
      throw new WorkbenchAgentError(
        409,
        "Confirmed action no longer matches the review.",
        "review_mismatch"
      );
    }
    record.usedAt = now();
    return record;
  }

  return {
    createSession,
    requireSession,
    createReview,
    consumeReview,
    sessionCount: () => sessions.size,
  };
}

export function publicReview(record) {
  return {
    id: record.id,
    toolName: record.toolName,
    actionKind: record.actionKind,
    title: record.title,
    summary: record.summary,
    risk: record.risk,
    preview: record.preview,
    target: record.target,
    createdAt: new Date(record.createdAt).toISOString(),
    expiresAt: new Date(record.expiresAt).toISOString(),
  };
}
