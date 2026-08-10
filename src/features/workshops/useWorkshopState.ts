import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CURRENT_MATRIX,
  DEEP_QS,
  DOM_FIELDS,
  DOMAINS,
  MX_GROUP_ORDER,
  PARK_SEEDS,
  RACI,
  SUGGEST,
  SUGGEST_WAVES,
  WAVE_META,
  WAVE_ORDER,
} from "./data";
import type { Domain, DomainField, MatrixRow, WaveKey, WorkshopState } from "./types";

export const LS_KEY = "ipc-domain-ownership-workshop-v2";
export const STAGE_COUNT = 8;
export const SLIDE_COUNT = 11;

let parkSeq = 0;
function parkId() {
  parkSeq += 1;
  return `park-${Date.now().toString(36)}-${parkSeq}`;
}

function freshState(): WorkshopState {
  const waves: Record<string, WaveKey> = {};
  for (const domain of DOMAINS) waves[domain.key] = domain.wave;
  return {
    step: 0,
    slide: 0,
    guide: false,
    fields: {},
    raci: {},
    waves,
    tension: "",
    park: [],
    checks: {},
    matrix: CURRENT_MATRIX.map((row) => ({ ...row })),
    person: "",
    openDom: "",
    deepOpen: {},
    gloss: "",
    timerSec: 0,
  };
}

function loadState(): WorkshopState {
  const base = freshState();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<WorkshopState>;
    const merged: WorkshopState = { ...base, ...saved };
    // A session saved before a domain existed would otherwise leave it unplaced.
    for (const domain of DOMAINS) {
      if (!merged.waves[domain.key]) merged.waves[domain.key] = domain.wave;
    }
    if (!Array.isArray(merged.matrix)) merged.matrix = base.matrix;
    // Sessions saved before items carried an id still need one to render.
    merged.park = (merged.park || []).map((item) => (item.id ? item : { ...item, id: parkId() }));
    return merged;
  } catch {
    // A corrupt or blocked store must not take the session down with it.
    return base;
  }
}

/** Every field a domain carries, including the extra seats some domains add. */
export function domainFields(domain: Domain): DomainField[] {
  return domain.extra ? [...DOM_FIELDS, ...domain.extra] : DOM_FIELDS;
}

