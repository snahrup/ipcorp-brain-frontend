# IP Corp Brain Frontend

**Current status, 2026-08-14**: This repo now hosts the IP Corporation Workbench. The
active product, runtime, donor-pattern, and build-order references are
`docs/architecture/INDEX.md`, `docs/architecture/FEATURE-DONOR-MATRIX.md`, and
`docs/architecture/WORKBENCH-ARCHITECTURE-ROADMAP.md`. Older graph-first notes below are
history when they disagree with those files.

Sanitized frontend/design package for the IP Corp Architecture Brain.

This repository is intentionally **not** the raw brain repo. It contains only the stakeholder-safe read layer needed to design and build a web experience for browsing readiness, meetings, risks, decisions, open questions, Cortex insights, and proposed actions.

## Current Status

- Source brain: `C:\Users\snahrup\CascadeProjects\ipcorp-architecture-brain`
- Snapshot generated: see `data/export-manifest.json`
- Data classification: internal / stakeholder-safe draft
- Raw transcripts, credentials, internal agent rules, live captures, and workflow receipts are excluded.
- Working app: `http://ipcorp-brain.localhost` or `http://127.0.0.1:5217`
- Launcher: `C:\Apps\IP Corp Brain Launch.bat` starts the local gateway on `8817` and Vite on `5217`, waits for both readiness checks, then opens the browser without starting ngrok.

## Local Development

```powershell
npm install
npm run sync:data
npm run dev
```

The Vite server is pinned to port `5217` with `strictPort: true`.

This machine currently launches the portless route over HTTP because the HTTPS portless proxy cannot start without OpenSSL. The direct Vite URL always works at `http://127.0.0.1:5217`.

## What Google Stitch Should Use

Start with:

1. `STITCH_FRONTEND_BRIEF.md`
2. `DATA_CONTRACT.md`
3. `.stitch/DESIGN.md`
4. `data/frontend-seed.json`
5. `STITCH_REPAIR_PROMPT.md` if Stitch starts inventing generic dashboard content

The frontend should be designed around the sanitized read model, not around the raw source repo structure.

## Product Shape

The app is a working intelligence surface, not a marketing site:

- Executive readiness dashboard
- Meeting and prep packet browser
- Open question queue
- Risk and decision register
- Cortex insight stream
- Action proposal review queue
- Source health and freshness checks

## Non-Negotiable Repo Rule

Do not add raw captures, SQL credentials, internal `AGENTS.md` / `CLAUDE.md` content, or private transcript text to this repository. If the frontend needs more context, add a sanitized field to the data contract first.

## Development (Post-2026-05 Audit)

```powershell
npm install
npm run lint:fix          # Biome (required before commit)
npm run typecheck
npm run dev               # 127.0.0.1:5217 (strictPort enforced)
npm run build
npm run test              # Playwright (expanding)
npm run ci                # Full local gate
```

### Tooling
- **Biome** is the single linter + formatter + import sorter (`biome.json`).
- Pre-commit hook runs `lint:fix` on staged changes.
- TypeScript strict + noEmit checks on every build.
- Playwright for E2E (critical flows only — no unit tests needed for this surface).

### Key Documentation
- `docs/architecture/INDEX.md` — Current Workbench product and runtime reference.
- `docs/architecture/FEATURE-DONOR-MATRIX.md` — What to lift from earlier apps and external references.
- `docs/architecture/WORKBENCH-ARCHITECTURE-ROADMAP.md` — Ordered build plan for the full Workbench program.
- `CLAUDE.md` — Project rules, mission, and agent instructions (read on every session).
- `context/design-system.md` — Visual DNA, motion philosophy, and component rules (read before touching CSS or layout).
- `DATA_CONTRACT.md` — Exact types and redaction policy.
- `STITCH_FRONTEND_BRIEF.md` + `.stitch/DESIGN.md` — Creative direction for any design iteration.

### Syncing Fresh Data
The `scripts/sync-data.mjs` pulls from the private `ipcorp-architecture-brain` repo (natively/ contract layer only). See the script header for current requirements. After a sync, commit the updated `data/*.json` + `export-manifest.json`.

## Architecture Notes (2026-05, Historical)

- Single-page React + Vite + framer-motion (heavy but intentional for the "context assembly" feeling).
- All domain data lives in the sanitized `data/frontend-seed.json` (bundled at build time).
- The app is currently being refactored out of a 1.8k LOC monolith (`App.tsx`) into proper views + primitives while preserving 100% of the existing visual and interaction behavior.
- Current styling uses Tailwind v4 utilities-only plus custom CSS. The old "no Tailwind" note is history.

## Contributing / Handoff

1. Never bypass the data contract.
2. Run `npm run ci` locally and fix everything before pushing.
3. Visual or interaction changes should be reviewed against `context/design-system.md`.
4. Update this README + CLAUDE.md + relevant context/ files when patterns stabilize.

This package is the living reference implementation for the IP Corp Architecture Brain stakeholder surface. Treat it with the same care as the brain itself.
