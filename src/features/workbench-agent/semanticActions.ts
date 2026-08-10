import type { ViewKey } from "../../lib/search";
import type {
  AgentReviewCard,
  SemanticActionItem,
  SemanticActionKind,
  SemanticActionResult,
  SemanticActionSafety,
} from "./types";

const CONFIRM_WORDS = [
  "submit",
  "delete",
  "remove",
  "send",
  "apply",
  "save",
  "approve",
  "confirm",
  "reconcile",
  "update",
  "publish",
  "process",
  "start run",
];

const DISCLOSE_WORDS = ["open", "close", "expand", "collapse", "show", "hide"];

export type ControlDescriptor = {
  tagName: string;
  role?: string | null;
  type?: string | null;
  label: string;
  disabled?: boolean;
  href?: string | null;
};

type TrackedAction = SemanticActionItem & { element: HTMLElement };
type InventoryExecutor = {
  actions: SemanticActionItem[];
  execute: (key: string, value?: string) => SemanticActionResult;
  confirm: (key: string) => SemanticActionResult;
};

let snapshotCounter = 0;

export function classifyControl(control: ControlDescriptor): {
  kind: SemanticActionKind;
  safety: SemanticActionSafety;
} {
  const label = control.label.toLowerCase();
  const type = (control.type ?? "").toLowerCase();
  const tag = control.tagName.toLowerCase();

  if (tag === "input" || tag === "textarea" || tag === "select") {
    if (type === "checkbox" || type === "radio") {
      return { kind: "disclose", safety: "immediate" };
    }
    if (type === "submit" || CONFIRM_WORDS.some((word) => label.includes(word))) {
      return { kind: "submit", safety: "confirm" };
    }
    return { kind: "fill", safety: "notice" };
  }

  const confirmWord = CONFIRM_WORDS.find((word) => label.includes(word));
  if (confirmWord) {
    return { kind: kindFromConfirmWord(confirmWord), safety: "confirm" };
  }

  if (control.role === "tab" || control.role === "switch") {
    return { kind: "disclose", safety: "immediate" };
  }
  if (tag === "summary") return { kind: "disclose", safety: "immediate" };
  if (tag === "a" || control.href) return { kind: "navigate", safety: "immediate" };
  if (DISCLOSE_WORDS.some((word) => label.includes(word)))
    return { kind: "disclose", safety: "immediate" };
  if (tag === "button" || control.role === "button") {
    return { kind: "apply", safety: "confirm" };
  }
  return { kind: "focus", safety: "immediate" };
}

export function createSemanticActionInventory(
  activeView: ViewKey,
  root: ParentNode = document
): InventoryExecutor {
  const snapshotId = `wa-${Date.now().toString(36)}-${snapshotCounter++}`;
  const tracked = new Map<string, TrackedAction>();
  const controls = Array.from(
    root.querySelectorAll<HTMLElement>(
      "button, a[href], input, textarea, select, summary, [role='button'], [role='tab'], [role='switch'], [tabindex]"
    )
  ).filter(isVisibleControl);

  const actions = controls.slice(0, 80).map((element, index) => {
    const descriptor = describeControl(element);
    const classified = classifyControl(descriptor);
    const item: SemanticActionItem = {
      key: opaqueActionKey(snapshotId, index, descriptor.label),
      view: activeView,
      role: descriptor.role ?? descriptor.tagName.toLowerCase(),
      label: descriptor.label,
      kind: classified.kind,
      safety: classified.safety,
      region: nearestRegionLabel(element),
      disabled: descriptor.disabled ?? false,
    };
    tracked.set(item.key, { ...item, element });
    return item;
  });

  return {
    actions,
    execute: (key, value) => executeTrackedAction(tracked, key, value),
    confirm: (key) => executeTrackedAction(tracked, key, undefined, true),
  };
}

export function isStaleActionKey(actions: SemanticActionItem[], key: string) {
  return !actions.some((action) => action.key === key);
}

