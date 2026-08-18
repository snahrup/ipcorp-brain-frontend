// The notify group: adding the two people who actually get emailed.
//
// Patrick Stiller and Dominique Mathers both have alerts configured on their
// side, so becoming a watcher means every comment, status change and update on
// that ticket reaches their inbox. That is why this is a deliberate one-click
// action rather than something that happens when a ticket is created. Watchers
// added early train both of them to ignore the alerts, and a notification
// nobody reads is worse than none at all.
//
// Because the whole point is that Steve knows they were told, this module
// never fails quietly. An unresolvable name, an ambiguous match or a rejected
// write is reported by name.

/**
 * Account ids are stable, so a known one is used directly. A missing one is
 * resolved by display name at call time rather than guessed at, and Patrick is
 * not assignable on this project (only three people are), so he will not
 * appear in the assignable list and has to come from a user search.
 */
export const NOTIFY_GROUP = [
  {
    name: "Patrick Stiller",
    // Resolved live on 2026-08-18. He is not assignable on this project, so a
    // name search is the only way to find him; pinning the id skips that.
    accountId:
      process.env.JIRA_WATCHER_PATRICK_ACCOUNT_ID || "557058:73c68783-606a-412c-89fa-502eddc13439",
  },
  {
    name: "Dominique Mathers",
    accountId:
      process.env.JIRA_WATCHER_DOMINIQUE_ACCOUNT_ID ||
      "712020:e9809320-35bb-4dd1-93df-69e1285f4f9c",
  },
];

export async function resolveWatcherAccounts(group, { search }) {
  const resolved = [];
  for (const person of group) {
    if (person.accountId) {
      resolved.push({ name: person.name, accountId: person.accountId });
      continue;
    }
    const candidates = await search(person.name);
    const matches = (Array.isArray(candidates) ? candidates : []).filter(
      (user) =>
        user?.active !== false &&
        String(user?.displayName || "").toLowerCase() === person.name.toLowerCase()
    );
    if (matches.length === 0) {
      throw new Error(
        `Could not find an active Jira account for ${person.name}, so nobody was added. Set their account id and try again.`
      );
    }
    if (matches.length > 1) {
      throw new Error(
        `Jira returned more than one active account named ${person.name}. Pick one and set the account id rather than guessing.`
      );
    }
    resolved.push({ name: person.name, accountId: matches[0].accountId });
  }
  return resolved;
}

export async function addWatchers(issueKey, people, { post, existing = [] }) {
  const watching = new Set(
    (Array.isArray(existing) ? existing : []).map((watcher) => watcher?.accountId).filter(Boolean)
  );
  const added = [];
  const alreadyWatching = [];
  const failed = [];
  for (const person of people) {
    if (watching.has(person.accountId)) {
      alreadyWatching.push(person.name);
      continue;
    }
    try {
      await post(issueKey, person.accountId);
      added.push(person.name);
    } catch (cause) {
      failed.push({
        name: person.name,
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }
  return { added, alreadyWatching, failed };
}
