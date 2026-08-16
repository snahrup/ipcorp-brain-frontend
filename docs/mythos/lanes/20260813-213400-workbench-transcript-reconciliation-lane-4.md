# Lane 4: Meeting Transcript Reconciliation

## Purpose

Turn several transcript captures for one meeting into one accurate, comprehensive
meeting context artifact.

## In scope

- transcript discovery across supported Brain transcript folders
- rejection of failed, filler, and otherwise unusable captures
- comparison and model-written consolidation of complementary sources
- saved source receipts and one package transcript reference
- replacement of stale Workbench closeout markers during reprocessing
- focused server tests

## Out of scope

- deleting or rewriting original transcript files
- Jira changes, email, or Teams messages
- guessing missing speech or inventing certainty

## Dependencies

Existing meeting closeout synthesis, Brain write checks, and transcript cleanup model
runner.

## Verification expectations

Focused tests prove source discovery, filler rejection, deduplication, complementary
merge, source receipts, preserved source files, and marker replacement.

## Owner role

builder

## Status

complete

## Implementation notes

- Meeting closeout now discovers matching transcript files across the Brain transcript folders and includes the incoming capture in the same comparison pass.
- Failed, filler, excerpted, and low-coverage captures are sorted before synthesis. Excerpted or low-coverage captures can support a full source, but they cannot be the only source.
- Different usable sources are passed through the model cleanup step before package synthesis, so commitments and summaries are derived from the consolidated meeting context.
- The incoming source is saved under its declared Teams or Cluely folder, while the package transcript reference points to `core/meetings/transcripts/consolidated/<date>-<meeting>.md` with source paths and hashes.
- Reprocessing replaces the Workbench closeout section and leaves one current package marker instead of stacking old markers.
- Restored the earlier safety coverage for excerpt detection, low transcript coverage, declared Teams source storage, cleanup state overrides, and cached-only calendar reads.

## Verification evidence

- Combined focused server run: 74 passed, 0 failed.
- The live run consolidated three meetings from two, two, and three preserved sources.
- The two meetings that had only excerpts remained partial and unprocessed.
- Source paths, quality labels, and SHA-256 receipts are recorded in each consolidated
  artifact and in `docs/mythos/evidence/20260813-workbench-today-freshness.md`.
- Focused Biome checks passed on the transcript implementation files.
