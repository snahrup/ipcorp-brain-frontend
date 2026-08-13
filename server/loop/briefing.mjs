import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { violatesVoiceRules } from "../activity-reconciliation/voice-writer.mjs";

/**
 * The foreman's briefings. A standup is assembled ONLY from receipts and
 * live board state, cites the receipt ids it was built from, and ships in
 * plain direct prose that passes the same voice scan as everything else.
 * One per day; a failed model means no briefing, never a template.
 */

const BRIEFING_TIMEOUT_MS = 6 * 60_000;

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

export function buildStandupPrompt({ board, shadows, tokens, forDate }) {
  const lanes = board.lanes
    .map((lane) => {
      const cards = (lane.cards || [])
        .slice(0, 12)
        .map(
          (card) =>
            `  - [${card.tone || "ok"}] ${card.kind}: ${card.title}${card.age ? ` (${card.age})` : ""}`
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
    .map((run) => `- ${run.classId} for ${run.workItemId}`)
    .join("\n");

  return `You are the foreman of Steve Nahrup's Workbench loop, writing the
morning standup for ${forDate}. Steve reads this on his phone in one glance.

Rules that decide whether your output is usable:
- Plain, direct, complete sentences. No em dashes, no en dashes. Never the
  words: leverage, robust, streamline, delve, seamless, utilize, canonical,
  deterministic, gating, proposal (say recommended change), brain, or any
  storage path. Patrick Stiller is never shortened.
- Report ONLY what the data below shows. Never invent, never pad. If a
  number is zero, say so plainly. Unverified is reported as unverified.
- Structure, in at most five short sentences: what ran or was watched
  overnight, what is waiting on Steve (lead with reds and their age), what
  was delivered, and source health only if something is down.
- No greeting, no sign-off, no bullet points. Prose only.

BOARD STATE
Sources: ${sources}
${lanes}

SHADOW VERDICTS TODAY (the loop classified, acted on nothing)
${verdicts || "- none yet"}

TOKENS THIS WEEK BY CLASS
${JSON.stringify(tokens)}

Output exactly:
BRIEFING:
<the standup prose>
END BRIEFING`;
}

export function parseBriefing(output) {
  return (
    /BRIEFING:[ \t]*\r?\n([\s\S]*?)END BRIEFING/m.exec(String(output || ""))?.[1]?.trim() || ""
  );
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

  const body = parseBriefing(
    await runModel(buildStandupPrompt({ board, shadows, tokens, forDate }))
  );
  if (!body) throw new Error("The standup model produced no briefing. Nothing was stored.");
  const violation = violatesVoiceRules(body);
  if (violation) {
    throw new Error(`The standup tripped the voice rules ("${violation}"). Nothing was stored.`);
  }

  return ledger.appendBriefing({
    kind: "standup",
    forDate,
    body,
    receiptIds: receipts.map((row) => row.id),
    at: new Date().toISOString(),
  });
}
