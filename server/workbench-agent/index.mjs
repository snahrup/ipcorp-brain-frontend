import { createHash } from "node:crypto";
import { classifyAction, normalizeAvailableActions, validateSemanticAction } from "./actions.mjs";
import {
  assertInsideRoot,
  createDevSpaceAdapter,
  createNotebookLmAdapter,
  createWorkbenchAdapter,
} from "./adapters.mjs";
import {
  DEFAULT_SECTIONS,
  destinationRegistry,
  normalizeDestination as normalizeDestinationStrict,
  VIEW_KEYS,
} from "./destinations.mjs";
import { stableStringify } from "./protocol.mjs";
import { createWorkbenchAgentRouter } from "./routes.mjs";
import { executeConfirmedReview, permissionForTool, runAgentTurn } from "./sdk-runner.mjs";
import { createOwnerSessionStore, REQUEST_TOKEN_HEADER, SESSION_COOKIE } from "./sessions.mjs";

const CONFIRMATION_TTL_MS = 10 * 60 * 1000;
let compatibilityNow = Date.now();
const compatibilityStore = createOwnerSessionStore({
  now: () => compatibilityNow,
  reviewTtlMs: CONFIRMATION_TTL_MS,
});
const destinationAliases = new Map([
  ["team library", "library"],
  ["library", "library"],
  ["closeout", "meeting-wrap-up"],
  ["meeting closeout", "meeting-wrap-up"],
  ["daily prep", "daily-prep"],
]);

export function stableJson(value) {
  return stableStringify(value);
}

export function hashArgs(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function normalizeDestination(value) {
  if (typeof value === "object" && value) {
    return normalizeDestinationStrict(value);
  }
  const key = String(value || "")
    .trim()
    .toLowerCase();
  const view = destinationAliases.get(key) || (VIEW_KEYS.includes(key) ? key : null);
  return view
    ? { view, section: null, label: view, availableSections: DEFAULT_SECTIONS[view] || [] }
    : null;
}

export function normalizeSection(destination, section) {
  const view = destination?.view;
  const value = String(section || "").trim();
  return DEFAULT_SECTIONS[view]?.includes(value) ? value : null;
}

export function normalizeRepoPath(value) {
  try {
    return assertInsideRoot(value);
  } catch {
    return null;
  }
}

export function createSession(now) {
  if (Number.isFinite(now)) {
    compatibilityNow = now;
  }
  const { session } = compatibilityStore.createSession();
  return session;
}

export function validateSession(request) {
  const token =
    request.headers?.["x-workbench-agent-token"] || request.headers?.[REQUEST_TOKEN_HEADER];
  try {
    return compatibilityStore.requireSession({
      headers: {
        cookie: request.headers?.cookie || "",
        [REQUEST_TOKEN_HEADER]: token,
      },
    });
  } catch {
    return null;
  }
}

export function createConfirmation(session, toolName, args, title, receipts = []) {
  return compatibilityStore.createReview(session, {
    toolName,
    args,
    target: { receipts },
    title,
    preview: receipts.join("\n"),
  });
}

export function verifyConfirmation(session, id, toolName, args, now) {
  try {
    if (Number.isFinite(now)) {
      compatibilityNow = now;
    }
    compatibilityStore.consumeReview(session, id, toolName, args, { receipts: [] });
    return { ok: true };
  } catch (error) {
    const codeMap = {
      review_expired: "confirmation_expired",
      review_mismatch: "confirmation_mismatch",
      review_replay: "confirmation_replayed",
    };
    return { ok: false, code: codeMap[error.code] || error.code || "confirmation_failed" };
  }
}

export function classifyToolPermission(toolName, input = {}) {
  return permissionForTool(toolName, input);
}

export { WorkbenchAgentError } from "./protocol.mjs";
export {
  classifyAction,
  createDevSpaceAdapter,
  createNotebookLmAdapter,
  createOwnerSessionStore,
  createWorkbenchAdapter,
  createWorkbenchAgentRouter,
  destinationRegistry,
  executeConfirmedReview,
  normalizeAvailableActions,
  REQUEST_TOKEN_HEADER,
  runAgentTurn,
  SESSION_COOKIE,
  VIEW_KEYS,
  validateSemanticAction,
};
export const __test = { CONFIRMATION_TTL_MS, SESSION_COOKIE };
