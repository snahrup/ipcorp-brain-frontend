# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> IP Corp Brain Frontend - Smoke >> sidebar navigation works
- Location: tests\smoke.spec.ts:36:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/Cortex reasoning/i)
Expected: visible
Error: strict mode violation: getByText(/Cortex reasoning/i) resolved to 2 elements:
    1) <span class="mono-kicker">Cortex reasoning</span> aka locator('header').getByText('Cortex reasoning')
    2) <span class="mono-kicker">Cortex reasoning</span> aka getByText('Cortex reasoning').nth(1)

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText(/Cortex reasoning/i)

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic:
    - img
  - complementary "Primary navigation" [ref=e4]:
    - button "Collapse navigation" [ref=e5] [cursor=pointer]:
      - img [ref=e6]
    - generic [ref=e9]:
      - img [ref=e11]
      - generic [ref=e21]:
        - strong [ref=e22]: Context OS
        - generic [ref=e23]: IP Corp Architecture Brain
    - generic [ref=e24]:
      - generic [ref=e25]: You are here
      - strong [ref=e26]: Insights
    - navigation [ref=e27]:
      - generic [ref=e28]:
        - generic [ref=e29]: Orient
        - button "Start Here What needs attention now" [ref=e30] [cursor=pointer]:
          - img [ref=e31]
          - generic [ref=e41]:
            - strong [ref=e42]: Start Here
            - generic [ref=e43]: What needs attention now
        - button "Meetings Upcoming, active, recent signals 23" [ref=e44] [cursor=pointer]:
          - img [ref=e45]
          - generic [ref=e47]:
            - strong [ref=e48]: Meetings
            - generic [ref=e49]: Upcoming, active, recent signals
          - generic [ref=e50]: "23"
      - generic [ref=e51]:
        - generic [ref=e52]: Prepare
        - button "Prep Packets Briefs ready to use in meetings 14" [ref=e53] [cursor=pointer]:
          - img [ref=e54]
          - generic [ref=e58]:
            - strong [ref=e59]: Prep Packets
            - generic [ref=e60]: Briefs ready to use in meetings
          - generic [ref=e61]: "14"
        - button "Insights Synthesized patterns and reasoning 21" [active] [ref=e62] [cursor=pointer]:
          - img [ref=e64]
          - generic [ref=e66]:
            - strong [ref=e67]: Insights
            - generic [ref=e68]: Synthesized patterns and reasoning
          - generic [ref=e69]: "21"
      - generic [ref=e70]:
        - generic [ref=e71]: Resolve
        - button "Actions Gated proposals and next moves 13" [ref=e72] [cursor=pointer]:
          - img [ref=e73]
          - generic [ref=e76]:
            - strong [ref=e77]: Actions
            - generic [ref=e78]: Gated proposals and next moves
          - generic [ref=e79]: "13"
        - button "Questions Open asks, owners, and targets 51" [ref=e80] [cursor=pointer]:
          - img [ref=e81]
          - generic [ref=e83]:
            - strong [ref=e84]: Questions
            - generic [ref=e85]: Open asks, owners, and targets
          - generic [ref=e86]: "51"
        - button "Risks Exposure, severity, mitigation 22" [ref=e87] [cursor=pointer]:
          - img [ref=e88]
          - generic [ref=e90]:
            - strong [ref=e91]: Risks
            - generic [ref=e92]: Exposure, severity, mitigation
          - generic [ref=e93]: "22"
        - button "Decisions ADRs and candidates 19" [ref=e94] [cursor=pointer]:
          - img [ref=e95]
          - generic [ref=e99]:
            - strong [ref=e100]: Decisions
            - generic [ref=e101]: ADRs and candidates
          - generic [ref=e102]: "19"
      - generic [ref=e103]:
        - generic [ref=e104]: Trust
        - button "Source Health Freshness, boundaries, redaction 9" [ref=e105] [cursor=pointer]:
          - img [ref=e106]
          - generic [ref=e113]:
            - strong [ref=e114]: Source Health
            - generic [ref=e115]: Freshness, boundaries, redaction
          - generic [ref=e116]: "9"
    - generic [ref=e117]:
      - generic "Stakeholder-safe" [ref=e118]:
        - img [ref=e119]
        - text: Stakeholder-safe
      - paragraph [ref=e123]: Raw captures, authentication material, internal agent rules, live-capture snippets, and workflow receipts are excluded.
  - main [ref=e124]:
    - generic [ref=e125]:
      - generic [ref=e126]:
        - generic [ref=e127]: Cortex reasoning
        - strong [ref=e128]: Insights
        - generic [ref=e129]: Use this area to inspect synthesized observations, confidence, tags, and recommended actions.
      - generic [ref=e131]:
        - img [ref=e132]
        - textbox "Search the entire architecture brain" [ref=e135]:
          - /placeholder: "Search everything: packets, meetings, risks, ADRs..."
      - generic [ref=e136]:
        - generic "Fresh · design direction applied" [ref=e137]: Fresh · design direction applied
        - generic "Curated only" [ref=e139]:
          - img [ref=e140]
          - text: Curated only
        - 'generic "Last synced: May 27, 8:53 PM" [ref=e143]': Updated May 27, 8:53 PM
    - generic [ref=e145]:
      - generic [ref=e147]:
        - generic [ref=e148]: Cortex reasoning
        - heading "Insights explain the pattern behind the work." [level=1] [ref=e149]
        - paragraph [ref=e150]: Use this area to inspect synthesized observations, confidence, tags, and recommended actions.
      - generic [ref=e151]:
        - article [ref=e152]:
          - generic [ref=e153]:
            - generic [ref=e154]:
              - text: Highest recency
              - heading "Stakeholder brain frontend now has a visual direction" [level=2] [ref=e155]
            - img [ref=e156]
          - generic "Confidence 74%" [ref=e158]:
            - generic [ref=e159]:
              - generic [ref=e160]: Confidence
              - strong [ref=e161]: 74%
          - paragraph [ref=e164]: "Steve added a concrete product-design preference for the stakeholder-facing brain frontend: keep Stitch creative freedom, but borrow Unabyss-style dark layered surfaces, crisp source/status chips, and motion that makes scattered context feel gathered into an intelligence layer. That should shape the sanitized access path without changing the Natively live runtime boundary."
          - generic [ref=e165]:
            - generic [ref=e166]:
              - generic [ref=e167]: "1"
              - paragraph [ref=e168]: DISC-2026-05-27-005 says the brain frontend should preserve Stitch's creative freedom while borrowing Unabyss's modern look and motion energy.
            - generic [ref=e169]:
              - generic [ref=e170]: "2"
              - paragraph [ref=e171]: The same discovery names dark refined surfaces, layered depth, crisp source/status chips, and context-gathering motion as the important design cues.
            - generic [ref=e172]:
              - generic [ref=e173]: "3"
              - paragraph [ref=e174]: The existing shared-knowledge-base packet already treats Patrick and Eudias access as a likely near-term review surface, not raw repo access.
          - button "Inspect insight" [ref=e175] [cursor=pointer]:
            - text: Inspect insight
            - img [ref=e176]
        - generic [ref=e178]:
          - button "Stakeholder Experience Stakeholder brain frontend now has a visual direction May 27, 8:29 PM · 74% confidence" [ref=e179] [cursor=pointer]:
            - generic [ref=e180]:
              - img [ref=e181]
              - text: Stakeholder Experience
            - generic [ref=e183]:
              - strong [ref=e184]: Stakeholder brain frontend now has a visual direction
              - generic [ref=e185]: May 27, 8:29 PM · 74% confidence
            - img [ref=e186]
          - button "Architecture Risk Pryor SSRS reporting is the first concrete test of the OT-to-Azure boundary May 27, 3:24 PM · 86% confidence" [ref=e188] [cursor=pointer]:
            - generic [ref=e189]:
              - img [ref=e190]
              - text: Architecture Risk
            - generic [ref=e192]:
              - strong [ref=e193]: Pryor SSRS reporting is the first concrete test of the OT-to-Azure boundary
              - generic [ref=e194]: May 27, 3:24 PM · 86% confidence
            - img [ref=e195]
          - button "Action Contract Risk Calendar actions need executable event coordinates, not just intent May 27, 3:19 PM · 91% confidence" [ref=e197] [cursor=pointer]:
            - generic [ref=e198]:
              - img [ref=e199]
              - text: Action Contract Risk
            - generic [ref=e201]:
              - strong [ref=e202]: Calendar actions need executable event coordinates, not just intent
              - generic [ref=e203]: May 27, 3:19 PM · 91% confidence
            - img [ref=e204]
          - button "Meeting Readiness Context capsule exposed a live 1:1 that the packet index had missed May 27, 2:21 PM · 81% confidence" [ref=e206] [cursor=pointer]:
            - generic [ref=e207]:
              - img [ref=e208]
              - text: Meeting Readiness
            - generic [ref=e210]:
              - strong [ref=e211]: Context capsule exposed a live 1:1 that the packet index had missed
              - generic [ref=e212]: May 27, 2:21 PM · 81% confidence
            - img [ref=e213]
          - button "Risk Knowledge-base access is now a stakeholder deliverable, not just an internal tool May 27, 1:17 PM · 83% confidence" [ref=e215] [cursor=pointer]:
            - generic [ref=e216]:
              - img [ref=e217]
              - text: Risk
            - generic [ref=e219]:
              - strong [ref=e220]: Knowledge-base access is now a stakeholder deliverable, not just an internal tool
              - generic [ref=e221]: May 27, 1:17 PM · 83% confidence
            - img [ref=e222]
          - button "Meeting Readiness Fabric cadence should pause once, then return as a synthesis session May 27, 12:26 PM · 78% confidence" [ref=e224] [cursor=pointer]:
            - generic [ref=e225]:
              - img [ref=e226]
              - text: Meeting Readiness
            - generic [ref=e228]:
              - strong [ref=e229]: Fabric cadence should pause once, then return as a synthesis session
              - generic [ref=e230]: May 27, 12:26 PM · 78% confidence
            - img [ref=e231]
          - button "Readiness Risk Disabled proactive coaching still emitted a live suggestion May 27, 12:18 PM · 82% confidence" [ref=e233] [cursor=pointer]:
            - generic [ref=e234]:
              - img [ref=e235]
              - text: Readiness Risk
            - generic [ref=e237]:
              - strong [ref=e238]: Disabled proactive coaching still emitted a live suggestion
              - generic [ref=e239]: May 27, 12:18 PM · 82% confidence
            - img [ref=e240]
          - button "Architecture Decision Plant-floor traceability now has a proposed evidence-stream contract May 27, 6:36 AM · 90% confidence" [ref=e242] [cursor=pointer]:
            - generic [ref=e243]:
              - img [ref=e244]
              - text: Architecture Decision
            - generic [ref=e246]:
              - strong [ref=e247]: Plant-floor traceability now has a proposed evidence-stream contract
              - generic [ref=e248]: May 27, 6:36 AM · 90% confidence
            - img [ref=e249]
          - button "Readiness Boundary Plant-floor truth now has a canonical evidence map May 26, 2:44 PM · 91% confidence" [ref=e251] [cursor=pointer]:
            - generic [ref=e252]:
              - img [ref=e253]
              - text: Readiness Boundary
            - generic [ref=e255]:
              - strong [ref=e256]: Plant-floor truth now has a canonical evidence map
              - generic [ref=e257]: May 26, 2:44 PM · 91% confidence
            - img [ref=e258]
          - button "Readiness Risk Patrick's 1:1 is the pre-OOO decision gate May 24, 1:39 PM · 84% confidence" [ref=e260] [cursor=pointer]:
            - generic [ref=e261]:
              - img [ref=e262]
              - text: Readiness Risk
            - generic [ref=e264]:
              - strong [ref=e265]: Patrick's 1:1 is the pre-OOO decision gate
              - generic [ref=e266]: May 24, 1:39 PM · 84% confidence
            - img [ref=e267]
          - button "Architecture Decision Gold semantic models are becoming the control surface May 21, 3:45 PM · 86% confidence" [ref=e269] [cursor=pointer]:
            - generic [ref=e270]:
              - img [ref=e271]
              - text: Architecture Decision
            - generic [ref=e273]:
              - strong [ref=e274]: Gold semantic models are becoming the control surface
              - generic [ref=e275]: May 21, 3:45 PM · 86% confidence
            - img [ref=e276]
          - button "Master Data Modeling Intercompany modeling should preserve shared master data May 21, 3:45 PM · 78% confidence" [ref=e278] [cursor=pointer]:
            - generic [ref=e279]:
              - img [ref=e280]
              - text: Master Data Modeling
            - generic [ref=e282]:
              - strong [ref=e283]: Intercompany modeling should preserve shared master data
              - generic [ref=e284]: May 21, 3:45 PM · 78% confidence
            - img [ref=e285]
          - button "Governance Operating Model The steward workshop is now the operating-model bridge May 20, 2:49 PM · 82% confidence" [ref=e287] [cursor=pointer]:
            - generic [ref=e288]:
              - img [ref=e289]
              - text: Governance Operating Model
            - generic [ref=e291]:
              - strong [ref=e292]: The steward workshop is now the operating-model bridge
              - generic [ref=e293]: May 20, 2:49 PM · 82% confidence
            - img [ref=e294]
          - button "Execution Blocker Citrine needs a governed read path, not another spreadsheet workaround May 20, 1:54 PM · 79% confidence" [ref=e296] [cursor=pointer]:
            - generic [ref=e297]:
              - img [ref=e298]
              - text: Execution Blocker
            - generic [ref=e300]:
              - strong [ref=e301]: Citrine needs a governed read path, not another spreadsheet workaround
              - generic [ref=e302]: May 20, 1:54 PM · 79% confidence
            - img [ref=e303]
          - button "Governance Enforcement ADR-0004 turns Purview governance into a license-gated enforcement stack May 20, 1:54 PM · 86% confidence" [ref=e305] [cursor=pointer]:
            - generic [ref=e306]:
              - img [ref=e307]
              - text: Governance Enforcement
            - generic [ref=e309]:
              - strong [ref=e310]: ADR-0004 turns Purview governance into a license-gated enforcement stack
              - generic [ref=e311]: May 20, 1:54 PM · 86% confidence
            - img [ref=e312]
          - button "Delivery Strategy Gold domain selection needs one fast proof and one strategic track May 20, 1:54 PM · 78% confidence" [ref=e314] [cursor=pointer]:
            - generic [ref=e315]:
              - img [ref=e316]
              - text: Delivery Strategy
            - generic [ref=e318]:
              - strong [ref=e319]: Gold domain selection needs one fast proof and one strategic track
              - generic [ref=e320]: May 20, 1:54 PM · 78% confidence
            - img [ref=e321]
          - button "Semantic Model Consolidation Sales BI clone drift is the strongest proof for governed Gold models May 20, 1:54 PM · 90% confidence" [ref=e323] [cursor=pointer]:
            - generic [ref=e324]:
              - img [ref=e325]
              - text: Semantic Model Consolidation
            - generic [ref=e327]:
              - strong [ref=e328]: Sales BI clone drift is the strongest proof for governed Gold models
              - generic [ref=e329]: May 20, 1:54 PM · 90% confidence
            - img [ref=e330]
          - button "Mdm Scope Expansion The plant floor exposed non-system records as the real governance gap May 20, 1:54 PM · 88% confidence" [ref=e332] [cursor=pointer]:
            - generic [ref=e333]:
              - img [ref=e334]
              - text: Mdm Scope Expansion
            - generic [ref=e336]:
              - strong [ref=e337]: The plant floor exposed non-system records as the real governance gap
              - generic [ref=e338]: May 20, 1:54 PM · 88% confidence
            - img [ref=e339]
          - button "Source Architecture Risk Source identity must be settled before pipeline simplification May 20, 1:54 PM · 83% confidence" [ref=e341] [cursor=pointer]:
            - generic [ref=e342]:
              - img [ref=e343]
              - text: Source Architecture Risk
            - generic [ref=e345]:
              - strong [ref=e346]: Source identity must be settled before pipeline simplification
              - generic [ref=e347]: May 20, 1:54 PM · 83% confidence
            - img [ref=e348]
          - button "Policy Enforcement Gap Policy draft needs controls, not contradiction handling May 12, 2:31 PM · 84% confidence" [ref=e350] [cursor=pointer]:
            - generic [ref=e351]:
              - img [ref=e352]
              - text: Policy Enforcement Gap
            - generic [ref=e354]:
              - strong [ref=e355]: Policy draft needs controls, not contradiction handling
              - generic [ref=e356]: May 12, 2:31 PM · 84% confidence
            - img [ref=e357]
          - button "Governance Readiness ELT steward decision path is the gate May 12, 2:31 PM · 86% confidence" [ref=e359] [cursor=pointer]:
            - generic [ref=e360]:
              - img [ref=e361]
              - text: Governance Readiness
            - generic [ref=e363]:
              - strong [ref=e364]: ELT steward decision path is the gate
              - generic [ref=e365]: May 12, 2:31 PM · 86% confidence
            - img [ref=e366]
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test.describe("IP Corp Brain Frontend - Smoke", () => {
  4  |   test("loads the readiness view and shows core content", async ({ page }) => {
  5  |     await page.goto("/");
  6  | 
  7  |     await expect(page.locator(".app-shell")).toBeVisible();
  8  |     await expect(page.getByText(/Context OS/i)).toBeVisible();
  9  |     await expect(page.getByText(/Start with the right work/i)).toBeVisible();
  10 | 
  11 |     // Metric ribbon
  12 |     await expect(page.locator(".metric-card").first()).toBeVisible();
  13 |   });
  14 | 
  15 |   test("can open the detail drawer from next best packet", async ({ page }) => {
  16 |     await page.goto("/");
  17 | 
  18 |     await page.getByTestId("open-next-packet").click();
  19 | 
  20 |     await expect(page.locator(".detail-drawer")).toBeVisible({ timeout: 8000 });
  21 | 
  22 |     await page.getByTestId("drawer-close").click();
  23 |     await expect(page.locator(".detail-drawer")).not.toBeVisible();
  24 |   });
  25 | 
  26 |   test("global search surfaces results", async ({ page }) => {
  27 |     await page.goto("/");
  28 | 
  29 |     const searchInput = page.getByPlaceholder(/Search everything/i);
  30 |     await searchInput.fill("risk");
  31 | 
  32 |     await expect(page.locator(".search-results-panel")).toBeVisible({ timeout: 3000 });
  33 |     await expect(page.locator(".search-result").first()).toBeVisible();
  34 |   });
  35 | 
  36 |   test("sidebar navigation works", async ({ page }) => {
  37 |     await page.goto("/");
  38 | 
  39 |     await page.getByTestId("nav-risks").click();
  40 |     await expect(page.getByText(/Exposure register/i)).toBeVisible();
  41 | 
  42 |     await page.getByTestId("nav-insights").click();
> 43 |     await expect(page.getByText(/Cortex reasoning/i)).toBeVisible();
     |                                                       ^ Error: expect(locator).toBeVisible() failed
  44 |   });
  45 | 
  46 |   test("can open different detail types from their views", async ({ page }) => {
  47 |     await page.goto("/");
  48 | 
  49 |     // Go to Risks and open one
  50 |     await page.getByRole("button", { name: /Risks/i }).click();
  51 |     await page.locator(".risk-card").first().click();
  52 |     await expect(page.locator(".detail-drawer")).toBeVisible();
  53 |     await page.getByTestId("drawer-close").click();
  54 | 
  55 |     // Go to Actions and open one
  56 |     await page.getByRole("button", { name: /Actions/i }).click();
  57 |     await page.locator(".action-card").first().click();
  58 |     await expect(page.locator(".detail-drawer")).toBeVisible();
  59 |   });
  60 | 
  61 |   test("global search surfaces results when typing", async ({ page }) => {
  62 |     await page.goto("/");
  63 | 
  64 |     const search = page.getByTestId("global-search");
  65 |     await search.fill("risk");
  66 | 
  67 |     // Results panel should appear with at least one result
  68 |     const firstResult = page.locator(".search-results-panel .search-result").first();
  69 |     await expect(firstResult).toBeVisible({ timeout: 4000 });
  70 |   });
  71 | });
  72 | 
```