export function useWorkshopState() {
  const [state, setState] = useState<WorkshopState>(loadState);
  const [timerRun, setTimerRun] = useState(false);
  const [toast, setToast] = useState("");
  const [toastOn, setToastOn] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const hydrated = useRef(false);
  useEffect(() => {
    // The first pass is just what we read back, so writing it again would be noise.
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {
      // Storage can be full or blocked; the session still works in memory.
    }
  }, [state]);

  useEffect(() => {
    if (!timerRun) return;
    const id = window.setInterval(() => {
      setState((s) => ({ ...s, timerSec: s.timerSec + 1 }));
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRun]);

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    []
  );

  const say = useCallback((message: string) => {
    setToast(message);
    setToastOn(true);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastOn(false), 2400);
  }, []);

  const patch = useCallback((next: Partial<WorkshopState>) => {
    setState((s) => ({ ...s, ...next }));
  }, []);

  const setField = useCallback((key: string, value: string) => {
    setState((s) => ({ ...s, fields: { ...s.fields, [key]: value } }));
  }, []);

  const toggleCheck = useCallback((key: string) => {
    setState((s) => ({ ...s, checks: { ...s.checks, [key]: !s.checks[key] } }));
  }, []);

  const setRaci = useCallback((row: number, verdict: "yes" | "flag") => {
    setState((s) => {
      const current = s.raci[row] || {};
      const next =
        current.a === verdict ? { ...current, a: undefined } : { ...current, a: verdict };
      return { ...s, raci: { ...s.raci, [row]: next } };
    });
  }, []);

  const setRaciNote = useCallback((row: number, note: string) => {
    setState((s) => ({
      ...s,
      raci: { ...s.raci, [row]: { ...(s.raci[row] || { a: "flag" }), note } },
    }));
  }, []);

  const updateRow = useCallback((index: number, key: keyof MatrixRow, value: string) => {
    setState((s) => {
      const matrix = s.matrix.map((row, i) => (i === index ? { ...row, [key]: value } : row));
      return { ...s, matrix };
    });
  }, []);

  const addRow = useCallback((dom: string) => {
    setState((s) => ({
      ...s,
      matrix: [...s.matrix, { dom, co: "", sme: "", steward: "", owner: "", ba: "" }],
    }));
  }, []);

  const removeRow = useCallback((index: number) => {
    setState((s) => ({ ...s, matrix: s.matrix.filter((_, i) => i !== index) }));
  }, []);

  const moveWave = useCallback((domainKey: string, direction: -1 | 1) => {
    setState((s) => {
      const current = WAVE_ORDER.indexOf(s.waves[domainKey]);
      const next = Math.max(0, Math.min(WAVE_ORDER.length - 1, current + direction));
      return { ...s, waves: { ...s.waves, [domainKey]: WAVE_ORDER[next] } };
    });
  }, []);

  const restoreMatrix = useCallback(() => {
    if (!window.confirm("Restore the roster to the state captured from the spreadsheet?")) return;
    setState((s) => ({ ...s, matrix: CURRENT_MATRIX.map((row) => ({ ...row })) }));
    say("Roster restored to the captured version");
  }, [say]);

  const applyWaves = useCallback(() => {
    setState((s) => ({ ...s, waves: { ...s.waves, ...SUGGEST_WAVES } }));
    say("Recommended waves applied");
  }, [say]);

  const applyRaciAll = useCallback(() => {
    setState((s) => {
      const raci = { ...s.raci };
      for (let i = 0; i < RACI.length; i += 1) {
        if (!raci[i]?.a) raci[i] = { ...(raci[i] || {}), a: "yes" };
      }
      return { ...s, raci };
    });
    say("Every row marked agreed. Flag any row that needs a change.");
  }, [say]);

  /** Drafts only ever fill an empty field; the room's own wording always wins. */
  const applyAllDrafts = useCallback(() => {
    setState((s) => {
      const fields = { ...s.fields };
      for (const [key, suggestion] of Object.entries(SUGGEST)) {
        if (!(fields[key] || "").trim()) fields[key] = suggestion.v;
      }
      return { ...s, fields };
    });
    say("Draft answers applied to the empty fields");
  }, [say]);

  const seedPark = useCallback(() => {
    setState((s) => {
      const existing = new Set(s.park.map((item) => item.text));
      const additions = PARK_SEEDS.filter((item) => !existing.has(item.text)).map((item) => ({
        ...item,
        id: parkId(),
      }));
      return { ...s, park: [...s.park, ...additions] };
    });
    say("Known open items added");
  }, [say]);

  const addPark = useCallback(
    (text: string, type: "q" | "r" | "a", who: string) => {
      if (!text.trim()) return;
      setState((s) => ({
        ...s,
        park: [...s.park, { id: parkId(), text: text.trim(), type, who: who.trim() }],
      }));
      say("Item parked");
    },
    [say]
  );

  const removePark = useCallback((index: number) => {
    setState((s) => ({ ...s, park: s.park.filter((_, i) => i !== index) }));
  }, []);

  const resetAll = useCallback(() => {
    if (!window.confirm("Reset the whole session on this device?")) return;
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      // Nothing to clear if storage is unavailable.
    }
    setState(freshState());
    setTimerRun(false);
    say("Session reset");
  }, [say]);

  /** A domain is named once one row carries both seats. Company scope needs an owner only. */
  const isNamed = useCallback(
    (domainKey: string) => {
      const domain = DOMAINS.find((d) => d.key === domainKey);
      return state.matrix.some(
        (row) =>
          row.dom === domainKey &&
          row.owner.trim() &&
          (domain?.noSteward ? true : row.steward.trim())
      );
    },
    [state.matrix]
  );

  const firstWave = useMemo(
    () => DOMAINS.filter((domain) => state.waves[domain.key] === "1"),
    [state.waves]
  );

  const progress = useMemo(() => {
    let done = 0;
    let total = 0;
    const count = (ok: boolean) => {
      total += 1;
      if (ok) done += 1;
    };
    for (const domain of DOMAINS) {
      for (const field of domainFields(domain)) {
        if (field.req) count(Boolean(state.fields[`d.${domain.key}.${field.k}`]?.trim()));
      }
      count(Boolean(state.fields[`d.${domain.key}.defcall`]?.trim()));
    }
    for (let i = 0; i < RACI.length; i += 1) count(Boolean(state.raci[i]?.a));
    count(Boolean(state.checks["waves.agreed"]));
    count(Boolean(state.tension));
    for (const domain of firstWave) count(isNamed(domain.key));
    for (const key of ["frame.slate", "frame.defs", "frame.order", "frame.handoff"]) {
      count(Boolean(state.checks[key]));
    }
    for (const domain of firstWave) {
      count(Boolean(state.checks[`commit.${domain.key}.owner`]));
      if (!domain.noSteward) count(Boolean(state.checks[`commit.${domain.key}.steward`]));
    }
    count(state.park.length > 0 && state.park.every((item) => item.who.trim()));
    return total ? Math.round((done / total) * 100) : 0;
  }, [state, firstWave, isNamed]);

  /** Per-stage completeness for the rail dots: done, partial, or untouched. */
  const stageStatus = useCallback(
    (index: number): "done" | "partial" | "empty" => {
      const ratio = (done: number, total: number) =>
        done === 0 ? "empty" : done >= total ? "done" : "partial";
      if (index === 0) {
        const keys = ["frame.slate", "frame.defs", "frame.order", "frame.handoff"];
        return ratio(keys.filter((k) => state.checks[k]).length, keys.length);
      }
      if (index === 1) {
        const done = RACI.filter((_, i) => state.raci[i]?.a).length;
        return ratio(done, RACI.length);
      }
      if (index === 2) {
        return ratio((state.checks["waves.agreed"] ? 1 : 0) + (state.tension ? 1 : 0), 2);
      }
      if (index === 3) {
        const done = firstWave.filter((d) => isNamed(d.key)).length;
        return ratio(done, Math.max(1, firstWave.length));
      }
      if (index === 4) {
        let done = 0;
        let total = 0;
        for (const domain of DOMAINS) {
          for (const field of domainFields(domain)) {
            if (!field.req) continue;
            total += 1;
            if (state.fields[`d.${domain.key}.${field.k}`]?.trim()) done += 1;
          }
          total += 1;
          if (state.fields[`d.${domain.key}.defcall`]?.trim()) done += 1;
        }
        return ratio(done, total);
      }
      if (index === 5) {
        let done = 0;
        let total = 0;
        for (const domain of firstWave) {
          total += 1;
          if (state.checks[`commit.${domain.key}.owner`]) done += 1;
          if (!domain.noSteward) {
            total += 1;
            if (state.checks[`commit.${domain.key}.steward`]) done += 1;
          }
        }
        return ratio(done, Math.max(1, total));
      }
      if (index === 6) {
        if (!state.park.length) return "empty";
        return state.park.every((item) => item.who.trim()) ? "done" : "partial";
      }
      return ratio((state.checks["frame.handoff"] ? 1 : 0) + (progress >= 100 ? 1 : 0), 2);
    },
    [state, firstWave, isNamed, progress]
  );

  return {
    state,
    patch,
    setField,
    toggleCheck,
    setRaci,
    setRaciNote,
    updateRow,
    addRow,
    removeRow,
    moveWave,
    restoreMatrix,
    applyWaves,
    applyRaciAll,
    applyAllDrafts,
    seedPark,
    addPark,
    removePark,
    resetAll,
    isNamed,
    firstWave,
    progress,
    stageStatus,
    timerRun,
    setTimerRun,
    toast,
    toastOn,
    say,
  };
}

