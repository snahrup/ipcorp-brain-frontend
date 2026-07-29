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
            REQUEST,
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
