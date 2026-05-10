from __future__ import annotations

import asyncio
import json
import threading
from typing import Any
from uuid import uuid4

from app.audit.logger import audit
from app.copilot.prompts import SYSTEM_PROMPT
from app.copilot.schemas import CopilotEvent, CopilotRun, ModelFinal, ModelToolCall, utc_now
from app.copilot.storage import CopilotStore
from app.copilot.tools import ToolPermissionRequired, execute_tool
from app.llm.deepseek import DeepSeekClient


class CopilotAgent:
    def __init__(self) -> None:
        self.store = CopilotStore()
        self.runs: dict[str, CopilotRun] = {}
        self._lock = threading.Lock()
        self._approval_condition = threading.Condition()
        self._approval_decisions: dict[str, bool] = {}

    def start(self, prompt: str, max_steps: int = 8, model: str | None = None) -> CopilotRun:
        run = CopilotRun(prompt=prompt, max_steps=max_steps, model=model)
        self._store(run)
        self._event(run, "status", "queued")
        audit("copilot.run_requested", {"run_id": run.id, "max_steps": max_steps, "model": model})
        threading.Thread(target=lambda: asyncio.run(self._execute(run.id)), daemon=True).start()
        return run

    def get(self, run_id: str) -> CopilotRun | None:
        with self._lock:
            run = self.runs.get(run_id)
        return run or self.store.get_run(run_id)

    def list(self, limit: int = 50) -> list[CopilotRun]:
        return self.store.list_runs(limit)

    def delete(self, run_id: str) -> bool:
        with self._lock:
            run = self.runs.get(run_id)
            if run and run.status in {"queued", "running", "waiting_permission"}:
                run.status = "stopped"
                run.updated_at = utc_now()
                self._event(run, "status", "stopped")
        return self.store.delete_run(run_id)

    def stop(self, run_id: str) -> CopilotRun | None:
        run = self.get(run_id)
        if run and run.status in {"queued", "running", "waiting_permission"}:
            run.status = "stopped"
            run.updated_at = utc_now()
            self._event(run, "status", "stopped")
            self.store.save_run(run)
            audit("copilot.run_stopped", {"run_id": run.id})
            with self._approval_condition:
                self._approval_condition.notify_all()
        return run

    def decide_permission(self, run_id: str, request_id: str, approved: bool) -> CopilotRun | None:
        run = self.get(run_id)
        if not run:
            return None
        with self._approval_condition:
            self._approval_decisions[request_id] = approved
            self._approval_condition.notify_all()
        self._event(
            run,
            "permission_decision",
            "permission approved" if approved else "permission denied",
            {"request_id": request_id, "approved": approved},
        )
        self.store.save_run(run)
        audit("copilot.permission_decided", {"run_id": run.id, "request_id": request_id, "approved": approved})
        return run

    def _store(self, run: CopilotRun) -> None:
        with self._lock:
            self.runs[run.id] = run
        self.store.save_run(run)

    def _event(self, run: CopilotRun, event_type: str, message: str, data: dict[str, Any] | None = None) -> None:
        event = CopilotEvent(type=event_type, message=message, data=data or {})  # type: ignore[arg-type]
        run.events.append(event)
        run.updated_at = utc_now()
        self.store.save_event(run.id, event)
        self.store.save_run(run)

    async def _execute(self, run_id: str) -> None:
        run = self.get(run_id)
        if not run:
            return

        run.status = "running"
        self._event(run, "status", "running")
        messages: list[dict[str, str]] = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": run.prompt},
        ]
        client = DeepSeekClient()

        try:
            for step in range(run.max_steps):
                if run.status == "stopped":
                    return

                self._event(run, "model", f"requesting step {step + 1}", {"step": step + 1})
                parsed = await self._request_model_json(client, messages, run, step + 1)

                if parsed.get("type") == "final":
                    final = ModelFinal.model_validate(parsed)
                    run.final_answer = final.answer
                    run.status = "completed"
                    self._event(run, "final", final.answer)
                    self.store.save_run(run)
                    audit("copilot.run_finished", {"run_id": run.id, "status": run.status})
                    return

                tool_call = ModelToolCall.model_validate(parsed)
                self._event(
                    run,
                    "tool_call",
                    tool_call.tool,
                    {"tool": tool_call.tool, "arguments": tool_call.arguments, "step": step + 1},
                )
                try:
                    tool_result = execute_tool(tool_call.tool, tool_call.arguments)
                except ToolPermissionRequired as exc:
                    approved = self._request_permission(run, exc)
                    if run.status == "stopped":
                        return
                    if approved:
                        tool_result = execute_tool(tool_call.tool, tool_call.arguments, approved=True)
                    else:
                        tool_result = {"error": f"Permission denied by user: {exc.reason}"}
                except Exception as exc:
                    tool_result = {"error": str(exc)}
                self._event(run, "tool_result", tool_call.tool, {"result": tool_result, "step": step + 1})
                messages.append({"role": "assistant", "content": json.dumps(parsed, ensure_ascii=False)})
                messages.append(
                    {
                        "role": "user",
                        "content": json.dumps(
                            {"type": "tool_result", "tool": tool_call.tool, "result": tool_result},
                            ensure_ascii=False,
                        ),
                    }
                )

            run.status = "failed"
            run.error = "Maximum agent steps reached without a final answer."
            self._event(run, "error", run.error)
            self.store.save_run(run)
            audit("copilot.run_finished", {"run_id": run.id, "status": run.status, "error": run.error})
        except Exception as exc:
            run.status = "failed"
            run.error = str(exc)
            self._event(run, "error", run.error)
            self.store.save_run(run)
            audit("copilot.run_failed", {"run_id": run.id, "error": run.error})
        finally:
            run.updated_at = utc_now()
            self.store.save_run(run)

    @staticmethod
    def _message_content(response: dict[str, Any]) -> str:
        return response.get("choices", [{}])[0].get("message", {}).get("content", "")

    def _request_permission(self, run: CopilotRun, exc: ToolPermissionRequired) -> bool:
        request_id = str(uuid4())
        previous_status = run.status
        run.status = "waiting_permission"
        self._event(
            run,
            "permission_request",
            exc.reason,
            {"request_id": request_id, "tool": exc.tool, "arguments": exc.arguments},
        )
        audit(
            "copilot.permission_requested",
            {"run_id": run.id, "request_id": request_id, "tool": exc.tool, "arguments": exc.arguments},
        )
        with self._approval_condition:
            self._approval_condition.wait_for(
                lambda: request_id in self._approval_decisions or run.status == "stopped",
                timeout=300,
            )
            approved = self._approval_decisions.pop(request_id, False)
        if run.status != "stopped":
            run.status = previous_status
            self._event(run, "status", "running")
        return approved

    async def _request_model_json(
        self, client: DeepSeekClient, messages: list[dict[str, str]], run: CopilotRun, step: int
    ) -> dict[str, Any]:
        repair_messages = messages
        last_error = ""
        for attempt in range(2):
            response = await client.chat(repair_messages, run.model)
            content = self._message_content(response)
            try:
                parsed = self._parse_model_json(content)
                if parsed.get("type") == "final":
                    ModelFinal.model_validate(parsed)
                else:
                    ModelToolCall.model_validate(parsed)
                return parsed
            except Exception as exc:
                last_error = str(exc)
                self._event(
                    run,
                    "model_json_invalid",
                    "model returned invalid JSON schema",
                    {"step": step, "attempt": attempt + 1, "error": last_error, "content": content[:500]},
                )
                repair_messages = messages + [
                    {
                        "role": "user",
                        "content": (
                            "Your previous response was invalid. Return exactly one JSON object matching either "
                            '{"type":"tool_call","tool":"read_file","arguments":{"path":"..."}} or '
                            '{"type":"final","answer":"..."}. Error: '
                            f"{last_error}"
                        ),
                    }
                ]
        raise ValueError(f"Model did not return valid agent JSON after retry: {last_error}")

    @staticmethod
    def _parse_model_json(content: str) -> dict[str, Any]:
        text = content.strip()
        if text.startswith("```"):
            lines = text.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            text = "\n".join(lines).strip()
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Model did not return valid JSON: {content[:500]}") from exc
        if not isinstance(parsed, dict):
            raise ValueError("Model JSON response must be an object")
        return parsed


copilot_agent = CopilotAgent()
