// Ticket references open in the app, never in a new browser window.
import assert from "node:assert/strict";
import { test } from "node:test";
import { interceptTicketClick, isTicketKey, ticketKeyFromHref } from "./openTicket.ts";

test("a Jira browse URL yields its key", () => {
  assert.equal(ticketKeyFromHref("https://ip-corporation.atlassian.net/browse/MT-473"), "MT-473");
  assert.equal(ticketKeyFromHref("https://x.atlassian.net/browse/mt-12?focus=1"), "MT-12");
});

test("anything that is not a ticket link is left alone", () => {
  assert.equal(ticketKeyFromHref("https://learn.microsoft.com/fabric"), null);
  assert.equal(ticketKeyFromHref(""), null);
  assert.equal(ticketKeyFromHref(null), null);
});

test("only real key shapes count", () => {
  assert.equal(isTicketKey("MT-473"), true);
  assert.equal(isTicketKey("MT-"), false);
  assert.equal(isTicketKey("not a key"), false);
});

test("a plain click is intercepted", () => {
  let prevented = false;
  const handled = interceptTicketClick(
    {
      preventDefault: () => {
        prevented = true;
      },
      button: 0,
    },
    "https://ip-corporation.atlassian.net/browse/MT-473"
  );
  assert.equal(prevented, true);
  // No window in node, so dispatch returns false; the interception is the point.
  assert.equal(typeof handled, "boolean");
});

test("ctrl-click and middle-click still go to Jira, because that was deliberate", () => {
  let prevented = false;
  const mark = () => {
    prevented = true;
  };
  assert.equal(
    interceptTicketClick(
      { preventDefault: mark, ctrlKey: true, button: 0 },
      "https://x.atlassian.net/browse/MT-1"
    ),
    false
  );
  assert.equal(
    interceptTicketClick(
      { preventDefault: mark, button: 1 },
      "https://x.atlassian.net/browse/MT-1"
    ),
    false
  );
  assert.equal(prevented, false, "a deliberate new-tab click is never hijacked");
});