function executeTrackedAction(
  tracked: Map<string, TrackedAction>,
  key: string,
  value?: string,
  confirmed = false
): SemanticActionResult {
  const action = tracked.get(key);
  if (!action) {
    return {
      ok: false,
      reason: "stale",
      message: "That page action is no longer available. I refreshed the action list.",
    };
  }
  if (action.disabled) {
    return {
      ok: false,
      reason: "blocked",
      message: "That control is disabled on the current page.",
    };
  }
  if (!action.element.isConnected || !isVisibleControl(action.element)) {
    return {
      ok: false,
      reason: "stale",
      message: "That control is no longer visible on the current page.",
    };
  }
  if (action.safety === "confirm" && !confirmed) {
    return {
      ok: true,
      needsReview: true,
      message: "This needs review before anything changes.",
      review: createReviewForAction(action),
    };
  }

  if (action.kind === "fill") {
    if (typeof value !== "string") {
      return {
        ok: false,
        reason: "invalid",
        message: "That field needs a value before I can fill it.",
      };
    }
    fillElement(action.element, value);
    return {
      ok: true,
      message: `Filled ${action.label}. Review the field before submitting.`,
    };
  }

  if (action.kind === "scroll" || action.kind === "focus") {
    focusElement(action.element);
    return { ok: true, message: `Focused ${action.label}.` };
  }

  action.element.click();
  return { ok: true, message: `Used ${action.label}.` };
}

function createReviewForAction(action: SemanticActionItem): AgentReviewCard {
  return {
    id: `local:${action.key}`,
    title: `Review ${action.label}`,
    summary: "This control can change Workbench data or an external service.",
    risk: action.kind === "delete" || action.kind === "send" ? "high" : "medium",
    target: action.region,
    preview: [`Page: ${action.view}`, `Action: ${action.kind}`, `Control: ${action.label}`],
  };
}

function kindFromConfirmWord(word: string): SemanticActionKind {
  if (word === "delete" || word === "remove") return "delete";
  if (word === "send" || word === "publish") return "send";
  if (word === "apply" || word === "approve" || word === "confirm" || word === "reconcile") {
    return "apply";
  }
  if (word === "save" || word === "update") return "save";
  if (word === "process" || word === "start run") return "external-update";
  return "submit";
}

function describeControl(element: HTMLElement): ControlDescriptor {
  const input = element as HTMLInputElement;
  const tagName = element.tagName.toLowerCase();
  return {
    tagName,
    role: element.getAttribute("role"),
    type: input.type,
    label: controlLabel(element),
    disabled:
      element.hasAttribute("disabled") ||
      element.getAttribute("aria-disabled") === "true" ||
      input.disabled === true,
    href: element instanceof HTMLAnchorElement ? element.href : null,
  };
}

function controlLabel(element: HTMLElement): string {
  const aria = element.getAttribute("aria-label")?.trim();
  if (aria) return cleanLabel(aria);
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean)
      .join(" ");
    if (text) return cleanLabel(text);
  }
  const text = element.textContent?.trim();
  if (text) return cleanLabel(text);
  const title = element.getAttribute("title")?.trim();
  if (title) return cleanLabel(title);
  const placeholder = (element as HTMLInputElement).placeholder?.trim();
  if (placeholder) return cleanLabel(placeholder);
  return `${element.tagName.toLowerCase()} control`;
}

function cleanLabel(value: string) {
  return value.replace(/\s+/g, " ").slice(0, 120);
}

function nearestRegionLabel(element: HTMLElement) {
  const region = element.closest<HTMLElement>(
    "section, article, aside, nav, main, [role='region']"
  );
  if (!region) return undefined;
  const aria = region.getAttribute("aria-label")?.trim();
  if (aria) return cleanLabel(aria);
  const heading = region.querySelector("h1, h2, h3")?.textContent?.trim();
  return heading ? cleanLabel(heading) : undefined;
}

function isVisibleControl(element: HTMLElement) {
  if (element.closest("[aria-hidden='true'], [hidden], .workbench-agent")) return false;
  if (element.getAttribute("tabindex") === "-1") return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function focusElement(element: HTMLElement) {
  element.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
  if (!element.hasAttribute("tabindex") && !isNaturallyFocusable(element)) {
    element.setAttribute("tabindex", "-1");
  }
  element.focus({ preventScroll: true });
}

function fillElement(element: HTMLElement, value: string) {
  const input = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  setNativeValue(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  focusElement(element);
}

function setNativeValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string
) {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  if (!setter) element.value = value;
}

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

function isNaturallyFocusable(element: HTMLElement) {
  return /^(a|button|input|textarea|select|summary)$/i.test(element.tagName);
}

function opaqueActionKey(snapshotId: string, index: number, label: string) {
  return `${snapshotId}-${index.toString(36)}-${hashLabel(label)}`;
}

function hashLabel(value: string) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
