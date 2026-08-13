import { chromium } from "playwright";

/**
 * Fetch a capture's transcript out of the running Cluely desktop app.
 *
 * Cluely renders custom surfaces (its accessibility tree exposes only the
 * window buttons), stores transcripts in its cloud, and has no API. The
 * sanctioned door is Chrome DevTools Protocol on the app's own renderer:
 * launch Cluely with --remote-debugging-port and this module reads the DOM
 * directly. No pixels, no clipboard, no stolen cursor.
 *
 * The parser converts the session view's text into raw capture format
 * ("Me [m:ss] ..." / "Them [m:ss] ..."), which the closeout pipeline then
 * cleans to Teams quality before anything downstream reads it. Fail closed:
 * a missing dashboard, a missing session link, or an empty transcript is an
 * error, never a silent empty string.
 */

export const CLUELY_CDP_URL = "http://127.0.0.1:9223";

export function parseCluelyDomText(raw) {
  const lines = String(raw)
    .split("\n")
    .map((line) => line.trim());
  let start = lines.findIndex((line) => line === "Copy transcript");
  if (start === -1) start = lines.findIndex((line) => /^(Steve|Me|Them)$/.test(line));
  if (start === -1) return "";
  const body = lines.slice(start + 1).filter(Boolean);
  const out = [];
  for (let i = 0; i < body.length; i += 1) {
    const line = body[i];
    if (/^(Steve|Me|Them|Speaker \d+)$/.test(line) && /^\d+:\d{2}$/.test(body[i + 1] || "")) {
      const speaker = line === "Steve" ? "Me" : line;
      out.push(`${speaker} [${body[i + 1]}] ${body[i + 2] || ""}`.trim());
      i += 2;
    } else if (
      out.length &&
      !/^(Follow-up email|Summary|Transcript|Usage|Resume Session)$/.test(line)
    ) {
      out[out.length - 1] += ` ${line}`;
    }
  }
  return out.join("\n").replace(/ Resume Session$/, "");
}

export async function fetchCluelyTranscript({ sessionTitle, cdpUrl = CLUELY_CDP_URL }) {
  const browser = await chromium.connectOverCDP(cdpUrl);
  try {
    const pages = browser.contexts().flatMap((context) => context.pages());
    const dash = pages.find((page) => page.url().includes("#/dashboard"));
    if (!dash) throw new Error("Cluely's dashboard window was not found over CDP.");

    const link = dash.locator(`a:has-text("${sessionTitle}")`).first();
    if (!(await link.count())) {
      throw new Error(`No Cluely capture titled "${sessionTitle}" is visible on the dashboard.`);
    }
    await link.click();
    await dash.waitForTimeout(2500);

    const transcriptTab = dash
      .locator('button:has-text("Transcript"), [role="tab"]:has-text("Transcript")')
      .first();
    if (await transcriptTab.count()) {
      await transcriptTab.click();
      await dash.waitForTimeout(1500);
    }

    let lastLength = 0;
    for (let i = 0; i < 40; i += 1) {
      await dash.mouse.wheel(0, 1200);
      await dash.waitForTimeout(250);
      const length = await dash.evaluate(() => document.body.innerText.length);
      if (length === lastLength && i > 4) break;
      lastLength = length;
    }
    const sessionUrl = dash.url();
    const text = await dash.evaluate(() => document.body.innerText);

    // Leave the app where its owner expects it.
    await dash.evaluate(() => {
      window.location.hash = "#/dashboard";
    });

    const capture = parseCluelyDomText(text);
    if (capture.length < 200) {
      throw new Error(
        `The "${sessionTitle}" transcript parsed to ${capture.length} characters; refusing to hand a fragment downstream.`
      );
    }
    return { capture, sessionUrl };
  } finally {
    await browser.close();
  }
}
