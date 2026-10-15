"""Negative controls for real-profile Python SDK recovery and child delivery smokes."""
from __future__ import annotations

import json
import runpy
from dataclasses import replace
from pathlib import Path

import pytest

from deepseek_harness import Notification, RunResult

ROOT = Path(__file__).resolve().parents[3]
SMOKE = runpy.run_path(ROOT / "scripts/smoke-python-runtime.py")


def recovery_result(scenario: str) -> RunResult:
    directory = ROOT / "snapshots/sdk" / scenario
    fixture = SMOKE["selected_snapshot_session_files"](directory)[0]
    events = [json.loads(line) for line in fixture.read_text(encoding="utf-8").splitlines()][1:]
    return RunResult(
        session_id="recovery-test", final_response="QUEUED_RECOVERY_OK", finish_reason="completed",
        events=events,
        notifications=[
            Notification("session.status", {"status": "running"}),
            *(Notification("session.event", {"event": event}) for event in events),
            Notification("session.status", {"status": "idle"}),
        ],
    )


@pytest.mark.parametrize(("scenario", "target"), [
    ("queued-request-recovery", "next-turn"), ("steered-request-recovery", "next-step"),
])
def test_completed_activity_contains_the_accepted_input(scenario: str, target: str) -> None:
    SMOKE["assert_queued_recovery"](recovery_result(scenario), target)


def test_idle_between_drivers_truncates_the_sdk_result() -> None:
    result = recovery_result("queued-request-recovery")
    end = next(index for index, event in enumerate(result.events) if event["type"] == "turn/end")
    truncated = replace(result, final_response="", finish_reason="error", events=result.events[:end + 1])
    with pytest.raises(AssertionError, match="SDK run returned before accepted input completed"):
        SMOKE["assert_queued_recovery"](truncated, "next-turn")


def test_intermediate_idle_is_rejected_even_with_a_later_answer() -> None:
    result = recovery_result("queued-request-recovery")
    result.notifications[1:1] = [
        Notification("session.status", {"status": "idle"}),
        Notification("session.status", {"status": "running"}),
    ]
    with pytest.raises(AssertionError, match="idle between replacement drivers"):
        SMOKE["assert_queued_recovery"](result, "next-turn")


def test_completed_tool_effect_cannot_repeat() -> None:
    result = recovery_result("queued-request-recovery")
    result.events.append(next(event for event in result.events if event["type"] == "todo/write"))
    with pytest.raises(AssertionError, match="completed tool effect must not repeat"):
        SMOKE["assert_queued_recovery"](result, "next-turn")


def test_serialized_recovery_history_keeps_the_single_completed_tool() -> None:
    messages = [
        {"role": "user", "content": [{"type": "text", "text": SMOKE["QUEUED_RECOVERY_PROMPT"]}]},
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "queued-complete", "content": "done"}]},
        {"role": "user", "content": [{"type": "text", "text": SMOKE["QUEUED_RECOVERY_FOLLOWUP"]}]},
    ]
    chunks = SMOKE["completion_chunks"]({"messages": messages})
    assert SMOKE["QUEUED_RECOVERY_TEXT"] in json.dumps(chunks)
    messages[1]["content"] *= 2
    with pytest.raises(AssertionError, match="lost or repeated its completed tool"):
        SMOKE["completion_chunks"]({"messages": messages})


def subagent_result(mode: str) -> tuple[RunResult, list[dict[str, object]]]:
    case = SMOKE["SUBAGENT_FINAL_CASES"][mode]
    directory = ROOT / "snapshots/sdk" / case["scenario"]
    selected = SMOKE["selected_snapshot_session_files"](directory)
    parent = [json.loads(line) for line in selected[0].read_text(encoding="utf-8").splitlines()]
    child = [json.loads(line) for line in selected[1].read_text(encoding="utf-8").splitlines()]
    return RunResult(
        session_id=parent[0]["id"], final_response=case["parent_final"], finish_reason="completed",
        events=parent[1:], notifications=[],
    ), child


@pytest.mark.parametrize("mode", ["continuable", "one-shot"])
def test_subagent_canonical_final_has_one_delivery(mode: str) -> None:
    result, child = subagent_result(mode)
    SMOKE["assert_subagent_final"](result, child, mode)


def test_subagent_final_cannot_repeat_its_automatic_notice() -> None:
    result, child = subagent_result("continuable")
    result.events.append(next(event for event in result.events if event["type"] == "user/message"
                              and event["data"]["source"]["kind"] == "subagent-settled"))
    with pytest.raises(AssertionError, match="exactly one automatic child final"):
        SMOKE["assert_subagent_final"](result, child, "continuable")


def test_subagent_progress_cannot_copy_the_canonical_final() -> None:
    result, child = subagent_result("continuable")
    progress = next(event for event in result.events if event["type"] == "user/message"
                    and event["data"]["source"]["kind"] == "agent-message")
    progress["data"]["content"] = [{"type": "text", "text": "PROGRESS_ONLY CANONICAL_CHILD_FINAL"}]
    with pytest.raises(AssertionError, match="progress must not duplicate"):
        SMOKE["assert_subagent_final"](result, child, "continuable")


def test_subagent_child_cannot_author_two_final_replies() -> None:
    result, child = subagent_result("continuable")
    child.append(next(event for event in child if event["type"] == "assistant/message"
                      and any(block.get("text") == "CANONICAL_CHILD_FINAL"
                              for block in event["data"]["message"]["content"])))
    with pytest.raises(AssertionError, match="exactly one canonical final answer"):
        SMOKE["assert_subagent_final"](result, child, "continuable")


def test_foreground_one_shot_cannot_also_deliver_an_automatic_final() -> None:
    result, child = subagent_result("one-shot")
    continuable, _ = subagent_result("continuable")
    result.events.append(next(event for event in continuable.events if event["type"] == "user/message"
                              and event["data"]["source"]["kind"] == "subagent-settled"))
    with pytest.raises(AssertionError, match="foreground one-shot must not also"):
        SMOKE["assert_subagent_final"](result, child, "one-shot")


def test_parent_model_cannot_finish_before_receiving_the_canonical_final() -> None:
    case = SMOKE["SUBAGENT_FINAL_CASES"]["continuable"]
    messages = [
        {"role": "user", "content": [{"type": "text", "text": case["prompt"]}]},
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "canonical-start", "content": "started"}]},
    ]
    with pytest.raises(AssertionError, match="lacks exactly one delivered child final"):
        SMOKE["completion_chunks"]({"messages": messages})


@pytest.mark.parametrize(("mode", "schema_owner"), [("continuable", "subagent-canonical-final"), ("one-shot", "bash-tool")])
def test_subagent_model_arguments_match_the_recorded_public_tool_schema(mode: str, schema_owner: str) -> None:
    schemas = json.loads((ROOT / "snapshots/sdk" / schema_owner / "tool-schemas.expected.json").read_text())
    tool = next(schema for schema in schemas["initial"] if schema["name"] == "subagent")
    case = SMOKE["SUBAGENT_FINAL_CASES"][mode]
    chunks = SMOKE["completion_chunks"]({
        "messages": [{"role": "user", "content": [{"type": "text", "text": case["prompt"]}]}],
        "tools": [{"name": "subagent", "input_schema": tool["parameters"]}],
    })
    arguments = json.loads("".join(chunk["delta"]["partial_json"] for chunk in chunks
                                 if chunk.get("delta", {}).get("type") == "input_json_delta"))
    assert set(tool["parameters"]["required"]).issubset(arguments), arguments
    assert set(arguments).issubset(tool["parameters"]["properties"]), arguments
