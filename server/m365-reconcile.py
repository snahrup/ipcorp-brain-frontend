"""Read-only Copilot Cowork MCP adapter for Microsoft 365 evidence.

This adapter deliberately exposes one fixed MDM reconciliation request. It does
not accept arbitrary tool names, credentials, write requests, or user-authored
prompts from the browser.
"""

from __future__ import annotations

import importlib
import json
import os
import sys
from pathlib import Path
from typing import Any


BRIDGE_PATH = os.environ.get(
    "COPILOT_COWORK_MCP_PATH",
    r"C:\Users\snahrup\CascadeProjects\copilot_cowork_mcp",
)
# One transport request may run for almost the gateway's 15-minute ceiling.
# Never replay it merely because Microsoft 365 is still working.
ATTEMPT_TIMEOUT_SECONDS = 880
OUTPUT_PATH = os.environ.get("M365_RECONCILE_OUTPUT")
MODE = os.environ.get("M365_RECONCILE_MODE", "mdm").strip().lower()
ACTIVITY_WINDOWS_TEXT = os.environ.get("M365_RECONCILE_WINDOWS", "{}")
ACTIVITY_SOURCE_IDS = (
    "outlook_received",
    "outlook_replied",
    "outlook_sent",
    "teams_channel_messages",
    "teams_group_messages",
    "teams_direct_messages",
    "teams_meeting_transcripts",
)

REQUEST = """
This is a read-only reconciliation of the IP Corporation MDM Team / Fabric Data
Migration initiative. Search all available authorized Microsoft 365 workplace
evidence from 2026-01-01 through today that is relevant to this initiative:
Outlook email and calendar, Microsoft Teams chats/channels, meetings,
transcripts, recaps, and related follow-up. Find current tasks, completed work,
decisions, blockers, dependencies, owners, due dates, superseded plans, and
explicit Jira MT issue references.

Return JSON only with this exact shape:
{
  "asOf": "ISO timestamp or source-provided time",
  "items": [
    {
      "source": "Outlook email or Microsoft Teams",
      "date": "ISO date when available",
      "title": "short source title",
      "summary": "concise factual evidence, no speculation",
      "owner": "name or null",
      "status": "current, completed, blocked, superseded, or unclear",
      "jiraKey": "MT-### or null",
      "sourceReference": "subject/channel/thread reference without private URL"
    }
  ],
  "limitations": ["truthful coverage or access limitation"]
}

Do not send, draft, schedule, reply, react, edit, or otherwise change anything.
Do not include credentials, private URLs, message bodies unrelated to MDM, or
personal information that is not necessary to understand the work.
Exclude personal projects and personal application development. Treat work as
Steve's solo work unless the source explicitly proves another participant or a
real meeting. Do not infer a meeting or collaboration from topic similarity.
""".strip()


