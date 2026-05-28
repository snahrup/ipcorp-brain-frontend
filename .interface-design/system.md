# Interface Design System

## Direction

The IP Corp Brain frontend is a calm Context OS for source-backed engagement intelligence. It should feel elegant, patient, and current: a place where scattered meetings, risks, decisions, actions, and evidence are gathered into reviewable context without becoming a loud monitoring console.

## Product Signature

The signature interaction is context assembly:

- Source chips feed a synthesis surface.
- Prep packets show which meetings, risks, questions, and evidence formed the packet.
- Cortex insights unfold their reasoning chain progressively.
- Evidence refs stay attached to claims as proof trails.

## Palette

- Base: near-black neutral surfaces, not blue-black.
- Primary accent: warm amber for active readiness and packet focus.
- Secondary accents: mint for safe/current states, sky for confidence/insights, violet for governance/ADRs.
- Risk treatment: amber/orange for attention, not harsh emergency red unless the data truly says critical failure.

## Depth

Use layered translucent panels with quiet borders and inner rim light. Avoid heavy shadows, thick borders, and decorative gradients. The background can contain subtle moving threads, but it must not read as a generic cyber dashboard.

## Typography

Use Lexend for product text and JetBrains Mono for source refs, proof trails, metadata, and labels. Keep letter spacing normal. Headings should be strong but not cramped.

## Layout

Desktop uses a left navigation shell, top freshness/search band, readiness hero, count ribbon, and two-column context panels. Tablet and mobile collapse navigation into a horizontal top strip and stack the content vertically with no horizontal overflow.

## Motion

Motion should explain state:

- View changes fade and slide softly.
- Drawer panels slide in with spatial continuity.
- Source chips and reasoning steps appear with short staggered timing.
- Moving context threads should be subtle enough to feel alive without distraction.

## Component Rules

- Cards use an 8px radius.
- Chips may use full pill radius.
- Every clickable row has hover/focus states.
- Drawers show evidence and detail without navigating away.
- Do not expose raw captures or private repo material in UI copy.
