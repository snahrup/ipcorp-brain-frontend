export function findSectionTarget(key: string, label: string, root: ParentNode = document) {
  const candidates = getSectionTargetCandidates(key, label);

  for (const candidate of candidates) {
    const direct = findByExactAttributes(candidate, root) ?? findByText(candidate, root);
    const target = direct ? usefulRegionFor(direct) : null;
    if (target && !isInsideAgent(target)) return target;
  }

  return null;
}

export async function waitForSectionTarget(
  key: string,
  label: string,
  timeoutMs = 2000
): Promise<HTMLElement | null> {
  const startedAt = performance.now();
  while (performance.now() - startedAt <= timeoutMs) {
    const target = findSectionTarget(key, label, activeViewRoot());
    if (target) return target;
    await animationFrame();
  }
  return null;
}

function activeViewRoot(): ParentNode {
  const frames = document.querySelectorAll<HTMLElement>(".view-frame");
  return frames.item(frames.length - 1) ?? document.querySelector(".wb-workspace") ?? document;
}

function findByExactAttributes(candidate: string, root: ParentNode) {
  const escaped = cssEscape(candidate);
  const selectors = [
    `[data-workbench-section='${escaped}']`,
    `[data-section='${escaped}']`,
    `[data-testid='${escaped}']`,
    `[aria-label='${escaped}']`,
    `#${escaped}`,
    `.${escaped}`,
  ];

  for (const selector of selectors) {
    const target = root.querySelector<HTMLElement>(selector);
    if (target && !isInsideAgent(target)) return target;
  }

  return null;
}

function findByText(candidate: string, root: ParentNode) {
  const normalized = normalize(candidate);
  if (!normalized) return null;
  const targets = Array.from(
    root.querySelectorAll<HTMLElement>(
      "h1, h2, h3, h4, [role='heading'], [role='tab'], [aria-label], button, a, strong, summary"
    )
  );
  return (
    targets.find((target) => {
      if (isInsideAgent(target)) return false;
      const text = normalize(target.textContent);
      const aria = normalize(target.getAttribute("aria-label"));
      if (text === normalized || aria === normalized) return true;
      return normalized.length >= 6 && (text.includes(normalized) || aria.includes(normalized));
    }) ?? null
  );
}

function usefulRegionFor(target: HTMLElement) {
  if (isUsefulRegion(target)) return target;
  return (
    target.closest<HTMLElement>(
      "section, article, main, aside, nav, [role='region'], [role='tabpanel'], [aria-label]"
    ) ?? target
  );
}

function isUsefulRegion(target: HTMLElement) {
  return (
    /^(section|article|main|aside|nav)$/i.test(target.tagName) ||
    Boolean(
      target.getAttribute("role") === "region" ||
        target.getAttribute("role") === "tabpanel" ||
        target.getAttribute("aria-label")
    )
  );
}

export function getSectionTargetCandidates(key: string, label: string) {
  const plainLabel = label.replace(/[.!?]+$/, "");
  return unique([
    label,
    plainLabel,
    key,
    key.replace(/-/g, " "),
    key.replace(/-/g, "_"),
    plainLabel.toLowerCase().replace(/\s+/g, "-"),
    plainLabel.toLowerCase().replace(/\s+/g, "_"),
  ]);
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function isInsideAgent(target: Element) {
  return Boolean(target.closest(".workbench-agent"));
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function animationFrame() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

function cssEscape(value: string) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