def _activity_request() -> str:
    try:
        windows = json.loads(ACTIVITY_WINDOWS_TEXT)
    except json.JSONDecodeError:
        windows = {}
    safe_windows = {
        source_id: {
            "from": str((windows.get(source_id) or {}).get("from") or "")[:80],
            "to": str((windows.get(source_id) or {}).get("to") or "")[:80],
            "lateSweepFrom": str(
                (windows.get(source_id) or {}).get("lateSweepFrom") or ""
            )[:80],
        }
        for source_id in ACTIVITY_SOURCE_IDS
    }
    return f"""
This is a read-only activity reconciliation for the IP Corporation MDM Team and
Fabric Data Migration work. Read the authorized Microsoft 365 sources for the
exact periods below. The upper time is fixed for this run. Also check the listed
late-arrival period for items delivered or changed after their original date.

Periods:
{json.dumps(safe_windows, indent=2)}

Return JSON only with this exact shape:
{{
  "asOf": "ISO timestamp",
  "streams": {{
    "outlook_received": {{"state": "current or empty or partial or unavailable or not_authorized or timed_out or malformed or failed", "confirmedThrough": "ISO timestamp or null", "detail": "coverage note", "items": []}},
    "outlook_replied": {{"state": "...", "confirmedThrough": "...", "detail": "...", "items": []}},
    "outlook_sent": {{"state": "...", "confirmedThrough": "...", "detail": "...", "items": []}},
    "teams_channel_messages": {{"state": "...", "confirmedThrough": "...", "detail": "...", "items": []}},
    "teams_group_messages": {{"state": "...", "confirmedThrough": "...", "detail": "...", "items": []}},
    "teams_direct_messages": {{"state": "...", "confirmedThrough": "...", "detail": "...", "items": []}},
    "teams_meeting_transcripts": {{"state": "...", "confirmedThrough": "...", "detail": "...", "items": []}}
  }}
}}

Use one item shape across streams:
{{
  "providerItemId": "stable provider id when available",
  "eventAt": "original event ISO timestamp",
  "updatedAt": "delivered, received, or modified ISO timestamp when available",
  "title": "short source title",
  "summary": "concise factual work evidence",
  "status": "current, completed, blocked, superseded, or unclear",
  "jiraKey": "MT-### or null",
  "linkedJiraKey": "MT-### from an existing stored link or null",
  "jiraReferenceKind": "direct, quoted, forwarded, copied, attachment, stored_link, or unknown",
  "jiraContextSignals": ["specific project, meeting, person, artifact, or named activity"],
  "sourceReference": "subject, channel, or thread reference without a private URL",
  "link": "safe HTTPS source link or null",
  "worklogMinutes": 0,
  "actionable": true,
  "suggestedEmail": {{"to": "recipient or null", "subject": "draft subject", "body": "draft body"}} or null,
  "meeting": {{"id": "meeting id", "title": "title", "start": "ISO", "end": "ISO or null", "organizer": "name or null", "attendees": []}} or null,
  "transcriptReady": false,
  "transcript": "ready Teams meeting text only, otherwise empty"
}}

Classify Outlook received, Steve's replies, and Steve's sent messages as separate
events. Classify Teams channels, group chats, and direct chats separately. Put
only completed meetings with a ready Teams transcript in the ready transcript
stream. A completed meeting whose transcript is not ready may be returned there
with transcriptReady false so it remains pending. Include only work related to
the MDM, Microsoft Fabric, data governance, Purview, Power BI, data migration,
and the related Jira MT initiative.

Set jiraKey only when the item's own activity names the MT item. Mark direct
references as direct and include at least one concrete supporting signal. If a
key appears only in quoted, forwarded, copied, or attached material, preserve
that reference kind and do not treat it as a confirmed target. Use
linkedJiraKey only for an existing stored link tied to the same source identity.

Do not send, draft in Microsoft 365, schedule, reply, react, edit, or change
anything. A suggestedEmail value is review text in the response only. Do not
include credentials, unrelated message bodies, personal application work, or
private link query strings. Do not guess a Jira association or meeting attendee.
""".strip()


def _emit(payload: dict[str, Any]) -> None:
    text = json.dumps(payload)
    if OUTPUT_PATH:
        output = Path(OUTPUT_PATH)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(text + "\n", encoding="utf-8")
    print(text)


