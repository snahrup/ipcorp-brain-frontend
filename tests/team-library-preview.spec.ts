import { expect, type Page, test } from "@playwright/test";

const markdownFile = {
  name: "01 - Program brief.md",
  path: "01 - Engagement Overview/01 - Program brief.md",
  sectionId: "01 - Engagement Overview",
  extension: "md",
  group: "Reference",
  bytes: 2048,
  modifiedAt: "2026-07-28T14:30:00.000Z",
  previewable: true,
};

const csvFile = {
  name: "Source inventory.csv",
  path: "01 - Engagement Overview/Source inventory.csv",
  sectionId: "01 - Engagement Overview",
  extension: "csv",
  group: "Data",
  bytes: 1024,
  modifiedAt: "2026-07-28T14:31:00.000Z",
  previewable: true,
};

const wordFile = {
  name: "Launch plan.docx",
  path: "00 - Adoption and Rollout Toolkit/Launch plan.docx",
  sectionId: "00 - Adoption and Rollout Toolkit",
  extension: "docx",
  group: "Word",
  bytes: 4096,
  modifiedAt: "2026-07-28T14:32:00.000Z",
  previewable: false,
};

const pdfFile = {
  name: "Architecture reference.pdf",
  path: "02 - Architecture Reference/Architecture reference.pdf",
  sectionId: "02 - Architecture Reference",
  extension: "pdf",
  group: "PDF",
  bytes: 8192,
  modifiedAt: "2026-07-28T14:33:00.000Z",
  previewable: false,
};

const diagramFile = {
  name: "Medallion Architecture.mmd",
  path: "05 - Diagram Sources/Medallion Architecture.mmd",
  sectionId: "05 - Diagram Sources",
  extension: "mmd",
  group: "Diagram",
  bytes: 1500,
  modifiedAt: "2026-07-28T14:34:00.000Z",
  previewable: true,
};

const sectionDefinitions = [
  ["00 - Adoption and Rollout Toolkit", "00", "Adoption and rollout toolkit"],
  ["01 - Engagement Overview", "01", "Engagement overview"],
  ["02 - Architecture Reference", "02", "Architecture reference"],
  ["03 - Engagement Updates", "03", "Engagement updates"],
  ["04 - Power BI Strategy and Analysis", "04", "Power BI strategy and analysis"],
  ["05 - Diagram Sources", "05", "Diagram sources"],
] as const;

function manifest(files = [markdownFile, csvFile, wordFile, pdfFile]) {
  return {
    source: "local-sync",
    state: "local-sync",
    limitation: "SharePoint cloud freshness has not been verified.",
    refreshedAt: "2026-07-29T12:00:00.000Z",
    newestLocalModifiedAt: "2026-07-28T14:33:00.000Z",
    publication: {
      publishedAt: "2026-07-23 01:02 ET",
      sourceRevision: "04226c4",
    },
    sections: sectionDefinitions.map(([id, index, title]) => ({
      id,
      index,
      title,
      summary: `${title} source folder.`,
      fileCount: files.filter((file) => file.sectionId === id).length,
      available: true,
    })),
    guides: [
      {
        id: "launch",
        title: "Plan a rollout",
        summary: "Open the published rollout references.",
        paths: [wordFile.path],
        files: files.filter((file) => file.path === wordFile.path),
      },
    ],
    files,
    missingSections: [],
    totalFiles: files.length,
    contentBytes: files.reduce((total, file) => total + file.bytes, 0),
  };
}

