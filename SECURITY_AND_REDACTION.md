# Security and Redaction Notes

This repository exists because the raw IP Corp Architecture Brain is not safe to publish directly.

## Why Not Publish The Raw Brain?

The source repo contains:

- Internal operating rules
- Read-only SQL credentials
- Raw and semi-raw meeting captures
- Private working notes
- Live-capture streams
- Internal action/outcome traces

Those are useful for maintenance, but they are not appropriate for a stakeholder-facing UI or a design tool context.

## Publishing Rule

Only publish sanitized read models. If a frontend screen needs additional data, add a new sanitized export field from the brain; do not point the app at raw folders.

## Current Safe Source Layer

The safe starting point is the Natively contract layer from the brain:

- `natively/status.json`
- `natively/meeting-index.json`
- `natively/prep-packets/*.packet.json`
- `natively/cortex/latest-run.json`
- `natively/cortex/insights/*.json`
- `natively/action-proposals/*.json`

Even this layer is treated as internal/stakeholder-safe draft, not public internet content.