def _json_from_text(value: str) -> dict[str, Any] | None:
    text = value.strip()
    candidates = [text]
    if "```" in text:
        candidates.extend(
            segment.removeprefix("json").strip()
            for segment in text.split("```")
            if "{" in segment and "}" in segment
        )
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        candidates.append(text[start : end + 1])
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def _safe_activity_item(item: dict[str, Any], source_id: str) -> dict[str, Any]:
    meeting = item.get("meeting") if isinstance(item.get("meeting"), dict) else None
    suggested = (
        item.get("suggestedEmail")
        if isinstance(item.get("suggestedEmail"), dict)
        else None
    )
    safe_meeting = None
    if meeting:
        attendees = meeting.get("attendees") if isinstance(meeting.get("attendees"), list) else []
        safe_meeting = {
            "id": str(meeting.get("id") or meeting.get("meetingId") or "")[:320],
            "title": str(meeting.get("title") or meeting.get("subject") or "")[:240],
            "start": str(meeting.get("start") or "")[:80],
            "end": str(meeting.get("end") or "")[:80] or None,
            "organizer": str(meeting.get("organizer") or "")[:160] or None,
            "attendees": [str(value)[:160] for value in attendees[:50]],
        }
    safe_suggested = None
    if suggested:
        safe_suggested = {
            "to": str(suggested.get("to") or "")[:240] or None,
            "subject": str(suggested.get("subject") or "")[:240],
            "body": str(suggested.get("body") or "")[:4000],
        }
    try:
        worklog_minutes = int(item.get("worklogMinutes") or 0)
    except (TypeError, ValueError):
        worklog_minutes = 0
    return {
        "providerItemId": str(
            item.get("providerItemId")
            or item.get("itemId")
            or item.get("messageId")
            or item.get("id")
            or ""
        )[:320]
        or None,
        "eventAt": str(item.get("eventAt") or item.get("date") or "")[:80],
        "updatedAt": str(
            item.get("updatedAt")
            or item.get("modifiedAt")
            or item.get("receivedAt")
            or ""
        )[:80],
        "title": str(item.get("title") or item.get("subject") or "")[:240],
        "summary": str(item.get("summary") or "")[:1200],
        "status": str(item.get("status") or "unclear")[:40],
        "jiraKey": str(item.get("jiraKey") or "")[:20] or None,
        "linkedJiraKey": str(item.get("linkedJiraKey") or "")[:20] or None,
        "jiraReferenceKind": str(item.get("jiraReferenceKind") or "unknown")[:40],
        "jiraContextSignals": [
            str(signal)[:160]
            for signal in (
                item.get("jiraContextSignals")
                if isinstance(item.get("jiraContextSignals"), list)
                else []
            )[:12]
            if str(signal).strip()
        ],
        "sourceReference": str(item.get("sourceReference") or "")[:300],
        "link": str(item.get("link") or item.get("webUrl") or "")[:1000] or None,
        "worklogMinutes": max(0, min(1440, worklog_minutes)),
        "actionable": item.get("actionable") is not False,
        "suggestedEmail": safe_suggested,
        "meeting": safe_meeting,
        "transcriptReady": bool(item.get("transcriptReady")),
        "transcript": (
            str(item.get("transcript") or item.get("verbatimTranscript") or "")[:2_000_000]
            if source_id == "teams_meeting_transcripts"
            else ""
        ),
    }


def _emit_activity(evidence: dict[str, Any]) -> int:
    streams = evidence.get("streams")
    if not isinstance(streams, dict):
        _emit(
            {
                "ok": False,
                "code": "activity_streams_missing",
                "error": "Microsoft 365 did not return the required activity streams.",
            }
        )
        return 4
    safe_streams: dict[str, dict[str, Any]] = {}
    allowed_states = {
        "current",
        "empty",
        "partial",
        "unavailable",
        "not_authorized",
        "timed_out",
        "malformed",
        "failed",
    }
    for source_id in ACTIVITY_SOURCE_IDS:
        stream = streams.get(source_id)
        if not isinstance(stream, dict):
            safe_streams[source_id] = {
                "state": "malformed",
                "confirmedThrough": None,
                "detail": "Microsoft 365 omitted this source stream.",
                "items": [],
            }
            continue
        raw_items = stream.get("items") if isinstance(stream.get("items"), list) else []
        state = str(stream.get("state") or ("current" if raw_items else "empty")).lower()
        if state not in allowed_states:
            state = "malformed"
        truncated = len(raw_items) > 1000
        if truncated:
            state = "partial"
        detail = str(stream.get("detail") or stream.get("limitation") or "")[:420]
        if truncated:
            detail = f"{detail}{' ' if detail else ''}Only the first 1,000 items were returned."[:500]
        safe_streams[source_id] = {
            "state": state,
            "confirmedThrough": (
                None
                if truncated
                else str(stream.get("confirmedThrough") or "")[:80] or None
            ),
            "detail": detail,
            "items": [
                _safe_activity_item(item, source_id)
                for item in raw_items[:1000]
                if isinstance(item, dict)
            ],
        }
    _emit(
        {
            "ok": True,
            "data": {
                "asOf": str(evidence.get("asOf") or "")[:80],
                "streams": safe_streams,
            },
        }
    )
    return 0


