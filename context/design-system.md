# Design System - IP Corp Brain Frontend

**Read this before any visual, layout, or motion change.**

This document captures the project's design DNA, originally produced via hallmark and interface-design skills on 2026-05-28. It is the single source of truth for what "good" looks like.

## Direction
The IP Corp Brain frontend is a calm Context OS for source-backed engagement intelligence. It should feel elegant, patient, and current: a place where scattered meetings, risks, decisions, actions, and evidence are gathered into reviewable context without becoming a loud monitoring console.

## Product Signature
The signature interaction is **context assembly**:
- Source chips feed a synthesis surface.
- Prep packets show which meetings, risks, questions, and evidence formed the packet.
- Cortex insights unfold their reasoning chain progressively.
- Evidence refs stay attached to claims as proof trails.

## Palette (IP Corporation Workbench - 2026-07-28)
The visual authority is the current IP Corporation website plus the verified
`IP Corp Workbench v4.dc.html` handoff. The product is a **blue-and-white
workbench**, not the prior Unabyss near-black/green/gold theme.

- Base surfaces: white and cool off-white (`#FFFFFF`, `#FAFBFC`, `#F7F8F9`,
  `#F0F2F4`) with quiet gray dividers (`#E1E4E8`, `#D5D9DE`).
- Navigation and structural blues: deep navy `#0E2338` and `#14314F`,
  supported by official-site blues `#334862` and `#446084`.
- Primary action and selection: clear corporate blue `#1B5E9E`; supporting
  blues may use `#1D4570`, `#2A4A6B`, and soft blue `#9FB0C2`.
- Text: ink `#1B1D20`, secondary `#5A6169`, and muted `#8A9099`.
- Primary CTAs: blue background with white text. Secondary controls use white
  surfaces with blue text/borders.
- Semantic colors are not brand accents: green `#1E7B4D` means verified or
  successful, amber `#B0761A` means review or stale, and red `#C8102E` means
  blocked or failed.
- Graph layers use a distinguishable blue ramp plus neutral grays. Semantic
  green/amber/red may identify state. Purple and aubergine are not permitted.

Tokens live in `src/App.css` under `:root`.

## Depth & Surfaces
Use white cards on cool-gray page surfaces, quiet borders, and restrained
shadows. Deep blue belongs to navigation, compact headers, and deliberate
structural anchors, not full-screen dark glass. Avoid heavy shadows, thick
borders, decorative gradients, and generic cyber-dashboard effects.

## Typography
- Headings and branded labels: **Figtree**, matching the verified Workbench v4
  handoff.
- Product body text: the native system stack (`-apple-system`,
  `BlinkMacSystemFont`, `Segoe UI`, Helvetica, Arial, sans-serif).
- Source refs, proof trails, and technical metadata may use a restrained
  monospace stack.
- Letter spacing stays natural for body copy and slightly tight on large
  headings.

## Layout Model (Desktop-first)
- Left navigation shell (collapsible, with active indicator using framer layoutId)
- Top freshness + global search band
- Readiness hero + count ribbon (metric cards)
- Two-column context panels for most views
- Tablet/mobile: collapse nav to horizontal strip, stack content vertically, **no horizontal overflow**

## Motion Philosophy
Motion should **explain state and assembly**, never decorate:
- View changes: soft fade + short y-slide + blur (0.28s, custom cubic)
- Drawer: spatial slide-in from right (520px, 0.24s)
- Cards and reasoning steps: staggered entrance
- Ambient threads: very slow drift, low opacity, purely atmospheric
- Hover states on cards/rows: subtle lift + border color
- Reduce motion: fully respected via `useReducedMotion()`

## Component Rules
- Cards: 8px radius (`--radius-sm` etc.)
- Chips: pill or rounded, tone variants (amber/green/blue/violet/orange/neutral)
- Every clickable row has clear hover + focus-visible (2px outline)
- Drawers show evidence and detail without navigating away
- Microsoft Fabric product and capability marks use the exact original PNG
  assets supplied for the project. Preserve their native colors, transparency,
  and aspect ratios; never redraw them with CSS, substitute generic line
  icons, or trace visually distorted versions from a mockup or screenshot.
