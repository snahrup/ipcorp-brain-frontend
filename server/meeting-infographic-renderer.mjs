import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

function inspectPng(data) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (data.length < 24 || !data.subarray(0, 8).equals(signature)) {
    throw new Error("The meeting visual is not a valid PNG file.");
  }
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  if (width < 800 || height < 500 || data.length < 5_000) {
    throw new Error("The meeting visual is too small to be considered complete.");
  }
  return {
    width,
    height,
    bytes: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
  };
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

export async function renderMeetingInfographic({
  htmlPath,
  outputPath,
  statusPath,
  meetingId,
  browserFactory,
}) {
  await mkdir(dirname(outputPath), { recursive: true });
  try {
    const existing = inspectPng(await readFile(outputPath));
    await atomicJson(statusPath, {
      meetingId,
      file: outputPath,
      status: "complete",
      checkedAt: new Date().toISOString(),
      ...existing,
    });
    return { ...existing, reused: true, outputPath, statusPath };
  } catch (error) {
    if (error?.code !== "ENOENT" && !/valid PNG|too small/.test(error?.message || "")) throw error;
  }

  const temporary = `${outputPath}.${process.pid}.${randomUUID()}.tmp.png`;
  const createBrowser =
    browserFactory ||
    (async () => {
      const { chromium } = await import("playwright");
      return chromium.launch({ headless: true });
    });
  const browser = await createBrowser();
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
    await page.screenshot({ path: temporary, type: "png", fullPage: true });
  } finally {
    await browser.close();
  }

  const details = inspectPng(await readFile(temporary));
  await rename(temporary, outputPath);
  const status = {
    meetingId,
    file: outputPath,
    status: "complete",
    generatedAt: new Date().toISOString(),
    ...details,
  };
  await atomicJson(statusPath, status);
  return { ...details, reused: false, outputPath, statusPath };
}

export { inspectPng };
