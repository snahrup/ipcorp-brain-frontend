# IP Corp Brain Frontend

Sanitized frontend/design package for the IP Corp Architecture Brain.

This repository is intentionally **not** the raw brain repo. It contains only the stakeholder-safe contract layer needed to design and build a web experience for browsing readiness, meetings, risks, decisions, open questions, Cortex insights, and proposed actions.

## Current Status

- Source brain: `C:\Users\snahrup\CascadeProjects\ipcorp-architecture-brain`
- Snapshot generated: see `data/export-manifest.json`
- Data classification: internal / stakeholder-safe draft
- Raw transcripts, credentials, internal agent rules, live captures, and workflow receipts are excluded.

## What Google Stitch Should Use

Start with:

1. `STITCH_FRONTEND_BRIEF.md`
2. `DATA_CONTRACT.md`
3. `data/frontend-seed.json`

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

## Non-Negotiable Boundary

Do not add raw captures, SQL credentials, internal `AGENTS.md` / `CLAUDE.md` content, or private transcript text to this repository. If the frontend needs more context, add a sanitized field to the data contract first.

