# Design System — IP Corp Brain Frontend

**Read this before any visual, layout, or motion change.**

This document is the canonical extraction of the project's design DNA (originally produced via hallmark + interface-design skills on 2026-05-28). It is the single source of truth for what "good" looks like.

## Direction
The IP Corp Brain frontend is a calm Context OS for source-backed engagement intelligence. It should feel elegant, patient, and current: a place where scattered meetings, risks, decisions, actions, and evidence are gathered into reviewable context without becoming a loud monitoring console.

## Product Signature
The signature interaction is **context assembly**:
- Source chips feed a synthesis surface.
- Prep packets show which meetings, risks, questions, and evidence formed the packet.
- Cortex insights unfold their reasoning chain progressively.
- Evidence refs stay attached to claims as proof trails.

## Palette (Unabyss rebrand — 2026-05-29)
The palette was rebranded to the **Unabyss design language** (unabyss.com, extracted via the `dembrandt` CLI). This deliberately replaced the prior warm-amber identity at Steve's direction.
- Base: near-black surfaces (`--bg #0a0a0b`, `--bg-2 #0f0f10`), lit by hairline white-alpha borders (`--line` 0.08, `--line-strong` 0.14) rather than glows.
- Primary accent: **green `#22C55E`** (`--accent` / `--green`) — used deliberately and sparingly for active/selected/primary states.
- Secondary accent: **gold `#FDCF5A`** (`--gold`). NOTE: the legacy `--amber` token is now an alias pointing to green, so old `var(--amber)` usages re-skin automatically.
- Primary CTAs: **white pill buttons** (`--white #fff` bg, `--on-white #0f0f0f` text, full radius). Helper class `.btn-pill`.
- Text: cool white ramp (`--text #fafafa`, `--text-soft` 0.75, `--muted` 0.5).
- 3D graph layer hues (kept distinguishable): insight=green, decision=gold, meeting=blue `#77c7ff`, system/entity=violet `#9f8cff`, risk=orange `#ff8a5b`, open_question=`#c084fc`, reference=sky `#5fa8d3`.
- Risk treatment: orange `#ff8a5b` for attention, not harsh emergency red unless data says critical failure.

Tokens live in `src/App.css` under `:root`.

## Depth & Surfaces
Use layered translucent panels (`--panel`, `--panel-strong`) with quiet borders and inner rim light. Avoid heavy shadows, thick borders, and decorative gradients. The background can contain subtle moving threads (the ambient canvas), but it must not read as a generic cyber dashboard.

## Typography (Unabyss)
- Product text: **Lexend** (`--font-body`) — big bold display (weight 600) contrasted with thin (weight 300) body at generous line-height (1.5–1.7), matching Unabyss.
- Source refs, proof trails, metadata, tiny UPPERCASE eyebrow labels: **JetBrains Mono** (`--font-mono`). Helper class `.eyebrow` (mono, uppercase, ~0.22em tracking).
- Letter spacing normal for body; tight (-0.03/-0.04em) on large display headings.

Current implementation imports **Lexend + JetBrains Mono** via Google Fonts in App.css.

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
- Never expose raw captures or private repo material in UI copy
- Status is always translated through `formatStatus()` + tone mapping — do not hardcode strings

## What This Product Is NOT
- Not a network/ops/systems monitoring dashboard
- No fake nodes, protocol alerts, throughput charts, asset graphs, or server maps
- No synthetic metrics or "health %"
- Everything on screen must map to a real object in the data contract (PrepPacket, CortexInsight, Risk, ActionProposal, ADR, OpenQuestion, MeetingEntry, SourceHealthItem)

## When the Design Evolves
1. Update this file first.
2. Update the corresponding tokens in App.css.
3. If the information architecture changes, also update `DATA_CONTRACT.md`.
4. Run a design-review or hallmark pass and capture the rationale here under Learnings.

## Learnings
- [2026-05-29] **Rebranded to the Unabyss design language** (unabyss.com), extracted via `npx dembrandt unabyss.com`. Green `#22C55E` primary + gold `#FDCF5A` secondary on near-black, white pill CTAs, Lexend + JetBrains Mono, tight radii + pills, hairline elevation, expressive ease-out motion (`--ease-out`, 0.15–0.36s). Tokens + base layer (`.eyebrow`, `.btn-pill`, `.btn-ghost`, `u-*` keyframes) live in `src/App.css :root`. The legacy `--amber` token now aliases green so old usages re-skin automatically. Dembrandt artifacts (DESIGN.md, token JSON, screenshot) were saved to a temp scratch dir, not committed.
- [2026-05-28] The current "atmospheric workbench + evidence orbit" genre (from hallmark polish) is the approved direction. Preserve the calm, proof-trail focused feeling.
- [2026-05-28] The 1.5 MB context-engine.png is intentional atmospheric texture for the readiness hero. Do not remove without replacement approved in this doc.
- Future learnings go here as dated bullets when corrections or strong preferences are discovered during implementation or review.