def main() -> int:
    if not os.path.isdir(BRIDGE_PATH):
        _emit(
            {
                "ok": False,
                "code": "bridge_unavailable",
                "error": "The approved local Copilot Cowork connector is unavailable.",
            }
        )
        return 2

    sys.path.insert(0, BRIDGE_PATH)
    try:
        bridge = importlib.import_module("server")
        # The Workbench is not subject to Claude Desktop's short MCP deadline.
        # Send exactly one broad request and wait on that same request. A slow
        # response must never cause a replay, duplicate collection, or new job.
        result = bridge.cowork_send_message(
            _activity_request() if MODE == "activity" else REQUEST,
            response_timeout_seconds=ATTEMPT_TIMEOUT_SECONDS,
            retry_on_timeout=False,
        )
    except Exception as error:  # The gateway will surface this as an unavailable source.
        _emit(
            {
                "ok": False,
                "code": "bridge_error",
                "error": str(error),
            }
        )
        return 1

    if isinstance(result, str) and "timeout waiting for cowork response" in result.casefold():
        _emit(
            {
                "ok": False,
                "code": "m365_timeout",
                "error": (
                    "Copilot Cowork did not finish the single MDM evidence request "
                    "within the bounded wait. No second request was sent."
                ),
                "retryable": False,
                "authRequired": False,
            }
        )
        return 3

    if isinstance(result, dict):
        if result.get("ok") is False:
            _emit(
                {
                    "ok": False,
                    "code": str(result.get("kind") or "m365_unavailable"),
                    "error": str(result.get("error") or "Microsoft 365 evidence is unavailable."),
                    "retryable": bool(result.get("retryable")),
                    "authRequired": bool(result.get("auth_required")),
                }
            )
            return 3
        evidence = result
    else:
        evidence = _json_from_text(str(result))
        if evidence is None:
            _emit(
                {
                    "ok": False,
                    "code": "unstructured_m365_result",
                    "error": "Microsoft 365 returned evidence that could not be safely structured.",
                }
            )
            return 4

    if MODE == "activity":
        return _emit_activity(evidence)

    items = evidence.get("items")
    if not isinstance(items, list):
        items = []
    safe_items: list[dict[str, Any]] = []
    for item in items[:250]:
        if not isinstance(item, dict):
            continue
        safe_items.append(
            {
                "source": str(item.get("source") or "Microsoft 365")[:80],
                "date": str(item.get("date") or "")[:40],
                "title": str(item.get("title") or "")[:240],
                "summary": str(item.get("summary") or "")[:1200],
                "owner": str(item.get("owner") or "")[:120] or None,
                "status": str(item.get("status") or "unclear")[:40],
                "jiraKey": str(item.get("jiraKey") or "")[:20] or None,
                "sourceReference": str(item.get("sourceReference") or "")[:300],
            }
        )

    _emit(
        {
            "ok": True,
            "data": {
                "asOf": str(evidence.get("asOf") or ""),
                "items": safe_items,
                "limitations": [
                    str(item)[:500]
                    for item in (evidence.get("limitations") or [])
                    if isinstance(item, (str, int, float))
                ][:20],
            },
        }
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
