import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { violatesVoiceRules } from "../activity-reconciliation/voice-writer.mjs";

/**
 * The foreman's briefings. A standup is assembled ONLY from receipts and
 * live board state, cites the receipt ids it was built from, and ships in
 * plain direct language that passes the same voice scan as everything else.
 * One per day; a failed model means no briefing, never a template.
 *
 * Steve reads this on a phone and will not read a paragraph, so the primary
 * output is a headline plus a few terse items split into what he has to do
 * and what merely happened. Every word is still written by the model from
 * real state: there is no assembly of prose in this file, and an item the
 * model cannot produce is dropped rather than filled in. The prose body
 * stays for anything that cannot render a list.
 */

const BRIEFING_TIMEOUT_MS = 6 * 60_000;

// A scannable item stops being scannable the moment it becomes a sentence,
// so the length limits are enforced rather than suggested.
const MAX_ITEMS = 8;
const MAX_ITEM_CHARS = 60;
const MAX_HEADLINE_CHARS = 90;
const ITEM_GROUPS = new Set(["act", "happened"]);

// The shared scan covers the standing banned list. "Proposal" is banned in
// anything a person reads here for the same reason it is banned on the board:
// to Steve a proposal is an RFP submission, and this is a recommended change.
const STANDUP_EXTRA_BANNED = ["proposal"];

function localDay(now) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function promptFile() {
  return join(
    process.env.LOCALAPPDATA || join(process.env.USERPROFILE || ".", "AppData", "Local"),
    "IPCorpBrain",
    "loop",
    `standup-prompt.${process.pid}.${Date.now()}.md`
  );
}

function standupVoiceViolation(text) {
  const shared = violatesVoiceRules(text);
  if (shared) return shared;
  const lowered = String(text || "").toLowerCase();
  for (const word of STANDUP_EXTRA_BANNED) {
    if (lowered.includes(word)) return word;
  }
  return null;
}

export function buildStandupPrompt({ board, shadows, tokens, forDate }) {
  const lanes = board.lanes
    .map((lane) => {
      const cards = (lane.cards || [])
        .slice(0, 12)
        .map(
          (card) =>
            `  - [${card.tone || "ok"}] ${card.kind} | ref: ${card.id} | ${card.age || "no age"} | ${card.title}`
        )
        .join("\n");
      return `${lane.label} (${(lane.cards || []).length})\n${cards || "  - empty"}`;
    })
    .join("\n");
  const sources = board.sources
    .map((s) => `${s.label}: ${s.ok ? "readable" : `DOWN, ${s.detail}`}`)
    .join("; ");
  const verdicts = shadows
    .slice(0, 20)
    .map((run) => `- ${run.classId} for ${run.workItemId} (${run.verification || "unverified"})`)
    .join("\n");

  return `You are the foreman of Steve Nahrup's Workbench loop, writing the
morning standup for ${forDate}. Steve reads this on his phone in one glance
and will not read a paragraph. The short scannable list is the product.

Rules that decide whether your output is usable:
- Plain, direct words. No em dashes, no en dashes. Never the words: leverage,
  robust, streamline, delve, seamless, utilize, canonical, deterministic,
  gating, proposal (say recommended change), brain, or any storage path.
  Patrick Stiller is never shortened.
- Report ONLY what the data below shows. Never invent, never pad. If nothing
  belongs in the list, return an empty list. Zero is a real answer.
- A run the data marks unverified is reported unverified.

Write three parts.

1. HEADLINE. One line, at most ${MAX_HEADLINE_CHARS} characters: the single
   thing Steve should know before reading anything else.

2. ITEMS. A JSON array, at most ${MAX_ITEMS} entries, each entry an object:
   {"group":"act"|"happened","text":"...","count":<number or null>,
    "verification":"verified"|"unverified","ref":"<a ref value or null>"}
   - group "act" means Steve has to do something about it. group "happened"
     means it only happened; he does not have to act.
   - text is a fragment of a few words, at most ${MAX_ITEM_CHARS} characters,
     no trailing period. Write "Draft to Taylor Perez stalled 2 days", not
     "There is a draft to Taylor Perez that has been sitting for two days."
   - count is the number that makes the entry scan, or null when the entry
     has no number.
   - verification is "verified" when the entry restates something present in
     the state below, and "unverified" when nothing has checked the outcome.
   - ref copies one ref value from the board below EXACTLY when the entry is
     about that one card, and is null otherwise. Never invent a ref value: an
     entry whose ref does not match a real card is thrown away.
   - Order act entries first, reds first, oldest first.

3. BRIEFING. At most two short sentences of prose, for places that cannot
   render a list.

BOARD STATE
Sources: ${sources}
${lanes}

SHADOW VERDICTS TODAY (the loop classified, acted on nothing)
${verdicts || "- none yet"}

TOKENS THIS WEEK BY CLASS
${JSON.stringify(tokens)}

Output exactly:
HEADLINE:
<one line>
END HEADLINE
ITEMS:
<the JSON array>
END ITEMS
BRIEFING:
<the two sentences>
END BRIEFING`;
}

