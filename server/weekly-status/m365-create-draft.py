"""Create one Outlook draft through the approved local Copilot Cowork connector.

This adapter creates a draft and stops. It never sends, never schedules, and never
accepts an arbitrary tool name from the browser. The Workbench passes a finished
subject, recipient list, and HTML body; everything else is fixed here.
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
# The Workbench is not bound by Claude Desktop's short deadline. One request, long
# patience, and never a replay just because Microsoft 365 is still working.
CONTINUE_WAIT_SECONDS = 120
MAX_CONTINUE_ROUNDS = 7
INPUT_PATH = os.environ.get("WEEKLY_STATUS_DRAFT_INPUT")
OUTPUT_PATH = os.environ.get("WEEKLY_STATUS_DRAFT_OUTPUT")


def _emit(payload: dict[str, Any]) -> None:
    text = json.dumps(payload)
    if OUTPUT_PATH:
        output = Path(OUTPUT_PATH)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(text + "\n", encoding="utf-8")
    print(text)


def _read_request() -> dict[str, Any] | None:
    raw = ""
    if INPUT_PATH and Path(INPUT_PATH).exists():
        raw = Path(INPUT_PATH).read_text(encoding="utf-8")
    else:
        raw = sys.stdin.read()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _clean_recipients(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    cleaned = []
    for value in values:
        address = str(value or "").strip()
        # Cowork rejects display names outright, so the check happens here too and
        # the Workbench can say which address is wrong instead of failing opaquely.
        if "@" in address and " " not in address:
            cleaned.append(address[:240])
    return cleaned[:25]


def main() -> int:
    request = _read_request()
    if request is None:
        _emit({"ok": False, "code": "bad_request", "error": "The draft request could not be read."})
        return 2

    to = _clean_recipients(request.get("to"))
    cc = _clean_recipients(request.get("cc"))
    subject = str(request.get("subject") or "").strip()[:240]
    body = str(request.get("body") or "").strip()
    if not to or not subject or not body:
        _emit(
            {
                "ok": False,
                "code": "incomplete_draft",
                "error": "A draft needs at least one email address, a subject, and a body.",
            }
        )
        return 2

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
        state = bridge.outlook_email_create_draft(to=to, subject=subject, body=body, cc=cc or None)
    except Exception as error:  # Surfaced to the Workbench as an unavailable connector.
        _emit({"ok": False, "code": "bridge_error", "error": str(error)})
        return 1

    job_id = None
    rounds = 0
    while isinstance(state, dict) and rounds < MAX_CONTINUE_ROUNDS:
        if state.get("ok") is False:
            _emit(
                {
                    "ok": False,
                    "code": str(state.get("kind") or "draft_failed"),
                    "error": str(state.get("error") or "The Outlook draft was not created."),
                    "authRequired": bool(state.get("auth_required")),
                }
            )
            return 3
        job_id = state.get("job_id") or job_id
        if state.get("terminal"):
            break
        if not job_id:
            break

        rounds += 1
        pending = state.get("pending_action") or state.get("proposal")
        # Steve's click is the approval, and the proposal has to match what he
        # approved. Anything that does not match is returned for him to look at
        # rather than approved on his behalf.
        if isinstance(pending, dict) and pending.get("request_key"):
            proposed_subject = str(pending.get("subject") or subject).strip()
            if proposed_subject and proposed_subject != subject:
                _emit(
                    {
                        "ok": False,
                        "code": "proposal_mismatch",
                        "error": (
                            "Outlook proposed a different draft than the one approved: "
                            f"{proposed_subject!r}. Nothing was created."
                        ),
                        "jobId": job_id,
                    }
                )
                return 4
            state = bridge.microsoft_action_continue(
                job_id=job_id,
                action="approve",
                request_key=str(pending.get("request_key")),
                wait_seconds=CONTINUE_WAIT_SECONDS,
            )
            continue

        state = bridge.microsoft_action_continue(
            job_id=job_id, action="wait", wait_seconds=CONTINUE_WAIT_SECONDS
        )

    if not isinstance(state, dict):
        _emit(
            {
                "ok": False,
                "code": "unstructured_result",
                "error": "Microsoft 365 returned a draft result that could not be read.",
            }
        )
        return 4

    if not state.get("terminal"):
        _emit(
            {
                "ok": False,
                "code": "draft_pending",
                "error": (
                    "Outlook is still working on the draft. It was not restarted; "
                    "check the Outlook drafts folder in a few minutes."
                ),
                "jobId": job_id,
            }
        )
        return 5

    _emit(
        {
            "ok": True,
            "data": {
                "jobId": job_id,
                "to": to,
                "cc": cc,
                "subject": subject,
                "detail": str(state.get("detail") or state.get("result") or "Draft created in Outlook.")[
                    :600
                ],
            },
        }
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
