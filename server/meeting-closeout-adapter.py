"""Fixed Microsoft 365 reads for the Workbench meeting closeout page."""

from __future__ import annotations

import importlib
import json
import os
import sys
from typing import Any


BRIDGE_PATH = os.environ.get(
    "COPILOT_COWORK_MCP_PATH",
    r"C:\Users\snahrup\CascadeProjects\copilot_cowork_mcp",
)


def emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, default=str))


def load_bridge() -> Any:
    if not os.path.isdir(BRIDGE_PATH):
        raise RuntimeError("The local Microsoft 365 route is unavailable.")
    sys.path.insert(0, BRIDGE_PATH)
    return importlib.import_module("server")


def calendar(bridge: Any, payload: dict[str, Any]) -> dict[str, Any]:
    day = str(payload.get("date") or "today")
    state = bridge.outlook_calendar_search(
        when=day,
        include_free=True,
        include_all_day=True,
        action="start",
        wait_seconds=50,
    )
    waits = 0
    while isinstance(state, dict) and not state.get("terminal") and waits < 4:
        job_id = str(state.get("job_id") or "")
        if not job_id:
            break
        state = bridge.outlook_calendar_search(
            when=day,
            include_free=True,
            include_all_day=True,
            action="wait",
            job_id=job_id,
            wait_seconds=50,
        )
        waits += 1
    return {"ok": bool(isinstance(state, dict) and state.get("ok")), "data": state}


def transcript(bridge: Any, payload: dict[str, Any]) -> dict[str, Any]:
    meeting = payload.get("meeting") if isinstance(payload.get("meeting"), dict) else {}
    request = f"""
Find the exact completed Teams meeting using all of these identity fields:
title: {meeting.get("title", "")}
start: {meeting.get("start", "")}
end: {meeting.get("end", "")}
organizer: {meeting.get("organizer", "")}
attendees: {meeting.get("attendees", [])}
meeting id: {meeting.get("id", "")}

Return the verbatim transcript when available, the recording recap, and related
meeting chat, email follow-up, and linked SharePoint or OneDrive material when
available. Do not send, reply, schedule, react, edit, or change anything.
""".strip()
    last: Any = None
    for _ in range(2):
        last = bridge.teams_meeting_transcripts(request)
        if isinstance(last, dict) and last.get("ok") is False:
            continue
        text = json.dumps(last, default=str) if isinstance(last, dict) else str(last or "")
        lowered = text.casefold()
        if text.strip() and not any(
            token in lowered
            for token in (
                "timeout waiting",
                "timed out",
                "circuit_open",
                "temporarily unavailable",
            )
        ):
            return {"ok": True, "data": last}
    return {"ok": False, "data": last, "error": "Teams capture is unavailable."}


def main() -> int:
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    payload = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    try:
        bridge = load_bridge()
        if command == "calendar":
            emit(calendar(bridge, payload))
            return 0
        if command == "transcript":
            emit(transcript(bridge, payload))
            return 0
        emit({"ok": False, "error": "Unsupported meeting closeout read."})
        return 2
    except Exception as error:
        emit({"ok": False, "error": str(error)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