export type WorkshopController = ReturnType<typeof useWorkshopState>;

export function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((word) => word[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function download(name: string, text: string, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(anchor.href), 4000);
}

/** The read-back everyone leaves with. Empty fields stay out of it. */
export function buildSummary(state: WorkshopState, isNamed: (key: string) => boolean) {
  const lines: string[] = [];
  const firstWave = DOMAINS.filter((d) => state.waves[d.key] === "1");
  const named = firstWave.filter((d) => isNamed(d.key));

  lines.push("# Domain Ownership Workshop, results");
  lines.push(`_Captured ${new Date().toLocaleString()}_`);
  lines.push("");
  lines.push(
    `**First-wave roster: ${named.length} of ${firstWave.length} domains have an owner and a steward named.**`
  );
  lines.push("");

  lines.push("## Order of precedence");
  for (const wave of WAVE_ORDER) {
    const names = DOMAINS.filter((d) => state.waves[d.key] === wave).map((d) => d.name);
    if (names.length) lines.push(`- **${WAVE_META[wave].label}:** ${names.join(", ")}`);
  }
  lines.push(`- Order agreed by the room: ${state.checks["waves.agreed"] ? "yes" : "not yet"}`);
  lines.push(`- Sales phasing: ${state.tension || "unresolved"}`);
  lines.push("");

  lines.push("## Roster");
  for (const key of MX_GROUP_ORDER) {
    const domain = DOMAINS.find((d) => d.key === key);
    const rows = state.matrix.filter((row) => row.dom === key);
    if (!domain || !rows.length) continue;
    lines.push("");
    lines.push(`### ${domain.name}  ·  ${WAVE_META[state.waves[key]].label}`);
    lines.push("| Company | SME | Data Steward | Data Owner | Business Analyst |");
    lines.push("|---|---|---|---|---|");
    for (const row of rows) {
      lines.push(
        `| ${row.co || "not set"} | ${row.sme || "not set"} | ${row.steward || "not set"} | ${row.owner || "not set"} | ${row.ba || "not set"} |`
      );
    }
  }
  lines.push("");

  lines.push("## What each domain means");
  for (const key of MX_GROUP_ORDER) {
    const domain = DOMAINS.find((d) => d.key === key);
    if (!domain) continue;
    const body: string[] = [];
    for (const field of domainFields(domain)) {
      const value = state.fields[`d.${domain.key}.${field.k}`]?.trim();
      if (value) body.push(`- **${field.label}:** ${value}`);
    }
    const decision = state.fields[`d.${domain.key}.defcall`]?.trim();
    if (decision) {
      const assigned = state.checks[`assign.${domain.key}`]
        ? " _(assigned to the owner as their first approval item)_"
        : "";
      body.push(`- **Definition decision:** ${decision}${assigned}`);
    }
    const deep = DEEP_QS.map((question, i) => ({
      question,
      value: state.fields[`deep.${domain.key}.${i}`]?.trim(),
    })).filter((entry) => entry.value);
    if (deep.length) {
      body.push("- **Deep dive:**");
      for (const entry of deep) body.push(`  - ${entry.question}: ${entry.value}`);
    }
    if (body.length) {
      lines.push("");
      lines.push(`### ${domain.name}`);
      lines.push(...body);
    }
  }
  lines.push("");

  lines.push("## Role model verdicts");
  const agreed = RACI.filter((_, i) => state.raci[i]?.a === "yes").length;
  lines.push(`- ${agreed} of ${RACI.length} activities agreed as drafted.`);
  const flagged = RACI.map((row, i) => ({ row, verdict: state.raci[i] })).filter(
    (entry) => entry.verdict?.a === "flag"
  );
  if (flagged.length) {
    lines.push("");
    for (const entry of flagged) {
      lines.push(`- **${entry.row[0]}:** flagged, ${entry.verdict?.note || "no note"}`);
    }
  }
  lines.push("");

  lines.push("## Commitments acknowledged");
  const commitments: string[] = [];
  for (const domain of DOMAINS) {
    if (state.checks[`commit.${domain.key}.owner`]) {
      commitments.push(`- ${domain.name}, owner candidate briefed`);
    }
    if (state.checks[`commit.${domain.key}.steward`]) {
      commitments.push(`- ${domain.name}, steward candidate briefed`);
    }
  }
  lines.push(commitments.length ? commitments.join("\n") : "- none recorded");
  lines.push("");

  lines.push("## Parking lot");
  const labels: Record<string, string> = { q: "Question", r: "Risk", a: "Action" };
  if (state.park.length) {
    for (const item of state.park) {
      const who = item.who ? `, owner: ${item.who}` : ", no owner yet";
      const src = item.src ? ` (${item.src})` : "";
      lines.push(`- [${labels[item.type]}] ${item.text}${who}${src}`);
    }
  } else {
    lines.push("- empty");
  }
  lines.push("");
  lines.push("---");
  lines.push(
    "_How this session works: we bring a proposal and the room amends it. Owners and stewards validate coverage rather than designing from a blank page (ADR-0009)._"
  );
  return lines.join("\n");
}