async function openTeamLibrary(page: Page) {
  await page.goto("/");
  await page.getByTestId("nav-library").click();
  await expect(page.getByTestId("team-library")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Search every available item" })).toBeVisible();
}

test.describe("Team Library item preview drawer", () => {
  test("previews every item without downloading and downloads only on explicit action", async ({
    page,
  }) => {
    const previewRequests: string[] = [];
    const fileRequests: Array<{ path: string; resourceType: string }> = [];
    page.on("download", (download) => void download.cancel());

    await page.route("http://127.0.0.1:8817/api/team-library/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const headers = {
        "Access-Control-Allow-Origin": "http://127.0.0.1:5217",
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
      };
      if (url.pathname.endsWith("/manifest")) {
        await route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify({ ok: true, data: manifest() }),
        });
        return;
      }
      if (url.pathname.endsWith("/preview")) {
        const path = url.searchParams.get("path") || "";
        previewRequests.push(path);
        const content = path.endsWith(".csv")
          ? 'Company,Owner,Status\n"Alpha, Inc.",Steve,Ready\nBeta,Patrick,Review'
          : [
              "# Program brief",
              "",
              "A **governed** source with a readable table.",
              "",
              "| Area | State |",
              "| --- | --- |",
              "| Fabric | Ready |",
            ].join("\n");
        await route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify({
            ok: true,
            data: {
              path,
              extension: path.split(".").pop(),
              content,
              modifiedAt: "2026-07-28T14:30:00.000Z",
            },
          }),
        });
        return;
      }
      if (url.pathname.endsWith("/file")) {
        fileRequests.push({
          path: url.searchParams.get("path") || "",
          resourceType: request.resourceType(),
        });
        await route.fulfill({
          status: 200,
          headers: {
            "Access-Control-Allow-Origin": "http://127.0.0.1:5217",
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          },
          body: "mock-original",
        });
        return;
      }
      await route.fulfill({ status: 404, headers, body: JSON.stringify({ ok: false }) });
    });

    await openTeamLibrary(page);

    const fileRows = page.locator(".wb-library-file-row");
    await expect(fileRows).toHaveCount(4);
    await expect(fileRows.getByRole("button", { name: "Preview" })).toHaveCount(4);
    await expect(page.locator('a[href*="/api/team-library/file"]')).toHaveCount(0);
    await expect(page.getByText(markdownFile.name, { exact: true })).toHaveCount(0);
    await expect(page.getByText(markdownFile.path, { exact: true })).toHaveCount(0);

    const markdownPreview = fileRows
      .filter({ hasText: "Program brief" })
      .getByRole("button", { name: "Preview" });
    await markdownPreview.click();

    const drawer = page.getByTestId("team-library-preview-drawer");
    await expect(drawer).toBeVisible();
    const drawerBox = await drawer.boundingBox();
    const viewport = page.viewportSize();
    expect(drawerBox).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(Math.round((drawerBox?.x || 0) + (drawerBox?.width || 0))).toBeGreaterThanOrEqual(
      (viewport?.width || 0) - 1
    );

    await expect(
      drawer.locator(".tl-preview-header").getByRole("heading", {
        name: "Program brief",
        exact: true,
      })
    ).toBeVisible();
    await expect(drawer.getByText("governed", { exact: true })).toHaveJSProperty(
      "tagName",
      "STRONG"
    );
    await expect(drawer.getByRole("cell", { name: "Fabric" })).toBeVisible();
    await expect(drawer.getByText("Collection", { exact: true })).toBeVisible();
    await expect(drawer.getByText("Folder", { exact: true })).toHaveCount(0);
    await expect(drawer.getByText(markdownFile.name, { exact: true })).toHaveCount(0);
    await expect(drawer.getByText(markdownFile.path, { exact: true })).toHaveCount(0);
    expect(previewRequests).toEqual([markdownFile.path]);
    expect(fileRequests).toEqual([]);

    const closeButton = drawer.getByRole("button", { name: "Close Team Library preview" });
    const downloadButton = drawer.getByRole("button", { name: "Download original" });
    await expect(closeButton).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(downloadButton).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(closeButton).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();
    await expect(markdownPreview).toBeFocused();

    await fileRows
      .filter({ hasText: "Source inventory" })
      .getByRole("button", { name: "Preview" })
      .click();
    await expect(drawer.getByRole("columnheader", { name: "Company" })).toBeVisible();
    await expect(drawer.getByRole("cell", { name: "Alpha, Inc." })).toBeVisible();
    expect(previewRequests).toEqual([markdownFile.path, csvFile.path]);
    await drawer.getByRole("button", { name: "Close Team Library preview" }).click();

    await fileRows
      .filter({ hasText: "Launch plan" })
      .getByRole("button", { name: "Preview" })
      .click();
    await expect(drawer.getByTestId("preview-unsupported")).toContainText(
      "Preview not available in browser"
    );
    expect(previewRequests).toEqual([markdownFile.path, csvFile.path]);
    expect(fileRequests).toEqual([]);

    await drawer.getByRole("button", { name: "Download original" }).click();
    await expect(drawer.getByText("Download started.")).toBeVisible();
    expect(fileRequests).toEqual([{ path: wordFile.path, resourceType: "fetch" }]);
  });

  test("shows a safe preview error and retries the same item", async ({ page }) => {
    const textFile = {
      ...markdownFile,
      name: "Read me.txt",
      path: "01 - Engagement Overview/Read me.txt",
      extension: "txt",
    };
    let previewAttempts = 0;

    await page.route("http://127.0.0.1:8817/api/team-library/**", async (route) => {
      const url = new URL(route.request().url());
      const headers = {
        "Access-Control-Allow-Origin": "http://127.0.0.1:5217",
        "Content-Type": "application/json",
      };
      if (url.pathname.endsWith("/manifest")) {
        await route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify({ ok: true, data: manifest([textFile]) }),
        });
        return;
      }
      previewAttempts += 1;
      await route.fulfill({
        status: previewAttempts === 1 ? 503 : 200,
        headers,
        body: JSON.stringify(
          previewAttempts === 1
            ? { ok: false, error: "The local copy is temporarily locked.", code: "library_busy" }
            : {
                ok: true,
                data: {
                  path: textFile.path,
                  extension: "txt",
                  content: "Readable after retry.",
                  modifiedAt: textFile.modifiedAt,
                },
              }
        ),
      });
    });

    await openTeamLibrary(page);
    await page
      .locator(".wb-library-file-row")
      .filter({ hasText: "Read me" })
      .getByRole("button", { name: "Preview" })
      .click();

    const drawer = page.getByTestId("team-library-preview-drawer");
    await expect(drawer.getByRole("alert")).toContainText(
      "This item could not be opened. Try the preview again."
    );
    await expect(drawer).not.toContainText("The local copy is temporarily locked.");
    await drawer.getByRole("button", { name: "Try preview again" }).click();
    await expect(drawer.getByTestId("formatted-text")).toContainText("Readable after retry.");
    expect(previewAttempts).toBe(2);
  });

  test("opens a collection immediately and hides technical diagram details", async ({ page }) => {
    await page.route("http://127.0.0.1:8817/api/team-library/**", async (route) => {
      const url = new URL(route.request().url());
      const headers = {
        "Access-Control-Allow-Origin": "http://127.0.0.1:5217",
        "Content-Type": "application/json",
      };
      if (url.pathname.endsWith("/manifest")) {
        await route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify({ ok: true, data: manifest([diagramFile]) }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          data: {
            path: diagramFile.path,
            extension: "mmd",
            content: "flowchart LR\nA[Source]\nB[Target]\nA --> B\nbroken[",
            modifiedAt: diagramFile.modifiedAt,
          },
        }),
      });
    });

    await openTeamLibrary(page);
    await page.getByRole("button", { name: "Open Architecture diagrams" }).click();
    await expect(page.getByRole("heading", { name: "Architecture diagrams" })).toBeVisible();
    await expect(page.getByText("Medallion Architecture", { exact: true })).toBeVisible();

    await page.locator(".wb-library-folder-files").getByRole("button", { name: "Preview" }).click();
    const drawer = page.getByTestId("team-library-preview-drawer");
    await expect(drawer.getByText("Diagram preview unavailable")).toBeVisible();
    await expect(drawer.getByTestId("diagram-outline")).toBeVisible();
    await expect(drawer.getByText("Source", { exact: true })).toBeVisible();
    await expect(drawer).not.toContainText("flowchart LR");
    await expect(drawer).not.toContainText("broken[");
    await expect(drawer).not.toContainText("Expecting");
    await expect(drawer).not.toContainText("Parse error");
  });

  test("renders the known published medallion diagram without exposing its definition", async ({
    page,
  }) => {
    let downloadRequests = 0;
    await page.route("http://127.0.0.1:8817/api/team-library/**", async (route) => {
      const url = new URL(route.request().url());
      const headers = {
        "Access-Control-Allow-Origin": "http://127.0.0.1:5217",
        "Content-Type": "application/json",
      };
      if (url.pathname.endsWith("/manifest")) {
        await route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify({ ok: true, data: manifest([diagramFile]) }),
        });
        return;
      }
      if (url.pathname.endsWith("/preview")) {
        await route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify({
            ok: true,
            data: {
              path: diagramFile.path,
              extension: "mmd",
              content: [
                "flowchart LR",
                "[Personal meeting reference removed]",
                "B[bronze_raw]",
                "end",
                "classDef bronze fill:#dcecff,stroke:#446084",
                "class B bronze",
              ].join("\n"),
              modifiedAt: diagramFile.modifiedAt,
            },
          }),
        });
        return;
      }
      downloadRequests += 1;
      await route.fulfill({ status: 200, headers, body: "not-used" });
    });

    await openTeamLibrary(page);
    await page.getByRole("button", { name: "Open Architecture diagrams" }).click();
    await page.locator(".wb-library-folder-files").getByRole("button", { name: "Preview" }).click();

    const drawer = page.getByTestId("team-library-preview-drawer");
    await expect(drawer.locator(".wb-library-diagram img")).toBeVisible();
    await expect(drawer).not.toContainText("Personal meeting reference removed");
    await expect(drawer).not.toContainText("flowchart LR");
    expect(downloadRequests).toBe(0);
  });
});
