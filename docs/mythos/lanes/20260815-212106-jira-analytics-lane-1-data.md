# Lane 1: Jira analytics data

- Owner: main
- Status: in progress

## Purpose

Build and test the read-only calculation layer and narrow server route.

## In scope

- `server/jira-analytics.mjs`
- `server/jira-analytics.test.mjs`
- Narrow analytics integration in `server/jira-gateway.mjs`

## Out of scope

- Jira writes
- Existing reconciliation behavior
- UI implementation

## Dependencies

Existing MT initiative reads and paginated issue changelog reads.

## Notes

Use limited concurrency, short-lived caching, partial-failure accounting, exact sample sizes, and
plain status names. Do not infer missing dates.

## Verification

Focused Node tests, syntax check, and route inspection.

