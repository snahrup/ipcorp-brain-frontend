---
name: phase-infographic
description: Create a source-backed information artwork after a well-defined IP Corporation Workbench build phase reaches a verified closeout. Use when Steve asks for a phase infographic, build-phase visual, architecture progress artwork, completed-phase summary image, or invokes $phase-infographic with a phase name. Also use for an explicitly requested partial or blocked phase status visual, while labeling that state honestly.
---

# Phase Infographic

Turn a verified build phase into one creative information artwork that explains what changed,
why it matters, how it works, what proved it, and what comes next.

## Default closeout behavior

This skill is the automatic final step for every phase in the active Workbench build plan.
After the written completion checks pass and Steve and the builder agree that the phase is
finished, run this skill without waiting for another request. Save the approved artwork and
receipt, then link both from the phase evidence or closeout record.

Do not run the finished-phase path merely because implementation stopped or tests passed. The
agreement that the phase is finished is part of the trigger. The artwork remains a communication
artifact and never supplies missing completion proof.

## Manual rerun or repair

Use one of these forms:

```text
$phase-infographic Foundation Block 1.5
$phase-infographic Meeting Action Ledger v1
$phase-infographic current phase
```

Treat `/phase-infographic` as a conversational alias when the host recognizes it. The supported
explicit skill name is `$phase-infographic`. These forms are fallback controls for a rerun,
replacement, or explicitly requested partial or blocked status artwork. Steve should not need to
invoke them during the normal build sequence.

## 1. Resolve the phase

1. Identify one phase with a title, objective, completion checks, and evidence.
2. Read the relevant architecture plan, execution plan, `docs/mythos/gates/` file, lane records,
   evidence record, review, handoff, focused tests, and diff.
3. Prefer current files and receipts over earlier status prose.
4. If the phase is unclear or combines multiple unrelated outcomes, stop and ask for the phase
   name or split it into separate artworks.

Do not generate a completed-phase artwork from a plan alone.

## 2. Decide the honest phase state

Set exactly one state:

- `complete`: every named completion check has current evidence.
- `partial`: useful work landed, but one or more completion checks remain.
- `blocked`: a named missing input or failed prerequisite prevents completion.

When the phase is partial or blocked, state that prominently in the artwork. Never use finished
visual language to hide missing proof.

## 3. Build the evidence brief

Prepare a compact brief before image generation:

```text
Phase ID and title
Phase state and verification time
User problem before the phase
What was intended
What was actually built
How the new flow works
Review findings and repairs
Verified outcomes and exact counts
Known limitations or blocked items
Next phase and why it follows
Source paths and hashes
```

Rules:

- Use only evidence supported by current source files, receipts, test output, or visible proof.
- Treat runtime counts as current only when they were refreshed during this closeout.
- Never include credentials, raw private source bodies, hidden reasoning, or personal details.
- Follow the repository writing rules, including Steve's voice and banned-word list.
- Keep exact in-image copy short enough to render cleanly. Put deeper evidence in the receipt.

## 4. Design the information artwork

Use the built-in image-generation path through the `imagegen` skill. Do not use HTML, a
screenshot, or a presentation-style placeholder.

Default visual direction:

- 16:9 landscape unless the destination requires another shape.
- IP Corporation Workbench white, cool gray, navy, and corporate blue.
- Green, amber, and red only for status meaning.
- No purple, fake logo, watermark, invented data, or decorative fake interface.
- Use a phase-specific visual metaphor such as an assembly line, cutaway machine, map, bridge,
  ledger, control room, or evidence trail.
- Prefer one continuous illustrated story over equal cards or a slide layout.
- Show cause and effect, not merely a list of accomplishments.

The artwork should normally include:

1. The prior problem or old flow.
2. The phase intervention.
3. The resulting architecture or user experience.
4. Verification evidence.
5. Remaining limitations and the next move.

Quote every required label verbatim in the generation prompt. Avoid dense paragraphs in the
image.

## 5. Inspect and repair

Inspect the full-size output before accepting it. Reject or repair any of these:

- misspelled, duplicated, or garbled text
- an invented logo, number, issue key, status, or system name
- factual drift from the evidence brief
- clipped labels or unreadable small type
- confusing arrows or an incorrect sequence
- status colors used decoratively
- a generic presentation, dashboard, or plain card-grid appearance

Use targeted image edits for isolated defects and preserve correct areas. Reinspect after every
edit. After three failed repair attempts, stop and report the remaining defect instead of filing
a misleading artifact.

## 6. Save the approved artifact

Create a versioned folder and never overwrite an earlier approved image:

```text
docs/architecture/assets/phase-infographics/<phase-id>/
  <phase-id>-<YYYY-MM-DD>-v1.png
  <phase-id>-<YYYY-MM-DD>-v1.receipt.json
```

The receipt must contain:

```json
{
  "schemaVersion": 1,
  "phaseId": "phase-id",
  "phaseTitle": "Phase title",
  "phaseState": "complete",
  "generatedAt": "ISO-8601 timestamp",
  "output": {
    "file": "versioned-file.png",
    "bytes": 0,
    "sha256": "sha256",
    "width": 0,
    "height": 0
  },
  "sources": [
    { "path": "source/path", "sha256": "sha256" }
  ],
  "verification": {
    "content": "approved",
    "visual": "approved",
    "knownIssues": []
  },
  "supersedes": null
}
```

Hash the exact sources used, not every file in the repository. Record a prior receipt in
`supersedes` when creating a replacement. Keep old images and receipts.

Add a link to the approved image and receipt from the phase closeout or evidence document. Do
not change phase status merely because the image exists.

## 7. Report the closeout

Return:

- the phase title and honest state
- the rendered image inline
- clickable image and receipt paths
- the final prompt direction
- the proof sources used
- any remaining known issue

An infographic is a phase communication artifact. It is never proof that the phase itself is
complete.
