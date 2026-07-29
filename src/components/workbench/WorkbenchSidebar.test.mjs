import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const source = readFileSync(resolve(here, "WorkbenchSidebar.tsx"), "utf8");
const styles = readFileSync(resolve(here, "WorkbenchSidebar.css"), "utf8");

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex").toUpperCase();
}

test("uses the approved IP Corporation and Microsoft Fabric assets", () => {
  assert.match(source, /\/brand\/ip-corporation-official\.png/);
  assert.match(source, /\/fabric-icons\/fabric\.png/);

  assert.equal(
    sha256(resolve(repoRoot, "public/brand/ip-corporation-official.png")),
    "FAD874A27C8B382AEA333F4575916D4B1DA6CDEEE8607B479C33D2C32B41D82F"
  );
  assert.equal(
    sha256(resolve(repoRoot, "public/fabric-icons/fabric.png")),
    "9DABB20DB4FD65CA083D455309780E03801CCFC14CCEFB73EFF896EC7506CC27"
  );
});

test("keeps product branding readable and accessible in both sidebar states", () => {
  assert.match(source, /aria-label="IP Corporation Workbench navigation"/);
  assert.match(source, /aria-label=\{item\.label\}/);
  assert.match(styles, /font-family: var\(--font-heading\)/);
  assert.match(styles, /font-family: var\(--font-body\)/);
  assert.match(styles, /\.wb-brand-compact-crop/);
  assert.match(styles, /@media \(max-width: 1199px\)/);
});

test("does not reintroduce the rejected typography or legacy brand colors", () => {
  assert.doesNotMatch(`${source}\n${styles}`, /JetBrains|font-mono/i);
  assert.doesNotMatch(styles, /#22c55e|#fdcf5a|purple|aubergine/i);
  assert.doesNotMatch(styles, /filter\s*:/i);
});

test("does not claim Jira or Microsoft 365 is live without a check", () => {
  assert.doesNotMatch(source, /Live Jira|M365 verified|verified on this computer/i);
  assert.match(source, /Jira on demand · Prepared Brain/);
});
