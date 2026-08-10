import { WorkbenchAgentError } from "./protocol.mjs";

const ACTION_KEY_RE = /^[a-z0-9][a-z0-9:._-]{0,100}$/i;

export const AUTO_ACTION_KINDS = new Set([
  "navigate",
  "scroll",
  "focus",
  "open",
  "close",
  "toggle",
  "disclose",
  "fill",
]);

export const REVIEW_ACTION_KINDS = new Set([
  "submit",
  "delete",
  "send",
  "apply",
  "save",
  "external-update",
  "file-change",
  "jira-write",
  "m365-write",
  "notebooklm-generate",
  "notebooklm-download",
  "devspace-edit",
  "devspace-write",
  "devspace-command",
]);

export function normalizeAvailableActions(actions) {
  if (!Array.isArray(actions)) {
    return [];
  }
  return actions.slice(0, 250).map((action) => {
    const key = String(action?.key || "").trim();
    const kind = String(action?.kind || "").trim();
    if (!ACTION_KEY_RE.test(key)) {
      throw new WorkbenchAgentError(400, "Action key is not registered.", "invalid_action_key", {
        key,
      });
    }
    if (!AUTO_ACTION_KINDS.has(kind) && !REVIEW_ACTION_KINDS.has(kind)) {
      throw new WorkbenchAgentError(400, "Action kind is not registered.", "invalid_action_kind", {
        key,
        kind,
      });
    }
    return {
      key,
      kind,
      label: String(action?.label || key).slice(0, 160),
      view: action?.view ? String(action.view).slice(0, 80) : null,
      section: action?.section ? String(action.section).slice(0, 120) : null,
      target: action?.target && typeof action.target === "object" ? action.target : {},
      summary: String(action?.summary || "").slice(0, 500),
    };
  });
}

export function validateSemanticAction(actionKey, availableActions) {
  const key = String(actionKey || "").trim();
  if (!ACTION_KEY_RE.test(key)) {
    throw new WorkbenchAgentError(400, "Action key is malformed.", "invalid_action_key", { key });
  }
  const action = availableActions.find((item) => item.key === key);
  if (!action) {
    throw new WorkbenchAgentError(
      403,
      "Action key was not supplied by the current page.",
      "forged_action",
      {
        key,
      }
    );
  }
  return action;
}

export function classifyAction(action) {
  if (AUTO_ACTION_KINDS.has(action.kind)) {
    return { mode: "auto", reason: "Current page action can run in the browser." };
  }
  if (REVIEW_ACTION_KINDS.has(action.kind)) {
    return { mode: "review", reason: "This action changes data, files, or an external service." };
  }
  return { mode: "deny", reason: "Unknown action kind." };
}

export function summarizeActionForPrompt(actions) {
  return actions.map((action) => ({
    key: action.key,
    kind: action.kind,
    label: action.label,
    view: action.view,
    section: action.section,
    summary: action.summary,
  }));
}