export function parseBriefing(output) {
  return (
    /BRIEFING:[ \t]*\r?\n([\s\S]*?)END BRIEFING/m.exec(String(output || ""))?.[1]?.trim() || ""
  );
}

export function parseHeadline(output) {
  const raw =
    /HEADLINE:[ \t]*\r?\n([\s\S]*?)END HEADLINE/m.exec(String(output || ""))?.[1]?.trim() || "";
  // A wrapped headline is still one headline; collapsing the whitespace is
  // not rewriting it, and it keeps a soft wrap from failing the length rule.
  return raw.replace(/\s+/g, " ").trim();
}

function unfence(text) {
  return String(text)
    .replace(/^```[a-z]*[ \t]*\r?\n?/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

/**
 * Returns the raw array the model emitted, or null when it emitted no usable
 * block at all. The difference matters: an empty array is a real answer
 * ("nothing waits on you"), a missing block is a model failure and must never
 * be allowed to read as an empty morning.
 */
export function parseItemsBlock(output) {
  const block = /ITEMS:[ \t]*\r?\n([\s\S]*?)END ITEMS/m.exec(String(output || ""))?.[1];
  if (block === undefined) return null;
  const trimmed = unfence(block);
  if (!trimmed) return null;
  try {
    const value = JSON.parse(trimmed);
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Keeps only entries that are terse, correctly grouped, and either point at a
 * card that really exists on today's board or claim no source at all. The
 * reference is rebuilt from the board card itself, in the same {type, id,
 * label, href} the card carries, so what an item points at is read off real
 * state rather than taken from the model. Returns the kept items and how many
 * were dropped, because a silent drop is the same lie as a fabrication.
 */
export function normalizeStandupItems(rawItems, cardsById) {
  const items = [];
  let dropped = 0;
  for (const raw of rawItems) {
    if (items.length >= MAX_ITEMS) {
      dropped += 1;
      continue;
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      dropped += 1;
      continue;
    }
    const group = String(raw.group || "")
      .trim()
      .toLowerCase();
    const text = String(raw.text || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!ITEM_GROUPS.has(group) || !text || text.length > MAX_ITEM_CHARS) {
      dropped += 1;
      continue;
    }

    let ref = null;
    const rawRef = raw.ref === null || raw.ref === undefined ? "" : String(raw.ref).trim();
    if (rawRef) {
      const card = cardsById.get(rawRef);
      // A reference the board cannot resolve means the entry is not grounded
      // in state anyone can open, so the entry goes rather than the link.
      if (!card) {
        dropped += 1;
        continue;
      }
      const pointer =
        card.reference && typeof card.reference.type === "string" ? card.reference : null;
      ref = {
        cardId: card.id,
        type: pointer?.type || "none",
        id: String(pointer?.id || ""),
        label: String(pointer?.label || ""),
        href: pointer?.href || null,
      };
    }

    const countValue = Number(raw.count);
    const count =
      raw.count === null ||
      raw.count === undefined ||
      raw.count === "" ||
      !Number.isFinite(countValue)
        ? null
        : Math.max(0, Math.round(countValue));

    items.push({
      group,
      text,
      count,
      // Anything that does not explicitly claim a checked outcome reads as
      // unverified, which is the honest direction to default.
      verification: raw.verification === "verified" ? "verified" : "unverified",
      ref,
    });
  }
  return { items, dropped };
}

function runBriefingModel(prompt) {
  return new Promise((resolvePromise, reject) => {
    const file = promptFile();
    mkdir(dirname(file), { recursive: true })
      .then(() => writeFile(file, prompt, "utf8"))
      .then(() => {
        const child = spawn(
          "claude",
          ["-p", `@${file}`, "--model", "opus", "--output-format", "text"],
          {
            shell: true,
            windowsHide: true,
          }
        );
        let out = "";
        let err = "";
        const timer = setTimeout(() => {
          child.kill();
          reject(new Error("Standup writing timed out."));
        }, BRIEFING_TIMEOUT_MS);
        child.stdout.on("data", (chunk) => {
          out += chunk.toString();
        });
        child.stderr.on("data", (chunk) => {
          err += chunk.toString();
        });
        child.on("error", (cause) => {
          clearTimeout(timer);
          reject(cause);
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          if (code === 0) resolvePromise(out);
          else reject(new Error(`Standup writing exited ${code}: ${err.slice(-300)}`));
        });
      })
      .catch(reject);
  });
}

export async function assembleStandup({ ledger, board, now, runModel = runBriefingModel }) {
  const forDate = localDay(now instanceof Date ? now : new Date(now));

  const existing = await ledger.latestBriefing("standup");
  if (existing && existing.forDate === forDate) return existing;

  const runs = await ledger.runsWithVerification();
  const shadows = runs.filter(
    (run) => run.state === "shadow" && String(run.startedAt).slice(0, 10) === forDate
  );
  const receipts = shadows.length
    ? (await Promise.all(shadows.map((run) => ledger.receiptsForRun(run.id)))).flat()
    : [];
  const tokens = await ledger.tokensByClass({
    since: new Date(Date.now() - 7 * 24 * 3_600_000).toISOString(),
  });

  const output = await runModel(buildStandupPrompt({ board, shadows, tokens, forDate }));
  const body = parseBriefing(output);
  const headline = parseHeadline(output);
  const rawItems = parseItemsBlock(output);

  if (!body) throw new Error("The standup model produced no briefing. Nothing was stored.");
  if (!headline) throw new Error("The standup model produced no headline. Nothing was stored.");
  if (headline.length > MAX_HEADLINE_CHARS) {
    throw new Error(
      `The standup headline ran to ${headline.length} characters, past the ${MAX_HEADLINE_CHARS} a glance allows. Nothing was stored.`
    );
  }
  if (!rawItems) {
    throw new Error("The standup model produced no scannable items. Nothing was stored.");
  }

  const cardsById = new Map();
  for (const lane of board.lanes || []) {
    for (const card of lane.cards || []) cardsById.set(card.id, card);
  }
  const { items, dropped } = normalizeStandupItems(rawItems, cardsById);

  // The scan reaches every string a person will read, not only the paragraph.
  for (const text of [headline, body, ...items.map((item) => item.text)]) {
    const violation = standupVoiceViolation(text);
    if (violation) {
      throw new Error(`The standup tripped the voice rules ("${violation}"). Nothing was stored.`);
    }
  }

  return ledger.appendBriefing({
    kind: "standup",
    forDate,
    headline,
    items,
    itemsDropped: dropped,
    body,
    receiptIds: receipts.map((row) => row.id),
    at: new Date().toISOString(),
  });
}