- Never expose raw captures or private repo material in UI copy
- Status is always translated through `formatStatus()` + tone mapping. Do not hardcode strings

## What This Product Is NOT
- Not a network/ops/systems monitoring dashboard
- No fake nodes, protocol alerts, throughput charts, asset graphs, or server maps
- No synthetic metrics or "health %"
- Everything on screen must map to a real object in the product data model (PrepPacket, CortexInsight, Risk, ActionProposal, ADR, OpenQuestion, MeetingEntry, SourceHealthItem)

## When the Design Evolves
1. Update this file first.
2. Update the corresponding tokens in App.css.
3. If the information architecture changes, also update `DATA_CONTRACT.md`.
4. Run a design-review or hallmark pass and capture the rationale here under Learnings.

## Learnings
- [2026-08-10] The Activity reconciliation panel now uses the "run theater"
  pattern: a live heartbeat driven by `run.lastActivityAt` (amber past 20s), a
  plain-language explainer per phase, a segmented progress bar sized from the
  phase list, and a navy mono receipt log streaming `run.events` newest-first.
  Sidebar flex children use `flex: none` so the brand block is never crushed
  by overflowing nav; overflow goes to the sidebar's own scroll. Reuse these
  patterns for other long-running workflows such as Reconcile MDM.
- [2026-07-29] Team Library folder cards must open an obvious focused folder
  view, not silently filter content elsewhere. Artifact preview opens first,
  download is a separate action, and markdown or diagram content must render in
  a formatted reader view without raw parser errors.
- [2026-07-29] Team Library must read as a published knowledge product. Keep
  source mappings internal and hide raw paths, extensions, storage names,
  revision strings, and backend summaries from readers.
- [2026-07-29] Steve confirmed the complete current global no-use list applies to every interface label, project note, and user-facing message. Treat every entry as absolute, including the two terms he explicitly corrected today; older local wording does not override it.
- [2026-07-28] Steve approved the current Data work screen as the application
  visual north star: bright white and soft-gray surfaces, strong navy
  hierarchy, restrained Fabric teal, generous spacing, thin dividers, crisp
  cards, compact truthful state badges, and a large editorial heading. Reuse
  that design language across the Workbench without duplicating its hero on
  every page.
- [2026-07-28] Data work mockups are composition references only. Every
  Microsoft Fabric mark must use the supplied original asset rather than an
  approximation of a distorted or imperfect icon shown in a screenshot.
- [2026-07-28] The official top-left mark must remain readable at the actual
  navigation size, and the product label uses the same Figtree/system
  typography as the Workbench. Monospace branding looks disconnected and is
  reserved for technical metadata.
- [2026-07-28] Steve corrected the visual authority: IP Corporation is a
  blue-and-white brand. Use the current company website and verified Workbench
  v4 handoff as the governing palette; green/amber/red are semantic status
  colors only, and the prior near-black/green/gold Unabyss theme no longer
  governs the Workbench.
- [2026-05-29] **Rebranded to the Unabyss design language** (unabyss.com), extracted via `npx dembrandt unabyss.com`. Green `#22C55E` primary + gold `#FDCF5A` secondary on near-black, white pill CTAs, Lexend + JetBrains Mono, tight radii + pills, hairline elevation, expressive ease-out motion (`--ease-out`, 0.15 to 0.36s). Tokens + base layer (`.eyebrow`, `.btn-pill`, `.btn-ghost`, `u-*` keyframes) live in `src/App.css :root`. The legacy `--amber` token now aliases green so old usages re-skin automatically. Dembrandt artifacts (DESIGN.md, token JSON, screenshot) were saved to a temp scratch dir, not committed.
- [2026-05-28] The current "atmospheric workbench + evidence orbit" genre (from hallmark polish) is the approved direction. Preserve the calm, proof-trail focused feeling.
- [2026-05-28] The 1.5 MB context-engine.png is intentional atmospheric texture for the readiness hero. Do not remove without replacement approved in this doc.
- Future learnings go here as dated bullets when corrections or strong preferences are discovered during implementation or review.
