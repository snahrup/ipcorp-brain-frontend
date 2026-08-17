// Foreman Briefing ranking. Track FB-1.
// Spec: docs/brainstorm/2026-08-17-foreman-briefing-spec.md section 4.
// Deterministic on purpose: the caller supplies today's date; nothing in here
// reads a clock, so the same inputs always produce the same briefing.

const DAY_MS = 86_400_000;
const EXCLUDE_NOT_STEVE = "next-actor-not-steve";

function dayNumber(isoDate) {
  const parsed = Date.parse(`${String(isoDate).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed / DAY_MS);
}

function nextDay(isoDate) {
  const num = dayNumber(isoDate);
  return new Date((num + 1) * DAY_MS).toISOString().slice(0, 10);
}

// Signal precedence, compared lexicographically. Lower tuple sorts first.
function rankKey(candidate, todayNum) {
  const deadlineNum = candidate.deadline ? dayNumber(candidate.deadline) : null;
  const deadlineDistance = deadlineNum === null ? Number.POSITIVE_INFINITY : deadlineNum - todayNum;
  const meeting =
    typeof candidate.meetingProximityMinutes === "number"
      ? candidate.meetingProximityMinutes
      : Number.POSITIVE_INFINITY;
  return [
    deadlineDistance,
    meeting,
    candidate.directRequest ? 0 : 1,
    -(candidate.sourceCount ?? 1),
    candidate.priorityMatch ? 0 : 1,
    -(candidate.owedReplyAgeDays ?? -1),
  ];
}

function compareKeys(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

export function rankItems(candidates, options = {}) {
  if (!options.today) {
    throw new Error("rankItems requires options.today (YYYY-MM-DD); it never guesses the date");
  }
  const todayNum = dayNumber(options.today);
  if (todayNum === null) {
    throw new Error(`rankItems received an unreadable today value: ${options.today}`);
  }
  const cap = options.cap ?? 5;

  const exclusions = [];
  const eligible = [];
  for (const candidate of candidates) {
    if (String(candidate.nextActor ?? "").toLowerCase() !== "steve") {
      exclusions.push({
        id: candidate.id,
        reason: EXCLUDE_NOT_STEVE,
        nextActor: candidate.nextActor ?? null,
      });
      continue;
    }
    eligible.push(candidate);
  }

  const sorted = eligible
    .map((candidate) => ({ candidate, key: rankKey(candidate, todayNum) }))
    .sort((a, b) => {
      const byKey = compareKeys(a.key, b.key);
      if (byKey !== 0) return byKey;
      return a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0;
    })
    .map((entry) => entry.candidate);

  const selected = sorted.slice(0, cap);
  const parked = sorted.slice(cap).map((candidate) => ({
    id: candidate.id,
    returnAt: nextDay(options.today),
    wakeOnActivity: true,
  }));

  return { selected, parked, exclusions };
}
