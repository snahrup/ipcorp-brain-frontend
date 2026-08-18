// Adding the two people who get notified, in one click.
//
// Patrick Stiller and Dominique Mathers both have email alerts configured on
// their side, so being a watcher means every comment and status change reaches
// their inbox. That is exactly why this is a deliberate button and not
// something that happens when a ticket is created: watchers added too early
// train both of them to ignore the alerts, and then the mechanism is worth
// nothing when it matters.
//
// The rule that follows from that: this either adds everyone in the group or
// it tells you who it could not add. A silent partial success would mean Steve
// believes Patrick was notified when he was not.

import assert from "node:assert/strict";
import { test } from "node:test";
import { addWatchers, NOTIFY_GROUP, resolveWatcherAccounts } from "./jira-watchers.mjs";

test("the group is the two people who have alerts configured, and nobody else", () => {
  assert.deepEqual(
    NOTIFY_GROUP.map((person) => person.name),
    ["Patrick Stiller", "Dominique Mathers"]
  );
});

test("a known account id is used as is, with no lookup", async () => {
  let searches = 0;
  const resolved = await resolveWatcherAccounts(
    [{ name: "Dominique Mathers", accountId: "712020:abc" }],
    {
      search: async () => {
        searches += 1;
        return [];
      },
    }
  );
  assert.deepEqual(resolved, [{ name: "Dominique Mathers", accountId: "712020:abc" }]);
  assert.equal(searches, 0);
});

test("an unknown account is looked up by name", async () => {
  const resolved = await resolveWatcherAccounts([{ name: "Patrick Stiller", accountId: null }], {
    search: async (query) => {
      assert.equal(query, "Patrick Stiller");
      return [
        { accountId: "712020:pat", displayName: "Patrick Stiller", active: true },
        { accountId: "712020:other", displayName: "Patricia Stone", active: true },
      ];
    },
  });
  assert.deepEqual(resolved, [{ name: "Patrick Stiller", accountId: "712020:pat" }]);
});

test("an inactive account is never used", async () => {
  await assert.rejects(
    () =>
      resolveWatcherAccounts([{ name: "Patrick Stiller", accountId: null }], {
        search: async () => [
          { accountId: "712020:old", displayName: "Patrick Stiller", active: false },
        ],
      }),
    /Patrick Stiller/
  );
});

test("a name that cannot be resolved fails loudly, never quietly", async () => {
  await assert.rejects(
    () =>
      resolveWatcherAccounts([{ name: "Patrick Stiller", accountId: null }], {
        search: async () => [],
      }),
    /Patrick Stiller/,
    "Steve has to know Patrick was not added"
  );
});

test("two people who match the same name are ambiguous, not a coin flip", async () => {
  await assert.rejects(
    () =>
      resolveWatcherAccounts([{ name: "Patrick Stiller", accountId: null }], {
        search: async () => [
          { accountId: "a", displayName: "Patrick Stiller", active: true },
          { accountId: "b", displayName: "Patrick Stiller", active: true },
        ],
      }),
    /more than one/i
  );
});

test("adding reports each person, and one failure does not hide the others", async () => {
  const posted = [];
  const result = await addWatchers(
    "MT-500",
    [
      { name: "Patrick Stiller", accountId: "a" },
      { name: "Dominique Mathers", accountId: "b" },
    ],
    {
      post: async (key, accountId) => {
        posted.push([key, accountId]);
        if (accountId === "b") throw new Error("Jira said no");
      },
    }
  );
  assert.deepEqual(posted, [
    ["MT-500", "a"],
    ["MT-500", "b"],
  ]);
  assert.deepEqual(result.added, ["Patrick Stiller"]);
  assert.equal(result.failed.length, 1);
  assert.match(result.failed[0].error, /Jira said no/);
});

test("already watching is a success, not an error", async () => {
  const result = await addWatchers("MT-500", [{ name: "Dominique Mathers", accountId: "b" }], {
    post: async () => {},
    existing: [{ accountId: "b", displayName: "Dominique Mathers" }],
  });
  assert.deepEqual(result.alreadyWatching, ["Dominique Mathers"]);
  assert.deepEqual(result.added, []);
});
